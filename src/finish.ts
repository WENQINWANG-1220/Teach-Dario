import {TOILET_POSITION,type Point} from './model';
import {ROOT_HEIGHT} from './rig';

/** Reach the toilet itself, beyond the route marker at the middle of the summit. */
export function hasReachedToilet(position:Point){
  return Math.hypot(position.x-TOILET_POSITION.x,position.z-TOILET_POSITION.z)<=1.15&&
    Math.abs(position.y-TOILET_POSITION.y-ROOT_HEIGHT)<=.6;
}
