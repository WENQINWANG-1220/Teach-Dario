import { CHECKPOINTS, LEGACY_CHECKPOINTS, type RunState } from './model';
export const SAVE_KEY = 'baby-steps:save:v1';
export interface Save { version: 1; checkpoint: number; checkpointMeters: number; elapsed: number; falls: number; steps: number; maxProgress: number; best: number | null; muted: boolean; finished: boolean }
export function parseSave(raw: string | null): Save | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    const distances = s.checkpointMeters === undefined ? LEGACY_CHECKPOINTS : CHECKPOINTS;
    if (s.version !== 1 || !Number.isInteger(s.checkpoint) || s.checkpoint < 0 || s.checkpoint >= distances.length || !['elapsed', 'falls', 'steps', 'maxProgress'].every(k => Number.isFinite(s[k]) && s[k] >= 0) || s.maxProgress > 180 || !Number.isInteger(s.falls) || !Number.isInteger(s.steps) || !(s.best === null || Number.isFinite(s.best) && s.best > 0) || typeof s.muted !== 'boolean' || typeof s.finished !== 'boolean') return null;
    if(s.checkpointMeters!==undefined&&!CHECKPOINTS.includes(s.checkpointMeters))return null;
    const meters = s.checkpointMeters ?? LEGACY_CHECKPOINTS[s.checkpoint];
    if(!CHECKPOINTS.includes(meters))return null;
    return {...s,checkpoint:CHECKPOINTS.indexOf(meters),checkpointMeters:meters};
  } catch { return null; }
}
export class SaveStore {
  available = true; saved: Save | null = null; muted = false;
  constructor() { try { this.saved = parseSave(localStorage.getItem(SAVE_KEY)); const muted = localStorage.getItem('baby-steps:muted:v1'); this.muted = muted === null ? this.saved?.muted ?? false : muted === 'true'; } catch { this.available = false; } }
  setMuted(muted: boolean) { this.muted = muted; try { localStorage.setItem('baby-steps:muted:v1', String(muted)); } catch { this.available = false; } }
  write(run: RunState, muted: boolean) {
    this.setMuted(muted);
    const best = run.phase === 'finished' ? Math.min(this.saved?.best ?? Infinity, run.elapsed) : this.saved?.best ?? null;
    this.saved = { version: 1, checkpoint: run.checkpoint, checkpointMeters:CHECKPOINTS[run.checkpoint], elapsed: run.elapsed, falls: run.falls, steps: run.steps, maxProgress: run.maxProgress, best, muted, finished: run.phase === 'finished' };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.saved)); } catch { this.available = false; }
  }
}
