import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {loadGame} from './browser-helpers.mjs';
await mkdir('.runtime',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',error=>errors.push(String(error)));
// The hidden camera mode keeps requestAnimationFrame from restoring the home/follow view.
async function capture(name,view){
  await page.evaluate(async view=>{
    g.clearInput();g.developer.clear();g.developer.toggle('camera',g.view,g.walker);
    g.view.camera.clearViewOffset();g.view.camera.position.set(...view.eye);g.view.camera.lookAt(...view.target);
    document.body.dataset.sceneCapture='true';
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  },view);
  await page.screenshot({path:`.runtime/${name}.png`});
}
try{
  await page.goto(process.env.GAME_URL??'http://127.0.0.1:5190');await loadGame(page);
  await page.screenshot({path:'.runtime/poop-mountain-home.png'});
  await page.addStyleTag({content:'body[data-scene-capture] #app > :not(#scene){visibility:hidden!important} body[data-scene-capture] #app::after{display:none!important}'});
  await capture('poop-mountain-overview',{eye:[34,29,21],target:[0,9,-18]});
  const views=await page.evaluate(async()=>{
    const {SLIDE_LANES}=await import('/src/terrain.ts'),{route}=await import('/src/model.ts'),{ART_LAYOUT}=await import('/src/art/layout.ts');
    const result=[];
    for(const lane of SLIDE_LANES){
      const center=route((lane.bridge.start+lane.bridge.end)/2),radius=Math.hypot(center.x,center.z+18),rx=center.x/radius,rz=(center.z+18)/radius;
      result.push({name:`poop-mountain-bridge-${lane.id+1}`,eye:[center.x+rx*13-rz*5,center.y+9,center.z+rz*13+rx*5],target:[center.x,center.y-1,center.z]});
      result.push({name:`poop-mountain-slope-${lane.id+1}`,eye:[rx*35,27,-18+rz*35],target:[(lane.start.x+lane.end.x)/2,(lane.start.y+lane.end.y)/2,(lane.start.z+lane.end.z)/2]});
    }
    const camp=ART_LAYOUT.placements.find(p=>/outpost|research|laboratory/.test(p.asset))?.position??route(12);
    result.push({name:'poop-mountain-outpost',eye:[camp.x+8,camp.y+6,camp.z+10],target:[camp.x,camp.y+1,camp.z]});
    return result;
  });
  for(const {name,...view} of views)await capture(name,view);
  // Test the full loaded GLB scene, including mound trimeshes and all decorative colliders.
  // A curve's end-to-end direction is not the direction perpendicular to the log.
  const onlyCase=process.argv.find(arg=>arg.startsWith('--case='))?.slice(7).split(',').map(Number);
  if(!process.argv.includes('--screenshots-only'))for(const index of [0,1])for(const fraction of [.2,.5,.8])for(const side of [-1,1]){
    if(onlyCase&&(index!==onlyCase[0]||fraction!==onlyCase[1]||side!==onlyCase[2]))continue;
    const result=await page.evaluate(async({index,fraction,side})=>{
      const {SLIDE_LANES,laneCoordinates}=await import('/src/terrain.ts'),{route,routeFacing}=await import('/src/model.ts');
      const lane=SLIDE_LANES[index],s=lane.bridge.start+(lane.bridge.end-lane.bridge.start)*fraction,origin=route(s);
      const a=route(lane.bridge.start),b=route(lane.bridge.end),dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
      g.developer.clear();g.clearInput();g.slide.clear(g.walker);g.run.reset();g.run.checkpoint=index===0?3:6;g.autoRespawn=0;g.submergedTime=0;g.world.resetDynamics();
      g.walker.reset({x:origin.x-side*dz/length*.85,y:origin.y,z:origin.z+side*dx/length*.85},routeFacing(s));
      let entered=false,arrived=false,jump=0,last={...g.walker.body.translation()},ticks=0,resets=0,enteredLane=-1,maxBelowFloor=0;
      const reset=g.walker.reset;
      g.walker.reset=function(...args){resets++;return reset.apply(this,args);};
      try{
        for(;ticks<12000;ticks++){
          g.fixed(1/120);
          const pos=g.walker.body.translation();jump=Math.max(jump,Math.hypot(pos.x-last.x,pos.y-last.y,pos.z-last.z));last={...pos};
          if(g.run.phase==='sliding'){entered=true;enteredLane=g.slide.active.id;const lanePosition=laneCoordinates(pos,g.slide.active);if(lanePosition.t<.98)maxBelowFloor=Math.max(maxBelowFloor,lanePosition.floor-pos.y);}
          if(entered&&g.run.phase!=='sliding'){arrived=true;break;}
          if(resets)break;
        }
      }finally{g.walker.reset=reset;}
      g.walker.interpolate(1);g.world.environment.render(1);g.run.phase='paused';g.run.previous='fallen';g.view.initialized=false;
      return{entered,arrived,enteredLane,position:{...g.walker.body.translation()},t:laneCoordinates(g.walker.body.translation(),lane).t,jump,ticks,resets,maxBelowFloor,checkpoint:g.run.checkpoint,falls:g.run.falls,dynamic:Object.values(g.walker.rig.parts).every(p=>p.body.isDynamic())};
    },{index,fraction,side});
    console.log('Chute',index+1,'fraction',fraction,'side',side,result);
    const label=`bridge ${index+1}, fraction ${fraction}, side ${side}`;
    if(!result.entered||!result.arrived||result.enteredLane!==index||result.position.y>=1.4||result.t<.98||result.maxBelowFloor>.6||result.jump>=.3||result.resets){const p=result.position;await capture(`slide-failure-${index}-${fraction}-${side}`,{eye:[p.x+7,p.y+7,p.z+9],target:[p.x,p.y,p.z]});}
    assert.equal(result.entered,true,label+' enters a slide');assert.equal(result.enteredLane,index,label+' enters its own chute');
    assert.equal(result.arrived,true,label+' reaches the end');assert.ok(result.position.y<1.4,label+' reaches ground');assert.ok(result.t>=.98,label+' reaches the outlet');
    assert.ok(result.maxBelowFloor<=.6,label+' remains on the raised dirt chute instead of falling through to the base');
    assert.ok(result.jump<.3,label+' stays continuous');assert.equal(result.resets,0,label+' does not teleport');assert.equal(result.dynamic,true,label+' stays physical');
    assert.equal(result.checkpoint,0,label+' clears checkpoint');assert.ok(result.falls>=1,label+' records fall');
    if(fraction===.5){const p=result.position;await capture(`slide-${index}-${side}-foot`,{eye:[p.x+6,p.y+5,p.z+7],target:[p.x,p.y,p.z]});}
  }
  assert.deepEqual(errors,[]);
  console.log(process.argv.includes('--screenshots-only')?'Scene screenshots captured: overview, bridge approaches, slope routes and outpost.':'Scene passed: both bridge sides at three positions each slide continuously through the actual GLB scene to ground, clear checkpoints, and keep every body dynamic without a reset.');
}finally{await browser.close();}
