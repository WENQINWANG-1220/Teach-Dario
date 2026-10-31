import { describe, expect, it } from 'vitest';
import { InputState } from '../src/input';
import { CHECKPOINTS, RunState, limitTarget, route, supportSafe } from '../src/model';
import { parseSave } from '../src/storage';
describe('input aliases and independent feet', () => {
  it.each([['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown'], ['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']])('%s matches %s', (a, b) => {
    const x = new InputState(), y = new InputState(); x.press(a); y.press(b); expect(x.leanAxes()).toEqual(y.leanAxes());
  });
  it('does not sum aliases and keeps the remaining held alias', () => { const i = new InputState(); i.press('KeyW'); i.press('ArrowUp'); expect(i.leanAxes().z).toBe(1); i.release('KeyW'); expect(i.leanAxes().z).toBe(1); });
  it('cancels opposite directions and normalizes diagonals', () => { const i = new InputState(); i.press('ArrowUp'); i.press('KeyS'); expect(i.leanAxes().z).toBe(0); i.release('KeyS'); i.press('KeyD'); expect(Math.hypot(i.leanAxes().x, i.leanAxes().z)).toBeCloseTo(1); });
  it('does not select a foot from a direction key', () => { const i = new InputState(); i.press('ArrowUp'); expect(i.active).toBeNull(); });
  it('ignores Q and E completely', () => { const i = new InputState(); for(const code of ['KeyQ','KeyE']){expect(i.press(code)).toBeNull();expect(i.held.has(code)).toBe(false);expect(i.release(code)).toBeNull();}expect(i.active).toBeNull();expect(i.owner).toBeNull();expect(i.leanAxes()).toEqual({x:0,z:0}); });
  it('clears held directions and foot after pause', () => { const i = new InputState(); i.press('Mouse0'); i.press('ArrowUp'); i.clear(); expect(i.active).toBeNull(); expect(i.leanAxes()).toEqual({ x: 0, z: 0 }); });
  it('selects the matching foot for each mouse button',()=>{const i=new InputState();expect(i.press('Mouse0')).toBe('left');expect(i.release('Mouse0')).toBe('left');expect(i.press('Mouse2')).toBe('right');});
  it('keeps the first mouse button and never promotes an already held button',()=>{const i=new InputState();i.press('Mouse0');expect(i.press('Mouse2')).toBeNull();expect(i.release('Mouse0')).toBe('left');expect(i.active).toBeNull();expect(i.press('Mouse2')).toBeNull();expect(i.mouseHeld).toBe(true);i.release('Mouse2');expect(i.press('Mouse2')).toBe('right');});
  it('lean keys and Q/E cannot select or release a mouse-owned foot',()=>{const i=new InputState();i.press('Mouse0');for(const code of ['KeyQ','KeyE','KeyW','ArrowRight']){expect(i.press(code)).toBeNull();expect(i.release(code)).toBeNull();expect(i.active).toBe('left');}expect(i.release('Mouse0')).toBe('left');});
  it('accumulates relative mouse travel exactly once and remembers drag orientation',()=>{const i=new InputState();i.press('Mouse0',.75);i.moveMouse(20,-60);i.moveMouse(80,-40);const delta=i.consumeMouse();expect(delta.x).toBeCloseTo(.35);expect(delta.z).toBeCloseTo(.35);expect(i.consumeMouse()).toEqual({x:0,z:-0});expect(i.dragYaw).toBe(.75);});
  it('ignores mouse travel without an owning mouse button and clears pending travel',()=>{const i=new InputState();i.press('KeyW');i.moveMouse(100,100);expect(i.consumeMouse().x).toBe(0);i.clear();i.press('Mouse2');i.moveMouse(100,100);i.clear();expect(i.mouseHeld).toBe(false);expect(i.consumeMouse().x).toBe(0);expect(i.owner).toBeNull();});
  it.each([['KeyW',0,1],['KeyA',-1,0],['KeyS',0,-1],['KeyD',1,0]] as const)('%s supplies the requested lean direction', (code,x,z)=>{const i=new InputState();i.press(code);expect(i.leanAxes()).toEqual({x,z});i.release(code);expect(i.leanAxes()).toEqual({x:0,z:0});});
});
describe('reach, support and route', () => {
  it('limits the anatomical target workspace without changing direction', () => { const p = limitTarget({ x: 3, y: 0, z: 4 }, { x: 0, y: 1, z: 0 }); expect(Math.hypot(p.x, p.z)).toBeCloseTo(.85); expect(p.x / p.z).toBeCloseTo(.75); });
  it('does not produce support in mid-air', () => { expect(supportSafe(0, 0)).toBe(false); expect(supportSafe(.5, 1)).toBe(true); expect(supportSafe(1, 1)).toBe(false); expect(supportSafe(1, 2)).toBe(true); });
  it('has reachable successive route rises', () => { for (let s = 0; s < 180; s += .25) expect(route(s + .25).y - route(s).y).toBeLessThan(.3); });
});
describe('run lifecycle', () => {
  it('keeps a fallen phase through pause and resume', () => { const r = new RunState(); r.phase = 'fallen'; r.pause(); expect(r.phase).toBe('paused'); r.resume(); expect(r.phase).toBe('fallen'); });
  it('keeps recovery through pause and resume',()=>{const r=new RunState();r.phase='recovering';r.pause();expect(r.phase).toBe('paused');r.resume();expect(r.phase).toBe('recovering');});
  it('advances checkpoints once, preserves maximum progress and resets', () => { const r = new RunState(); r.reset(); for (let i = 1; i < CHECKPOINTS.length; i++) { expect(r.advance(CHECKPOINTS[i])).toBe(true); expect(r.checkpoint).toBe(i); expect(r.advance(CHECKPOINTS[i] - 1)).toBe(false); } r.reset(); expect(r.checkpoint).toBe(0); expect(r.maxProgress).toBe(0); });
});
const valid = { version: 1, checkpoint: CHECKPOINTS.indexOf(64), checkpointMeters:64, elapsed: 30, falls: 1, steps: 20, maxProgress: 65, best: null, muted: false, finished: false };
describe('save validation', () => {
  it('accepts valid saved progress', () => expect(parseSave(JSON.stringify(valid))).toEqual(valid));
  it('migrates old checkpoint indices by distance without losing records',()=>{const old={...valid,checkpoint:2,best:300};delete (old as {checkpointMeters?:number}).checkpointMeters;const migrated=parseSave(JSON.stringify(old));expect(migrated?.checkpoint).toBe(CHECKPOINTS.indexOf(64));expect(migrated?.checkpointMeters).toBe(64);expect(migrated?.best).toBe(300);expect(migrated?.elapsed).toBe(30);});
  it.each([null, '', 'oops', '{}', JSON.stringify({ ...valid, version: 5 }), JSON.stringify({ ...valid, checkpoint: -1 }), JSON.stringify({ ...valid, elapsed: -1 }), JSON.stringify({ ...valid, maxProgress: 999 }), JSON.stringify({ ...valid, falls: .5 }), JSON.stringify({ ...valid, best: -2 })])('rejects corrupt or unsupported save %s', raw => expect(parseSave(raw)).toBeNull());
});
