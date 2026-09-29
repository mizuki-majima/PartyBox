import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { canvasTexture, checkerTexture } from '../engine/textures';
import { Rng } from '../util/rng';
import type { TrackData } from './TrackData';

const WALL_HEIGHT = 0.55;
const WALL_THICK = 0.4;

/**
 * コースの見た目。ミニ四駆やプラレールのような「おもちゃのサーキット」風。
 * 静的なので、できるだけジオメトリをまとめたりインスタンス化したりして軽くしている。
 */
export class TrackView {
  private static cache = new Map<string, TrackView>();

  /** コースの見た目は重いので、コースごとに 1 つだけ作って使い回す */
  static shared(track: TrackData): TrackView {
    let view = TrackView.cache.get(track.def.id);
    if (!view) {
      view = new TrackView(track);
      TrackView.cache.set(track.def.id, view);
    }
    return view;
  }

  readonly group = new Group();
  private readonly track: TrackData;

  constructor(track: TrackData) {
    this.track = track;
    this.group.add(this.buildGround());
    this.group.add(this.buildRoad());
    this.group.add(this.buildWalls());
    this.group.add(this.buildStartLine());
    this.group.add(this.buildGate());
    this.group.add(this.buildDecorations());
  }

  /** 中心線から d ずれた点の列（閉じるために先頭をもう一度末尾へ） */
  private edge(d: number, y: number): Vector3[] {
    const t = this.track;
    const pts: Vector3[] = [];
    for (let i = 0; i <= t.sampleCount; i++) {
      const k = i % t.sampleCount;
      pts.push(new Vector3(t.px[k] + t.nx[k] * d, y, t.pz[k] + t.nz[k] * d));
    }
    return pts;
  }

