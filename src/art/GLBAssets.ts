import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {ART_DEFINITIONS,type ArtDefinition} from './layout';
export function validateModel(root:T.Object3D,def:ArtDefinition){
  for(const name of def.requiredNodes??[]){const matches:T.Object3D[]=[];root.traverse(n=>{if(n.name===name)matches.push(n);});if(matches.length!==1)throw Error(`${def.file} 必须包含唯一节点 ${name}`);}
  let meshes=0;root.traverse(n=>{if(n instanceof T.Mesh)meshes++;});if(!meshes)throw Error(`${def.file} 中没有模型网格`);
  const bounds=new T.Box3().setFromObject(root);if(bounds.isEmpty()||![...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite))throw Error(`${def.file} 模型尺寸无效`);
}
export class GLBAssets {
  private templates=new Map<string,T.Object3D>();
  private loading:Promise<void>|null=null;
  constructor(readonly baseURL:string,private fetchAsset:typeof fetch=fetch.bind(globalThis)){}
  preload(progress?:(loaded:number,total:number)=>void){
    if(this.loading)return this.loading;
    const loader=new GLTFLoader();let completed=0;
    this.loading=Promise.all(ART_DEFINITIONS.map(async def=>{
      const url=new URL(def.file,this.baseURL).href;
      try{
        const response=await this.fetchAsset(url,{cache:'no-cache',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error(`HTTP ${response.status}`);
        const result=await loader.parseAsync(await response.arrayBuffer(),new URL('.',url).href),root=result.scene;
        validateModel(root,def);root.traverse(n=>{n.userData.assetSource=def.file;if(n instanceof T.Mesh){n.castShadow=n.userData.castShadow??!['hill','flower','flag','sign','water'].includes(def.kind);n.receiveShadow=n.userData.receiveShadow??!['hiker','tree','flower','flag','sign','water'].includes(def.kind);}});
        this.templates.set(def.id,root);progress?.(++completed,ART_DEFINITIONS.length);
      }catch(error){throw Error(`GLB 加载失败：${def.file}（${(error as Error).message}）`);}
    })).then(()=>{});
    return this.loading;
  }
  instantiate(id:string){const root=this.templates.get(id);if(!root)throw Error(`模型尚未加载：${id}`);return clone(root);}
}
