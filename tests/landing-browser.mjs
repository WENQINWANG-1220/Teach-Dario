import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {loadGame} from './browser-helpers.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720}});
const advance=async seconds=>{const time=await page.evaluate(()=>g.run.elapsed);await page.waitForFunction(({time,seconds})=>g.run.elapsed>=time+seconds,{time,seconds});};
try{
  await page.goto('http://127.0.0.1:5190/');await loadGame(page);await page.click('#start');await page.waitForFunction(()=>g.run.phase==='playing');
  await page.waitForFunction(()=>document.pointerLockElement===g.renderer.domElement);
  for(const first of [0,2]){
    await page.keyboard.press('r');await advance(.6);
    // Dispatch a complete click/drag/release and the other press in one event-loop turn,
    // reproducing a switch before any physics tick has completed the weight transfer.
    await page.evaluate(first=>{
      g.view.yaw=0;const next=first===0?2:0;
      const mouse=(type,button,buttons)=>document.dispatchEvent(new MouseEvent(type,{button,buttons,bubbles:true}));
      mouse('mousedown',first,first===0?1:2);
      document.dispatchEvent(new MouseEvent('mousemove',{movementY:-86,bubbles:true}));
      mouse('mouseup',first,0);mouse('mousedown',next,next===0?1:2);
    },first);
    await advance(2.5);
    const result=await page.evaluate(first=>{
      const landed=first===0?'left':'right',raised=first===0?'right':'left',f=g.walker.feet[landed],other=g.walker.feet[raised];
      return {phase:g.run.phase,active:g.input.active,raised,planted:!f.planting&&f.grounded,ready:other.ready,airborne:!other.grounded,height:other.pos.y-(g.walker.ground(other.pos.x,other.pos.z,other.pos.y+.2,1)?.y??other.pos.y)};
    },first);
    assert.equal(result.phase,'playing');assert.equal(result.planted,true);assert.equal(result.active,result.raised);assert.equal(result.ready,true);assert.equal(result.airborne,true);assert.ok(result.height>.1,JSON.stringify(result));
    await page.screenshot({path:`.runtime/landing-quick-${first===0?'left':'right'}.png`});
    await page.evaluate(first=>document.dispatchEvent(new MouseEvent('mouseup',{button:first===0?2:0,bubbles:true})),first);
  }
  console.log('Landing browser passed: same-frame left/right and right/left switches finish real ground contact and lift the next foot without deadlock.');
}finally{await browser.close();}
