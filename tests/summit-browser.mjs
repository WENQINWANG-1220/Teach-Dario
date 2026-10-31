import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {loadGame} from './browser-helpers.mjs';

const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.setDefaultTimeout(45000);
page.on('pageerror',error=>errors.push(String(error)));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const state=()=>page.evaluate(()=>({visible:g.world.summit.root.visible,revealed:g.world.summit.revealed,saved:g.store.saved?.summitRevealed,phase:g.run.phase,position:{...g.walker.body.translation()}}));
async function moveTo(s){
  await page.evaluate(async s=>{const{route,routeFacing}=await import('/src/model.ts');g.clearInput();g.locomotion.deactivate();g.walker.reset(route(s),routeFacing(s));g.locomotion.reset();g.view.yaw=routeFacing(s);g.view.initialized=false;},s);
  await frames();
}
async function capture(name){
  await page.evaluate(()=>{
    g.clearInput();g.developer.clear();g.developer.toggle('camera',g.view,g.walker);
    g.view.camera.clearViewOffset();g.view.camera.position.set(11,29,-7);g.view.camera.lookAt(0,23,-18);
    document.body.dataset.sceneCapture='true';
  });
  await frames();await page.screenshot({path:`.runtime/${name}.png`});
  await page.evaluate(()=>{delete document.body.dataset.sceneCapture;g.developer.clear();g.view.initialized=false;});
}
try{
  await mkdir('.runtime',{recursive:true});
  await page.goto(process.env.GAME_URL??'http://127.0.0.1:5190/');await loadGame(page);
  await page.addStyleTag({content:'body[data-scene-capture] #app > :not(#scene){visibility:hidden!important}body[data-scene-capture] #app::after{display:none!important}'});
  assert.equal((await state()).visible,true);assert.equal((await state()).revealed,false);
  const occlusion=await page.evaluate(async()=>{
    const T=await import('/node_modules/.vite/deps/three.js'),{TOILET_POSITION}=await import('/src/model.ts');
    const target=new T.Vector3(TOILET_POSITION.x,TOILET_POSITION.y+1,TOILET_POSITION.z),eye=new T.Vector3(0,25,-8);
    g.world.scene.updateMatrixWorld(true);
    const hits=new T.Raycaster(eye,target.clone().sub(eye).normalize()).intersectObject(g.world.summit.root,true);
    return{blocked:hits.some(hit=>hit.distance<eye.distanceTo(target)&&!hit.object.material.transparent),cameraCollision:g.world.surfaces.some(surface=>g.world.summit.root.getObjectById(surface.id))};
  });
  assert.equal(occlusion.blocked,true,'an opaque hemisphere hides the toilet along the approach');
  assert.equal(occlusion.cameraCollision,false,'the reveal effect does not trap the camera');
  await capture('summit-gold-covered');
  await page.click('#start');await page.waitForFunction(()=>g.run.phase==='playing');
  await moveTo(128);assert.equal((await state()).revealed,false,'the lower mountain does not reveal the summit');
  await moveTo(28);await page.waitForFunction(()=>g.rewardDialogue.active);
  for(let i=0;i<3;i++)await page.keyboard.press('Enter');await page.waitForFunction(()=>g.rewardDialogue.completed);
  // Find the geometric first contact, then walk across it with actual KCC movement.
  const approach=await page.evaluate(async()=>{
    const{SummitDome}=await import('/src/summit.ts'),{route}=await import('/src/model.ts'),{ROOT_HEIGHT}=await import('/src/rig.ts');
    const probe=new SummitDome();
    for(let s=128;s<=164;s+=.1){const p=route(s);if(probe.touch({...p,y:p.y+ROOT_HEIGHT}))return s-2;}
    throw Error('No summit contact on the final approach');
  });
  await moveTo(approach);assert.equal((await state()).revealed,false);
  const contact=await page.evaluate(async()=>{
    const {route,projectRoute}=await import('/src/model.ts');
    g.input.press('KeyW');let ticks=0;
    for(;ticks<1800&&!g.world.summit.revealed&&g.run.phase==='playing';ticks++){
      const body=g.walker.body.translation(),target=route(projectRoute(body).s+1);
      g.view.yaw=Math.atan2(body.x-target.x,body.z-target.z);g.fixed(1/120);
    }
    g.clearInput();return{ticks,revealed:g.world.summit.revealed,phase:g.run.phase,position:{...g.walker.body.translation()}};
  });
  assert.equal(contact.revealed,true,`walking along the real route should touch the dome: ${JSON.stringify(contact)}`);
  assert.equal((await state()).visible,false);assert.equal((await state()).saved,true,'touch immediately saves the reveal');
  assert.equal((await state()).phase,'playing','touch reveals the summit without finishing or interrupting movement');
  await capture('summit-gold-revealed');
  await page.keyboard.press('KeyR');await frames();assert.equal((await state()).revealed,true,'checkpoint reset preserves the reveal');
  await page.reload();await loadGame(page);await page.click('#continue');await page.waitForFunction(()=>g.run.phase==='playing');
  assert.equal((await state()).visible,false);assert.equal((await state()).saved,true,'continue keeps the summit revealed');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>g.run.phase==='paused');
  page.once('dialog',dialog=>dialog.accept());await page.click('#restart');await page.waitForFunction(()=>g.run.phase==='playing');
  assert.equal((await state()).visible,true);assert.equal((await state()).saved,false,'a new journey restores the hemisphere');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>g.run.phase==='paused');await moveTo(164);await frames();
  assert.equal((await state()).revealed,false,'paused placement cannot reveal the summit');
  await page.click('#resume');await page.waitForFunction(()=>g.world.summit.revealed);
  assert.deepEqual(errors,[]);
  console.log('Summit passed: opaque sparkling cover, physical approach contact, no lower-floor trigger or camera obstruction, immediate save, reset/continue persistence, restart and pause behavior.');
}catch(error){await page.screenshot({path:'.runtime/summit-failure.png'});console.log(await state().catch(()=>({})));throw error;}finally{await browser.close();}
