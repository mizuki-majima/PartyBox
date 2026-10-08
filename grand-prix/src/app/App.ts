import type { CarBlueprint } from '../blueprint/types';
import type { RaceResult } from '../race/RaceSim';
import { sfx } from '../audio/Sfx';
import { Stage } from '../engine/Stage';
import { createCarGenerator, type CarGenerator } from '../generator';
import { h } from '../ui/dom';

/**
 * 画面の並び。ここに ID を差し込めば、画面を増やせる。
 * 例: 勝敗予想を入れるなら ['title', 'build', 'rivals', 'predict', 'race', 'result'] とし、
 *     'predict' の画面を register するだけでよい（各画面は app.next() で次へ進む）。
 */
export const FLOW = ['title', 'build', 'rivals', 'race', 'result'] as const;
export type ScreenId = (typeof FLOW)[number] | (string & {});

/** 1 レースぶんの記録（リザルト画面で使う） */
export interface RaceRecord {
  result: RaceResult;
  /** result.entries[].index と同じ並び */
  blueprints: CarBlueprint[];
}

/** 画面をまたいで持ち回る状態 */
export interface GameState {
  player: CarBlueprint | null;
  rivals: CarBlueprint[];
  /** 最後のレース結果（リザルト画面で使う） */
  lastResult: RaceRecord | null;
  /** 同じ顔ぶれで何回走ったか（「もう一回」で増える） */
  raceCount: number;
}

export interface Screen {
  mount(root: HTMLElement): void;
  unmount(): void;
}

export type ScreenFactory = (app: App) => Screen;

export class App {
  readonly stage: Stage;
  readonly generator: CarGenerator;
  readonly state: GameState = { player: null, rivals: [], lastResult: null, raceCount: 0 };
  /** 3D を描く全画面の置き場（画面によってはプレビュー枠へ付け替える） */
  readonly stageHost: HTMLElement;
  /** 画面ごとの UI を入れる場所 */
  readonly uiRoot: HTMLElement;
  private readonly screens = new Map<string, ScreenFactory>();
  private current: { id: string; screen: Screen } | null = null;

  constructor(root: HTMLElement) {
    this.generator = createCarGenerator();
    this.stageHost = h('div', { class: 'stage-host' });
    this.uiRoot = h('div', { class: 'ui-root' });
    const soundBtn = h('button', {
      class: 'sound-btn',
      attrs: { type: 'button' },
      on: { click: () => sfx.setMuted(!sfx.muted) },
    });
    const syncSound = (muted: boolean) => {
      soundBtn.textContent = muted ? '🔇' : '🔊';
      soundBtn.setAttribute('aria-label', muted ? '音を出す' : '音を消す');
      soundBtn.setAttribute('aria-pressed', String(!muted));
    };
    syncSound(sfx.muted);
    sfx.onMuteChange(syncSound);
    root.append(this.stageHost, this.uiRoot, h('div', { class: 'demo-badge', text: this.generator.label }), soundBtn);
    // ブラウザは最初の操作があるまで音を出せないので、その時に音の準備をする
    const unlock = () => sfx.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.stage = new Stage();
    this.stage.attach(this.stageHost);
  }

  register(id: ScreenId, factory: ScreenFactory): this {
    this.screens.set(id, factory);
    return this;
  }

  get currentId(): string | null {
    return this.current?.id ?? null;
  }

  goto(id: ScreenId): void {
    const factory = this.screens.get(id);
    if (!factory) throw new Error(`screen "${id}" is not registered`);
    if (this.current) {
      this.current.screen.unmount();
      this.uiRoot.replaceChildren();
    }
    // 画面が切り替わるたびに canvas は全画面へ戻す（プレビュー枠を使う画面は mount で付け替える）
    this.stage.attach(this.stageHost);
    this.stage.setView(null);
    const screen = factory(this);
    this.current = { id, screen };
    this.uiRoot.dataset.screen = id;
    screen.mount(this.uiRoot);
  }

  /** FLOW の順で次の画面へ（まだ登録されていない画面は飛ばす） */
  next(): void {
    const order = FLOW as readonly string[];
    let i = this.current ? order.indexOf(this.current.id) : -1;
    do {
      i = (i + 1) % order.length;
    } while (!this.screens.has(order[i]));
    this.goto(order[i]);
  }
}
