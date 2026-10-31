import * as T from 'three';
import R from '@dimforge/rapier3d-compat';
import type {Walker,Footfall} from './walker';
import type {LeanAxes} from './lean';
import type {FootId} from './model';
import {ANKLE_Y,FOOT_HEIGHT,GROUP,LEG_LENGTH,ROOT_HEIGHT,RIG,legPose,type PartId} from './rig';

const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const BODY_RADIUS=.24,BODY_HALF_HEIGHT=.65,CENTER_HEIGHT=BODY_RADIUS+BODY_HALF_HEIGHT;
export const NORMAL_WALK_SPEED=1.65;
export const NORMAL_JUMP_SPEED=4.2;

/** Learned walking uses collision-constrained movement and a continuous alternating gait. */
export class NormalWalk {
  unlocked=false;active=false;grounded=false;
  readonly body:R.RigidBody;
  readonly collider:R.Collider;
  readonly controller:R.KinematicCharacterController;
  readonly velocity=new T.Vector3();
  private readonly ownColliders:Set<number>;
  private footfalls:Footfall[]=[];
  private phase=0;private stride=0;private stepDistance=0;private nextFoot:FootId='left';
  private fallStart:number|null=null;
  private previousCenter=new T.Vector3();
  private lastMove=new T.Vector3();

  constructor(readonly walker:Walker){
    const world=walker.physics;
    this.body=world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
    this.collider=world.createCollider(R.ColliderDesc.capsule(BODY_HALF_HEIGHT,BODY_RADIUS).setCollisionGroups(GROUP.person).setFriction(.8).setEnabled(false),this.body);
    this.controller=world.createCharacterController(.012);
    this.controller.enableAutostep(.28,.18,true);
    this.controller.enableSnapToGround(.28);
    this.controller.setMaxSlopeClimbAngle(Math.PI*.25);
    this.controller.setMinSlopeSlideAngle(Math.PI*.28);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(RIG.mass);
    this.ownColliders=new Set(Object.values(walker.rig.parts).flatMap(p=>Array.from({length:p.body.numColliders()},(_,i)=>p.body.collider(i).handle)));
    this.ownColliders.add(this.collider.handle);
  }

  // The KCC borrows the collider set mutably while applying impulses. Only inspect handles
  // in this callback: querying parent()/isSensor() would recursively borrow the WASM set.
  private obstacle=(collider:R.Collider)=>!this.ownColliders.has(collider.handle);
  private floor(x:number,z:number,top:number,depth:number){
    const hit=this.walker.physics.castRayAndGetNormal(new R.Ray({x,y:top,z},{x:0,y:-1,z:0}),depth,true,R.QueryFilterFlags.EXCLUDE_SENSORS,GROUP.person,undefined,undefined,this.obstacle);
    return hit&&hit.normal.y>.35?{y:top-hit.timeOfImpact,collider:hit.collider}:null;
  }
  setUnlocked(value:boolean){this.unlocked=value;if(!value){this.velocity.set(0,0,0);this.deactivate();}}
  /** Immediate take-off: there is no buffered jump to fire after landing or resuming. */
  jump(){
    if(!this.unlocked||!this.active||!this.grounded||this.walker.fallen||this.walker.recovery.active)return false;
    this.velocity.y=NORMAL_JUMP_SPEED;this.grounded=false;
    // Measure dangerous drops below the launch surface, never below the jump's apex.
    this.fallStart=this.body.translation().y;this.stepDistance=0;
    for(const foot of Object.values(this.walker.feet)){foot.grounded=false;foot.load=0;}
    return true;
  }
  activate(){
    if(this.active||!this.unlocked||this.walker.fallen)return;
    const w=this.walker,p=w.body.translation();
    w.cancelSwing();w.recovery.clear();w.lean.clear();
    this.velocity.set(0,0,0);this.phase=this.stride=this.stepDistance=0;this.fallStart=null;
    const floor=this.floor(p.x,p.z,p.y,.99+.35),height=floor&&Math.abs(p.y-floor.y-ROOT_HEIGHT)<.35?floor.y:p.y-ROOT_HEIGHT;
    this.body.setTranslation({x:p.x,y:height+CENTER_HEIGHT+.014,z:p.z},true);
    this.body.setNextKinematicTranslation(this.body.translation());this.collider.setEnabled(true);
    for(const part of Object.values(w.rig.parts)){
      part.body.setBodyType(R.RigidBodyType.KinematicPositionBased,true);
      part.body.setLinvel(v(),true);part.body.setAngvel(v(),true);part.body.resetForces(true);part.body.resetTorques(true);
      // Keep colliders registered while the puppet is kinematic. Disabling every
      // collider can drop a reused body from Rapier's active kinematic set on restart.
      for(let i=0;i<part.body.numColliders();i++)part.body.collider(i).setCollisionGroups(0);
    }
    this.active=true;this.grounded=!!floor;w.contacts.frame.points=[];w.contacts.frame.normalLoad=0;
    this.walker.physics.propagateModifiedBodyPositionsToColliders();
  }
  deactivate(){
    if(!this.active)return;
    this.active=false;this.collider.setEnabled(false);
    for(const part of Object.values(this.walker.rig.parts)){
      part.body.setBodyType(R.RigidBodyType.Dynamic,true);
      part.body.setLinvel(this.velocity,true);part.body.setAngvel(v(),true);part.body.resetForces(true);part.body.resetTorques(true);
      for(let i=0;i<part.body.numColliders();i++)part.body.collider(i).setCollisionGroups(GROUP.person);
    }
    this.walker.contacts.frame.points=[];this.walker.contacts.frame.normalLoad=0;
    this.footfalls=[];this.clear();this.velocity.y=0;this.grounded=false;this.fallStart=null;
  }
  /** Call after a checkpoint/developer reset so the capsule follows the new physical pose. */
  reset(){this.velocity.set(0,0,0);this.deactivate();this.phase=this.stride=this.stepDistance=0;this.fallStart=null;this.footfalls=[];this.nextFoot='left';if(this.unlocked)this.activate();}
  clear(){this.velocity.x=this.velocity.z=0;this.lastMove.set(0,0,0);this.stepDistance=0;}
  drainFootfalls(){const events=this.footfalls;this.footfalls=[];return events;}

