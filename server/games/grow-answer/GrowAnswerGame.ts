import type { GameSettings } from '../../../shared/games';
import type { GrowEntry, GrowPhase, GrowTask, GrowView } from '../../../shared/games/views';
import { type GameAction, LIMITS } from '../../../shared/protocol';
import data from '../../data/grow-answer.json';
import { pick } from '../../utils/random';
import { cleanText } from '../../utils/text';
import { BaseGame } from '../BaseGame';
import { type GameContext, UserError } from '../types';

type StepKind = GrowTask['kind'];

const WRITE_TIME = 40_000;

/**
 * 各ステップの作業内容を決める（テスト対象）
 * - 最後が「文章」で終わるように、人数に応じてステップ数を調整する
 * - 同じ人が同じアルバムを2回触らないよう、ステップ数は人数以下
 */
export function planSteps(playerCount: number, mode: 'random' | 'custom'): StepKind[] {
  const n = playerCount;
  const steps: StepKind[] = [];
  if (mode === 'custom') {
    const total = n % 2 === 1 ? n : n - 1;
    steps.push('write');
    for (let i = 1; i < total; i++) steps.push(i % 2 === 1 ? 'draw' : 'describe');
  } else {
    // 3人のときは短くなりすぎないよう 絵→文→絵 の3ステップ
    const total = n % 2 === 0 || n === 3 ? n : n - 1;
    for (let i = 0; i < total; i++) steps.push(i % 2 === 0 ? 'draw' : 'describe');
  }
  return steps;
}

const PHASE_OF: Record<StepKind, GrowPhase> = { write: 'WRITE', draw: 'DRAW', describe: 'DESCRIBE' };

const IMAGE_SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'image/png': (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47,
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
};

/** data URL を検証してバイト列に変換する */
export function parseImageDataUrl(dataUrl: unknown): { mime: string; data: Buffer } {
  if (typeof dataUrl !== 'string') throw new UserError('画像が不正です');
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new UserError('画像形式が不正です');
  const mime = m[1];
  const data = Buffer.from(m[2], 'base64');
  if (data.length > LIMITS.imageBytes) throw new UserError('画像が大きすぎます');
  if (!IMAGE_SIGNATURES[mime]?.(data)) throw new UserError('画像形式が不正です');
  return { mime, data };
}

export class GrowAnswerGame extends BaseGame<GrowPhase> {
  readonly gameId = 'grow-answer' as const;

  private readonly steps: StepKind[];
  private readonly drawTime: number;
  private readonly describeTime: number;
  /** chains[i] は participants[i] から始まるアルバム */
  private readonly chains: GrowEntry[][];
  private step = -1;
  private submissions = new Map<string, GrowEntry>();
  private albumIndex = 0;

  constructor(ctx: GameContext, participants: string[], settings: GameSettings) {
    super(ctx, participants, settings);
    const mode = settings.promptMode === 'custom' ? 'custom' : 'random';
    this.steps = planSteps(participants.length, mode);
    this.totalRounds = this.steps.length;
    this.drawTime = Number(settings.drawTime) * 1000;
    this.describeTime = Number(settings.describeTime) * 1000;
    const prompts = mode === 'random' ? ctx.drawFromDeck('grow-answer', data.prompts, participants.length) : [];
    this.chains = participants.map((_, i) =>
      mode === 'random' ? [{ kind: 'prompt', playerId: null, text: prompts[i], imageUrl: null, empty: false }] : [],
    );
  }

  protected beginGame(): void {
    this.startStep(0);
  }

  private get kind(): StepKind | null {
    return this.steps[this.step] ?? null;
  }

  /** ステップ s でプレイヤーが担当するアルバム番号 */
  private chainIndexFor(playerId: string, step = this.step): number {
    const n = this.participants.length;
    const i = this.participants.indexOf(playerId);
    return (((i - step) % n) + n) % n;
  }

  private startStep(step: number): void {
    this.step = step;
    this.round = step + 1;
    this.submissions.clear();
    const kind = this.steps[step];
    const duration = kind === 'write' ? WRITE_TIME : kind === 'draw' ? this.drawTime : this.describeTime;
    this.setPhase(PHASE_OF[kind], { duration, grace: 2500, onEnd: () => this.finishStep() });
  }

