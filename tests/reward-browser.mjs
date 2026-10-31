import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {loadGame} from './browser-helpers.mjs';

const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.on('pageerror',error=>errors.push(String(error)));page.setDefaultTimeout(45000);
await page.addInitScript(()=>{
  window.rewardPad={index:0,id:'Reward Test Standard Controller',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))};
  window.rewardPadConnected=false;
  Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>window.rewardPadConnected?[window.rewardPad]:[]});
});
const lines=[
  {speaker:'Sam',text:'看，你会走。\n我们之前只是没给奖励。'},
  {speaker:'Dario',text:'所以我的尊严值一块饼干？'},
  {speaker:'Sam',text:'别低估它。\n这是人工标注的。'},
];
const state=()=>page.evaluate(()=>({unlocked:g.run.walkingUnlocked,active:g.rewardDialogue.active,index:g.rewardDialogue.index,completed:g.rewardDialogue.completed,current:g.rewardDialogue.current,cookieVisible:g.cookie.root.visible,saved:g.store.saved?.walkingUnlocked}));
const position=()=>page.evaluate(()=>({...g.walker.body.translation()}));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const advance=async seconds=>{const elapsed=await page.evaluate(()=>g.run.elapsed);await page.waitForFunction(({elapsed,seconds})=>g.run.elapsed>=elapsed+seconds,{elapsed,seconds});};
async function moveTo(s){
  await page.evaluate(async s=>{const {route,routeFacing}=await import('/src/model.ts');g.clearInput();g.locomotion.deactivate();g.walker.reset(route(s),routeFacing(s));g.locomotion.reset();g.view.yaw=routeFacing(s);g.view.initialized=false;},s);
  await frames();
}
async function rewardCheckpoint(){await moveTo(28);await page.waitForFunction(()=>g.run.walkingUnlocked&&g.rewardDialogue.active);}
const land=()=>page.waitForFunction(()=>g.locomotion.active&&g.locomotion.grounded&&Math.abs(g.locomotion.velocity.y)<.1);
async function expectLine(index){
  await page.waitForFunction(index=>g.rewardDialogue.active&&g.rewardDialogue.index===index,index);
  assert.deepEqual((await state()).current,lines[index]);
  await page.waitForFunction(text=>document.getElementById('daniela-text')?.textContent===text,lines[index].text);
  assert.equal(await page.locator('#daniela-speaker').textContent(),lines[index].speaker);
  assert.equal(await page.locator('#daniela-progress').textContent(),`${index+1} / 3`);
}
async function padButton(index,value){await page.evaluate(({index,value})=>{rewardPad.buttons[index]={value,pressed:value>=.5,touched:value>0};},{index,value});await frames();}
try{
  await page.goto(process.env.GAME_URL??'http://127.0.0.1:5190/');await loadGame(page);
  assert.equal((await state()).unlocked,false);assert.equal(await page.locator('#reward-prompt').isVisible(),false);
  await page.click('#start');await page.waitForFunction(()=>g.run.phase==='playing');
  await moveTo(12);await advance(.3);const lockedPosition=await position();await page.keyboard.press('Space');await advance(.2);
  assert.equal((await state()).unlocked,false,'Space before the cookie cannot unlock walking');assert.equal(await page.evaluate(()=>g.locomotion.active),false);assert.ok((await position()).y<lockedPosition.y+.12,'Space cannot jump before unlocking');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>g.run.phase==='paused');await moveTo(28);await frames();
  assert.equal((await state()).unlocked,false,'a paused arrival cannot consume the cookie');assert.equal((await state()).cookieVisible,true);
  await page.click('#resume');await page.waitForFunction(()=>g.run.phase==='playing'&&g.run.walkingUnlocked&&g.rewardDialogue.active);
  await expectLine(0);assert.equal((await state()).saved,true);assert.equal((await state()).cookieVisible,false);
  assert.equal(await page.evaluate(()=>g.run.checkpoint),2,'arriving saves the checkpoint and automatically eats the cookie without any consumption input');
  await mkdir('.runtime',{recursive:true});
  await page.evaluate(async()=>{const {routeFacing}=await import('/src/model.ts');g.view.yaw=routeFacing(28)-.65;g.view.pitch=.34;g.view.distance=5.6;g.view.initialized=false;});await frames();
  assert.equal(await page.locator('#reward-prompt').isVisible(),false);await page.screenshot({path:'.runtime/reward-dialogue.png'});
  const dialogueHeight=(await position()).y;
  await page.keyboard.press('Space');await expectLine(1);await advance(.1);assert.ok((await position()).y<dialogueHeight+.12,'dialogue Space advances without jumping');
  await page.keyboard.press('Space');await expectLine(2);
  await page.keyboard.down('Space');
  await page.waitForFunction(()=>g.rewardDialogue.completed&&!g.rewardDialogue.active);
  await page.keyboard.down('Space');await advance(.25);
  assert.equal(await page.evaluate(()=>g.locomotion.grounded),true);assert.ok((await position()).y<dialogueHeight+.12,'holding/repeating the final dialogue Space cannot leak into a jump');await page.keyboard.up('Space');
  // Use actual held keys and ordinary physics on the checkpoint approach, not scripted translation.
  await moveTo(28);await advance(.35);const beforeWalk=await position();
  await page.keyboard.down('KeyW');await advance(1.6);await page.keyboard.up('KeyW');const afterWalk=await position();
  assert.ok(distance(beforeWalk,afterWalk)>.35,`holding W should move the character, moved ${distance(beforeWalk,afterWalk).toFixed(3)}m`);
  await advance(.65);const settled=await position();await advance(.6);const stopped=await position();
  assert.ok(distance(settled,stopped)<.22,`releasing W should settle walking, drifted ${distance(settled,stopped).toFixed(3)}m`);
  assert.equal(await page.evaluate(()=>g.input.held.has('KeyW')),false);
  await moveTo(28);await land();const groundHeight=(await position()).y;
  await page.keyboard.down('Space');await advance(.17);
  assert.equal(await page.evaluate(()=>g.locomotion.grounded),false);assert.ok((await position()).y>groundHeight+.25,'Space gives visible airborne lift');
  await page.screenshot({path:'.runtime/reward-jump.png'});
  await page.keyboard.up('Space');const velocityBeforeDouble=await page.evaluate(()=>g.locomotion.velocity.y);
  await page.keyboard.down('Space');await advance(.05);
  assert.ok(await page.evaluate(before=>g.locomotion.velocity.y<=before+.05,velocityBeforeDouble),'a fresh Space press in midair cannot add a second jump');
  await land();await page.keyboard.down('Space');await advance(.25);
  assert.equal(await page.evaluate(()=>g.locomotion.grounded),true);assert.ok(Math.abs((await position()).y-groundHeight)<.12,'holding Space through landing never triggers an automatic repeat');await page.keyboard.up('Space');
  await page.keyboard.press('Space');await advance(.13);assert.equal(await page.evaluate(()=>g.locomotion.grounded),false);
  await page.keyboard.press('Escape');await page.waitForFunction(()=>g.run.phase==='paused');
  const paused=await position(),pausedVelocity=await page.evaluate(()=>g.locomotion.velocity.y),elapsed=await page.evaluate(()=>g.run.elapsed);await page.waitForTimeout(200);
  assert.deepEqual(await position(),paused,'pause freezes the character in midair');assert.equal(await page.evaluate(()=>g.run.elapsed),elapsed);assert.equal(await page.evaluate(()=>g.locomotion.velocity.y),pausedVelocity);
  await page.click('#resume');await page.waitForFunction(()=>g.run.phase==='playing');assert.deepEqual(await page.evaluate(()=>g.input.leanAxes()),{x:0,z:0});
  await land();assert.ok(Math.abs((await position()).y-groundHeight)<.12);
  await page.keyboard.press('KeyR');await page.waitForFunction(()=>g.run.phase==='playing');assert.equal((await state()).unlocked,true,'checkpoint reset retains the reward');assert.equal((await state()).cookieVisible,false);
  await land();const resetHeight=(await position()).y;await page.keyboard.press('Space');await advance(.15);assert.ok((await position()).y>resetHeight+.2,'R retains the jump ability');await land();
  await page.reload();await loadGame(page);await page.click('#continue');await page.waitForFunction(()=>g.run.phase==='playing');
  assert.equal((await state()).unlocked,true,'continue restores normal walking');assert.equal((await state()).cookieVisible,false);assert.equal((await state()).active,false,'consumed reward does not replay');
  await land();const restoredHeight=(await position()).y;await page.keyboard.press('Space');await advance(.15);assert.ok((await position()).y>restoredHeight+.2,'save/continue retains the jump ability');await land();
  await page.keyboard.press('Escape');await page.waitForFunction(()=>g.run.phase==='paused');page.once('dialog',dialog=>dialog.accept());await page.click('#restart');await page.waitForFunction(()=>g.run.phase==='playing');
  assert.equal((await state()).unlocked,false,'new journey resets the walking upgrade');assert.equal((await state()).saved,false);assert.equal((await state()).cookieVisible,true);
  // A confirms dialogue/menu choices; a distinct gameplay press performs a jump.
  await rewardCheckpoint();await page.evaluate(()=>{rewardPadConnected=true;});await page.waitForFunction(()=>g.gamepad.state.connected);await frames();
  await expectLine(0);await padButton(0,1);await padButton(0,0);await expectLine(1);await advance(.1);assert.equal(await page.evaluate(()=>g.locomotion.grounded),true);
  await padButton(0,1);await padButton(0,0);await expectLine(2);
  await padButton(0,1);await page.waitForFunction(()=>g.rewardDialogue.completed&&!g.rewardDialogue.active);await advance(.2);assert.equal(await page.evaluate(()=>g.locomotion.grounded),true,'holding the final dialogue A does not jump');await padButton(0,0);
  await page.evaluate(()=>{
    window.padJumpObservation={ground:g.walker.body.translation().y,peak:g.walker.body.translation().y,airborne:false};
    const observe=()=>{if(!window.padJumpObservation)return;padJumpObservation.peak=Math.max(padJumpObservation.peak,g.walker.body.translation().y);padJumpObservation.airborne||=!g.locomotion.grounded;requestAnimationFrame(observe);};requestAnimationFrame(observe);
  });
  await padButton(0,1);await padButton(0,0);await advance(.15);
  const padJump=await page.evaluate(()=>{const observation=window.padJumpObservation;window.padJumpObservation=null;return observation;});
  assert.ok(padJump.airborne&&padJump.peak>padJump.ground+.2,`a new gameplay A press jumps: ${JSON.stringify(padJump)}`);await land();
  await padButton(9,1);await padButton(9,0);await page.waitForFunction(()=>g.run.phase==='paused');await page.locator('#resume').focus();
  await padButton(0,1);await padButton(0,0);await page.waitForFunction(()=>g.run.phase==='playing');await advance(.2);
  assert.equal(await page.evaluate(()=>g.locomotion.grounded),true,'menu A resumes without jumping');assert.equal(await page.evaluate(()=>g.controlMode),'gamepad');
  assert.deepEqual(errors,[]);
  console.log('Reward passed: automatic cookie consumption, exact dialogue, Space/A dialogue and menu guards, normal walking, jump/land, no double or held-repeat jumps, midair pause, R/save persistence and restart. Screenshots in .runtime/.');
}catch(error){await mkdir('.runtime',{recursive:true});await page.screenshot({path:'.runtime/reward-failure.png'});console.log(await page.evaluate(()=>window.g?{phase:g.run.phase,checkpoint:g.run.checkpoint,position:g.walker.body.translation(),unlocked:g.run.walkingUnlocked,dialogue:g.rewardDialogue?.current}:{}));throw error;}finally{await browser.close();}
