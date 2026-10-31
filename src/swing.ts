/** Flat ground overlaps lift and aiming; raised terrain retains a careful high step. */
export const SWING={raiseSeconds:.16,travelSeconds:.26,lowerSeconds:.18,tuckForward:.055} as const;
export const CAREFUL_SWING={lift:.40,raiseSeconds:.32,travelSeconds:.50,lowerSeconds:.32,tuckForward:.09} as const;
export function smoothPhase(value:number){const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);}
export function swingPhases(time:number,lowerTime:number,careful=false){const timing=careful?CAREFUL_SWING:SWING;return {raise:smoothPhase(time/timing.raiseSeconds),travel:smoothPhase((time-(careful?timing.raiseSeconds:0))/timing.travelSeconds),lower:smoothPhase(lowerTime/timing.lowerSeconds)};}
/** Ordinary strides stay low; long strides and raised surfaces receive more clearance. */
export function swingClearance(stride:number,rise:number){return Math.min(.40,.20+Math.min(.10,Math.max(0,stride)*.22)+Math.min(.20,Math.max(0,rise)*2));}
