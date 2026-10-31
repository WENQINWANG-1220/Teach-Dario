import * as T from 'three';
import type {Point} from './model';

/** Daniela waits just outside the first trail bend, on the level starting meadow. */
export const DANIELA_POSITION:Readonly<Point>={x:3.6,y:0,z:1.45};

/** A visual-only projection: its GLB never participates in character or terrain physics. */
export class DanielaProjection {
  readonly root=new T.Group();
  private readonly figure=new T.Group();
  private readonly materials:T.Material[]=[];
  private readonly ringMaterial=new T.MeshBasicMaterial({color:'#b1f4e9',transparent:true,opacity:.55,depthWrite:false,side:T.DoubleSide});
  private readonly pulse:T.Mesh;
  private time=0;

  constructor(model:T.Object3D){
    this.root.name='Daniela_Projection';
    this.root.position.copy(DANIELA_POSITION);
    this.root.userData.character='Daniela';
    this.root.userData.projection=true;
    this.figure.name='Daniela_Hologram';
    const normalized=new T.Group();
    normalized.add(model);
    normalized.updateMatrixWorld(true);

    const position=(name:string)=>model.getObjectByName(name)?.getWorldPosition(new T.Vector3());
    const hip=position('Hip'),head=position('Head'),left=position('L_Clavicle'),right=position('R_Clavicle');
    if(hip&&head&&left&&right){
      // The imported skeleton faces +Z and has a slight global lean. Establish a stable -Z-facing frame.
      const up=head.sub(hip).normalize(),x=right.sub(left).normalize(),z=x.clone().cross(up).normalize();
      x.crossVectors(up,z).normalize();
      normalized.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x,up,z)).invert();
    }
    normalized.updateMatrixWorld(true);
    model.traverse(node=>{if(node instanceof T.SkinnedMesh)node.skeleton.update();});
    const bounds=new T.Box3().setFromObject(normalized,true),height=bounds.max.y-bounds.min.y;
    if(!Number.isFinite(height)||height<=0)throw Error('Dario_sister.glb 人物尺寸无效');
    const scale=1.7/height;
    normalized.scale.setScalar(scale);
    normalized.position.set(-(bounds.min.x+bounds.max.x)*scale/2,-bounds.min.y*scale,-(bounds.min.z+bounds.max.z)*scale/2);
    this.figure.add(normalized);
    this.figure.position.y=.07;
    this.root.add(this.figure);

    const tint=new T.Color('#b9eee8');
    model.traverse(node=>{
      if(!(node instanceof T.Mesh))return;
      const hologram=(source:T.Material)=>{
        const material=source.clone();
        material.transparent=true;material.opacity=.56;material.depthWrite=false;material.depthTest=true;
        material.side=T.FrontSide;material.blending=T.NormalBlending;
        if(material instanceof T.MeshStandardMaterial){
          material.color.lerp(tint,.27);
          material.emissive.copy(tint);material.emissiveIntensity=.18;
          material.metalness=0;material.roughness=.85;
        }else if(material instanceof T.MeshBasicMaterial)material.color.lerp(tint,.27);
        this.materials.push(material);return material;
      };
      node.material=Array.isArray(node.material)?node.material.map(hologram):hologram(node.material);
      node.castShadow=false;node.receiveShadow=false;node.frustumCulled=false;
      node.renderOrder=2;
    });

    const ring=new T.Mesh(new T.RingGeometry(.40,.43,64),this.ringMaterial);
    ring.name='Daniela_Projector_Ring';ring.rotation.x=-Math.PI/2;ring.position.y=.015;
    this.root.add(ring);
    this.pulse=new T.Mesh(new T.RingGeometry(.47,.48,64),this.ringMaterial);
    this.pulse.rotation.x=-Math.PI/2;this.pulse.position.y=.018;this.root.add(this.pulse);
    const lightPool=new T.Mesh(new T.CircleGeometry(.44,48),new T.MeshBasicMaterial({color:'#b1f4e9',transparent:true,opacity:.055,depthWrite:false,side:T.DoubleSide}));
    lightPool.rotation.x=-Math.PI/2;lightPool.position.y=.012;this.root.add(lightPool);
    this.root.rotation.y=Math.atan2(DANIELA_POSITION.x,DANIELA_POSITION.z);
  }

  update(dt:number,player:Point,active:boolean){
    this.time+=Math.min(Math.max(dt,0),.1);
    this.figure.position.y=.07+Math.sin(this.time*1.7)*.018;
    const opacity=.54+Math.sin(this.time*2.1)*.025+(active?.055:0);
    for(const material of this.materials)material.opacity=opacity;
    this.ringMaterial.opacity=(active?.68:.47)+Math.sin(this.time*2.1)*.07;
    this.pulse.scale.setScalar(1+Math.sin(this.time*1.5)*.07);
    const dx=player.x-this.root.position.x,dz=player.z-this.root.position.z;
    if(dx*dx+dz*dz>.01){
      const target=Math.atan2(-dx,-dz),delta=Math.atan2(Math.sin(target-this.root.rotation.y),Math.cos(target-this.root.rotation.y));
      this.root.rotation.y+=delta*(1-Math.exp(-Math.max(0,dt)*4));
    }
  }
}
