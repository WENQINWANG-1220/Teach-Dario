import * as T from 'three';
export function applySignText(root:T.Object3D,label:string){
  const board=root.getObjectByName('Sign_Board');if(!(board instanceof T.Mesh))throw Error('路牌缺少 Sign_Board 网格');
  const c=document.createElement('canvas');c.width=1024;c.height=280;const ctx=c.getContext('2d')!;
  ctx.fillStyle='#eee1bd';ctx.fillRect(0,0,c.width,c.height);
  ctx.strokeStyle='#b19467';ctx.lineWidth=3;ctx.strokeRect(15,15,994,250);
  ctx.fillStyle='#ce754d';ctx.fillRect(35,35,8,210);
  ctx.textAlign='center';ctx.textBaseline='middle';
  const [title,subtitle]=label.split('|');
  const fit=(text:string,size:number,bold:boolean)=>{do{ctx.font=`${bold?'bold ':''}${size}px sans-serif`;if(ctx.measureText(text).width<=910)break;size-=1;}while(size>20);};
  ctx.fillStyle='#473b2b';fit(title,56,true);ctx.fillText(title,526,subtitle?105:140);
  if(subtitle){ctx.fillStyle='#7d6448';fit(subtitle,32,false);ctx.fillText(subtitle,526,189);}
  for(const x of [30,994])for(const y of [30,250]){ctx.fillStyle='#8e7550';ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();}
  const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;
  const material=(Array.isArray(board.material)?board.material[0]:board.material).clone() as T.MeshStandardMaterial;
  material.map=texture;material.needsUpdate=true;board.material=material;
}
