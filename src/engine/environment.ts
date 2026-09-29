import { Color, DirectionalLight, Fog, HemisphereLight, Scene } from 'three';
import { IS_MOBILE } from './Stage';

/** 晴れた昼間の屋外（サーキット用）のシーンを作る */
export function createOutdoorScene(): { scene: Scene; sun: DirectionalLight } {
  const scene = new Scene();
  scene.background = new Color('#bfe6ff');
  scene.fog = new Fog('#bfe6ff', 110, 260);

  scene.add(new HemisphereLight('#e8f6ff', '#8fbf73', 1.6));

  const sun = new DirectionalLight('#fff4e0', 2.2);
  sun.position.set(-30, 60, 40);
  sun.castShadow = true;
  const size = IS_MOBILE ? 1024 : 2048;
  sun.shadow.mapSize.set(size, size);
  const cam = sun.shadow.camera;
  cam.left = -65;
  cam.right = 65;
  cam.top = 50;
  cam.bottom = -50;
  cam.near = 10;
  cam.far = 160;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  return { scene, sun };
}
