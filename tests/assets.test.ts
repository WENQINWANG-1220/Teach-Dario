import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {ART_DEFINITIONS,ART_LAYOUT,createArtLayout} from '../src/art/layout';
import {buildArt} from '../src/art/builders';
import {validateModel} from '../src/art/GLBAssets';
const path=(file:string)=>new URL(`../public/models/${file}`,import.meta.url);
function glb(file:string){const bytes=readFileSync(path(file));expect(bytes.readUInt32LE(0)).toBe(0x46546c67);expect(bytes.readUInt32LE(4)).toBe(2);expect(bytes.readUInt32LE(8)).toBe(bytes.length);return JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8').trim());}
describe('GLB art delivery and node contracts',()=>{
  it('ships every catalog asset with embedded resources and required named nodes',()=>{
    for(const def of ART_DEFINITIONS){const json=glb(def.file);expect(json.meshes.length).toBeGreaterThan(0);expect(json.buffers?.some((b:{uri?:string})=>b.uri)??false).toBe(false);expect(json.images?.some((b:{uri?:string})=>b.uri)??false).toBe(false);for(const name of def.requiredNodes??[])expect(json.nodes.filter((n:{name?:string})=>n.name===name)).toHaveLength(1);}
  });
  it('preserves fixed placement data and gives each log diameter its own asset',()=>{
    expect(createArtLayout()).toEqual(ART_LAYOUT);const logs=ART_DEFINITIONS.filter(d=>d.kind==='log');expect(logs).toHaveLength(2);expect(logs.map(d=>d.size!.x).sort()).toEqual([.76,.9]);
    for(const p of ART_LAYOUT.placements)expect(ART_DEFINITIONS.some(d=>d.id===p.asset)).toBe(true);
  });
  it('rejects missing or ambiguous character driver nodes before gameplay',()=>{
    const def=ART_DEFINITIONS.find(d=>d.id==='hiker')!,root=buildArt(def);expect(()=>validateModel(root,def)).not.toThrow();
    const torso=root.getObjectByName('Torso')!;torso.name='Missing';expect(()=>validateModel(root,def)).toThrow('Torso');torso.name='Torso';const duplicate=new T.Group();duplicate.name='Torso';root.add(duplicate);expect(()=>validateModel(root,def)).toThrow('Torso');
  });
  it('delivers the assembled scene with embedded sign textures',()=>{
    const bytes=readFileSync(new URL('../exports/glb/baby-steps-complete.glb',import.meta.url));expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
    const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8').trim());expect(json.images.length).toBeGreaterThan(10);expect(json.images.every((i:{bufferView?:number;uri?:string})=>i.bufferView!==undefined&&!i.uri)).toBe(true);
  });
});
