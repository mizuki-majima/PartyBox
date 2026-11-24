/**
 * 懇親会の設定（クイズの問題・名簿・景品）の読み込み
 *
 * 名簿には実名と所属が入るため、本番のデータはこのリポジトリに置かない。
 * サーバー上の置き場（既定 /opt/partybox/event-data、環境変数 PARTYBOX_EVENT_DATA_DIR で変更）
 * から読み、無ければ同梱のサンプル（server/event/sample）で動く。
 *
 * 置き場に入れるファイル:
 *   quiz.json / bingo.json / seats.json
 * 形式は party-app-aws の data/*.json と同じなので、そのまま持ってこられる。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
// サンプルはバンドルに取り込む（本番のデータが未設置でも必ず動くように）
import bingoSample from './sample/bingo.json';
import quizSample from './sample/quiz.json';
import seatsSample from './sample/seats.json';

const SAMPLES: Record<string, unknown> = {
  'quiz.json': quizSample,
  'bingo.json': bingoSample,
  'seats.json': seatsSample,
};
const DEFAULT_DIR = '/opt/partybox/event-data';

const nonEmpty = (max: number) => z.string().trim().min(1).max(max);

const QuizQuestion = z
  .object({
    question: nonEmpty(300),
    /** 選択肢があれば選択問題。無ければ自由回答で、司会が ○ を付ける */
    choices: z.array(nonEmpty(120)).min(2).max(6).optional(),
    /**
     * 選択問題なら選択肢の番号（**1 始まり**。party-app-aws の quiz.json と同じ）、自由回答なら答えの文章。
     * 読み込んだあとは、選択問題の番号を 0 始まりに直して持つ（画面と採点は 0 始まり）
     */
    answer: z.union([z.number().int(), nonEmpty(300)]),
    note: z.string().max(500).optional(),
  })
  .superRefine((q, ctx) => {
    if (!q.choices) return;
    if (typeof q.answer !== 'number' || q.answer < 1 || q.answer > q.choices.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['answer'],
        message: `選択問題の answer は選択肢の番号（1〜${q.choices.length}。1 始まり）で書いてください`,
      });
    }
  })
  .transform((q) => {
    if (q.choices) return { ...q, answer: (q.answer as number) - 1 };
    // 自由回答に数字だけ書いてあっても、答えの文章として扱う
    return { ...q, answer: String(q.answer) };
  });

const QuizConfig = z.object({
  title: nonEmpty(60).default('クイズ'),
  secondsPerQuestion: z.number().int().min(0).max(600).default(30),
  teams: z.array(nonEmpty(40)).min(1).max(20),
  questions: z.array(QuizQuestion).max(100),
});

const BingoConfig = z.object({
  title: nonEmpty(60).default('ビンゴ'),
  /** カードを作り直すための種。当日は変えないこと（変えると配ったカードが別物になる） */
  seed: nonEmpty(120).default('party'),
  winnersCount: z.number().int().min(0).max(100).default(0),
  prizes: z.array(nonEmpty(120)).max(100).default([]),
});

const SeatsParticipant = z.union([
  nonEmpty(40),
  z.object({ name: nonEmpty(40), group: z.string().trim().max(40).default('') }),
]);

const SeatsConfig = z.object({
  title: nonEmpty(60).default('座席決め'),
  participants: z.array(SeatsParticipant).max(500),
  tables: z.array(z.object({ name: z.string().trim().max(40).default(''), seats: z.number().int().min(0).max(100) })).max(50),
  /** sequential なら前のテーブルから単純に埋める。既定は所属が混ざるように入れる */
  fillOrder: z.string().optional(),
});

export type QuizConfig = z.infer<typeof QuizConfig>;
export type BingoConfig = z.infer<typeof BingoConfig>;
export type SeatsConfig = z.infer<typeof SeatsConfig>;

export interface EventConfig {
  quiz: QuizConfig;
  bingo: BingoConfig;
  seats: SeatsConfig;
  /** 実際に読めた置き場（ログと司会画面の確認用） */
  source: string;
}

/** 名簿の人。id は設定の名簿が p1…、当日その場で足した人が x… */
export interface RosterPerson {
  id: string;
  name: string;
  group: string;
}

export function rosterFromConfig(cfg: SeatsConfig): RosterPerson[] {
  return cfg.participants.map((p, i) => ({
    id: `p${i + 1}`,
    name: typeof p === 'string' ? p : p.name,
    group: typeof p === 'string' ? '' : p.group,
  }));
}

function readJson(dir: string, name: string): unknown | null {
  try {
    return JSON.parse(readFileSync(join(dir, name), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * 1ファイル読む。置き場に無ければサンプルを使う。
 * 置き場にあるのに形式が違う場合は、黙ってサンプルに落とさず例外にする
 * （当日「なぜかサンプルの問題が出た」を防ぐ）。
 */
function load<T>(schema: z.ZodType<T>, dir: string, name: string): { value: T; fromDir: boolean } {
  const raw = readJson(dir, name);
  if (raw !== null) {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`${join(dir, name)} の形式が正しくありません: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' / ')}`);
    }
    return { value: parsed.data, fromDir: true };
  }
  return { value: schema.parse(SAMPLES[name]), fromDir: false };
}

let cached: EventConfig | null = null;

export function loadEventConfig(): EventConfig {
  const dir = process.env.PARTYBOX_EVENT_DATA_DIR ?? DEFAULT_DIR;
  const quiz = load(QuizConfig, dir, 'quiz.json');
  const bingo = load(BingoConfig, dir, 'bingo.json');
  const seats = load(SeatsConfig, dir, 'seats.json');
  const fromDir = [quiz, bingo, seats].filter((x) => x.fromDir).length;
  return {
    quiz: quiz.value,
    bingo: bingo.value,
    seats: seats.value,
    source: fromDir === 3 ? dir : fromDir === 0 ? 'サンプル（本番のデータが未設置）' : `${dir}（${3 - fromDir} 件はサンプル）`,
  };
}

/** ルーム作成時に使う。一度読んだら使い回す */
export function getEventConfig(): EventConfig {
  if (!cached) cached = loadEventConfig();
  return cached;
}

/** データを差し替えたあとに読み直す */
export function reloadEventConfig(): EventConfig {
  cached = null;
  return getEventConfig();
}
