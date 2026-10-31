import {route,LENGTH,CHECKPOINTS,type FootId} from '../src/model';
import {footSpacing} from '../src/terrain';
import {PHYSICS_DT} from '../src/rig';
import type {Walker,Footfall} from '../src/walker';
/** A deterministic mouse player, including normal get-up and checkpoint retries; no body teleports except R-equivalent resets. */
export function replayTrail(w:Walker,onTick?:(dt:number,events:Footfall[])=>void,end=LENGTH,options?:{step?:(dt:number,lean:{x:number;z:number})=>void;reset?:(checkpoint:number)=>void}){
  let steps=0,elapsed=0,landings=0,falls=0,retries=0,maxProgress=-w.body.translation().z,wasFallen=false,stalls=0,campResets=0,lastCamp=CHECKPOINTS.filter(s=>s<=maxProgress).at(-1)??0;
  const attempts=new Map<number,number>();
  const tick=(count:number,lean={x:0,z:0})=>{for(let i=0;i<count;i++){
    if(w.fallen&&!w.recovery.active)w.recovery.tryBegin(PHYSICS_DT);
    if(options?.step)options.step(PHYSICS_DT,lean);else w.simulate(PHYSICS_DT,lean);elapsed+=PHYSICS_DT;
    if(w.fallen&&!wasFallen)falls++;wasFallen=w.fallen;
    const events=w.drainFootfalls();steps+=events.filter(e=>e.moved).length;onTick?.(PHYSICS_DT,events);
    const b=w.body.translation(),p=route(-b.z);if(!w.fallen&&Math.abs(b.x-p.x)<3&&Math.abs(b.y-p.y-.99)<1.3)maxProgress=Math.max(maxProgress,-b.z);
  }};
  tick(120);
  while(-w.body.translation().z<end-.3&&landings<6000){
    const checkpoint=CHECKPOINTS.filter(s=>s<=maxProgress).at(-1)??0,attempt=attempts.get(checkpoint)??0;
    if(checkpoint>lastCamp){lastCamp=checkpoint;campResets++;options?.reset?.(checkpoint);w.reset(route(checkpoint));tick(120);}
    try{
      if(w.fallen){for(let i=0;i<1800&&w.fallen;i++)tick(1);if(w.fallen)throw Error('No safe get-up');}
      const id:FootId=(landings+attempt)%2?'right':'left',f=w.feet[id],body={...w.body.translation()};w.lift(id);
      let goal:{x:number;y:number;z:number}|null=null;
      const stride=.30/(1+attempt*.15);
      for(const advance of [stride,.25,.20,.15,.10,0,-.10,.40,.50,.60]){
        const s=Math.min(end+.3,-f.origin.z+advance),p=route(s),roadBefore=route(-f.origin.z),alongX=f.origin.x+p.x-roadBefore.x;
        const desiredX=p.x+(id==='left'?-1:1)*footSpacing(s);p.x=alongX+Math.max(-.03,Math.min(.03,(desiredX-alongX)*.2));
        if(Math.hypot(p.x-body.x,p.z-body.z)>.84)continue;
        const g=w.ground(p.x,p.z,body.y+.4,2);if(!g||g.y>f.origin.y+.3||g.y<body.y-1.2)continue;
        goal={...p,y:g.y};break;
      }
      if(!goal)throw Error('No reachable surface');
      w.moveTarget(id,{x:goal.x-f.target.x,z:f.target.z-goal.z},0);tick(100+attempt*12);w.land(id);
      for(let i=0;i<180&&f.planting;i++)tick(1);tick(40+attempt*8);
      landings++;stalls=-w.body.translation().z<-body.z+.015?stalls+1:0;if(stalls>14)throw Error('Stalled');
    }catch(error){
      const next=attempt+1;attempts.set(checkpoint,next);if(next>10)throw Error(`${(error as Error).message} near ${(-w.body.translation().z).toFixed(2)}m after ${next} attempts from ${checkpoint}m`);
      retries++;options?.reset?.(checkpoint);w.reset(route(checkpoint));wasFallen=false;stalls=0;tick(120);
    }
  }
  if(-w.body.translation().z<end-.3)throw Error('Replay exceeded step budget');
  return {steps,elapsed,landings,falls,retries,campResets,progress:-w.body.translation().z};
}
