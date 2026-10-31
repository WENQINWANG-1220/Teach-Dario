import {beforeAll,describe,expect,it} from 'vitest';
import R from '@dimforge/rapier3d-compat';
import * as T from 'three';
import {NormalWalk,NORMAL_WALK_SPEED,NORMAL_JUMP_SPEED} from '../src/locomotion';
import {Walker} from '../src/walker';
import {GROUP,PHYSICS_DT,ROOT_HEIGHT} from '../src/rig';
import {projectRoute,route,routeFacing} from '../src/model';
import {addTerrainCollider,trailBlocks} from '../src/terrain';
import type {LeanAxes} from '../src/lean';

beforeAll(async()=>{await R.init();});
function fixture(flat=true){
  const world=new R.World({x:0,y:-9.81,z:0});world.timestep=PHYSICS_DT;
  if(flat)world.createCollider(R.ColliderDesc.cuboid(20,.2,20).setTranslation(0,-.2,0).setCollisionGroups(GROUP.terrain));
  const walker=new Walker(world),walk=new NormalWalk(walker);world.step();walker.reset({x:0,y:0,z:0});
  const tick=(frames:number,axes:LeanAxes={x:0,z:0},yaw=0)=>{
    for(let i=0;i<frames;i++){
      if(walk.step(PHYSICS_DT,axes,yaw)){world.step(undefined,walker.rig.hooks);walk.postStep(PHYSICS_DT);}
      else walker.simulate(PHYSICS_DT);
    }
  };
  return {world,walker,walk,tick};
}

