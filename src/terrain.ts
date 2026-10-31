import * as T from 'three';
import R from '@dimforge/rapier3d-compat';
import {CHECKPOINTS,LENGTH,route,BRIDGES,type Point} from './model';
export const TERRAIN_GROUP=0x00010006;
export type TerrainKind='path'|'rest'|'ruin-step'|'wall'|'log'|'stone'|'support'|'slide'|'rail'|'base';
export interface Block {p:Point;size:Point;color:string;yaw?:number;kind?:TerrainKind;rotation?:{x:number;y:number;z:number;w:number}}
export const CHALLENGES=BRIDGES.map((b,i)=>({id:`bridge-${i}`,name:`${i+1}号独木桥 · 掉下直达山脚`,start:b.start,end:b.end,checkpoint:i===0?48:108,hint:'桥下是单向滑道，摔下会失去登山检查点'}));
export function footSpacing(s:number){return BRIDGES.some(b=>s>=b.start&&s<=b.end)?.10:.14;}
export interface SlideLane {id:number;start:Point;end:Point;width:number;bridge:typeof BRIDGES[number]}
export const SLIDE_LANES:SlideLane[]=BRIDGES.map((bridge,id)=>{
 const p=route((bridge.start+bridge.end)/2),d=new T.Vector3(p.x,0,p.z+18).normalize();
 return{id,bridge,start:{x:p.x-d.x*3,y:p.y-.75,z:p.z-d.z*3},end:{x:p.x+d.x*22,y:.04,z:p.z+d.z*22},width:id===0?11:8};
});
export function laneCoordinates(p:Point,lane:SlideLane){const dx=lane.end.x-lane.start.x,dz=lane.end.z-lane.start.z,length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length,rx=p.x-lane.start.x,rz=p.z-lane.start.z,t=(rx*ux+rz*uz)/length;return{t,lateral:rx*(-uz)+rz*ux,floor:lane.start.y+(lane.end.y-lane.start.y)*t,length};}
export function addTerrainCollider(world:R.World,b:Block){
 const yaw=b.yaw??0,rotation=b.rotation??{x:0,y:Math.sin(yaw/2),z:0,w:Math.cos(yaw/2)};
 const body=world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(b.p.x,b.p.y,b.p.z).setRotation(rotation));
 const shape=b.kind==='log'?R.ColliderDesc.cylinder(b.size.z/2,b.size.x/2):b.kind==='base'?R.ColliderDesc.cylinder(b.size.y/2,b.size.x/2):R.ColliderDesc.cuboid(b.size.x/2,b.size.y/2,b.size.z/2);
 world.createCollider(shape.setFriction(b.kind==='slide'||b.kind==='rail'?.025:b.kind==='log'?.65:.85).setFrictionCombineRule(R.CoefficientCombineRule.Min).setRestitution(.01).setCollisionGroups(TERRAIN_GROUP),body);return body;
}
function segment(a:Point,b:Point,width:number,thickness:number,color:string,kind:TerrainKind):Block{
 const forward=new T.Vector3(b.x-a.x,b.y-a.y,b.z-a.z),length=forward.length(),z=forward.clone().normalize(),x=new T.Vector3(z.z,0,-z.x).normalize(),y=new T.Vector3().crossVectors(z,x).normalize();
 const rotation=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));
 return{p:{x:(a.x+b.x)/2-y.x*thickness/2,y:(a.y+b.y)/2-y.y*thickness/2,z:(a.z+b.z)/2-y.z*thickness/2},size:{x:width,y:thickness,z:length+.035},color,kind,rotation};
}
export function trailBlocks():Block[]{
 const blocks:Block[]=[{p:{x:0,y:-.45,z:-18},size:{x:86,y:.9,z:86},color:'#b4bb83',kind:'base'}];
 for(let s=0;s<LENGTH;s+=.6){if(BRIDGES.some(b=>s>=b.start&&s<b.end))continue;const a=route(s),b=route(Math.min(LENGTH,s+.6));if(Math.hypot(a.x-b.x,a.z-b.z)<.001)continue;blocks.push(segment(a,b,s<12?3.4:2.5,.3,s>=164?'#dbc58f':'#d9bb89','path'));}
 for(const b of BRIDGES){const a=route(b.start),c=route(b.end),direction=new T.Vector3(c.x-a.x,c.y-a.y,c.z-a.z),rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),direction.clone().normalize());blocks.push({p:{x:(a.x+c.x)/2,y:(a.y+c.y)/2-b.diameter/2,z:(a.z+c.z)/2},size:{x:b.diameter,y:b.diameter,z:direction.length()+.2},color:'#926945',kind:'log',rotation});}
 for(const s of CHECKPOINTS){const p=route(s);blocks.push({p:{...p,y:p.y-.2},size:{x:3.8,y:.4,z:3.8},color:'#e1cda4',kind:'rest'});}
 for(const lane of SLIDE_LANES){
   blocks.push(segment(lane.start,lane.end,lane.width,.35,'#c98543','slide'));
   const d=new T.Vector3(lane.end.x-lane.start.x,0,lane.end.z-lane.start.z).normalize(),side=new T.Vector3(-d.z,0,d.x);
   for(const sign of[-1,1]){const a=new T.Vector3().copy(lane.start).addScaledVector(side,sign*(lane.width/2+.12)),b=new T.Vector3().copy(lane.end).addScaledVector(side,sign*(lane.width/2+.12));a.y+=.35;b.y+=.35;blocks.push(segment(a,b,.25,.7,'#92552f','rail'));}
 }
 blocks.push({p:{x:0,y:21.8,z:-18},size:{x:6,y:.4,z:6},color:'#e6d1a4',kind:'rest'});
 return blocks;
}
