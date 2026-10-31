import * as T from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {buildArt} from '../src/art/builders';
import {ART_LAYOUT,type ArtDefinition} from '../src/art/layout';
import {applySignText} from '../src/art/signText';
import {validateModel} from '../src/art/GLBAssets';
declare global {interface Window {exportAll:(runtimeOnly:boolean)=>Promise<unknown>;saveGLB:(file:string,data:string,report:unknown)=>Promise<void>}}
function base64(bytes:ArrayBuffer){let text='';const data=new Uint8Array(bytes);for(let i=0;i<data.length;i+=32768)text+=String.fromCharCode(...data.subarray(i,i+32768));return btoa(text);}
window.exportAll=async(runtimeOnly:boolean)=>{
  const templates=new Map<string,T.Object3D>(),exporter=new GLTFExporter(),loader=new GLTFLoader(),reports:unknown[]=[];
  const save=async(object:T.Object3D,def:ArtDefinition)=>{
    object.updateMatrixWorld(true);const before=new T.Box3().setFromObject(object);
    const bytes=await exporter.parseAsync(object,{binary:true,onlyVisible:true,trs:true});if(!(bytes instanceof ArrayBuffer))throw Error('Expected binary GLB');
    const loaded=await loader.parseAsync(bytes,'');validateModel(loaded.scene,def);
    const box=new T.Box3().setFromObject(loaded.scene);if(before.min.distanceTo(box.min)>.0001||before.max.distanceTo(box.max)>.0001)throw Error(`${def.file}: bounds changed during export`);
    let meshes=0;loaded.scene.traverse(n=>{if(n instanceof T.Mesh)meshes++;});
    const purpose:Record<string,string>={hiker:'15 刚体物理姿态驱动的玩家角色（骨架第 2 版）',box:'按路线参数缩放的路面、平台或支撑块',wall:'折线窄墙顶挑战', 'ruin-step':'错层遗迹石阶挑战',log:'跨谷独木桥',stone:'错位踏脚石挑战',tree:'山路树木',hill:'山体与远景',rock:'环境岩石',flower:'起步草甸花朵',flag:'检查点与终点旗帜',sign:'运行时文字路牌',water:'峡谷水面'};
    const origin=['tree','flower','flag','sign'].includes(def.kind)?'局部原点位于根部／立柱底部':def.kind==='hiker'?'局部原点位于地面双脚中间；驱动节点坐标见编辑说明':'局部原点位于主体中心';
    const report={...def,axis:def.axis??'Y up; local XYZ',origin:def.id==='complete-scene'?'世界原点位于起步位置':origin,purpose:def.id==='complete-scene'?'完整静态场景编辑参考':purpose[def.kind],dimensions:box.getSize(new T.Vector3()).toArray(),bytes:bytes.byteLength,meshes,bounds:{min:box.min.toArray(),max:box.max.toArray()}};reports.push(report);
    await window.saveGLB(def.file,base64(bytes),report);
  };
  for(const def of ART_LAYOUT.definitions){const root=buildArt(def);templates.set(def.id,root);await save(root,def);}
  if(!runtimeOnly){
    const scene=new T.Group();scene.name='BabySteps_CompleteScene';
    for(const p of ART_LAYOUT.placements){const root=templates.get(p.asset)!.clone(true);root.position.set(p.position.x,p.position.y,p.position.z);root.scale.set(p.scale.x,p.scale.y,p.scale.z);root.quaternion.copy(p.rotation);if(p.label)applySignText(root,p.label);scene.add(root);}
    scene.add(templates.get('hiker')!.clone(true));
    await save(scene,{id:'complete-scene',file:'baby-steps-complete.glb',kind:'box',axis:'Y up, meters, assembled static preview; no physics, lights or gameplay indicators'});
  }
  return {format:'glTF 2.0 binary',units:'meters',upAxis:'Y',generatedAt:new Date().toISOString(),source:'src/art/builders.ts + src/art/layout.ts + src/terrain.ts',animations:'Rig v2 named sibling driver nodes; dynamic physical bones and interpolation remain in TypeScript',assets:reports};
};
