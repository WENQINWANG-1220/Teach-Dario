import * as T from 'three';
import {CHECKPOINTS,LENGTH,route,type Point} from '../model';
import {trailBlocks,CHALLENGES,type Block} from '../terrain';
export const HIKER_NODES=['Pelvis','Head','Hand_L','Hand_R','Torso','Shoulder_L','Elbow_L','Shoulder_R','Elbow_R','Leg_L','Thigh_L','Shin_L','Shoe_L','Leg_R','Thigh_R','Shin_R','Shoe_R'] as const;
export type ArtKind='hiker'|'box'|'wall'|'ruin-step'|'log'|'stone'|'tree'|'hill'|'rock'|'flower'|'flag'|'sign'|'water';
export interface ArtDefinition {id:string;file:string;kind:ArtKind;color?:string;size?:Point;requiredNodes?:readonly string[];axis?:string}
export interface Placement {asset:string;position:Point;scale:Point;rotation:{x:number;y:number;z:number;w:number};block?:Block;solidRock?:number;label?:string;flag?:boolean;dynamic?:boolean}
export interface ArtLayout {definitions:ArtDefinition[];placements:Placement[]}
const ONE={x:1,y:1,z:1};
/** Data only: shared by the GLB exporter and runtime; contains no mesh construction. */
export function createArtLayout():ArtLayout {
  const definitions:ArtDefinition[]=[{id:'hiker',file:'hiker.glb',kind:'hiker',requiredNodes:HIKER_NODES,axis:'Rig v2; Y up, facing -Z; unit Y leg meshes, fixed driver scale Y=0.43; fifteen sibling physical drivers'}],placements:Placement[]=[];
  const addDef=(d:ArtDefinition)=>{if(!definitions.some(a=>a.id===d.id))definitions.push(d);return d.id;};
  const place=(asset:string,position:Point,scale=ONE,angles=[0,0,0])=>{const q=new T.Quaternion().setFromEuler(new T.Euler(...angles as [number,number,number]));const p:Placement={asset,position:{...position},scale:{...scale},rotation:{x:q.x,y:q.y,z:q.z,w:q.w}};placements.push(p);return p;};
  const piece=(b:Block)=>{
    const kind:ArtKind=['wall','ruin-step','log','stone'].includes(b.kind??'')?b.kind as ArtKind:'box';
    const id=`terrain-${b.kind??'block'}-${b.color.slice(1)}${kind==='log'?`-${Math.round(b.size.x*100)}`:''}`;
    const size=kind==='log'?{x:b.size.x,y:b.size.x,z:12}:kind==='wall'?{x:.92,y:2.25,z:1}:kind==='ruin-step'?{x:1.65,y:.65,z:1.15}:kind==='stone'?{x:1.25,y:1.4,z:1.08}:ONE;
    addDef({id,file:`${id}.glb`,kind,color:b.color,size,axis:kind==='log'?'Cylinder length along Y; size.z is length':'Y up; origin at geometry center'});
    const scale=kind==='log'?{x:b.size.x/size.x,y:b.size.z/size.z,z:b.size.x/size.x}:{x:b.size.x/size.x,y:b.size.y/size.y,z:b.size.z/size.z};
    const p=place(id,b.p,scale,[0,b.yaw??0,0]);if(b.rotation)p.rotation={...b.rotation};p.block=b;
  };
  const hill=(x:number,y:number,z:number,r:number,color:string)=>{const id=`hill-${color.slice(1)}`;addDef({id,file:`${id}.glb`,kind:'hill',color});const trail=route(Math.max(0,Math.min(LENGTH,-z))),side=x>=trail.x?1:-1;const safeX=trail.x+side*Math.max(Math.abs(x-trail.x),r+3.1);place(id,{x:safeX,y,z},{x:r,y:r,z:r},[0,random()*6,0]);};
  const tree=(x:number,y:number,z:number,s:number)=>{addDef({id:'tree',file:'tree.glb',kind:'tree'});place('tree',{x,y,z},{x:s,y:s,z:s});};
  const rock=(x:number,y:number,z:number,r:number,solid=false)=>{addDef({id:'rock',file:'rock.glb',kind:'rock'});const p=place('rock',{x,y:y+r*.4,z},{x:r,y:r,z:r},[.2,random()*3,.2]);if(solid)p.solidRock=r*.8;};
  const sign=(x:number,y:number,z:number,label:string)=>{addDef({id:'sign',file:'sign.glb',kind:'sign',requiredNodes:['Sign_Board']});place('sign',{x,y,z}).label=label;};
  let seed=12345;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  trailBlocks().forEach(piece);
  for(let s=24;s<=60;s+=6){const p=route(s);for(const side of [-1,1]){const h=.5+((s+side+4)%4)*.28;
    piece({p:{x:p.x+side*2,y:p.y-1.2+h/2,z:p.z},size:{x:.65,y:h,z:1.2},color:'#a77c65'});
    if(s%12===0)piece({p:{x:p.x+side*2.25,y:p.y+.15,z:p.z+.4},size:{x:.17,y:2.4,z:.17},color:'#87735a'});
  }}
  CHALLENGES.forEach(c=>{const p=route(c.checkpoint);sign(p.x-2.35,p.y,p.z-1.5,c.name);});
  for(const s of [80,106]){const p=route(s);rock(p.x-2.2,p.y-3,p.z,1.5);rock(p.x+2.4,p.y-3,p.z,1.2);}
  addDef({id:'water',file:'water.glb',kind:'water',axis:'XZ plane, Y up'});place('water',{x:route(94).x,y:-3,z:-94},{x:20,y:1,z:38});
  for(let i=0;i<125;i++){
    const s=random()*LENGTH,p=route(s),side=random()>.5?1:-1;
    const x=p.x+side*(3+random()*15),y=p.y-1.8-random()*3,z=p.z+random()*5;if(s>73&&s<112)continue;
    const challenge=s>=24&&s<=64||s>=134&&s<=164;
    hill(x+(challenge?side*3:0),y-(challenge?4:1),z,3+random()*(challenge?2:5),'#91a277');
    if(i%3!==0)tree(x,y+.5,z,.75+random());else rock(x,y+.3,z,1+random());
  }
  for(let i=0;i<30;i++){const x=(random()-.5)*130,z=-150-random()*90;hill(x,-12,z,20+random()*28,i%2?'#8caaa0':'#a5b7a0');}
  for(let i=0;i<42;i++){const x=(random()-.5)*17,z=7-random()*16,color=random()>.5?'#e9d392':'#f1e5c6',id=`flower-${color.slice(1)}`;addDef({id,file:`${id}.glb`,kind:'flower',color});place(id,{x,y:-.04,z});}
  CHECKPOINTS.forEach((s,i)=>{const p=route(s),id=i===CHECKPOINTS.length-1?'flag-finish':'flag';addDef({id,file:`${id}.glb`,kind:'flag',color:i===CHECKPOINTS.length-1?'#e3b95b':'#d07650',requiredNodes:['Flag_Cloth']});place(id,{x:p.x-1.2,y:p.y+.05,z:p.z}).flag=true;
    if(i)sign(p.x+2.5,p.y,p.z,i===CHECKPOINTS.length-1?'山顶 · 你做到了':`休息站 ${String(i).padStart(2,'0')}`);
  });
  // Loose props are part of the shared deterministic layout and the exported preview.
  for(const s of [3,12,22,46,64,74,94,110,122,134,164]){const p=route(s);for(let i=0;i<2;i++){const r=.10+random()*.045,side=i?1:-1;const prop=place('rock',{x:p.x+side*(.9+random()*.25),y:p.y+r+.06,z:p.z+(random()-.5)*1.4},{x:r,y:r,z:r},[random()*.3,random()*6,random()*.3]);prop.dynamic=true;}
    if(s!==3&&s!==94){const prop=place('terrain-log-926945-90',{x:p.x+1.15,y:p.y+.18,z:p.z+.7},{x:.2,y:.8/12,z:.2},[Math.PI/2,random()*2,0]);prop.dynamic=true;}}  const start=route(0);sign(start.x-2.8,.02,-2,'慢慢来，山会等你');tree(-7,-.1,0,1.5);tree(6,-.1,-7,1.2);rock(4,0,3,.7);
  return {definitions,placements};
}
export const ART_LAYOUT=createArtLayout();
export const ART_DEFINITIONS=ART_LAYOUT.definitions;
