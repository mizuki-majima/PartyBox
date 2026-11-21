/**
 * 効果音。音声ファイルは使わず、WebAudio でその場で合成する（軽くて、ライセンスの心配もない）。
 * ブラウザの自動再生制限があるので、最初のクリックなどで unlock() を呼ぶ。
 */

const STORAGE_KEY = 'pgp-muted';

type Wave = OscillatorType;

class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private engine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  muted: boolean;
  private listeners: ((muted: boolean) => void)[] = [];

  constructor() {
    let saved = false;
    try {
      saved = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      // ストレージが使えない環境でも動くようにする
    }
    this.muted = saved;
  }

  /** ユーザー操作の中で呼ぶ（それまでは音を鳴らさない） */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch {
      // 保存できなくても続ける
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.02);
    this.listeners.forEach((fn) => fn(muted));
  }

  onMuteChange(fn: (muted: boolean) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn);
    };
  }

  private ready(): AudioContext | null {
    if (!this.ctx || !this.master || this.muted) return null;
    return this.ctx;
  }

  private tone(freq: number, dur: number, opts: { type?: Wave; vol?: number; delay?: number; slideTo?: number } = {}): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type ?? 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
    const vol = opts.vol ?? 0.2;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(dur: number, opts: { freq?: number; q?: number; vol?: number; delay?: number; type?: BiquadFilterType; sweepTo?: number } = {}): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.type ?? 'bandpass';
    filter.frequency.setValueAtTime(opts.freq ?? 1000, t);
    if (opts.sweepTo) filter.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + dur);
    filter.Q.value = opts.q ?? 1;
    const gain = ctx.createGain();
    const vol = opts.vol ?? 0.3;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.05, dur / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // ───── 効果音 ─────

  click(): void {
    this.tone(880, 0.06, { type: 'square', vol: 0.08 });
  }

  /** 生成スタート: キラキラ */
  sparkle(): void {
    [1320, 1760, 2093, 2637].forEach((f, i) => this.tone(f, 0.12, { type: 'triangle', vol: 0.08, delay: i * 0.07 }));
  }

  /** 車が出てきた: ぽんっ＋ジャーン */
  pop(): void {
    this.tone(300, 0.15, { type: 'sine', vol: 0.3, slideTo: 900 });
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.12, delay: 0.12 + i * 0.05 }));
  }

  countdown(final: boolean): void {
    this.tone(final ? 1046 : 523, final ? 0.6 : 0.18, { type: 'square', vol: 0.14 });
  }

  lap(): void {
    this.tone(1175, 0.1, { type: 'triangle', vol: 0.1 });
    this.tone(1568, 0.16, { type: 'triangle', vol: 0.1, delay: 0.09 });
  }

  overtake(): void {
    this.noise(0.35, { freq: 600, sweepTo: 3000, q: 2, vol: 0.18 });
  }

  /** スピン: キュルキュル */
  squeal(): void {
    for (let i = 0; i < 4; i++) this.tone(1400 + (i % 2) * 300, 0.12, { type: 'sawtooth', vol: 0.05, delay: i * 0.13, slideTo: 900 });
    this.noise(0.8, { freq: 3000, q: 4, vol: 0.08 });
  }

  /** コースアウト: ボコッ */
  bump(): void {
    this.tone(120, 0.25, { type: 'sine', vol: 0.4, slideTo: 50 });
    this.noise(0.3, { freq: 400, q: 0.8, vol: 0.2, type: 'lowpass' });
  }

  boost(): void {
    this.tone(220, 0.5, { type: 'sawtooth', vol: 0.08, slideTo: 880 });
  }

  /** ゴール: 歓声とファンファーレ */
  fanfare(big: boolean): void {
    this.noise(big ? 2.5 : 1.6, { freq: 1500, q: 0.4, vol: big ? 0.18 : 0.1, sweepTo: 900 });
    const notes = big ? [523, 659, 784, 1047, 784, 1047] : [523, 659, 784];
    notes.forEach((f, i) => this.tone(f, i === notes.length - 1 ? 0.7 : 0.16, { type: 'square', vol: 0.1, delay: i * 0.13 }));
  }

  // ───── エンジン音（追いかけている車の速さで高さが変わる） ─────

  engineStart(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.engine) return;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc2.type = 'square';
    osc.frequency.value = 60;
    osc2.frequency.value = 61;
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    gain.gain.value = 0.0001;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(this.master);
    osc.start();
    osc2.start();
    this.engine = { osc, osc2, gain, filter };
  }

  engineUpdate(speed: number): void {
    const e = this.engine;
    const ctx = this.ctx;
    if (!e || !ctx) return;
    const t = ctx.currentTime;
    const f = 55 + speed * 9;
    e.osc.frequency.setTargetAtTime(f, t, 0.05);
    e.osc2.frequency.setTargetAtTime(f * 1.5 + 2, t, 0.05);
    e.filter.frequency.setTargetAtTime(300 + speed * 60, t, 0.05);
    e.gain.gain.setTargetAtTime(this.muted ? 0.0001 : 0.035 + Math.min(speed, 16) * 0.002, t, 0.1);
  }

  engineStop(): void {
    const e = this.engine;
    const ctx = this.ctx;
    if (!e || !ctx) return;
    e.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
    e.osc.stop(ctx.currentTime + 0.5);
    e.osc2.stop(ctx.currentTime + 0.5);
    this.engine = null;
  }
}

export const sfx = new SfxEngine();
