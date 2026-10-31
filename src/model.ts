export type FootId = 'left' | 'right';
export type ActivePhase = 'playing' | 'fallen' | 'recovering';
export type Phase = 'home' | ActivePhase | 'paused' | 'finished';
export type Point = { x: number; y: number; z: number };
export const LENGTH = 180;
export const MAX_STEP_REACH = .85;
export const LEGACY_CHECKPOINTS = [0, 12, 64, 122, LENGTH];
export const CHECKPOINTS = [0, 12, 22, 46, 64, 74, 94, 110, 122, 134, 164, LENGTH];
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export function route(s: number): Point {
  const baseX = (d: number) => Math.sin(d * .045) * 5 + Math.sin(d * .11) * 1.8;
  let x = baseX(s);
  if (s >= 48 && s <= 62) {
    const knots = [[48,0],[52,.8],[57,-.5],[62,0]]; let i=0;while(i<2&&s>knots[i+1][0])i++;
    x += knots[i][1] + (knots[i+1][1]-knots[i][1]) * (s-knots[i][0])/(knots[i+1][0]-knots[i][0]);
  }
  for (const [a,b] of [[78,90],[96,108]]) if(s>=a&&s<=b)x=baseX(a)+(baseX(b)-baseX(a))*(s-a)/(b-a);
  if(s>=136&&s<=162)x+=.26*Math.cos((s-136)/1.35*Math.PI)*Math.min(1,(s-136)/1.35,(162-s)/1.35);
  const travel = Math.max(0,s)-clamp(s-78,0,30);
  const y = travel*.035 + clamp(Math.floor((s-24)/2),0,10)*.18 + clamp(Math.floor((s-136)/2.7),0,10)*.18;
  return {x,y,z:-s};
}
export function stage(s: number) { return s < 12 ? '起步草甸' : s < 46 ? '01 / 错层遗迹石阶' : s < 64 ? '02 / 折线窄墙' : s < 122 ? '03 / 悬谷独木桥' : s < 164 ? '04 / 踏石越隙' : '最后一段 · 云上山顶'; }
export function limitTarget(target: Point, body: Point, reach = MAX_STEP_REACH): Point {
  const dx = target.x - body.x, dz = target.z - body.z, d = Math.hypot(dx, dz);
  const k = d > reach ? reach / d : 1;
  return { x: body.x + dx * k, y: target.y, z: body.z + dz * k };
}
export function supportSafe(distance: number, contacts: number) { return contacts > 0 && distance <= (contacts === 2 ? 1.3 : .92); }
export function clockLabel(seconds: number) { const n = Math.floor(Math.max(0, seconds)); return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`; }
export class RunState {
  phase: Phase = 'home'; previous: ActivePhase = 'playing';
  elapsed = 0; falls = 0; steps = 0; checkpoint = 0; maxProgress = 0;
  reset() { this.elapsed = this.falls = this.steps = this.checkpoint = this.maxProgress = 0; this.phase = 'playing'; }
  pause() { if (this.phase === 'playing' || this.phase === 'fallen' || this.phase === 'recovering') { this.previous = this.phase; this.phase = 'paused'; } }
  resume() { if (this.phase === 'paused') this.phase = this.previous; }
  advance(progress: number) {
    this.maxProgress = Math.max(this.maxProgress, progress);
    const next = CHECKPOINTS.reduce((last, s, i) => progress >= s ? i : last, 0);
    if (next > this.checkpoint) { this.checkpoint = next; return true; } return false;
  }
}
