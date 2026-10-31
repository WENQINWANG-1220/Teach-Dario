import './cinematic.css';

/** Owns the ending video and its permanent final frame, independently of game UI. */
export class EndingCinema {
  readonly root: HTMLElement;
  readonly video: HTMLVideoElement;
  readonly still: HTMLImageElement;
  private readonly retryButton: HTMLButtonElement;
  private readonly message: HTMLElement;
  private playingEnding = false;
  private ended = false;
  private needsGesture = false;
  private generation = 0;

  get active() { return this.playingEnding; }
  get finished() { return this.ended; }
  get pendingGesture() { return this.needsGesture; }

  constructor(parent: HTMLElement) {
    this.root = document.createElement('section');
    this.root.id = 'ending-cinematic';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', '结束动画');
    this.root.innerHTML = `<video id="ending-video" playsinline preload="auto" aria-label="结束动画"></video>
      <img id="ending-still" alt="结束动画最后一帧" hidden>
      <div class="ending-retry" hidden><p role="status"></p><button type="button">播放结束动画</button></div>`;
    this.video = this.root.querySelector('video')!;
    this.still = this.root.querySelector('img')!;
    this.retryButton = this.root.querySelector('button')!;
    this.message = this.root.querySelector('p')!;
    this.video.controls = false;
    this.video.loop = false;
    this.video.disablePictureInPicture = true;
    this.video.src = new URL('media/ending.mp4', document.baseURI).href;
    this.still.src = new URL('media/ending-last-frame.png', document.baseURI).href;
    this.still.decoding = 'async';
    this.retryButton.addEventListener('click', () => this.retry());
    this.video.addEventListener('ended', () => {
      if (this.active && this.video.ended) this.holdFinalFrame();
    });
    this.video.addEventListener('error', () => {
      if (!this.active || this.finished || !this.video.error) return;
      console.warn('结束动画加载失败', this.video.error);
      this.showRetry('结束动画暂时无法加载，请重试。', '重新播放结束动画');
    });
    // If the image arrives after playback ends, keep the video's final frame until then.
    this.still.addEventListener('load', () => {
      if (this.active && this.finished) this.showStill();
    });
    parent.append(this.root);
  }

  start(muted: boolean) {
    if (this.active) return;
    this.reset();
    this.playingEnding = true;
    this.video.muted = muted;
    this.video.hidden = false;
    this.root.hidden = false;
    document.body.dataset.cinematic = 'playing';
    this.play();
  }

  retry() {
    if (!this.active || this.finished || !this.pendingGesture) return;
    this.hideRetry();
    if (this.video.error) this.video.load();
    this.play();
  }

  reset() {
    this.generation++;
    this.playingEnding = false;
    this.ended = false;
    this.video.pause();
    this.video.currentTime = 0;
    this.video.hidden = false;
    this.still.hidden = true;
    this.root.hidden = true;
    this.hideRetry();
    delete document.body.dataset.cinematic;
  }

  private play() {
    const generation = this.generation;
    void this.video.play().catch((error: unknown) => {
      if (generation !== this.generation || !this.active || this.finished) return;
      console.warn('结束动画未能自动播放', error);
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      this.showRetry(denied ? '' : '结束动画暂时无法播放，请重试。', '播放结束动画');
    });
  }

  private showRetry(message: string, label: string) {
    this.needsGesture = true;
    this.message.textContent = message;
    this.message.hidden = !message;
    this.retryButton.textContent = label;
    this.retryButton.parentElement!.hidden = false;
  }

  private hideRetry() {
    this.needsGesture = false;
    this.retryButton.parentElement!.hidden = true;
  }

  private holdFinalFrame() {
    this.ended = true;
    this.video.pause();
    this.hideRetry();
    document.body.dataset.cinematic = 'finished';
    this.showStill();
  }

  private showStill() {
    if (!this.still.complete || this.still.naturalWidth === 0) return;
    this.still.hidden = false;
    this.video.hidden = true;
  }
}
