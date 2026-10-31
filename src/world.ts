import * as T from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type {Point} from './model';
import {addTerrainCollider,TERRAIN_GROUP} from './terrain';
import {ART_LAYOUT} from './art/layout';
import type {GLBAssets} from './art/GLBAssets';
import {applySignText} from './art/signText';
import {EnvironmentPhysics,MATERIALS} from './environment';
import {GROUP} from './rig';
import {SeesawBridge} from './seesaw';
import {SummitDome} from './summit';
export const TERRAIN=TERRAIN_GROUP,PLAYER=GROUP.person;
/** Layout and physics are data-driven; all static visible art is cloned from GLBs. */
export class Landscape {
  readonly environment=new EnvironmentPhysics();
  readonly scene=new T.Scene();readonly surfaces:T.Object3D[]=[];readonly flags:T.Object3D[]=[];
  readonly seesaw:SeesawBridge;
  readonly summit=new SummitDome();
  private dust:{mesh:T.Mesh;life:number;vx:number;vz:number}[]=[];
  private sun:T.DirectionalLight;
  constructor(readonly physics:RAPIER.World,assets:GLBAssets){
    const scene=this.scene;scene.background=new T.Color('#e8dcc5');scene.fog=new T.Fog('#e8dcc5',52,145);
    scene.add(this.summit.root);
    scene.add(new T.HemisphereLight('#fff0d4','#87744c',2));
    const sun=new T.DirectionalLight('#ffe0b0',3);sun.position.set(-18,35,20);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
    sun.shadow.camera.left=sun.shadow.camera.bottom=-22;sun.shadow.camera.right=sun.shadow.camera.top=22;sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;scene.add(sun,sun.target);this.sun=sun;
    for(const p of ART_LAYOUT.placements){
      const object=assets.instantiate(p.asset);object.position.set(p.position.x,p.position.y,p.position.z);object.scale.set(p.scale.x,p.scale.y,p.scale.z);object.quaternion.copy(p.rotation);
      if(p.label)applySignText(object,p.label);scene.add(object);
      const kind=ART_LAYOUT.definitions.find(d=>d.id===p.asset)!.kind;
      if(p.block){addTerrainCollider(physics,p.block);object.traverse(n=>{if(n instanceof T.Mesh)this.surfaces.push(n);});}
      else if(p.dynamic){const wood=kind==='log',material=wood?MATERIALS.wood:MATERIALS.stone,body=physics.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.position.x,p.position.y,p.position.z).setRotation(p.rotation).setCcdEnabled(true).setLinearDamping(.025).setAngularDamping(.04));
        object.updateMatrixWorld(true);const matrix=new T.Matrix4().compose(new T.Vector3().copy(p.position),new T.Quaternion().copy(p.rotation),new T.Vector3(1,1,1)).invert(),vertices:number[]=[];
        object.traverse(n=>{if(n instanceof T.Mesh){this.surfaces.push(n);const attribute=n.geometry.getAttribute('position'),transform=matrix.clone().multiply(n.matrixWorld);for(let i=0;i<attribute.count;i++)vertices.push(...new T.Vector3().fromBufferAttribute(attribute,i).applyMatrix4(transform).toArray());}});
        const desc=RAPIER.ColliderDesc.convexHull(new Float32Array(vertices));if(!desc)throw Error(`无法创建物理凸包：${p.asset}`);physics.createCollider(desc.setDensity(material.density).setFriction(material.friction).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(material.restitution).setCollisionGroups(GROUP.prop),body);
        const bounds=new T.Box3().setFromObject(object),half=bounds.getSize(new T.Vector3()).multiplyScalar(.5);this.environment.add(body,body.mass()/material.density,half,object);
      }else if(kind==='poop'){
        object.updateMatrixWorld(true);object.traverse(n=>{if(!(n instanceof T.Mesh))return;const attribute=n.geometry.getAttribute('position'),vertices:number[]=[];for(let i=0;i<attribute.count;i++)vertices.push(...new T.Vector3().fromBufferAttribute(attribute,i).applyMatrix4(n.matrixWorld).toArray());const indices=n.geometry.index?Array.from(n.geometry.index.array as ArrayLike<number>):Array.from({length:attribute.count},(_,i)=>i);physics.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(vertices),new Uint32Array(indices)).setFriction(.55).setCollisionGroups(GROUP.terrain));this.surfaces.push(n);});
      }else if(!p.decorative&&['rock','hill','tree','sign','flag','toilet','outpost'].includes(kind)){
        object.updateMatrixWorld(true);let index=0;object.traverse(n=>{if(!(n instanceof T.Mesh))return;const trunkOnly=kind==='tree'||kind==='flag';if(trunkOnly&&index++>0)return;
          if(kind==='toilet')n.userData.toilet=true;const attribute=n.geometry.getAttribute('position'),vertices:number[]=[];for(let i=0;i<attribute.count;i++)vertices.push(...new T.Vector3().fromBufferAttribute(attribute,i).applyMatrix4(n.matrixWorld).toArray());const desc=RAPIER.ColliderDesc.convexHull(new Float32Array(vertices));if(desc)physics.createCollider(desc.setFriction(kind==='rock'||kind==='hill'?.75:.65).setRestitution(.02).setCollisionGroups(GROUP.terrain));this.surfaces.push(n);});
      }else if(kind==='water')this.environment.water.push({center:p.position,halfWidth:p.scale.x/2,halfLength:p.scale.z/2,surface:p.position.y,bottom:p.position.y-12});
      if(p.flag)this.flags.push(object.getObjectByName('Flag_Cloth')!);
    }
    this.seesaw=new SeesawBridge(physics);scene.add(this.seesaw.root);this.surfaces.push(...this.seesaw.surfaces);
    const light=new T.PointLight('#ffd779',10,18);const end=ART_LAYOUT.placements.find(p=>p.asset==='golden-toilet')!;light.position.set(end.position.x,end.position.y+2.5,end.position.z);scene.add(light);
  }
  resetDynamics(){this.environment.reset();this.seesaw.reset();}
  puff(p:Point){
    for(let i=0;i<7;i++){
      const mesh=new T.Mesh(new T.IcosahedronGeometry(.045+Math.random()*.04,0),new T.MeshBasicMaterial({color:'#c79b72',transparent:true,opacity:.7}));mesh.position.set(p.x,p.y+.08,p.z);this.scene.add(mesh);this.dust.push({mesh,life:.5,vx:(Math.random()-.5)*.8,vz:(Math.random()-.5)*.8});
    }
  }
  update(dt:number,p:Point,checkpoint:number){
    this.sun.position.set(p.x-18,p.y+30,p.z+16);this.sun.target.position.set(p.x,p.y,p.z);this.sun.target.updateMatrixWorld();
    this.flags.forEach((flag,i)=>{flag.rotation.y=Math.sin(performance.now()*.002+i)*.08;});
    for(let i=this.dust.length-1;i>=0;i--){const d=this.dust[i];d.life-=dt;d.mesh.position.x+=d.vx*dt;d.mesh.position.z+=d.vz*dt;d.mesh.position.y+=dt*.3;(d.mesh.material as T.MeshBasicMaterial).opacity=Math.max(0,d.life);
      if(d.life<=0){this.scene.remove(d.mesh);d.mesh.geometry.dispose();(d.mesh.material as T.Material).dispose();this.dust.splice(i,1);}
    }
    void checkpoint;
  }
}
