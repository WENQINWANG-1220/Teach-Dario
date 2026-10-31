/** Offline art source. Imported by the exporter only, never by the playable entry. */
import * as T from 'three';
import type {ArtDefinition} from './layout';
import {RIG} from '../rig';
import {SLIDE_LANES,laneCoordinates} from '../terrain';
const material=(color:string)=>new T.MeshStandardMaterial({color,roughness:1,flatShading:true});
function mesh(parent:T.Object3D,geometry:T.BufferGeometry,mat:T.Material,p:number[],name?:string){
  // glTF has no flatShading flag: bake face normals into the offline geometry.
  const flat=geometry.index?geometry.toNonIndexed():geometry;flat.computeVertexNormals();if(flat!==geometry)geometry.dispose();
  const m=new T.Mesh(flat,mat);m.position.set(p[0],p[1],p[2]);if(name)m.name=name;m.castShadow=m.receiveShadow=true;parent.add(m);return m;
}
function group(parent:T.Object3D,name:string,p=[0,0,0]){const g=new T.Group();g.name=name;g.position.set(p[0],p[1],p[2]);parent.add(g);return g;}
function earthen(parent:T.Object3D,color:string,kind:'dirt'|'mud'|'clay-bank'){
  const box=new T.BoxGeometry(1,1,1,kind==='clay-bank'?3:12,1,5).toNonIndexed();
  const source=box.getAttribute('position'),normals=box.getAttribute('normal'),positions:number[]=[],colors:number[]=[];
  const base=new T.Color(color).lerp(new T.Color(kind==='mud'?'#745039':'#806448'),.53),dark=new T.Color('#503c2b');
  const add=(p:T.Vector3,c:T.Color)=>{positions.push(p.x,p.y,p.z);colors.push(c.r,c.g,c.b);};
  for(let i=0;i<source.count;i+=3){
    const points=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(source,i+j)),center=points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1/3);
    const grain=Math.sin(center.x*91.7+center.z*63.3)*Math.cos(center.z*41.7-center.x*24.3),top=normals.getY(i)>.5;
    const c=top?base.clone().multiplyScalar(.83+grain*.24):base.clone().lerp(dark,.28).multiplyScalar(.93+grain*.12);
    for(const p of points)add(p,c);
  }
  // Small irregular stone/dirt flecks are baked into this same mesh, within 1 mm of the collision plane.
  // Their stretched local Z compensates for the short trail segment's world scale.
  if(kind!=='clay-bank')for(let i=0;i<48;i++){
    const seed=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
    const x=(seed(i+7)-.5)*.96,z=(seed(i+67)-.5)*.82,rx=.003+seed(i+119)*.013,rz=.012+seed(i+153)*.048;
    const c=new T.Color(i%5===0?'#b29b77':i%3===0?'#4c4133':'#857257').multiplyScalar(.84+seed(i+181)*.27);
    const center=new T.Vector3(x,.501,z),ring=Array.from({length:5},(_,j)=>{const a=j*Math.PI*2/5,r=.7+seed(i*5+j+211)*.3;return new T.Vector3(x+Math.cos(a)*rx*r,.501,z+Math.sin(a)*rz*r);});
    for(let j=0;j<5;j++){add(center,c);add(ring[(j+1)%5],c);add(ring[j],c);}
  }
  const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3)).setAttribute('color',new T.Float32BufferAttribute(colors,3));
  const mat=material('#ffffff');mat.vertexColors=true;mesh(parent,geometry,mat,[0,0,0]);box.dispose();
}
function asterisk(parent:T.Object3D,p:number[],radius=.57){
  const star=group(parent,'Claude_Sunburst',p),orange=material('#d9764f');
  for(let i=0;i<12;i++){const a=i*Math.PI/6;const spoke=mesh(star,new T.BoxGeometry(radius*1.45,.105,.10),orange,[Math.cos(a)*radius*.48,Math.sin(a)*radius*.48,0]);spoke.rotation.z=a;}
  return star;
}
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
    const brown=material('#78492f'),warm=material('#975d38');
    // Rounded stacked coils and a curling tip make the silhouette readable at ground level.
    for(const [name,r,tube,y]of [['Poop_Base',11,3.8,3.5],['Poop_Middle',7.5,3.1,9.5],['Poop_Crown',3.6,2.4,15.2]]as const){
      const coil=mesh(root,new T.TorusGeometry(r,tube,14,72),name==='Poop_Middle'?warm:brown,[0,y,0],name);coil.rotation.x=Math.PI/2;
    }
    mesh(root,new T.CylinderGeometry(9,14,4,64),brown,[0,2,0]);
    // Broad clay bands and lumpy exposed strata keep the pile readable as a muddy landscape.
    for(let i=0;i<9;i++){const a=i*2.399,r=12.9-(i%3)*.7;const boulder=mesh(root,new T.DodecahedronGeometry(1,1),material(i%2?'#965e3c':'#ab7450'),[Math.sin(a)*r,1.1+(i%3)*.5,Math.cos(a)*r]);boulder.scale.set(2.0,1.2,1.5);boulder.rotation.y=a;}
    mesh(root,new T.CylinderGeometry(4.5,9,8,64),brown,[0,8,0]);
    // A solid inner clay mass closes the crown behind the carved ravine, so it never reads as a hollow shell.
    mesh(root,new T.CylinderGeometry(2.7,4.7,7.5,48),brown,[0,13.6,0],'Crown_Clay_Core');
    const curve=new T.CatmullRomCurve3([new T.Vector3(3.4,15.2,0),new T.Vector3(1.5,17,1),new T.Vector3(-.8,19.1,.4),new T.Vector3(.2,21,-.6)]);
    const tip=new T.TubeGeometry(curve,48,2.1,14,false),positions=tip.getAttribute('position');
    for(let ring=0;ring<=48;ring++){const center=curve.getPointAt(ring/48),scale=1-.96*ring/48;for(let j=0;j<=14;j++){const i=ring*15+j,p=new T.Vector3().fromBufferAttribute(positions,i).sub(center).multiplyScalar(scale).add(center);positions.setXYZ(i,p.x,p.y,p.z);}}
    tip.computeVertexNormals();mesh(root,tip,warm,[0,0,0]);
    root.traverse(n=>{if(!(n instanceof T.Mesh))return;const pos=n.geometry.getAttribute('position'),colors:number[]=[];for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),grain=Math.sin(x*1.9+z*1.4)*Math.cos(y*4.1+x*.5),c=new T.Color('#ffffff').multiplyScalar(.91+grain*.08);colors.push(c.r,c.g,c.b);}n.geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));(n.material as T.MeshStandardMaterial).vertexColors=true;});
  }else if(def.kind==='dirt'||def.kind==='mud'||def.kind==='clay-bank'){
    earthen(root,color,def.kind);
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
  }else if(def.kind==='asterisk'){
    mesh(root,new T.CylinderGeometry(.58,.7,.28,8),material('#9b7754'),[0,.14,0]);
    mesh(root,new T.BoxGeometry(.16,1.25,.16),material('#73543c'),[0,.82,0]);
    asterisk(root,[0,1.55,0],.57);
    mesh(root,new T.BoxGeometry(.7,.13,.31),material('#b38c60'),[0,.34,0]);
  }else if(def.kind==='paper'){
    const paper=material('#f1e7ce'),core=material('#805b3c'),crate=material('#8e6847');
    mesh(root,new T.BoxGeometry(1.2,.24,.9),crate,[0,.12,0]);
    for(const [x,y,z] of [[-.3,.49,-.16],[.3,.49,-.16],[0,1.06,-.16],[0,.49,.29]]){
      mesh(root,new T.CylinderGeometry(.27,.27,.49,20),paper,[x,y,z]).rotation.z=Math.PI/2;
      for(const sign of [-1,1]){const hole=mesh(root,new T.CylinderGeometry(.075,.075,.012,12),core,[x+sign*.251,y,z]);hole.rotation.z=Math.PI/2;}
    }
    const sheet=mesh(root,new T.BoxGeometry(.035,.42,.36),paper,[.58,.46,.16]);sheet.rotation.z=-.17;
  }else if(def.kind==='plunger'){
    const clay=material('#8d6443');mesh(root,new T.CylinderGeometry(.65,.8,.32,10),clay,[0,.16,0]);
    mesh(root,new T.CylinderGeometry(.47,.59,.16,10),material('#bb9366'),[0,.40,0]);
    mesh(root,new T.SphereGeometry(.39,16,8,0,Math.PI*2,0,Math.PI/2),material('#a44a34'),[0,.48,0]);
    mesh(root,new T.CylinderGeometry(.075,.09,1.65,9),material('#c4a574'),[0,1.5,0]);
    mesh(root,new T.SphereGeometry(.105,9,6),material('#d1b78a'),[0,2.34,0]);
    const band=mesh(root,new T.BoxGeometry(.64,.26,.02),material('#d9764f'),[0,1.54,.03]);band.rotation.z=-.14;
  }else if(def.kind==='outpost'){
    const wood=material('#72523a'),light=material('#a47c51');
    for(const x of [-2,2]){
      mesh(root,new T.CylinderGeometry(.13,.17,3.3,8),wood,[x,1.65,0]);
      mesh(root,new T.BoxGeometry(.43,.4,.46),light,[x,.2,0]);
      const brace=mesh(root,new T.BoxGeometry(.12,.95,.12),light,[x-Math.sign(x)*.30,2.65,0]);brace.rotation.z=Math.sign(x)*-.67;
    }
    mesh(root,new T.BoxGeometry(4.55,.2,.28),wood,[0,3.25,0]);
    mesh(root,new T.BoxGeometry(3.85,.64,.10),material('#ffffff'),[0,3.0,.12],'Sign_Board');
    const roof=mesh(root,new T.BoxGeometry(4.8,.12,.8),material('#a1643f'),[0,3.48,0]);roof.rotation.z=.025;
    asterisk(root,[0,4.13,0],.47);
  }else if(def.kind==='tree'){
    mesh(root,new T.CylinderGeometry(.1,.16,1.6,5),material('#857157'),[0,.8,0]);
    for(let i=0;i<3;i++)mesh(root,new T.ConeGeometry(1.1-i*.22,1.8,6),material(['#69734c','#85895a','#9a9c6d'][i]),[0,1.8+i*.65,0]);
  }else if(def.kind==='hill')mesh(root,new T.ConeGeometry(1,1.4,7),mat,[0,0,0]);
  else if(def.kind==='rock')mesh(root,new T.DodecahedronGeometry(1,0),material('#9b8261'),[0,0,0]).scale.y=.7;
  else if(def.kind==='flower'){
    mesh(root,new T.CylinderGeometry(.015,.015,.3,3),material('#6e8754'),[0,.15,0]);mesh(root,new T.IcosahedronGeometry(.09,0),mat,[0,.34,0]);
  }else if(def.kind==='flag'){
    mesh(root,new T.CylinderGeometry(.035,.045,2.1,6),material('#795e42'),[0,1.05,0]);mesh(group(root,'Flag_Cloth',[.35,1.8,0]),new T.BoxGeometry(.7,.43,.035),mat,[0,0,0]);
  }else if(def.kind==='sign'){
    mesh(root,new T.BoxGeometry(2.4,.65,.09),material('#ffffff'),[0,1.35,0],'Sign_Board');mesh(root,new T.CylinderGeometry(.07,.09,1.5,6),material('#75543b'),[0,.75,0]);
    for(const y of [1.00,1.70])mesh(root,new T.BoxGeometry(2.5,.07,.14),material('#75543b'),[0,y,0]);
  }else if(def.kind==='water'){
    const waterMat=new T.MeshStandardMaterial({color:'#8aaca4',roughness:.38,transparent:true,opacity:.75});mesh(root,new T.PlaneGeometry(1,1),waterMat,[0,0,0]).rotation.x=-Math.PI/2;
  }
  if(def.kind==='poop'){
    // Cut matching visible/physical chute mouths out of the mound. A convex hull would plug them.
    root.updateMatrixWorld(true);
    root.traverse(n=>{if(!(n instanceof T.Mesh))return;const attr=n.geometry.getAttribute('position'),colorAttr=n.geometry.getAttribute('color'),kept:number[]=[],keptColors:number[]=[];
      const blocked=(point:T.Vector3)=>SLIDE_LANES.some(lane=>{const world={x:point.x,y:point.y,z:point.z-18},basin=lane.points[1],basinFloor=basin.y-.08;
        if(Math.abs(world.x-basin.x)<4.1&&Math.abs(world.z-basin.z)<4.1&&point.y>basinFloor-.45&&point.y<basinFloor+3)return true;
        const c=laneCoordinates(world,lane),width=Math.max(lane.widths[c.segment],lane.widths[c.segment+1]);return c.t*c.length>-.4&&c.t<1.04&&c.distance<width/2+.55&&point.y>c.floor-.45&&point.y<c.floor+3;});
      const keep=(points:T.Vector3[],colors:T.Vector3[],depth:number)=>{
        const world=points.map(p=>p.clone().applyMatrix4(n.matrixWorld)),hits=world.map(blocked),middle=blocked(world[0].clone().add(world[1]).add(world[2]).multiplyScalar(1/3));
        if(hits.every(Boolean)&&middle)return;
        if(hits.some(Boolean)||middle){
          if(depth===0)return;
          const ab=points[0].clone().lerp(points[1],.5),bc=points[1].clone().lerp(points[2],.5),ca=points[2].clone().lerp(points[0],.5),cab=colors[0].clone().lerp(colors[1],.5),cbc=colors[1].clone().lerp(colors[2],.5),cca=colors[2].clone().lerp(colors[0],.5);
          keep([points[0],ab,ca],[colors[0],cab,cca],depth-1);keep([ab,points[1],bc],[cab,colors[1],cbc],depth-1);keep([ca,bc,points[2]],[cca,cbc,colors[2]],depth-1);keep([ab,bc,ca],[cab,cbc,cca],depth-1);return;
        }
        for(let j=0;j<3;j++){const p=points[j],c=colors[j];kept.push(p.x,p.y,p.z);if(colorAttr)keptColors.push(c.x,c.y,c.z);}
      };
      for(let i=0;i<attr.count;i+=3)keep([0,1,2].map(j=>new T.Vector3().fromBufferAttribute(attr,i+j)),[0,1,2].map(j=>colorAttr?new T.Vector3().fromBufferAttribute(colorAttr,i+j):new T.Vector3(1,1,1)),2);
      const old=n.geometry;n.geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(kept,3));if(keptColors.length)n.geometry.setAttribute('color',new T.Float32BufferAttribute(keptColors,3));n.geometry.computeVertexNormals();old.dispose();
    });
  }
  root.traverse(n=>{if(n instanceof T.Mesh){n.userData.castShadow=!['hill','flower','flag','sign','water'].includes(def.kind);n.userData.receiveShadow=!['tree','flower','flag','sign','water'].includes(def.kind);}});
  return root;
}
