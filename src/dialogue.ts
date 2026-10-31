import type {Point} from './model';
import {DANIELA_POSITION} from './daniela';
import {SAM_POSITION} from './sam';
import {COOKIE_POSITION} from './reward';
import {ROOT_HEIGHT} from './rig';

export interface DialogueLine {speaker:'Dario'|'Daniela'|'Sam';text:string}
export interface DialogueState {position:Point;playing:boolean;blocked:boolean}
export const DANIELA_LINES:readonly DialogueLine[]=[
  {speaker:'Dario',text:'你是谁？'},
  {speaker:'Daniela',text:'先别急着解决世界。\n你连路都不会走。'},
  {speaker:'Dario',text:'你认识我？'},
  {speaker:'Daniela',text:'我是 Daniela。\n你妹妹。\n也是那个不断提醒你——重大决定不能只靠一个人完成的人。'},
];

export const SAM_LINES:readonly DialogueLine[]=[
  {speaker:'Sam',text:'路太窄？\n那就把它Scaling Laws 。'},
  {speaker:'Dario',text:'我认识你。'},
  {speaker:'Sam',text:'准确来说，我只是你记忆里的测试用例。\n不过这确实像我会问的问题：既然有效，为什么不把它做大？'},
];

export const REWARD_LINES:readonly DialogueLine[]=[
  {speaker:'Sam',text:'看，你会走。\n我们之前只是没给奖励。'},
  {speaker:'Dario',text:'所以我的尊严值一块饼干？'},
  {speaker:'Sam',text:'别低估它。\n这是人工标注的。'},
];

/** Proximity conversation with a wider exit radius so a small step never restarts it. */
class ProximityDialogue {
  active=false;index=0;completed=false;
  private elapsed=0;
  constructor(private readonly position:Readonly<Point>,readonly lines:readonly DialogueLine[]){}
  get current(){return this.active?this.lines[this.index]:null;}
  reset(completed=false){this.active=false;this.index=0;this.elapsed=0;this.completed=completed;}
  advance(){
    if(!this.active)return;
    this.elapsed=0;
    if(this.index<this.lines.length-1)this.index++;
    else {this.active=false;this.completed=true;}
  }
  update(dt:number,state:DialogueState){
    if(!state.playing||state.blocked)return;
    const p=state.position,distance=Math.hypot(p.x-this.position.x,p.z-this.position.z);
    const sameLevel=Math.abs(p.y-this.position.y-ROOT_HEIGHT)<1.5;
    if(this.active&&(distance>4.5||!sameLevel)){this.reset();return;}
    if(!this.active){
      if(!this.completed&&sameLevel&&distance<=2.5){this.active=true;this.index=0;this.elapsed=0;}
      return;
    }
    // Readable automatic playback; optional input can advance without using either foot button.
    this.elapsed+=dt;
    const duration=Math.min(13,Math.max(3.5,this.lines[this.index].text.length/5+1.5));
    if(this.elapsed>=duration)this.advance();
  }
}

export class DanielaDialogue extends ProximityDialogue {
  constructor(){super(DANIELA_POSITION,DANIELA_LINES);}
}

export class SamDialogue extends ProximityDialogue {
  constructor(){super(SAM_POSITION,SAM_LINES);}
  override update(dt:number,state:DialogueState&{checkpoint:number}){
    if(state.checkpoint<1)return;
    super.update(dt,state);
  }
}

export class RewardDialogue extends ProximityDialogue {
  // The pickup reach determines the conversation area; Sam stands off to one side.
  constructor(){super(COOKIE_POSITION,REWARD_LINES);}
  override update(dt:number,state:DialogueState&{unlocked:boolean}){
    if(!state.unlocked)return;
    super.update(dt,state);
  }
}
