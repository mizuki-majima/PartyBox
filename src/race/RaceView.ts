import { PerspectiveCamera, type Scene } from 'three';
import type { CarBlueprint } from '../blueprint/types';
import { CarModel } from '../car/CarModel';
import { createOutdoorScene } from '../engine/environment';
import type { View } from '../engine/Stage';
import { TrackView } from '../track/TrackView';
import { damp } from '../util/rng';
import type { RaceCar, RaceSim } from './RaceSim';

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
  private readonly opts: RaceViewOptions;
  /** 毎フレーム、シミュレーションを進めた直後に呼ばれる（HUD や実況の更新用） */
  onFrame: ((dt: number, time: number) => void) | null = null;
  private readonly track: TrackView;

  constructor(sim: RaceSim, blueprints: CarBlueprint[], opts: RaceViewOptions = {}) {
    this.sim = sim;
    this.opts = opts;
    const { scene } = createOutdoorScene();
    this.scene = scene;
    this.track = TrackView.shared(sim.track);
    scene.add(this.track.group);
    this.models = blueprints.map((bp) => new CarModel(bp));
    for (const m of this.models) scene.add(m.root);
    this.camera.position.set(0, 70, 75);
    this.camera.lookAt(0, 0, 2);
  }

  /** 追いかける車（プレイヤーがいればプレイヤー、いなければ先頭） */
  private focusCar(): RaceCar {
    return this.sim.cars.find((c) => c.input.isPlayer) ?? this.sim.cars.reduce((a, b) => (b.progress > a.progress ? b : a));
  }

  update(dt: number, time: number): void {
    this.sim.update(dt);
    this.sim.cars.forEach((car, i) => {
      const m = this.models[i];
      m.root.position.set(car.x, 0, car.z);
      m.root.rotation.y = car.heading;
      m.update(dt, car.v, time);
    });
    this.onFrame?.(dt, time);

    if (this.opts.attract) {
      const a = time * 0.06;
      this.camera.position.set(Math.sin(a) * 62, 34, Math.cos(a) * 52);
      this.camera.lookAt(0, 0, 0);
      return;
    }
    const car = this.focusCar();
    const back = 7;
    const tx = car.x - Math.cos(car.heading) * back;
    const tz = car.z + Math.sin(car.heading) * back;
    const k = damp(2.5, dt);
    this.camera.position.x += (tx - this.camera.position.x) * k;
    this.camera.position.y += (3.4 - this.camera.position.y) * k;
    this.camera.position.z += (tz - this.camera.position.z) * k;
    this.camera.lookAt(car.x, 0.8, car.z);
  }

  dispose(): void {
    for (const m of this.models) m.dispose();
    // コースは使い回すので捨てずに外すだけ
    this.track.group.removeFromParent();
  }
}
