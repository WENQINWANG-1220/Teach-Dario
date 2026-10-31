import {beforeAll,describe,expect,it} from 'vitest';
import * as T from 'three';
import R from '@dimforge/rapier3d-compat';
import {SeesawBridge} from '../src/seesaw';
import {SEESAW,route,routeFacing} from '../src/model';
import {PHYSICS_DT,GROUP} from '../src/rig';
import {addTerrainCollider,trailBlocks} from '../src/terrain';
import {Walker} from '../src/walker';
import {replayTrail} from './trail-replay';

beforeAll(async()=>{await R.init();});
function fixture(){
  const world=new R.World({x:0,y:-9.81,z:0});world.timestep=PHYSICS_DT;world.numSolverIterations=16;
  const bridge=new SeesawBridge(world);
  const tick=(n:number,force?:()=>void)=>{for(let i=0;i<n;i++){bridge.beginStep();force?.();world.step();bridge.update();}};
  return {world,bridge,tick};
}

describe('Scaling Laws seesaw',()=>{
  it('responds to actual weight on either end, stays hinged and returns to rest',()=>{
    const {world,bridge,tick}=fixture();
    try{
      const pivot=new T.Vector3().copy(bridge.body.translation()),rotation=new T.Quaternion().copy(bridge.body.rotation());
      const tilts:number[]=[];
      for(const side of [-1,1]){
        bridge.reset();
        const p=new T.Vector3(0,.30,side*bridge.length*.30).applyQuaternion(rotation).add(pivot);
        const load=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(p.x,p.y,p.z).setRotation(rotation).setCcdEnabled(true));
        world.createCollider(R.ColliderDesc.cuboid(.18,.16,.18).setMass(80).setFriction(1).setCollisionGroups(GROUP.prop),load);
        tick(360);tilts.push(bridge.tilt);
        expect(Math.abs(bridge.tilt)).toBeGreaterThan(.02);
        expect(Math.abs(bridge.tilt)).toBeLessThan(SEESAW.maxTilt+.005);
        expect(new T.Vector3().copy(bridge.body.translation()).distanceTo(pivot)).toBeLessThan(.01);
        const local=new T.Vector3().copy(load.translation()).sub(pivot).applyQuaternion(new T.Quaternion().copy(bridge.body.rotation()).invert());
        expect(local.y).toBeGreaterThan(.20);expect(local.y).toBeLessThan(.30);
        world.removeRigidBody(load);tick(480);expect(Math.abs(bridge.tilt)).toBeLessThan(.002);
      }
      expect(tilts[0]*tilts[1]).toBeLessThan(0);
    }finally{world.free();}
  });

  it('caps excessive loads and restores visual and physical state on reset',()=>{
    const {world,bridge,tick}=fixture();
    try{
      const position=new T.Vector3().copy(bridge.body.translation()),rotation=new T.Quaternion().copy(bridge.body.rotation());
      const point=new T.Vector3(0,0,bridge.length*.4).applyQuaternion(rotation).add(position);
      tick(240,()=>bridge.body.addForceAtPoint({x:0,y:-30000,z:0},point,true));
      expect(Math.abs(bridge.tilt)).toBeGreaterThan(.10);expect(Math.abs(bridge.tilt)).toBeLessThan(SEESAW.maxTilt+.01);
      bridge.reset();
      expect(Math.abs(bridge.tilt)).toBeLessThan(.000001);
      expect(new T.Vector3().copy(bridge.body.linvel()).length()).toBe(0);
      expect(new T.Vector3().copy(bridge.body.angvel()).length()).toBe(0);
      expect(bridge.deck.position.distanceTo(position)).toBeLessThan(.000001);
      expect(bridge.deck.quaternion.angleTo(rotation)).toBeLessThan(.001);
      tick(240);expect(Math.abs(bridge.tilt)).toBeLessThan(.001);
    }finally{world.free();}
  });

  it('supports the physical walker crossing from the approach to the far bank',()=>{
    const {world,bridge}=fixture();
    try{
      for(const block of trailBlocks())addTerrainCollider(world,block);
      const walker=new Walker(world);world.step();walker.reset(route(SEESAW.start-1),routeFacing(SEESAW.start-1));
      let maxTilt=0,deckContacts=0;
      const result=replayTrail(walker,()=>{maxTilt=Math.max(maxTilt,Math.abs(bridge.tilt));deckContacts+=walker.contacts.frame.points.filter(c=>c.other.parent()?.handle===bridge.body.handle).length;},SEESAW.end+1,{
        step:(dt,lean)=>{bridge.beginStep();walker.simulate(dt,lean);},
        reset:()=>bridge.reset(),
      });
      expect(result.progress).toBeGreaterThan(SEESAW.end+.7);
      // Natural stumbles may recover in place; crossing must not rely on a teleport/retry.
      expect(result.retries).toBe(0);
      expect(deckContacts).toBeGreaterThan(20);expect(maxTilt).toBeGreaterThan(.01);
    }finally{world.free();}
  },120000);
});
