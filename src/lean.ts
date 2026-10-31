import * as T from 'three';
export interface LeanAxes {x:number;z:number}
export const LEAN_RESPONSE=.18,MAX_LEAN_SHIFT=.18;
/** Input describes muscle intent, not an unbounded root rotation. */
export class LeanControl {
  readonly axes=new T.Vector2();readonly world=new T.Vector3();readonly offset=new T.Vector3();readonly tilt=new T.Vector2();readonly angles=new T.Vector2();
  update(input:LeanAxes,dt:number,facing:number){
    const desired=new T.Vector2(input.x,input.z).clampLength(0,1);this.axes.lerp(desired,1-Math.exp(-dt/LEAN_RESPONSE));
    this.world.set(Math.cos(facing)*this.axes.x-Math.sin(facing)*this.axes.y,0,-Math.sin(facing)*this.axes.x-Math.cos(facing)*this.axes.y);
    this.offset.copy(this.world).multiplyScalar(MAX_LEAN_SHIFT);this.angles.set(this.axes.x*T.MathUtils.degToRad(25),this.axes.y*T.MathUtils.degToRad(this.axes.y>=0?40:25));
    this.tilt.set(-this.angles.y,-this.angles.x);
  }
  combined(pitch:number,roll:number){return this.tilt.clone().add(new T.Vector2(pitch,roll));}
  clear(){this.axes.set(0,0);this.world.set(0,0,0);this.offset.set(0,0,0);this.tilt.set(0,0);this.angles.set(0,0);}
}
