import type { FootId } from './model';
import type { LeanAxes } from './lean';
const aliases = { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'] };
const footButtons = {Mouse0:'left',Mouse2:'right',PadLT:'left',PadRT:'right'} as const;
export type FootSource = keyof typeof footButtons;
export class InputState {
  held = new Set<string>(); active: FootId | null = null; owner: FootSource | null = null;
  private mouseX = 0; private mouseY = 0;
  private padLean: LeanAxes = {x:0,z:0};
  dragYaw = 0;
  press(code: string, yaw = 0): FootId | null {
    if (![...Object.keys(footButtons), ...Object.values(aliases).flat()].includes(code)) return null;
    if (this.held.has(code)) return null;
    this.held.add(code);
    if (!this.active && Object.hasOwn(footButtons,code)) {
      this.owner = code as FootSource;this.active = footButtons[this.owner]; this.dragYaw = yaw; return this.active;
    }
    return null;
  }
  release(code: string): FootId | null {
    this.held.delete(code);
    if (code === this.owner) { const foot = this.active; this.active = null; this.owner = null; this.mouseX = this.mouseY = 0; return foot; } return null;
  }
  leanAxes(): LeanAxes {
    const any = (codes: string[]) => Number(codes.some(c => this.held.has(c)));
    let x = any(aliases.right) - any(aliases.left)+this.padLean.x, z = any(aliases.up) - any(aliases.down)+this.padLean.z;
    const length = Math.hypot(x, z); if (length > 1) { x /= length; z /= length; }
    return { x, z };
  }
  get mouseHeld() { return this.held.has('Mouse0') || this.held.has('Mouse2'); }
  get footHeld() { return this.mouseHeld||this.held.has('PadLT')||this.held.has('PadRT'); }
  get dragging() { return this.owner === 'Mouse0' || this.owner === 'Mouse2'; }
  get padDragging() { return this.owner === 'PadLT' || this.owner === 'PadRT'; }
  setPadLean(axes:LeanAxes) { this.padLean={...axes}; }
  moveMouse(dx: number, dy: number) { if (this.dragging) { this.mouseX += dx; this.mouseY += dy; } }
  consumeMouse() { const delta = { x: this.mouseX * .0035, z: -this.mouseY * .0035 }; this.mouseX = this.mouseY = 0; return delta; }
  clear() { this.held.clear(); this.active = null; this.owner = null; this.mouseX = this.mouseY = 0;this.padLean={x:0,z:0}; }
}
export function editable(target: EventTarget | null) { return target instanceof HTMLElement && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName)); }
