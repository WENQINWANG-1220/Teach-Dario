import {beforeAll,it,expect} from 'vitest';
import R from '@dimforge/rapier3d-compat';
import {Walker} from '../src/walker';
import {MountainSlide} from '../src/slide';
import {trailBlocks,addTerrainCollider,SLIDE_LANES,laneCoordinates} from '../src/terrain';
import {route,routeFacing} from '../src/model';
import {PHYSICS_DT} from '../src/rig';
beforeAll(async()=>{await R.init();});
for(const lane of SLIDE_LANES)for(const fraction of [.2,.5,.8])for(const side of [-1,1])it(`falls off bridge ${lane.id+1} at ${fraction} side ${side}, slides continuously to the foot without a reset`,()=>{
 const world=new R.World({x:0,y:-9.81,z:0});world.timestep=PHYSICS_DT;for(const b of trailBlocks())addTerrainCollider(world,b);const w=new Walker(world),slide=new MountainSlide(),p=route(lane.bridge.start+(lane.bridge.end-lane.bridge.start)*fraction);
 const a=route(lane.bridge.start),b=route(lane.bridge.end),dx=-(b.z-a.z),dz=b.x-a.x,d=Math.hypot(dx,dz);w.reset({x:p.x+dx/d*.85*side,y:p.y,z:p.z+dz/d*.85*side},routeFacing((lane.bridge.start+lane.bridge.end)/2));w.fall();let began=false,arrived=false,largestJump=0,lowestClearance=Infinity,last={...w.body.translation()};
 for(let i=0;i<6000&&!arrived;i++){
  w.step(PHYSICS_DT);const done=slide.step(w,PHYSICS_DT);world.step(undefined,w.rig.hooks);w.postStep(PHYSICS_DT);
  if(!began){const detected=slide.detect(w);if(detected){expect(detected.id).toBe(lane.id);slide.begin(w,detected);began=true;}}
  const b=w.body.translation();if(began)lowestClearance=Math.min(lowestClearance,b.y-laneCoordinates(b,lane).floor);largestJump=Math.max(largestJump,Math.hypot(b.x-last.x,b.y-last.y,b.z-last.z));last={...b};arrived=done;
 }
 if(!arrived)console.log({lane:lane.id,side,began,position:w.body.translation(),coordinates:laneCoordinates(w.body.translation(),lane),velocity:w.body.linvel()});
 expect(lowestClearance).toBeGreaterThan(-.5);expect(began).toBe(true);expect(arrived).toBe(true);expect(w.body.translation().y).toBeLessThan(1.4);expect(laneCoordinates(w.body.translation(),lane).t).toBeGreaterThan(.97);expect(largestJump).toBeLessThan(.3);for(const p of Object.values(w.rig.parts))expect(p.body.isDynamic()).toBe(true);slide.clear(w);world.free();
},60000);
