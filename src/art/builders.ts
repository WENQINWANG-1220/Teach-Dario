/** Offline art source. Imported by the exporter only, never by the playable entry. */
import * as T from 'three';
import type {ArtDefinition} from './layout';
import {RIG} from '../rig';
import {SLIDE_LANES,laneCoordinates} from '../terrain';
import {route} from '../model';
const material=(color:string)=>new T.MeshStandardMaterial({color,roughness:1,flatShading:true});
function mesh(parent:T.Object3D,geometry:T.BufferGeometry,mat:T.Material,p:number[],name?:string){
  // glTF has no flatShading flag: bake face normals into the offline geometry.
  const flat=geometry.index?geometry.toNonIndexed():geometry;flat.computeVertexNormals();if(flat!==geometry)geometry.dispose();
  const m=new T.Mesh(flat,mat);m.position.set(p[0],p[1],p[2]);if(name)m.name=name;m.castShadow=m.receiveShadow=true;parent.add(m);return m;
}
function group(parent:T.Object3D,name:string,p=[0,0,0]){const g=new T.Group();g.name=name;g.position.set(p[0],p[1],p[2]);parent.add(g);return g;}
export function buildHiker(){
  const root=new T.Group();root.name='Hiker';const skin=material('#e8b68d'),shirt=material('#d78453'),shorts=material('#425d59'),socks=material('#e8dfc8'),boot=material('#685447'),hat=material('#b4a169');
  const nodes=new Map<string,T.Group>();
  for(const d of RIG.bodies){const node=group(root,d.id);nodes.set(d.id,node);if(d.id==='Pelvis')mesh(node,new T.BoxGeometry(.34,.23,.23),shorts,[0,0,0]);
    else if(d.id==='Torso'){mesh(node,new T.CapsuleGeometry(.18,.22,3,8),shirt,[0,0,0]);mesh(node,new T.BoxGeometry(.28,.36,.15),material('#6e7a52'),[0,-.01,.23]);for(const x of [-.14,.14])mesh(node,new T.BoxGeometry(.035,.38,.025),material('#536149'),[x,0,-.16]);mesh(node,new T.CylinderGeometry(.06,.06,.32,8),material('#c5bda0'),[0,-.13,.29]).rotation.z=Math.PI/2;}
    else if(d.id==='Head'){mesh(node,new T.SphereGeometry(.12,10,7),skin,[0,0,0]);mesh(node,new T.SphereGeometry(.127,10,6,0,Math.PI*2,0,Math.PI/2),hat,[0,.06,0]);mesh(node,new T.CylinderGeometry(.18,.18,.025,12),hat,[0,.065,-.025]);for(const x of [-.043,.043])mesh(node,new T.SphereGeometry(.013,5,4),material('#4e493d'),[x,0,-.111]);mesh(node,new T.SphereGeometry(.026,6,4),skin,[0,-.03,-.12]);}
    else if(d.id.startsWith('Shoe'))mesh(node,new T.BoxGeometry(.13,.09,.29),boot,[0,0,0]);
    else if(d.id.startsWith('Thigh')||d.id.startsWith('Shin')){const thigh=d.id.startsWith('Thigh');mesh(node,new T.CylinderGeometry(thigh?.085:.065,thigh?.08:.065,1,6),thigh?skin:socks,[0,0,0]);node.scale.y=.43;}
    else if(d.id.startsWith('Hand'))mesh(node,new T.SphereGeometry(.052,6,5),skin,[0,0,0]);
    else {const upper=d.id.startsWith('Shoulder'),radius=upper?.055:.045;mesh(node,new T.CapsuleGeometry(radius,(upper?.28:.24)-2*radius,2,6),upper?shirt:skin,[0,0,0]);}}
  for(const s of ['L','R'])group(root,`Leg_${s}`);
  poseHikerStanding(root);root.traverse(n=>{if(n instanceof T.Mesh){n.userData.castShadow=true;n.userData.receiveShadow=false;}});return root;
}
export function poseHikerStanding(root:T.Object3D){for(const d of RIG.bodies){const n=root.getObjectByName(d.id)!;n.position.copy(d.position);n.quaternion.copy(d.rotation);}}export function buildArt(def:ArtDefinition):T.Object3D {
  if(def.kind==='hiker')return buildHiker();
  const root=new T.Group();root.name=def.id;const color=def.color??'#ffffff',mat=material(color),s=def.size??{x:1,y:1,z:1};
  if(def.kind==='poop'){
    const brown=material('#85502f'),warm=material('#9a6039');
    // Rounded stacked coils and a curling tip make the silhouette readable at ground level.
    for(const [name,r,tube,y]of [['Poop_Base',11,3.8,3.5],['Poop_Middle',7.5,3.1,9.5],['Poop_Crown',3.6,2.4,15.2]]as const){
      const coil=mesh(root,new T.TorusGeometry(r,tube,14,72),name==='Poop_Middle'?warm:brown,[0,y,0],name);coil.rotation.x=Math.PI/2;
    }
    mesh(root,new T.CylinderGeometry(9,14,4,64),brown,[0,2,0]);
    mesh(root,new T.CylinderGeometry(4.5,9,8,64),brown,[0,8,0]);
    const curve=new T.CatmullRomCurve3([new T.Vector3(3.4,15.2,0),new T.Vector3(1.5,17,1),new T.Vector3(-.8,19.1,.4),new T.Vector3(.2,21,-.6)]);
    const tip=new T.TubeGeometry(curve,48,2.1,14,false),positions=tip.getAttribute('position');
    for(let ring=0;ring<=48;ring++){const center=curve.getPointAt(ring/48),scale=1-.96*ring/48;for(let j=0;j<=14;j++){const i=ring*15+j,p=new T.Vector3().fromBufferAttribute(positions,i).sub(center).multiplyScalar(scale).add(center);positions.setXYZ(i,p.x,p.y,p.z);}}
    tip.computeVertexNormals();mesh(root,tip,warm,[0,0,0]);
  }else if(def.kind==='base'){
    mesh(root,new T.CylinderGeometry(.5,.5,1,96),mat,[0,0,0]);
  }else if(def.kind==='toilet'){
    const gold=new T.MeshStandardMaterial({color:'#e9b94e',metalness:.72,roughness:.24});
    const dark=new T.MeshStandardMaterial({color:'#3d3624',roughness:.3});
    mesh(root,new T.CylinderGeometry(.28,.38,.38,24),gold,[0,.19,0]);
    mesh(root,new T.CylinderGeometry(.38,.22,.30,24,1,true),gold,[0,.49,-.04]).scale.set(1,1,1.35);
    const bowl=mesh(root,new T.TorusGeometry(.31,.075,12,32),gold,[0,.64,.02],'Toilet_Bowl');
    bowl.rotation.x=Math.PI/2;bowl.scale.y=1.35;
    const hole=mesh(root,new T.CircleGeometry(.29,32),dark,[0,.59,.02]);hole.rotation.x=-Math.PI/2;hole.scale.y=1.35;
    mesh(root,new T.BoxGeometry(.69,.7,.28),gold,[0,.92,-.39],'Toilet_Tank');
    mesh(root,new T.BoxGeometry(.76,.06,.34),gold,[0,1.3,-.39]);
    mesh(root,new T.BoxGeometry(.13,.045,.045),material('#fff0b7'),[.23,1.1,-.23]);
    group(root,'Interaction_Anchor',[0,0,.95]);
  }else if(['box','wall','ruin-step','stone'].includes(def.kind)){
    mesh(root,new T.BoxGeometry(s.x,s.y,s.z),mat,[0,0,0]);
    if(def.kind==='wall'||def.kind==='ruin-step'){
      for(let y=-s.y/2+.35;y<s.y/2-.02;y+=.36)for(const side of [-1,1])mesh(root,new T.BoxGeometry(.012,.016,s.z),material('#8c5d4d'),[side*(s.x/2+.002),y,0]);
      mesh(root,new T.BoxGeometry(s.x,.009,.018),material('#925f4c'),[0,s.y/2+.003,0]);
    }
    if(def.kind==='stone'){
      const base=mesh(root,new T.DodecahedronGeometry(.85,0),material('#92977d'),[0,-s.y*.35,0]);base.scale.set(.85,.75,.8);
      mesh(root,new T.BoxGeometry(.018,.006,s.z*.6),material('#8e927c'),[.15,s.y/2+.002,.02]).rotation.y=.35;
    }
  }else if(def.kind==='log'){
    mesh(root,new T.CylinderGeometry(s.x/2,s.x/2,s.z,16),mat,[0,0,0]);
    for(const side of [-1,1]){
      mesh(root,new T.CylinderGeometry(s.x*.495,s.x*.495,.025,16),material('#cfab79'),[0,side*s.z/2,0]);
      mesh(root,new T.CylinderGeometry(s.x*.51,s.x*.51,.08,16,1,true),material('#6b523d'),[0,side*(s.z/2-.6),0]);
    }
    for(let i=0;i<8;i++){const a=i*Math.PI/4;mesh(root,new T.BoxGeometry(.012,s.z-.1,.012),material('#755539'),[Math.cos(a)*s.x*.501,0,Math.sin(a)*s.x*.501]);}
  }else if(def.kind==='tree'){
    mesh(root,new T.CylinderGeometry(.1,.16,1.6,5),material('#857157'),[0,.8,0]);
    for(let i=0;i<3;i++)mesh(root,new T.ConeGeometry(1.1-i*.22,1.8,6),material(['#698564','#76916a','#8ba174'][i]),[0,1.8+i*.65,0]);
  }else if(def.kind==='hill')mesh(root,new T.ConeGeometry(1,1.4,7),mat,[0,0,0]);
  else if(def.kind==='rock')mesh(root,new T.DodecahedronGeometry(1,0),material('#a3a493'),[0,0,0]).scale.y=.7;
  else if(def.kind==='flower'){
    mesh(root,new T.CylinderGeometry(.015,.015,.3,3),material('#6e8754'),[0,.15,0]);mesh(root,new T.IcosahedronGeometry(.09,0),mat,[0,.34,0]);
  }else if(def.kind==='flag'){
    mesh(root,new T.CylinderGeometry(.035,.045,2.1,6),material('#795e42'),[0,1.05,0]);mesh(group(root,'Flag_Cloth',[.35,1.8,0]),new T.BoxGeometry(.7,.43,.035),mat,[0,0,0]);
  }else if(def.kind==='sign'){
    mesh(root,new T.BoxGeometry(2.1,.46,.07),material('#ffffff'),[0,1.2,0],'Sign_Board');mesh(root,new T.CylinderGeometry(.06,.07,1.3,5),material('#8e7654'),[0,.6,0]);
  }else if(def.kind==='water'){
    const waterMat=new T.MeshStandardMaterial({color:'#8aaca4',roughness:.38,transparent:true,opacity:.75});mesh(root,new T.PlaneGeometry(1,1),waterMat,[0,0,0]).rotation.x=-Math.PI/2;
  }
  if(def.kind==='poop'){
    // Cut matching visible/physical chute mouths out of the mound. A convex hull would plug them.
    root.updateMatrixWorld(true);
    root.traverse(n=>{if(!(n instanceof T.Mesh))return;const attr=n.geometry.getAttribute('position'),kept:number[]=[];
      const blocked=(point:T.Vector3)=>SLIDE_LANES.some(lane=>{const c=laneCoordinates({x:point.x,y:point.y,z:point.z-18},lane),bridge=route((lane.bridge.start+lane.bridge.end)/2);return c.t>-.16&&c.t<.65&&Math.abs(c.lateral)<lane.width/2+1.2&&point.y>c.floor-1.8&&point.y<bridge.y+2;});
      for(let i=0;i<attr.count;i+=3){const points=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(attr,i+j)),world=points.map(p=>p.clone().applyMatrix4(n.matrixWorld));if(world.some(blocked)||blocked(world[0].clone().add(world[1]).add(world[2]).multiplyScalar(1/3)))continue;for(const p of points)kept.push(p.x,p.y,p.z);}
      const old=n.geometry;n.geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(kept,3));n.geometry.computeVertexNormals();old.dispose();
    });
  }
  root.traverse(n=>{if(n instanceof T.Mesh){n.userData.castShadow=!['hill','flower','flag','sign','water'].includes(def.kind);n.userData.receiveShadow=!['tree','flower','flag','sign','water'].includes(def.kind);}});
  return root;
}
