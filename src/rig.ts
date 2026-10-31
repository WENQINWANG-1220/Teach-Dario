import R from '@dimforge/rapier3d-compat';
import * as T from 'three';
import type {Point} from './model';
export const PHYSICS_DT=1/120;
export const GROUP={terrain:0x00010006,person:0x00020007,prop:0x00040007};
export type PartId='Pelvis'|'Torso'|'Head'|'Shoulder_L'|'Elbow_L'|'Hand_L'|'Shoulder_R'|'Elbow_R'|'Hand_R'|'Thigh_L'|'Shin_L'|'Shoe_L'|'Thigh_R'|'Shin_R'|'Shoe_R';
export interface BodyDefinition {id:PartId;mass:number;size:Point;shape:'box'|'capsule'|'ball';position:Point;rotation:T.Quaternion}
export interface JointDefinition {parent:PartId;child:PartId;a:T.Vector3;b:T.Vector3;hinge?:[number,number];min:Point;max:Point;torque:number}
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),q=()=>new T.Quaternion(),rad=(a:number)=>a*Math.PI/180;
export const LEG_LENGTH=.43,FOOT_HEIGHT=.045,ANKLE_Y=.11,ROOT_HEIGHT=.99;
export function legPose(hip:T.Vector3,ankle:T.Vector3,facing:number){
  const direction=ankle.clone().sub(hip),d=T.MathUtils.clamp(direction.length(),.22,LEG_LENGTH*2-.004),axis=direction.normalize();
  const knee=hip.clone().addScaledVector(axis,d/2),pole=v(-Math.sin(facing),0,-Math.cos(facing));pole.addScaledVector(axis,-pole.dot(axis)).normalize();
  knee.addScaledVector(pole,Math.sqrt(Math.max(0,LEG_LENGTH**2-d*d/4)));
  const hinge=axis.clone().cross(pole).normalize();
  const rotation=(a:T.Vector3,b:T.Vector3)=>{const up=a.clone().sub(b).normalize(),z=hinge.clone().cross(up).normalize();return q().setFromRotationMatrix(new T.Matrix4().makeBasis(hinge,up,z));};
  return {knee,thigh:rotation(hip,knee),shin:rotation(knee,ankle)};
}
export function createRigDefinition(){
  const bodies:BodyDefinition[]=[],joints:JointDefinition[]=[];
  const body=(id:PartId,mass:number,shape:BodyDefinition['shape'],size:Point,position:T.Vector3,rotation=q())=>{bodies.push({id,mass,shape,size,position,rotation});};
  const joint=(parent:PartId,child:PartId,point:T.Vector3,torque:number,min:Point,max:Point,hinge?:[number,number])=>{
    const a=bodies.find(b=>b.id===parent)!,b=bodies.find(b=>b.id===child)!;
    joints.push({parent,child,a:point.clone().sub(a.position).applyQuaternion(a.rotation.clone().invert()),b:point.clone().sub(b.position).applyQuaternion(b.rotation.clone().invert()),torque,min,max,hinge});
  };
  body('Pelvis',14,'box',v(.34,.23,.23),v(0,ROOT_HEIGHT,0));
  body('Torso',26,'capsule',v(.18,.58,.18),v(0,1.29,0));body('Head',5,'ball',v(.12,.12,.12),v(0,1.64,-.012));
  joint('Pelvis','Torso',v(0,1.09,0),150,v(rad(-45),rad(-35),rad(-25)),v(rad(25),rad(35),rad(25)));
  joint('Torso','Head',v(0,1.52,0),25,v(rad(-40),rad(-60),rad(-35)),v(rad(50),rad(60),rad(35)));
  for(const [side,s] of [[-1,'L'],[1,'R']] as const){
    const upper=`Shoulder_${s}` as PartId,lower=`Elbow_${s}` as PartId,hand=`Hand_${s}` as PartId,thigh=`Thigh_${s}` as PartId,shin=`Shin_${s}` as PartId,foot=`Shoe_${s}` as PartId;
    body(upper,2,'capsule',v(.055,.28,.055),v(side*.245,1.29,0));body(lower,1.3,'capsule',v(.045,.24,.045),v(side*.245,1.03,0));body(hand,.4,'ball',v(.052,.052,.052),v(side*.245,.87,0));
    joint('Torso',upper,v(side*.245,1.43,0),60,v(rad(-45),rad(-70),rad(-150)),v(rad(150),rad(70),rad(150)));
    joint(upper,lower,v(side*.245,1.15,0),40,v(0,0,0),v(rad(145),0,0),[0,rad(145)]);
    joint(lower,hand,v(side*.245,.91,0),15,v(rad(-60),rad(-25),rad(-25)),v(rad(60),rad(25),rad(25)));
    const hip=v(side*.13,ROOT_HEIGHT-.065,0),ankle=v(side*.14,ANKLE_Y,0),pose=legPose(hip,ankle,0);
    body(thigh,8,'capsule',v(.085,LEG_LENGTH,.085),hip.clone().add(pose.knee).multiplyScalar(.5),pose.thigh);
    body(shin,4.5,'capsule',v(.065,LEG_LENGTH,.065),ankle.clone().add(pose.knee).multiplyScalar(.5),pose.shin);
    body(foot,1.3,'box',v(.13,FOOT_HEIGHT*2,.29),v(side*.14,FOOT_HEIGHT,-.04));
    joint('Pelvis',thigh,hip,250,v(rad(-25),rad(-30),rad(-40)),v(rad(110),rad(30),rad(40)));
    joint(thigh,shin,pose.knee,220,v(rad(-135),0,0),v(0,0,0),[rad(-135),0]);
    joint(shin,foot,ankle,150,v(rad(-50),rad(-15),rad(-25)),v(rad(50),rad(15),rad(25)));
  }
  return {bodies,joints,mass:bodies.reduce((s,b)=>s+b.mass,0)};
}
export const RIG=createRigDefinition();
export interface RigPart {definition:BodyDefinition;body:R.RigidBody;collider:R.Collider;previous:T.Vector3;rendered:T.Vector3;previousQ:T.Quaternion;renderedQ:T.Quaternion}
export class PhysicalRig {
  readonly parts={} as Record<PartId,RigPart>;readonly joints:{definition:JointDefinition;joint:R.ImpulseJoint}[]=[];
  enabled=true;
  dt=PHYSICS_DT;legMotorSpeed=1.5;
  private torques=new Map<PartId,T.Vector3>();private targets=new Map<PartId,{angle:T.Vector3;strength:number}>();
  private motorAngles=new Map<PartId,T.Vector3>();
  constructor(readonly world:R.World){
    world.numSolverIterations=16;world.integrationParameters.numInternalPgsIterations=4;
    for(const d of RIG.bodies){
      const rb=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(d.position.x,d.position.y,d.position.z).setRotation(d.rotation).setCcdEnabled(true).setLinearDamping(.01).setAngularDamping(.01).setAdditionalSolverIterations(4));
      const shape=d.shape==='box'?R.ColliderDesc.cuboid(d.size.x/2,d.size.y/2,d.size.z/2):d.shape==='ball'?R.ColliderDesc.ball(d.size.x):R.ColliderDesc.capsule(Math.max(.01,d.size.y/2-d.size.x),d.size.x);
      const collider=world.createCollider(shape.setMass(d.id==='Torso'?21:d.mass).setFriction(d.id.startsWith('Shoe')?.9:.6).setFrictionCombineRule(R.CoefficientCombineRule.Min).setRestitution(.02).setCollisionGroups(GROUP.person).setActiveHooks(R.ActiveHooks.FILTER_CONTACT_PAIRS),rb);
      if(d.id==='Torso')world.createCollider(R.ColliderDesc.cuboid(.14,.18,.075).setTranslation(0,-.01,.23).setMass(5).setFriction(.6).setRestitution(.02).setCollisionGroups(GROUP.person).setActiveHooks(R.ActiveHooks.FILTER_CONTACT_PAIRS),rb);
      this.parts[d.id]={definition:d,body:rb,collider,previous:v().copy(d.position),rendered:v().copy(d.position),previousQ:d.rotation.clone(),renderedQ:d.rotation.clone()};
    }
    for(const d of RIG.joints){const params=d.hinge?R.JointData.revolute(d.a,d.b,v(1,0,0)):R.JointData.spherical(d.a,d.b);if(d.hinge){params.limitsEnabled=true;params.limits=d.hinge;}const created=world.createImpulseJoint(params,this.parts[d.parent].body,this.parts[d.child].body,true);
      // 0.21 classifies some ball joints as Generic. Public typed wrappers expose their angular motors.
      const joint=d.hinge?new R.RevoluteImpulseJoint(world.impulseJoints.raw,world.bodies,created.handle):new R.SphericalImpulseJoint(world.impulseJoints.raw,world.bodies,created.handle);joint.setContactsEnabled(false);if(!d.hinge)for(const [axis,key]of [[R.JointAxis.AngX,'x'],[R.JointAxis.AngY,'y'],[R.JointAxis.AngZ,'z']]as const)world.impulseJoints.raw.jointSetLimits(created.handle,axis as never,d.min[key],d.max[key]);this.joints.push({definition:d,joint});}
  }
  readonly hooks:R.PhysicsHooks={filterContactPair:(_a,_b,a,b)=>{
    const aa=Object.values(this.parts).find(p=>p.body.handle===a),bb=Object.values(this.parts).find(p=>p.body.handle===b);
    if(aa&&bb){if(aa===bb||RIG.joints.some(j=>j.parent===aa.definition.id&&j.child===bb.definition.id||j.parent===bb.definition.id&&j.child===aa.definition.id))return null;}
    return R.SolverFlags.COMPUTE_IMPULSE;
  },filterIntersectionPair:()=>true};
  reset(p:Point,facing=0){this.motorAngles.clear();const rot=q().setFromAxisAngle(v(0,1,0),facing);for(const part of Object.values(this.parts)){const d=part.definition,pos=v().copy(d.position).applyQuaternion(rot).add(p),r=rot.clone().multiply(d.rotation);part.body.setTranslation(pos,true);part.body.setRotation(r,true);part.body.setLinvel(v(),true);part.body.setAngvel(v(),true);part.body.resetForces(true);part.body.resetTorques(true);part.previous.copy(pos);part.rendered.copy(pos);part.previousQ.copy(r);part.renderedQ.copy(r);}}
  beforeStep(){this.torques.clear();this.targets.clear();for(const p of Object.values(this.parts)){p.previous.copy(p.body.translation());p.previousQ.copy(p.body.rotation());p.body.resetForces(true);p.body.resetTorques(true);}}
  interpolate(alpha:number){for(const p of Object.values(this.parts)){p.rendered.lerpVectors(p.previous,v().copy(p.body.translation()),alpha);p.renderedQ.slerpQuaternions(p.previousQ,q().copy(p.body.rotation()),alpha);}}
  centerOfMass(){const p=v(),velocity=v();for(const part of Object.values(this.parts)){p.addScaledVector(v().copy(part.body.worldCom()),part.definition.mass);velocity.addScaledVector(v().copy(part.body.linvel()),part.definition.mass);}return {position:p.multiplyScalar(1/RIG.mass),velocity:velocity.multiplyScalar(1/RIG.mass)};}
  pairTorque(child:PartId,torque:T.Vector3,_passive=false){if(!this.torques.has(child))this.torques.set(child,v());this.torques.get(child)!.add(torque);}
  flushTorques(){
    for(const {definition:d,joint} of this.joints){
      const target=this.targets.get(d.child),parent=this.parts[d.parent].body,body=this.parts[d.child].body,actual=q().copy(parent.rotation()).invert().multiply(q().copy(body.rotation())),angles=new T.Euler().setFromQuaternion(actual,'XYZ');
      const parentI=parent.principalInertia(),childI=body.principalInertia(),ci=(childI.x+childI.y+childI.z)/3+body.mass()*d.b.lengthSq(),pi=(parentI.x+parentI.y+parentI.z)/3+parent.mass()*d.a.lengthSq(),effective=Math.max(.0001,ci*pi/(ci+pi));
      const kp=Math.max(d.child.startsWith('Shoe')?1200:120,effective*10000),kd=2*Math.sqrt(kp*effective),strength=target?.strength??0;
      const bias=(this.torques.get(d.child)??v()).clone().applyQuaternion(q().copy(parent.rotation()).invert()).multiplyScalar(1/kp),goal=(target?.angle??v(angles.x,angles.y,angles.z)).clone().add(bias);
      const axes=[R.JointAxis.AngX,R.JointAxis.AngY,R.JointAxis.AngZ],keys=['x','y','z'] as const;
      if(!this.motorAngles.has(d.child))this.motorAngles.set(d.child,v(angles.x,angles.y,angles.z));const smoothed=this.motorAngles.get(d.child)!;
      for(let i=0;i<(d.hinge?1:3);i++){
        const key=keys[i],limited=T.MathUtils.clamp(goal[key],d.min[key],d.max[key]),outside=angles[key]<d.min[key]||angles[key]>d.max[key],limit=strength?d.torque*strength:outside?d.torque*2:.5;
        const speed=/^(Thigh|Shin|Shoe)_/.test(d.child)&&strength===.7?this.legMotorSpeed:1.5;smoothed[key]+=T.MathUtils.clamp(limited-smoothed[key],-this.dt*speed,this.dt*speed);
        const position=strength?smoothed[key]:T.MathUtils.clamp(angles[key],d.min[key],d.max[key]),stiffness=strength?kp:outside?kp:0,damping=strength?kd:outside?kd:1;
        if(d.hinge){const motor=joint as R.RevoluteImpulseJoint;motor.configureMotorModel(R.MotorModel.ForceBased);motor.configureMotorPosition(position,stiffness,damping);motor.setMotorMaxForce(limit);}
        else {const motor=joint as R.SphericalImpulseJoint;motor.configureMotorModel(axes[i],R.MotorModel.ForceBased);motor.configureMotorPosition(axes[i],position,stiffness,damping);motor.setMotorMaxForce(axes[i],limit);}
      }
    }
  }
  gravityCompensation(child:PartId){const d=this.joints.find(j=>j.definition.child===child)!.definition,parent=this.parts[d.parent].body,pivot=d.a.clone().applyQuaternion(q().copy(parent.rotation())).add(parent.translation()),descendants=new Set<PartId>([child]);let size=0;while(size!==descendants.size){size=descendants.size;for(const j of RIG.joints)if(descendants.has(j.parent))descendants.add(j.child);}
    const torque=v();for(const id of descendants){const part=this.parts[id];torque.sub(v().copy(part.body.translation()).sub(pivot).cross(v(0,-9.81*part.definition.mass,0)));}return torque;
  }
  drive(child:PartId,relative:T.Quaternion,strength=1){const e=new T.Euler().setFromQuaternion(relative,'XYZ');this.targets.set(child,{angle:v(e.x,e.y,e.z),strength});}
}
