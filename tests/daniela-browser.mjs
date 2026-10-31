import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {loadGame} from './browser-helpers.mjs';

const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],requests=[];
page.on('pageerror',error=>errors.push(String(error)));
page.on('request',request=>requests.push(request.url()));
page.setDefaultTimeout(30000);
const lines=[
  {speaker:'Dario',text:'你是谁？'},
  {speaker:'Daniela',text:'先别急着解决世界。\n你连路都不会走。'},
  {speaker:'Dario',text:'你认识我？'},
  {speaker:'Daniela',text:'我是 Daniela。\n你妹妹。\n也是那个不断提醒你——重大决定不能只靠一个人完成的人。'},
];
const snapshot=()=>page.evaluate(()=>({active:g.dialogue.active,index:g.dialogue.index,completed:g.dialogue.completed,current:g.dialogue.current}));
async function moveNear(){
  await page.evaluate(async()=>{
    const {DANIELA_POSITION}=await import('/src/daniela.ts'),{route,routeFacing}=await import('/src/model.ts');
    // Spawn on the real route nearest the NPC, so ordinary gravity/contacts remain active.
    let chosen=0,best=Infinity;
    for(let s=0;s<=180;s+=.25){const p=route(s),distance=Math.hypot(p.x-DANIELA_POSITION.x,p.y-DANIELA_POSITION.y,p.z-DANIELA_POSITION.z);if(distance<best){best=distance;chosen=s;}}
    g.clearInput();g.walker.reset(route(chosen),routeFacing(chosen));g.view.initialized=false;
  });
}
async function moveAway(){
  await page.evaluate(async()=>{const {route,routeFacing}=await import('/src/model.ts');g.clearInput();g.walker.reset(route(12),routeFacing(12));g.view.initialized=false;});
}
async function expectLine(index){
  await page.waitForFunction(index=>g.dialogue.active&&g.dialogue.index===index,index);
  const state=await snapshot();assert.deepEqual(state.current,lines[index]);
  await page.locator('#daniela-dialogue').waitFor({state:'visible'});
  await page.waitForFunction(text=>document.getElementById('daniela-text')?.textContent===text,lines[index].text);
  assert.equal(await page.locator('#daniela-speaker').textContent(),lines[index].speaker);
  assert.equal(await page.locator('#daniela-text').textContent(),lines[index].text);
  assert.equal(await page.locator('#daniela-progress').textContent(),`${index+1} / 4`);
}
try{
  await page.goto(process.env.GAME_URL??'http://127.0.0.1:5190/');await loadGame(page);
  assert.ok(requests.some(url=>new URL(url).pathname.endsWith('/models/Dario_sister.glb')),'loads the supplied Daniela asset');
  const materialState=await page.evaluate(()=>{
    const source=g.assets.instantiate('daniela'),originals=[],projection=[];
    source.traverse(node=>{if(node.isMesh)originals.push(...(Array.isArray(node.material)?node.material:[node.material]));});
    g.daniela.root.traverse(node=>{if(node.isMesh)projection.push(...(Array.isArray(node.material)?node.material:[node.material]));});
    return{sourceMeshes:originals.length,projectedMeshes:projection.length,translucent:projection.some(m=>m.transparent&&m.opacity>0&&m.opacity<1),isolated:projection.every(m=>!originals.includes(m)),sourceOpaque:originals.some(m=>m.opacity===1)};
  });
  assert.ok(materialState.sourceMeshes>0);assert.ok(materialState.projectedMeshes>0);assert.equal(materialState.translucent,true);assert.equal(materialState.isolated,true);assert.equal(materialState.sourceOpaque,true);
  assert.equal((await snapshot()).active,false);assert.equal(await page.locator('#daniela-dialogue').isVisible(),false);
  await page.click('#start');await page.waitForFunction(()=>g.run.phase==='playing');await page.waitForTimeout(200);
  assert.equal((await snapshot()).active,false,'starting far away does not trigger the conversation');
  await moveNear();await expectLine(0);
  await page.keyboard.down('Enter');await expectLine(1);await page.keyboard.down('Enter');await page.waitForTimeout(80);assert.equal((await snapshot()).index,1,'held Enter advances once');await page.keyboard.up('Enter');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>g.run.phase==='paused');
  await page.locator('#daniela-dialogue').waitFor({state:'hidden'});const paused=await snapshot();
  await page.evaluate(()=>g.dialogue.update(30,{position:g.walker.rendered,playing:false,blocked:false}));
  assert.deepEqual(await snapshot(),paused,'paused dialogue does not consume its automatic-advance timer');
  await page.click('#resume');await page.waitForFunction(()=>g.run.phase==='playing');await expectLine(1);
  await page.keyboard.press('1');await page.waitForFunction(()=>g.developer.mode==='camera');await page.locator('#daniela-dialogue').waitFor({state:'hidden'});
  const debug=await snapshot();await page.evaluate(()=>g.dialogue.update(30,{position:g.walker.rendered,playing:true,blocked:true}));assert.deepEqual(await snapshot(),debug);
  await page.keyboard.press('Enter');assert.equal((await snapshot()).index,1,'developer inputs do not advance dialogue');
  await page.keyboard.press('1');await page.waitForFunction(()=>g.developer.mode===null);await expectLine(1);
  await moveAway();await page.waitForFunction(()=>!g.dialogue.active);assert.equal((await snapshot()).completed,false,'leaving an unfinished conversation does not mark it complete');
  await moveNear();await expectLine(0);
  for(let index=0;index<lines.length;index++){await expectLine(index);await page.keyboard.press(index===2?'Space':'Enter');}
  await page.waitForFunction(()=>g.dialogue.completed&&!g.dialogue.active);await page.locator('#daniela-dialogue').waitFor({state:'hidden'});
  await moveAway();await moveNear();await page.waitForTimeout(150);assert.equal((await snapshot()).active,false,'a completed conversation does not immediately replay');
  await page.reload();await loadGame(page);await page.click('#continue');await page.waitForFunction(()=>g.run.phase==='playing');
  assert.equal((await snapshot()).completed,true,'continue restores the completed conversation');await moveNear();await page.waitForTimeout(100);assert.equal((await snapshot()).active,false);
  await page.keyboard.press('Escape');await page.waitForFunction(()=>g.run.phase==='paused');
  page.once('dialog',dialog=>dialog.accept());await page.click('#restart');await page.waitForFunction(()=>g.run.phase==='playing');
  assert.equal((await snapshot()).completed,false,'a new journey resets the conversation');await moveNear();await expectLine(0);
  await mkdir('.runtime',{recursive:true});
  await page.evaluate(()=>{const p=g.walker.body.translation(),npc=g.daniela.root.position;g.view.yaw=Math.atan2(p.x-npc.x,p.z-npc.z)+.85;g.view.pitch=.30;g.view.distance=5.4;g.view.initialized=false;});
  for(const [width,height]of [[1280,720],[1920,1080]]){await page.setViewportSize({width,height});await page.waitForTimeout(80);await page.screenshot({path:`.runtime/daniela-dialogue-${width}.png`});}
  assert.deepEqual(errors,[]);
  console.log('Daniela passed: supplied translucent model with isolated materials, proximity trigger, exact four lines, keyboard/repeat handling, pause/debug suspension, leaving/reentry, saved completion and restart.');
}finally{await browser.close();}
