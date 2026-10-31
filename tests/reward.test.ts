import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {COOKIE_POSITION,SAM_REWARD_POSITION,REWARD_CHECKPOINT_INDEX,FeedbackCookie,canEat} from '../src/reward';
import {route} from '../src/model';
import {ROOT_HEIGHT} from '../src/rig';
import {SamProjection} from '../src/sam';

const reachable={...COOKIE_POSITION,y:COOKIE_POSITION.y+ROOT_HEIGHT};
describe('checkpoint cookie reward',()=>{
  it('requires reaching the checkpoint after the seesaw and standing within reach',()=>{
    expect(canEat(reachable,REWARD_CHECKPOINT_INDEX-1)).toBe(false);
    expect(canEat(reachable,REWARD_CHECKPOINT_INDEX)).toBe(true);
    expect(canEat({...route(28),y:route(28).y+ROOT_HEIGHT},REWARD_CHECKPOINT_INDEX)).toBe(true);
    expect(canEat({...reachable,x:reachable.x+1.71},REWARD_CHECKPOINT_INDEX)).toBe(false);
    expect(canEat({...reachable,y:reachable.y-2},REWARD_CHECKPOINT_INDEX)).toBe(false);
    expect(canEat({...reachable,y:reachable.y+2},REWARD_CHECKPOINT_INDEX)).toBe(false);
  });
  it('remains attainable when returning from a later checkpoint',()=>{
    expect(canEat(reachable,REWARD_CHECKPOINT_INDEX+1)).toBe(true);
    expect(canEat({...route(48),y:route(48).y+ROOT_HEIGHT},REWARD_CHECKPOINT_INDEX+1)).toBe(false);
  });
  it('hides the eaten reward across updates and can reappear for a new journey',()=>{
    const cookie=new FeedbackCookie();cookie.update(.016,false);
    expect(cookie.root.visible).toBe(true);
    const bounds=new T.Box3().setFromObject(cookie.root);expect(bounds.isEmpty()).toBe(false);
    expect(cookie.root.getObjectByName('Cookie_Dough')).toBeDefined();
    expect(cookie.root.getObjectByName('Chocolate_Chip_1_0')).toBeDefined();
    cookie.update(.016,true);cookie.update(1,true);expect(cookie.root.visible).toBe(false);
    cookie.update(.016,false);expect(cookie.root.visible).toBe(true);
  });
  it('positions Sam beside the cookie without changing the original default',()=>{
    const asset=()=>{
      const model=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(.5,1.8,.3));mesh.position.y=.9;model.add(mesh);
      for(const [name,x,y] of [['Hips',0,.9],['Head',0,1.7],['LeftUpLeg',.15,.8],['RightUpLeg',-.15,.8]] as const){const bone=new T.Bone();bone.name=`mixamorig${name}`;bone.position.set(x,y,0);model.add(bone);}
      return model;
    };
    const sam=new SamProjection(asset(),SAM_REWARD_POSITION),original=new SamProjection(asset());
    expect(sam.root.position.toArray()).toEqual([SAM_REWARD_POSITION.x,SAM_REWARD_POSITION.y,SAM_REWARD_POSITION.z]);
    expect(sam.root.position.distanceTo(original.root.position)).toBeGreaterThan(5);
    expect(Math.hypot(SAM_REWARD_POSITION.x-COOKIE_POSITION.x,SAM_REWARD_POSITION.z-COOKIE_POSITION.z)).toBeLessThan(2);
  });
});
