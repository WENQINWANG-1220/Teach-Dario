import * as T from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {buildArt} from '../src/art/builders';
import {ART_LAYOUT,type ArtDefinition} from '../src/art/layout';
import {applySignText} from '../src/art/signText';
import {validateModel} from '../src/art/GLBAssets';
import {DarioRig} from '../src/dario';
import {DanielaProjection} from '../src/daniela';
import {SamProjection} from '../src/sam';
import {RIG,type PhysicalRig} from '../src/rig';
declare global {interface Window {exportAll:(runtimeOnly:boolean)=>Promise<unknown>;saveGLB:(file:string,data:string,report:unknown)=>Promise<void>}}
function base64(bytes:ArrayBuffer){let text='';const data=new Uint8Array(bytes);for(let i=0;i<data.length;i+=32768)text+=String.fromCharCode(...data.subarray(i,i+32768));return btoa(text);}
window.exportAll=async(runtimeOnly:boolean)=>{
  const templates=new Map<string,T.Object3D>(),exporter=new GLTFExporter(),loader=new GLTFLoader(),reports:unknown[]=[];
  const save=async(object:T.Object3D,def:ArtDefinition,source?:ArrayBuffer)=>{
    object.updateMatrixWorld(true);object.traverse(n=>{if(n instanceof T.SkinnedMesh)n.computeBoundingBox();});const before=new T.Box3().setFromObject(object);
    const bytes=source??await exporter.parseAsync(object,{binary:true,onlyVisible:true,trs:true});if(!(bytes instanceof ArrayBuffer))throw Error('Expected binary GLB');
    const loaded=await loader.parseAsync(bytes,'');validateModel(loaded.scene,def);
    const box=new T.Box3().setFromObject(loaded.scene);if(before.min.distanceTo(box.min)>.0001||before.max.distanceTo(box.max)>.0001)throw Error(`${def.file}: bounds changed during export`);
    let meshes=0;loaded.scene.traverse(n=>{if(n instanceof T.Mesh)meshes++;});
    const purpose:Record<string,string>={npc:'对话 NPC 原始人物模型',dirt:'起伏山路与夯土休息平台',mud:'贴山弯曲泥土滑道', 'clay-bank':'泥土滑沟挡边',asterisk:'Claude 星芒彩蛋',plunger:'皮搋子纪念碑',paper:'厕纸补给站',outpost:'登山研究所入口',poop:'卷曲便便山与滑道开口',base:'山脚安全地面',toilet:'山顶黄金马桶',hiker:'15 刚体物理姿态驱动的玩家角色（骨架第 2 版）',box:'按路线参数缩放的路面、平台或支撑块',wall:'折线窄墙顶挑战', 'ruin-step':'错层遗迹石阶挑战',log:'跨谷独木桥',stone:'错位踏脚石挑战',tree:'山路树木',hill:'山体与远景',rock:'环境岩石',flower:'起步草甸花朵',flag:'检查点与终点旗帜',sign:'运行时文字路牌',water:'峡谷水面'};
    const origin=['tree','flower','flag','sign'].includes(def.kind)?'局部原点位于根部／立柱底部':def.kind==='hiker'?'局部原点位于地面双脚中间；驱动节点坐标见编辑说明':'局部原点位于主体中心';
    const report={...def,axis:def.axis??'Y up; local XYZ',origin:def.id==='complete-scene'?'世界原点位于起步位置':origin,purpose:def.id==='complete-scene'?'完整静态场景编辑参考':purpose[def.kind],dimensions:box.getSize(new T.Vector3()).toArray(),bytes:bytes.byteLength,meshes,bounds:{min:box.min.toArray(),max:box.max.toArray()}};reports.push(report);
    await window.saveGLB(def.file,base64(bytes),report);
  };
  for(const def of ART_LAYOUT.definitions){
    // Imported character assets are copied byte-for-byte, never regenerated with map art.
    let source:ArrayBuffer|undefined;
    if(def.kind==='hiker'||def.kind==='npc'){const response=await fetch(`/models/${def.file}`);if(!response.ok)throw Error(`${def.file}: HTTP ${response.status}`);source=await response.arrayBuffer();}
    const root=source?(await loader.parseAsync(source,'')).scene:buildArt(def);
    templates.set(def.id,root);await save(root,def,source);
  }
  if(!runtimeOnly){
    const scene=new T.Group();scene.name='BabySteps_CompleteScene';
    for(const p of ART_LAYOUT.placements){const root=templates.get(p.asset)!.clone(true);root.position.set(p.position.x,p.position.y,p.position.z);root.scale.set(p.scale.x,p.scale.y,p.scale.z);root.quaternion.copy(p.rotation);if(p.label)applySignText(root,p.label);scene.add(root);}
    const character=clone(templates.get('hiker')!);scene.add(character);
    const daniela=new DanielaProjection(clone(templates.get('daniela')!));scene.add(daniela.root);
    scene.add(new SamProjection(clone(templates.get('sam')!)).root);
    new DarioRig(character).update({parts:Object.fromEntries(RIG.bodies.map(d=>[d.id,{rendered:new T.Vector3().copy(d.position),renderedQ:d.rotation.clone()}]))} as PhysicalRig);
    await save(scene,{id:'complete-scene',file:'baby-steps-complete.glb',kind:'box',axis:'Y up, meters, assembled static preview; no physics, lights or gameplay indicators'});
  }
  return {format:'glTF 2.0 binary',units:'meters',upAxis:'Y',generatedAt:new Date().toISOString(),source:'src/art/builders.ts + src/art/layout.ts + src/terrain.ts; imported Dariov2.glb preserved',animations:'Dario Mixamo skin driven by 15 dynamic physical bodies; gameplay remains in TypeScript',assets:reports};
};
