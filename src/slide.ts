import * as T from 'three';
import {SLIDE_LANES,laneCoordinates,type SlideLane} from './terrain';
import type {Walker} from './walker';
/** Falling off either log enters a real, low-friction chute, not a checkpoint teleport. */
export class MountainSlide {
 active:SlideLane|null=null;time=0;
 detect(w:Walker){
  if(this.active)return this.active;
  const p=w.body.translation();
  return SLIDE_LANES.find(lane=>{const c=laneCoordinates(p,lane);return c.t>=-.08&&c.t<.32&&Math.abs(c.lateral)<lane.width/2&&p.y<c.floor+1.05&&p.y>c.floor-1;})??null;
 }
 begin(w:Walker,lane:SlideLane){this.active=lane;this.time=0;w.recovery.clear();w.fall();for(const p of Object.values(w.rig.parts)){p.collider.setFriction(.025);}}
 clear(w:Walker){this.active=null;this.time=0;for(const p of Object.values(w.rig.parts))p.collider.setFriction(p.definition.id.startsWith('Shoe')?.9:.6);}
 step(w:Walker,dt:number){
  if(!this.active)return false;this.time+=dt;
  const lane=this.active,c=laneCoordinates(w.body.translation(),lane),direction=new T.Vector3(lane.end.x-lane.start.x,0,lane.end.z-lane.start.z).normalize(),side=new T.Vector3(-direction.z,0,direction.x);
  for(const part of Object.values(w.rig.parts)){
   const velocity=new T.Vector3().copy(part.body.linvel()),lateral=velocity.dot(side),speed=velocity.dot(direction);
   // Bounded horizontal guidance holds the ragdoll in the physical gutter. Gravity supplies descent.
   const force=direction.clone().multiplyScalar(Math.max(0,6-speed)*part.definition.mass*1.2).addScaledVector(side,(-c.lateral*3-lateral*2)*part.definition.mass).clampLength(0,part.definition.mass*12);
   part.body.addForce(force,true);
  }
  return c.t>=.98&&w.body.translation().y<.9&&w.contacts.frame.points.some(contact=>contact.normal.y>.4&&contact.force>0);
 }
}
