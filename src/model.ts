export type FootId = 'left' | 'right';
export type ActivePhase = 'playing' | 'fallen' | 'recovering' | 'sliding';
export type Phase = 'home' | ActivePhase | 'paused' | 'finished';
export type Point = { x: number; y: number; z: number };
export const LENGTH = 180;
export const MAX_STEP_REACH = .85;
export const LEGACY_CHECKPOINTS = [0,12,64,122,LENGTH];
export const CHECKPOINTS = [0,12,28,48,68,90,108,128,146,164,180];
export const MOUNTAIN = { x:0,z:-18,height:22 };
export const BRIDGES = [{start:56,end:64,diameter:.9},{start:114,end:122,diameter:.76}] as const;
export const SEESAW = {start:18,end:24,width:1.65,maxTilt:.12} as const;
export const clamp = (v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
function spiral(s:number):Point {
 const t=clamp(s/164,0,1),a=t*Math.PI*4,r=18-14*t;
 return {x:Math.sin(a)*r,y:t*22,z:MOUNTAIN.z+Math.cos(a)*r};
}
export function route(s:number):Point {
 if(s<0){const p=spiral(0),d=routeDirection(0);return{x:p.x+d.x*s,y:0,z:p.z+d.z*s};}
 if(s>=164){const t=clamp((s-164)/16,0,1);return{x:0,y:22,z:MOUNTAIN.z+4*(1-t)};}
 for(const bridge of [SEESAW,...BRIDGES])if(s>=bridge.start&&s<=bridge.end){const a=spiral(bridge.start),b=spiral(bridge.end),t=(s-bridge.start)/(bridge.end-bridge.start);return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};}
 return spiral(s);
}
/** Horizontal forward vector; independent of world -Z. */
export function routeDirection(s:number):Point {const a=route(Math.max(0,s)),b=route(Math.min(LENGTH,Math.max(0,s)+.1)),dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);return d>.00001?{x:dx/d,y:0,z:dz/d}:{x:0,y:0,z:-1};}
export function routeFacing(s:number){const d=routeDirection(s);return Math.atan2(-d.x,-d.z);}
const samples=Array.from({length:721},(_,i)=>({s:i/4,p:route(i/4)}));
export function projectRoute(body:Point){
 let best=samples[0],score=Infinity;
 for(const q of samples){const next=(body.x-q.p.x)**2+(body.z-q.p.z)**2+4*(body.y-q.p.y-.99)**2;if(next<score){score=next;best=q;}}
 return {s:best.s,point:best.p,distance:Math.hypot(body.x-best.p.x,body.z-best.p.z),heightError:Math.abs(body.y-best.p.y-.99)};
}
export function stage(s:number){return s<12?'00 / 便便山脚 · 双腿启动':s<28?'01 / 跷跷板 · Scaling Laws':s<48?'01 / 第一圈 · 碳基预训练':s<90?'02 / 第一座独木桥':s<128?'03 / 第二圈 · 模型过拟合':s<164?'04 / 最后的盘山路':'终极智慧峰 · 黄金马桶';}
export function limitTarget(target:Point,body:Point,reach=MAX_STEP_REACH):Point{const dx=target.x-body.x,dz=target.z-body.z,d=Math.hypot(dx,dz),k=d>reach?reach/d:1;return{x:body.x+dx*k,y:target.y,z:body.z+dz*k};}
export function supportSafe(distance:number,contacts:number){return contacts>0&&distance<=(contacts===2?1.3:.92);}
export function clockLabel(seconds:number){const n=Math.floor(Math.max(0,seconds));return`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
export const MAP_ID='poop-mountain-v1';
export const TOILET_POSITION={x:0,y:22.05,z:-20.4};
export class RunState {
  phase: Phase = 'home'; previous: ActivePhase = 'playing';
  elapsed = 0; falls = 0; steps = 0; checkpoint = 0; maxProgress = 0;
  walkingUnlocked = false;
  reset() { this.elapsed = this.falls = this.steps = this.checkpoint = this.maxProgress = 0; this.walkingUnlocked=false;this.phase = 'playing'; }
  pause() { if (this.phase === 'playing' || this.phase === 'fallen' || this.phase === 'recovering' || this.phase === 'sliding') { this.previous = this.phase; this.phase = 'paused'; } }
  resume() { if (this.phase === 'paused') this.phase = this.previous; }
  advance(progress: number) {
    this.maxProgress = Math.max(this.maxProgress, progress);
    const next = CHECKPOINTS.reduce((last, s, i) => progress >= s ? i : last, 0);
    if (next > this.checkpoint) { this.checkpoint = next; return true; } return false;
  }
}
