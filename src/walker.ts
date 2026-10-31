import * as T from 'three';
import R from '@dimforge/rapier3d-compat';
import {clamp,type FootId,type Point} from './model';
import {PhysicalRig,RIG,ROOT_HEIGHT,LEG_LENGTH,FOOT_HEIGHT,ANKLE_Y,PHYSICS_DT,GROUP,legPose,type PartId} from './rig';
import {Contacts} from './contacts';
import {LeanControl,type LeanAxes} from './lean';
import {Recovery} from './recovery';
import {SWING,CAREFUL_SWING,swingPhases,swingClearance,smoothPhase} from './swing';
export type Landing='valid'|'air'|'far'|'blocked';
export interface Foot {pos:T.Vector3;target:T.Vector3;body:R.RigidBody;grounded:boolean;lifted:boolean;origin:T.Vector3;velocity:T.Vector3;previous:T.Vector3;rendered:T.Vector3;normal:T.Vector3;heading:number;load:number;planting:Point|null;swingTime:number;lowerTime:number;landingAge:number;prepareTime:number;ready:boolean;stance:T.Vector3}
export interface Footfall {id:FootId;position:Point;speed:number;moved:boolean}
const ids:FootId[]=['left','right'],v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),q=()=>new T.Quaternion(),partId=(id:FootId,prefix:string)=>`${prefix}_${id==='left'?'L':'R'}` as PartId;
export const CONTROLLER={lateral:0,sagittal:0,hipFeedback:0};
export class Walker {
  assistedLoad=0;private assistedFeet:Record<FootId,number>={left:0,right:0};
  private patches={} as Record<FootId,R.SphericalImpulseJoint>;
  readonly rig:PhysicalRig;readonly contacts:Contacts;readonly body:R.RigidBody;readonly feet:Record<FootId,Foot>;readonly lean=new LeanControl();readonly recovery:Recovery;
  fallen=false;unstable=0;fallTime=0;balance=1;landing:Landing='valid';facing=0;panic=0;motionTime=0;
  private carefulStep=false;private logStep=false;private downContact=0;private footfalls:Footfall[]=[];private turnTarget:number|null=null;
  get previous(){return this.rig.parts.Pelvis.previous;}get rendered(){return this.rig.parts.Pelvis.rendered;}get previousRotation(){return this.rig.parts.Pelvis.previousQ;}get renderedRotation(){return this.rig.parts.Pelvis.renderedQ;}
  constructor(readonly physics:R.World){
    this.rig=new PhysicalRig(physics);this.body=this.rig.parts.Pelvis.body;this.contacts=new Contacts(this.rig);
    const make=(id:FootId):Foot=>{const b=this.rig.parts[partId(id,'Shoe')].body,p=v().copy(b.translation());p.y-=FOOT_HEIGHT;return {pos:p,target:p.clone(),body:b,grounded:false,lifted:false,origin:p.clone(),velocity:v(),previous:p.clone(),rendered:p.clone(),normal:v(0,1,0),heading:0,load:0,planting:null,swingTime:0,lowerTime:0,landingAge:1,prepareTime:0,ready:false,stance:p.clone()};};
    this.feet={left:make('left'),right:make('right')};this.recovery=new Recovery(this);
    const groundReference=physics.createRigidBody(R.RigidBodyDesc.fixed());
    for(const id of ids){const j=physics.createImpulseJoint(R.JointData.generic(v(),v(),v(1,0,0),0 as R.JointAxesMask),groundReference,this.feet[id].body,true);this.patches[id]=new R.SphericalImpulseJoint(physics.impulseJoints.raw,physics.bodies,j.handle);}
  }
  ground(x:number,z:number,top:number,depth=2.3){
    const own=new Set(Object.values(this.rig.parts).map(p=>p.body.handle));
    const hit=this.physics.castRayAndGetNormal(new R.Ray({x,y:top,z},{x:0,y:-1,z:0}),depth,true,undefined,GROUP.person,undefined,undefined,c=>!c.isSensor()&&!own.has(c.parent()?.handle??-1));
    return hit&&hit.normal.y>.3?{x,y:top-hit.timeOfImpact,z,normal:hit.normal,collider:hit.collider}:null;
  }
  reset(p:Point,facing=0){this.recovery.clear();this.lean.clear();this.rig.reset(p,facing);this.fallen=false;this.downContact=this.unstable=this.fallTime=this.panic=this.motionTime=0;this.balance=1;this.facing=facing;this.turnTarget=null;this.footfalls=[];
    for(const f of Object.values(this.feet)){f.pos.copy(f.body.translation());f.pos.y-=FOOT_HEIGHT;f.target.copy(f.pos);f.origin.copy(f.pos);f.stance.copy(f.pos);f.previous.copy(f.pos);f.rendered.copy(f.pos);f.velocity.set(0,0,0);f.grounded=false;f.lifted=false;f.load=0;f.planting=null;f.swingTime=0;f.lowerTime=0;f.prepareTime=0;f.ready=false;f.landingAge=1;f.heading=0;}
    this.contacts.frame.points=[];this.contacts.frame.normalLoad=0;
  }
  lift(id:FootId){if(this.fallen)return;const f=this.feet[id];f.lifted=true;f.origin.copy(f.pos);f.target.copy(f.pos);f.planting=null;f.swingTime=0;f.lowerTime=0;f.prepareTime=0;f.ready=false;}
  moveTarget(id:FootId,delta:{x:number;z:number},yaw:number){if(this.fallen||!this.feet[id].lifted)return;const f=this.feet[id],dx=Math.cos(yaw)*delta.x-Math.sin(yaw)*delta.z,dz=-Math.sin(yaw)*delta.x-Math.cos(yaw)*delta.z;f.target.x+=dx;f.target.z+=dz;
    const b=this.body.translation(),d=v(f.target.x-b.x,0,f.target.z-b.z);if(d.length()>.85){d.setLength(.85);f.target.x=b.x+d.x;f.target.z=b.z+d.z;}this.landing=this.assess(f).status;
  }
  assess(f:Foot):{status:Landing;ground:Point|null}{
    const b=this.body.translation(),g=this.ground(f.target.x,f.target.z,b.y+.35,2),side=f===this.feet.left?-.13:.13,hip=v(side,-.065,0).applyQuaternion(q().copy(this.body.rotation())).add(b);
    if(!g)return {status:'air',ground:null};if(hip.distanceTo(v(g.x,g.y+ANKLE_Y,g.z+.04))>LEG_LENGTH*2+.035)return {status:'far',ground:g};
    const start=v().copy(f.body.translation()).add(v(0,.12,0)),end=v(g.x,Math.max(g.y,f.origin.y)+.22,g.z),movement=end.sub(start),length=movement.length();
    const hit=length>.01?this.physics.castShape(start,q(),movement.clone().normalize(),new R.Ball(.055),0,length,false,undefined,GROUP.person,undefined,undefined,c=>!Object.values(this.rig.parts).some(p=>p.body.handle===c.parent()?.handle)):null;
    if(hit&&hit.time_of_impact<length-.08)return {status:'blocked',ground:g};return {status:'valid',ground:g};
  }
  // Release must finish landing even before take-off was ready; otherwise both feet can wait on each other.
  land(id:FootId){const f=this.feet[id];if(this.fallen||!f.lifted)return false;const a=this.assess(f);f.lifted=false;f.ready=true;f.planting=a.ground?{...a.ground}:{x:f.target.x,y:f.origin.y-.6,z:f.target.z};return a.status==='valid';}
  cancelSwing(){if(this.fallen)return;for(const id of ids)if(this.feet[id].lifted)this.land(id);}
  drainFootfalls(){const out=this.footfalls;this.footfalls=[];return out;}
  releaseFallJoints(){} // Anatomical joints persist in every state.
  completeRecovery(){this.fallen=false;this.downContact=this.fallTime=this.panic=0;this.turnTarget=null;this.lean.clear();for(const f of Object.values(this.feet)){f.lifted=false;f.planting=null;f.target.copy(f.pos);f.origin.copy(f.pos);f.stance.copy(f.pos);f.stance.y=this.ground(f.pos.x,f.pos.z,f.pos.y+.2,.4)?.y??f.pos.y;}}
  fall(_support?:T.Vector3){this.fallen=true;this.fallTime=0;this.turnTarget=null;this.lean.clear();for(const f of Object.values(this.feet)){f.lifted=false;f.planting=null;}}
  canStand(){const speed=v().copy(this.body.linvel()).length(),angular=v().copy(this.body.angvel()).length();return this.fallen&&this.fallTime>.8&&speed<.6&&angular<1.2&&this.contacts.frame.points.some(c=>c.normal.y>.35);}
  simulate(dt=PHYSICS_DT,input:LeanAxes={x:0,z:0}){this.physics.timestep=dt;this.step(dt,input);this.physics.step(undefined,this.rig.hooks);this.postStep(dt);}
  private needsCarefulStep(){
    const b=this.body.translation(),feet=Object.values(this.feet);
    const ahead=this.ground(b.x-Math.sin(this.facing)*.45,b.z-Math.cos(this.facing)*.45,b.y+.4,2);
    const underneath=feet.map(f=>this.ground(f.pos.x,f.pos.z,f.pos.y+.15,.5));
    const targets=feet.map(f=>f.lifted||f.planting?this.ground(f.target.x,f.target.z,b.y+.4,2):null);
    const samples=[ahead,...underneath,...targets];
    this.logStep=samples.some(g=>g?.collider.shape instanceof R.Cylinder);
    if(this.logStep||samples.some(g=>g?.collider.shape instanceof R.Cuboid&&g.collider.shape.halfExtents.x<1))return true;
    if((ahead?.y??-Infinity)>Math.min(this.feet.left.stance.y,this.feet.right.stance.y)+.035)return true;
    return Math.abs(this.feet.left.stance.y-this.feet.right.stance.y)>.04||targets.some((g,i)=>(g?.y??feet[i].origin.y)>feet[i].origin.y+.04);
  }
  step(dt:number,input:LeanAxes={x:0,z:0}){
    // Keep following a landed step instead of stopping after one small yaw correction.
    // The shared heading drives the pelvis, torso, head and feet through their motors.
    if(this.turnTarget!==null&&!this.fallen&&!this.recovery.active&&ids.some(id=>this.feet[id].grounded)){
      const angle=Math.atan2(Math.sin(this.turnTarget-this.facing),Math.cos(this.turnTarget-this.facing)),turn=clamp(angle,-dt*1.5,dt*1.5);
      this.facing=Math.atan2(Math.sin(this.facing+turn),Math.cos(this.facing+turn));
      if(Math.abs(angle)<=dt*1.5)this.turnTarget=null;
    }
    const priorLoads={...this.assistedFeet};this.assistedLoad=0;this.assistedFeet.left=this.assistedFeet.right=0;this.motionTime+=dt;this.carefulStep=this.needsCarefulStep();this.rig.dt=dt;this.rig.legMotorSpeed=this.carefulStep||this.recovery.active||this.fallen?1.5:2.5;this.rig.beforeStep();this.lean.update(this.fallen?{x:0,z:0}:input,dt,this.facing);
    // The balance helper transmits part of the load directly to the supporting surface.
    // Supply only that missing share of Coulomb friction at the real shoe contact.
    // These velocity motors have finite force, no positional anchor, and no normal-axis lock.
    for(const id of ids){
      const f=this.feet[id],patch=this.patches[id],contact=this.contacts.forPart(partId(id,'Shoe')).find(c=>!c.other.parent()||c.other.parent()!.isFixed());
      const virtualLoad=contact&&!this.fallen&&!(f.ready&&(f.lifted||f.planting))?priorLoads[id]:0,normalLoad=(contact?.force??0)+virtualLoad;
      if(contact){patch.setAnchor1(contact.point);patch.setAnchor2(contact.point.clone().sub(f.body.translation()).applyQuaternion(q().copy(f.body.rotation()).invert()));}
      for(const axis of [R.JointAxis.LinX,R.JointAxis.LinZ]){patch.configureMotorModel(axis,R.MotorModel.ForceBased);patch.configureMotorVelocity(axis,0,1000);patch.setMotorMaxForce(axis,virtualLoad*(contact?.friction??0)/Math.SQRT2);}
      for(const [axis,k]of [[R.JointAxis.AngX,.1],[R.JointAxis.AngY,.02],[R.JointAxis.AngZ,.045]]as const){patch.configureMotorModel(axis,R.MotorModel.ForceBased);patch.configureMotorPosition(axis,axis===R.JointAxis.AngY?this.facing:0,2000,100);patch.setMotorMaxForce(axis,virtualLoad*k+(this.fallen?0:(contact?.force??0)*.005));}
    }    for(const id of ids){const f=this.feet[id];f.previous.copy(f.pos);if(f.lifted||f.planting){f.prepareTime+=dt;const other=this.feet[id==='left'?'right':'left'],com=this.rig.centerOfMass(),capture=com.position.clone().addScaledVector(com.velocity,.3);const lateral=Math.cos(this.facing)*(capture.x-other.pos.x)-Math.sin(this.facing)*(capture.z-other.pos.z),forward=Math.sin(this.facing)*(capture.x-other.pos.x)+Math.cos(this.facing)*(capture.z-other.pos.z);if(other.grounded&&(Math.abs(lateral)<(this.carefulStep?.05:.065)||f.prepareTime>(this.carefulStep?1.5:.65)&&Math.abs(lateral)<.12)||!f.grounded&&f.pos.y-(this.ground(f.pos.x,f.pos.z,f.pos.y+.2,.6)?.y??f.pos.y)>.04)f.ready=true;if(f.ready){f.swingTime+=dt;if(!f.lifted&&(!this.carefulStep||f.swingTime>=CAREFUL_SWING.raiseSeconds+CAREFUL_SWING.travelSeconds&&(Math.hypot(f.pos.x-f.target.x,f.pos.z-f.target.z)<.09||f.swingTime>1.5)))f.lowerTime+=dt;}}f.landingAge+=dt;}
    if(this.recovery.active){this.recovery.step(dt);this.rig.flushTorques();return;}
    if(this.fallen){this.fallTime+=dt;this.relax();this.rig.flushTorques();return;}
    this.control(dt);this.rig.flushTorques();
  }
  private relax(){for(const j of this.rig.joints){const parent=this.rig.parts[j.definition.parent].body,child=this.rig.parts[j.definition.child].body;this.rig.drive(j.definition.child,q().copy(parent.rotation()).invert().multiply(q().copy(child.rotation())),0);}}
  control(_dt:number,recovery?:{height:number;fold:number;chest:number}){
    if(!this.rig.enabled){this.relax();return;}
    const b=v().copy(this.body.translation()),com=this.rig.centerOfMass(),yaw=q().setFromAxisAngle(v(0,1,0),this.facing),center=v(),surfaceVel=v();let total=0,floor=0;
    const weights=ids.map(id=>{const f=this.feet[id],other=this.feet[id==='left'?'right':'left'];return f.grounded?((f.lifted||f.planting)?f.ready?0:other.grounded?Math.max(.1,1-f.prepareTime/.35):1:clamp(f.landingAge/.35,.08,1)):0;});
    for(let i=0;i<2;i++){const f=this.feet[ids[i]],weight=weights[i];if(!weight)continue;const c=this.contacts.forPart(partId(ids[i],'Shoe'))[0];center.addScaledVector(f.pos,weight);floor+=(c?.point.y??f.stance.y)*weight;total+=weight;if(c)surfaceVel.addScaledVector(c.velocity,weight);}
    if(total){center.multiplyScalar(1/total);floor/=total;surfaceVel.multiplyScalar(1/total);}else{center.copy(com.position);floor=Math.min(...Object.values(this.feet).map(f=>f.pos.y));}
    if(recovery){center.copy(this.recovery.anchor);center.add(v(Math.sin(this.facing),0,Math.cos(this.facing)).multiplyScalar(recovery.fold*.38));floor=this.recovery.anchor.y;}
    const active=ids.find(id=>this.feet[id].lifted||this.feet[id].planting),goal=center.clone().add(this.lean.offset);
    if(active){const f=this.feet[active];if(f.planting&&f.ready){goal.x=T.MathUtils.lerp(goal.x,f.target.x,.5);goal.z=T.MathUtils.lerp(goal.z,f.target.z,.5);}}
    const velocity=com.velocity.clone().sub(surfaceVel),capture=com.position.clone().addScaledVector(velocity,.18),error=capture.clone().sub(goal),localError=error.clone().applyQuaternion(yaw.clone().invert());
    this.balance=clamp(1-Math.hypot(error.x,error.z)/.4,0,1);this.panic=T.MathUtils.lerp(this.panic,clamp((Math.hypot(error.x,error.z)-.08)/.25,0,1),.07);
    const height=recovery?.height??ROOT_HEIGHT-(active?.07:.03),targetRoot=v(goal.x-(com.position.x-b.x),floor+height,goal.z-(com.position.z-b.z));
    if(recovery)targetRoot.set(center.x,floor+height,center.z);
    const chest=yaw.clone().multiply(q().setFromEuler(new T.Euler(recovery?.chest??this.lean.tilt.x,0,this.lean.tilt.y)));
    this.rig.drive('Torso',q().copy(this.body.rotation()).invert().multiply(chest),recovery?.12:1);this.rig.drive('Head',q().copy(this.rig.parts.Torso.body.rotation()).invert().multiply(yaw),.8);
    
    for(const j of this.rig.joints)this.rig.pairTorque(j.definition.child,this.rig.gravityCompensation(j.definition.child));
    for(const [side,s] of [[-1,'L'],[1,'R']] as const){
      const id:FootId=side<0?'left':'right',f=this.feet[id],hip=v(side*.13,-.065,0).applyQuaternion(q().copy(this.body.rotation())).add(b),ankle=f.stance.clone().add(v(0,ANKLE_Y,.04));
      if(f.lifted||f.planting||recovery){
        const g=this.ground(f.target.x,f.target.z,b.y+.4,2),phase=swingPhases(f.swingTime,f.lowerTime,this.carefulStep),travel=f.ready?phase.travel:0;
        // Flat ground overlaps knee lift and aiming; narrow or raised ground keeps knee-first clearance.
        const tuck=f.ready?(this.carefulStep?CAREFUL_SWING.tuckForward:SWING.tuckForward)*phase.raise*(1-travel):0,arc=side*.12*Math.sin(Math.PI*travel),base=Math.max(f.origin.y,g?.y??f.origin.y);
        const soleHeight=T.MathUtils.lerp(base+(this.carefulStep?(this.logStep?.24:CAREFUL_SWING.lift):swingClearance(Math.hypot(f.target.x-f.origin.x,f.target.z-f.origin.z),(g?.y??f.origin.y)-f.origin.y))*(f.ready?phase.raise:0),g?.y??f.origin.y-.6,this.carefulStep?phase.lower:phase.lower*smoothPhase(1-Math.hypot(f.pos.x-f.target.x,f.pos.z-f.target.z)/.4));
        ankle.set(T.MathUtils.lerp(f.origin.x,f.target.x,travel)-Math.sin(this.facing)*tuck+Math.cos(this.facing)*arc,soleHeight+ANKLE_Y,T.MathUtils.lerp(f.origin.z,f.target.z,travel)-Math.cos(this.facing)*tuck-Math.sin(this.facing)*arc+.04);        if(recovery)ankle.copy(v(side*.14,ANKLE_Y,.04).applyQuaternion(yaw).add(this.recovery.anchor));
      }      if(recovery||(f.lifted||f.planting)&&f.ready){const centerGoal=ankle.clone().add(recovery?v(0,-.065,-.04).applyQuaternion(yaw):v(0,-.065,-.04)),actual=v().copy(f.body.translation()),force=centerGoal.sub(actual).multiplyScalar(1000).addScaledVector(v().copy(f.body.linvel()),-85).clampLength(0,180);f.body.addForceAtPoint(force,actual,true);this.body.addForceAtPoint(force.clone().negate(),actual,true);}      const desiredHip=(f.lifted||f.planting)&&f.ready?hip:targetRoot.clone().add(v(side*.13,-.065,0).applyQuaternion(yaw)),pose=legPose(desiredHip,ankle,this.facing),hipRelative=q().copy(this.body.rotation()).invert().multiply(pose.thigh),kneeRelative=pose.thigh.clone().invert().multiply(pose.shin),ankleRelative=pose.shin.clone().invert().multiply(yaw);
      if(!f.lifted&&!f.planting&&total){const tilt=new T.Euler().setFromQuaternion(yaw.clone().invert().multiply(q().copy(this.body.rotation())),'XYZ');hipRelative.multiply(q().setFromEuler(new T.Euler(clamp(tilt.x*CONTROLLER.hipFeedback,-.5,.5),clamp(tilt.y,-.4,.4),clamp(tilt.z*CONTROLLER.hipFeedback,-.5,.5))));}
      if(!f.lifted&&!f.planting&&total)ankleRelative.multiply(q().setFromEuler(new T.Euler(clamp(localError.z*CONTROLLER.sagittal,-.32,.28),0,clamp(-localError.x*CONTROLLER.lateral,-.28,.28))));
      const strength=recovery?.12:(f.lifted||f.planting)&&f.ready?.7:clamp(.2+f.landingAge/.4,.2,1);this.rig.drive(`Thigh_${s}`,hipRelative,strength);this.rig.drive(`Shin_${s}`,kneeRelative,strength);this.rig.drive(`Shoe_${s}`,ankleRelative,strength);
      const armSwing=this.panic*Math.sin(this.motionTime*9+side)*.6;
      this.rig.drive(`Shoulder_${s}`,q().setFromEuler(new T.Euler(recovery?-recovery.chest:armSwing,0,side*(recovery?.2:.12+this.panic*.5))),.6);this.rig.drive(`Elbow_${s}`,q().setFromEuler(new T.Euler(recovery?.08:.15+this.panic*.6,0,0)),.6);this.rig.drive(`Hand_${s}`,q(),.5);
    }
    const stance=ids.filter(id=>this.feet[id].grounded&&!(this.feet[id].ready&&(this.feet[id].lifted||this.feet[id].planting)));
    const supportContacts=recovery?this.contacts.frame.points.filter(c=>c.normal.y>.35):stance.flatMap(id=>this.contacts.forPart(partId(id,'Shoe')));
    if(supportContacts.length){
      const damping=velocity.clone().multiplyScalar(220);if(active&&!this.carefulStep){const direction=v(this.feet[active].target.x-this.feet[active].origin.x,0,this.feet[active].target.z-this.feet[active].origin.z).normalize();const along=velocity.dot(direction);if(along>0)damping.addScaledVector(direction,-along*50);}const force=v((targetRoot.x-b.x)*700-damping.x,52.4*9.81+(targetRoot.y-b.y)*3000-velocity.y*500,(targetRoot.z-b.z)*700-damping.z);force.y=clamp(force.y,0,1400);const friction=Math.min(...supportContacts.map(c=>c.friction)),horizontal=v(force.x,0,force.z).clampLength(0,force.y*friction);force.x=horizontal.x;force.z=horizontal.z;
      const error=yaw.clone().multiply(q().copy(this.body.rotation()).invert());if(error.w<0)error.set(-error.x,-error.y,-error.z,-error.w);const torque=v(error.x,error.y,error.z).multiplyScalar(recovery?2000:1000).addScaledVector(v().copy(this.body.angvel()),-15).clampLength(0,recovery?300:200);
      this.body.addForce(force,true);this.body.addTorque(torque,true);
      this.assistedLoad=force.y;for(const id of stance)this.assistedFeet[id]=force.y/stance.length;
      for(const c of supportContacts){const ground=c.other.parent();if(ground?.isDynamic()){ground.addForceAtPoint(force.clone().multiplyScalar(-1/supportContacts.length),b,true);ground.addTorque(torque.clone().multiplyScalar(-1/supportContacts.length),true);}}
    }
  }  postStep(dt:number){
    this.contacts.update(dt);
    for(const id of ids){const f=this.feet[id],was=f.grounded,contacts=this.contacts.forPart(partId(id,'Shoe'));f.pos.copy(f.body.translation());f.pos.y-=FOOT_HEIGHT;f.velocity.copy(f.body.linvel());f.grounded=contacts.length>0;f.load=clamp(contacts.reduce((s,c)=>s+c.force*c.normal.y,0)/(80*9.81/2),0,1);if(contacts.length)f.normal.copy(contacts[0].normal);
      f.load=clamp(f.load+this.assistedFeet[id]/(RIG.mass*9.81/2),0,1);
      if(f.grounded&&!f.lifted&&!f.planting){const velocity=contacts[0]?.velocity;if(velocity)f.stance.addScaledVector(velocity,dt);}
      if(f.grounded&&!f.lifted&&f.planting&&f.lowerTime>=(this.carefulStep?CAREFUL_SWING.lowerSeconds:SWING.lowerSeconds)*.8&&!this.fallen&&!this.recovery.active&&(Math.hypot(f.pos.x-f.target.x,f.pos.z-f.target.z)<.08||f.prepareTime>2)){const moved=Math.hypot(f.target.x-f.origin.x,f.target.z-f.origin.z)>.05&&Math.hypot(f.pos.x-f.origin.x,f.pos.z-f.origin.z)>.05;if(moved){this.footfalls.push({id,position:{...f.pos},speed:Math.abs(f.velocity.y),moved});let angle=Math.atan2(f.origin.x-f.target.x,f.origin.z-f.target.z)-this.facing;angle=Math.atan2(Math.sin(angle),Math.cos(angle));if(Math.abs(angle)>Math.PI/2)angle-=Math.sign(angle)*Math.PI;this.turnTarget=this.facing+angle;}f.stance.copy(f.pos);f.stance.y=contacts[0]?.point.y??f.pos.y;f.planting=null;f.landingAge=0;}
    }
    const down=this.contacts.frame.points.some(c=>['Torso','Head','Pelvis'].includes(c.part)&&c.normal.y>.35&&c.force>20);
    if(!this.recovery.active&&!this.fallen){this.downContact=down?this.downContact+dt:0;if(this.downContact>.12)this.fall();}
  }
  interpolate(alpha:number){this.rig.interpolate(alpha);for(const id of ids){const f=this.feet[id];f.rendered.lerpVectors(f.previous,f.pos,alpha);}}
}
