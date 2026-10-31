import * as T from 'three';
import R from '@dimforge/rapier3d-compat';
import {CHECKPOINTS,LENGTH,route,BRIDGES,SEESAW,type Point} from './model';
export const TERRAIN_GROUP=0x00010006;
export type TerrainKind='path'|'rest'|'ruin-step'|'wall'|'log'|'stone'|'support'|'slide'|'rail'|'base';
export interface Block {p:Point;size:Point;color:string;yaw?:number;kind?:TerrainKind;rotation?:{x:number;y:number;z:number;w:number}}
export const CHALLENGES=[{id:'seesaw',name:'跷跷板 · Scaling Laws',start:SEESAW.start,end:SEESAW.end,checkpoint:12,hint:'小步走过支点，等桥面稳住再换脚'},...BRIDGES.map((b,i)=>({id:`bridge-${i}`,name:`${i+1}号独木桥 · 泥坡直达山脚`,start:b.start,end:b.end,checkpoint:i===0?48:108,hint:'桥下泥沟沿山盘旋，失足后会一路滑回山脚'}))];
export function footSpacing(s:number){return BRIDGES.some(b=>s>=b.start&&s<=b.end)?.10:.14;}
export interface SlideLane {id:number;start:Point;end:Point;width:number;bridge:typeof BRIDGES[number];points:Point[];widths:number[]}
function outside(p:Point,offset:number,y:number):Point{const r=Math.hypot(p.x,p.z+18);return{x:p.x*(r+offset)/r,y,z:-18+(p.z+18)*(r+offset)/r};}
export const SLIDE_LANES:SlideLane[]=BRIDGES.map((bridge,id)=>{
 const middle=(bridge.start+bridge.end)/2,p=route(middle),width=id===0?11:8;
 const points:Point[]=[outside(p,-2.5,p.y-.9),outside(p,1.5,p.y-2.6)];
 const widths=[width,7];
 // The outer mud gutter follows the mountain's winding contour, below the climbing road.
 // Both tributaries share identical downstream points, making their confluence continuous.
 for(let s=middle-2;s>=20;s-=2){points.push(outside(route(s),1.5,Math.max(.04,route(s).y-2.6)));widths.push(s>=middle-2?6:s>=middle-4?4.8:s>=middle-6?4:3.4);}
 const last=points[points.length-1],radial=new T.Vector3(last.x,0,last.z+18).normalize();
 points.push({x:last.x+radial.x*5,y:.04,z:last.z+radial.z*5});widths.push(5.2);
 return{id,bridge,start:points[0],end:points[points.length-1],width,points,widths};
});
/** Closest point on the actual curved channel, with cumulative downstream progress. */
export function laneCoordinates(p:Point,lane:SlideLane){
 let length=0;const lengths:number[]=[];for(let i=0;i<lane.points.length-1;i++){const a=lane.points[i],b=lane.points[i+1],d=Math.hypot(b.x-a.x,b.z-a.z);lengths.push(d);length+=d;}
 let traversed=0,best=Infinity,result={t:0,lateral:0,floor:lane.start.y,length,width:lane.width,direction:{x:0,y:0,z:1},segment:0,distance:0};
 for(let i=0;i<lengths.length;i++){
   const a=lane.points[i],b=lane.points[i+1],d=lengths[i],ux=(b.x-a.x)/d,uz=(b.z-a.z)/d,along=(p.x-a.x)*ux+(p.z-a.z)*uz,local=T.MathUtils.clamp(along/d,0,1);
   const x=a.x+(b.x-a.x)*local,z=a.z+(b.z-a.z)*local,floor=a.y+(b.y-a.y)*local;
   // Height disambiguates different turns of the winding descent.
   const distance=Math.hypot(p.x-x,p.z-z),score=distance*distance+Math.max(0,Math.abs(p.y-floor)-1.8)**2*.2;
   if(score<best){best=score;result={t:(traversed+(i===0&&along<0||i===lengths.length-1&&along>d?along:local*d))/length,lateral:(p.x-x)*(-uz)+(p.z-z)*ux,floor,length,width:lane.widths[i]+(lane.widths[i+1]-lane.widths[i])*local,direction:{x:ux,y:(b.y-a.y)/d,z:uz},segment:i,distance};}
   traversed+=d;
 }
 return result;
}
export function addTerrainCollider(world:R.World,b:Block){
 const yaw=b.yaw??0,rotation=b.rotation??{x:0,y:Math.sin(yaw/2),z:0,w:Math.cos(yaw/2)};
 const body=world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(b.p.x,b.p.y,b.p.z).setRotation(rotation));
 const shape=b.kind==='log'?R.ColliderDesc.cylinder(b.size.z/2,b.size.x/2):b.kind==='base'?R.ColliderDesc.cylinder(b.size.y/2,b.size.x/2):R.ColliderDesc.cuboid(b.size.x/2,b.size.y/2,b.size.z/2);
 world.createCollider(shape.setFriction(b.kind==='slide'||b.kind==='rail'?.025:b.kind==='log'?.65:.85).setFrictionCombineRule(R.CoefficientCombineRule.Min).setRestitution(.01).setCollisionGroups(TERRAIN_GROUP),body);return body;
}
function segment(a:Point,b:Point,width:number,thickness:number,color:string,kind:TerrainKind):Block{
 const forward=new T.Vector3(b.x-a.x,b.y-a.y,b.z-a.z),length=forward.length(),z=forward.clone().normalize(),x=new T.Vector3(z.z,0,-z.x).normalize(),y=new T.Vector3().crossVectors(z,x).normalize();
 const rotation=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));
 return{p:{x:(a.x+b.x)/2-y.x*thickness/2,y:(a.y+b.y)/2-y.y*thickness/2,z:(a.z+b.z)/2-y.z*thickness/2},size:{x:width,y:thickness,z:length+(kind==='slide'||kind==='rail'?.5:.06)},color,kind,rotation};
}
/** Small continuous ruts, fading to level ground at camps, bridge approaches and the tutorial. */
export function trailRoughness(s:number){
 if(s<13||s>162)return 0;
 const clearance=Math.min(...CHECKPOINTS.map(c=>Math.abs(s-c)),...[SEESAW,...BRIDGES].flatMap(b=>[Math.abs(s-b.start),Math.abs(s-b.end)]));
 const fade=T.MathUtils.smoothstep(clearance,.9,3);
 return fade*(Math.sin(s*1.7)*.075+Math.sin(s*3.2)*.025);
}
export function trailBlocks():Block[]{
 const blocks:Block[]=[{p:{x:0,y:-.45,z:-18},size:{x:86,y:.9,z:86},color:'#a49b68',kind:'base'}];
 for(let s=0;s<LENGTH;s+=.4){if([SEESAW,...BRIDGES].some(b=>s>=b.start-1e-5&&s<b.end-1e-5))continue;const a=route(s),b=route(Math.min(LENGTH,s+.4));a.y+=trailRoughness(s);b.y+=trailRoughness(s+.4);if(Math.hypot(a.x-b.x,a.z-b.z)<.001)continue;
   const width=s<12?3.4:2.35+.22*Math.sin(s*.63),color=Math.floor(s/7)%2?'#a97950':'#b88b5e';
   blocks.push(segment(a,b,width,.4,color,'path'));
 }
 for(const b of BRIDGES){const a=route(b.start),c=route(b.end),direction=new T.Vector3(c.x-a.x,c.y-a.y,c.z-a.z),rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),direction.clone().normalize());blocks.push({p:{x:(a.x+c.x)/2,y:(a.y+c.y)/2-b.diameter/2,z:(a.z+c.z)/2},size:{x:b.diameter,y:b.diameter,z:direction.length()+.2},color:'#926945',kind:'log',rotation});}
 for(const s of CHECKPOINTS){const p=route(s);blocks.push({p:{...p,y:p.y-.2},size:{x:3.8,y:.4,z:3.8},color:'#c99e6d',kind:'rest'});}
 // Extend the approach shoulder under Sam's projector, connecting it to the walking strip.
 const approach=route(SEESAW.start-2),outward=new T.Vector3(approach.x,0,approach.z+18).normalize();
 blocks.push({p:{x:approach.x+outward.x*1.55,y:approach.y-.2,z:approach.z+outward.z*1.55},size:{x:1.65,y:.4,z:1.9},yaw:Math.atan2(-outward.z,outward.x),color:'#c99e6d',kind:'rest'});
 const unique=new Set<string>();
 const add=(b:Block)=>{const key=JSON.stringify([b.kind,b.p,b.size,b.rotation]);if(!unique.has(key)){unique.add(key);blocks.push(b);}};
 // A broad, level mud catch basin seals the inside wedge at each radial-to-spiral elbow.
 for(const lane of SLIDE_LANES){const p=lane.points[1];add({p:{x:p.x,y:p.y-.38,z:p.z},size:{x:7,y:.6,z:7},color:'#9d653c',kind:'slide'});}
 for(const lane of SLIDE_LANES)for(let i=0;i<lane.points.length-1;i++){
   const a=lane.points[i],b=lane.points[i+1],width=Math.max(lane.widths[i],lane.widths[i+1]);
   add(segment(a,b,width,.6,'#9d653c','slide'));
   const d=new T.Vector3(b.x-a.x,0,b.z-a.z).normalize(),side=new T.Vector3(-d.z,0,d.x);
   for(const sign of[-1,1]){
     const ra=new T.Vector3().copy(a).addScaledVector(side,sign*(width/2+.10)),rb=new T.Vector3().copy(b).addScaledVector(side,sign*(width/2+.10));ra.y+=.45;rb.y+=.45;
     const midpoint=ra.clone().add(rb).multiplyScalar(.5);
     // Leave a real open confluence where a tributary meets the shared gutter.
     if(SLIDE_LANES.some(other=>other!==lane&&(()=>{const c=laneCoordinates(midpoint,other);return c.distance<c.width/2-.15&&Math.abs(midpoint.y-.45-c.floor)<.65;})()))continue;
     add(segment(ra,rb,.45,.9,'#70452c','rail'));
   }
 }
 blocks.push({p:{x:0,y:21.8,z:-18},size:{x:6,y:.4,z:6},color:'#e6d1a4',kind:'rest'});
 return blocks;
}
