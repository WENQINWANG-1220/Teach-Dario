import * as T from 'three';
import {CHECKPOINTS,route,type Point} from '../model';
import {TOILET_POSITION} from '../model';
import {trailBlocks,SLIDE_LANES,type Block} from '../terrain';
export const HIKER_NODES=['Pelvis','Head','Hand_L','Hand_R','Torso','Shoulder_L','Elbow_L','Shoulder_R','Elbow_R','Leg_L','Thigh_L','Shin_L','Shoe_L','Leg_R','Thigh_R','Shin_R','Shoe_R'] as const;
export type ArtKind='hiker'|'box'|'wall'|'ruin-step'|'log'|'stone'|'tree'|'hill'|'rock'|'flower'|'flag'|'sign'|'water'|'toilet'|'poop'|'base';
export interface ArtDefinition{id:string;file:string;kind:ArtKind;color?:string;size?:Point;requiredNodes?:readonly string[];axis?:string}
export interface Placement{asset:string;position:Point;scale:Point;rotation:{x:number;y:number;z:number;w:number};block?:Block;label?:string;flag?:boolean;dynamic?:boolean}
export interface ArtLayout{definitions:ArtDefinition[];placements:Placement[]}
export function createArtLayout():ArtLayout{
 const definitions:ArtDefinition[]=[],placements:Placement[]=[];
 const def=(d:ArtDefinition)=>{if(!definitions.some(x=>x.id===d.id))definitions.push(d);return d.id;};
 const place=(asset:string,position:Point,scale={x:1,y:1,z:1},yaw=0)=>{const p:Placement={asset,position:{...position},scale:{...scale},rotation:new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw)};placements.push(p);return p;};
 def({id:'hiker',file:'hiker.glb',kind:'hiker',requiredNodes:HIKER_NODES});
 def({id:'poop-mountain',file:'poop-mountain.glb',kind:'poop',requiredNodes:['Poop_Base','Poop_Middle','Poop_Crown']});place('poop-mountain',{x:0,y:0,z:-18});
 for(const b of trailBlocks()){
  const kind:ArtKind=b.kind==='log'?'log':b.kind==='base'?'base':'box';
  const id=`terrain-${b.kind}-${b.color.slice(1)}${kind==='log'?'-'+Math.round(b.size.x*100):''}`;
  const size=kind==='log'?{x:b.size.x,y:b.size.x,z:12}:{x:1,y:1,z:1};
  def({id,file:id+'.glb',kind,color:b.color,size});
  const scale=kind==='log'?{x:1,y:b.size.z/12,z:1}:{x:b.size.x,y:b.size.y,z:b.size.z};
  const p=place(id,b.p,scale,b.yaw);p.block=b;if(b.rotation)p.rotation={x:b.rotation.x,y:b.rotation.y,z:b.rotation.z,w:b.rotation.w};
 }
 def({id:'golden-toilet',file:'golden-toilet.glb',kind:'toilet',requiredNodes:['Toilet_Bowl','Toilet_Tank','Interaction_Anchor']});place('golden-toilet',TOILET_POSITION);
 def({id:'sign',file:'sign.glb',kind:'sign',requiredNodes:['Sign_Board']});
 def({id:'flag',file:'flag.glb',kind:'flag',color:'#d77640',requiredNodes:['Flag_Cloth']});
 def({id:'flag-finish',file:'flag-finish.glb',kind:'flag',color:'#e8bd4c',requiredNodes:['Flag_Cloth']});
 CHECKPOINTS.forEach((s,i)=>{const p=route(s),radial=new T.Vector3(p.x,0,p.z+18).normalize();const flag=place(i===CHECKPOINTS.length-1?'flag-finish':'flag',{x:p.x+radial.x*1.5,y:p.y,z:p.z+radial.z*1.5});flag.flag=true;
  const sign=place('sign',{x:p.x-radial.x*1.6,y:p.y,z:p.z-radial.z*1.6},Math.abs(radial.x)>.1?{x:.8,y:.8,z:.8}:{x:1,y:1,z:1},Math.atan2(radial.x,radial.z));sign.label=i===0?'便便山 · 从这里对齐双腿':i===CHECKPOINTS.length-1?'黄金马桶 · 人类终极智慧':`迭代站 ${i} · 继续向上`;
 });
 for(const lane of SLIDE_LANES){const d=new T.Vector3(lane.end.x-lane.start.x,0,lane.end.z-lane.start.z).normalize();const sign=place('sign',{x:lane.start.x-d.z*(lane.width/2+1),y:lane.start.y+1,z:lane.start.z+d.x*(lane.width/2+1)});sign.label='单向滑道 ↓ 直达山脚';const exit=place('sign',{x:lane.end.x+1.8,y:0,z:lane.end.z+1.8});exit.label='欢迎回到山脚 · R 重新登山';}
 def({id:'rock',file:'rock.glb',kind:'rock'});def({id:'tree',file:'tree.glb',kind:'tree'});
 let seed=1031;const random=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
 for(let i=0;i<36;i++){const a=i/36*Math.PI*2,r=37+random()*4;place(i%3?'tree':'rock',{x:Math.sin(a)*r,y:0,z:-18+Math.cos(a)*r},{x:.8+random(),y:.8+random(),z:.8+random()});}
 for(const s of CHECKPOINTS.slice(1,-1)){const p=route(s),radial=new T.Vector3(p.x,0,p.z+18).normalize();for(const side of[-1,1]){const stone=place('rock',{x:p.x+radial.x*side*1.25,y:p.y+.16,z:p.z+radial.z*side*1.25},{x:.13,y:.13,z:.13});stone.dynamic=true;}}
 return{definitions,placements};
}
export const ART_LAYOUT=createArtLayout();export const ART_DEFINITIONS=ART_LAYOUT.definitions;
