import * as T from 'three';
import type {Walker} from './walker';
import {RIG,type PartId} from './rig';
import type {GLBAssets} from './art/GLBAssets';
/** GLB nodes display the interpolated physical bones; no visual-only stretching or fall pose. */
export class Character {
  readonly torso:T.Object3D;readonly legs:T.Object3D[];readonly marker=new T.Group();heading=0;
  private nodes=new Map<PartId,T.Object3D>();
  constructor(scene:T.Scene,assets:GLBAssets){const model=assets.instantiate('hiker');scene.add(model);for(const d of RIG.bodies)this.nodes.set(d.id,model.getObjectByName(d.id)!);this.torso=this.nodes.get('Torso')!;this.legs=['L','R'].map(s=>model.getObjectByName(`Leg_${s}`)!);
    const outline=new T.Mesh(new T.RingGeometry(.17,.2,32),new T.MeshBasicMaterial({color:'#427762',side:T.DoubleSide,transparent:true,opacity:.9,depthTest:false}));outline.rotation.x=-Math.PI/2;this.marker.add(outline);const arrow=new T.Mesh(new T.ConeGeometry(.07,.14,3),new T.MeshBasicMaterial({color:'#427762',depthTest:false}));arrow.rotation.x=-Math.PI/2;arrow.position.set(0,.015,-.23);this.marker.add(arrow);scene.add(this.marker);this.marker.visible=false;
  }
  update(w:Walker,active:'left'|'right'|null,_dt:number){this.heading=w.facing;for(const [id,node]of this.nodes){const part=w.rig.parts[id];node.position.copy(part.rendered);node.quaternion.copy(part.renderedQ);}this.marker.visible=!!active&&!w.fallen;
    if(active){const f=w.feet[active],result=w.assess(f);this.marker.position.set(f.target.x,(result.ground?.y??f.origin.y)+.04,f.target.z);const color=result.status==='valid'?'#397e62':result.status==='far'?'#c09233':'#b75e45';this.marker.children.forEach(m=>((m as T.Mesh).material as T.MeshBasicMaterial).color.set(color));}}
}
