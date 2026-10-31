import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {loadGame} from './browser-helpers.mjs';
await mkdir('.runtime',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(45000);
await page.addInitScript(()=>{
  window.pad={index:0,id:'Virtual Standard Controller',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))};window.padConnected=true;
  Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>window.padConnected?[window.pad]:[]});
});
const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const button=async(i,value)=>{await page.evaluate(({i,value})=>{pad.buttons[i]={value,pressed:value>=.5,touched:value>0};},{i,value});await frames();};
const stick=async(i,x,y)=>{await page.evaluate(({i,x,y})=>{pad.axes[i*2]=x;pad.axes[i*2+1]=y;},{i,x,y});await frames();};
const advance=async seconds=>{const time=await page.evaluate(()=>g.run.elapsed);await page.waitForFunction(({time,seconds})=>g.run.elapsed>=time+seconds,{time,seconds});};
const tap=async i=>{await button(i,1);await button(i,0);};
try{
  await page.goto('http://127.0.0.1:5190/');await loadGame(page);await page.waitForFunction(()=>g.gamepad.state.connected);
  assert.match(await page.locator('#input-status').textContent(),/已连接/);
  await tap(9);await page.waitForFunction(()=>g.run.phase==='playing');assert.equal(await page.evaluate(()=>document.pointerLockElement),null);assert.equal(await page.evaluate(()=>g.controlMode),'gamepad');assert.equal(await page.locator('#left-key').textContent(),'LT');await advance(.6);
  const targets=await page.evaluate(()=>Object.values(g.walker.feet).map(f=>f.target.toArray()));
  await stick(0,0,-.5);assert.ok(await page.evaluate(()=>g.input.leanAxes().z>0&&g.input.leanAxes().z<1));assert.deepEqual(await page.evaluate(()=>Object.values(g.walker.feet).map(f=>f.target.toArray())),targets);await stick(0,.08,-.08);assert.equal(await page.evaluate(()=>g.input.leanAxes().x),0);await stick(0,0,0);
  const beforeYaw=await page.evaluate(()=>g.view.yaw);await stick(1,.5,0);await advance(.25);assert.notEqual(await page.evaluate(()=>g.view.yaw),beforeYaw);await stick(1,0,0);await tap(3);await advance(.5);await page.evaluate(()=>{g.view.yaw=0;});
  const yaw=await page.evaluate(()=>g.view.yaw);await button(6,1);assert.equal(await page.evaluate(()=>g.input.owner),'PadLT');await stick(1,0,-.7);await advance(.6);await stick(1,0,0);assert.equal(await page.evaluate(()=>g.view.yaw),yaw);await button(7,1);assert.equal(await page.evaluate(()=>g.input.owner),'PadLT');await button(6,0);assert.equal(await page.evaluate(()=>g.input.active),null);await stick(1,.5,0);await advance(.2);assert.equal(await page.evaluate(()=>g.view.yaw),yaw);await stick(1,0,0);await button(7,0);await page.waitForFunction(()=>!g.walker.feet.left.planting&&g.walker.feet.left.grounded);
  const steps=await page.evaluate(()=>g.run.steps);await button(7,1);assert.equal(await page.evaluate(()=>g.input.active),'right');await stick(1,0,-.7);await advance(.6);await stick(1,0,0);await button(7,0);await page.waitForFunction(steps=>g.run.steps>steps&&!g.walker.feet.right.planting,steps);
  await button(6,1);await stick(0,.3,0);await tap(9);assert.equal(await page.evaluate(()=>g.run.phase),'paused');const frozen=await page.evaluate(()=>g.run.elapsed);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>g.run.elapsed),frozen);await tap(9);assert.equal(await page.evaluate(()=>g.run.phase),'playing');assert.equal(await page.evaluate(()=>g.input.active),null);assert.deepEqual(await page.evaluate(()=>g.input.leanAxes()),{x:0,z:0});await button(6,0);await stick(0,0,0);
  await button(6,1);assert.equal(await page.evaluate(()=>g.input.active),'left');await tap(3);assert.equal(await page.evaluate(()=>g.input.active),null);await advance(.2);assert.equal(await page.evaluate(()=>g.input.active),null);await button(6,0);
  const distance=await page.evaluate(()=>g.view.distance);await button(12,1);await advance(.2);await button(12,0);assert.ok(await page.evaluate(distance=>g.view.distance<distance,distance));
  await button(6,1);await page.evaluate(()=>{window.padConnected=false;});await page.waitForFunction(()=>g.run.phase==='paused');assert.equal(await page.evaluate(()=>g.input.active),null);const disconnected=await page.evaluate(()=>g.run.elapsed);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>g.run.elapsed),disconnected);
  await page.evaluate(()=>{pad.buttons.forEach(b=>{b.value=0;b.pressed=false;});pad.buttons[9]={value:1,pressed:true,touched:true};pad.axes.fill(0);window.padConnected=true;});await frames();assert.equal(await page.evaluate(()=>g.run.phase),'paused');await button(9,0);await tap(9);assert.equal(await page.evaluate(()=>g.run.phase),'playing');
  // The same analogue aim integrates to the same distance at different fixed rates.
  const rates=await page.evaluate(()=>[60,120].map(rate=>{g.respawn();g.input.press('PadLT',0);g.walker.lift('left');g.padAxes={lean:{x:0,z:0},aim:{x:.5,y:-.4},zoom:0};for(let i=0;i<rate;i++)g.applyGamepadMotion(1/rate);return g.walker.feet.left.target.toArray();}));rates[0].forEach((value,i)=>assert.ok(Math.abs(value-rates[1][i])<1e-8));await tap(3);await advance(.4);
  for(const [width,height]of [[1280,720],[1920,1080]]){await page.setViewportSize({width,height});await page.screenshot({path:`.runtime/gamepad-${width}.png`});assert.ok(await page.locator('#control-note').isVisible());}
  await page.mouse.click(800,400);await page.waitForFunction(()=>g.controlMode==='keyboard'&&document.pointerLockElement!==null&&g.run.phase==='playing');await page.mouse.down({button:'left'});assert.equal(await page.evaluate(()=>g.input.owner),'Mouse0','mouse must own the foot before a pad press');await button(7,1);assert.equal(await page.evaluate(()=>g.input.owner),'Mouse0');await button(7,0);assert.equal(await page.evaluate(()=>g.input.owner),'Mouse0');await page.mouse.up({button:'left'});await page.waitForFunction(()=>!g.walker.feet.left.planting);
  await button(6,1);await page.waitForFunction(()=>g.controlMode==='gamepad'&&document.pointerLockElement===null);assert.equal(await page.evaluate(()=>g.run.phase),'playing');assert.equal(await page.evaluate(()=>g.input.owner),'PadLT');await button(6,0);
  await tap(9);await tap(1);await page.waitForFunction(()=>g.run.phase==='home');await tap(13);const selected=await page.evaluate(()=>document.activeElement.id);await tap(13);assert.notEqual(await page.evaluate(()=>document.activeElement.id),selected);await tap(12);assert.equal(await page.evaluate(()=>document.activeElement.id),selected);
  for(let i=0;i<3&&await page.evaluate(()=>document.activeElement.id!=='continue');i++)await tap(13);
  await tap(0);await page.waitForFunction(()=>g.run.phase==='playing');assert.equal(await page.evaluate(()=>document.pointerLockElement),null);
  assert.deepEqual(errors,[]);console.log('Virtual gamepad browser passed: no-lock start/continue, analogue lean and aim, both feet and priority, camera/zoom, neutral gating, pause/reset/disconnect, rate independence, mouse ownership and handoff, menus and both layouts.');
}catch(error){await page.screenshot({path:'.runtime/gamepad-failure.png'});console.log(await page.evaluate(()=>({phase:g.run.phase,mode:g.controlMode,owner:g.input.owner,pad:g.gamepad.state})));throw error;}finally{await browser.close();}
