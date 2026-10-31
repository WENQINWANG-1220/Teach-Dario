import{chromium}from'playwright';import assert from'node:assert/strict';import{mkdir}from'node:fs/promises';import{loadGame}from'./browser-helpers.mjs';
await mkdir('.runtime',{recursive:true});const b=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-angle=swiftshader']});const p=await b.newPage({viewport:{width:1440,height:900}});p.on('pageerror',e=>console.log('PAGE ERROR',String(e)));
try{
 await p.goto(process.env.GAME_URL??'http://127.0.0.1:5190');await loadGame(p);await p.screenshot({path:'.runtime/poop-mountain-home.png'});
 await p.evaluate(()=>{g.view.camera.clearViewOffset();g.view.camera.position.set(34,29,21);g.view.camera.lookAt(0,9,-18);g.renderer.render(g.world.scene,g.view.camera);});await p.screenshot({path:'.runtime/poop-mountain-overview.png'});
 for(const index of[0,1])for(const side of[-1,1]){
  const result=await p.evaluate(async({index,side})=>{
   const{SLIDE_LANES,laneCoordinates}=await import('/src/terrain.ts'),{route,routeFacing}=await import('/src/model.ts');
   const lane=SLIDE_LANES[index],s=(lane.bridge.start+lane.bridge.end)/2,origin=route(s),dx=lane.end.x-lane.start.x,dz=lane.end.z-lane.start.z,d=Math.hypot(dx,dz);
   g.clearInput();g.slide.clear(g.walker);g.run.reset();g.run.checkpoint=index===0?3:6;g.world.resetDynamics();g.walker.reset({x:origin.x+side*dx/d*.85,y:origin.y,z:origin.z+side*dz/d*.85},routeFacing(s));
   let entered=false,arrived=false,jump=0,last={...g.walker.body.translation()},ticks=0;
   for(;ticks<6000;ticks++){g.fixed(1/120);const pos=g.walker.body.translation();jump=Math.max(jump,Math.hypot(pos.x-last.x,pos.y-last.y,pos.z-last.z));last={...pos};if(g.run.phase==='sliding')entered=true;if(entered&&g.run.phase!=='sliding'){arrived=true;break;}}
   g.walker.interpolate(1);g.world.environment.render(1);g.run.phase='paused';g.run.previous='fallen';g.view.initialized=false;
   return{entered,arrived,position:{...g.walker.body.translation()},t:laneCoordinates(g.walker.body.translation(),lane).t,jump,ticks,checkpoint:g.run.checkpoint,falls:g.run.falls};
  },{index,side});
  console.log('Chute',index+1,side,result);assert.equal(result.entered,true);assert.equal(result.arrived,true);assert.ok(result.position.y<1.4);assert.ok(result.t>=.98);assert.ok(result.jump<.3);assert.equal(result.checkpoint,0);assert.ok(result.falls>=1);await p.screenshot({path:`.runtime/slide-${index}-${side}-foot.png`});
 }
 console.log('Scene passed: poop mountain, spiral road, both bridge chutes, inner/outer falls slide physically to ground and clear checkpoint; no teleport.');
}finally{await b.close();}
