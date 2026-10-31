import RAPIER from '@dimforge/rapier3d-compat';
import { CHECKPOINTS, LENGTH, route, type Point } from './model';
export const TERRAIN_GROUP = 0x00010006;
export type TerrainKind = 'path'|'rest'|'ruin-step'|'wall'|'log'|'stone'|'support';
export interface Block { p: Point; size: Point; color: string; yaw?: number; kind?:TerrainKind; rotation?:{x:number;y:number;z:number;w:number} }
export const CHALLENGES = [
  {id:'steps',name:'错层遗迹石阶',start:24,end:44,checkpoint:22,hint:'小步抬脚，前倾越过高差'},
  {id:'wall',name:'折线窄墙',start:48,end:62,checkpoint:46,hint:'沿墙顶落脚，转角先调整重心'},
  {id:'log',name:'悬谷独木桥',start:78,end:108,checkpoint:74,hint:'脚印靠近木头中心，小幅左右倾斜'},
  {id:'stones',name:'踏石越隙',start:136,end:162,checkpoint:134,hint:'看清空隙，先把脚放到下一块石头'},
] as const;
export function footSpacing(s:number){return s>=78&&s<=108?.10:s>=48&&s<=62?.14:s>=136&&s<=162?.11:.14;}
export function addTerrainCollider(world:RAPIER.World,b:Block){
  const yaw=b.yaw??0,rotation=b.rotation??{x:0,y:Math.sin(yaw/2),z:0,w:Math.cos(yaw/2)};
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(b.p.x,b.p.y,b.p.z).setRotation(rotation));
  const shape=b.kind==='log'?RAPIER.ColliderDesc.cylinder(b.size.z/2,b.size.x/2):RAPIER.ColliderDesc.cuboid(b.size.x/2,b.size.y/2,b.size.z/2);
  world.createCollider(shape.setFriction(b.kind==='log'?.65:b.kind==='path'||b.kind==='rest'?.85:.75).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(.02).setCollisionGroups(TERRAIN_GROUP),body);return body;
}
export function trailBlocks(): Block[] {
  const blocks: Block[] = [{ p: { x: 0, y: -.5, z: 0 }, size: { x: 18, y: .8, z: 22 }, color: '#a1ad70' }];
  for (let s = -6; s < LENGTH + 3; s += 1.5) {
    const p = route(s), next = route(s + 1.5);
    if(s>=24&&s<44||s>=48&&s<62||s>=78&&s<108||s>=136&&s<162)continue;
    const width = s < 12 ? 4.8 : s > 133 ? 2.6 : 3.5;
    const yaw = -Math.atan2(next.x - p.x, -(next.z - p.z));
    const pos = { x: (p.x + next.x) / 2, y: p.y - .2, z: (p.z + next.z) / 2 };
    blocks.push({ p: pos, size: { x: width, y: .4, z: 1.75 }, color: s > 122 ? '#c4bca1' : '#d6c7a1', yaw,kind:'path' });
    blocks.push({ p: { ...pos, y: p.y - .8 }, size: { x: width + 1.5, y: 1, z: 1.7 }, color: s > 122 ? '#899477' : '#99a46b', yaw,kind:'support' });
  }
  // Uneven but reachable risers, with no hidden broad floor underneath.
  for(let s=24;s<44;s+=1){const p=route(s),next=route(s+1),height=.65;
    blocks.push({p:{x:p.x+Math.sin((s-24)*1.5)*.15,y:p.y-height/2,z:p.z},size:{x:1.65,y:height,z:1.15},color:s%2?'#b77b60':'#c48a6b',yaw:-Math.atan2(next.x-p.x,1),kind:'ruin-step'});
  }
  // Walkable wall tops form the route itself; there are no guard rails.
  for(let s=48;s<62;s+=.75){const p=route(s),next=route(Math.min(62,s+.75)),h=2.25;
    blocks.push({p:{x:(p.x+next.x)/2,y:p.y-h/2,z:(p.z+next.z)/2},size:{x:.92,y:h,z:Math.hypot(next.x-p.x,next.z-p.z)+.08},color:Math.round(s/.75)%2?'#b97a60':'#c68b6b',yaw:-Math.atan2(next.x-p.x,-(next.z-p.z)),kind:'wall'});
  }
  for(const [a,b,diameter] of [[78,90,.9],[96,108,.76]]){
    const p=route(a),q=route(b),dx=q.x-p.x,dz=q.z-p.z,len=Math.hypot(dx,dz),r=diameter/2;
    blocks.push({p:{x:(p.x+q.x)/2,y:p.y-r,z:(p.z+q.z)/2},size:{x:diameter,y:diameter,z:len+.3},color:'#926945',kind:'log',rotation:{x:dz/len/Math.SQRT2,y:0,z:-dx/len/Math.SQRT2,w:Math.SQRT1_2}});
  }
  // A resting island splits the logs, giving room to reset stance and a new checkpoint.
  const island=route(93);blocks.push({p:{...island,y:island.y-.3},size:{x:3.6,y:.6,z:6.2},color:'#c4b695',kind:'rest'});
  for(let s=136;s<=162;s+=1.35){const p=route(s),h=1.4;
    blocks.push({p:{x:p.x,y:p.y-h/2,z:p.z},size:{x:1.25,y:h,z:1.08},color:Math.round(s/1.35)%2?'#a4a48c':'#c1b99c',kind:'stone'});
  }
  for(const s of CHECKPOINTS){const p=route(s);blocks.push({p:{x:p.x,y:p.y-.22,z:p.z},size:{x:4.2,y:.44,z:3.6},color:'#c9bc9a',kind:'rest'});}
  for(const s of [44,62]){const p=route(s);blocks.push({p:{x:p.x,y:p.y-.2,z:p.z},size:{x:3.2,y:.4,z:1.6},color:'#c49e7b',kind:'rest'});}
  const end = route(LENGTH);
  blocks.push({ p: { x: end.x, y: end.y - .15, z: end.z - 2 }, size: { x: 7, y: .4, z: 7 }, color: '#c9bfa1' });
  return blocks;
}
