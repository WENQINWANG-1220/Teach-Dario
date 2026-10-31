import * as T from 'three';
import type {Point} from './model';
import {ROOT_HEIGHT} from './rig';

export const SUMMIT_DOME_POSITION:Readonly<Point>=Object.freeze({x:0,y:21.95,z:-18});
export const SUMMIT_DOME_RADIUS=5;
const PLAYER_RADIUS=.24,PLAYER_HEIGHT=1.78;

/** Distance between the upright player capsule and the closed upper hemisphere. */
export function touchesSummitDome(position:Point){
  if(![position.x,position.y,position.z].every(Number.isFinite))return false;
  const radial=Math.hypot(position.x-SUMMIT_DOME_POSITION.x,position.z-SUMMIT_DOME_POSITION.z);
  const feet=position.y-ROOT_HEIGHT-SUMMIT_DOME_POSITION.y;
  const low=feet+PLAYER_RADIUS,high=feet+PLAYER_HEIGHT-PLAYER_RADIUS;
  // Below the equator the closest surface is the closing disk, not the sphere's lower half.
  const distance=high<0?Math.hypot(Math.max(0,radial-SUMMIT_DOME_RADIUS),high):
    Math.max(0,Math.hypot(radial,Math.max(0,low))-SUMMIT_DOME_RADIUS);
  return distance<=PLAYER_RADIUS+1e-6;
}

/** A visual cover and proximity trigger only; it never adds a solid obstacle. */
export class SummitDome {
  readonly root=new T.Group();
  revealed=false;
  private time=0;
  private readonly gold:T.ShaderMaterial;
  private readonly sparks:T.Mesh[]=[];
  private readonly halo:T.Mesh;

  constructor(){
    this.root.name='Summit_Golden_Dome';this.root.position.copy(SUMMIT_DOME_POSITION);
    this.root.userData.effect='summit-cover';
    this.gold=new T.ShaderMaterial({
      uniforms:{time:{value:0}},side:T.DoubleSide,transparent:false,depthWrite:true,toneMapped:false,
      vertexShader:`
        varying vec3 vLocal; varying vec3 vNormal; varying vec3 vView; varying vec2 vUv;
        void main(){
          vLocal=position;vNormal=normalize(normalMatrix*normal);vUv=uv;
          vec4 view=modelViewMatrix*vec4(position,1.0);vView=-view.xyz;
          gl_Position=projectionMatrix*view;
        }`,
      fragmentShader:`
        uniform float time;
        varying vec3 vLocal; varying vec3 vNormal; varying vec3 vView; varying vec2 vUv;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void main(){
          vec3 n=normalize(vNormal),eye=normalize(vView);
          float lit=abs(dot(n,normalize(vec3(-0.4,0.85,0.65))));
          float rim=pow(1.0-abs(dot(n,eye)),2.7);
          float sweep=pow(max(0.0,sin(vLocal.y*1.8+atan(vLocal.z,vLocal.x)*2.0-time*0.65)),12.0);
          vec2 cell=floor(vUv*vec2(54.0,26.0)),p=fract(vUv*vec2(54.0,26.0))-0.5;
          float twinkle=pow(max(0.0,sin(time*2.5+hash(cell)*6.28318)),14.0);
          float star=exp(-length(p)*28.0)*twinkle*step(0.73,hash(cell+5.7));
          vec3 gold=mix(vec3(0.91,0.40,0.035),vec3(1.0,0.79,0.20),lit*0.75+0.25);
          gold+=vec3(1.0,0.71,0.22)*(rim*0.32+sweep*0.18+0.04*sin(time*1.2));
          gold+=vec3(1.0,0.96,0.67)*star*1.5;
          gl_FragColor=vec4(gold,1.0);
          #include <colorspace_fragment>
        }`,
    });
    const shell=new T.Mesh(new T.SphereGeometry(SUMMIT_DOME_RADIUS,80,40,0,Math.PI*2,0,Math.PI/2),this.gold);
    shell.name='Golden_Dome_Opaque_Hemisphere';this.root.add(shell);
    const base=new T.Mesh(new T.CircleGeometry(SUMMIT_DOME_RADIUS,80),new T.MeshBasicMaterial({color:'#ffcb45',side:T.DoubleSide,toneMapped:false}));
    base.name='Golden_Dome_Closed_Base';base.rotation.x=-Math.PI/2;this.root.add(base);
    const rimMaterial=new T.MeshBasicMaterial({color:'#ffe993',toneMapped:false});
    const ring=new T.Mesh(new T.TorusGeometry(SUMMIT_DOME_RADIUS,.055,8,96),rimMaterial);
    ring.name='Golden_Dome_Rim';ring.rotation.x=Math.PI/2;this.root.add(ring);
    this.halo=new T.Mesh(new T.TorusGeometry(SUMMIT_DOME_RADIUS,.13,8,96),new T.MeshBasicMaterial({color:'#ffe37a',transparent:true,opacity:.22,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}));
    this.halo.name='Golden_Dome_Halo';this.halo.rotation.x=Math.PI/2;this.root.add(this.halo);
    const sparkleGeometry=new T.OctahedronGeometry(.065),sparkleMaterial=new T.MeshBasicMaterial({color:'#fff4b7',toneMapped:false});
    for(let i=0;i<42;i++){
      const height=(i+.5)/42,angle=i*2.3999632297,r=Math.sqrt(1-height*height);
      const spark=new T.Mesh(sparkleGeometry,sparkleMaterial);spark.name=`Golden_Dome_Spark_${i}`;
      spark.position.set(Math.cos(angle)*r,height,Math.sin(angle)*r).multiplyScalar(SUMMIT_DOME_RADIUS+.045);
      spark.scale.set(.65,1.7,.65);this.sparks.push(spark);this.root.add(spark);
    }
    this.root.updateMatrixWorld(true);
  }
  reset(revealed=false){this.revealed=revealed;this.root.visible=!revealed;this.time=0;this.update(0);}
  touch(position:Point){
    if(this.revealed||!touchesSummitDome(position))return false;
    this.revealed=true;this.root.visible=false;return true;
  }
  update(dt:number){
    if(this.revealed)return;
    if(Number.isFinite(dt))this.time+=Math.max(0,dt);
    this.gold.uniforms.time.value=this.time;
    (this.halo.material as T.MeshBasicMaterial).opacity=.2+Math.sin(this.time*1.6)*.06;
    this.sparks.forEach((spark,index)=>{
      const glow=.2+Math.pow(Math.max(0,Math.sin(this.time*2.3+index*1.79)),6)*1.35;
      spark.scale.set(glow*.65,glow*1.7,glow*.65);spark.rotation.y=this.time*.5+index;
    });
  }
}
