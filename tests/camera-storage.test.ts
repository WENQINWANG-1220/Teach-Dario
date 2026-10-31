import { afterEach, describe, expect, it, vi } from 'vitest';
import * as T from 'three';
import { FollowCamera } from '../src/camera';
import { RunState } from '../src/model';
import { SaveStore } from '../src/storage';
afterEach(()=>vi.unstubAllGlobals());
describe('camera controls and terrain avoidance',()=>{
  const camera=()=>{vi.stubGlobal('innerWidth',1280);vi.stubGlobal('innerHeight',720);return new FollowCamera();};
  it('rotates without a held button and bounds pitch and zoom',()=>{const c=camera();c.move(100,100);expect(c.yaw).toBeLessThan(0);expect(c.pitch).toBeGreaterThan(.29);c.move(0,100000);expect(c.pitch).toBe(.95);c.move(0,-100000);expect(c.pitch).toBe(-.12);c.zoom(100000);expect(c.distance).toBe(8);c.zoom(-100000);expect(c.distance).toBe(2.5);});
  it('pulls the camera in front of an intervening wall',()=>{const c=camera();const wall=new T.Mesh(new T.BoxGeometry(5,5,.3));wall.position.set(0,1,3);wall.updateMatrixWorld(true);c.update({x:0,y:1,z:0},1/60,[wall]);expect(c.camera.position.distanceTo(c.target)).toBeLessThan(3);expect(c.camera.position.z).toBeLessThan(2.85);});
});
describe('storage failures and personal records',()=>{
  function memory(){const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)});return data;}
  it('persists mute before any run without creating a fake journey',()=>{memory();const a=new SaveStore();a.setMuted(true);const b=new SaveStore();expect(b.muted).toBe(true);expect(b.saved).toBeNull();});
  it('keeps the fastest completion when restarting or finishing slower',()=>{memory();const store=new SaveStore(),r=new RunState();r.phase='finished';r.elapsed=100;store.write(r,false);r.reset();store.write(r,false);expect(store.saved?.best).toBe(100);r.phase='finished';r.elapsed=200;store.write(r,false);expect(store.saved?.best).toBe(100);r.elapsed=90;store.write(r,false);expect(new SaveStore().saved?.best).toBe(90);});
  it('allows in-memory play and saving when localStorage throws',()=>{vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('quota');}});const store=new SaveStore();expect(store.available).toBe(false);const r=new RunState();r.reset();r.checkpoint=1;expect(()=>store.write(r,false)).not.toThrow();expect(store.saved?.checkpoint).toBe(1);});
});
