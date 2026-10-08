import { CatmullRomCurve3, Vector3 } from 'three';

/**
 * コースの「形」だけを表す純粋なデータ。描画（Three.js のメッシュ）とは分けておき、
 * レースのシミュレーションやテストからも使えるようにしている。
 *
 * 座標系: 地面が XZ 平面、Y が上。車は自分のローカル +X 方向に進む。
 * コース上の位置は「中心線に沿った距離 s」と「横方向のずれ d」で表す。
 * d の正の向きは、進行方向に対して車のローカル +Z 側。
 */

export interface TrackSection {
  /** 実況で使う区間名（例: 「S字」「最終コーナー」） */
  name: string;
  /** 区間の開始・終了（コントロールポイントの番号。end は含まない） */
  fromPoint: number;
  toPoint: number;
}

export interface TrackDefinition {
  id: string;
  name: string;
  /** 中心線のコントロールポイント（x, z）。先頭がスタートライン */
  points: ReadonlyArray<readonly [number, number]>;
  /** 走行面の幅 */
  width: number;
  sections: TrackSection[];
}

export interface TrackFrame {
  x: number;
  z: number;
  /** 進行方向の向き（Y 軸まわりの回転角。車の rotation.y にそのまま入れられる） */
  heading: number;
}

const SAMPLE_COUNT = 1200;

export class TrackData {
  readonly def: TrackDefinition;
  readonly length: number;
  readonly width: number;
  readonly sampleCount = SAMPLE_COUNT;
  readonly ds: number;

  /** 中心線のサンプル（等間隔） */
  readonly px = new Float32Array(SAMPLE_COUNT);
  readonly pz = new Float32Array(SAMPLE_COUNT);
  /** 接線（進行方向の単位ベクトル） */
  readonly tx = new Float32Array(SAMPLE_COUNT);
  readonly tz = new Float32Array(SAMPLE_COUNT);
  /** 横方向（+d 側）の単位ベクトル */
  readonly nx = new Float32Array(SAMPLE_COUNT);
  readonly nz = new Float32Array(SAMPLE_COUNT);
  /** 符号つき曲率（正なら +d 側へ曲がる = +d 側がイン） */
  readonly curvature = new Float32Array(SAMPLE_COUNT);
  /** サンプルごとの区間番号 */
  readonly sectionIndex = new Uint8Array(SAMPLE_COUNT);

  constructor(def: TrackDefinition) {
    this.def = def;
    this.width = def.width;

    const curve = new CatmullRomCurve3(
      def.points.map(([x, z]) => new Vector3(x, 0, z)),
      true,
      'centripetal',
    );
    this.length = curve.getLength();
    this.ds = this.length / SAMPLE_COUNT;

    const tangent = new Vector3();
    const p = new Vector3();
    const n = def.points.length;
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const u = i / SAMPLE_COUNT;
      curve.getPointAt(u, p);
      curve.getTangentAt(u, tangent);
      tangent.y = 0;
      tangent.normalize();
      this.px[i] = p.x;
      this.pz[i] = p.z;
      this.tx[i] = tangent.x;
      this.tz[i] = tangent.z;
      // 車のローカル +Z に相当する向き
      this.nx[i] = -tangent.z;
      this.nz[i] = tangent.x;

      const t = curve.getUtoTmapping(u, 0);
      const pointIndex = Math.floor(t * n) % n;
      this.sectionIndex[i] = def.sections.findIndex(
        (sec) => pointIndex >= sec.fromPoint && pointIndex < sec.toPoint,
      );
    }

    // 曲率: 接線の変化量を横方向に射影し、前後で平滑化する
    const raw = new Float32Array(SAMPLE_COUNT);
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const a = (i - 2 + SAMPLE_COUNT) % SAMPLE_COUNT;
      const b = (i + 2) % SAMPLE_COUNT;
      const dtx = this.tx[b] - this.tx[a];
      const dtz = this.tz[b] - this.tz[a];
      raw[i] = (dtx * this.nx[i] + dtz * this.nz[i]) / (4 * this.ds);
    }
    const win = 12;
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      let sum = 0;
      for (let k = -win; k <= win; k++) sum += raw[(i + k + SAMPLE_COUNT) % SAMPLE_COUNT];
      this.curvature[i] = sum / (win * 2 + 1);
    }
  }

  /** 距離 s を [0, length) に丸める */
  wrap(s: number): number {
    const L = this.length;
    return ((s % L) + L) % L;
  }

  indexAt(s: number): number {
    return Math.floor(this.wrap(s) / this.ds) % SAMPLE_COUNT;
  }

  curvatureAt(s: number): number {
    return this.curvature[this.indexAt(s)];
  }

  sectionNameAt(s: number): string {
    const idx = this.sectionIndex[this.indexAt(s)];
    return this.def.sections[idx]?.name ?? 'コース';
  }

  /** 中心線から d だけ横にずれた地点の座標と向き */
  frameAt(s: number, d: number, out: TrackFrame): TrackFrame {
    const w = this.wrap(s) / this.ds;
    const i0 = Math.floor(w) % SAMPLE_COUNT;
    const i1 = (i0 + 1) % SAMPLE_COUNT;
    const f = w - Math.floor(w);
    const tx = this.tx[i0] + (this.tx[i1] - this.tx[i0]) * f;
    const tz = this.tz[i0] + (this.tz[i1] - this.tz[i0]) * f;
    const nx = this.nx[i0] + (this.nx[i1] - this.nx[i0]) * f;
    const nz = this.nz[i0] + (this.nz[i1] - this.nz[i0]) * f;
    out.x = this.px[i0] + (this.px[i1] - this.px[i0]) * f + nx * d;
    out.z = this.pz[i0] + (this.pz[i1] - this.pz[i0]) * f + nz * d;
    out.heading = Math.atan2(-tz, tx);
    return out;
  }
}

const trackCache = new Map<string, TrackData>();

/** コースの計算結果は使い回す */
export function getTrack(def: TrackDefinition = TOY_CIRCUIT): TrackData {
  let t = trackCache.get(def.id);
  if (!t) {
    t = new TrackData(def);
    trackCache.set(def.id, t);
  }
  return t;
}

/** おもちゃのサーキット: 楕円にちょっとだけ S 字を足したコース */
export const TOY_CIRCUIT: TrackDefinition = {
  id: 'toy-circuit',
  name: 'おもちゃサーキット',
  width: 7.5,
  points: [
    [-6, 24], // 0 スタートライン
    [14, 24], // 1
    [32, 23], // 2
    [44, 15], // 3 第1コーナー
    [47, 1], // 4
    [41, -12], // 5
    [28, -19], // 6
    [16, -18], // 7 S字
    [7, -9], // 8
    [-4, -6], // 9
    [-14, -13], // 10
    [-27, -20], // 11
    [-42, -17], // 12 最終コーナー
    [-50, -4], // 13
    [-47, 12], // 14
    [-34, 22], // 15
    [-20, 24.5], // 16
  ],
  sections: [
    { name: 'ホームストレート', fromPoint: 0, toPoint: 2 },
    { name: '第1コーナー', fromPoint: 2, toPoint: 6 },
    { name: 'S字', fromPoint: 6, toPoint: 10 },
    { name: 'バックストレート', fromPoint: 10, toPoint: 12 },
    { name: '最終コーナー', fromPoint: 12, toPoint: 15 },
    { name: 'ホームストレート', fromPoint: 15, toPoint: 17 },
  ],
};
