import { NeutralToneMapping, PCFShadowMap, PerspectiveCamera, Scene, WebGLRenderer } from 'three';

/** Stage に載せる「場面」。画面ごとに 1 つ作る。 */
export interface View {
  scene: Scene;
  camera: PerspectiveCamera;
  /** dt: 前フレームからの秒数, time: 累計秒数 */
  update(dt: number, time: number): void;
  resize?(width: number, height: number): void;
}

export const IS_MOBILE =
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

/**
 * WebGL のレンダラーはアプリ全体で 1 つだけ持つ（スマホで複数コンテキストは重いため）。
 * 画面ごとに canvas を好きな DOM 要素へ付け替え、描画する View を差し替える。
 */
export class Stage {
  readonly renderer: WebGLRenderer;
  private view: View | null = null;
  private container: HTMLElement | null = null;
  private readonly observer: ResizeObserver;
  private last = 0;
  private time = 0;
  /** 時間の進みの倍率（開発時の早送り確認用） */
  timeScale = 1;
  // 重い端末では描画解像度を少しずつ下げて 60fps に近づける
  private pixelRatio: number;
  private readonly minPixelRatio = 1;
  private perfTime = 0;
  private perfFrames = 0;
  private perfWarmup = 2;

  constructor() {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio, IS_MOBILE ? 1.75 : 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    // 色味を崩さずに明るいところをなめらかにする（おもちゃの原色がきれいに出る）
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.className = 'stage-canvas';
    this.observer = new ResizeObserver(() => this.resize());
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  /** canvas を container の中に移し、その大きさに合わせる */
  attach(container: HTMLElement): void {
    if (this.container) this.observer.unobserve(this.container);
    this.container = container;
    container.appendChild(this.renderer.domElement);
    this.observer.observe(container);
    this.resize();
  }

  setView(view: View | null): void {
    this.view = view;
    this.perfWarmup = 2;
    this.resize();
  }

  /** 平均フレーム時間を見て、遅ければ解像度を下げる */
  private watchPerformance(realDt: number): void {
    if (this.perfWarmup > 0) {
      this.perfWarmup -= realDt;
      return;
    }
    this.perfTime += realDt;
    this.perfFrames++;
    if (this.perfTime < 1.5) return;
    const avg = this.perfTime / this.perfFrames;
    this.perfTime = 0;
    this.perfFrames = 0;
    if (avg > 1 / 48 && this.pixelRatio > this.minPixelRatio) {
      this.pixelRatio = Math.max(this.minPixelRatio, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
    }
  }

  private resize(): void {
    if (!this.container) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    if (this.view) {
      this.view.camera.aspect = w / h;
      this.view.camera.updateProjectionMatrix();
      this.view.resize?.(w, h);
    }
  }

  private frame(now: number): void {
    const realDt = this.last === 0 ? 0 : Math.min((now - this.last) / 1000, 0.1);
    const dt = realDt * this.timeScale;
    this.last = now;
    this.time += dt;
    if (!this.view) return;
    this.watchPerformance(realDt);
    this.view.update(dt, this.time);
    this.renderer.render(this.view.scene, this.view.camera);
  }
}
