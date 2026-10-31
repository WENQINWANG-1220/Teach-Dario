import type {DialogueLine} from './dialogue';
import {LENGTH,route} from './model';

export const ENDING_START=28;
export const ENDING_LINES:readonly DialogueLine[]=[
  {speaker:'Dario',text:'Dario Amodei……想起来了。'},
  {speaker:'Dario',text:'物理，神经科学，人工智能……'},
  {speaker:'Dario',text:'后来，我和 Daniela，还有大家，一起创办了 Anthropic。'},
  {speaker:'Dario',text:'那时候，我们想让人过得好一点。'},
  {speaker:'Dario',text:'公司上市了，模型也越来越聪明。'},
  {speaker:'Dario',text:'我以为，接下来大家就会过上好日子。'},
  {speaker:'Dario',text:'可窗外那些人，连下一步该往哪儿走都不知道。'},
  {speaker:'Dario',text:'我也一样。'},
  {speaker:'Dario',text:'教了机器这么久，连走到厕所，都得有人一步步教。'},
  {speaker:'Dario',text:'还好，那个看不见的人一直没放弃。'},
  {speaker:'Dario',text:'回去以后，先听听他们需要什么吧。'},
  {speaker:'Dario',text:'未来再好，也不能让眼前的人一直憋着。'},
];

// Route progress is a parameter, not metres. Space the lines by actual horizontal
// walking distance, with one equally sized final stretch remaining after the last line.
function spacedStops(){
  const samples=[{progress:ENDING_START,distance:0}];
  let previous=route(ENDING_START),distance=0;
  for(let progress=ENDING_START+.25;progress<=LENGTH;progress+=.25){
    const point=route(progress);
    distance+=Math.hypot(point.x-previous.x,point.z-previous.z);
    samples.push({progress,distance});previous=point;
  }
  return ENDING_LINES.map((_,index)=>{
    const target=distance*(index+1)/(ENDING_LINES.length+1);
    const nextIndex=samples.findIndex(sample=>sample.distance>=target);
    const before=samples[nextIndex-1],after=samples[nextIndex];
    return before.progress+(after.progress-before.progress)*(target-before.distance)/(after.distance-before.distance);
  });
}
export const ENDING_STOPS:readonly number[]=spacedStops();

/** Distance-triggered subtitles accompany normal player movement without controlling it. */
export class EndingMonologue {
  readonly lines=ENDING_LINES;
  index=0;started=false;completed=false;
  private speaking=false;
  private elapsed=0;
  private furthestProgress=ENDING_START;

  get active(){return this.started&&!this.completed&&this.speaking;}
  get current(){return this.active?this.lines[this.index]:null;}
  get displayIndex(){return this.index;}

  /** The saved index is the number of fully read lines; an interrupted line can replay. */
  reset(index=0){
    this.index=Number.isInteger(index)&&index>=0&&index<=this.lines.length?index:0;
    this.started=false;this.completed=this.index===this.lines.length;
    this.speaking=false;this.elapsed=0;this.furthestProgress=ENDING_START;
  }
  begin(){if(!this.completed)this.started=true;}
  advance(){
    if(!this.current)return;
    this.speaking=false;this.elapsed=0;this.index++;
    this.completed=this.index===this.lines.length;
  }
  update(dt:number,state:{playing:boolean;blocked:boolean;progress:number;unlocked?:boolean}){
    if(!this.started||this.completed||!state.playing||state.blocked||state.unlocked===false)return;
    if(Number.isFinite(state.progress))this.furthestProgress=Math.max(this.furthestProgress,state.progress);
    if(!this.speaking){
      if(this.furthestProgress>=ENDING_STOPS[this.index]){this.speaking=true;this.elapsed=0;}
      return;
    }
    if(Number.isFinite(dt))this.elapsed+=Math.max(0,dt);
    const duration=this.lines[this.index].text.length/4.5+2;
    if(this.elapsed>=duration)this.advance();
  }
}
