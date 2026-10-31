import {beforeAll,describe,it,expect} from 'vitest';
import R from '@dimforge/rapier3d-compat';
import * as T from 'three';
import {route,projectRoute,routeFacing,routeDirection,CHECKPOINTS,BRIDGES} from '../src/model';
import {trailBlocks,addTerrainCollider,SLIDE_LANES,laneCoordinates} from '../src/terrain';
import {ART_LAYOUT} from '../src/art/layout';
beforeAll(async()=>{await R.init();});
describe('spiral poop mountain and downhill chutes',()=>{
 it('makes two ascending turns, projects stacked paths by height, and ends above the summit',()=>{
   let rotation=0,prev=0;
   for(let s=1;s<=164;s++){const a=route(s-1),b=route(s);expect(b.y).toBeGreaterThan(a.y);let angle=Math.atan2(b.x,b.z+18),before=Math.atan2(a.x,a.z+18),delta=angle-before;while(delta<0)delta+=Math.PI*2;rotation+=delta;prev=angle;expect(projectRoute({...b,y:b.y+.99}).s).toBeCloseTo(s,0);}
   expect(rotation).toBeCloseTo(Math.PI*4,1);expect(route(180)).toEqual({x:0,y:22,z:-18});expect(Number.isFinite(routeFacing(0))).toBe(true);expect(Math.hypot(routeDirection(0).x,routeDirection(0).z)).toBeCloseTo(1);void prev;
 });
 it('has only real cylindrical support on bridges and a separate lower slippery chute',()=>{
   const w=new R.World({x:0,y:-9.81,z:0});for(const b of trailBlocks())addTerrainCollider(w,b);w.step();
   for(const bridge of BRIDGES){const p=route((bridge.start+bridge.end)/2),hit=w.castRayAndGetNormal(new R.Ray({x:p.x,y:p.y+1,z:p.z},{x:0,y:-1,z:0}),3,true);expect(hit?.collider.shapeType()).toBe(R.ShapeType.Cylinder);const lane=SLIDE_LANES.find(l=>l.bridge===bridge)!;const r=laneCoordinates(p,lane);expect(r.t).toBeGreaterThan(0);expect(Math.abs(r.lateral)).toBeLessThan(lane.width/2);const slide=trailBlocks().filter(b=>b.kind==='slide')[lane.id];expect(slide.p.y).toBeLessThan(p.y);}
   w.free();
 });
 it('keeps camps safe, chutes downhill and reaches ground without crossing another camp',()=>{
   const blocks=trailBlocks();for(const s of CHECKPOINTS)expect(blocks.some(b=>b.kind==='rest'&&Math.hypot(b.p.x-route(s).x,b.p.z-route(s).z)<.01)).toBe(true);
   for(const lane of SLIDE_LANES){expect(lane.start.y).toBeGreaterThan(lane.end.y+4);expect(lane.end.y).toBeLessThan(.1);const floor=blocks.filter(b=>b.kind==='slide')[lane.id];const world=new R.World({x:0,y:0,z:0});const rb=addTerrainCollider(world,floor);expect(rb.collider(0).friction()).toBeLessThan(.04);world.free();}
   expect(ART_LAYOUT.definitions.some(d=>d.id==='poop-mountain')).toBe(true);
 });
});
