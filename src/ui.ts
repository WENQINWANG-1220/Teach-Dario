import { clockLabel, LENGTH, stage, type RunState, type FootId } from './model';
import type { LeanAxes } from './lean';
import type {PadFrame} from './gamepad';
export class UI {
  host: HTMLElement;private padMode=false;private inputLabelState='' ;
  constructor() {
    this.host = document.querySelector('#app')!;
    this.host.innerHTML = `<div id="scene"></div>
      <header><a class="brand" href="#" id="brand"><span class="brand-mark">♧</span><span>一步一脚印<small>BABY STEPS</small></span></a><div class="header-right"><span id="input-status" class="edition">一场不必着急的冒险</span><button id="sound" class="icon-button" aria-label="切换静音">♪</button><button id="pause" class="icon-button" aria-label="暂停">Ⅱ</button></div></header>
      <section id="home" class="home"><div class="eyebrow"><span></span> A LITTLE WALK. A BIG ADVENTURE.</div><h1>走慢一点，<br>也没关系<span>。</span></h1><p class="intro">左脚，右脚，再往前一点。<br>带上好奇心，去山的那一边。</p><div class="home-actions"><button id="start" class="primary">出发，去走走 <span>↗</span></button><button id="continue" class="secondary" hidden>继续旅程 →</button></div><p class="micro">单人徒步 · 物理步行 · 180 米山路</p><div id="home-controls" class="home-instructions"><span><kbd>左键</kbd> / <kbd>右键</kbd> 按住拖脚，松开落脚</span><span>⌁ 不按键移动鼠标看四周</span><span><kbd>WASD</kbd> / <kbd>↑←↓→</kbd> 按住调整重心</span></div><p id="gamepad-hint" class="gamepad-hint">手柄：连接后按任意键识别 · Start 开始</p></section>
      <div id="postcard" class="postcard"><span>山野来信 / FIELD NOTES</span><p>每一小步，<br>都算数。</p><div>180 m 的风景，等你慢慢发现 <i>✳</i></div></div>
      <footer id="home-footer"><span>沿途挑战 <b>THE TRAIL</b></span><div><em>01</em> 遗迹石阶 <i>—</i> <em>02</em> 折线窄墙 <i>—</i> <em>03</em> 独木桥 <i>—</i> <em>04</em> 踏石越隙</div><span class="footer-note">每一步，都要站稳。</span></footer>
      <div id="hud" hidden><div class="trail-card"><div class="eyebrow">YOUR LITTLE JOURNEY</div><strong id="stage"></strong><div class="progress-track"><i id="progress"></i></div><div class="trail-meta"><span id="distance">0 / 180 m</span><span id="timer">00:00</span></div></div><div class="stats"><span>脚步 <b id="steps">0</b></span><span>跌倒 <b id="falls">0</b></span></div>
      <div class="controls"><div class="foot-keys"><span id="left-foot"><kbd id="left-key">左键</kbd> 左脚</span><span id="right-foot"><kbd id="right-key">右键</kbd> 右脚</span></div><div class="balance"><span id="balance-label">稳稳站住</span><div><i id="balance"></i></div></div><span id="control-note" class="control-note">W / ↑ 前倾 · A / ← 左倾 · S / ↓ 后倾 · D / → 右倾<br>按住调整重心 · 松开回正<br>鼠标左右键拖脚 · 松开观察 · 滚轮缩放 · R 返回</span></div></div>
      <div id="tutorial" class="tutorial" hidden><span id="tutorial-index">FIRST STEPS / 01</span><strong id="tutorial-title"></strong><p id="tutorial-body"></p></div>
      <div id="toast" class="toast" role="status"></div><div id="storage-warning" class="storage-warning" hidden>暂时无法保存进度，本次旅程仍可正常游玩。</div>
      <div id="overlay" class="overlay" hidden><div class="dialog"><div id="dialog-eyebrow" class="eyebrow">TAKE YOUR TIME</div><h2 id="dialog-title"></h2><p id="dialog-body"></p><button id="resume" class="primary">继续旅程 →</button><button id="restart" class="secondary">重新出发</button><button id="back" class="text-button">返回首页</button></div></div>
      `;
  }
  el(id: string) { return document.getElementById(id)!; }
  button(id: string, fn: () => void) { this.el(id).addEventListener('click', e => { e.preventDefault(); fn(); }); }
  show(id: string, visible: boolean) { this.el(id).hidden = !visible; }
  text(id: string, text: string) { if (this.el(id).textContent !== text) this.el(id).textContent = text; }
  toast(text: string) { this.text('toast', text); this.el('toast').classList.add('visible'); clearTimeout(this.toastTimeout); this.toastTimeout = window.setTimeout(() => this.el('toast').classList.remove('visible'), 3600); }
  private toastTimeout = 0;
  inputMode(mode:'keyboard'|'gamepad',pad:PadFrame){
    const key=[mode,pad.connected,pad.supported,pad.unavailable,pad.name].join('|');
    if(this.inputLabelState===key)return;this.inputLabelState=key;this.padMode=mode==='gamepad';
    this.text('input-status',pad.unavailable?'手柄接口不可用':pad.connected?(pad.supported?(this.padMode?'手柄操作中':'手柄已连接'):'手柄布局暂不支持'):'一场不必着急的冒险');
    this.el('input-status').title=pad.name;
    this.text('gamepad-hint',pad.unavailable?'当前浏览器未开放手柄接口，仍可使用键鼠。':pad.connected&&!pad.supported?'此手柄未提供标准布局，请切换手柄的标准模式。':pad.connected?'Start 开始 / 暂停 · A / × 确认 · 十字键选择菜单':'手柄：连接后按任意键识别 · Start 开始');
    this.text('left-key',this.padMode?'LT':'左键');this.text('right-key',this.padMode?'RT':'右键');
    this.el('home-controls').innerHTML=this.padMode?'<span><kbd>LT / L2</kbd> 左脚 · <kbd>RT / R2</kbd> 右脚，按住抬脚、松开落脚</span><span>右摇杆：抬脚时调整落点，平时转镜头</span><span>左摇杆调整重心 · 十字键 ↑↓ 调整镜头距离</span>':'<span><kbd>左键</kbd> / <kbd>右键</kbd> 按住拖脚，松开落脚</span><span>⌁ 不按键移动鼠标看四周</span><span><kbd>WASD</kbd> / <kbd>↑←↓→</kbd> 按住调整重心</span>';
    this.el('control-note').innerHTML=this.padMode?'左摇杆倾斜 · 右摇杆调落点 / 看四周<br>LT / RT 抬脚 · 松开落脚 · ↑↓ 缩放<br>Start 暂停 · Y / △ 返回 · 点击画面切回键鼠':'W / ↑ 前倾 · A / ← 左倾 · S / ↓ 后倾 · D / → 右倾<br>按住调整重心 · 松开回正<br>鼠标左右键拖脚 · 松开观察 · 滚轮缩放 · R 返回';
  }
  update(run: RunState, active: FootId | null, balance: number, landing: string, planting = false, lean: LeanAxes = {x:0,z:0}) {
    const home = run.phase === 'home', overlay = run.phase === 'paused' || run.phase === 'finished';
    ['home', 'postcard', 'home-footer'].forEach(id => this.show(id, home)); this.show('hud', !home); this.show('pause', !home && run.phase !== 'finished'); this.show('overlay', overlay);
    document.body.dataset.view = home ? 'home' : 'game';
    this.text('stage', stage(run.maxProgress)); this.text('distance', `${Math.min(LENGTH, Math.floor(run.maxProgress))} / ${LENGTH} m`); this.text('timer', clockLabel(run.elapsed)); this.text('steps', String(run.steps)); this.text('falls', String(run.falls));
    this.el('progress').style.width = `${run.maxProgress / LENGTH * 100}%`; this.el('balance').style.width = `${balance * 100}%`;
    this.el('balance').style.background = balance < .25 ? '#bf7652' : '#6e8d6f';
    this.el('left-foot').classList.toggle('active', active === 'left'); this.el('right-foot').classList.toggle('active', active === 'right');
    const leanLabel = [lean.z > 0 ? '前倾' : lean.z < 0 ? '后倾' : '', lean.x > 0 ? '右倾' : lean.x < 0 ? '左倾' : ''].filter(Boolean).join(' · ');
    this.text('balance-label', run.phase === 'recovering' ? '正在起身…' : run.phase === 'fallen' ? (this.padMode?'等待地面稳定 · Y / △ 返回':'等待地面稳定 · R 返回') : active ? ({ valid: '✓ 可以落脚', far: '↔ 已到最大步幅', air: '！脚下悬空', blocked: '× 路径被挡住' }[landing] ?? '调整落点') : planting ? '落脚中，踩实再换脚' : leanLabel ? `上身${leanLabel}` : balance < .25 ? '小心，重心不稳' : '稳稳站住');
  }
  tutorial(steps: number, progress: number, playing: boolean) {
    this.show('tutorial', progress < 12 && playing);
    const index = steps < 1 ? 0 : steps < 2 ? 1 : steps < 5 ? 2 : 3;
    const titles = ['先迈出左脚', '换右脚跟上', '找到自己的节奏', '向第一面旗子出发'];
    const bodies = this.padMode?['按住 LT / L2 抬左脚，右摇杆调整落点，松开扳机落脚。踩实后再换脚。','按住 RT / R2 抬右脚，右摇杆调整落点，松开落脚。两只扳机同时按时，先按的脚优先。','左摇杆控制上身倾斜，方向跟随角色。轻推可微调重心，松开回正；平地无需持续前倾。','不按扳机时，右摇杆转动镜头，十字键 ↑↓ 调整距离。Start 暂停，Y / △ 返回休息站；摔倒自动起身。']:['按住鼠标左键，向上拖动调整左脚落点，松开落脚。身体会配合移重心，踩实后再换脚。', '按住鼠标右键拖动右脚，松开落脚。平地可直接连续拖脚，台阶会自动提高抬腿高度。', 'W 前倾、A 左倾、S 后倾、D 右倾，方向键也可。方向跟随角色，松开回正；平地无需持续前倾，困难地形可配合拖脚调整重心。', '拖脚时镜头固定，松开后移动鼠标看四周。到旗子处保存进度；摔倒自动起身，R 返回休息站。'];
    this.text('tutorial-index', `FIRST STEPS / 0${index + 1}`); this.text('tutorial-title', titles[index]); this.text('tutorial-body', bodies[index]);
  }
}
