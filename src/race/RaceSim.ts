import type { CarStats } from '../blueprint/types';
import { TrackData } from '../track/TrackData';
import { clamp, Rng } from '../util/rng';

/**
 * レースのシミュレーション（見た目とは独立した純粋なロジック）。
 * 車はコースの中心線に沿った距離 progress と横ずれ d で動き、
 * 曲率から作った速度プロファイルに沿って加減速する。
 * 描画を持たないので、テストでは何百レースでも一瞬で回せる。
 */

/** レースに出る車の入力（見た目とは独立した、走りに必要な情報だけ） */
export interface RacerInput {
  id: string;
  name: string;
  stats: CarStats;
  isPlayer?: boolean;
}

export type RacePhase = 'countdown' | 'racing' | 'finished';

export type RaceEventType =
  | 'start'
  | 'overtake'
  | 'lead'
  | 'lap'
  | 'finalLap'
  | 'fastestLap'
  | 'spin'
  | 'courseOut'
  | 'slipstream'
  | 'boost'
  | 'battle'
  | 'finish';

export interface RaceEvent {
  type: RaceEventType;
  /** レース開始からの秒数 */
  time: number;
  /** 主役の車の番号 */
  car: number;
  /** 相手の車の番号（追い抜き・スリップストリームなど） */
  other?: number;
  /** その時点の順位（1 始まり） */
  position?: number;
  lap?: number;
  /** 起きた場所（「S字」など） */
  section: string;
  /** ラップタイムなど */
  value?: number;
}

export interface RaceOptions {
  laps?: number;
  /** 乱数の種（同じ種なら同じレース展開） */
  seed?: number;
  /** タイトル画面の背景用: ゴールせずに走り続ける */
  endless?: boolean;
  /** スタート前のカウントダウン秒数 */
  countdown?: number;
}

export interface RaceResultEntry {
  index: number;
  id: string;
  name: string;
  isPlayer: boolean;
  position: number;
  /** ゴールタイム（秒）。タイムアップで推定したときは estimated が true */
  time: number;
  estimated: boolean;
  bestLap: number;
  lapTimes: number[];
  overtakes: number;
  spins: number;
  courseOuts: number;
  /** レース中にいちばん下がった順位 */
  worstPosition: number;
  gridPosition: number;
}

export interface RaceResult {
  laps: number;
  entries: RaceResultEntry[];
  events: RaceEvent[];
}

