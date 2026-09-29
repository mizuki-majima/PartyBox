import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, type Scene } from 'three';
import { createOutdoorScene } from '../engine/environment';
import type { View } from '../engine/Stage';
import { TrackView } from '../track/TrackView';
import { RaceSim } from './RaceSim';

/** レース観戦の場面（Phase 1: 箱型の車がぐるぐる回るだけ） */
export class RaceView implements View {
  readonly scene: Scene;
  readonly camera = new PerspectiveCamera(50, 1, 0.1, 500);
  private readonly sim: RaceSim;
  private readonly models: { root: Group; wheels: Mesh[] }[] = [];

  constructor(sim: RaceSim, colors: string[]) {
    this.sim = sim;
    const { scene } = createOutdoorScene();
    this.scene = scene;
    scene.add(new TrackView(sim.track).group);

    sim.cars.forEach((_, i) => {
      const root = new Group();
      const body = new Mesh(new BoxGeometry(1.7, 0.7, 1.1), new MeshStandardMaterial({ color: colors[i % colors.length] }));
      body.position.y = 0.55;
      body.castShadow = true;
      root.add(body);
      const wheels: Mesh[] = [];
      const wheelGeo = new CylinderGeometry(0.3, 0.3, 0.2, 16);
      wheelGeo.rotateX(Math.PI / 2);
      const wheelMat = new MeshStandardMaterial({ color: '#333333' });
      for (const [x, z] of [
        [0.55, 0.6],
        [0.55, -0.6],
        [-0.55, 0.6],
        [-0.55, -0.6],
      ]) {
        const w = new Mesh(wheelGeo, wheelMat);
        w.position.set(x, 0.3, z);
        w.castShadow = true;
        root.add(w);
        wheels.push(w);
      }
      scene.add(root);
      this.models.push({ root, wheels });
    });

    this.camera.position.set(0, 70, 75);
    this.camera.lookAt(0, 0, 2);
  }

  update(dt: number, time: number): void {
    this.sim.update(dt);
    this.sim.cars.forEach((car, i) => {
      const m = this.models[i];
      m.root.position.set(car.x, 0, car.z);
      m.root.rotation.y = car.heading;
      for (const w of m.wheels) w.rotation.z = -car.wheelAngle;
    });
    // 俯瞰カメラをゆっくり回す
    const a = time * 0.05;
    this.camera.position.set(Math.sin(a) * 30, 70, 75 * Math.cos(a * 0.5));
    this.camera.lookAt(0, 0, 2);
  }
}
