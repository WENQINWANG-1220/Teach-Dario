import './style.css';
import * as T from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Audio } from './audio';
import { FollowCamera } from './camera';
import {DeveloperControls} from './developer';
import { Character } from './character';
import {DanielaProjection} from './daniela';
import {SamProjection,SAM_POSITION} from './sam';
import {DanielaDialogue,SamDialogue,RewardDialogue} from './dialogue';
import {FeedbackCookie,canEat,REWARD_CHECKPOINT,SAM_REWARD_POSITION} from './reward';
import {NormalWalk} from './locomotion';
import {EndingMonologue} from './ending';
import {EndingCinema} from './cinematic';
import {hasReachedToilet} from './finish';
import { InputState, editable } from './input';
import {GamepadAdapter,PAD,type PadFrame} from './gamepad';
import { CHECKPOINTS, LENGTH, RunState, clamp, route, routeFacing, projectRoute } from './model';
import { SaveStore } from './storage';
import { UI } from './ui';
import { Walker } from './walker';
import { Landscape } from './world';
import { MountainSlide } from './slide';
import { GLBAssets } from './art/GLBAssets';
import {PHYSICS_DT,ROOT_HEIGHT} from './rig';
export class Game {
  readonly run = new RunState(); readonly input = new InputState(); readonly store = new SaveStore(); readonly audio = new Audio(); readonly view = new FollowCamera();
  readonly slide=new MountainSlide();
  readonly developer=new DeveloperControls();
  readonly dialogue=new DanielaDialogue();readonly daniela:DanielaProjection;
  readonly samDialogue=new SamDialogue();readonly sam:SamProjection;
  readonly rewardDialogue=new RewardDialogue();readonly cookie=new FeedbackCookie();
  readonly ending=new EndingMonologue();
  readonly gamepad=new GamepadAdapter();controlMode:'keyboard'|'gamepad'='keyboard';
  private padAxes={lean:{x:0,z:0},aim:{x:0,y:0},zoom:0};
  readonly ui = new UI();readonly cinema=new EndingCinema(this.ui.host); readonly physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  readonly world: Landscape; readonly walker = new Walker(this.physics); readonly character: Character;
  readonly locomotion=new NormalWalk(this.walker);
  readonly renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  private accumulator = 0; private last = performance.now(); private saveTime = 0; private autoRespawn = 0; private lockPending = false;
  private submergedTime=0;
  private debugLines?:T.LineSegments;
  constructor(readonly assets: GLBAssets) {
    this.world = new Landscape(this.physics,assets); this.character = new Character(this.world.scene,assets);
    this.daniela=new DanielaProjection(assets.instantiate('daniela'));this.world.scene.add(this.daniela.root);
    this.sam=new SamProjection(assets.instantiate('sam'));this.world.scene.add(this.sam.root);
    this.world.scene.add(this.cookie.root);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7)); this.renderer.setSize(innerWidth, innerHeight); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap; this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15;
    this.ui.el('scene').append(this.renderer.domElement); this.audio.muted = this.store.muted;
    for(const part of Object.values(this.walker.rig.parts)){const d=part.definition;this.world.environment.add(part.body,d.mass/985,{x:d.shape==='box'?d.size.x/2:d.size.x,y:d.shape==='box'||d.shape==='capsule'?d.size.y/2:d.size.y,z:d.shape==='box'?d.size.z/2:d.size.z});}
    this.physics.timestep = PHYSICS_DT; this.physics.step(undefined,this.walker.rig.hooks); this.walker.reset(route(0),routeFacing(0));
    if(new URLSearchParams(location.search).has('physicsDebug')){this.debugLines=new T.LineSegments(new T.BufferGeometry(),new T.LineBasicMaterial({vertexColors:true,depthTest:false,transparent:true,opacity:.7}));this.debugLines.frustumCulled=false;this.world.scene.add(this.debugLines);}
    this.ui.show('continue', !!this.store.saved && !this.store.saved.finished); this.updateSound();
    this.ui.button('start', () => this.start(false)); this.ui.button('continue', () => this.start(true));
    this.ui.button('pause', () => this.pause()); this.ui.button('resume', () => this.requestLock());
    this.ui.button('restart', () => { if (window.confirm('重新出发会替换当前旅程进度，最佳成绩会保留。')) this.start(false); });
    this.ui.button('back', () => this.home()); this.ui.button('brand', () => this.home());
    this.ui.button('sound', () => { this.audio.unlock();this.audio.muted = !this.audio.muted; this.updateSound(); this.store.setMuted(this.audio.muted); if (this.run.phase !== 'home') this.save(); this.ui.show('storage-warning', !this.store.available); });
    document.addEventListener('keydown', e => {
      if (editable(e.target)) return;
      if(this.run.phase==='finished'){
        if(['Enter','Space'].includes(e.code)){e.preventDefault();if(!e.repeat&&this.cinema.pendingGesture)this.cinema.retry();}
        return;
      }
      if (e.code === 'Escape') { this.pause(); return; }
      if (!['playing', 'fallen', 'recovering','sliding'].includes(this.run.phase)) return;
      if(e.code==='Digit1'||e.code==='Digit2'){
        e.preventDefault();if(e.repeat)return;
        this.clearInput();
        this.locomotion.deactivate();
        const mode=e.code==='Digit1'?'camera':'placement';
        if(mode==='placement'&&this.developer.mode!=='placement'){this.slide.clear(this.walker);this.run.phase='playing';this.autoRespawn=this.submergedTime=0;}
        this.developer.toggle(mode,this.view,this.walker);this.accumulator=0;return;
      }
      if(this.developer.mode){e.preventDefault();this.developer.held.add(e.code);return;}
      if(this.activeDialogue.active&&this.run.phase==='playing'&&(e.code==='Enter'||e.code==='Space'&&this.activeDialogue!==this.ending)){e.preventDefault();if(!e.repeat)this.advanceDialogue();return;}
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight','Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'KeyR'&&this.run.phase!=='sliding') { this.respawn(); return; }
      if (this.run.phase !== 'playing') return;
      if(e.code==='Space'){if(this.run.walkingUnlocked)this.locomotion.jump();return;}
      this.input.press(e.code);
    });
    document.addEventListener('keyup', e => {
      if (editable(e.target)) return;
      this.developer.held.delete(e.code);
      this.input.release(e.code);
    });
    document.addEventListener('mousedown', e => {
      if (document.pointerLockElement !== this.renderer.domElement || this.run.phase !== 'playing' || ![0, 2].includes(e.button)) return;
      if(this.developer.mode){e.preventDefault();if(e.button===0)this.developer.place(this.view,this.walker,this.world.surfaces);return;}
      if(this.run.walkingUnlocked)return;
      e.preventDefault(); const foot = this.input.press(`Mouse${e.button}`, this.view.yaw); if (foot) this.walker.lift(foot);
    });
    document.addEventListener('mouseup', e => {
      if(this.developer.mode)return;
      if (![0, 2].includes(e.button)) return;
      if (this.run.phase === 'playing') this.applyMouseMotion();
      const foot = this.input.release(`Mouse${e.button}`); if (foot && this.run.phase === 'playing') this.walker.land(foot);
    });
    document.addEventListener('contextmenu', e => { if (document.pointerLockElement === this.renderer.domElement) e.preventDefault(); });
    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement !== this.renderer.domElement || !['playing', 'fallen', 'recovering','sliding'].includes(this.run.phase)) return;
      if(this.developer.mode){this.developer.look(e.movementX,e.movementY,this.view);return;}
      if (this.run.phase === 'playing' && this.input.footHeld) this.input.moveMouse(e.movementX, e.movementY);
      else this.view.move(e.movementX, e.movementY);
    });
    this.renderer.domElement.addEventListener('wheel', e => { if (['playing', 'fallen', 'recovering','sliding'].includes(this.run.phase)) { e.preventDefault(); if(this.developer.mode!=='camera')this.view.zoom(e.deltaY); } }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === this.renderer.domElement) { if (this.lockPending) { this.run.resume(); this.lockPending = false; this.last = performance.now(); this.accumulator = 0; } }
      else if(this.controlMode==='keyboard') { this.pause(false); }
    });
    this.renderer.domElement.addEventListener('click',()=>{
      if(this.controlMode==='gamepad'&&['playing','fallen','recovering','sliding'].includes(this.run.phase)){
        this.pause();this.controlMode='keyboard';this.requestLock();
      }
    });
    document.addEventListener('pointerlockerror', () => this.lockFailed());
    window.addEventListener('blur', () => {this.gamepad.blockMenu();this.pause();}); document.addEventListener('visibilitychange', () => { if (document.hidden){this.gamepad.blockMenu();this.pause();} });
    window.addEventListener('resize', () => { this.renderer.setSize(innerWidth, innerHeight); this.view.resize(); });
    window.addEventListener('beforeunload', () => { if (this.run.phase !== 'home') this.save(); });
    this.ui.show('storage-warning', !this.store.available); requestAnimationFrame(this.frame);
  }
  private updateSound() { this.ui.text('sound', this.audio.muted ? '♫̸' : '♪'); this.ui.el('sound').setAttribute('aria-pressed', String(this.audio.muted)); }
  private clearInput() {
    this.locomotion.clear();
    this.walker.cancelSwing();
    this.input.clear();
    this.walker.lean.clear();
    this.gamepad.suspend();this.padAxes={lean:{x:0,z:0},aim:{x:0,y:0},zoom:0};
  }
  private activateGamepad(){
    if(this.controlMode==='gamepad'||this.input.dragging)return;
    this.controlMode='gamepad';this.lockPending=false;
    if(document.pointerLockElement)document.exitPointerLock();
  }
  private pollGamepad(){
    const pad=this.gamepad.poll();
    if(this.run.phase==='finished'){
      if(this.cinema.pendingGesture&&(pad.confirm||pad.pause))this.cinema.retry();
      this.gamepad.suspend();return;
    }
    if(this.developer.mode){this.gamepad.suspend();return;}
    if(document.hidden||!document.hasFocus()){this.gamepad.suspend();this.gamepad.blockMenu();return;}
    if(pad.disconnected)this.gamepad.blockMenu();
    if(pad.disconnected&&this.controlMode==='gamepad'){
      this.pause();this.clearInput();
      this.ui.text('dialog-body','重新连接后按 Start 继续，或点击继续使用键鼠。');return;
    }
    if(pad.disconnected){
      for(const source of ['PadLT','PadRT']){const foot=this.input.release(source);if(foot)this.walker.land(foot);}
      this.input.setPadLean({x:0,z:0});this.padAxes={lean:{x:0,z:0},aim:{x:0,y:0},zoom:0};
    }
    if(!pad.supported)return;
    if(pad.activity&&!editable(document.activeElement))this.activateGamepad();
    if((this.controlMode!=='gamepad'&&!this.input.dragging)||editable(document.activeElement))return;
    this.padAxes={lean:pad.lean,aim:pad.aim,zoom:pad.zoom};
    if(pad.pause){
      if(this.run.phase==='home')this.start(!!this.store.saved&&!this.store.saved.finished);
      else if(this.run.phase==='paused')this.requestLock();else this.pause();
      return;
    }
    if(['home','paused'].includes(this.run.phase)){this.gamepadMenu(pad);return;}
    if(pad.confirm&&this.run.phase==='playing'){
      if(this.activeDialogue.active&&this.activeDialogue!==this.ending)this.advanceDialogue();else if(this.run.walkingUnlocked)this.locomotion.jump();
    }
    if(pad.reset&&this.run.phase!=='sliding'){this.respawn();return;}
    if(this.run.phase!=='playing')return;
    if(this.run.walkingUnlocked)return;
    // Releases first allow a same-frame LT-up / RT-down to change feet cleanly.
    for(const source of pad.released){const foot=this.input.release(source);if(foot)this.walker.land(foot);}
    for(const source of pad.pressed){const foot=this.input.press(source,this.view.yaw);if(foot)this.walker.lift(foot);}
  }
  private gamepadMenu(pad:PadFrame){
    if(pad.back){if(this.run.phase!=='home')this.home();return;}
    const ids=this.run.phase==='home'?['continue','start','sound']:this.run.phase==='paused'?['resume','back','sound']:['back','sound'];
    const buttons=ids.map(id=>this.ui.el(id)).filter(el=>!el.hidden&&!!el.getClientRects().length);
    const focused=buttons.indexOf(document.activeElement as HTMLElement);
    if(pad.up!==pad.down){const offset=pad.up?-1:1,index=focused<0?0:(focused+offset+buttons.length)%buttons.length;buttons[index]?.focus();}
    if(pad.confirm)(buttons[focused<0?0:focused] as HTMLButtonElement|undefined)?.click();
  }
  private applyGamepadMotion(dt:number){
    this.input.setPadLean(this.run.phase==='playing'?this.padAxes.lean:{x:0,z:0});
    const aim=this.padAxes.aim;
    if(this.run.phase==='playing'&&this.input.padDragging&&this.input.active){
      this.walker.moveTarget(this.input.active,{x:aim.x*PAD.footSpeed*dt,z:-aim.y*PAD.footSpeed*dt},this.input.dragYaw);
    }else if(!this.input.footHeld){this.view.move(aim.x*PAD.lookX*dt,aim.y*PAD.lookY*dt);}
    this.view.zoom(this.padAxes.zoom*PAD.zoomSpeed*dt);
  }
  private applyMouseMotion() {
    const delta = this.input.consumeMouse();
    if (this.input.active && this.input.dragging) this.walker.moveTarget(this.input.active, delta, this.input.dragYaw);
  }
  private get activeDialogue(){return this.rewardDialogue.active?this.rewardDialogue:this.samDialogue.active?this.samDialogue:this.dialogue.active?this.dialogue:this.ending.active?this.ending:this.dialogue;}
  private get samAtReward(){return this.run.walkingUnlocked||this.run.maxProgress>=REWARD_CHECKPOINT;}
  private get cookieReady(){return this.run.phase==='playing'&&!this.developer.mode&&!this.run.walkingUnlocked&&!this.activeDialogue.active&&canEat(this.walker.body.translation(),this.run.checkpoint);}
  private eatCookie(){
    if(!this.cookieReady)return false;
    this.clearInput();this.run.walkingUnlocked=true;this.locomotion.setUnlocked(true);
    this.cookie.update(0,true);this.sam.root.position.copy(SAM_REWARD_POSITION);
    this.rewardDialogue.update(0,{position:this.walker.body.translation(),playing:true,blocked:false,unlocked:true});
    this.audio.sound('checkpoint');this.save();return true;
  }
  private advanceDialogue(){const dialogue=this.activeDialogue;dialogue.advance();if(dialogue===this.ending)this.save();else if(dialogue.completed){this.clearInput();this.save();}}
  private updateEnding(dt:number){
    const p=projectRoute(this.walker.body.translation());
    if(this.run.walkingUnlocked&&this.rewardDialogue.completed&&!this.ending.started)this.ending.begin();
    const index=this.ending.index;
    this.ending.update(dt,{playing:this.run.phase==='playing',blocked:!!this.developer.mode||this.dialogue.active||this.samDialogue.active||this.rewardDialogue.active,progress:p.distance<2.5&&p.heightError<.75?p.s:0});
    if(this.ending.index!==index)this.save();
  }
  start(continuing: boolean) {
    this.cinema.reset();
    this.locomotion.setUnlocked(false);
    this.world.summit.reset(continuing&&!!this.store.saved?.summitRevealed);
    this.ending.reset(continuing?this.store.saved?.endingIndex??0:0);
    this.dialogue.reset(continuing&&!!this.store.saved?.danielaSeen);
    this.samDialogue.reset(continuing&&!!this.store.saved?.samSeen);
    this.rewardDialogue.reset(continuing&&!!this.store.saved?.rewardSeen);
    this.developer.clear();this.run.reset();
    if (continuing && this.store.saved && !this.store.saved.finished) { const s = this.store.saved; this.run.checkpoint = s.checkpoint; this.run.elapsed = s.elapsed; this.run.falls = s.falls; this.run.steps = s.steps; this.run.maxProgress = s.maxProgress;this.run.walkingUnlocked=!!s.walkingUnlocked; }
    this.clearInput(); this.world.resetDynamics();this.slide.clear(this.walker);this.walker.reset(route(CHECKPOINTS[this.run.checkpoint]),routeFacing(CHECKPOINTS[this.run.checkpoint])); this.view.yaw = routeFacing(CHECKPOINTS[this.run.checkpoint]); this.view.pitch = .29; this.view.initialized = false;
    this.locomotion.reset();this.locomotion.setUnlocked(this.run.walkingUnlocked);
    this.run.previous = 'playing'; this.run.phase = 'paused'; this.accumulator = 0; this.requestLock(); this.save();
  }
  private lockFailed() { if (!this.lockPending) return; this.lockPending = false; this.run.pause(); this.ui.text('dialog-title', '点击进入游戏'); this.ui.text('dialog-body', '游戏需要锁定鼠标来转动视角。\n点击下方按钮，再迈出第一步。'); this.ui.text('resume', '点击进入游戏 →'); }
  requestLock() {
    if (this.run.phase !== 'paused') return;
    if(this.controlMode==='gamepad'&&this.gamepad.state.connected&&this.gamepad.state.supported){
      this.clearInput();this.lockPending=false;this.run.resume();this.audio.unlock();this.last=performance.now();this.accumulator=0;return;
    }
    this.controlMode='keyboard';
    this.audio.unlock(); this.lockPending = true;
    this.ui.text('dialog-eyebrow', 'TAKE YOUR TIME');
    this.ui.text('dialog-title', '停下来，看看风景'); this.ui.text('dialog-body', '山一直都在，准备好再走。\nEsc 暂停 · 移动鼠标转动视角'); this.ui.text('resume', '继续旅程 →');
    if (document.pointerLockElement === this.renderer.domElement) { this.run.resume(); this.lockPending = false; return; }
    try { const request = this.renderer.domElement.requestPointerLock(); if (request) void request.catch(() => this.lockFailed()); } catch { this.lockFailed(); }
  }
  pause(exit = true) {
    if (!['playing', 'fallen', 'recovering','sliding'].includes(this.run.phase)) return;
    this.developer.clear();this.view.initialized=false;this.run.pause(); this.clearInput(); this.accumulator = 0; this.save();
    this.ui.text('dialog-title', '停下来，看看风景'); this.ui.text('dialog-body', this.controlMode==='gamepad'?'山一直都在，准备好再走。\nStart 或 A / × 继续 · B / ○ 返回首页':'山一直都在，准备好再走。\nEsc 暂停 · 移动鼠标转动视角'); this.ui.text('resume', '继续旅程 →');
    if (exit && document.pointerLockElement) document.exitPointerLock();
  }
  home() {
    this.cinema.reset();
    if (this.run.phase !== 'home' && this.run.phase !== 'finished') this.save();
    this.ending.reset(this.ending.index);
    this.samDialogue.reset(this.samDialogue.completed);
    this.rewardDialogue.reset(this.rewardDialogue.completed);this.locomotion.setUnlocked(false);
    this.dialogue.reset(this.dialogue.completed);this.developer.clear();this.slide.clear(this.walker);this.run.phase = 'home'; this.lockPending = false; this.clearInput(); if (document.pointerLockElement) document.exitPointerLock(); this.world.resetDynamics();this.walker.reset(route(0),routeFacing(0)); this.view.initialized = false; this.ui.show('continue', !!this.store.saved && !this.store.saved.finished);
  }
  respawn() { this.ending.reset(this.ending.index);this.dialogue.reset(this.dialogue.completed);this.samDialogue.reset(this.samDialogue.completed);this.rewardDialogue.reset(this.rewardDialogue.completed);this.locomotion.deactivate();this.developer.clear();this.slide.clear(this.walker);this.clearInput();this.world.resetDynamics(); this.walker.reset(route(CHECKPOINTS[this.run.checkpoint]),routeFacing(CHECKPOINTS[this.run.checkpoint]));this.locomotion.reset();this.view.yaw=routeFacing(CHECKPOINTS[this.run.checkpoint]);this.submergedTime=0; this.run.phase = 'playing'; this.autoRespawn = 0; this.view.initialized = false; this.accumulator = 0; this.save(); }
  private save() { this.store.write(this.run, this.audio.muted,this.dialogue.completed,this.samDialogue.completed,this.rewardDialogue.completed,this.ending.index,this.world.summit.revealed); this.ui.show('storage-warning', !this.store.available); }
  private finish() {
    if(this.run.phase==='finished')return;
    this.run.advance(LENGTH);this.run.phase = 'finished';this.lockPending=false; this.clearInput(); this.save();
    if (document.pointerLockElement) document.exitPointerLock();
    this.cinema.start(this.audio.muted);
  }
  private fixed(dt: number) {
    this.run.elapsed += dt;
    this.updateEnding(dt);
    const wasFallen = this.walker.fallen;
    this.applyGamepadMotion(dt);
    if (this.run.phase === 'playing') this.applyMouseMotion();
    this.world.environment.beginStep();this.world.seesaw.beginStep();
    const axes=this.rewardDialogue.active?{x:0,z:0}:this.input.leanAxes();
    const normal=this.run.phase==='playing'&&this.locomotion.step(dt,axes,this.view.yaw);
    if(!normal){this.locomotion.deactivate();this.walker.step(dt,this.run.phase==='playing'&&!this.run.walkingUnlocked?axes:{x:0,z:0});}
    const arrived=this.slide.step(this.walker,dt);this.world.environment.step(dt);this.physics.step(undefined,this.walker.rig.hooks);
    if(normal)this.locomotion.postStep(dt);else this.walker.postStep(dt);
    for (const event of [...this.walker.drainFootfalls(),...this.locomotion.drainFootfalls()]) {
      if (event.moved) this.run.steps++;
      this.audio.sound('step', clamp(event.speed * .65, .3, 1));
      if (event.speed > .35) this.world.puff(event.position);
    }
    if (!wasFallen && this.walker.fallen) { this.run.phase = 'fallen'; this.run.falls++; this.clearInput(); this.audio.sound('fall'); this.save(); }
    if(this.run.phase!=='sliding'){
      const lane=this.slide.detect(this.walker);
      if(lane){if(!this.walker.fallen){this.run.falls++;this.audio.sound('fall');}this.clearInput();this.slide.begin(this.walker,lane);this.run.phase='sliding';this.run.checkpoint=0;this.run.maxProgress=0;this.save();}
    }else if(arrived){this.slide.clear(this.walker);this.walker.fall();this.run.phase='fallen';this.save();}
    if (this.run.phase === 'fallen' && this.walker.recovery.tryBegin(dt)) { this.run.phase = 'recovering'; this.clearInput(); }
    else if (this.run.phase === 'recovering' && !this.walker.recovery.active) { this.run.phase = this.walker.fallen ? 'fallen' : 'playing'; this.clearInput(); }
    const b = this.walker.body.translation(), projected=projectRoute(b),s=projected.s;
    if(!this.developer.mode&&['playing','fallen','recovering','sliding'].includes(this.run.phase)&&this.world.summit.touch(b)){
      this.audio.sound('checkpoint');this.save();
    }
    if (this.run.phase === 'playing' && projected.distance < 2.5 && projected.heightError < .75) {
      if (this.run.advance(s)) { this.audio.sound('checkpoint'); this.save(); }
    }
    if(this.run.phase==='playing'&&hasReachedToilet(b)){this.finish();return;}
    this.eatCookie();
    const head=this.walker.rig.parts.Head.body;this.submergedTime=this.world.environment.submerged(head,{x:.12,y:.12,z:.12})>.85?this.submergedTime+dt:0;
    if (b.y < -20 || Math.hypot(b.x,b.z+18)>48 ||this.submergedTime>3) { this.autoRespawn += dt; if (this.autoRespawn > .5){if(!this.walker.fallen)this.run.falls++;this.respawn();} } else this.autoRespawn = 0;
    this.saveTime += dt; if (this.saveTime > 5) { this.saveTime = 0; this.save(); }
  }
  private frame = (now: number) => {
    const dt = Math.min((now - this.last) / 1000, .08); this.last = now;
    const wasRunning=['playing','fallen','recovering','sliding'].includes(this.run.phase);
    this.pollGamepad();
    if(this.run.phase==='finished'){requestAnimationFrame(this.frame);return;}
    if(this.developer.mode)this.developer.update(dt,this.view,this.walker);
    if (!this.developer.mode&&['playing', 'fallen', 'recovering','sliding'].includes(this.run.phase)) {
      this.accumulator += wasRunning?dt:0;
      let count = 0;
      while (this.accumulator >= PHYSICS_DT && count++ < 10) { this.accumulator -= PHYSICS_DT; this.fixed(PHYSICS_DT); if ((this.run.phase as string) === 'finished') { this.accumulator = 0; break; } }
      this.walker.interpolate(clamp(this.accumulator / PHYSICS_DT, 0, 1));this.world.environment.render(clamp(this.accumulator/PHYSICS_DT,0,1));
    }
    const dialogueWasComplete=this.dialogue.completed,samWasComplete=this.samDialogue.completed,rewardWasComplete=this.rewardDialogue.completed;
    const dialogueState={position:this.walker.rendered,playing:this.run.phase==='playing',blocked:!!this.developer.mode||this.input.footHeld||Object.values(this.walker.feet).some(f=>!!f.planting)};
    this.sam.root.position.copy(this.samAtReward?SAM_REWARD_POSITION:SAM_POSITION);
    if(this.samAtReward&&this.samDialogue.active)this.samDialogue.reset(this.samDialogue.completed);
    this.dialogue.update(dt,{...dialogueState,blocked:dialogueState.blocked||this.samDialogue.active||this.rewardDialogue.active});
    this.samDialogue.update(dt,{...dialogueState,blocked:dialogueState.blocked||this.dialogue.active||this.rewardDialogue.active||this.samAtReward,checkpoint:this.run.checkpoint});
    this.rewardDialogue.update(dt,{...dialogueState,blocked:dialogueState.blocked||this.dialogue.active||this.samDialogue.active,unlocked:this.run.walkingUnlocked});
    if(!dialogueWasComplete&&this.dialogue.completed||!samWasComplete&&this.samDialogue.completed||!rewardWasComplete&&this.rewardDialogue.completed){this.clearInput();this.save();}
    const dialogueVisible=this.run.phase==='playing'&&!this.developer.mode;
    const activeDialogue=this.activeDialogue;
    this.ui.dialogue(dialogueVisible?activeDialogue.current:null,activeDialogue.index,activeDialogue.lines.length,activeDialogue===this.ending);
    this.daniela.update(this.run.phase==='paused'?0:dt,this.walker.rendered,dialogueVisible&&this.dialogue.active);
    this.sam.update(this.run.phase==='paused'?0:dt,this.walker.rendered,dialogueVisible&&(this.samDialogue.active||this.rewardDialogue.active));
    this.cookie.update(this.run.phase==='paused'?0:dt,this.run.walkingUnlocked);
    this.world.summit.update(this.run.phase==='paused'||this.developer.mode?0:dt);
    this.world.seesaw.update();
    this.character.update(this.walker, this.input.active, dt); this.world.scene.updateMatrixWorld(true);
    if(this.developer.mode!=='camera')this.view.update(this.walker.rendered, dt, this.world.surfaces, this.run.phase === 'home'); this.world.update(dt, this.walker.rendered, this.run.checkpoint);
    this.ui.inputMode(this.controlMode,this.gamepad.state,this.run.walkingUnlocked);this.ui.update(this.run, this.input.active, this.walker.balance, this.walker.landing, Object.values(this.walker.feet).some(f => !!f.planting), this.input.leanAxes()); this.ui.tutorial(this.run.steps, this.run.maxProgress, this.run.phase === 'playing'&&!this.run.walkingUnlocked);
    this.ui.show('resume', this.run.phase === 'paused');
    if(this.debugLines){const debug=this.physics.debugRender();this.debugLines.geometry.dispose();this.debugLines.geometry=new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(debug.vertices,3)).setAttribute('color',new T.BufferAttribute(debug.colors,4));}
    this.renderer.render(this.world.scene, this.view.camera); requestAnimationFrame(this.frame);
  };
}
export let game: Game;
export const ready = (async () => {
  const host=document.querySelector('#app')!;
  host.innerHTML='<div class="loading"><p>正在收拾行囊…</p><p id="asset-progress" role="status">正在加载 GLB 美术资产</p></div>';
  try {
    const assets=new GLBAssets(new URL('./models/',document.baseURI).href);
    await Promise.all([RAPIER.init(),assets.preload((loaded,total)=>{const p=document.getElementById('asset-progress');if(p)p.textContent=`GLB 美术资产 ${loaded} / ${total}`;})]);
    game = new Game(assets);
  } catch (error) {
    console.error(error);host.innerHTML='<div class="loading"><p>暂时无法出发</p><p id="asset-error" role="alert"></p><button id="retry-assets" class="primary">重新载入</button></div>';
    document.getElementById('asset-error')!.textContent=(error as Error).message;document.getElementById('retry-assets')!.addEventListener('click',()=>location.reload());
  }
})();
