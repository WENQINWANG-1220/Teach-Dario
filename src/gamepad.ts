import type {FootSource} from './input';

export const PAD={deadzone:.18,triggerOn:.55,triggerOff:.35,footSpeed:.65,lookX:900,lookY:650,zoomSpeed:400} as const;
export type PadDevice=Pick<Gamepad,'index'|'id'|'mapping'|'connected'|'axes'|'buttons'>;
type PadSource=Extract<FootSource,'PadLT'|'PadRT'>;
type Stick={x:number;y:number};
export interface PadFrame {
  connected:boolean;supported:boolean;name:string;disconnected:boolean;unavailable:boolean;
  pressed:PadSource[];released:PadSource[];lean:{x:number;z:number};aim:Stick;zoom:number;
  pause:boolean;confirm:boolean;back:boolean;reset:boolean;up:boolean;down:boolean;activity:boolean;
}
const empty=():PadFrame=>({connected:false,supported:false,name:'',disconnected:false,unavailable:false,pressed:[],released:[],lean:{x:0,z:0},aim:{x:0,y:0},zoom:0,pause:false,confirm:false,back:false,reset:false,up:false,down:false,activity:false});
const finite=(value:number|undefined)=>Number.isFinite(value)?Math.max(-1,Math.min(1,value!)):0;
/** Radial deadzone preserves small analogue values and caps diagonal speed. */
export function padStick(x=0,y=0):Stick {
  x=finite(x);y=finite(y);const length=Math.hypot(x,y);
  if(length<=PAD.deadzone)return {x:0,y:0};
  const scale=(Math.min(1,length)-PAD.deadzone)/(1-PAD.deadzone)/length;
  return {x:x*scale,y:y*scale};
}
/** Poll fresh snapshots; hardware state is never held as a long-lived Gamepad reference. */
export class GamepadAdapter {
  state=empty();private identity='';private index=-1;
  private buttons:boolean[]=[];private triggers=[false,false];private output=[false,false];
  private triggerArmed=[false,false];private stickArmed=[false,false];
  private zoomArmed=false;
  private blockedMenu=new Set<number>();
  constructor(private read:()=>ReadonlyArray<PadDevice|null>=()=>{if(typeof navigator.getGamepads!=='function')throw Error('Gamepad API unavailable');return navigator.getGamepads();}){ }
  /** Gameplay must return to neutral after pause, reset, falls or reconnection. Menu edges persist. */
  suspend(){this.triggerArmed=[false,false];this.stickArmed=[false,false];this.zoomArmed=false;}
  blockMenu(){for(const index of [0,1,3,9,12,13])this.blockedMenu.add(index);}
  poll():PadFrame {
    let pads:ReadonlyArray<PadDevice|null>;
    try{pads=this.read();}catch{const disconnected=!!this.identity;this.forget();return this.state={...empty(),unavailable:true,disconnected};}
    const connected=pads.filter((p):p is PadDevice=>!!p&&p.connected);
    const device=connected.find(p=>p.index===this.index&&`${p.index}:${p.id}`===this.identity)??connected.find(p=>p.mapping==='standard')??connected[0];
    if(!device){const disconnected=!!this.identity;this.forget();return this.state={...empty(),disconnected};}
    const identity=`${device.index}:${device.id}`,changed=identity!==this.identity,disconnected=changed&&!!this.identity;
    if(changed){this.forget();this.identity=identity;this.index=device.index;}
    const frame={...empty(),connected:true,supported:device.mapping==='standard',name:device.id,disconnected};
    if(!frame.supported){frame.disconnected ||= this.state.supported;this.suspend();this.output=[false,false];this.buttons=[];return this.state=frame;}
    const values=device.buttons.map(b=>Math.max(0,finite(b.value)||Number(b.pressed))),buttons=values.map(v=>v>=.5);
    const edge=(i:number)=>{if(!buttons[i])this.blockedMenu.delete(i);return !!buttons[i]&&!this.buttons[i]&&!this.blockedMenu.has(i);};
    frame.pause=edge(9);frame.confirm=edge(0);frame.back=edge(1);frame.reset=edge(3);frame.up=edge(12);frame.down=edge(13);
    for(let i=0;i<2;i++){
      const value=values[6+i]??0;
      this.triggers[i]=this.triggers[i]?value>PAD.triggerOff:value>=PAD.triggerOn;
      if(value<=PAD.triggerOff)this.triggerArmed[i]=true;
      const down=this.triggerArmed[i]&&this.triggers[i],source:PadSource=i===0?'PadLT':'PadRT';
      if(down&&!this.output[i])frame.pressed.push(source);
      if(!down&&this.output[i])frame.released.push(source);
      this.output[i]=down;
    }
    const sticks=[padStick(device.axes[0],device.axes[1]),padStick(device.axes[2],device.axes[3])];
    for(let i=0;i<2;i++){if(!sticks[i].x&&!sticks[i].y)this.stickArmed[i]=true;if(!this.stickArmed[i])sticks[i]={x:0,y:0};}
    if(!buttons[12]&&!buttons[13])this.zoomArmed=true;
    frame.lean={x:sticks[0].x,z:-sticks[0].y};frame.aim=sticks[1];frame.zoom=this.zoomArmed?Number(!!buttons[13])-Number(!!buttons[12]):0;
    frame.activity=!!(frame.pressed.length||frame.released.length||frame.pause||frame.confirm||frame.back||frame.reset||frame.up||frame.down||sticks.some(s=>s.x||s.y));
    this.buttons=buttons;return this.state=frame;
  }
  private forget(){this.identity='';this.index=-1;this.buttons=[];this.triggers=[false,false];this.output=[false,false];this.suspend();}
}