describe('normal walking after the RLHF reward',()=>{
  it('keeps the original physical mode until unlocked, walks continuously and alternates its feet',()=>{
    const {world,walker,walk,tick}=fixture();
    try{
      expect(walk.step(PHYSICS_DT,{x:0,z:1},0)).toBe(false);
      expect(walker.body.isDynamic()).toBe(true);expect(walk.collider.isEnabled()).toBe(false);
      walk.setUnlocked(true);tick(120,{x:0,z:1});
      const footDifference=walker.feet.left.pos.z-walker.feet.right.pos.z;
      tick(19,{x:0,z:1});
      expect(Math.abs(walker.feet.left.pos.z-walker.feet.right.pos.z-footDifference)).toBeGreaterThan(.1);
      tick(221,{x:0,z:1});
      expect(walker.body.translation().z).toBeLessThan(-4.4);expect(Math.abs(walker.body.translation().x)).toBeLessThan(.01);
      expect(Math.abs(walker.body.translation().y-ROOT_HEIGHT)).toBeLessThan(.03);
      const steps=walk.drainFootfalls();expect(steps.length).toBeGreaterThan(6);
      expect(steps.every((event,i)=>event.moved&&(i===0||event.id!==steps[i-1].id))).toBe(true);
      expect(walk.active).toBe(true);expect(walk.grounded).toBe(true);expect(walker.fallen).toBe(false);
    }finally{world.free();}
  });

  it('moves relative to the camera and preserves analog magnitude and diagonal speed',()=>{
    const {world,walker,walk,tick}=fixture();
    try{
      walk.setUnlocked(true);tick(240,{x:0,z:.5},Math.PI/2);
      const p=walker.body.translation();expect(p.x).toBeLessThan(-1.5);expect(p.x).toBeGreaterThan(-1.75);expect(Math.abs(p.z)).toBeLessThan(.01);
      walker.reset({x:0,y:0,z:0});walk.reset();tick(240,{x:1,z:1},0);
      const diagonal=walker.body.translation();expect(diagonal.x).toBeGreaterThan(2.1);expect(diagonal.z).toBeLessThan(-2.1);
      expect(Math.hypot(diagonal.x,diagonal.z)).toBeLessThan(NORMAL_WALK_SPEED*2+.05);
    }finally{world.free();}
  });

  it('brakes on release, clears pending motion for pause, and restores dynamics for a new run',()=>{
    const {world,walker,walk,tick}=fixture();
    try{
      walk.setUnlocked(true);tick(120,{x:0,z:1});const before=walker.body.translation().z;
      tick(120);expect(before-walker.body.translation().z).toBeLessThan(.13);
      const stopped=walker.body.translation().z;tick(120);expect(walker.body.translation().z).toBeCloseTo(stopped,5);
      tick(60,{x:1,z:0});walk.clear();const paused={...walker.body.translation()};
      // No physics ticks are run while paused; clearing does not move any part.
      expect(walker.body.translation()).toEqual(paused);expect(walk.velocity.x).toBe(0);expect(walk.velocity.z).toBe(0);
      tick(60);expect(walker.body.translation().x).toBeCloseTo(paused.x,4);
      walker.reset({x:4,y:0,z:3},.4);walk.reset();tick(1);
      expect(walker.body.translation().x).toBeCloseTo(4,4);expect(walker.body.translation().z).toBeCloseTo(3,4);
      walk.setUnlocked(false);
      expect(walk.active).toBe(false);expect(walk.collider.isEnabled()).toBe(false);
      for(const p of Object.values(walker.rig.parts)){expect(p.body.isDynamic()).toBe(true);for(let i=0;i<p.body.numColliders();i++)expect(p.body.collider(i).isEnabled()).toBe(true);}
      walker.reset({x:0,y:0,z:0});tick(120);expect(walker.body.translation().y).toBeGreaterThan(.85);
    }finally{world.free();}
  });

  it('stops at solid walls instead of translating through their colliders',()=>{
    const {world,walker,walk,tick}=fixture();
    try{
      world.createCollider(R.ColliderDesc.cuboid(3,2,.15).setTranslation(0,2,-2).setCollisionGroups(GROUP.terrain));world.step();
      walk.setUnlocked(true);tick(600,{x:0,z:1});
      expect(walker.body.translation().z).toBeGreaterThan(-1.62);expect(walker.body.translation().z).toBeLessThan(-1.5);
      expect(walker.body.translation().y).toBeLessThan(1.05);expect(walk.active).toBe(true);
    }finally{world.free();}
  });

  it('falls into gaps and hands control back to the dynamic ragdoll',()=>{
    const {world,walker,walk,tick}=fixture(false);
    try{
      world.createCollider(R.ColliderDesc.cuboid(2,.2,1).setTranslation(0,-.2,0).setCollisionGroups(GROUP.terrain));
      world.createCollider(R.ColliderDesc.cuboid(2,.2,2).setTranslation(0,-.2,-5).setCollisionGroups(GROUP.terrain));world.step();
      walk.setUnlocked(true);tick(210,{x:0,z:1});
      expect(walk.active).toBe(false);expect(walker.fallen).toBe(true);expect(walker.body.isDynamic()).toBe(true);
      expect(walker.body.translation().y).toBeLessThan(.1);expect(walker.body.translation().z).toBeGreaterThan(-4);
      expect(walk.unlocked).toBe(true);
    }finally{world.free();}
  });

  it('walks uphill along the real rough trail beyond checkpoint 28',()=>{
    const {world,walker,walk}=fixture(false);
    try{
      for(const block of trailBlocks())addTerrainCollider(world,block);world.step();
      walker.reset(route(28),routeFacing(28));walk.setUnlocked(true);
      const start=walker.body.translation().y;let grounded=0;
      for(let i=0;i<1200;i++){
        const p=walker.body.translation(),s=projectRoute(p).s,target=route(s+.65);
        const yaw=Math.atan2(p.x-target.x,p.z-target.z);
        expect(walk.step(PHYSICS_DT,{x:0,z:1},yaw)).toBe(true);
        world.step(undefined,walker.rig.hooks);walk.postStep(PHYSICS_DT);if(walk.grounded)grounded++;
      }
      expect(projectRoute(walker.body.translation()).s).toBeGreaterThan(38);
      expect(walker.body.translation().y).toBeGreaterThan(start+1.3);
      expect(grounded).toBeGreaterThan(1150);expect(walker.fallen).toBe(false);
      expect(new T.Vector3().copy(walk.body.translation()).distanceTo(new T.Vector3().copy(walker.body.translation()))).toBeLessThan(.2);
    }finally{world.free();}
  });

  it('unlocks a ground-only jump, lifts both feet, and lands upright without a double jump',()=>{
    const {world,walker,walk,tick}=fixture();
    try{
      expect(walk.jump()).toBe(false);walk.setUnlocked(true);expect(walk.jump()).toBe(false);
      tick(12);const start=walker.body.translation().y;
      expect(walk.jump()).toBe(true);expect(walk.velocity.y).toBe(NORMAL_JUMP_SPEED);
      expect(walk.jump()).toBe(false);let peak=start,airborne=0;
      for(let i=0;i<150;i++){
        tick(1);peak=Math.max(peak,walker.body.translation().y);
        if(!walk.grounded){
          airborne++;expect(walk.jump()).toBe(false);
          if(walker.body.translation().y>start+.5){
            expect(walker.feet.left.pos.y).toBeGreaterThan(.45);
            expect(walker.feet.right.pos.y).toBeGreaterThan(.45);
          }
        }
      }
      expect(peak-start).toBeGreaterThan(.8);expect(peak-start).toBeLessThan(.95);expect(airborne).toBeGreaterThan(90);
      expect(walk.active).toBe(true);expect(walk.grounded).toBe(true);expect(walker.fallen).toBe(false);
      expect(walker.body.translation().y).toBeCloseTo(start,2);expect(walk.jump()).toBe(true);
    }finally{world.free();}
  });

  it('continues horizontal walking during a jump and respects ceilings and walls',()=>{
    const {world,walker,walk,tick}=fixture();
    try{
      walk.setUnlocked(true);tick(30,{x:0,z:1});const start=walker.body.translation().z;
      expect(walk.jump()).toBe(true);tick(90,{x:0,z:1});
      expect(start-walker.body.translation().z).toBeGreaterThan(1.1);expect(walk.active).toBe(true);
      walker.reset({x:0,y:0,z:0});walk.reset();
      world.createCollider(R.ColliderDesc.cuboid(3,.1,3).setTranslation(0,2.2,0).setCollisionGroups(GROUP.terrain));
      world.createCollider(R.ColliderDesc.cuboid(3,2,.15).setTranslation(0,2,-1.4).setCollisionGroups(GROUP.terrain));world.step();
      tick(12);const floor=walker.body.translation().y;expect(walk.jump()).toBe(true);
      let peak=floor,hitCeiling=false;
      for(let i=0;i<150;i++){tick(1,{x:0,z:1});peak=Math.max(peak,walker.body.translation().y);if(!walk.grounded&&Math.abs(walk.velocity.y)<.001)hitCeiling=true;}
      expect(peak-floor).toBeGreaterThan(.20);expect(peak-floor).toBeLessThan(.34);expect(hitCeiling).toBe(true);
      expect(walker.body.translation().z).toBeGreaterThan(-1.02);expect(walk.grounded).toBe(true);expect(walker.fallen).toBe(false);
    }finally{world.free();}
  });

  it('freezes a jump while paused and removes its vertical state on reset or relock',()=>{
    const {world,walker,walk,tick}=fixture();
    try{
      walk.setUnlocked(true);tick(12);expect(walk.jump()).toBe(true);tick(20,{x:0,z:1});
      const paused={...walker.body.translation()},vertical=walk.velocity.y;
      walk.clear();expect(walk.velocity.y).toBe(vertical);expect(walk.jump()).toBe(false);
      expect(walker.body.translation()).toEqual(paused);
      tick(1);expect(walker.body.translation().y).toBeGreaterThan(paused.y);
      walker.reset({x:3,y:0,z:2});walk.reset();tick(2);
      expect(walk.velocity.y).toBe(0);expect(walk.grounded).toBe(true);expect(walker.body.translation().y).toBeLessThan(1.03);
      expect(walk.jump()).toBe(true);tick(10);walk.setUnlocked(false);
      expect(walk.jump()).toBe(false);expect(walk.velocity.y).toBe(0);expect(walker.body.isDynamic()).toBe(true);
      walker.reset({x:0,y:0,z:0});walk.setUnlocked(true);walk.reset();tick(120);
      expect(walker.body.translation().y).toBeLessThan(1.03);expect(walk.grounded).toBe(true);
    }finally{world.free();}
  });

  it('still falls when a forward jump leaves a high ledge for a deep gap',()=>{
    const {world,walker,walk,tick}=fixture(false);
    try{
      world.createCollider(R.ColliderDesc.cuboid(2,.2,1).setTranslation(0,1.8,0).setCollisionGroups(GROUP.terrain));world.step();
      walker.reset({x:0,y:2,z:-.65});walk.setUnlocked(true);tick(12);
      expect(walk.jump()).toBe(true);tick(180,{x:0,z:1});
      expect(walk.active).toBe(false);expect(walk.unlocked).toBe(true);expect(walker.fallen).toBe(true);
      expect(walker.body.isDynamic()).toBe(true);expect(walker.body.translation().y).toBeLessThan(1.5);
      expect(walk.jump()).toBe(false);
    }finally{world.free();}
  });

  it('keeps the entire animated rig following the capsule after a long idle before jumping',()=>{
    const {world,walker,walk,tick}=fixture(false);
    try{
      for(const block of trailBlocks())addTerrainCollider(world,block);world.step();
      walker.reset(route(28),routeFacing(28));walk.setUnlocked(true);tick(120);
      // A fresh journey changes the same Rapier bodies from kinematic to dynamic and back.
      walk.setUnlocked(false);walker.reset(route(28),routeFacing(28));walk.reset();tick(2);
      walk.setUnlocked(true);tick(1800);
      // Browser islands may sleep after dialogue on a checkpoint slope. Force that
      // state here as well so the regression is independent of solver timing.
      for(const part of Object.values(walker.rig.parts))part.body.sleep();
      const before=new Map(Object.values(walker.rig.parts).map(part=>[part.definition.id,{...part.body.translation()}]));
      const capsuleY=walk.body.translation().y;
      expect(walk.grounded).toBe(true);expect(walk.jump()).toBe(true);tick(30,{x:0,z:1});
      expect(walk.body.translation().y-capsuleY).toBeGreaterThan(.6);
      for(const part of Object.values(walker.rig.parts)){
        expect(part.body.translation().y-before.get(part.definition.id)!.y,part.definition.id).toBeGreaterThan(.55);
      }
      expect(walker.body.translation().z-before.get('Pelvis')!.z).toBeLessThan(-.12);
      expect(walker.body.translation().y-walk.body.translation().y).toBeCloseTo(.1,3);
      tick(150);expect(walk.grounded).toBe(true);expect(walker.body.translation().y-capsuleY).toBeLessThan(.15);
    }finally{world.free();}
  });
});
