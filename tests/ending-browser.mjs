import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {loadGame} from './browser-helpers.mjs';

const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.on('pageerror',error=>errors.push(String(error)));page.setDefaultTimeout(45000);
const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const snapshot=()=>page.evaluate(()=>({position:{...g.walker.body.translation()},phase:g.run.phase,index:g.ending.index,current:g.ending.current,completed:g.ending.completed,started:g.ending.started,time:g.run.elapsed,saved:g.store.saved?.endingIndex}));
async function moveTo(s){
  await page.evaluate(async s=>{const{route,routeFacing}=await import('/src/model.ts');g.clearInput();g.locomotion.deactivate();g.walker.reset(route(s),routeFacing(s));g.locomotion.reset();g.view.yaw=routeFacing(s);g.view.initialized=false;},s);
  await frames();
}
const expectLine=index=>page.waitForFunction(index=>g.ending.index===index&&!!g.ending.current,index);
async function elapsed(seconds){const start=await page.evaluate(()=>g.run.elapsed);await page.waitForFunction(({start,seconds})=>g.run.elapsed>=start+seconds,{start,seconds});}
try{
  await page.goto(process.env.GAME_URL??'http://127.0.0.1:5190/');await loadGame(page);
  const {stops,lines}=await page.evaluate(async()=>{const m=await import('/src/ending.ts');return{stops:m.ENDING_STOPS,lines:m.ENDING_LINES};});
  assert.equal(lines.length,12);
  await page.click('#start');await page.waitForFunction(()=>g.run.phase==='playing');
  await moveTo(stops[0]+.3);await frames();assert.equal((await snapshot()).started,false,'distance alone does not unlock the monologue');
  await moveTo(28);await page.waitForFunction(()=>g.rewardDialogue.active&&g.run.walkingUnlocked);
  for(let i=0;i<3;i++)await page.keyboard.press('Enter');
  await page.waitForFunction(()=>g.rewardDialogue.completed&&g.ending.started);
  await elapsed(.25);assert.equal((await snapshot()).current,null,'unlocking alone does not play the first sentence');
  await moveTo(stops[0]-.5);await elapsed(.3);assert.equal((await snapshot()).current,null);
  await moveTo(stops[0]+.3);await expectLine(0);
  assert.equal((await snapshot()).current.text,lines[0].text);assert.equal(await page.locator('#daniela-speaker').textContent(),'Dario · 自言自语');
  assert.equal(await page.locator('#daniela-progress').textContent(),'1 / 12');assert.equal(await page.locator('.controls').isVisible(),true);
  const groundY=(await snapshot()).position.y;await page.keyboard.press('Space');await elapsed(.15);
  assert.ok((await snapshot()).position.y>groundY+.2,'Space still jumps during self-talk');assert.equal((await snapshot()).index,0,'jumping does not consume the sentence');
  await page.waitForFunction(()=>g.locomotion.grounded);
  const before=await snapshot();await page.keyboard.down('KeyW');await elapsed(.35);const moving=await snapshot();
  assert.ok(Math.hypot(moving.position.x-before.position.x,moving.position.z-before.position.z)>.15,'normal movement remains available while speaking');
  await page.keyboard.press('Enter');await elapsed(.3);const after=await snapshot();await page.keyboard.up('KeyW');
  assert.ok(Math.hypot(after.position.x-moving.position.x,after.position.z-moving.position.z)>.15,'advancing dialogue does not clear held movement');
  assert.equal(after.index,1);assert.equal(after.current,null,'the next sentence waits for the next distance interval');
  assert.equal(after.saved,1);
  await moveTo(stops[1]+.3);await expectLine(1);
  await mkdir('.runtime',{recursive:true});await page.screenshot({path:'.runtime/ending-distance.png'});
  await page.keyboard.press('Escape');await page.waitForFunction(()=>g.run.phase==='paused');const paused=await snapshot();
  await page.waitForTimeout(180);assert.deepEqual(await snapshot(),paused);assert.equal(await page.locator('#daniela-dialogue').isVisible(),false);
  await page.click('#resume');await page.waitForFunction(()=>g.run.phase==='playing');await expectLine(1);
  await page.keyboard.press('1');await page.waitForFunction(()=>g.developer.mode==='camera');const debug=await snapshot();
  await page.waitForTimeout(180);assert.deepEqual(await snapshot(),debug);
  await page.keyboard.press('1');await page.waitForFunction(()=>g.developer.mode===null);
  // Automatic reading finishes one sentence but cannot unlock the next by time alone.
  await page.waitForFunction(()=>g.ending.index===2);assert.equal((await snapshot()).current,null);
  await elapsed(.2);assert.equal((await snapshot()).index,2);
  await page.reload();await loadGame(page);await page.click('#continue');await page.waitForFunction(()=>g.run.phase==='playing');
  assert.equal((await snapshot()).index,2,'continue preserves read sentences');
  for(let index=2;index<lines.length;index++){
    await moveTo(stops[index]+.3);await expectLine(index);
    assert.equal((await snapshot()).current.text,lines[index].text);
    await page.keyboard.press('Enter');await page.waitForFunction(index=>g.ending.index===index+1,index);
  }
  assert.equal((await snapshot()).completed,true);assert.equal((await snapshot()).saved,12);
  assert.equal((await snapshot()).phase,'playing','finishing the words does not finish the route');
  await moveTo(180);assert.equal((await snapshot()).phase,'playing','the summit route marker is before the toilet');
  await page.evaluate(async()=>{const{TOILET_POSITION}=await import('/src/model.ts');g.clearInput();g.locomotion.deactivate();g.walker.reset({...TOILET_POSITION,z:TOILET_POSITION.z+.95},0);g.locomotion.reset();});
  await page.waitForFunction(()=>g.run.phase==='finished');
  assert.equal(await page.evaluate(()=>g.store.saved.finished),true);
  await page.reload();await loadGame(page);await page.click('#start');await page.waitForFunction(()=>g.run.phase==='playing');
  assert.equal((await snapshot()).index,0);assert.equal((await snapshot()).started,false);assert.equal((await snapshot()).saved,0);
  assert.deepEqual(errors,[]);
  console.log('Ending passed: 12 distance-triggered sentences, normal movement during speech, no time-only advancement, pause/debug freeze, save/continue, finish and restart.');
}catch(error){await mkdir('.runtime',{recursive:true});await page.screenshot({path:'.runtime/ending-failure.png'});console.log(await snapshot().catch(()=>({})));throw error;}finally{await browser.close();}
