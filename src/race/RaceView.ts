import { ConeGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, TorusGeometry, type Scene } from 'three';
import type { CarBlueprint } from '../blueprint/types';
import { CarModel } from '../car/CarModel';
import { createOutdoorScene } from '../engine/environment';
import { Particles } from '../engine/Particles';
import type { View } from '../engine/Stage';
import { TrackView } from '../track/TrackView';
import { clamp } from '../util/rng';
import { CameraDirector } from './CameraDirector';
import type { RaceSim } from './RaceSim';

export interface RaceViewOptions {
  /** タイトル画面の背景用: カメラがゆっくりコースを回る */
  attract?: boolean;
}

/** レース観戦の場面 */
export class RaceView implements View {
  readonly scene: Scene;
  readonly camera = new PerspectiveCamera(50, 1, 0.1, 500);
  readonly sim: RaceSim;
  readonly models: CarModel[];
  readonly director: CameraDirector;
  private readonly opts: RaceViewOptions;
  private readonly track: TrackView;
  private readonly puffs = new Particles(220);
  private readonly streaks = Particles.streaks(80);
  private readonly marker: Group | null = null;
  private readonly prevV: number[];
  private readonly emitTimer: number[];
  /** 毎フレーム、シミュレーションを進めた直後に呼ばれる（HUD や実況の更新用） */
  onFrame: ((dt: number, time: number) => void) | null = null;

  constructor(sim: RaceSim, blueprints: CarBlueprint[], opts: RaceViewOptions = {}) {
    this.sim = sim;
    this.opts = opts;
    const { scene } = createOutdoorScene();
    this.scene = scene;
    this.track = TrackView.shared(sim.track);
    scene.add(this.track.group, this.puffs.mesh, this.streaks.mesh);
    this.models = blueprints.map((bp) => new CarModel(bp));
    for (const m of this.models) scene.add(m.root);
    this.prevV = sim.cars.map(() => 0);
    this.emitTimer = sim.cars.map(() => 0);
    this.director = new CameraDirector(this.camera);

    // 自分の車の目印（頭の上でぴょこぴょこする矢印）
    const player = sim.cars.find((c) => c.input.isPlayer);
    if (player && !opts.attract) {
      const g = new Group();
      const mat = new MeshStandardMaterial({ color: '#ff3b3b', emissive: '#ff3b3b', emissiveIntensity: 0.35 });
      const cone = new Mesh(new ConeGeometry(0.32, 0.55, 16), mat);
      cone.rotation.x = Math.PI;
      const ring = new Mesh(new TorusGeometry(0.34, 0.07, 8, 20), mat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.36;
      g.add(cone, ring);
      g.scale.setScalar(0.7);
      this.marker = g;
      scene.add(g);
    }
    this.camera.position.set(0, 70, 75);
    this.camera.lookAt(0, 0, 2);
  }

  resize(width: number, height: number): void {
    this.director.setAspect(width / height);
  }

  update(dt: number, time: number): void {
    const sim = this.sim;
    sim.update(dt);
    sim.cars.forEach((car, i) => {
      const m = this.models[i];
      m.root.position.set(car.x, car.bump, car.z);
      m.root.rotation.y = car.heading;
      m.update(dt, car.v, time);

      // 車体のかたむき（カーブで外へ、加速で前が浮く）とおもちゃっぽい小さな揺れ
      const k = sim.track.curvatureAt(car.progress);
      const accel = dt > 0 ? (car.v - this.prevV[i]) / dt : 0;
      this.prevV[i] = car.v;
      const roll = clamp(-k * car.v * car.v * 0.01, -0.14, 0.14);
      const pitch = clamp(accel * 0.008, -0.07, 0.07);
      m.tilt.rotation.x += (roll - m.tilt.rotation.x) * Math.min(1, dt * 6);
      m.tilt.rotation.z += (pitch - m.tilt.rotation.z) * Math.min(1, dt * 6);
      m.tilt.position.y = Math.abs(Math.sin(time * (6 + car.v) + i)) * 0.025 * Math.min(1, car.v / 4);

      if (!this.opts.attract) this.emitEffects(i, dt, k);
    });
    this.puffs.update(dt);
    this.streaks.update(dt);

    if (this.marker) {
      const p = sim.cars.find((c) => c.input.isPlayer)!;
      const model = this.models[p.index];
      this.marker.position.set(p.x, model.height + 1.1 + Math.sin(time * 4) * 0.15, p.z);
      this.marker.rotation.y = time * 2;
    }

    this.onFrame?.(dt, time);

    if (this.opts.attract) {
      const a = time * 0.06;
      this.camera.position.set(Math.sin(a) * 62, 34, Math.cos(a) * 52);
      this.camera.lookAt(0, 0, 0);
      return;
    }
    this.director.update(dt, sim);
  }

  /** スピンの煙、コースアウトの土ぼこり、スリップストリームの筋、本気モードの火花 */
  private emitEffects(i: number, dt: number, k: number): void {
    const car = this.sim.cars[i];
    this.emitTimer[i] -= dt;
    if (this.emitTimer[i] > 0) return;
    const r = () => Math.random() - 0.5;
    const hx = Math.cos(car.heading);
    const hz = -Math.sin(car.heading);
    if (car.spinTime > 0) {
      this.emitTimer[i] = 0.035;
      this.puffs.spawn({ x: car.x + r() * 1.2, y: 0.3, z: car.z + r() * 1.2, vy: 1.2, vx: r(), vz: r(), life: 0.9, size: 0.55, color: Math.random() < 0.5 ? '#f5f5f5' : '#dcdcdc' });
    } else if (car.outTime > 0) {
      this.emitTimer[i] = 0.05;
      this.puffs.spawn({ x: car.x + r(), y: 0.2, z: car.z + r(), vy: 1.6, vx: r() * 2, vz: r() * 2, gravity: 3, life: 0.7, size: 0.4, color: Math.random() < 0.5 ? '#c8b08a' : '#a98f68' });
    } else if (car.boostTime > 0) {
      this.emitTimer[i] = 0.04;
      this.puffs.spawn({ x: car.x - hx * 1.2 + r() * 0.4, y: 0.5, z: car.z - hz * 1.2 + r() * 0.4, vy: 0.6, life: 0.45, size: 0.35, color: Math.random() < 0.5 ? '#ffb300' : '#ff7043' });
    } else if (car.inSlip) {
      this.emitTimer[i] = 0.06;
      const side = Math.random() < 0.5 ? 1 : -1;
      const nx = Math.sin(car.heading) * side * 0.8;
      const nz = Math.cos(car.heading) * side * 0.8;
      this.streaks.spawn({
        x: car.x + nx + hx * 0.8,
        y: 0.5 + Math.random() * 0.6,
        z: car.z + nz + hz * 0.8,
        life: 0.35,
        size: 1,
        stretch: [2.2, 0.05, 0.05],
        heading: car.heading,
        color: '#ffffff',
      });
    } else if (Math.abs(k) > 0.09 && car.v > 7.5) {
      // 急なカーブではタイヤがうっすら白煙
      this.emitTimer[i] = 0.18;
      this.puffs.spawn({ x: car.x - hx * 0.8, y: 0.15, z: car.z - hz * 0.8, vy: 0.5, life: 0.5, size: 0.25, color: '#eeeeee' });
    }
  }

  dispose(): void {
    for (const m of this.models) m.dispose();
    this.puffs.dispose();
    this.streaks.dispose();
    // コースは使い回すので捨てずに外すだけ
    this.track.group.removeFromParent();
  }
}
