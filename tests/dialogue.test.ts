import {describe,it,expect,vi,afterEach} from 'vitest';
import {DanielaDialogue,DANIELA_LINES,SamDialogue,SAM_LINES,RewardDialogue,REWARD_LINES} from '../src/dialogue';
import {DANIELA_POSITION} from '../src/daniela';
import {SAM_POSITION,SamProjection} from '../src/sam';
import {RunState,route} from '../src/model';
import {SaveStore,parseSave} from '../src/storage';
import {COOKIE_POSITION,SAM_REWARD_POSITION,REWARD_CHECKPOINT_INDEX,canEat} from '../src/reward';
import * as T from 'three';
const near={position:{x:DANIELA_POSITION.x-1,y:DANIELA_POSITION.y+.99,z:DANIELA_POSITION.z},playing:true,blocked:false};
function samAssetFixture(){
  const model=new T.Group(),texture=new T.Texture(),material=new T.MeshStandardMaterial({color:'#486a81',map:texture,roughness:.63});
  const mesh=new T.Mesh(new T.BoxGeometry(.5,2,.4),material);mesh.name='Imported_Sam_Mesh';mesh.position.y=1;model.add(mesh);
  for(const [name,x,y] of [['Hips',0,.9],['Head',0,1.75],['LeftUpLeg',.15,.8],['RightUpLeg',-.15,.8]] as const){
    const bone=new T.Bone();bone.name=`mixamorig${name}`;bone.position.set(x,y,0);model.add(bone);
  }
  model.position.set(4,7,3);model.rotation.set(.15,.7,.22);model.scale.setScalar(2.3);
  return {model,mesh,material,texture};
}
afterEach(()=>vi.unstubAllGlobals());
describe('Daniela proximity dialogue',()=>{
  it('does not start from spawn, another floor, paused gameplay or developer mode',()=>{
    const d=new DanielaDialogue();
    for(const state of [{...near,position:{x:0,y:.99,z:0}},{...near,position:{...near.position,y:10}},{...near,playing:false},{...near,blocked:true}]){d.update(10,state);expect(d.active).toBe(false);}
    d.update(.016,near);expect(d.current).toEqual(DANIELA_LINES[0]);
  });
  it('plays every turn automatically, freezes outside gameplay, and completes once',()=>{
    const d=new DanielaDialogue();d.update(.016,near);
    for(let i=0;i<4;i++){
      expect(d.current).toEqual(DANIELA_LINES[i]);
      d.update(100,{...near,playing:false});d.update(100,{...near,blocked:true});expect(d.index).toBe(i);
      d.update(11,near);
    }
    expect(d.completed).toBe(true);expect(d.current).toBeNull();d.update(11,near);expect(d.active).toBe(false);
  });
  it('restarts an unfinished conversation on reentry and clears completed state for a new run',()=>{
    const d=new DanielaDialogue();d.update(0,near);d.advance();
    d.update(.1,{...near,position:{x:20,y:1,z:20}});expect(d.active).toBe(false);expect(d.completed).toBe(false);
    d.update(.1,near);expect(d.index).toBe(0);
    d.reset(true);d.update(.1,near);expect(d.active).toBe(false);
    d.reset();d.update(.1,near);expect(d.active).toBe(true);
  });
  it('saves completion without invalidating old map saves and rejects malformed flags',()=>{
    const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)});
    const store=new SaveStore(),run=new RunState();run.reset();store.write(run,false,true);
    expect(new SaveStore().saved?.danielaSeen).toBe(true);
    const old={...store.saved};delete old.danielaSeen;expect(parseSave(JSON.stringify(old))?.checkpoint).toBe(0);
    expect(parseSave(JSON.stringify({...old,danielaSeen:'true'}))).toBeNull();
    store.write(run,false,false);expect(new SaveStore().saved?.danielaSeen).toBe(false);
  });
});

