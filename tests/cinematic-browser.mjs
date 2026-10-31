import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {loadGame} from './browser-helpers.mjs';

const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.setDefaultTimeout(45000);page.on('pageerror',error=>errors.push(String(error)));
await page.addInitScript(()=>{
  window.moviePad={index:0,id:'Ending Movie Controller',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))};
  window.moviePadConnected=false;
  Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>moviePadConnected?[moviePad]:[]});
});
const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const state=()=>page.evaluate(()=>({phase:g.run.phase,active:g.cinema.active,finished:g.cinema.finished,time:g.cinema.video.currentTime,duration:g.cinema.video.duration,muted:g.cinema.video.muted,paused:g.cinema.video.paused,elapsed:g.run.elapsed,position:{...g.walker.body.translation()}}));
async function approach(){
  await page.evaluate(async()=>{
    const{TOILET_POSITION}=await import('/src/model.ts');
    g.clearInput();g.run.walkingUnlocked=true;g.rewardDialogue.reset(true);g.locomotion.setUnlocked(true);g.locomotion.deactivate();
    g.walker.reset({x:TOILET_POSITION.x+.55,y:22,z:TOILET_POSITION.z+1.45},0);g.locomotion.reset();g.view.yaw=0;g.view.initialized=false;
  });
  await frames();assert.equal((await state()).phase,'playing');
  await page.keyboard.down('KeyW');await page.waitForFunction(()=>g.run.phase==='finished');await page.keyboard.up('KeyW');
}
async function padButton(index,value){await page.evaluate(({index,value})=>{moviePad.buttons[index]={value,pressed:value>=.5,touched:value>0};},{index,value});await frames();}
try{
  await mkdir('.runtime',{recursive:true});
  await page.goto(process.env.GAME_URL??'http://127.0.0.1:5190/');await loadGame(page);
  assert.equal(await page.locator('#ending-cinematic').isVisible(),false);
  await page.click('#start');await page.waitForFunction(()=>g.run.phase==='playing');
  await page.evaluate(async()=>{const{route}=await import('/src/model.ts');g.clearInput();g.walker.reset(route(180),0);});await frames();
  assert.equal((await state()).phase,'playing','the route marker does not start the video early');
  await approach();await page.waitForFunction(()=>g.cinema.video.currentTime>.15&&!g.cinema.video.paused);
  assert.equal((await state()).active,true);assert.equal((await state()).muted,false);
  assert.equal(await page.locator('#hud').isVisible(),false);assert.equal(await page.locator('#overlay').isVisible(),false);
  assert.equal(await page.locator('header').isVisible(),false);assert.equal(await page.evaluate(()=>document.pointerLockElement),null);
  assert.equal(await page.evaluate(()=>g.store.saved.finished),true);
  const playing=await state();await page.keyboard.press('Escape');await page.keyboard.press('KeyR');await page.keyboard.press('Space');
  await page.waitForFunction(()=>g.cinema.finished);
  const held=await state();assert.equal(held.phase,'finished');assert.equal(held.paused,true);
  assert.equal(held.elapsed,playing.elapsed);assert.deepEqual(held.position,playing.position);
  await page.waitForFunction(()=>!g.cinema.still.hidden&&g.cinema.still.complete);
  assert.equal(await page.locator('#ending-video').isVisible(),false);assert.equal(await page.locator('#ending-still').isVisible(),true);
  assert.equal(await page.locator('.ending-retry').isVisible(),false);
  assert.deepEqual(await page.evaluate(()=>[g.cinema.still.naturalWidth,g.cinema.still.naturalHeight]),[854,480]);
  assert.ok(held.time>=5.45&&held.duration<5.6);
  const firstFrame=await page.screenshot({path:'.runtime/ending-movie-last-frame.png'});
  await page.waitForTimeout(350);assert.deepEqual(await page.screenshot(),firstFrame,'the exact final frame remains stable');
  await page.evaluate(()=>{moviePadConnected=true;});await frames();await padButton(9,1);await padButton(9,0);await padButton(0,1);await padButton(0,0);await padButton(1,1);await padButton(1,0);
  assert.equal((await state()).finished,true);assert.equal((await state()).phase,'finished','controller buttons cannot restart the movie or game');
  assert.deepEqual(await page.screenshot(),firstFrame);
  // A new journey can reset the movie; a blocked autoplay presents a working retry button.
  await page.reload();await loadGame(page);await page.click('#sound');await page.click('#start');await page.waitForFunction(()=>g.run.phase==='playing');
  await page.evaluate(()=>{
    const video=g.cinema.video,play=video.play.bind(video);let first=true;
    video.play=()=>{if(first){first=false;return Promise.reject(new DOMException('Test autoplay denial','NotAllowedError'));}return play();};
  });
  await approach();await page.waitForFunction(()=>g.cinema.pendingGesture);
  assert.equal((await state()).muted,true);assert.equal(await page.locator('.ending-retry button').isVisible(),true);
  await page.locator('.ending-retry button').click();await page.waitForFunction(()=>g.cinema.video.currentTime>.15&&!g.cinema.pendingGesture);
  await page.waitForFunction(()=>g.cinema.finished);assert.equal(await page.locator('#ending-still').isVisible(),true);
  assert.equal(await page.locator('.ending-retry').isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log('Cinematic passed: actual toilet arrival, automatic complete video, mute, hidden HUD, frozen gameplay, exact stable last frame, input guards, reset and autoplay retry.');
}catch(error){await page.screenshot({path:'.runtime/cinematic-failure.png'});console.log(await state().catch(()=>({})));throw error;}finally{await browser.close();}
