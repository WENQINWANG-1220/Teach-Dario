import {describe,expect,it} from 'vitest';
import {ENDING_LINES,ENDING_START,ENDING_STOPS,EndingMonologue} from '../src/ending';
import {LENGTH,route} from '../src/model';

const at=(progress:number)=>({progress,playing:true,blocked:false});
function distanceBetween(start:number,end:number){
  let previous=route(start),distance=0;
  for(let progress=start+.01;progress<end+.01;progress+=.01){
    const point=route(Math.min(end,progress));
    distance+=Math.hypot(point.x-previous.x,point.z-previous.z);previous=point;
  }
  return distance;
}

describe('Dario’s distance-triggered monologue',()=>{
  it('spaces all twelve lines by physical route distance and leaves a final walking stretch',()=>{
    expect(ENDING_START).toBe(28);expect(ENDING_LINES).toHaveLength(12);expect(ENDING_STOPS).toHaveLength(12);
    expect(ENDING_LINES.every(line=>line.speaker==='Dario'&&!line.text.includes('\n'))).toBe(true);
    const points=[ENDING_START,...ENDING_STOPS,LENGTH];
    const distances=points.slice(1).map((end,index)=>distanceBetween(points[index],end));
    expect(Math.min(...distances)).toBeGreaterThan(1);
    expect(Math.max(...distances)-Math.min(...distances)).toBeLessThan(.04);
    expect(ENDING_STOPS[0]).toBeGreaterThan(ENDING_START);
    expect(ENDING_STOPS.at(-1)).toBeLessThan(LENGTH);
  });

  it('requires walking to the next threshold rather than just waiting or pressing continue',()=>{
    const ending=new EndingMonologue();
    ending.update(100,at(ENDING_STOPS[0]));
    expect(ending.started).toBe(false);expect(ending.current).toBeNull();
    ending.begin();ending.update(100,at(ENDING_START));ending.advance();
    expect(ending.started).toBe(true);expect(ending.active).toBe(false);expect(ending.index).toBe(0);
    ending.update(100,{...at(ENDING_STOPS[0]),unlocked:false});expect(ending.current).toBeNull();
    ending.update(0,at(ENDING_STOPS[0]));expect(ending.current).toEqual(ENDING_LINES[0]);
    ending.advance();ending.advance();ending.advance();
    expect(ending.index).toBe(1);expect(ending.active).toBe(false);
    ending.update(100,at(ENDING_STOPS[0]));expect(ending.current).toBeNull();
  });

  it('shows and automatically clears every sentence in order while the player keeps walking',()=>{
    const ending=new EndingMonologue();ending.begin();
    for(let index=0;index<ENDING_LINES.length;index++){
      ending.update(100,at(ENDING_STOPS[index]-.01));
      expect(ending.active).toBe(false);expect(ending.index).toBe(index);
      ending.update(0,at(ENDING_STOPS[index]));
      expect(ending.current).toEqual(ENDING_LINES[index]);expect(ending.displayIndex).toBe(index);
      const continuingWalk=ENDING_STOPS[index]+.01;
      ending.update(1,at(continuingWalk));
      expect(ending.active).toBe(true);expect(ending.current).toEqual(ENDING_LINES[index]);
      ending.update(100,at(continuingWalk));
      expect(ending.current).toBeNull();expect(ending.index).toBe(index+1);
    }
    expect(ending.completed).toBe(true);expect(ending.active).toBe(false);
    ending.begin();ending.update(100,at(LENGTH));ending.advance();
    expect(ending.index).toBe(12);expect(ending.current).toBeNull();
  });

  it('queues thresholds crossed during a subtitle without losing them when walking back',()=>{
    const ending=new EndingMonologue();ending.begin();ending.update(0,at(ENDING_STOPS[0]));
    ending.update(1,at(ENDING_STOPS[3]));
    expect(ending.index).toBe(0);expect(ending.current).toEqual(ENDING_LINES[0]);
    ending.advance();expect(ending.current).toBeNull();
    for(let index=1;index<=3;index++){
      ending.update(0,at(ENDING_START));
      expect(ending.current).toEqual(ENDING_LINES[index]);ending.advance();
    }
    ending.update(100,at(ENDING_START));expect(ending.current).toBeNull();expect(ending.index).toBe(4);
  });

  it('freezes triggering and reading while paused, blocked or locked',()=>{
    const ending=new EndingMonologue();ending.begin();const arrived=at(ENDING_STOPS[0]);
    for(const state of [{...arrived,playing:false},{...arrived,blocked:true},{...arrived,unlocked:false}]){
      ending.update(100,state);expect(ending.current).toBeNull();
    }
    ending.update(0,arrived);ending.update(1,arrived);
    for(const state of [{...arrived,playing:false},{...arrived,blocked:true},{...arrived,unlocked:false}])ending.update(100,state);
    expect(ending.index).toBe(0);expect(ending.current).toEqual(ENDING_LINES[0]);
    ending.update(1,arrived);expect(ending.index).toBe(0);
    ending.update(100,arrived);expect(ending.index).toBe(1);
  });

  it('restores the next unread sentence, accepts older saves, and resets a completed run',()=>{
    const ending=new EndingMonologue();ending.reset(7);
    expect(ending.started).toBe(false);expect(ending.current).toBeNull();
    ending.begin();ending.update(0,at(ENDING_STOPS[7]));expect(ending.current).toEqual(ENDING_LINES[7]);
    ending.reset(12);ending.begin();expect(ending.completed).toBe(true);expect(ending.active).toBe(false);
    ending.reset();ending.begin();ending.update(0,at(ENDING_STOPS[0]));
    expect(ending.completed).toBe(false);expect(ending.current).toEqual(ENDING_LINES[0]);
    for(const invalid of [-1,13,1.5,NaN]){ending.reset(invalid);expect(ending.index).toBe(0);}
  });
});
