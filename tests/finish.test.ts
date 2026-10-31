import {describe,it,expect} from 'vitest';
import {hasReachedToilet} from '../src/finish';
import {route,TOILET_POSITION} from '../src/model';
import {ROOT_HEIGHT} from '../src/rig';

describe('arrival at the golden toilet',()=>{
  it('waits until the player reaches the toilet instead of the middle of the summit',()=>{
    const summit=route(180);
    expect(hasReachedToilet({...summit,y:summit.y+ROOT_HEIGHT})).toBe(false);
    expect(hasReachedToilet({...TOILET_POSITION,y:TOILET_POSITION.y+ROOT_HEIGHT,z:TOILET_POSITION.z+.95})).toBe(true);
    expect(hasReachedToilet({...TOILET_POSITION,y:TOILET_POSITION.y+ROOT_HEIGHT,x:2})).toBe(false);
  });
  it('does not trigger from a lower floor or above the toilet',()=>{
    expect(hasReachedToilet({...TOILET_POSITION,y:1})).toBe(false);
    expect(hasReachedToilet({...TOILET_POSITION,y:TOILET_POSITION.y+ROOT_HEIGHT+2})).toBe(false);
  });
});
