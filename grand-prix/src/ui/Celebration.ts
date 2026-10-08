import { h, setText } from './dom';

const CONFETTI_COLORS = ['#ff5a5a', '#ffd23f', '#3fa7ff', '#5cc94a', '#ff9fd0', '#b36bff', '#ffffff'];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  wobble: number;
}

/**
 * ゴールの演出: チェッカーフラッグの帯と紙吹雪。
 * 紙吹雪は 3D ではなく 2D の canvas に描く（カメラに左右されず、軽い）。
 */
export class Celebration {
  readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly banner: HTMLElement;
  private readonly bannerText: HTMLElement;
  private readonly subText: HTMLElement;
  private pieces: Piece[] = [];
  private raf = 0;
  private last = 0;

  constructor() {
    this.canvas = h('canvas', { class: 'confetti' });
    this.bannerText = h('div', { class: 'finish-text' });
    this.subText = h('div', { class: 'finish-sub' });
    this.banner = h(
      'div',
      { class: 'finish-banner', attrs: { hidden: '' } },
      h('div', { class: 'flag flag-left' }),
      h('div', { class: 'finish-body' }, this.bannerText, this.subText),
      h('div', { class: 'flag flag-right' }),
    );
    this.el = h('div', { class: 'celebration' }, this.canvas, this.banner);
  }

  /** チェッカーフラッグの帯を出す */
  flag(title: string, sub = ''): void {
    setText(this.bannerText, title);
    setText(this.subText, sub);
    this.subText.hidden = !sub;
    this.banner.hidden = false;
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
  }

  hideFlag(): void {
    this.banner.hidden = true;
  }

  /** 紙吹雪をまく */
  confetti(amount = 140): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    for (let i = 0; i < amount; i++) {
      this.pieces.push({
        x: Math.random() * w,
        y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 80,
        vy: 80 + Math.random() * 140,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 10,
        w: 6 + Math.random() * 8,
        h: 4 + Math.random() * 6,
        color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
        wobble: Math.random() * Math.PI * 2,
      });
    }
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.tick(t));
    }
  }

  private tick(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = c.clientWidth;
    const hgt = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hgt * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(hgt * dpr);
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    for (const p of this.pieces) {
      p.wobble += dt * 6;
      p.x += (p.vx + Math.sin(p.wobble) * 30) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.abs(Math.cos(p.wobble)) * 0.8 + 0.2);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    this.pieces = this.pieces.filter((p) => p.y < hgt + 30);
    if (this.pieces.length > 0) {
      this.raf = requestAnimationFrame((t) => this.tick(t));
    } else {
      this.raf = 0;
      ctx.clearRect(0, 0, w, hgt);
    }
  }

  dispose(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.pieces = [];
  }
}