const rewardNear={position:{...COOKIE_POSITION,y:COOKIE_POSITION.y+.99},playing:true,blocked:false,unlocked:true};
describe('Sam after the cookie reward',()=>{
  it('starts only after eating and preserves the requested dialogue',()=>{
    const d=new RewardDialogue();d.update(20,{...rewardNear,unlocked:false});expect(d.active).toBe(false);
    d.update(.016,rewardNear);expect(d.current).toEqual(REWARD_LINES[0]);
    expect(REWARD_LINES).toEqual([
      {speaker:'Sam',text:'看，你会走。\n我们之前只是没给奖励。'},
      {speaker:'Dario',text:'所以我的尊严值一块饼干？'},
      {speaker:'Sam',text:'别低估它。\n这是人工标注的。'},
    ]);
  });
  it('starts when the cookie is eaten at the inner pad edge beyond Sam’s proximity radius',()=>{
    const radial=new T.Vector3(COOKIE_POSITION.x,0,COOKIE_POSITION.z+18).normalize();
    const position={x:COOKIE_POSITION.x-radial.x*1.6,y:COOKIE_POSITION.y+.99,z:COOKIE_POSITION.z-radial.z*1.6};
    expect(canEat(position,REWARD_CHECKPOINT_INDEX)).toBe(true);
    expect(Math.hypot(position.x-SAM_REWARD_POSITION.x,position.z-SAM_REWARD_POSITION.z)).toBeGreaterThan(2.5);
    const d=new RewardDialogue();d.update(0,{...rewardNear,position,unlocked:false});expect(d.active).toBe(false);
    d.update(0,{...rewardNear,position});expect(d.current).toEqual(REWARD_LINES[0]);
  });
  it('pauses during menus or developer mode and completes only once',()=>{
    const d=new RewardDialogue();d.update(0,rewardNear);
    for(let i=0;i<REWARD_LINES.length;i++){
      d.update(20,{...rewardNear,playing:false});d.update(20,{...rewardNear,blocked:true});
      expect(d.index).toBe(i);expect(d.current).toEqual(REWARD_LINES[i]);d.advance();
    }
    expect(d.completed).toBe(true);d.update(20,rewardNear);expect(d.current).toBeNull();
    d.reset(true);d.update(20,rewardNear);expect(d.current).toBeNull();
    d.reset();d.update(.016,rewardNear);expect(d.current).toEqual(REWARD_LINES[0]);
  });
  it('restarts an unfinished reward conversation after leaving and returning',()=>{
    const d=new RewardDialogue();d.update(0,rewardNear);d.advance();
    d.update(.016,{...rewardNear,position:{...route(16),y:route(16).y+.99}});expect(d.current).toBeNull();
    d.update(.016,rewardNear);expect(d.index).toBe(0);
    for(let i=0;i<3;i++)d.update(13,rewardNear);
    expect(d.completed).toBe(true);
  });
});

