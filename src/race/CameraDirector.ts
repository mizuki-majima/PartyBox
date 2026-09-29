import { PerspectiveCamera, Vector3 } from 'three';
import { damp } from '../util/rng';
import type { RaceCar, RaceEvent, RaceSim } from './RaceSim';

/**
 * 観戦カメラ。
 * - player:   自車を後ろから追う
 * - leader:   先頭の車を前から映す（後ろの追走も一緒に映る）
 * - overhead: 俯瞰
 * 自動モードでは時間とレースの出来事に応じて切り替える。手動で選んだら自動は止まる。
 */
export type CameraMode = 'player' | 'leader' | 'overhead';

export const CAMERA_LABELS: Record<CameraMode | 'auto', string> = {
  auto: '自動',
  player: '自車',
  leader: '先頭',
  overhead: '俯瞰',
};

const AUTO_CYCLE: { mode: CameraMode; time: number }[] = [
  { mode: 'player', time: 8 },
  { mode: 'leader', time: 6 },
  { mode: 'player', time: 7 },
  { mode: 'overhead', time: 5 },
];

export class CameraDirector {
  readonly camera: PerspectiveCamera;
  auto = true;
  mode: CameraMode = 'leader';
  /** 自動モードで、ハプニングなどで一時的に映している車 */
  private focus: number | null = null;
  private holdTime = 0;
  private cycleIndex = 0;
  private cut = true;
  private aspect = 1;
  private readonly pos = new Vector3();
  private readonly look = new Vector3();
  private readonly tmpPos = new Vector3();
  private readonly tmpLook = new Vector3();
  private readonly frame = { x: 0, z: 0, heading: 0 };
  /** カメラが切り替わったときに呼ばれる（UI のラベル更新用） */
  onChange: ((mode: CameraMode, auto: boolean) => void) | null = null;

  constructor(camera: PerspectiveCamera) {
    this.camera = camera;
  }

  setAspect(aspect: number): void {
    this.aspect = aspect;
  }

  /** ボタンから呼ぶ。'auto' で自動に戻る */
  select(mode: CameraMode | 'auto'): void {
    if (mode === 'auto') {
      this.auto = true;
      this.holdTime = 0;
    } else {
      this.auto = false;
      this.focus = null;
      this.switchTo(mode);
    }
    this.onChange?.(this.mode, this.auto);
  }

  private switchTo(mode: CameraMode, focus: number | null = null): void {
    if (mode !== this.mode || focus !== this.focus) this.cut = true;
    this.mode = mode;
    this.focus = focus;
    this.onChange?.(this.mode, this.auto);
  }

  /** レースの出来事に応じて、自動モードならカメラを向ける */
  onEvent(e: RaceEvent, sim: RaceSim): void {
    if (!this.auto) return;
    const car = sim.cars[e.car];
    const playerInvolved = car.input.isPlayer || (e.other !== undefined && sim.cars[e.other].input.isPlayer);
    switch (e.type) {
      case 'spin':
      case 'courseOut':
        this.switchTo('player', e.car);
        this.holdTime = 3.2;
        break;
      case 'overtake':
      case 'battle':
        if (playerInvolved && this.mode !== 'player') {
          this.switchTo('player', null);
          this.holdTime = 5;
        }
        break;
      case 'finalLap':
        this.switchTo('leader');
        this.holdTime = 4;
        break;
      case 'finish':
        if (e.position === 1) {
          this.switchTo('leader');
          this.holdTime = 4;
        } else if (car.input.isPlayer) {
          this.switchTo('player', null);
          this.holdTime = 4;
        }
        break;
    }
  }

  private target(sim: RaceSim): RaceCar {
    if (this.focus !== null) return sim.cars[this.focus];
    if (this.mode === 'leader') return sim.order[0];
    return sim.cars.find((c) => c.input.isPlayer) ?? sim.order[0];
  }

  update(dt: number, sim: RaceSim): void {
    const portrait = this.aspect < 1;
    // 自動切り替え
    if (this.auto && sim.phase !== 'countdown') {
      this.holdTime -= dt;
      if (this.holdTime <= 0) {
        this.focus = null;
        const step = AUTO_CYCLE[this.cycleIndex % AUTO_CYCLE.length];
        this.cycleIndex++;
        this.switchTo(step.mode);
        this.holdTime = step.time;
      }
    }

    const fov = portrait ? 64 : 50;
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    const track = sim.track;
    if (sim.phase === 'countdown') {
      // スタート前: ゲートの少し先から、並んだ車を正面に映す
      const f = track.frameAt(portrait ? 10 : 7, 0, this.frame);
      this.tmpPos.set(f.x + Math.sin(f.heading) * 3, portrait ? 4.5 : 3, f.z + Math.cos(f.heading) * 3);
      const g = track.frameAt(-5.5, 0, this.frame);
      this.tmpLook.set(g.x, 0.6, g.z);
      this.apply(dt, 100);
      return;
    }

    if (this.mode === 'overhead') {
      // 俯瞰: 車の集団の真ん中を、少しだけ追いかける
      let cx = 0;
      let cz = 0;
      for (const c of sim.cars) {
        cx += c.x;
        cz += c.z;
      }
      cx /= sim.cars.length;
      cz /= sim.cars.length;
      this.tmpLook.set(cx * 0.7, 0, cz * 0.7);
      this.tmpPos.set(cx * 0.6, portrait ? 80 : 46, cz * 0.6 + (portrait ? 30 : 38));
      this.apply(dt, 2);
      return;
    }

    const car = this.target(sim);
    if (this.mode === 'leader' && this.focus === null) {
      // 先頭の少し前・斜めから、先頭と追いかける車を映す
      const f = track.frameAt(car.progress + (portrait ? 9 : 7.5), 0, this.frame);
      const side = 2.8;
      this.tmpPos.set(f.x + Math.sin(f.heading) * side, portrait ? 3.6 : 2.6, f.z + Math.cos(f.heading) * side);
      const b = track.frameAt(car.progress - 3, 0, this.frame);
      this.tmpLook.set((car.x + b.x) / 2, 0.8, (car.z + b.z) / 2);
      this.apply(dt, 5);
      return;
    }

    // 後ろから追いかける（向きはスピンの影響を受けないよう、コースの向きを使う）
    const f = track.frameAt(car.progress, car.d * 0.6, this.frame);
    const back = portrait ? 10 : 7.2;
    const height = portrait ? 4.6 : 3.4;
    this.tmpPos.set(f.x - Math.cos(f.heading) * back, height, f.z + Math.sin(f.heading) * back);
    this.tmpLook.set(car.x + Math.cos(f.heading) * 2, 0.9, car.z - Math.sin(f.heading) * 2);
    this.apply(dt, 4);
  }

  private apply(dt: number, rate: number): void {
    if (this.cut) {
      this.pos.copy(this.tmpPos);
      this.look.copy(this.tmpLook);
      this.cut = false;
    } else {
      const k = damp(rate, dt);
      this.pos.lerp(this.tmpPos, k);
      this.look.lerp(this.tmpLook, Math.min(1, k * 1.6));
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}
