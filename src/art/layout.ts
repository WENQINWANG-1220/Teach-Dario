import * as T from 'three';
import {DARIO_BONES} from '../dario';
import {CHECKPOINTS,route,type Point} from '../model';
import {TOILET_POSITION} from '../model';
import {trailBlocks,SLIDE_LANES,type Block} from '../terrain';
export const HIKER_NODES=['Pelvis','Head','Hand_L','Hand_R','Torso','Shoulder_L','Elbow_L','Shoulder_R','Elbow_R','Leg_L','Thigh_L','Shin_L','Shoe_L','Leg_R','Thigh_R','Shin_R','Shoe_R'] as const;
export type ArtKind='hiker'|'box'|'wall'|'ruin-step'|'log'|'stone'|'tree'|'hill'|'rock'|'flower'|'flag'|'sign'|'water'|'toilet'|'poop'|'base'|'dirt'|'mud'|'clay-bank'|'asterisk'|'plunger'|'paper'|'outpost'|'npc';
export interface ArtDefinition{id:string;file:string;kind:ArtKind;color?:string;size?:Point;requiredNodes?:readonly string[];axis?:string}
export interface Placement{asset:string;position:Point;scale:Point;rotation:{x:number;y:number;z:number;w:number};block?:Block;label?:string;flag?:boolean;dynamic?:boolean;decorative?:boolean}
export interface ArtLayout{definitions:ArtDefinition[];placements:Placement[]}
export function createArtLayout():ArtLayout{
 const definitions:ArtDefinition[]=[],placements:Placement[]=[];
 const def=(d:ArtDefinition)=>{if(!definitions.some(x=>x.id===d.id))definitions.push(d);return d.id;};
 const place=(asset:string,position:Point,scale={x:1,y:1,z:1},yaw=0)=>{const p:Placement={asset,position:{...position},scale:{...scale},rotation:new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw)};placements.push(p);return p;};
 def({id:'hiker',file:'Dariov2.glb',kind:'hiker',requiredNodes:DARIO_BONES});
 def({id:'daniela',file:'Dario_sister.glb',kind:'npc',requiredNodes:['Hip','Head','BoneRoot']});
 def({id:'sam',file:'SAM.glb',kind:'npc',requiredNodes:['Armature','mixamorigHips','mixamorigHead','mixamorigLeftUpLeg','mixamorigRightUpLeg']});
 def({id:'poop-mountain',file:'poop-mountain.glb',kind:'poop',requiredNodes:['Poop_Base','Poop_Middle','Poop_Crown']});place('poop-mountain',{x:0,y:0,z:-18});
 for(const b of trailBlocks()){
  const kind:ArtKind=b.kind==='log'?'log':b.kind==='base'?'base':b.kind==='path'||b.kind==='rest'?'dirt':b.kind==='slide'?'mud':b.kind==='rail'?'clay-bank':'box';
  const id=`terrain-${b.kind}-${b.color.slice(1)}${kind==='log'?'-'+Math.round(b.size.x*100):''}`;
  const size=kind==='log'?{x:b.size.x,y:b.size.x,z:12}:{x:1,y:1,z:1};
  def({id,file:id+'.glb',kind,color:b.color,size});
  const scale=kind==='log'?{x:1,y:b.size.z/12,z:1}:{x:b.size.x,y:b.size.y,z:b.size.z};
  const p=place(id,b.p,scale,b.yaw);p.block=b;if(b.rotation)p.rotation={x:b.rotation.x,y:b.rotation.y,z:b.rotation.z,w:b.rotation.w};
 }
 def({id:'golden-toilet',file:'golden-toilet.glb',kind:'toilet',requiredNodes:['Toilet_Bowl','Toilet_Tank','Interaction_Anchor']});place('golden-toilet',TOILET_POSITION);
 def({id:'sign',file:'sign.glb',kind:'sign',requiredNodes:['Sign_Board']});
 def({id:'flag',file:'flag.glb',kind:'flag',color:'#d9794f',requiredNodes:['Flag_Cloth']});
 def({id:'flag-finish',file:'flag-finish.glb',kind:'flag',color:'#e8bd4c',requiredNodes:['Flag_Cloth']});
 const notes=[
   '便便山 · 碳基对齐试验场|DARIO’S VERY HUMAN BENCHMARK',
   'Claude：建议一步一步思考|请勿一次输出两只脚',
   '泥巴不是 BUG，是地形特性|脚下的上下文正在变长',
   '独木桥评测 · 禁止并行推理|LEFT FOOT. RIGHT FOOT. REPEAT.',
   '通过了！但没有通过重力|安全团队建议先坐一会儿',
   'Anthropic 野外研究分部|这里的 Scaling 指爬山',
   '第二座桥 · 请保持对齐|脚趾不在安全边界之内',
   'Dario 的长期主义|再走两步就休息，真的',
   '上下文压缩站|忘掉刚才摔的那一跤',
   '最后一段 · 接近超级便能|山顶提供最终输出接口',
   '黄金马桶 · 人类终极智慧|PLEASE FLUSH YOUR CONTEXT'
 ];
 CHECKPOINTS.forEach((s,i)=>{const p=route(s),radial=new T.Vector3(p.x,0,p.z+18).normalize();const flag=place(i===CHECKPOINTS.length-1?'flag-finish':'flag',{x:p.x+radial.x*1.7,y:p.y,z:p.z+radial.z*1.7});flag.flag=true;
  if(s<164){const sign=place('sign',{x:p.x-radial.x*1.9,y:p.y,z:p.z-radial.z*1.9},{x:1,y:1,z:1},Math.atan2(radial.x,radial.z));sign.label=notes[i];}
 });
 const bridgehead=route(16),outward=new T.Vector3(bridgehead.x,0,bridgehead.z+18).normalize();
 const seesawSign=place('sign',{x:bridgehead.x-outward.x*1.6,y:bridgehead.y-.1,z:bridgehead.z-outward.z*1.6},{x:.85,y:.85,z:.85},Math.atan2(outward.x,outward.z));
 seesawSign.label='跷跷板 · SCALING LAWS|小步过支点 · 等桥面稳住再换脚';seesawSign.decorative=true;
 const exits=new Set<string>();
 for(const lane of SLIDE_LANES){
  const approach=route(lane.bridge.start-2),radial=new T.Vector3(approach.x,0,approach.z+18).normalize();
  const sign=place('sign',{x:approach.x-radial.x*1.55,y:approach.y-.2,z:approach.z-radial.z*1.55},{x:.9,y:.9,z:.9},Math.atan2(radial.x,radial.z));sign.label='泥土滑道 · 退回上一个版本|重力负责部署，山脚负责接收';sign.decorative=true;
  const key=JSON.stringify(lane.end);if(exits.has(key))continue;exits.add(key);
  const prev=lane.points[lane.points.length-2],out=new T.Vector3(lane.end.x-prev.x,0,lane.end.z-prev.z).normalize(),exitSide=new T.Vector3(-out.z,0,out.x);
  const exit=place('sign',{x:lane.end.x+exitSide.x*4.5,y:0,z:lane.end.z+exitSide.z*4.5},{x:1,y:1,z:1},Math.atan2(-out.x,-out.z));exit.label='欢迎回到山脚 · 免费重新训练|R 回到入口，再来一次';
 }
 def({id:'alignment-outpost',file:'alignment-outpost.glb',kind:'outpost',requiredNodes:['Sign_Board']});
 const gatePoint=route(4),gateNext=route(4.1),gate=place('alignment-outpost',gatePoint,{x:1,y:1,z:1},Math.atan2(gateNext.x-gatePoint.x,gateNext.z-gatePoint.z)+Math.PI);gate.label='ANTHROPIC · 碳基对齐试验场|便便山野外分部 / 非官方恶搞';
 def({id:'claude-asterisk',file:'claude-asterisk.glb',kind:'asterisk'});
 def({id:'plunger-shrine',file:'plunger-shrine.glb',kind:'plunger'});
 def({id:'context-paper',file:'context-paper.glb',kind:'paper'});
 // Props sit beyond the clear walking strip; the silhouettes read from both the trail and overview.
 for(const [s,asset,side] of [[12,'claude-asterisk',1],[48,'context-paper',1],[90,'claude-asterisk',1],[108,'plunger-shrine',1],[146,'context-paper',1],[180,'plunger-shrine',1]] as const){
  const p=route(s),out=new T.Vector3(p.x,0,p.z+18).normalize();if(out.lengthSq()<.01)out.set(1,0,0);
  const prop=place(asset,{x:p.x+out.x*side*1.35+out.z*.55,y:p.y-.04,z:p.z+out.z*side*1.35-out.x*.55},{x:1,y:1,z:1},Math.atan2(out.x,out.z));prop.decorative=true;
 }
 // Oversized paper supply and the orange emblem identify the base camp from afar.
 place('context-paper',{x:-3.4,y:0,z:1.7},{x:1.45,y:1.45,z:1.45},-.2).decorative=true;
 place('claude-asterisk',{x:4.3,y:0,z:3.4},{x:1.45,y:1.45,z:1.45},.6).decorative=true;
 def({id:'rock',file:'rock.glb',kind:'rock'});def({id:'tree',file:'tree.glb',kind:'tree'});
 let seed=1031;const random=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
 for(let i=0;i<36;i++){const a=i/36*Math.PI*2,r=37+random()*4;place(i%3?'tree':'rock',{x:Math.sin(a)*r,y:0,z:-18+Math.cos(a)*r},{x:.8+random(),y:.8+random(),z:.8+random()});}
 for(const s of CHECKPOINTS.slice(1,-1)){const p=route(s),radial=new T.Vector3(p.x,0,p.z+18).normalize();for(const side of[-1,1]){const stone=place('rock',{x:p.x+radial.x*side*1.25,y:p.y+.16,z:p.z+radial.z*side*1.25},{x:.13,y:.13,z:.13});stone.dynamic=true;}}
 return{definitions,placements};
}
export const ART_LAYOUT=createArtLayout();export const ART_DEFINITIONS=ART_LAYOUT.definitions;
