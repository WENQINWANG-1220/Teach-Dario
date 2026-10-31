import * as T from 'three';
import {SLIDE_LANES,laneCoordinates,type SlideLane} from './terrain';
import type {Walker} from './walker';
/** Falling off either log enters a real, low-friction chute, not a checkpoint teleport. */
export class MountainSlide {
 active:SlideLane|null=null;time=0;
 detect(w:Walker){
  if(this.active)return this.active;
  const p=w.body.translation();
  return SLIDE_LANES.find(lane=>{const c=laneCoordinates(p,lane);return c.segment<=4&&c.t>=-.025&&c.distance<c.width/2&&p.y<c.floor+1.05&&p.y>c.floor-1;})??null;
 }
 begin(w:Walker,lane:SlideLane){this.active=lane;this.time=0;w.recovery.clear();w.fall();for(const p of Object.values(w.rig.parts)){p.collider.setFriction(.025);}}
 clear(w:Walker){this.active=null;this.time=0;for(const p of Object.values(w.rig.parts))p.collider.setFriction(p.definition.id.startsWith('Shoe')?.9:.6);}
 step(w:Walker,dt:number){
  if(!this.active)return false;this.time+=dt;
  const lane=this.active,c=laneCoordinates(w.body.translation(),lane);
  let remaining=c.t*c.length+2.5,target=new T.Vector3().copy(lane.end);
  for(let i=0;i<lane.points.length-1;i++){
    const a=lane.points[i],b=lane.points[i+1],length=Math.hypot(b.x-a.x,b.z-a.z);
    if(remaining<=length||i===lane.points.length-2){target.set(a.x+(b.x-a.x)*remaining/length,0,a.z+(b.z-a.z)*remaining/length);break;}remaining-=length;
  }
  const direction=target.sub(new T.Vector3(w.body.translation().x,0,w.body.translation().z)).normalize();
  for(const part of Object.values(w.rig.parts)){
   const velocity=new T.Vector3().copy(part.body.linvel());velocity.y=0;
   // Look ahead around bends; bounded horizontal forces steer the ragdoll while gravity supplies descent.
   const force=direction.clone().multiplyScalar(5.5).sub(velocity).multiplyScalar(part.definition.mass*2.3).clampLength(0,part.definition.mass*12);
   part.body.addForce(force,true);
  }
  return c.t>=.98&&w.body.translation().y<.9&&w.contacts.frame.points.some(contact=>contact.normal.y>.4&&contact.force>0);
 }
}
