import * as T from 'three';
import {CHECKPOINTS,route,routeFacing,routeDirection,type Point} from './model';
import {ROOT_HEIGHT} from './rig';

export const REWARD_CHECKPOINT=28;
export const REWARD_CHECKPOINT_INDEX=CHECKPOINTS.indexOf(REWARD_CHECKPOINT);
const camp=route(REWARD_CHECKPOINT),outward=new T.Vector3(camp.x,0,camp.z+18).normalize(),forward=routeDirection(REWARD_CHECKPOINT);
export const COOKIE_POSITION:Readonly<Point>={x:camp.x-outward.x*.65+forward.x*.35,y:camp.y,z:camp.z-outward.z*.65+forward.z*.35};
export const SAM_REWARD_POSITION:Readonly<Point>={x:camp.x+outward.x*1.15+forward.x*.8,y:camp.y,z:camp.z+outward.z*1.15+forward.z*.8};

/** Check checkpoint ownership and actual reach, including the floor below the reward. */
export function canEat(position:Point,checkpoint:number){
  return checkpoint>=REWARD_CHECKPOINT_INDEX&&
    Math.hypot(position.x-COOKIE_POSITION.x,position.z-COOKIE_POSITION.z)<=1.7&&
    Math.abs(position.y-COOKIE_POSITION.y-ROOT_HEIGHT)<=.75;
}

/** The reward is a collectible; it does not create an obstacle on the saved landing. */
export class FeedbackCookie {
  readonly root=new T.Group();
  private readonly biscuit=new T.Group();
  private readonly halo:T.Mesh;
  private time=0;

  constructor(){
    this.root.name='RLHF_Cookie_Reward';this.root.position.copy(COOKIE_POSITION);
    this.root.rotation.y=routeFacing(REWARD_CHECKPOINT)+Math.PI;
    this.root.userData.collectible='feedback-cookie';
    const material=(color:string)=>new T.MeshStandardMaterial({color,roughness:.85});
    const wood=material('#806b49'),plate=material('#eee0b9'),dough=material('#dca253'),edge=material('#b87938'),chocolate=material('#503327');
    const mesh=(name:string,geometry:T.BufferGeometry,mat:T.Material,position:Point,parent:T.Object3D=this.root)=>{
      const m=new T.Mesh(geometry,mat);m.name=name;m.position.copy(position);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
    };
    mesh('Reward_Pedestal',new T.CylinderGeometry(.29,.34,.57,12),wood,{x:0,y:.285,z:0});
    mesh('Reward_Plate',new T.CylinderGeometry(.37,.33,.06,32),plate,{x:0,y:.60,z:0});
    this.biscuit.name='Feedback_Biscuit';this.biscuit.position.y=.99;this.root.add(this.biscuit);
    const crust=mesh('Cookie_Crust',new T.CylinderGeometry(.255,.255,.075,32),edge,{x:0,y:0,z:0},this.biscuit);crust.rotation.x=Math.PI/2;
    const face=mesh('Cookie_Dough',new T.CylinderGeometry(.244,.244,.082,32),dough,{x:0,y:0,z:0},this.biscuit);face.rotation.x=Math.PI/2;
    const chips=[[-.12,.09],[.035,.15],[.15,.055],[-.01,.01],[-.16,-.08],[.10,-.12],[-.025,-.17]];
    for(const side of [-1,1])chips.forEach(([x,y],i)=>{
      const chip=mesh(`Chocolate_Chip_${side}_${i}`,new T.IcosahedronGeometry(.028+i%3*.004,0),chocolate,{x,y,z:side*.045},this.biscuit);
      chip.scale.z=.42;chip.rotation.z=i*.83;
    });
    const glow=new T.MeshBasicMaterial({color:'#f5cf72',transparent:true,opacity:.45,depthWrite:false,side:T.DoubleSide});
    this.halo=mesh('Cookie_Reward_Halo',new T.RingGeometry(.33,.342,64),glow,{x:0,y:.99,z:0});this.halo.castShadow=false;
    mesh('Reward_Label',new T.BoxGeometry(.65,.21,.035),plate,{x:0,y:.38,z:-.285});
    // Four small block-letter glyphs stay readable without a font, texture download or DOM.
    const letters=['111101110101101','100100100100111','101101111101101','111100110100100'];
    const ink=material('#705431');
    letters.forEach((letter,glyph)=>[...letter].forEach((pixel,index)=>{
      if(pixel!=='1')return;
      mesh(`RLHF_Label_${glyph}_${index}`,new T.BoxGeometry(.025,.025,.008),ink,{x:-.222+glyph*.132+index%3*.031,y:.442-Math.floor(index/3)*.031,z:-.307});
    }));
  }

  update(dt:number,consumed:boolean){
    this.root.visible=!consumed;if(consumed)return;
    this.time+=Math.min(.1,Math.max(0,dt));
    this.biscuit.position.y=.99+Math.sin(this.time*1.8)*.035;
    this.biscuit.rotation.y=this.time*.35;
    this.halo.position.y=this.biscuit.position.y;
    this.halo.scale.setScalar(1+Math.sin(this.time*1.8)*.045);
  }
}
