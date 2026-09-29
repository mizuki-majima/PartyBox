import { PerspectiveCamera, type Scene } from 'three';
import type { CarModel } from '../car/CarModel';
import { createOutdoorScene } from '../engine/environment';
import type { View } from '../engine/Stage';
import { TrackView } from '../track/TrackView';
import { RaceSim } from './RaceSim';

/** レース観戦の場面 */
export class RaceView implements View {
  readonly scene: Scene;
  readonly camera = new PerspectiveCamera(50, 1, 0.1, 500);
  private readonly sim: RaceSim;
  private readonly models: CarModel[];

  constructor(sim: RaceSim, models: CarModel[]) {
    this.sim = sim;
    this.models = models;
    const { scene } = createOutdoorScene();
    this.scene = scene;
    scene.add(new TrackView(sim.track).group);
    for (const m of models) scene.add(m.root);
    this.camera.position.set(0, 70, 75);
    this.camera.lookAt(0, 0, 2);
  }

  update(dt: number, time: number): void {
    this.sim.update(dt);
    this.sim.cars.forEach((car, i) => {
      const m = this.models[i];
      m.root.position.set(car.x, 0, car.z);
      m.root.rotation.y = car.heading;
      m.update(dt, car.v, time);
    });
    // 先頭の車を斜め上から追いかける
    const lead = this.sim.cars.reduce((a, b) => (b.progress > a.progress ? b : a));
    const back = 9;
    const tx = lead.x - Math.cos(lead.heading) * back;
    const tz = lead.z + Math.sin(lead.heading) * back;
    const k = 1 - Math.exp(-2 * dt);
    this.camera.position.x += (tx - this.camera.position.x) * k;
    this.camera.position.y += (5 - this.camera.position.y) * k;
    this.camera.position.z += (tz - this.camera.position.z) * k;
    this.camera.lookAt(lead.x, 0.8, lead.z);
  }
}
