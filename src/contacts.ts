import R from '@dimforge/rapier3d-compat';
import * as T from 'three';
import {PhysicalRig,type PartId} from './rig';
export interface ContactPoint {part:PartId;other:R.Collider;point:T.Vector3;normal:T.Vector3;force:number;friction:number;velocity:T.Vector3}
export interface ContactFrame {points:ContactPoint[];normalLoad:number;support:T.Vector3;surfaceVelocity:T.Vector3}
export class Contacts {
  frame:ContactFrame={points:[],normalLoad:0,support:new T.Vector3(),surfaceVelocity:new T.Vector3()};
  constructor(private rig:PhysicalRig){}
  update(dt:number){
    const frame:ContactFrame={points:[],normalLoad:0,support:new T.Vector3(),surfaceVelocity:new T.Vector3()},own=new Set(Object.values(this.rig.parts).map(p=>p.body.handle));
    for(const part of Object.values(this.rig.parts))for(let c=0;c<part.body.numColliders();c++){
      const collider=part.body.collider(c);this.rig.world.contactPairsWith(collider,other=>{
        if(other.isSensor()||own.has(other.parent()?.handle??-1))return;
        this.rig.world.contactPair(collider,other,(m)=>{
          const total=Array.from({length:m.numContacts()},(_,i)=>Math.max(0,m.contactImpulse(i))).reduce((s,n)=>s+n,0)/dt;
          if(!m.numSolverContacts()||Array.from({length:m.numSolverContacts()},(_,i)=>m.solverContactDist(i)).every(d=>d>.003))return;
          const point=new T.Vector3();for(let i=0;i<m.numSolverContacts();i++)point.add(m.solverContactPoint(i)!);point.multiplyScalar(1/m.numSolverContacts());const normal=new T.Vector3().copy(m.normal());
          if(normal.dot(new T.Vector3().copy(part.body.translation()).sub(point))<0)normal.negate();
          const velocity=other.parent()?new T.Vector3().copy(other.parent()!.velocityAtPoint(point)):new T.Vector3();
          frame.points.push({part:part.definition.id,other,point,normal,force:total,friction:Math.min(collider.friction(),other.friction()),velocity});
          if(part.definition.id.startsWith('Shoe')&&normal.y>.35){const load=total*normal.y;frame.normalLoad+=load;frame.support.addScaledVector(point,load);frame.surfaceVelocity.addScaledVector(velocity,load);}
        });
      });
    }
    if(frame.normalLoad){frame.support.multiplyScalar(1/frame.normalLoad);frame.surfaceVelocity.multiplyScalar(1/frame.normalLoad);}
    this.frame=frame;return frame;
  }
  forPart(part:PartId){return this.frame.points.filter(p=>p.part===part&&p.normal.y>.35);}
}
