import {route,projectRoute,routeDirection,routeFacing,CHECKPOINTS,LENGTH,type FootId} from '../src/model';
import {footSpacing} from '../src/terrain';
import {PHYSICS_DT} from '../src/rig';
import type {Walker,Footfall} from '../src/walker';
/** Spiral-aware physical replay; retry only from camps already reached. */
export function replayTrail(w:Walker,onTick?:(dt:number,events:Footfall[])=>void,end=LENGTH,options?:{step?:(dt:number,lean:{x:number;z:number})=>void;reset?:(checkpoint:number)=>void}){
 let steps=0,elapsed=0,landings=0,falls=0,retries=0,maxProgress=projectRoute(w.body.translation()).s,wasFallen=false,stalls=0,campResets=0,lastCamp=CHECKPOINTS.filter(s=>s<=maxProgress).at(-1)??0;
 const attempts=new Map<number,number>();
 const tick=(n:number)=>{for(let i=0;i<n;i++){if(w.fallen&&!w.recovery.active)w.recovery.tryBegin(PHYSICS_DT);if(options?.step)options.step(PHYSICS_DT,{x:0,z:0});else w.simulate(PHYSICS_DT);elapsed+=PHYSICS_DT;if(w.fallen&&!wasFallen)falls++;wasFallen=w.fallen;const events=w.drainFootfalls();steps+=events.filter(e=>e.moved).length;onTick?.(PHYSICS_DT,events);const p=projectRoute(w.body.translation());if(!w.fallen&&p.distance<2.5&&p.heightError<.75)maxProgress=Math.max(maxProgress,p.s);}};
 tick(120);
 while(projectRoute(w.body.translation()).s<end-.25&&landings<3000){
  const checkpoint=CHECKPOINTS.filter(s=>s<=maxProgress).at(-1)??0,attempt=attempts.get(checkpoint)??0;
  if(checkpoint>lastCamp){lastCamp=checkpoint;campResets++;options?.reset?.(checkpoint);w.reset(route(checkpoint),routeFacing(checkpoint));tick(120);}
  try{
   if(w.fallen){for(let i=0;i<1800&&w.fallen;i++)tick(1);if(w.fallen)throw Error('No safe get-up');}
   const id:FootId=(landings+attempt)%2?'right':'left',f=w.feet[id],before=projectRoute(w.body.translation()).s;
   w.lift(id);const originProgress=projectRoute({...f.origin,y:f.origin.y+.99}).s;
   let goal:{x:number;y:number;z:number}|null=null;
   for(const advance of [.22,.18,.14,.10,.06,0,-.06]){
    const s=Math.min(end+.15,originProgress+advance),p=route(s),dir=routeDirection(s),side=id==='left'?-1:1;
    p.x+=-dir.z*side*footSpacing(s);p.z+=dir.x*side*footSpacing(s);
    const ground=w.ground(p.x,p.z,w.body.translation().y+.4,2);if(!ground||ground.y-f.origin.y>.3)continue;goal={...p,y:ground.y};break;
   }
   if(!goal)throw Error('No reachable surface');
   w.moveTarget(id,{x:goal.x-f.target.x,z:f.target.z-goal.z},0);tick(100);w.land(id);for(let i=0;i<240&&f.planting;i++)tick(1);tick(40);landings++;
   stalls=projectRoute(w.body.translation()).s<=before+.01?stalls+1:0;if(stalls>18)throw Error('Stalled');
  }catch(error){const next=attempt+1;if(next>4)throw error;attempts.set(checkpoint,next);retries++;options?.reset?.(checkpoint);w.reset(route(checkpoint),routeFacing(checkpoint));wasFallen=false;stalls=0;tick(120);}
 }
 const progress=projectRoute(w.body.translation()).s;if(progress<end-.25)throw Error('Replay exceeded step budget');return{steps,elapsed,landings,falls,retries,campResets,progress};
}
