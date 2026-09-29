import {
  CanvasTexture,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PMREMGenerator,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Rng } from '../util/rng';
import { IS_MOBILE } from './Stage';

let envMap: Texture | null = null;

/**
 * 映り込み用の環境マップ（部屋の照明のようなやわらかい光）。
 * プラスチックや金属がおもちゃらしくツヤっと光る。1 回だけ作って使い回す。
 */
export function getEnvironmentMap(renderer: WebGLRenderer): Texture {
  if (!envMap) {
    const pmrem = new PMREMGenerator(renderer);
    envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }
  return envMap;
}

let skyTexture: Texture | null = null;
function getSkyTexture(): Texture {
  if (!skyTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#5ab8ff');
    g.addColorStop(0.55, '#a8dcff');
    g.addColorStop(1, '#e6f6ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 256);
    skyTexture = new CanvasTexture(canvas);
    skyTexture.colorSpace = SRGBColorSpace;
  }
  return skyTexture;
}

/** 遠くに浮かぶ、もこもこの雲 */
function buildClouds(): InstancedMesh {
  const rng = new Rng(77);
  const mats: Matrix4[] = [];
  for (let c = 0; c < 14; c++) {
    const a = (c / 14) * Math.PI * 2 + rng.range(-0.15, 0.15);
    const r = rng.range(150, 190);
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const cy = rng.range(28, 48);
    const size = rng.range(6, 10);
    for (let k = 0; k < 4; k++) {
      const s = size * rng.range(0.6, 1.1);
      mats.push(
        new Matrix4().compose(
          new Vector3(cx + (k - 1.5) * size * 0.8, cy + rng.range(-1, 2), cz + rng.range(-2, 2)),
          new Quaternion(),
          new Vector3(s, s * 0.7, s),
        ),
      );
    }
  }
  const mesh = new InstancedMesh(
    new IcosahedronGeometry(1, 2),
    new MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.35, fog: false }),
    mats.length,
  );
  mats.forEach((m, i) => mesh.setMatrixAt(i, m));
  return mesh;
}

/** 晴れた昼間の屋外（サーキット用）のシーンを作る */
export function createOutdoorScene(renderer?: WebGLRenderer): { scene: Scene; sun: DirectionalLight } {
  const scene = new Scene();
  scene.background = getSkyTexture();
  scene.fog = new Fog('#d4efff', 120, 280);
  if (renderer) {
    scene.environment = getEnvironmentMap(renderer);
    scene.environmentIntensity = 0.45;
  } else {
    scene.background = new Color('#bfe6ff');
  }

  scene.add(new HemisphereLight('#eaf6ff', '#8fbf73', renderer ? 1.05 : 1.4));

  const sun = new DirectionalLight('#fff2d9', 2.2);
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
  scene.add(sun, sun.target);
  scene.add(buildClouds());
  return { scene, sun };
}

const SUN_OFFSET = new Vector3(-30, 60, 40);

/**
 * 影を映す範囲をカメラの見ている場所に合わせて動かす。
 * 狭い範囲に絞るほど影がくっきりする（俯瞰のときは広く）。
 */
export function focusShadow(sun: DirectionalLight, x: number, z: number, radius: number): void {
  // 影のドットの大きさ単位で位置をそろえ、カメラが動いても影がちらつかないようにする
  const texel = (radius * 2) / sun.shadow.mapSize.x;
  x = Math.round(x / texel) * texel;
  z = Math.round(z / texel) * texel;
  sun.target.position.set(x, 0, z);
  sun.position.set(x + SUN_OFFSET.x, SUN_OFFSET.y, z + SUN_OFFSET.z);
  const cam = sun.shadow.camera;
  if (cam.right !== radius) {
    cam.left = -radius;
    cam.right = radius;
    cam.top = radius;
    cam.bottom = -radius;
    cam.updateProjectionMatrix();
  }
}
