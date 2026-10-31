import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
await mkdir('.runtime',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],external=[],models=new Set();
page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(r.url().endsWith('.glb'))models.add(r.url());if(!r.url().startsWith('http://127.0.0.1:5191/')&&!r.url().startsWith('data:'))external.push(r.url());});
try{
  await page.goto('http://127.0.0.1:5191/');await page.locator('#start').waitFor();await page.screenshot({path:'.runtime/production-home-1280.png'});
  await page.click('#sound');await page.reload();await page.locator('#start').waitFor();assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'true');
  await page.click('#start');await page.waitForFunction(()=>document.pointerLockElement!==null);await page.waitForTimeout(250);
  await page.keyboard.press('q');await page.keyboard.press('e');assert.equal(Number(await page.locator('#steps').textContent()),0);
  for(const [key,label] of [['w','前倾'],['a','左倾'],['s','后倾'],['d','右倾'],['ArrowUp','前倾']]){
    await page.keyboard.down(key);await page.waitForFunction(text=>document.getElementById('balance-label').textContent.includes(text),label);await page.waitForTimeout(450);
    await page.screenshot({path:`.runtime/production-lean-${key}.png`});await page.keyboard.up(key);await page.waitForTimeout(800);
    assert.equal(Number(await page.locator('#steps').textContent()),0);
  }
  await page.mouse.move(640,430);
  for(const [button,y] of [['left',360],['right',275]]){
    const count=Number(await page.locator('#steps').textContent());await page.mouse.down({button});await page.mouse.move(640,y,{steps:8});await page.waitForTimeout(800);
    await page.screenshot({path:`.runtime/production-mouse-${button}.png`});await page.mouse.up({button});
    await page.waitForFunction(n=>Number(document.getElementById('steps').textContent)>n,count);
    await page.waitForTimeout(300);
  }
  assert.ok(Number(await page.locator('#steps').textContent())>=2);await page.screenshot({path:'.runtime/production-playing-1280.png'});
  assert.equal(await page.locator('#fallen').count(),0);
  await page.keyboard.press('Escape');await page.locator('#resume').waitFor({state:'visible'});
  await page.reload();await page.locator('#continue').waitFor({state:'visible'});await page.click('#continue');await page.waitForFunction(()=>document.pointerLockElement!==null);
  await page.setViewportSize({width:1920,height:1080});await page.screenshot({path:'.runtime/production-playing-1920.png'});
  await page.addInitScript(()=>{
    window.productionPad={index:0,id:'Virtual Production Controller',mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({value:0,pressed:false,touched:false}))};window.productionPadConnected=true;
    Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>productionPadConnected?[productionPad]:[]});
  });
  await page.reload();await page.waitForFunction(()=>document.getElementById('input-status')?.textContent.includes('已连接'));
  const padButton=async(i,value)=>{await page.evaluate(async({i,value})=>{productionPad.buttons[i]={value,pressed:value>=.5,touched:value>0};await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));},{i,value});};
  await padButton(9,1);await padButton(9,0);await page.waitForFunction(()=>!document.getElementById('hud').hidden&&document.getElementById('overlay').hidden);assert.equal(await page.evaluate(()=>document.pointerLockElement),null);assert.equal(await page.locator('#left-key').textContent(),'LT');
  for(const [index,id]of [[6,'left-foot'],[7,'right-foot']]){
    const count=Number(await page.locator('#steps').textContent());await padButton(index,1);await page.waitForFunction(id=>document.getElementById(id).classList.contains('active'),id);
    await page.evaluate(()=>{productionPad.axes[3]=-.7;});await page.waitForTimeout(700);await page.evaluate(()=>{productionPad.axes[3]=0;});await padButton(index,0);
    await page.waitForFunction(n=>Number(document.getElementById('steps').textContent)>n,count);await page.waitForTimeout(300);
  }
  await page.evaluate(()=>{window.productionPadConnected=false;});await page.locator('#overlay').waitFor({state:'visible'});
  await page.evaluate(()=>{productionPad.buttons[9]={value:1,pressed:true,touched:true};window.productionPadConnected=true;});await page.waitForTimeout(150);assert.equal(await page.locator('#overlay').isVisible(),true);
  await padButton(9,0);await padButton(9,1);await padButton(9,0);await page.locator('#overlay').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.pointerLockElement),null);await page.screenshot({path:'.runtime/production-gamepad.png'});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(models.size,17);console.log('Production passed: local GLBs/WASM, keyboard and mouse regression, virtual gamepad no-lock start/continue, both feet, disconnect/reconnect safety, saved settings, layouts and no external requests.');
}finally{await browser.close();}
