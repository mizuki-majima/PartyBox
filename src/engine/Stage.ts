import { PCFShadowMap, PerspectiveCamera, Scene, WebGLRenderer } from 'three';

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

  constructor() {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_MOBILE ? 1.75 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
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
    this.resize();
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
    const dt = this.last === 0 ? 0 : Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.time += dt;
    if (!this.view) return;
    this.view.update(dt, this.time);
    this.renderer.render(this.view.scene, this.view.camera);
  }
}
