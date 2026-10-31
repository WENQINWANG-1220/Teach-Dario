import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {loadGame} from './browser-helpers.mjs';
await mkdir('.runtime',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.on('pageerror',error=>errors.push(String(error)));
page.on('console',message=>{if(message.text().startsWith('map walk checkpoint'))console.log(message.text());});
try{
  await page.goto(process.env.GAME_URL??'http://127.0.0.1:5190/');await loadGame(page);
  const result=await page.evaluate(async()=>{
    const {replayTrail}=await import('/tests/trail-replay.ts');
    const {route,routeFacing,routeDirection,projectRoute,CHECKPOINTS}=await import('/src/model.ts');
    const end=30;
    g.developer.clear();g.clearInput();g.slide.clear(g.walker);g.run.reset();g.audio.muted=true;g.world.resetDynamics();g.walker.reset(route(0),routeFacing(0));
    let greatestReached=0,checkpoint=0,resetTarget=null;
    const resets=[],reset=g.walker.reset;
    g.walker.reset=function(position,facing){
      const target=projectRoute({...position,y:position.y+.99}).s;
      if(resetTarget===null||Math.abs(target-resetTarget)>.25||target>greatestReached+.25)throw Error(`Unreached checkpoint reset: ${target}, reached ${greatestReached}`);
      resets.push({target,reached:greatestReached,from:projectRoute(this.body.translation()).s});resetTarget=null;
      return reset.call(this,position,facing);
    };
    let replay,error;
    try{
      replay=replayTrail(g.walker,(dt,events)=>{
        g.run.elapsed+=dt;g.run.steps+=events.filter(event=>event.moved).length;
        const progress=projectRoute(g.walker.body.translation());
        if(!g.walker.fallen&&progress.distance<2.5&&progress.heightError<.75){greatestReached=Math.max(greatestReached,progress.s);g.run.advance(progress.s);}
        if(g.run.checkpoint>checkpoint){checkpoint=g.run.checkpoint;console.log('map walk checkpoint '+CHECKPOINTS[checkpoint]);}
      },end,{
        step:(dt,lean)=>{g.world.environment.beginStep();g.walker.step(dt,lean);g.world.environment.step(dt);g.physics.step(undefined,g.walker.rig.hooks);g.walker.postStep(dt);},
        reset:target=>{if(!CHECKPOINTS.includes(target)||target>greatestReached+.25)throw Error(`Replay skipped to ${target} before reaching it`);resetTarget=target;g.world.resetDynamics();}
      });
    }catch(failure){error=String(failure);}finally{g.walker.reset=reset;}
    g.walker.interpolate(1);g.world.environment.render(1);g.run.phase='playing';g.run.falls=replay?.falls??g.run.falls;g.developer.toggle('camera',g.view,g.walker);
    const position=g.walker.rendered,forward=routeDirection(projectRoute(position).s);
    g.view.camera.clearViewOffset();g.view.camera.position.set(position.x-forward.x*5,position.y+2.5,position.z-forward.z*5);g.view.camera.lookAt(position.x,position.y+.4,position.z);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return{error,replay,greatestReached,resets,position:{...g.walker.body.translation()},checkpoint:g.run.checkpoint};
  });
  console.log('Full-world map walk',JSON.stringify(result));
  await page.screenshot({path:'.runtime/map-walk-first-rough-section.png'});
  assert.equal(result.error,undefined,'walk through gate, camps and first rough road');
  assert.ok(result.replay.progress>=29.75);assert.ok(result.replay.steps>20);
  assert.equal(result.resets.length,result.replay.retries+result.replay.campResets);
  assert.ok(result.resets.every(reset=>reset.target<=reset.reached+.25),'all resets target previously reached checkpoints');
  assert.deepEqual(errors,[]);
  console.log('Map walk passed: real GLB collisions, outpost gate and first rugged road, genuine footsteps and reached-checkpoint-only resets.');
}finally{await browser.close();}