  private buildGround(): Mesh {
    const tex = canvasTexture(
      256,
      256,
      (ctx, w, h) => {
        ctx.fillStyle = '#9fd98a';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#95d180';
        ctx.fillRect(0, 0, w / 2, h / 2);
        ctx.fillRect(w / 2, h / 2, w / 2, h / 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 3;
        ctx.strokeRect(0, 0, w, h);
      },
      { repeat: true },
    );
    tex.repeat.set(40, 40);
    const mesh = new Mesh(
      new PlaneGeometry(400, 400),
      new MeshStandardMaterial({ map: tex, roughness: 0.95 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildRoad(): Mesh {
    const t = this.track;
    const half = t.width / 2;
    const right = this.edge(half, 0.02);
    const left = this.edge(-half, 0.02);
    // u: 長さ方向, v: 幅方向
    const geo = stripGeometry(right, left, (i) => (i * t.ds) / 8, [1, 0]);
    const tex = canvasTexture(
      256,
      128,
      (ctx, w, h) => {
        ctx.fillStyle = '#7d8fa6';
        ctx.fillRect(0, 0, w, h);
        // 車線の区切り（破線）
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        for (const f of [1 / 3, 2 / 3]) {
          ctx.fillRect(0, f * h - 2, w * 0.55, 4);
        }
        // 端の白線
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, 6);
        ctx.fillRect(0, h - 6, w, 6);
      },
      { repeat: true },
    );
    const mesh = new Mesh(geo, new MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildWalls(): Group {
    const t = this.track;
    const half = t.width / 2;
    const stripe = canvasTexture(
      2,
      1,
      (ctx) => {
        ctx.fillStyle = '#ff5a5a';
        ctx.fillRect(0, 0, 1, 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(1, 0, 1, 1);
      },
      { repeat: true, pixelated: true },
    );
    const mat = new MeshStandardMaterial({ map: stripe, roughness: 0.5, side: DoubleSide });
    const group = new Group();
    const u = (i: number) => (i * t.ds) / 4;
    for (const side of [1, -1]) {
      const inB = this.edge(side * half, 0);
      const inT = this.edge(side * half, WALL_HEIGHT);
      const outT = this.edge(side * (half + WALL_THICK), WALL_HEIGHT);
      const outB = this.edge(side * (half + WALL_THICK), 0);
      for (const [a, b] of [
        [inB, inT],
        [inT, outT],
        [outT, outB],
      ] as const) {
        const mesh = new Mesh(stripGeometry(a, b, u, [0, 0]), mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
    }
    return group;
  }

  private buildStartLine(): Mesh {
    const t = this.track;
    const tex = checkerTexture(12, 2);
    const mesh = new Mesh(
      new PlaneGeometry(1.2, t.width),
      new MeshStandardMaterial({ map: tex, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    const f = t.frameAt(0, 0, { x: 0, z: 0, heading: 0 });
    mesh.position.set(f.x, 0.03, f.z);
    mesh.rotation.set(-Math.PI / 2, 0, f.heading);
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildGate(): Group {
    const t = this.track;
    const g = new Group();
    const f = t.frameAt(0, 0, { x: 0, z: 0, heading: 0 });
    const span = t.width / 2 + WALL_THICK + 0.6;
    const pillarMat = new MeshStandardMaterial({ color: '#ffd23f', roughness: 0.5 });
    for (const side of [1, -1]) {
      const pillar = new Mesh(new CylinderGeometry(0.35, 0.4, 6.2, 16), pillarMat);
      pillar.position.set(0, 3.1, side * span);
      pillar.castShadow = true;
      g.add(pillar);
      const ball = new Mesh(new SphereGeometry(0.5, 16, 12), new MeshStandardMaterial({ color: '#ff5a5a' }));
      ball.position.set(0, 6.6, side * span);
      ball.castShadow = true;
      g.add(ball);
    }
    const banner = canvasTexture(512, 96, (ctx, w, h) => {
      const sq = h / 4;
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < w / sq; x++) {
          ctx.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#222222';
          ctx.fillRect(x * sq, y * sq, sq, sq);
        }
      }
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.roundRect(w * 0.14, h * 0.12, w * 0.72, h * 0.76, 20);
      ctx.fill();
      ctx.fillStyle = '#e8412c';
      ctx.font = `900 ${Math.floor(h * 0.5)}px "M PLUS Rounded 1c", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PROMPT GRAND PRIX', w / 2, h / 2 + 2);
    });
    const beam = new Mesh(
      new BoxGeometry(0.5, 1.1, span * 2 + 0.4),
      [
        new MeshStandardMaterial({ map: banner }),
        new MeshStandardMaterial({ map: banner }),
        pillarMat,
        pillarMat,
        pillarMat,
        pillarMat,
      ],
    );
    // BoxGeometry の面の順は +X, -X, +Y, -Y, +Z, -Z。進行方向を向く ±X 面にバナーを貼る
    beam.position.set(0, 5.6, 0);
    beam.castShadow = true;
    g.add(beam);
    g.position.set(f.x, 0, f.z);
    g.rotation.y = f.heading;
    return g;
  }

  /** コースから十分離れているか（木やブロックを置いてよいか） */
  private isClear(x: number, z: number, margin: number): boolean {
    const t = this.track;
    const lim = t.width / 2 + WALL_THICK + margin;
    const lim2 = lim * lim;
    for (let i = 0; i < t.sampleCount; i += 3) {
      const dx = t.px[i] - x;
      const dz = t.pz[i] - z;
      if (dx * dx + dz * dz < lim2) return false;
    }
    return true;
  }

  private buildDecorations(): Group {
    const group = new Group();
    const rng = new Rng(20240601);
    const m = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3();
    const p = new Vector3();
    const up = new Vector3(0, 1, 0);

    // 棒つきキャンディみたいな木
    const treeSpots: [number, number, number][] = [];
    for (let tries = 0; tries < 900 && treeSpots.length < 70; tries++) {
      const x = rng.range(-85, 85);
      const z = rng.range(-60, 60);
      if (!this.isClear(x, z, 3)) continue;
      if (treeSpots.some(([tx, tz]) => (tx - x) ** 2 + (tz - z) ** 2 < 16)) continue;
      treeSpots.push([x, z, rng.range(0.8, 1.4)]);
    }
    const trunk = new InstancedMesh(
      new CylinderGeometry(0.18, 0.22, 1.6, 8),
      new MeshStandardMaterial({ color: '#a86b3c', roughness: 0.8 }),
      treeSpots.length,
    );
    const crown = new InstancedMesh(
      new SphereGeometry(1, 14, 10),
      new MeshStandardMaterial({ roughness: 0.6 }),
      treeSpots.length,
    );
    const greens = ['#4caf50', '#66bb6a', '#2e9d5b', '#8bc34a', '#43a047'];
    treeSpots.forEach(([x, z, sc], i) => {
      m.compose(p.set(x, 0.8 * sc, z), q.identity(), s.set(sc, sc, sc));
      trunk.setMatrixAt(i, m);
      m.compose(p.set(x, 2.1 * sc, z), q.identity(), s.set(sc * 1.1, sc * 1.1, sc * 1.1));
      crown.setMatrixAt(i, m);
      crown.setColorAt(i, new Color(rng.pick(greens)));
    });
    trunk.castShadow = crown.castShadow = true;
    group.add(trunk, crown);

    // 積み木ブロック
    const blockColors = ['#ff5a5a', '#ffd23f', '#3fa7ff', '#7ed957', '#ff9f43', '#b36bff'];
    const blocks: Matrix4[] = [];
    const blockCols: Color[] = [];
    for (let tries = 0; tries < 600 && blocks.length < 45; tries++) {
      const x = rng.range(-70, 70);
      const z = rng.range(-50, 50);
      if (!this.isClear(x, z, 2)) continue;
      const stack = rng.int(1, 3);
      const rot = rng.range(0, Math.PI);
      for (let k = 0; k < stack; k++) {
        const size = rng.range(0.9, 1.5);
        q.setFromAxisAngle(up, rot + k * 0.3);
        blocks.push(new Matrix4().compose(new Vector3(x, size / 2 + k * 1.2, z), q.clone(), new Vector3(size, size, size)));
        blockCols.push(new Color(rng.pick(blockColors)));
      }
    }
    const blockMesh = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ roughness: 0.45 }),
      blocks.length,
    );
    blocks.forEach((mat, i) => {
      blockMesh.setMatrixAt(i, mat);
      blockMesh.setColorAt(i, blockCols[i]);
    });
    blockMesh.castShadow = true;
    blockMesh.receiveShadow = true;
    group.add(blockMesh);

    // コーナーのカラーコーン
    const t = this.track;
    const cones: Vector3[] = [];
    for (let i = 0; i < t.sampleCount; i += 18) {
      const k = t.curvature[i];
      if (Math.abs(k) < 0.05) continue;
      // カーブの外側に置く
      const d = -Math.sign(k) * (t.width / 2 + WALL_THICK + 1.0);
      cones.push(new Vector3(t.px[i] + t.nx[i] * d, 0.45, t.pz[i] + t.nz[i] * d));
    }
    const coneMesh = new InstancedMesh(
      new ConeGeometry(0.35, 0.9, 12),
      new MeshStandardMaterial({ color: '#ff8a1f', roughness: 0.5 }),
      cones.length,
    );
    cones.forEach((c, i) => coneMesh.setMatrixAt(i, m.compose(c, q.identity(), s.set(1, 1, 1))));
    coneMesh.castShadow = true;
    group.add(coneMesh);

    group.add(this.buildGrandstand(rng));
    return group;
  }

  /** ホームストレート脇の観客席（積み木で組んだ段々＋丸い観客） */
  private buildGrandstand(rng: Rng): Group {
    const t = this.track;
    const g = new Group();
    const f = t.frameAt(t.length * 0.03, 0, { x: 0, z: 0, heading: 0 });
    const standMat = new MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.7 });
    const len = 26;
    for (let row = 0; row < 3; row++) {
      const step = new Mesh(new BoxGeometry(len, 0.6 + row * 0.6, 1.4), standMat);
      step.position.set(0, (0.6 + row * 0.6) / 2, row * 1.4);
      step.castShadow = true;
      step.receiveShadow = true;
      g.add(step);
    }
    const people = new InstancedMesh(new SphereGeometry(0.32, 10, 8), new MeshStandardMaterial({ roughness: 0.6 }), 60);
    const m = new Matrix4();
    const colors = ['#ff5a5a', '#3fa7ff', '#ffd23f', '#7ed957', '#ff9fd0', '#ffffff', '#b36bff'];
    for (let i = 0; i < 60; i++) {
      const row = i % 3;
      const x = -len / 2 + 1 + ((i / 3) | 0) * (len / 20) + rng.range(-0.1, 0.1);
      m.makeTranslation(x, 0.6 + row * 0.6 + 0.3, row * 1.4);
      people.setMatrixAt(i, m);
      people.setColorAt(i, new Color(rng.pick(colors)));
    }
    people.castShadow = true;
    g.add(people);
    // コースの +d 側と -d 側のうち、空いている方に置く（group のローカル +Z がコースの +d 向き）
    const off = t.width / 2 + WALL_THICK + 3;
    const nx = Math.sin(f.heading);
    const nz = Math.cos(f.heading);
    const side = this.isClear(f.x + nx * (off + 3), f.z + nz * (off + 3), 1) ? 1 : -1;
    g.position.set(f.x + nx * off * side, 0, f.z + nz * off * side);
    g.rotation.y = f.heading + (side === 1 ? 0 : Math.PI);
    return g;
  }
}

/**
 * 2 本の折れ線の間を三角形で埋める。
 * uOf: i 番目の点の u 座標, v: [a 側, b 側] の v 座標
 */
function stripGeometry(a: Vector3[], b: Vector3[], uOf: (i: number) => number, v: [number, number]): BufferGeometry {
  const n = a.length;
  const pos = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  for (let i = 0; i < n; i++) {
    a[i].toArray(pos, i * 6);
    b[i].toArray(pos, i * 6 + 3);
    const u = uOf(i);
    uv.set([u, v[0], u, v[1]], i * 4);
  }
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a0 = i * 2;
    const b0 = i * 2 + 1;
    const a1 = i * 2 + 2;
    const b1 = i * 2 + 3;
    idx.push(a0, a1, b0, b0, a1, b1);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