  /** Returns false when the original dynamic ragdoll should handle this physics tick. */
  step(dt:number,axes:LeanAxes,yaw:number){
    if(!this.unlocked||this.walker.fallen||this.walker.recovery.active){this.deactivate();return false;}
    this.activate();if(!this.active)return false;
    const length=Math.hypot(axes.x,axes.z),amount=Math.min(1,length),x=length>0?axes.x/length:0,z=length>0?axes.z/length:0;
    const desired=v((Math.cos(yaw)*x-Math.sin(yaw)*z)*amount*NORMAL_WALK_SPEED,0,(-Math.sin(yaw)*x-Math.cos(yaw)*z)*amount*NORMAL_WALK_SPEED);
    const delta=desired.sub(v(this.velocity.x,0,this.velocity.z)).clampLength(0,(amount?9:14)*dt);
    this.velocity.x+=delta.x;this.velocity.z+=delta.z;
    this.velocity.y=this.grounded?-.45:Math.max(-20,this.velocity.y-9.81*dt);
    if(this.grounded){this.controller.enableAutostep(.28,.18,true);this.controller.enableSnapToGround(.28);}
    else {this.controller.disableAutostep();this.controller.disableSnapToGround();}
    this.previousCenter.copy(this.body.translation());
    this.controller.computeColliderMovement(this.collider,this.velocity.clone().multiplyScalar(dt),R.QueryFilterFlags.EXCLUDE_SENSORS,GROUP.person,this.obstacle);
    const move=new T.Vector3().copy(this.controller.computedMovement()),next=this.previousCenter.clone().add(move);
    // A ceiling cancels upward speed; continuing to push upward would make the head stick.
    if(this.velocity.y>0)for(let i=0;i<this.controller.numComputedCollisions();i++){
      if((this.controller.computedCollision(i)?.normal1.y??0)<-.5){this.velocity.y=0;break;}
    }
    this.grounded=this.velocity.y<=0&&this.controller.computedGrounded();
    if(this.grounded){this.velocity.y=0;this.fallStart=null;}
    else {
      this.fallStart??=this.previousCenter.y;
      if(this.fallStart-next.y>.85){this.deactivate();this.walker.fall();return false;}
    }
    this.lastMove.copy(move);
    this.body.wakeUp();
    this.body.setNextKinematicTranslation(next);
    const distance=Math.hypot(move.x,move.z),speed=distance/Math.max(.0001,dt);
    if(speed>.04){const target=Math.atan2(-move.x,-move.z),difference=Math.atan2(Math.sin(target-this.walker.facing),Math.cos(target-this.walker.facing));this.walker.facing+=T.MathUtils.clamp(difference,-dt*9,dt*9);}
    this.stride+=(Math.min(1,speed/NORMAL_WALK_SPEED)*(this.grounded?1:0)-this.stride)*(1-Math.exp(-dt*14));
    if(this.grounded){
      this.phase+=distance/1.05*Math.PI*2;this.stepDistance+=distance;
      if(this.stepDistance>=.525){this.stepDistance-=.525;const id=this.nextFoot;this.nextFoot=id==='left'?'right':'left';this.footfalls.push({id,position:{x:next.x,y:next.y-CENTER_HEIGHT,z:next.z},speed,moved:true});}
    }
    this.pose(next);
    return true;
  }

