import * as T from 'three';
export function applySignText(root:T.Object3D,label:string){
  const board=root.getObjectByName('Sign_Board');if(!(board instanceof T.Mesh))throw Error('sign.glb 缺少 Sign_Board 网格');
  const c=document.createElement('canvas');c.width=768;c.height=160;const ctx=c.getContext('2d')!;
  ctx.fillStyle='#e9dfbd';ctx.fillRect(0,0,768,160);ctx.fillStyle='#66583b';ctx.font='bold 46px sans-serif';ctx.textAlign='center';ctx.fillText(label,384,99);
  const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;
  const material=(Array.isArray(board.material)?board.material[0]:board.material).clone() as T.MeshStandardMaterial;
  material.map=texture;material.needsUpdate=true;board.material=material;
}