  private finishStep(): void {
    const kind = this.kind!;
    this.participants.forEach((playerId) => {
      const chain = this.chains[this.chainIndexFor(playerId)];
      const submitted = this.submissions.get(playerId);
      if (submitted) {
        chain.push(submitted);
      } else if (kind === 'write') {
        // お題を書かなかった場合はランダムなお題で補う
        chain.push({ kind: 'prompt', playerId: null, text: pick(data.prompts), imageUrl: null, empty: false });
      } else {
        chain.push({ kind: kind === 'draw' ? 'drawing' : 'text', playerId, text: null, imageUrl: null, empty: true });
      }
    });
    if (this.step + 1 < this.steps.length) this.startStep(this.step + 1);
    else this.startAlbum();
  }

  private startAlbum(): void {
    this.albumIndex = 0;
    this.round = this.totalRounds;
    this.setPhase('ALBUM', { onEnd: () => this.endGame() });
  }

  /** 直前の空でないエントリ（前の人が時間切れでも続けられるように） */
  private sourceFor(playerId: string): GrowEntry | null {
    const chain = this.chains[this.chainIndexFor(playerId)];
    for (let i = chain.length - 1; i >= 0; i--) if (!chain[i].empty) return chain[i];
    return null;
  }

  protected onAction(playerId: string, action: GameAction, isHost: boolean): void {
    switch (action.type) {
      case 'submitText': {
        this.requirePhase('WRITE', 'DESCRIBE');
        this.requireActive(playerId);
        const text = cleanText(action.text, this.kind === 'write' ? LIMITS.promptLength : LIMITS.answerLength);
        if (!text) throw new UserError('文章を入力してください');
        this.submissions.set(playerId, {
          kind: this.kind === 'write' ? 'prompt' : 'text',
          playerId,
          text,
          imageUrl: null,
          empty: false,
        });
        this.checkComplete();
        return;
      }
      case 'submitDrawing': {
        this.requirePhase('DRAW');
        this.requireActive(playerId);
        const image = parseImageDataUrl(action.dataUrl);
        const imageUrl = this.ctx.storeImage(image.data, image.mime);
        this.submissions.set(playerId, { kind: 'drawing', playerId, text: null, imageUrl, empty: false });
        this.checkComplete();
        return;
      }
      case 'album': {
        this.requirePhase('ALBUM');
        if (!isHost) throw new UserError('ホストのみ操作できます');
        const index = Number(action.index);
        if (!Number.isInteger(index) || index < 0 || index >= this.chains.length) throw new UserError('不正な操作です');
        this.albumIndex = index;
        return;
      }
      default:
        throw new UserError('不明な操作です');
    }
  }

  protected checkComplete(): void {
    if (!['WRITE', 'DRAW', 'DESCRIBE'].includes(this.phase)) return;
    if (this.active.every((id) => this.submissions.has(id))) this.advance();
  }

  getView(playerId: string): GrowView {
    const working = ['WRITE', 'DRAW', 'DESCRIBE'].includes(this.phase);
    const participant = this.isActive(playerId);
    let task: GrowTask | null = null;
    if (working && participant && this.kind) {
      task = { kind: this.kind, source: this.kind === 'write' ? null : this.sourceFor(playerId) };
    }
    let albums: GrowView['albums'] = null;
    if (this.phase === 'ALBUM') {
      albums = this.chains.slice(0, this.albumIndex + 1).map((entries, i) => ({ ownerId: this.participants[i], entries }));
    } else if (this.phase === 'GAME_OVER') {
      albums = this.chains.map((entries, i) => ({ ownerId: this.participants[i], entries }));
    }
    return {
      ...this.baseView(playerId),
      gameId: 'grow-answer',
      phase: this.phase,
      step: Math.max(0, this.step),
      totalSteps: this.steps.length,
      task,
      submitted: working ? [...this.submissions.keys()] : [],
      mySubmitted: this.submissions.has(playerId),
      albums,
      albumIndex: this.albumIndex,
      albumCount: this.chains.length,
    };
  }
}
