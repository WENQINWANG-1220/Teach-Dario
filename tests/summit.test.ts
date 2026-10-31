import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {SummitDome,SUMMIT_DOME_POSITION as center,SUMMIT_DOME_RADIUS as radius,touchesSummitDome} from '../src/summit';
import {ROOT_HEIGHT} from '../src/rig';

describe('summit golden cover',()=>{
  it('requires actual capsule contact with the upper hemisphere, including its closing disk',()=>{
    const standing={x:center.x,y:center.y+ROOT_HEIGHT,z:center.z};
    expect(touchesSummitDome({...standing,x:center.x+radius+.3})).toBe(false);
    expect(touchesSummitDome({...standing,x:center.x+radius+.2})).toBe(true);
    expect(touchesSummitDome({...standing,y:ROOT_HEIGHT})).toBe(false);
    expect(touchesSummitDome({...standing,y:center.y-3})).toBe(false);
    expect(touchesSummitDome({...standing,y:center.y-1.78+ROOT_HEIGHT+.01})).toBe(true);
    expect(touchesSummitDome({...standing,y:center.y+radius+ROOT_HEIGHT+.02})).toBe(false);
    expect(touchesSummitDome({...standing,y:center.y+radius+ROOT_HEIGHT-.01})).toBe(true);
    expect(touchesSummitDome({...standing,x:NaN})).toBe(false);
  });
  it('reveals once on contact and can restore a save or restart a new run',()=>{
    const cover=new SummitDome(),contact={x:center.x,y:center.y+ROOT_HEIGHT,z:center.z};
    expect(cover.root.visible).toBe(true);expect(cover.revealed).toBe(false);
    expect(cover.touch({x:0,y:1,z:0})).toBe(false);expect(cover.root.visible).toBe(true);
    expect(cover.touch(contact)).toBe(true);expect(cover.root.visible).toBe(false);
    expect(cover.touch(contact)).toBe(false);
    cover.reset(true);expect(cover.revealed).toBe(true);expect(cover.touch(contact)).toBe(false);
    cover.reset();expect(cover.revealed).toBe(false);expect(cover.root.visible).toBe(true);
    expect(cover.touch(contact)).toBe(true);
  });
  it('uses an opaque closed hemisphere while the highlights animate without changing its extent',()=>{
    const cover=new SummitDome(),shell=cover.root.getObjectByName('Golden_Dome_Opaque_Hemisphere') as T.Mesh;
    const base=cover.root.getObjectByName('Golden_Dome_Closed_Base') as T.Mesh;
    expect((shell.material as T.Material).transparent).toBe(false);expect((shell.material as T.Material).side).toBe(T.DoubleSide);
    expect((base.material as T.Material).transparent).toBe(false);expect((base.material as T.Material).side).toBe(T.DoubleSide);
    shell.geometry.computeBoundingBox();expect(shell.geometry.boundingBox!.min.y).toBeCloseTo(0,6);
    expect(shell.geometry.boundingBox!.max.y).toBeCloseTo(radius,6);
    const scale=shell.scale.clone(),spark=cover.root.getObjectByName('Golden_Dome_Spark_0')!;
    cover.update(0);const before=spark.scale.clone();cover.update(.5);expect(spark.scale.equals(before)).toBe(false);
    expect(shell.scale.equals(scale)).toBe(true);expect(cover.root.position.toArray()).toEqual([center.x,center.y,center.z]);
    const time=(shell.material as T.ShaderMaterial).uniforms.time.value;cover.reset(true);cover.update(10);
    expect((shell.material as T.ShaderMaterial).uniforms.time.value).toBe(time);
  });
});
