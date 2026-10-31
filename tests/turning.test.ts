import {beforeAll,describe,expect,it} from 'vitest';
import R from '@dimforge/rapier3d-compat';
import * as T from 'three';
import {fixture} from './physical-fixture';
import type {FootId} from '../src/model';

beforeAll(async()=>{await R.init();});
const angleDifference=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const heading=(rotation:R.Quaternion)=>{
  const forward=new T.Vector3(0,0,-1).applyQuaternion(new T.Quaternion().copy(rotation));
  return Math.atan2(-forward.x,-forward.z);
};
function takeStep(f:ReturnType<typeof fixture>,id:FootId,direction:number,stride=.3){
  const {w,tick}=f;
  w.lift(id);w.moveTarget(id,{x:0,z:stride},direction);tick(90);
  expect(w.land(id)).toBe(true);
  for(let i=0;i<480&&w.feet[id].planting;i++)tick(1);
  expect(w.feet[id].planting).toBe(null);
  expect(w.feet[id].grounded).toBe(true);
  expect(w.fallen).toBe(false);
  expect(w.drainFootfalls().filter(event=>event.moved)).toHaveLength(1);
}

describe('body follows a landed change of direction',()=>{
  it.each([
    ['left',0,.6],
    ['right',0,-.6],
    ['left',Math.PI-.2,Math.PI+.4],
  ] as const)('finishes the %s turn from %f to %f while idle',(id,start,target)=>{
    const f=fixture(),{world,w,tick}=f;
    try{
      w.reset({x:0,y:0,z:0},start);tick(240);
      takeStep(f,id,target,start===0?.3:.2);
      const landed=w.facing;
      expect(Math.abs(angleDifference(target,landed))).toBeGreaterThan(.3);
      let previous=landed,totalTurn=0,largestTurn=0;
      for(let i=0;i<240;i++){
        tick(1);const change=angleDifference(w.facing,previous);
        totalTurn+=change;largestTurn=Math.max(largestTurn,Math.abs(change));previous=w.facing;
      }
      expect(Math.abs(angleDifference(w.facing,target))).toBeLessThan(.03);
      expect(Math.abs(totalTurn-angleDifference(target,landed))).toBeLessThan(.03);
      expect(largestTurn).toBeLessThan(.03);
      for(const id of ['Pelvis','Torso'] as const){
        expect(Math.abs(angleDifference(heading(w.rig.parts[id].body.rotation()),target))).toBeLessThan(.12);
      }
      expect(w.fallen).toBe(false);
      expect(w.drainFootfalls()).toHaveLength(0);
      expect(Object.values(w.rig.parts).every(part=>part.body.isDynamic())).toBe(true);
    }finally{world.free();}
  });

  it('keeps the original heading after an unmoved click or a backward step',()=>{
    const f=fixture(),{world,w,tick}=f;
    try{
      tick(240);w.lift('left');w.land('left');tick(240);
      expect(w.drainFootfalls()).toHaveLength(0);
      expect(w.facing).toBeCloseTo(0,5);
      takeStep(f,'left',0,-.25);tick(240);
      expect(w.facing).toBeCloseTo(0,5);
      expect(w.fallen).toBe(false);
    }finally{world.free();}
  });

  it('discards an unfinished turn when resetting the character',()=>{
    const f=fixture(),{world,w,tick}=f;
    try{
      tick(240);takeStep(f,'left',.6);
      expect(Math.abs(angleDifference(w.facing,.6))).toBeGreaterThan(.3);
      w.reset({x:0,y:0,z:0},-1);tick(240);
      expect(w.facing).toBeCloseTo(-1,5);
      expect(Math.abs(angleDifference(heading(w.body.rotation()),-1))).toBeLessThan(.12);
      expect(w.fallen).toBe(false);
    }finally{world.free();}
  });

  it('does not resume an unfinished turn after falling and getting up',()=>{
    const f=fixture(),{world,w,tick}=f;
    try{
      tick(240);takeStep(f,'left',.6);
      const beforeFall=w.facing;
      expect(Math.abs(angleDifference(beforeFall,.6))).toBeGreaterThan(.3);
      w.fall();tick(600);
      expect(w.facing).toBeCloseTo(beforeFall,5);
      expect(w.recovery.tryBegin(.4)).toBe(true);
      for(let i=0;i<1600&&w.fallen;i++)tick(1);
      expect(w.fallen).toBe(false);
      tick(240);
      expect(w.facing).toBeCloseTo(beforeFall,5);
      expect(w.fallen).toBe(false);
    }finally{world.free();}
  });
});
