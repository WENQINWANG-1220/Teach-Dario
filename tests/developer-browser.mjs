import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {loadGame} from './browser-helpers.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
const mode=async expected=>page.waitForFunction(mode=>g.developer.mode===mode,expected);
const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const state=()=>page.evaluate(()=>({camera:g.view.camera.position.toArray(),body:{...g.walker.body.translation()},rotation:{...g.walker.body.rotation()},facing:g.walker.facing,yaw:g.view.yaw,pitch:g.view.pitch,time:g.run.elapsed,steps:g.run.steps,phase:g.run.phase}));
const angleDifference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function aligned(snapshot){
  assert.ok(Math.abs(angleDifference(snapshot.facing,snapshot.yaw))<1e-6,'placement facing matches camera yaw');
  assert.ok(Math.abs(angleDifference(2*Math.atan2(snapshot.rotation.y,snapshot.rotation.w),snapshot.yaw))<1e-5,'physical body faces the same horizontal direction as the camera');
  assert.ok(Math.abs(snapshot.rotation.x)<1e-6&&Math.abs(snapshot.rotation.z)<1e-6,'the body stays upright regardless of camera pitch');
}
try{
  await page.goto(process.env.GAME_URL??'http://127.0.0.1:5190/');await loadGame(page);
  await page.click('#start');await page.waitForFunction(()=>g.run.phase==='playing');
  await page.keyboard.press('1');await mode('camera');const before=await state();
  await page.keyboard.down('w');await page.waitForTimeout(250);await page.keyboard.up('w');
  const moved=await state();assert.notDeepEqual(moved.camera,before.camera);assert.deepEqual(moved.body,before.body);assert.equal(moved.time,before.time);assert.equal(moved.steps,before.steps);
  await page.mouse.move(700,350);const rotation=await page.evaluate(()=>g.view.camera.quaternion.toArray());await page.mouse.move(800,450);assert.notDeepEqual(await page.evaluate(()=>g.view.camera.quaternion.toArray()),rotation);
  await page.keyboard.down('1');await mode(null);await page.keyboard.down('1');await mode(null);await page.keyboard.up('1');
  await page.waitForTimeout(100);assert.ok((await state()).time>before.time);
  await page.evaluate(()=>{g.view.yaw=g.walker.facing+.85;});
  await page.keyboard.press('2');await mode('placement');await frames();const origin=await state();aligned(origin);
  await page.mouse.move(940,450);await frames();const looked=await state();
  assert.ok(Math.abs(angleDifference(looked.yaw,origin.yaw))>.05);aligned(looked);assert.deepEqual(looked.body,origin.body);assert.equal(looked.time,origin.time);assert.equal(looked.steps,origin.steps);
  await page.mouse.move(940,520);await frames();const pitched=await state();
  assert.notEqual(pitched.pitch,looked.pitch);assert.ok(Math.abs(angleDifference(pitched.yaw,looked.yaw))<1e-6);aligned(pitched);assert.deepEqual(pitched.body,origin.body);
  await page.keyboard.down('e');await page.keyboard.down('d');await page.waitForTimeout(250);await page.keyboard.up('e');await page.keyboard.up('d');
  const placed=await state();assert.ok(placed.body.y>origin.body.y+.1);assert.notDeepEqual(placed.body,origin.body);assert.equal(placed.time,origin.time);assert.equal(placed.steps,origin.steps);
  const facing=(await state()).facing;await page.keyboard.down('z');await page.waitForTimeout(100);await page.keyboard.up('z');await frames();const rotated=await state();aligned(rotated);assert.ok(angleDifference(rotated.facing,facing)>.03);
  await page.keyboard.down('x');await page.waitForTimeout(100);await page.keyboard.up('x');await frames();const counterRotated=await state();aligned(counterRotated);assert.ok(angleDifference(counterRotated.facing,rotated.facing)<-.03);
  // Center-screen ground placement must update every body and stop all old velocities.
  const ground=await page.evaluate(()=>{
    g.view.camera.position.set(0,8,0);g.view.camera.lookAt(0,0,0);g.view.camera.updateMatrixWorld(true);
    g.view.yaw=1.14;
    document.dispatchEvent(new MouseEvent('mousedown',{button:0}));document.dispatchEvent(new MouseEvent('mouseup',{button:0}));
    return {y:g.walker.body.translation().y,facing:g.walker.facing,yaw:g.view.yaw,rotation:{...g.walker.body.rotation()},finite:Object.values(g.walker.rig.parts).every(p=>Number.isFinite(p.body.translation().y)&&p.body.linvel().y===0)};
  });assert.ok(ground.y<2);assert.equal(ground.finite,true);aligned(ground);
  await page.keyboard.press('2');await mode(null);await page.waitForTimeout(100);assert.ok((await state()).time>placed.time);
  await page.keyboard.press('1');await mode('camera');
  const freeHeading=await page.evaluate(()=>{
    const p=g.view.camera.position;g.view.camera.lookAt(p.x+3,p.y-1,p.z-4);g.view.camera.updateMatrixWorld(true);
    const direction=g.view.camera.getWorldDirection(p.clone());g.view.yaw=2.2;
    return Math.atan2(-direction.x,-direction.z);
  });
  await page.keyboard.press('2');await mode('placement');await frames();const switched=await state();aligned(switched);assert.ok(Math.abs(angleDifference(switched.yaw,freeHeading))<1e-6,'free-camera handoff uses the actual camera heading rather than stale follow-camera yaw');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>g.run.phase==='paused');await mode(null);assert.equal(await page.evaluate(()=>g.developer.held.size),0);
  await page.click('#resume');await page.waitForFunction(()=>g.run.phase==='playing');await page.keyboard.press('1');await mode('camera');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.waitForFunction(()=>g.run.phase==='paused');await mode(null);
  await page.click('#resume');await page.waitForFunction(()=>g.run.phase==='playing');
  await page.evaluate(async()=>{const {route,routeFacing}=await import('/src/model.ts');g.clearInput();g.walker.reset(route(28),routeFacing(28));g.view.initialized=false;});
  await page.waitForFunction(()=>g.run.walkingUnlocked&&g.rewardDialogue.active);
  for(let i=0;i<3;i++)await page.keyboard.press('Enter');
  await page.waitForFunction(()=>g.rewardDialogue.completed&&g.locomotion.active);
  await page.evaluate(()=>{g.view.yaw=g.walker.facing-.9;});await page.keyboard.press('2');await mode('placement');await frames();const learnedPlacement=await state();aligned(learnedPlacement);
  assert.equal(await page.evaluate(()=>g.locomotion.active),false,'placement suspends learned locomotion');
  await page.mouse.move(1040,520);await frames();const learnedTurn=await state();aligned(learnedTurn);assert.ok(Math.abs(angleDifference(learnedTurn.yaw,learnedPlacement.yaw))>.05);assert.equal(learnedTurn.time,learnedPlacement.time);assert.equal(learnedTurn.steps,learnedPlacement.steps);
  await page.keyboard.press('2');await mode(null);await page.waitForFunction(()=>g.locomotion.active&&g.run.phase==='playing');assert.equal(await page.evaluate(()=>g.run.walkingUnlocked),true);
  assert.ok(Math.abs(angleDifference(await page.evaluate(()=>g.walker.facing),learnedTurn.yaw))<.01,'resuming learned walking preserves the placed orientation');
  assert.deepEqual(errors,[]);console.log('Developer modes passed: camera flight/look, frozen simulation, repeat-safe toggles, camera-aligned placement entry/look/pitch/Z/X/click, free-camera heading handoff, upgraded locomotion reentry, pause and blur cleanup.');
}finally{await browser.close();}
