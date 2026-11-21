import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three';

export interface SpawnOptions {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  /** 寿命（秒） */
  life: number;
  /** 大きさ（最大時） */
  size: number;
  color: string;
  /** 伸ばす方向の倍率（筋状の粒に使う） */
  stretch?: [number, number, number];
  /** 向き（Y 軸まわり） */
  heading?: number;
  /** 重力 */
  gravity?: number;
}

/**
 * 煙・土ぼこり・スリップストリームの筋などの小さな粒。
 * InstancedMesh 1 つにまとめて描くので、何百個出しても描画は 1 回。
 * 半透明は使わず、ふくらんでからしぼむ「アニメの煙」風に見せる。
 */
export class Particles {
  readonly mesh: InstancedMesh;
  private readonly max: number;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size: Float32Array;
  private readonly stretch: Float32Array;
  private readonly heading: Float32Array;
  private readonly gravity: Float32Array;
  private next = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly p = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly c = new Color();

  constructor(max: number, geometry: BufferGeometry = new IcosahedronGeometry(1, 1)) {
    this.max = max;
    this.mesh = new InstancedMesh(geometry, new MeshStandardMaterial({ roughness: 1, flatShading: true }), max);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.stretch = new Float32Array(max * 3).fill(1);
    this.heading = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) {
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.c.set('#ffffff'));
    }
  }

  static streaks(max: number): Particles {
    return new Particles(max, new BoxGeometry(1, 1, 1));
  }

  spawn(o: SpawnOptions): void {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos.set([o.x, o.y, o.z], i * 3);
    this.vel.set([o.vx ?? 0, o.vy ?? 0, o.vz ?? 0], i * 3);
    this.life[i] = o.life;
    this.maxLife[i] = o.life;
    this.size[i] = o.size;
    this.stretch.set(o.stretch ?? [1, 1, 1], i * 3);
    this.heading[i] = o.heading ?? 0;
    this.gravity[i] = o.gravity ?? 0;
    this.mesh.setColorAt(i, this.c.set(o.color));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= this.gravity[i] * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.life[i] <= 0) {
        this.m.makeScale(0, 0, 0);
      } else {
        // 0 → ふくらむ → しぼむ
        const t = 1 - this.life[i] / this.maxLife[i];
        const grow = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75;
        const sc = this.size[i] * Math.max(0.001, Math.sqrt(grow));
        this.q.setFromAxisAngle(this.up, this.heading[i]);
        this.s.set(sc * this.stretch[k], sc * this.stretch[k + 1], sc * this.stretch[k + 2]);
        this.m.compose(this.p.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]), this.q, this.s);
      }
      this.mesh.setMatrixAt(i, this.m);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshStandardMaterial).dispose();
    this.mesh.removeFromParent();
  }
}
