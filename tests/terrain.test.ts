import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll,describe,expect,it } from 'vitest';
import { addTerrainCollider,CHALLENGES,trailBlocks } from '../src/terrain';
import { CHECKPOINTS,route } from '../src/model';
import { PLAYER } from '../src/world';
beforeAll(async()=>{await RAPIER.init();});
function terrain(){const world=new RAPIER.World({x:0,y:-9.81,z:0});for(const b of trailBlocks())addTerrainCollider(world,b);world.step();return world;}
function ray(world:RAPIER.World,s:number,dx=0){const p=route(s);return world.castRayAndGetNormal(new RAPIER.Ray({x:p.x+dx,y:p.y+3,z:p.z},{x:0,y:-1,z:0}),10,true,undefined,PLAYER);}
describe('challenge geometry and real support',()=>{
  it('builds all four hazards with safe checkpoint platforms before them',()=>{const blocks=trailBlocks();for(const c of CHALLENGES){expect(CHECKPOINTS.includes(c.checkpoint)).toBe(true);expect(c.checkpoint).toBeLessThan(c.start);expect(blocks.some(b=>b.kind==='rest'&&b.p.z===-c.checkpoint&&b.size.x>=4)).toBe(true);}expect(blocks.filter(b=>b.kind==='log')).toHaveLength(2);expect(blocks.some(b=>b.kind==='wall'&&b.size.x<1)).toBe(true);});
  it('uses a curved cylinder with a lower shoulder, not an invisible rectangular deck',()=>{const w=terrain(),p=route(102),center=ray(w,102),edge=ray(w,102,.2);expect(center).not.toBeNull();expect(edge).not.toBeNull();expect(edge!.timeOfImpact).toBeGreaterThan(center!.timeOfImpact+.03);expect(center!.collider.shapeType()).toBe(RAPIER.ShapeType.Cylinder);expect(p.y+3-center!.timeOfImpact).toBeCloseTo(p.y,2);expect(ray(w,102,1.2)).toBeNull();w.free();});
  it('has actual open gaps between stepping stones and no hidden wide wall floor',()=>{const w=terrain();expect(ray(w,136.675)).toBeNull();expect(ray(w,55,1.3)).toBeNull();expect(ray(w,55)).not.toBeNull();w.free();});
  it('keeps every checkpoint on a broad, reachable surface',()=>{const w=terrain();for(const s of CHECKPOINTS){expect(ray(w,s)).not.toBeNull();expect(ray(w,s,.7)).not.toBeNull();expect(ray(w,s,-.7)).not.toBeNull();}w.free();});
});
