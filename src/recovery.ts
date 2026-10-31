import * as T from 'three';
import R from '@dimforge/rapier3d-compat';
import {GROUP,type PartId} from './rig';
import type {Walker} from './walker';
export const RECOVERY_SECONDS=4;
export class Recovery {
  active=false;
  time=0;
  readonly anchor=new T.Vector3();
  readonly startPose=new Map<PartId,{position:T.Vector3;rotation:T.Quaternion}>();
  private settled=0;
  private cooldown=0;
  private stable=0;
  constructor(private w:Walker){}
  get progress(){return Math.min(1,this.time/RECOVERY_SECONDS);}
  clear(){this.active=false;this.time=this.settled=this.cooldown=this.stable=0;this.startPose.clear();}
  hasClearance(p:T.Vector3){
    const own=new Set(Object.values(this.w.rig.parts).map(part=>part.body.handle));
    return !this.w.physics.intersectionWithShape({x:p.x,y:p.y+1.3,z:p.z},{x:0,y:0,z:0,w:1},new R.Capsule(.35,.2),undefined,GROUP.person,undefined,undefined,collider=>!collider.isSensor()&&!own.has(collider.parent()?.handle??-1));
  }
  safePose(){
    const b=this.w.body.translation(),lateral=new T.Vector3(Math.cos(this.w.facing)*.14,0,-Math.sin(this.w.facing)*.14);
    for(const [dx,dz]of [[0,0],[.25,0],[-.25,0],[0,.25],[0,-.25],[.35,.35],[-.35,-.35]]){
      const left=this.w.ground(b.x+dx-lateral.x,b.z+dz-lateral.z,b.y+1,2),right=this.w.ground(b.x+dx+lateral.x,b.z+dz+lateral.z,b.y+1,2);
      if(left&&right&&left.normal.y>.7&&right.normal.y>.7&&Math.abs(left.y-right.y)<=.3){const p=new T.Vector3(b.x+dx,Math.max(left.y,right.y),b.z+dz);if(this.hasClearance(p))return p;}
    }
    return null;
  }
  tryBegin(dt:number){
    this.cooldown=Math.max(0,this.cooldown-dt);if(this.active||this.cooldown)return false;
    this.settled=this.w.canStand()?this.settled+dt:0;if(this.settled<.3)return false;
    const anchor=this.safePose();if(!anchor)return false;this.anchor.copy(anchor);
    this.startPose.clear();for(const part of Object.values(this.w.rig.parts))this.startPose.set(part.definition.id,{position:new T.Vector3().copy(part.body.translation()),rotation:new T.Quaternion().copy(part.body.rotation())});
    this.active=true;this.time=this.stable=0;return true;
  }
  private abort(){this.active=false;this.cooldown=1;this.settled=this.stable=0;}
  step(dt:number){
    if(!this.hasClearance(this.anchor)){this.abort();return;}
    this.time+=dt;const t=this.time;
    const height=t<.65?.28:t<1.4?.28+(t-.65)/.75*.27:.55+Math.min(1,(t-1.4)/2.1)*.44;
    const fold=t<.65?1:t<1.4?1-(t-.65)/.75*.34:.66*Math.max(0,1-(t-1.4)/2.1);
    this.w.control(dt,{height,fold,chest:-.9*Math.max(0,1-(t-1.4)/2.1)});
    const rotation=this.w.body.rotation(),upY=1-2*(rotation.x**2+rotation.z**2),feet=Object.values(this.w.feet).some(f=>f.grounded)&&Object.values(this.w.feet).every(f=>f.pos.y<this.anchor.y+.2),speed=this.w.body.linvel();
    this.stable=t>3&&feet&&upY>.95&&this.w.body.translation().y>this.anchor.y+.85&&Math.hypot(speed.x,speed.y,speed.z)<.6?this.stable+dt:0;
    if(this.stable>.3){this.active=false;this.w.completeRecovery();}else if(this.time>8)this.abort();
  }
}