  private pose(center:T.Vector3){
    const w=this.walker,yaw=new T.Quaternion().setFromAxisAngle(v(0,1,0),w.facing),base=center.clone().add(v(0,-CENTER_HEIGHT,0));
    const bob=this.grounded?Math.sin(this.phase*2)*.012*this.stride:0;
    const transform=(p:T.Vector3)=>p.applyQuaternion(yaw).add(base);
    const place=(id:PartId,position:T.Vector3,rotation:T.Quaternion)=>{
      const part=w.rig.parts[id];part.previous.copy(part.body.translation());part.previousQ.copy(part.body.rotation());
      part.body.wakeUp();
      part.body.setNextKinematicTranslation(position);part.body.setNextKinematicRotation(rotation);
    };
    for(const id of ['Pelvis','Torso','Head'] as const){const def=w.rig.parts[id].definition;place(id,transform(v().copy(def.position).add(v(0,bob,0))),yaw);}
    for(const [side,s,id,offset] of [[-1,'L','left',0],[1,'R','right',Math.PI]] as const){
      const phase=this.phase+offset,swing=Math.max(0,Math.cos(phase))*.13*this.stride;
      const foot=transform(v(side*.14,0,-Math.sin(phase)*.26*this.stride));
      const floor=this.grounded?this.floor(foot.x,foot.z,base.y+.45,1.0):null;
      foot.y=(floor?.y??base.y)+swing+(this.grounded?0:.07);
      const ankle=foot.clone().add(v(0,ANKLE_Y,0)),hip=transform(v(side*.13,ROOT_HEIGHT-.065+bob,0));
      // Limit visual reach on abrupt ledges without pulling the capsule through them.
      const reach=ankle.clone().sub(hip).clampLength(0,LEG_LENGTH*2-.005);ankle.copy(hip).add(reach);
      const leg=legPose(hip,ankle,w.facing);
      place(`Thigh_${s}`,hip.clone().add(leg.knee).multiplyScalar(.5),leg.thigh);
      place(`Shin_${s}`,leg.knee.clone().add(ankle).multiplyScalar(.5),leg.shin);
      place(`Shoe_${s}`,ankle.clone().add(v(0,FOOT_HEIGHT-ANKLE_Y,-.04).applyQuaternion(yaw)),yaw);
      const shoulder=transform(v(side*.245,1.43+bob,0));
      const arm=yaw.clone().multiply(new T.Quaternion().setFromAxisAngle(v(1,0,0),-Math.sin(phase)*.28*this.stride));
      const elbow=shoulder.clone().add(v(0,-.28,0).applyQuaternion(arm));
      const forearm=arm.clone().multiply(new T.Quaternion().setFromAxisAngle(v(1,0,0),.12));
      const wrist=elbow.clone().add(v(0,-.24,0).applyQuaternion(forearm));
      place(`Shoulder_${s}`,shoulder.clone().add(elbow).multiplyScalar(.5),arm);
      place(`Elbow_${s}`,elbow.clone().add(wrist).multiplyScalar(.5),forearm);
      place(`Hand_${s}`,wrist.clone().add(v(0,-.04,0).applyQuaternion(forearm)),forearm);
      const f=w.feet[id];f.previous.copy(f.pos);f.lifted=false;f.planting=null;f.ready=false;f.grounded=this.grounded&&swing<.025;f.load=f.grounded?1:0;
    }
    w.balance=1;w.landing='valid';
  }

  postStep(_dt:number){
    if(!this.active)return;
    for(const f of Object.values(this.walker.feet)){
      f.pos.copy(f.body.translation());f.pos.y-=FOOT_HEIGHT;
      f.target.copy(f.pos);f.origin.copy(f.pos);f.stance.copy(f.pos);f.velocity.copy(this.velocity);
    }
    this.walker.contacts.frame.points=[];this.walker.contacts.frame.normalLoad=this.grounded?RIG.mass*9.81:0;
  }
}
