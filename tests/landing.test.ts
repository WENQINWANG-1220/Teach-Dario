import {beforeAll,it,expect} from 'vitest';
import R from '@dimforge/rapier3d-compat';
import {fixture} from './physical-fixture';
beforeAll(async()=>{await R.init();});
it.each([
  ['left','right',0],['left','right',6],['left','right',12],
  ['right','left',0],['right','left',6],['right','left',12],
] as const)('does not deadlock switching %s to %s before balancing, after %i ticks',(first,next,hold)=>{
  const {world,w,tick}=fixture();try{
    tick(240);w.lift(first);w.moveTarget(first,{x:0,z:.3},0);tick(hold);w.land(first);w.lift(next);tick(300);
    expect(w.feet[first].planting).toBe(null);expect(w.feet[first].grounded).toBe(true);expect(w.feet[next].ready).toBe(true);expect(w.feet[next].pos.y).toBeGreaterThan(.1);expect(w.fallen).toBe(false);
    expect(Object.values(w.rig.parts).every(part=>part.body.isDynamic())).toBe(true);
  }finally{world.free();}
});
it.each([0,.3,.5,.65])('plants a released left foot at %fm and allows the right foot to lift',stride=>{
  const {world,w,tick}=fixture();
  try{
    tick(240);w.lift('left');w.moveTarget('left',{x:0,z:stride},0);tick(90);w.land('left');tick(240);
    expect(w.feet.left.planting).toBe(null);expect(w.feet.left.grounded).toBe(true);
    const height=w.feet.right.pos.y;w.lift('right');let raised=height;for(let i=0;i<240;i++){tick(1);raised=Math.max(raised,w.feet.right.pos.y);}
    expect(raised-height).toBeGreaterThan(.07);expect(w.fallen).toBe(false);
  }finally{world.free();}
});
it.each([0,12,30,60])('finishes planting when the other foot is selected after %i ticks',delay=>{
  const {world,w,tick}=fixture();try{
    tick(240);w.lift('left');w.moveTarget('left',{x:0,z:.3},0);tick(90);w.land('left');tick(delay);
    const height=w.feet.right.pos.y;w.lift('right');let raised=height;for(let i=0;i<240;i++){tick(1);raised=Math.max(raised,w.feet.right.pos.y);}
    expect(w.feet.left.planting).toBe(null);expect(w.feet.left.grounded).toBe(true);expect(raised-height).toBeGreaterThan(.07);expect(w.fallen).toBe(false);
  }finally{world.free();}
});
