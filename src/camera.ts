import * as T from 'three';
import { clamp, type Point } from './model';
export class FollowCamera {
  readonly camera = new T.PerspectiveCamera(46, innerWidth / innerHeight, .08, 250);
  yaw = 0; pitch = .29; distance = 5.4;
  target = new T.Vector3(); private ray = new T.Raycaster(); initialized = false;
  move(dx: number, dy: number) { this.yaw -= dx * .0024; this.pitch = clamp(this.pitch + dy * .002, -.12, .95); }
  zoom(delta: number) { this.distance = clamp(this.distance + delta * .003, 2.5, 8); }
  update(p: Point, dt: number, surfaces: T.Object3D[], home = false) {
    if(home){this.camera.position.set(42,30,30);this.camera.lookAt(0,9,-18);this.camera.setViewOffset(innerWidth,innerHeight,-innerWidth*.1,0,innerWidth,innerHeight);return;}
    const aim = new T.Vector3(p.x, p.y + .25, p.z);
    if (!this.initialized) { this.target.copy(aim); this.initialized = true; }
    this.target.lerp(aim, 1 - Math.exp(-dt * 7));
    const yaw = home ? -.55 : this.yaw, pitch = home ? .27 : this.pitch, distance = home ? 9 : this.distance;
    const direction = new T.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    this.ray.set(this.target, direction); this.ray.far = distance;
    const hits = this.ray.intersectObjects(surfaces, false);
    const safe = hits.length ? Math.max(.12, Math.min(distance, hits[0].distance - .22)) : distance;
    this.camera.position.copy(this.target).addScaledVector(direction, safe); this.camera.lookAt(this.target);
    if (home) this.camera.setViewOffset(innerWidth, innerHeight, -innerWidth * .19, 0, innerWidth, innerHeight); else this.camera.clearViewOffset();
  }
  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }
}
