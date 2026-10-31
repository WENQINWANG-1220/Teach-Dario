import {beforeAll,describe,it,expect} from 'vitest';
import R from '@dimforge/rapier3d-compat';
import * as T from 'three';
import {route,projectRoute,routeFacing,routeDirection,CHECKPOINTS,BRIDGES} from '../src/model';
import {trailBlocks,addTerrainCollider,SLIDE_LANES,laneCoordinates,trailRoughness} from '../src/terrain';
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
   for(const bridge of BRIDGES){const p=route((bridge.start+bridge.end)/2),hit=w.castRayAndGetNormal(new R.Ray({x:p.x,y:p.y+1,z:p.z},{x:0,y:-1,z:0}),3,true);expect(hit?.collider.shapeType()).toBe(R.ShapeType.Cylinder);const lane=SLIDE_LANES.find(l=>l.bridge===bridge)!;const r=laneCoordinates(p,lane);expect(r.t).toBeGreaterThan(0);expect(Math.abs(r.lateral)).toBeLessThan(lane.width/2);expect(r.floor).toBeLessThan(p.y-.7);}
   w.free();
 });
 it('builds real uneven road colliders but keeps the checkpoint footing level',()=>{
   const world=new R.World({x:0,y:0,z:0});for(const block of trailBlocks())addTerrainCollider(world,block);world.step();
   const height=(s:number)=>{const p=route(s),hit=world.castRay(new R.Ray({x:p.x,y:p.y+.5,z:p.z},{x:0,y:-1,z:0}),1,true);expect(hit).not.toBeNull();return p.y+.5-hit!.timeOfImpact-p.y;};
   const offsets=Array.from({length:21},(_,i)=>height(31+i*.4));expect(Math.max(...offsets)-Math.min(...offsets)).toBeGreaterThan(.1);
   for(const s of CHECKPOINTS)expect(height(s)).toBeCloseTo(0,2);world.free();
 });
 it('keeps camps safe, chutes downhill and reaches ground without crossing another camp',()=>{
   const blocks=trailBlocks();for(const s of CHECKPOINTS)expect(blocks.some(b=>b.kind==='rest'&&Math.hypot(b.p.x-route(s).x,b.p.z-route(s).z)<.01)).toBe(true);
   for(const lane of SLIDE_LANES){expect(lane.start.y).toBeGreaterThan(lane.end.y+4);expect(lane.end.y).toBeLessThan(.1);expect(lane.points.length).toBeGreaterThan(20);for(let i=1;i<lane.points.length;i++)expect(lane.points[i].y).toBeLessThanOrEqual(lane.points[i-1].y);const floor=blocks.find(b=>b.kind==='slide'&&Math.hypot(b.p.x-(lane.points[0].x+lane.points[1].x)/2,b.p.z-(lane.points[0].z+lane.points[1].z)/2)<1)!;const world=new R.World({x:0,y:0,z:0});const rb=addTerrainCollider(world,floor);expect(rb.collider(0).friction()).toBeLessThan(.04);world.free();}
   const rough=Array.from({length:100},(_,i)=>trailRoughness(30+i*.1));expect(Math.max(...rough)-Math.min(...rough)).toBeGreaterThan(.12);for(const s of CHECKPOINTS)expect(Math.abs(trailRoughness(s))).toBe(0);
   expect(ART_LAYOUT.definitions.some(d=>d.id==='poop-mountain')).toBe(true);
 });
});
