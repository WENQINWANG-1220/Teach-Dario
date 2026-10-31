export class Audio {
  ctx?: AudioContext; muted = false;
  unlock() { this.ctx ??= new AudioContext(); void this.ctx.resume(); }
  sound(kind: 'step' | 'fall' | 'checkpoint' | 'finish', intensity = 1) {
    if (!this.ctx || this.muted) return;
    const notes = kind === 'checkpoint' ? [523, 659, 784] : kind === 'finish' ? [392, 523, 659, 784, 1046] : kind === 'fall' ? [100, 65] : [150 + Math.random() * 70];
    notes.forEach((f, i) => {
      const o = this.ctx!.createOscillator(), g = this.ctx!.createGain(), t = this.ctx!.currentTime + i * .13;
      o.type = kind === 'step' ? 'triangle' : 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f * .6), t + .15);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime((kind === 'step' ? .07 : .1) * intensity, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + .25);
      o.connect(g); g.connect(this.ctx!.destination); o.start(t); o.stop(t + .3);
    });
  }
}
