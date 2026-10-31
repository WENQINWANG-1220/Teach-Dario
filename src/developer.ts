import * as T from 'three';
import type {FollowCamera} from './camera';
import type {Walker} from './walker';
import {ROOT_HEIGHT} from './rig';

export type DeveloperMode='camera'|'placement';
/** Hidden keyboard-only inspection tools. The game owns simulation suspension. */
export class DeveloperControls {
  mode:DeveloperMode|null=null;
  readonly held=new Set<string>();
  private rotation=new T.Euler(0,0,0,'YXZ');
  private ray=new T.Raycaster();
  private position=new T.Vector3();
  private facing=0;
  toggle(mode:DeveloperMode,view:FollowCamera,walker:Walker){
    const previousMode=this.mode;
    this.held.clear();
    this.mode=this.mode===mode?null:mode;
    if(this.mode==='camera'){
      view.camera.clearViewOffset();
      this.rotation.setFromQuaternion(view.camera.quaternion,'YXZ');
    }else if(this.mode==='placement'){
      if(previousMode==='camera'){
        const direction=view.camera.getWorldDirection(new T.Vector3());
        if(direction.x*direction.x+direction.z*direction.z>1e-8)view.yaw=Math.atan2(-direction.x,-direction.z);
      }
      this.position.copy(walker.body.translation());this.position.y-=ROOT_HEIGHT;
      this.facing=view.yaw;
      walker.reset(this.position,this.facing);
    }
    view.initialized=false;
  }
  clear(){this.mode=null;this.held.clear();}
  look(dx:number,dy:number,view:FollowCamera){
    if(this.mode!=='camera'){view.move(dx,dy);return;}
    this.rotation.y-=dx*.0024;
    this.rotation.x=T.MathUtils.clamp(this.rotation.x-dy*.002,-Math.PI/2+.01,Math.PI/2-.01);
    view.camera.quaternion.setFromEuler(this.rotation);
  }
  update(dt:number,view:FollowCamera,walker:Walker){
    if(!this.mode)return;
    const axis=(positive:string[],negative:string[])=>Number(positive.some(k=>this.held.has(k)))-Number(negative.some(k=>this.held.has(k)));
    const move=new T.Vector3(axis(['KeyD','ArrowRight'],['KeyA','ArrowLeft']),axis(['KeyE'],['KeyQ']),axis(['KeyS','ArrowDown'],['KeyW','ArrowUp']));
    if(move.lengthSq()>1)move.normalize();
    const speed=(this.held.has('ShiftLeft')||this.held.has('ShiftRight')?4:1)*(this.mode==='camera'?6:2.5)*dt;
    if(this.mode==='camera')view.camera.position.addScaledVector(move.applyQuaternion(view.camera.quaternion),speed);
    else {
      // Placement shares the camera's horizontal heading; pitch keeps the body upright.
      view.yaw+=axis(['KeyZ'],['KeyX'])*dt*1.8;
      move.applyAxisAngle(new T.Vector3(0,1,0),view.yaw);
      this.position.addScaledVector(move,speed);
      if(move.lengthSq()||this.facing!==view.yaw){
        this.facing=view.yaw;
        walker.reset(this.position,this.facing);
      }
    }
  }
  place(view:FollowCamera,walker:Walker,surfaces:T.Object3D[]){
    if(this.mode!=='placement')return;
    view.camera.updateMatrixWorld(true);
    this.ray.setFromCamera(new T.Vector2(),view.camera);
    const hit=this.ray.intersectObjects(surfaces,false)[0];
    if(hit){this.position.copy(hit.point);this.position.y+=.015;this.facing=view.yaw;walker.reset(this.position,this.facing);view.initialized=false;}
  }
}
