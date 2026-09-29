import type { CarStats } from '../blueprint/types';
import { TrackData } from '../track/TrackData';
import { clamp } from '../util/rng';

/** レースに出る車の入力（見た目とは独立した、走りに必要な情報だけ） */
export interface RacerInput {
  id: string;
  name: string;
  stats: CarStats;
  isPlayer?: boolean;
}

/** stats（1〜10）を物理パラメータに変換する */
export function physicsFromStats(stats: CarStats) {
  return {
    topSpeed: 11.5 + stats.speed * 0.42,
    accel: 3.5 + stats.acceleration * 0.45,
    grip: 5.5 + stats.handling * 0.45,
    brake: 13,
  };
}

export class RaceCar {
  readonly input: RacerInput;
  readonly phys: ReturnType<typeof physicsFromStats>;
  /** スタートラインからの走行距離（スタート前は負） */
  progress: number;
  /** 横方向のずれ */
  d: number;
  dTarget: number;
  /** 速さ（コース 1 単位 / 秒） */
  v = 0;
  /** 車輪の回転角 */
  wheelAngle = 0;
  /** 描画用: ワールド座標と向き */
  x = 0;
  z = 0;
  heading = 0;
  /** コース上の速度プロファイル（サンプルごとの目標速度） */
  readonly profile: Float32Array;

  constructor(input: RacerInput, track: TrackData, progress: number, d: number) {
    this.input = input;
    this.phys = physicsFromStats(input.stats);
    this.progress = progress;
    this.d = d;
    this.dTarget = d;
    this.profile = buildSpeedProfile(track, this.phys.topSpeed, this.phys.grip, this.phys.brake);
  }
}

/**
 * 「このサンプル地点ではこれ以上出すとはみ出す」という上限速度を作り、
 * そこから後ろ向きに「ブレーキが間に合う速度」を伝播させる。
 */
export function buildSpeedProfile(track: TrackData, topSpeed: number, grip: number, brake: number): Float32Array {
  const n = track.sampleCount;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.max(Math.abs(track.curvature[i]), 1e-4);
    out[i] = Math.min(topSpeed, Math.sqrt(grip / k));
  }
  // 周回コースなので 2 周ぶん回して折り返しにも伝播させる
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const next = out[(i + 1) % n];
      const limit = Math.sqrt(next * next + 2 * brake * track.ds);
      if (out[i] > limit) out[i] = limit;
    }
  }
  return out;
}

const FIXED_DT = 1 / 60;

export class RaceSim {
  readonly track: TrackData;
  readonly cars: RaceCar[];
  time = 0;
  private acc = 0;
  private readonly frame = { x: 0, z: 0, heading: 0 };

  constructor(track: TrackData, racers: RacerInput[]) {
    this.track = track;
    const lane = track.width * 0.22;
    this.cars = racers.map((r, i) => {
      const row = Math.floor(i / 2);
      const side = i % 2 === 0 ? 1 : -1;
      return new RaceCar(r, track, -3 - row * 4, side * lane);
    });
    this.cars.forEach((c) => this.place(c));
  }

  /** 経過時間を固定ステップで刻んで進める（フレームレートに左右されない） */
  update(dt: number): void {
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= FIXED_DT) {
      this.step(FIXED_DT);
      this.acc -= FIXED_DT;
    }
  }

  step(dt: number): void {
    this.time += dt;
    for (const car of this.cars) {
      const target = car.profile[this.track.indexAt(car.progress)];
      if (car.v < target) {
        const ratio = car.v / car.phys.topSpeed;
        car.v = Math.min(target, car.v + car.phys.accel * (1 - 0.6 * ratio * ratio) * dt);
      } else {
        car.v = Math.max(target, car.v - car.phys.brake * dt);
      }
      car.progress += car.v * dt;
      car.d += clamp(car.dTarget - car.d, -2 * dt, 2 * dt);
      car.wheelAngle += (car.v * dt) / 0.3;
      this.place(car);
    }
  }

  private place(car: RaceCar): void {
    const f = this.track.frameAt(car.progress, car.d, this.frame);
    car.x = f.x;
    car.z = f.z;
    car.heading = f.heading;
  }
}
