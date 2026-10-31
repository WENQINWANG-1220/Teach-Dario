import * as T from 'three';
import R from '@dimforge/rapier3d-compat';
import {route,SEESAW} from './model';
import {TERRAIN_GROUP} from './terrain';

/** A real, load-bearing hinge. The spring keeps the ends within a comfortable step. */
export class SeesawBridge {
  readonly root=new T.Group();
  readonly surfaces:T.Object3D[]=[];
  readonly body:R.RigidBody;
  readonly deck=new T.Group();
  readonly joint:R.RevoluteImpulseJoint;
  readonly length:number;
  private readonly spawn:T.Vector3;
  private readonly rotation:T.Quaternion;

  constructor(world:R.World){
    this.root.name='Scaling_Laws_Seesaw';
    this.deck.name='Seesaw_Moving_Deck';
    const a=new T.Vector3().copy(route(SEESAW.start)),b=new T.Vector3().copy(route(SEESAW.end));
    const forward=b.clone().sub(a),z=forward.clone().normalize(),x=new T.Vector3(z.z,0,-z.x).normalize(),y=new T.Vector3().crossVectors(z,x).normalize();
    this.length=forward.length()+.08;
    this.rotation=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));
    this.spawn=a.add(b).multiplyScalar(.5).addScaledVector(y,-.09);
    const anchor=world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(this.spawn.x,this.spawn.y,this.spawn.z).setRotation(this.rotation));
    this.body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(this.spawn.x,this.spawn.y,this.spawn.z).setRotation(this.rotation).setCcdEnabled(true).setAngularDamping(.5).setAdditionalSolverIterations(8));
    world.createCollider(R.ColliderDesc.cuboid(SEESAW.width/2,.09,this.length/2).setMass(180).setFriction(.9).setFrictionCombineRule(R.CoefficientCombineRule.Min).setRestitution(0).setCollisionGroups(TERRAIN_GROUP),this.body);
    const params=R.JointData.revolute(new T.Vector3(),new T.Vector3(),new T.Vector3(1,0,0));
    params.limitsEnabled=true;params.limits=[-SEESAW.maxTilt,SEESAW.maxTilt];
    const created=world.createImpulseJoint(params,anchor,this.body,true);
    this.joint=new R.RevoluteImpulseJoint(world.impulseJoints.raw,world.bodies,created.handle);
    this.joint.setContactsEnabled(false);
    this.joint.setLimits(-SEESAW.maxTilt,SEESAW.maxTilt);
    this.joint.configureMotorModel(R.MotorModel.ForceBased);
    this.joint.configureMotorPosition(0,40000,6500);
    this.joint.setMotorMaxForce(8000);

    const timber=['#ba8450','#c6945e','#b7814d'].map(color=>new T.MeshStandardMaterial({color,roughness:.88}));
    const steel=new T.MeshStandardMaterial({color:'#464b48',roughness:.56,metalness:.45});
    const brass=new T.MeshStandardMaterial({color:'#d8ad55',roughness:.55,metalness:.25});
    const mesh=(parent:T.Group,geometry:T.BufferGeometry,material:T.Material,p:T.Vector3,name:string)=>{
      const object=new T.Mesh(geometry,material);object.name=name;object.position.copy(p);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
    };
    const count=Math.ceil(this.length/.43),plankLength=this.length/count;
    for(let i=0;i<count;i++){
      const pz=-this.length/2+plankLength*(i+.5);
      const board=mesh(this.deck,new T.BoxGeometry(SEESAW.width,.18,plankLength-.012),timber[i%timber.length],new T.Vector3(0,0,pz),`Seesaw_Plank_${i}`);
      this.surfaces.push(board);
      for(const side of [-1,1]){
        const bolt=mesh(this.deck,new T.CylinderGeometry(.022,.022,.008,6),steel,new T.Vector3(side*(SEESAW.width/2-.12),.094,pz),'Deck_Bolt');
        bolt.castShadow=false;
      }
    }
    for(const side of [-1,1])mesh(this.deck,new T.BoxGeometry(.07,.12,this.length),steel,new T.Vector3(side*(SEESAW.width/2-.035),-.06,0),'Deck_Edge_Beam');
    mesh(this.deck,new T.BoxGeometry(SEESAW.width+.01,.012,.13),brass,new T.Vector3(0,.096,0),'Balance_Point');
    this.root.add(this.deck);

    const supports=new T.Group();supports.name='Seesaw_Fixed_Pivot';supports.position.copy(this.spawn);supports.quaternion.copy(this.rotation);this.root.add(supports);
    const height=Math.max(.7,this.spawn.y);
    for(const side of [-1,1]){
      const px=side*(SEESAW.width/2+.12);
      mesh(supports,new T.BoxGeometry(.20,height,.40),steel,new T.Vector3(px,-height/2-.12,0),'Pivot_Post');
      mesh(supports,new T.BoxGeometry(.52,.15,.84),steel,new T.Vector3(px,-height-.08,0),'Pivot_Foot');
      mesh(supports,new T.CylinderGeometry(.15,.15,.10,16),brass,new T.Vector3(px,0,0),'Pivot_Cap').rotation.z=Math.PI/2;
    }
    mesh(supports,new T.CylinderGeometry(.09,.09,SEESAW.width+.34,12),steel,new T.Vector3(0,-.04,0),'Pivot_Axle').rotation.z=Math.PI/2;
    this.update();
  }

  /** Clear last tick's reaction forces before the walker transfers its next support load. */
  beginStep(){this.body.resetForces(true);this.body.resetTorques(true);}
  update(){this.deck.position.copy(this.body.translation());this.deck.quaternion.copy(this.body.rotation());this.root.updateMatrixWorld(true);}
  get tilt(){const relative=this.rotation.clone().invert().multiply(new T.Quaternion().copy(this.body.rotation())),angle=2*Math.atan2(relative.x,relative.w);return Math.atan2(Math.sin(angle),Math.cos(angle));}
  reset(){
    this.body.setTranslation(this.spawn,true);this.body.setRotation(this.rotation,true);
    this.body.setLinvel(new T.Vector3(),true);this.body.setAngvel(new T.Vector3(),true);this.beginStep();this.update();
  }
}
