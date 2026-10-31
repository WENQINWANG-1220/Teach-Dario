import './style.css';
import * as T from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Audio } from './audio';
import { FollowCamera } from './camera';
import { Character } from './character';
import { InputState, editable } from './input';
import {GamepadAdapter,PAD,type PadFrame} from './gamepad';
import { CHECKPOINTS, LENGTH, RunState, clamp, clockLabel, route } from './model';
import { SaveStore } from './storage';
import { UI } from './ui';
import { Walker } from './walker';
import { Landscape } from './world';
import { CHALLENGES } from './terrain';
import { GLBAssets } from './art/GLBAssets';
import {PHYSICS_DT,ROOT_HEIGHT} from './rig';
export class Game {
  readonly run = new RunState(); readonly input = new InputState(); readonly store = new SaveStore(); readonly audio = new Audio(); readonly view = new FollowCamera();
  readonly gamepad=new GamepadAdapter();controlMode:'keyboard'|'gamepad'='keyboard';
  private padAxes={lean:{x:0,z:0},aim:{x:0,y:0},zoom:0};
  readonly ui = new UI(); readonly physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  readonly world: Landscape; readonly walker = new Walker(this.physics); readonly character: Character;
  readonly renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  private accumulator = 0; private last = performance.now(); private saveTime = 0; private autoRespawn = 0; private lockPending = false;
  private currentChallenge = '';
  private submergedTime=0;
  private debugLines?:T.LineSegments;
  constructor(readonly assets: GLBAssets) {
    this.world = new Landscape(this.physics,assets); this.character = new Character(this.world.scene,assets);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7)); this.renderer.setSize(innerWidth, innerHeight); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap; this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15;
    this.ui.el('scene').append(this.renderer.domElement); this.audio.muted = this.store.muted;
    for(const part of Object.values(this.walker.rig.parts)){const d=part.definition;this.world.environment.add(part.body,d.mass/985,{x:d.shape==='box'?d.size.x/2:d.size.x,y:d.shape==='box'||d.shape==='capsule'?d.size.y/2:d.size.y,z:d.shape==='box'?d.size.z/2:d.size.z});}
    this.physics.timestep = PHYSICS_DT; this.physics.step(undefined,this.walker.rig.hooks); this.walker.reset(route(0));
    if(new URLSearchParams(location.search).has('physicsDebug')){this.debugLines=new T.LineSegments(new T.BufferGeometry(),new T.LineBasicMaterial({vertexColors:true,depthTest:false,transparent:true,opacity:.7}));this.debugLines.frustumCulled=false;this.world.scene.add(this.debugLines);}
    this.ui.show('continue', !!this.store.saved && !this.store.saved.finished); this.updateSound();
    this.ui.button('start', () => this.start(false)); this.ui.button('continue', () => this.start(true));
    this.ui.button('pause', () => this.pause()); this.ui.button('resume', () => this.requestLock());
    this.ui.button('restart', () => { if (window.confirm('重新出发会替换当前旅程进度，最佳成绩会保留。')) this.start(false); });
    this.ui.button('back', () => this.home()); this.ui.button('brand', () => this.home());
    this.ui.button('sound', () => { this.audio.unlock();this.audio.muted = !this.audio.muted; this.updateSound(); this.store.setMuted(this.audio.muted); if (this.run.phase !== 'home') this.save(); this.ui.show('storage-warning', !this.store.available); });
    document.addEventListener('keydown', e => {
      if (editable(e.target)) return;
      if (e.code === 'Escape') { this.pause(); return; }
      if (!['playing', 'fallen', 'recovering'].includes(this.run.phase)) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'KeyR') { this.respawn(); return; }
      if (this.run.phase !== 'playing') return;
      this.input.press(e.code);
    });
    document.addEventListener('keyup', e => {
      if (editable(e.target)) return;
      this.input.release(e.code);
    });
    document.addEventListener('mousedown', e => {
      if (document.pointerLockElement !== this.renderer.domElement || this.run.phase !== 'playing' || ![0, 2].includes(e.button)) return;
      e.preventDefault(); const foot = this.input.press(`Mouse${e.button}`, this.view.yaw); if (foot) this.walker.lift(foot);
    });
    document.addEventListener('mouseup', e => {
      if (![0, 2].includes(e.button)) return;
      if (this.run.phase === 'playing') this.applyMouseMotion();
      const foot = this.input.release(`Mouse${e.button}`); if (foot && this.run.phase === 'playing') this.walker.land(foot);
    });
    document.addEventListener('contextmenu', e => { if (document.pointerLockElement === this.renderer.domElement) e.preventDefault(); });
    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement !== this.renderer.domElement || !['playing', 'fallen', 'recovering'].includes(this.run.phase)) return;
      if (this.run.phase === 'playing' && this.input.footHeld) this.input.moveMouse(e.movementX, e.movementY);
      else this.view.move(e.movementX, e.movementY);
    });
    this.renderer.domElement.addEventListener('wheel', e => { if (['playing', 'fallen', 'recovering'].includes(this.run.phase)) { e.preventDefault(); this.view.zoom(e.deltaY); } }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === this.renderer.domElement) { if (this.lockPending) { this.run.resume(); this.lockPending = false; this.last = performance.now(); this.accumulator = 0; } }
      else if(this.controlMode==='keyboard') { this.pause(false); }
    });
    this.renderer.domElement.addEventListener('click',()=>{
      if(this.controlMode==='gamepad'&&['playing','fallen','recovering'].includes(this.run.phase)){
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
    if(document.hidden||!document.hasFocus()){this.gamepad.suspend();this.gamepad.blockMenu();return;}
    if(pad.disconnected)this.gamepad.blockMenu();
    if(pad.disconnected&&this.controlMode==='gamepad'){
      this.pause();this.clearInput();this.ui.toast('手柄已断开 · 旅程已暂停');
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
      if(this.run.phase==='home'||this.run.phase==='finished')this.start(this.run.phase==='home'&&!!this.store.saved&&!this.store.saved.finished);
      else if(this.run.phase==='paused')this.requestLock();else this.pause();
      return;
    }
    if(['home','paused','finished'].includes(this.run.phase)){this.gamepadMenu(pad);return;}
    if(pad.reset){this.respawn();return;}
    if(this.run.phase!=='playing')return;
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
  start(continuing: boolean) {
    this.run.reset(); this.currentChallenge='';
    if (continuing && this.store.saved && !this.store.saved.finished) { const s = this.store.saved; this.run.checkpoint = s.checkpoint; this.run.elapsed = s.elapsed; this.run.falls = s.falls; this.run.steps = s.steps; this.run.maxProgress = s.maxProgress; }
    this.clearInput(); this.world.resetDynamics();this.walker.reset(route(CHECKPOINTS[this.run.checkpoint])); this.view.yaw = 0; this.view.pitch = .29; this.view.initialized = false;
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
    if (!['playing', 'fallen', 'recovering'].includes(this.run.phase)) return;
    this.run.pause(); this.clearInput(); this.accumulator = 0; this.save();
    this.ui.text('dialog-title', '停下来，看看风景'); this.ui.text('dialog-body', this.controlMode==='gamepad'?'山一直都在，准备好再走。\nStart 或 A / × 继续 · B / ○ 返回首页':'山一直都在，准备好再走。\nEsc 暂停 · 移动鼠标转动视角'); this.ui.text('resume', '继续旅程 →');
    if (exit && document.pointerLockElement) document.exitPointerLock();
  }
  home() {
    if (this.run.phase !== 'home' && this.run.phase !== 'finished') this.save();
    this.run.phase = 'home'; this.lockPending = false; this.clearInput(); if (document.pointerLockElement) document.exitPointerLock(); this.world.resetDynamics();this.walker.reset(route(0)); this.view.initialized = false; this.ui.show('continue', !!this.store.saved && !this.store.saved.finished);
  }
  respawn() { this.clearInput();this.world.resetDynamics(); this.walker.reset(route(CHECKPOINTS[this.run.checkpoint]));this.submergedTime=0; this.run.phase = 'playing'; this.currentChallenge=''; this.autoRespawn = 0; this.view.initialized = false; this.accumulator = 0; this.ui.toast('回到休息站，下一步慢慢来。'); this.save(); }
  private save() { this.store.write(this.run, this.audio.muted); this.ui.show('storage-warning', !this.store.available); }
  private finish() {
    this.run.phase = 'finished'; this.clearInput(); this.save(); if (document.pointerLockElement) document.exitPointerLock(); this.audio.sound('finish');
    this.ui.text('dialog-eyebrow', 'ONE STEP AT A TIME'); this.ui.text('dialog-title', '你把山走成了风景'); this.ui.text('dialog-body', `旅程用时 ${clockLabel(this.run.elapsed)} · ${this.run.steps} 步 · 跌倒 ${this.run.falls} 次\n最佳旅程 ${clockLabel(this.store.saved?.best ?? this.run.elapsed)}\n每一小步，都带你到了这里。`);
  }
  private fixed(dt: number) {
    this.run.elapsed += dt;
    const wasFallen = this.walker.fallen;
    this.applyGamepadMotion(dt);
    if (this.run.phase === 'playing') this.applyMouseMotion();
    this.world.environment.beginStep();this.walker.step(dt, this.run.phase === 'playing' ? this.input.leanAxes() : { x: 0, z: 0 });this.world.environment.step(dt); this.physics.step(undefined,this.walker.rig.hooks);this.walker.postStep(dt);
    for (const event of this.walker.drainFootfalls()) {
      if (event.moved) this.run.steps++;
      this.audio.sound('step', clamp(event.speed * .65, .3, 1));
      if (event.speed > .35) this.world.puff(event.position);
    }
    if (!wasFallen && this.walker.fallen) { this.run.phase = 'fallen'; this.run.falls++; this.clearInput(); this.audio.sound('fall'); this.save(); }
    if (this.run.phase === 'fallen' && this.walker.recovery.tryBegin(dt)) { this.run.phase = 'recovering'; this.clearInput(); }
    else if (this.run.phase === 'recovering' && !this.walker.recovery.active) { this.run.phase = this.walker.fallen ? 'fallen' : 'playing'; this.clearInput(); }
    const b = this.walker.body.translation(), s = clamp(-b.z, 0, LENGTH), p = route(s);
    if (this.run.phase === 'playing' && Math.abs(b.x - p.x) < 3 && Math.abs(b.y - p.y - ROOT_HEIGHT) < 1.3) {
      const challenge=CHALLENGES.find(c=>s>=c.start&&s<=c.end);
      if(challenge&&challenge.id!==this.currentChallenge)this.ui.toast(`${challenge.name} · ${challenge.hint}`);
      this.currentChallenge=challenge?.id??'';
      if (this.run.advance(s)) { this.audio.sound('checkpoint'); this.ui.toast(this.run.checkpoint === 1 ? '第一小段，完成了。进度已保存。' : '到达休息站 · 进度已保存'); this.save(); }
      if (s >= LENGTH - .4) { this.run.advance(LENGTH); this.finish(); }
    }
    const head=this.walker.rig.parts.Head.body;this.submergedTime=this.world.environment.submerged(head,{x:.12,y:.12,z:.12})>.85?this.submergedTime+dt:0;
    if (b.y < -20 || Math.abs(b.x - p.x) > 30 ||this.submergedTime>3) { this.autoRespawn += dt; if (this.autoRespawn > .5){if(!this.walker.fallen)this.run.falls++;this.respawn();} } else this.autoRespawn = 0;
    this.saveTime += dt; if (this.saveTime > 5) { this.saveTime = 0; this.save(); }
  }
  private frame = (now: number) => {
    const dt = Math.min((now - this.last) / 1000, .08); this.last = now;
    const wasRunning=['playing','fallen','recovering'].includes(this.run.phase);
    this.pollGamepad();
    if (['playing', 'fallen', 'recovering'].includes(this.run.phase)) {
      this.accumulator += wasRunning?dt:0;
      let count = 0;
      while (this.accumulator >= PHYSICS_DT && count++ < 10) { this.accumulator -= PHYSICS_DT; this.fixed(PHYSICS_DT); if ((this.run.phase as string) === 'finished') { this.accumulator = 0; break; } }
      this.walker.interpolate(clamp(this.accumulator / PHYSICS_DT, 0, 1));this.world.environment.render(clamp(this.accumulator/PHYSICS_DT,0,1));
    }
    this.character.update(this.walker, this.input.active, dt); this.world.scene.updateMatrixWorld(true);
    this.view.update(this.walker.rendered, dt, this.world.surfaces, this.run.phase === 'home'); this.world.update(dt, this.walker.rendered, this.run.checkpoint);
    this.ui.inputMode(this.controlMode,this.gamepad.state);this.ui.update(this.run, this.input.active, this.walker.balance, this.walker.landing, Object.values(this.walker.feet).some(f => !!f.planting), this.input.leanAxes()); this.ui.tutorial(this.run.steps, this.run.maxProgress, this.run.phase === 'playing');
    this.ui.show('resume', this.run.phase !== 'finished');
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