const samNear={position:{...route(16),y:route(16).y+.99},playing:true,blocked:false,checkpoint:1};
describe('Sam at the seesaw approach',()=>{
  it('starts from the walking strip only after the first checkpoint, on the same level',()=>{
    const d=new SamDialogue();
    for(const state of [{...samNear,checkpoint:0},{...samNear,playing:false},{...samNear,blocked:true},{...samNear,position:{...samNear.position,y:samNear.position.y+5}},{...samNear,position:{...route(12),y:route(12).y+.99}}]){
      d.update(20,state);expect(d.active).toBe(false);
    }
    d.update(.016,samNear);expect(d.current).toEqual(SAM_LINES[0]);
  });
  it('keeps the requested three turns and permits manual continuation without restarting',()=>{
    expect(SAM_LINES).toEqual([
      {speaker:'Sam',text:'路太窄？\n那就把它Scaling Laws 。'},
      {speaker:'Dario',text:'我认识你。'},
      {speaker:'Sam',text:'准确来说，我只是你记忆里的测试用例。\n不过这确实像我会问的问题：既然有效，为什么不把它做大？'},
    ]);
    const d=new SamDialogue();d.advance();expect(d.active).toBe(false);
    d.update(0,samNear);
    for(const line of SAM_LINES){expect(d.current).toEqual(line);d.advance();}
    expect(d.completed).toBe(true);expect(d.current).toBeNull();
    d.update(30,samNear);expect(d.active).toBe(false);
  });
  it('freezes playback when paused or debugging, then automatically completes all three turns',()=>{
    const d=new SamDialogue();d.update(0,samNear);
    for(let index=0;index<SAM_LINES.length;index++){
      d.update(100,{...samNear,playing:false});d.update(100,{...samNear,blocked:true});
      expect(d.index).toBe(index);expect(d.current).toEqual(SAM_LINES[index]);
      d.update(13,samNear);
    }
    expect(d.completed).toBe(true);
  });
  it('restarts interrupted conversation on return and respects restored completion',()=>{
    const d=new SamDialogue();d.update(0,samNear);d.advance();
    d.update(.1,{...samNear,position:{...samNear.position,x:SAM_POSITION.x+6}});
    expect(d.active).toBe(false);expect(d.completed).toBe(false);
    d.update(.1,samNear);expect(d.index).toBe(0);
    d.reset(true);d.update(30,samNear);expect(d.current).toBeNull();
    d.reset();d.update(.1,samNear);expect(d.current).toEqual(SAM_LINES[0]);
  });
  it('normalizes the model and adds transparency while preserving its textures and source material',()=>{
    const {model,mesh,material,texture}=samAssetFixture(),geometry=mesh.geometry;
    const sam=new SamProjection(model,{x:0,y:0,z:0}),imported=sam.root.getObjectByName('Sam_Imported_Model')!;
    sam.root.updateMatrixWorld(true);
    const bounds=new T.Box3().setFromObject(imported,true);
    expect(bounds.max.y-bounds.min.y).toBeCloseTo(1.8,5);expect(bounds.min.y).toBeCloseTo(0,5);
    expect(bounds.getCenter(new T.Vector3()).x).toBeCloseTo(0,5);expect(bounds.getCenter(new T.Vector3()).z).toBeCloseTo(0,5);
    const head=model.getObjectByName('mixamorigHead')!.getWorldPosition(new T.Vector3()),hip=model.getObjectByName('mixamorigHips')!.getWorldPosition(new T.Vector3());
    expect(head.clone().sub(hip).normalize().distanceTo(new T.Vector3(0,1,0))).toBeLessThan(.00001);
    expect(sam.root.getObjectByName('Imported_Sam_Mesh')).toBe(mesh);expect(mesh.geometry).toBe(geometry);
    const projected=mesh.material;
    expect(projected).not.toBe(material);expect(projected.map).toBe(texture);expect(projected.color.getHexString()).toBe('486a81');expect(projected.roughness).toBe(.63);
    expect(projected.transparent).toBe(true);expect(projected.depthWrite).toBe(false);expect(projected.side).toBe(T.FrontSide);expect(mesh.castShadow).toBe(false);
    expect(projected.opacity).toBeGreaterThan(.5);expect(projected.opacity).toBeLessThan(.7);
    expect(material.opacity).toBe(1);expect(material.transparent).toBe(false);expect(material.depthWrite).toBe(true);
    sam.update(1/60,samNear.position,true);sam.root.updateMatrixWorld(true);
    const activeOpacity=projected.opacity;sam.update(0,samNear.position,true);expect(projected.opacity).toBe(activeOpacity);
    sam.update(0,samNear.position,false);expect(projected.opacity).toBeLessThan(activeOpacity);expect(projected.opacity).toBeGreaterThan(.5);
    expect(material.opacity).toBe(1);
    sam.root.traverse(object=>expect(object.matrixWorld.elements.every(Number.isFinite)).toBe(true));
  });
  it('rejects an invalid supplied figure instead of silently substituting a procedural person',()=>{
    expect(()=>new SamProjection(new T.Group())).toThrow('SAM.glb 缺少骨骼');
    const {model,mesh}=samAssetFixture();model.remove(mesh);
    expect(()=>new SamProjection(model)).toThrow('SAM.glb 人物尺寸无效');
  });
});
