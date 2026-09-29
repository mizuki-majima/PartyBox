import {
  Color,
  CylinderGeometry,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  Vector3,
} from 'three';
import type { View } from '../engine/Stage';
import type { CarModel } from './CarModel';

/**
 * 車をくるくる回して見せるショールーム。
 * 車づくりのプレビュー、ライバル紹介、デバッグ用ギャラリーで使う。
 */
export class ShowroomView implements View {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(32, 1, 0.1, 200);
  private cars: CarModel[] = [];
  private readonly podiums: Mesh[] = [];
  private readonly podiumMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 });
  private readonly podiumGeo = new CylinderGeometry(1.5, 1.6, 0.3, 48);
  private readonly key: DirectionalLight;
  private spin = 0;
  private aspect = 1;
  private slots = 1;
  private popTime = -1;
  /** 回転の速さ（ラジアン/秒） */
  spinSpeed = 0.6;
  /** カメラの注視点を少し上下させたいとき用（UI に隠れる分をずらす） */
  lookOffsetY = 0;

  constructor(background = '#fff3d6') {
    this.scene.background = new Color(background);
    this.scene.add(new HemisphereLight('#ffffff', '#d8c8a8', 2.0));
    const key = (this.key = new DirectionalLight('#ffffff', 2.2));
    key.position.set(4, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera;
    sc.left = -8;
    sc.right = 8;
    sc.top = 6;
    sc.bottom = -6;
    key.shadow.bias = -0.0008;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);
    const floor = new Mesh(new PlaneGeometry(60, 60), new ShadowMaterial({ opacity: 0.12 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  /**
   * 並べる車を差し替える。前に並んでいた車は（新しい一覧に無ければ）破棄する。
   * slots: 台座の数（車がまだ無くても台座だけ見せたいとき用）
   */
  setCars(cars: CarModel[], opts: { slots?: number; pop?: boolean } = {}): void {
    for (const c of this.cars) if (!cars.includes(c)) c.dispose();
    for (const p of this.podiums) p.removeFromParent();
    this.podiums.length = 0;
    this.cars = cars;
    this.slots = Math.max(opts.slots ?? cars.length, cars.length, 1);
    const gap = 3.6;
    for (let i = 0; i < this.slots; i++) {
      const x = (i - (this.slots - 1) / 2) * gap;
      const podium = new Mesh(this.podiumGeo, this.podiumMat);
      podium.position.set(x, 0.15, 0);
      podium.receiveShadow = true;
      this.scene.add(podium);
      this.podiums.push(podium);
      const car = cars[i];
      if (!car) continue;
      car.root.position.set(x, 0.3, 0);
      car.root.scale.setScalar(opts.pop ? 0.01 : 1);
      this.scene.add(car.root);
    }
    this.popTime = opts.pop ? 0 : -1;
    const half = ((this.slots - 1) * 3.6) / 2 + 4;
    const sc = this.key.shadow.camera;
    sc.left = -half;
    sc.right = half;
    sc.updateProjectionMatrix();
    this.frame();
  }

  resize(width: number, height: number): void {
    this.aspect = width / height;
    this.frame();
  }

  /** 全部の車が画面に収まるようにカメラを引く */
  private frame(): void {
    const n = this.slots;
    const halfWidth = ((n - 1) * 3.6) / 2 + 2.4;
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.aspect);
    const distW = halfWidth / Math.tan(hFov / 2);
    const distH = 2.1 / Math.tan(vFov / 2);
    const dist = Math.max(distW, distH) * 1.08;
    const dir = new Vector3(0, 0.42, 1).normalize();
    const target = new Vector3(0, 0.7 + this.lookOffsetY, 0);
    this.camera.position.copy(target).addScaledVector(dir, dist);
    this.camera.lookAt(target);
  }

  update(dt: number, time: number): void {
    this.spin += dt * this.spinSpeed;
    let scale = 1;
    if (this.popTime >= 0) {
      // ぽよんと出てくる（easeOutBack）
      this.popTime += dt;
      const t = Math.min(1, this.popTime / 0.55);
      const c = 2.2;
      scale = 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
      if (t >= 1) this.popTime = -1;
    }
    this.cars.forEach((car, i) => {
      car.root.rotation.y = this.spin + i * 0.7 + Math.PI / 5;
      if (this.popTime >= 0 || scale === 1) car.root.scale.setScalar(Math.max(0.01, scale));
      car.update(dt, 1.2, time);
    });
  }

  dispose(): void {
    for (const c of this.cars) c.dispose();
    this.podiumGeo.dispose();
    this.podiumMat.dispose();
  }
}