/** stats（1〜10）を物理パラメータに変換する */
export function physicsFromStats(stats: CarStats) {
  return {
    topSpeed: 11.7 + stats.speed * 0.13,
    accel: 3.0 + stats.acceleration * 0.55,
    grip: 6.8 + stats.handling * 0.18,
    brake: 14,
  };
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

/** 当たり判定用の車の大きさ（見た目は組み立て時にこの範囲へ収まる） */
export const CAR_LENGTH = 2.2;
export const CAR_WIDTH = 1.35;

const CORNER_K = 0.045;
const SPIN_TIME = 1.5;
const OUT_TIME = 1.6;

export class RaceCar {
  readonly index: number;
  readonly input: RacerInput;
  readonly phys: ReturnType<typeof physicsFromStats>;
  readonly profile: Float32Array;
  /** スタートラインからの走行距離（スタート前は負） */
  progress: number;
  /** 横方向のずれと、その目標 */
  d: number;
  dTarget: number;
  /** 速さ（コース 1 単位 / 秒） */
  v = 0;
  /** その日の調子（最高速度にかかる倍率） */
  readonly condition: number;
  /** スタートの反応の遅れ（秒） */
  readonly reaction: number;
  /** 好みの走行ライン（-1〜1） */
  readonly laneBias: number;
  readonly gridPosition: number;

  lap = 0;
  lapStart = 0;
  lapTimes: number[] = [];
  bestLap = Infinity;
  finished = false;
  finishTime = 0;
  estimated = false;
  position = 0;
  worstPosition = 0;

  // ハプニング
  spinTime = 0;
  spinTotal = 0;
  spinDir = 1;
  outTime = 0;
  outSide = 1;
  slipTime = 0;
  slipCooldown = 0;
  inSlip = false;
  boostTime = 0;
  boostUsed = false;
  lapFactor = 1;
  inCorner = false;
  passSide = 0;
  passTimer = 0;

  // 集計
  overtakes = 0;
  spins = 0;
  courseOuts = 0;

  // 描画用
  x = 0;
  z = 0;
  heading = 0;
  /** スピンやドリフトで向きがずれる量（ラジアン） */
  yaw = 0;
  /** コースアウトで跳ねる量 */
  bump = 0;

  constructor(index: number, input: RacerInput, track: TrackData, rng: Rng, progress: number, d: number, grid: number) {
    this.index = index;
    this.input = input;
    this.phys = physicsFromStats(input.stats);
    this.profile = buildSpeedProfile(track, this.phys.topSpeed, this.phys.grip, this.phys.brake);
    this.progress = progress;
    this.d = d;
    this.dTarget = d;
    this.condition = 1 + rng.gauss() * 0.022;
    this.reaction = rng.range(0.02, 0.3);
    this.laneBias = rng.range(-0.8, 0.8);
    this.gridPosition = grid;
  }

  /** 順位計算用の「どれだけ進んだか」 */
  get distance(): number {
    return this.progress;
  }

  get busy(): boolean {
    return this.spinTime > 0 || this.outTime > 0;
  }
}

const FIXED_DT = 1 / 60;

export class RaceSim {
  readonly track: TrackData;
  readonly cars: RaceCar[];
  readonly laps: number;
  readonly endless: boolean;
  phase: RacePhase;
  /** カウントダウンの残り秒数 */
  countdown: number;
  /** スタートからの経過秒数 */
  time = 0;
  /** 今の順位（先頭から） */
  order: RaceCar[];
  /** 全体のファステストラップ */
  fastestLap = Infinity;
  private readonly rng: Rng;
  private acc = 0;
  private readonly frame = { x: 0, z: 0, heading: 0 };
  private pending: RaceEvent[] = [];
  private readonly log: RaceEvent[] = [];
  /** ahead[i][j]: i が j の前にいるか（行ったり来たりで追い抜きを連発しないよう、ヒステリシス付き） */
  private readonly ahead: boolean[][];
  private readonly battleTime: number[][];
  private readonly battleCooldown: number[][];
  private leaderFinishTime = -1;
  private finalLapAnnounced = false;
  private finishCount = 0;

  constructor(track: TrackData, racers: RacerInput[], opts: RaceOptions = {}) {
    this.track = track;
    this.endless = opts.endless ?? false;
    this.laps = this.endless ? Infinity : (opts.laps ?? 3);
    this.rng = new Rng(opts.seed ?? Math.floor(Math.random() * 2 ** 31));
    this.countdown = this.endless ? 0 : (opts.countdown ?? 3);
    this.phase = this.endless ? 'racing' : 'countdown';

    // スタートの並び順は毎回ランダム（2 台ずつ横に並ぶ）
    const gridOrder = this.rng.shuffle(racers.map((_, i) => i));
    const lane = track.width * 0.2;
    this.cars = racers.map((r, i) => {
      const g = gridOrder.indexOf(i);
      const row = Math.floor(g / 2);
      const side = g % 2 === 0 ? 1 : -1;
      return new RaceCar(i, r, track, this.rng, -2.5 - row * 3.2 - (g % 2) * 1.2, side * lane, g + 1);
    });
    this.order = [...this.cars].sort((a, b) => b.progress - a.progress);
    this.order.forEach((c, i) => (c.position = c.worstPosition = i + 1));
    const n = this.cars.length;
    this.ahead = this.cars.map((a) => this.cars.map((b) => a.progress > b.progress));
    this.battleTime = Array.from({ length: n }, () => new Array(n).fill(0));
    this.battleCooldown = Array.from({ length: n }, () => new Array(n).fill(0));
    this.cars.forEach((c) => this.place(c));
  }

  /** 経過時間を固定ステップで刻んで進める（フレームレートに左右されない） */
  update(dt: number): void {
    this.acc += Math.min(dt, 1);
    while (this.acc >= FIXED_DT) {
      this.step(FIXED_DT);
      this.acc -= FIXED_DT;
    }
  }

  /** たまったイベントを取り出す（実況や効果音が使う） */
  drainEvents(): RaceEvent[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  private emit(e: Omit<RaceEvent, 'time' | 'section'> & { section?: string }): void {
    if (this.endless) return;
    const car = this.cars[e.car];
    const ev: RaceEvent = { time: this.time, section: this.track.sectionNameAt(car.progress), ...e };
    this.pending.push(ev);
    this.log.push(ev);
  }

  step(dt: number): void {
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = 'racing';
        this.countdown = 0;
        this.emit({ type: 'start', car: this.order[0].index });
      }
      this.cars.forEach((c) => this.place(c));
      return;
    }
    this.time += dt;

    const leader = this.order.find((c) => !c.finished) ?? this.order[0];
    for (const car of this.cars) this.stepCar(car, dt, leader);
    this.resolveContacts(dt);
    this.updateOrder(dt);
    for (const car of this.cars) this.place(car);

    if (!this.endless && this.phase === 'racing') {
      const allDone = this.cars.every((c) => c.finished);
      // 先頭がゴールしてから長く待たせないよう、25 秒でタイムアップ（残りは推定タイム）
      if (!allDone && this.leaderFinishTime >= 0 && this.time - this.leaderFinishTime > 25) {
        for (const c of this.order) if (!c.finished) this.finishCar(c, true);
      }
      if (this.cars.every((c) => c.finished)) this.phase = 'finished';
    }
  }

  private stepCar(car: RaceCar, dt: number, leader: RaceCar): void {
    const track = this.track;
    const L = track.length;
    if (this.time < car.reaction) {
      car.v = 0;
      return;
    }
    const idx = track.indexAt(car.progress);
    const k = track.curvature[idx];
    const kAhead = track.curvatureAt(car.progress + 6);
    const half = track.width / 2 - CAR_WIDTH / 2 - 0.15;

    // ── 目標速度 ──
    let factor = car.condition * car.lapFactor;
    if (!car.finished && leader !== car) {
      // 離されすぎた車には少しだけ追い風（弱い車にもチャンスを残す）
      const gap = leader.progress - car.progress;
      factor *= 1 + clamp(gap / 45, 0, 1) * 0.045;
    }
    if (car.inSlip) factor *= 1.06;
    if (car.boostTime > 0) {
      factor *= 1.09;
      car.boostTime -= dt;
    }
    let target = car.profile[idx] * factor;
    if (car.finished) target = Math.min(target, car.profile[idx] * 0.6);

    // ── ハプニング中 ──
    if (car.spinTime > 0) {
      car.spinTime -= dt;
      const t = 1 - car.spinTime / SPIN_TIME;
      // 最初は勢いよく、だんだんゆっくり回る
      car.yaw = car.spinDir * car.spinTotal * (1 - Math.pow(1 - clamp(t, 0, 1), 2.2));
      target = Math.min(target, 1.5 + 6 * clamp(t - 0.6, 0, 1));
      if (car.spinTime <= 0) car.yaw = 0;
    } else if (car.outTime > 0) {
      car.outTime -= dt;
      target = Math.min(target, car.profile[idx] * 0.5);
      car.bump = Math.max(0, Math.sin((1 - car.outTime / OUT_TIME) * Math.PI * 3)) * 0.12 * (car.outTime / OUT_TIME);
      car.yaw = car.outSide * 0.25 * Math.sin((car.outTime / OUT_TIME) * Math.PI);
      if (car.outTime <= 0) {
        car.bump = 0;
        car.yaw = 0;
      }
    } else {
      // コーナーでは少しだけ車体を内側へ向ける（ドリフトっぽさ）
      car.yaw += (clamp(k * 3, -0.25, 0.25) * clamp(car.v / 12, 0, 1) - car.yaw) * Math.min(1, dt * 4);
    }

    // ── 前の車に詰まったら ──
    const front = this.carAhead(car, 6);
    if (front && !car.busy) {
      const gap = front.progress - car.progress;
      const sameLane = Math.abs(front.d - car.d) < CAR_WIDTH * 1.05;
      if (sameLane && gap < CAR_LENGTH + 1.6 && car.v > front.v - 0.2) {
        target = Math.min(target, front.v + (gap - CAR_LENGTH) * 0.8);
        // 追い越しを試みる: 広い方へよける
        if (car.passTimer <= 0) {
          const roomPlus = half - front.d;
          const roomMinus = front.d + half;
          car.passSide = roomPlus > roomMinus ? 1 : -1;
          car.passTimer = 2.5;
        }
      }
    }

    // ── 加減速 ──
    if (car.v < target) {
      const ratio = car.v / (car.phys.topSpeed * factor);
      car.v = Math.min(target, car.v + car.phys.accel * (1 - 0.55 * ratio * ratio) * dt);
    } else {
      car.v = Math.max(target, car.v - car.phys.brake * (car.spinTime > 0 ? 1.4 : 1) * dt);
    }
    car.v = Math.max(0, car.v);

    const before = car.progress;
    car.progress += car.v * dt;

    // ── 走行ライン ──
    let dT: number;
    if (car.outTime > 0) {
      dT = car.outSide * (track.width / 2 - 0.5);
    } else {
      // コーナーではイン側、直線では好みのライン
      const inside = clamp(kAhead * 14, -1, 1);
      dT = clamp(inside * 0.7 + car.laneBias * 0.45, -1, 1) * half;
      if (car.passTimer > 0) {
        car.passTimer -= dt;
        if (front) dT = clamp(front.d + car.passSide * CAR_WIDTH * 1.25, -half, half);
      }
      if (car.finished) dT = car.laneBias * half;
    }
    car.dTarget = dT;
    const latSpeed = car.outTime > 0 ? 3.2 : 2.4;
    car.d += clamp(car.dTarget - car.d, -latSpeed * dt, latSpeed * dt);
    car.d = clamp(car.d, -track.width / 2 + 0.55, track.width / 2 - 0.55);

    if (car.finished || this.phase !== 'racing') return;

    // ── ハプニングの抽選（コーナーに入った瞬間） ──
    const cornering = Math.abs(k) > CORNER_K;
    if (cornering && !car.inCorner && !car.busy) {
      const limit = Math.sqrt(car.phys.grip / Math.max(Math.abs(k), 1e-3));
      const push = clamp(car.v / limit, 0.5, 1.15);
      const risk = Math.pow((11 - car.input.stats.stability) / 10, 1.6) * push * push;
      if (this.rng.chance(0.07 * risk)) {
        car.spinTime = SPIN_TIME;
        car.spinTotal = Math.PI * 2 * this.rng.pick([1, 1, 1.5]);
        car.spinDir = this.rng.chance(0.5) ? 1 : -1;
        car.spins++;
        this.emit({ type: 'spin', car: car.index, position: car.position });
      } else if (this.rng.chance(0.05 * risk)) {
        car.outTime = OUT_TIME;
        car.outSide = k > 0 ? -1 : 1; // 外側へふくらむ
        car.courseOuts++;
        this.emit({ type: 'courseOut', car: car.index, position: car.position });
      }
    }
    car.inCorner = cornering;

    // ── スリップストリーム（直線で前の車の真後ろにつく） ──
    car.slipCooldown -= dt;
    const slipFront = this.carAhead(car, 9);
    const straight = Math.abs(k) < 0.02;
    if (slipFront && straight && !car.busy && Math.abs(slipFront.d - car.d) < 1.3 && slipFront.progress - car.progress > CAR_LENGTH + 0.3) {
      car.slipTime += dt;
      if (car.slipTime > 0.5 && !car.inSlip) {
        car.inSlip = true;
        if (car.slipCooldown <= 0) {
          car.slipCooldown = 12;
          this.emit({ type: 'slipstream', car: car.index, other: slipFront.index, position: car.position });
        }
      }
    } else {
      car.slipTime = 0;
      car.inSlip = false;
    }

    // ── ラップ ──
    const lapNow = Math.floor(car.progress / L);
    if (car.progress >= 0 && lapNow > Math.floor(before / L) && before >= 0) {
      const lapTime = this.time - car.lapStart;
      car.lapTimes.push(lapTime);
      car.lapStart = this.time;
      car.lap = lapNow;
      car.lapFactor = 1 + this.rng.gauss() * 0.012;
      if (lapTime < car.bestLap) car.bestLap = lapTime;
      if (lapTime < this.fastestLap) {
        this.fastestLap = lapTime;
        this.emit({ type: 'fastestLap', car: car.index, value: lapTime, lap: lapNow });
      }
      if (lapNow >= this.laps) {
        this.finishCar(car, false);
      } else {
        this.emit({ type: 'lap', car: car.index, lap: lapNow + 1, position: car.position });
        if (lapNow === this.laps - 1 && !this.finalLapAnnounced && car.position === 1) {
          this.finalLapAnnounced = true;
          this.emit({ type: 'finalLap', car: car.index, lap: lapNow + 1 });
        }
      }
    } else if (before < 0 && car.progress >= 0) {
      car.lapStart = this.time;
    }

    // ── 最終周の「本気モード」 ──
    if (!car.boostUsed && car.lap === this.laps - 1 && car.position >= 3 && this.rng.chance(0.25 * dt)) {
      car.boostUsed = true;
      car.boostTime = 3.5;
      this.emit({ type: 'boost', car: car.index, position: car.position });
    }
  }

  private finishCar(car: RaceCar, estimated: boolean): void {
    car.finished = true;
    car.estimated = estimated;
    if (estimated) {
      const remaining = this.laps * this.track.length - car.progress;
      const avg = car.progress / Math.max(this.time, 1);
      car.finishTime = this.time + remaining / Math.max(avg, 1);
    } else {
      car.finishTime = this.time;
    }
    this.finishCount++;
    if (this.leaderFinishTime < 0) this.leaderFinishTime = this.time;
    car.position = this.finishCount;
    this.emit({ type: 'finish', car: car.index, position: this.finishCount });
  }

  /** 自分より前（maxGap 以内）でいちばん近い車 */
  private carAhead(car: RaceCar, maxGap: number): RaceCar | null {
    let best: RaceCar | null = null;
    let bestGap = maxGap;
    for (const other of this.cars) {
      if (other === car) continue;
      const gap = other.progress - car.progress;
      if (gap > 0 && gap < bestGap) {
        bestGap = gap;
        best = other;
      }
    }
    return best;
  }

  /** 重なった車を左右に押し分ける */
  private resolveContacts(dt: number): void {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        const ds = a.progress - b.progress;
        const dd = a.d - b.d;
        if (Math.abs(ds) < CAR_LENGTH * 0.95 && Math.abs(dd) < CAR_WIDTH) {
          const push = (CAR_WIDTH - Math.abs(dd)) * 0.5 * Math.min(1, dt * 10);
          const dir = dd >= 0 ? 1 : -1;
          a.d += dir * push;
          b.d -= dir * push;
          // 後ろの車は少し減速
          const rear = ds > 0 ? b : a;
          rear.v *= 1 - 0.8 * dt;
        }
      }
    }
  }

  private updateOrder(dt: number): void {
    const prevLeader = this.order[0];
    this.order = [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    this.order.forEach((c, i) => {
      if (!c.finished) c.position = i + 1;
      if (this.phase === 'racing' && c.position > c.worstPosition) c.worstPosition = c.position;
    });
    if (this.phase !== 'racing' || this.endless) return;

    // 追い抜きの検出
    const n = this.cars.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const a = this.cars[i];
        const b = this.cars[j];
        if (a.finished || b.finished) continue;
        const diff = a.progress - b.progress;
        if (!this.ahead[i][j] && diff > 0.6) {
          this.ahead[i][j] = true;
          this.ahead[j][i] = false;
          if (a.progress > 0 && !b.busy) {
            a.overtakes++;
            this.emit({ type: 'overtake', car: i, other: j, position: a.position });
          } else if (a.progress > 0) {
            // 相手がスピン中などで抜いた場合は、実況でそれとわかるように
            this.emit({ type: 'overtake', car: i, other: j, position: a.position, value: 1 });
          }
        }
        // 接戦（テール・トゥ・ノーズ）
        if (i < j) {
          this.battleCooldown[i][j] -= dt;
          if (Math.abs(diff) < CAR_LENGTH + 1.2) {
            this.battleTime[i][j] += dt;
            if (this.battleTime[i][j] > 3 && this.battleCooldown[i][j] <= 0) {
              this.battleCooldown[i][j] = 18;
              const front = diff > 0 ? a : b;
              const back = diff > 0 ? b : a;
              this.emit({ type: 'battle', car: back.index, other: front.index, position: back.position });
            }
          } else {
            this.battleTime[i][j] = 0;
          }
        }
      }
    }
    const leader = this.order[0];
    if (leader !== prevLeader && !leader.finished && leader.progress > 0) {
      this.emit({ type: 'lead', car: leader.index, other: prevLeader.index, position: 1 });
    }
  }

  private place(car: RaceCar): void {
    const f = this.track.frameAt(car.progress, car.d, this.frame);
    car.x = f.x;
    car.z = f.z;
    car.heading = f.heading + car.yaw;
  }

  /** ゴール後の結果（全車ゴールしていなければ null） */
  result(): RaceResult | null {
    if (this.phase !== 'finished') return null;
    const entries: RaceResultEntry[] = [...this.cars]
      .sort((a, b) => a.finishTime - b.finishTime)
      .map((c, i) => ({
        index: c.index,
        id: c.input.id,
        name: c.input.name,
        isPlayer: !!c.input.isPlayer,
        position: i + 1,
        time: c.finishTime,
        estimated: c.estimated,
        bestLap: c.bestLap,
        lapTimes: c.lapTimes.slice(),
        overtakes: c.overtakes,
        spins: c.spins,
        courseOuts: c.courseOuts,
        worstPosition: c.worstPosition,
        gridPosition: c.gridPosition,
      }));
    return { laps: this.laps, entries, events: this.log.slice() };
  }

  /** テスト・バランス調整用: 最後まで一気に走らせる */
  runToEnd(maxSeconds = 300): RaceResult | null {
    while (this.phase !== 'finished' && this.time < maxSeconds) this.step(FIXED_DT);
    return this.result();
  }
}
