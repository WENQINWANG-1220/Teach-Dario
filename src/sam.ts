import * as T from 'three';
import {route, type Point} from './model';

const approach=route(16),outward=new T.Vector3(approach.x,0,approach.z+18).normalize();
/** Sam waits on the outside shoulder before the seesaw, beyond the first saved flag. */
export const SAM_POSITION:Readonly<Point>={x:approach.x+outward.x*1.65,y:approach.y,z:approach.z+outward.z*1.65};
export const SAM_BONES=['Hips','Head','LeftUpLeg','RightUpLeg'].map(name=>`mixamorig${name}`);

/** The supplied SAM.glb keeps its mesh, resting pose and textures in a translucent projection. */
export class SamProjection {
  readonly root=new T.Group();
  private readonly figure=new T.Group();
  private readonly materials:T.Material[]=[];
  private readonly ringMaterial=new T.MeshBasicMaterial({color:'#efc477',transparent:true,opacity:.48,depthWrite:false,side:T.DoubleSide});
  private time=0;

  constructor(model:T.Object3D,position:Readonly<Point>=SAM_POSITION){
    this.root.name='Sam_Altman_Projection';this.root.position.copy(position);
    this.root.userData.character='Sam Altman';this.root.userData.projection=true;
    this.figure.name='Sam_Memory';
    const normalized=new T.Group();normalized.name='Sam_Imported_Model';normalized.add(model);
    normalized.updateMatrixWorld(true);
    const bonePosition=(name:string)=>{
      const bone=model.getObjectByName(`mixamorig${name}`)??model.getObjectByName(`mixamorig:${name}`);
      if(!bone)throw Error(`SAM.glb 缺少骨骼 ${name}`);
      return bone.getWorldPosition(new T.Vector3());
    };
    // The imported Mixamo figure faces +Z. Its anatomical right points towards -X;
    // this frame removes import rotation/lean and establishes the game's -Z facing.
    const up=bonePosition('Head').sub(bonePosition('Hips')).normalize();
    const right=bonePosition('RightUpLeg').sub(bonePosition('LeftUpLeg')).normalize();
    const back=right.clone().cross(up).normalize();right.crossVectors(up,back).normalize();
    if(up.lengthSq()<.99||right.lengthSq()<.99||back.lengthSq()<.99)throw Error('SAM.glb 骨骼朝向无效');
    normalized.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(right,up,back)).invert();
    normalized.updateMatrixWorld(true);
    model.traverse(node=>{if(node instanceof T.SkinnedMesh)node.skeleton.update();});
    const bounds=new T.Box3().setFromObject(normalized,true),height=bounds.max.y-bounds.min.y;
    if(!Number.isFinite(height)||height<=0)throw Error('SAM.glb 人物尺寸无效');
    const scale=1.8/height;
    normalized.scale.setScalar(scale);
    normalized.position.set(-(bounds.min.x+bounds.max.x)*scale/2,-bounds.min.y*scale,-(bounds.min.z+bounds.max.z)*scale/2);
    this.figure.add(normalized);this.root.add(this.figure);
    model.traverse(node=>{
      if(!(node instanceof T.Mesh))return;
      const projection=(source:T.Material)=>{
        const material=source.clone();material.transparent=true;material.opacity=.56;
        material.depthWrite=false;material.depthTest=true;material.side=T.FrontSide;
        this.materials.push(material);return material;
      };
      node.material=Array.isArray(node.material)?node.material.map(projection):projection(node.material);
      node.castShadow=false;node.receiveShadow=false;node.frustumCulled=false;node.renderOrder=2;
    });

    const base=new T.Mesh(new T.CylinderGeometry(.56,.61,.16,32),new T.MeshStandardMaterial({color:'#756b58',roughness:.86}));
    base.name='Sam_Projector_Base';base.position.y=-.08;base.receiveShadow=true;this.root.add(base);
    const ring=new T.Mesh(new T.RingGeometry(.48,.5,64),this.ringMaterial);
    ring.name='Sam_Projector_Ring';ring.position.y=.008;ring.rotation.x=-Math.PI/2;this.root.add(ring);
    const inner=new T.Mesh(new T.CircleGeometry(.47,48),new T.MeshBasicMaterial({color:'#edc990',transparent:true,opacity:.07,depthWrite:false,side:T.DoubleSide}));
    inner.name='Sam_Projector_Light';inner.position.y=.006;inner.rotation.x=-Math.PI/2;this.root.add(inner);
    this.figure.rotation.y=Math.atan2(position.x,position.z+18);
  }

  update(dt:number,player:Point,active:boolean){
    const elapsed=Math.min(Math.max(dt,0),.1);this.time+=elapsed;
    const opacity=(active?.62:.56)+Math.sin(this.time*2)*.02;
    for(const material of this.materials)material.opacity=opacity;
    this.ringMaterial.opacity=(active?.65:.42)+Math.sin(this.time*2)*.055;
    const dx=player.x-this.root.position.x,dz=player.z-this.root.position.z;
    if(dx*dx+dz*dz>.01){
      const target=Math.atan2(-dx,-dz),delta=Math.atan2(Math.sin(target-this.figure.rotation.y),Math.cos(target-this.figure.rotation.y));
      this.figure.rotation.y+=delta*(1-Math.exp(-elapsed*3));
    }
  }
}
