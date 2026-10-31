import * as T from 'three';
import {RIG,type PartId,type PhysicalRig} from './rig';

const mapping:Record<PartId,string>={Pelvis:'Hips',Torso:'Spine',Head:'Head',Shoulder_L:'LeftArm',Elbow_L:'LeftForeArm',Hand_L:'LeftHand',Shoulder_R:'RightArm',Elbow_R:'RightForeArm',Hand_R:'RightHand',Thigh_L:'LeftUpLeg',Shin_L:'LeftLeg',Shoe_L:'LeftFoot',Thigh_R:'RightUpLeg',Shin_R:'RightLeg',Shoe_R:'RightFoot'};
export const DARIO_BONES=[...Object.values(mapping),'Spine1','Spine2','Neck','HeadTop_End','LeftShoulder','RightShoulder'].map(n=>`mixamorig${n}`);
// GLTFLoader sanitizes colons in bone names for animation property bindings.
export function darioBone(root:T.Object3D,name:string){return root.getObjectByName(`mixamorig${name}`)??root.getObjectByName(`mixamorig:${name}`);}
export class DarioRig {
  private bindings:{bone:T.Object3D;id:PartId;offset:T.Vector3;rotation:T.Quaternion;scale:T.Vector3}[]=[];
  constructor(readonly model:T.Object3D){
    model.updateMatrixWorld(true);
    const bone=(name:string)=>{const b=darioBone(model,name);if(!b)throw Error(`Dariov2.glb 缺少骨骼 ${name}`);return b;};
    const position=(name:string)=>bone(name).getWorldPosition(new T.Vector3());
    const up=position('Head').sub(position('Hips')).normalize();
    const right=position('RightUpLeg').sub(position('LeftUpLeg')).normalize();
    const forward=right.clone().cross(up).normalize();right.crossVectors(up,forward).normalize();
    const orientation=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(right,up,forward)).invert();
    const height=position('HeadTop_End').distanceTo(position('Hips'));
    const scale=(1.77-.99)/height;
    model.quaternion.copy(orientation);model.scale.setScalar(scale);model.updateMatrixWorld(true);
    const bind=(name:string,id:PartId,target:T.Vector3,child?:string)=>{
      const b=bone(name),rest=b.getWorldQuaternion(new T.Quaternion());
      if(child){
        const direction=position(child).sub(position(name)).normalize();
        const desired=new T.Vector3(0,-1,0).applyQuaternion(RIG.bodies.find(d=>d.id===id)!.rotation);
        rest.premultiply(new T.Quaternion().setFromUnitVectors(direction,desired));
      }
      const d=RIG.bodies.find(d=>d.id===id)!;
      this.bindings.push({bone:b,id,offset:target.clone().sub(d.position).applyQuaternion(d.rotation.clone().invert()),rotation:d.rotation.clone().invert().multiply(rest),scale:b.getWorldScale(new T.Vector3())});
    };
    bind('Hips','Pelvis',new T.Vector3(0,.925,0));
    bind('Spine','Torso',new T.Vector3(0,1.09,0));
    bind('Spine1','Torso',new T.Vector3(0,1.23,0));
    bind('Spine2','Torso',new T.Vector3(0,1.38,0));
    bind('Neck','Head',new T.Vector3(0,1.52,0));
    bind('Head','Head',new T.Vector3(0,1.61,-.012));
    for(const [side,s] of [[-1,'L'],[1,'R']] as const){
      const prefix=s==='L'?'Left':'Right';
      bind(`${prefix}Shoulder`,'Torso',new T.Vector3(side*.13,1.43,0));
      bind(`${prefix}Arm`,`Shoulder_${s}`,new T.Vector3(side*.245,1.43,0),`${prefix}ForeArm`);
      bind(`${prefix}ForeArm`,`Elbow_${s}`,new T.Vector3(side*.245,1.15,0),`${prefix}Hand`);
      bind(`${prefix}Hand`,`Hand_${s}`,new T.Vector3(side*.245,.91,0));
      const thigh=RIG.joints.find(j=>j.child===`Thigh_${s}`)!,knee=RIG.joints.find(j=>j.child===`Shin_${s}`)!;
      const pivot=(id:PartId,local:T.Vector3)=>local.clone().applyQuaternion(RIG.bodies.find(d=>d.id===id)!.rotation).add(RIG.bodies.find(d=>d.id===id)!.position);
      bind(`${prefix}UpLeg`,`Thigh_${s}`,pivot('Pelvis',thigh.a),`${prefix}Leg`);
      bind(`${prefix}Leg`,`Shin_${s}`,pivot(`Thigh_${s}`,knee.a),`${prefix}Foot`);
      bind(`${prefix}Foot`,`Shoe_${s}`,new T.Vector3(side*.14,.11,0));
    }
    // Parents must be updated before their children, irrespective of GLB node order.
    const depth=(b:T.Object3D):number=>b.parent?1+depth(b.parent):0;
    this.bindings.sort((a,b)=>depth(a.bone)-depth(b.bone));
    model.traverse(n=>{if(n instanceof T.SkinnedMesh)n.frustumCulled=false;});
  }
  update(rig:PhysicalRig){
    for(const {bone,id,offset,rotation,scale} of this.bindings){
      const p=rig.parts[id],position=offset.clone().applyQuaternion(p.renderedQ).add(p.rendered);
      const world=new T.Matrix4().compose(position,p.renderedQ.clone().multiply(rotation),scale);
      bone.parent!.updateWorldMatrix(true,false);
      world.premultiply(bone.parent!.matrixWorld.clone().invert()).decompose(bone.position,bone.quaternion,bone.scale);
      bone.updateMatrixWorld(true);
    }
  }
}
