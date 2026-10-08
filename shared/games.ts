/**
 * ゲームカタログ（クライアント・サーバー共通）
 *
 * 新しいゲームを追加するときは、ここにメタ情報を1件追加するだけで
 * ランディングページのカード・ルーム画面の設定UI・人数チェックに反映されます。
 * （ゲーム本体は server/games/registry.ts と client/games/registry.tsx に登録）
 */

export type GameId = 'whose-answer' | 'unanimous' | 'liar' | 'grow-answer' | 'ten-sec-trial';

export interface SettingOption {
  value: number | string;
  label: string;
}

export interface GameSettingDef {
  key: string;
  label: string;
  options: SettingOption[];
  default: number | string;
  description?: string;
}

export interface GameMeta {
  id: GameId;
  title: string;
  /** カード上部の一言キャッチ */
  tagline: string;
  description: string;
  emoji: string;
  category: string;
  minPlayers: number;
  maxPlayers: number;
  estimatedTime: string;
  /** カードのグラデーション色 */
  theme: { from: string; to: string };
  /** 遊び方（ルーム画面に表示） */
  howToPlay: string[];
  settings: GameSettingDef[];
}

export type GameSettings = Record<string, number | string>;

const sec = (n: number): SettingOption => ({ value: n, label: `${n}秒` });
const times = (n: number, unit = 'ラウンド'): SettingOption => ({ value: n, label: `${n}${unit}` });

export const GAMES: GameMeta[] = [
  {
    id: 'whose-answer',
    title: '誰の答えでしょう？',
    tagline: 'その答え、書いたのは誰？',
    description: '同じ質問に全員が匿名で回答。並んだ答えを見て「これを書いたのは誰か」を当て合う心理戦。',
    emoji: '🕵️',
    category: '心理戦',
    minPlayers: 3,
    maxPlayers: 8,
    estimatedTime: '約10分',
    theme: { from: '#8b5cf6', to: '#ec4899' },
    howToPlay: [
      '全員に同じ質問が出ます。思いついた答えを匿名で書きましょう。',
      '集まった答えを見て「この答えは誰？」を推理して割り当てます（自分の答えは選べません）。',
      '当てたら +2点。自分の答えを当てられると 1人につき −1点。誰にもバレなければ +1点。',
    ],
    settings: [
      { key: 'rounds', label: 'ラウンド数', options: [times(2), times(3), times(5)], default: 3 },
      { key: 'answerTime', label: '回答時間', options: [sec(30), sec(45), sec(60), sec(90)], default: 60 },
      { key: 'guessTime', label: '推理時間', options: [sec(45), sec(60), sec(90), sec(120)], default: 90 },
    ],
  },
  {
    id: 'unanimous',
    title: '全員一致を目指せ！',
    tagline: 'みんなと同じ答えを書け！',
    description: 'お題に対して「みんなが書きそうな答え」を予想する協力ゲーム。答えが揃うほどチーム得点アップ。',
    emoji: '🤝',
    category: '協力',
    minPlayers: 3,
    maxPlayers: 10,
    estimatedTime: '約5分',
    theme: { from: '#06b6d4', to: '#3b82f6' },
    howToPlay: [
      '全員に同じお題が出ます。みんなが書きそうな答えを予想して入力しましょう。',
      '回答は全員が送信するまで見えません。',
      '同じ答えの人数でチーム得点：2人 → 1点、3人 → 3点、4人 → 5点…全員一致 → 10点！',
      'ひらがな・カタカナ・全角半角の違いは自動でまとめます。表記ゆれはホストが手動でまとめられます。',
    ],
    settings: [
      { key: 'rounds', label: 'ラウンド数', options: [times(3), times(5), times(7), times(10)], default: 5 },
      { key: 'answerTime', label: '回答時間', options: [sec(20), sec(30), sec(45), sec(60)], default: 30 },
    ],
  },
  {
    id: 'liar',
    title: '嘘つきは誰だ？',
    tagline: '1人だけお題を知らない',
    description: '1人だけ「嘘つき」が紛れ込む正体隠匿ゲーム。順番にお題について答え、話し合いで嘘つきを暴け！',
    emoji: '🎭',
    category: '正体隠匿',
    minPlayers: 4,
    maxPlayers: 8,
    estimatedTime: '約10分',
    theme: { from: '#f43f5e', to: '#f97316' },
    howToPlay: [
      '全員に同じお題が配られますが、1人だけ「嘘つき」にはお題が届きません。',
      '順番にお題への答えを発表します（通話で話す or 入力）。嘘つきはバレないように話を合わせましょう。',
      '話し合って「嘘つきだと思う人」に投票。最多票が嘘つきなら市民の勝ち！',
      '見破られた嘘つきは、本当のお題を当てれば逆転ボーナス。',
    ],
    settings: [
      { key: 'rounds', label: 'ラウンド数', options: [times(2), times(3), times(5)], default: 3 },
      { key: 'talkTime', label: '1人の発言時間', options: [sec(15), sec(20), sec(30)], default: 20 },
      { key: 'voteTime', label: '話し合い・投票時間', options: [sec(60), sec(90), sec(120), sec(180)], default: 90 },
      {
        key: 'mode',
        label: 'モード',
        options: [
          { value: 'secret', label: '嘘つきはお題を知らない' },
          { value: 'wordwolf', label: 'ワードウルフ（嘘つきは別のお題）' },
        ],
        default: 'secret',
        description: 'ワードウルフでは嘘つき本人も自分が嘘つきだと気づきません。',
      },
    ],
  },
  {
    id: 'grow-answer',
    title: '回答を育てろ',
    tagline: '絵と言葉で伝言ゲーム',
    description: 'お題を絵にして、その絵を言葉にして、また絵に…。最初と最後でどれだけ変わるかを楽しむお絵描き伝言ゲーム。',
    emoji: '🎨',
    category: 'お絵描き',
    minPlayers: 3,
    maxPlayers: 8,
    estimatedTime: '約10分',
    theme: { from: '#22c55e', to: '#eab308' },
    howToPlay: [
      '最初のお題を見て、制限時間内に絵を描きます。',
      '絵は次の人に渡ります。次の人はその絵が何かを文章で説明します。',
      'その文章をまた次の人が絵にして…と交互に繰り返します。',
      '最後にアルバムを公開！お題がどう「育った」かをみんなで見ましょう。',
    ],
    settings: [
      {
        key: 'promptMode',
        label: '最初のお題',
        options: [
          { value: 'random', label: 'ランダムに配る' },
          { value: 'custom', label: '各自が書く' },
        ],
        default: 'random',
      },
      { key: 'drawTime', label: 'お絵描き時間', options: [sec(60), sec(90), sec(120)], default: 90 },
      { key: 'describeTime', label: '説明時間', options: [sec(30), sec(45), sec(60)], default: 45 },
    ],
  },
  {
    id: 'ten-sec-trial',
    title: '10秒裁判',
    tagline: '有罪か無罪か、10秒で語れ',
    description: '事件の被告・検察・弁護士・証人になりきって、手元の証拠をもとに10秒ずつ発言。最後は全員で判決！',
    emoji: '⚖️',
    category: '会話',
    minPlayers: 4,
    maxPlayers: 8,
    estimatedTime: '約10分',
    theme: { from: '#f59e0b', to: '#b45309' },
    howToPlay: [
      '毎ラウンド事件が起き、被告・検察・弁護士・証人の役がランダムに配られます。',
      '各自に異なる証拠カードが届きます。被告だけは「本当にやったかどうか」を知っています。',
      '検察 → 証人 → 弁護士 → 被告の順に10秒ずつ発言します。',
      '被告以外の全員で「有罪／無罪」を投票。真実を見抜けたら得点！',
    ],
    settings: [
      { key: 'rounds', label: 'ラウンド数', options: [times(2, '件'), times(3, '件'), times(4, '件'), times(5, '件')], default: 3 },
      { key: 'speakTime', label: '1人の発言時間', options: [sec(10), sec(15), sec(20)], default: 10 },
      { key: 'voteTime', label: '投票時間', options: [sec(20), sec(30), sec(45)], default: 30 },
    ],
  },
];

/**
 * ルームを作らずに1人で遊ぶゲーム。SPA とは別のページで動くので、トップページのカードから通常のリンクで開く。
 * （ルームのゲームではないため GAMES には入れない。サーバーの人数チェックやゲーム変更の対象外）
 */
export interface SoloGameMeta {
  id: string;
  title: string;
  tagline: string;
  description: string;
  emoji: string;
  category: string;
  /** カードに出す人数の表記 */
  players: string;
  estimatedTime: string;
  theme: { from: string; to: string };
  /** 遊ぶページの URL */
  href: string;
}

export const SOLO_GAMES: SoloGameMeta[] = [
  {
    id: 'prompt-grand-prix',
    title: 'プロンプト・グランプリ',
    tagline: 'ことばで作ったミニカーが走る',
    description: '「こんな車」と書くだけで、その通りのミニカーが3Dで誕生。CPUの車とおもちゃのサーキットでレースし、応援しながら観戦！',
    emoji: '🏎️',
    category: 'ひとりで・レース',
    players: '1人',
    estimatedTime: '約2分',
    theme: { from: '#3fa7ff', to: '#ff5a5a' },
    href: '/grand-prix/',
  },
];

export function getGameMeta(id: string): GameMeta | undefined {
  return GAMES.find((g) => g.id === id);
}

export function isGameId(id: unknown): id is GameId {
  return typeof id === 'string' && GAMES.some((g) => g.id === id);
}

export function defaultSettings(meta: GameMeta): GameSettings {
  return Object.fromEntries(meta.settings.map((s) => [s.key, s.default]));
}

/** 入力された設定値を、定義済みの選択肢に含まれるものだけに絞り込む（サーバー側検証にも使用） */
export function sanitizeSettings(meta: GameMeta, input: unknown, base?: GameSettings): GameSettings {
  const result = { ...defaultSettings(meta), ...(base ?? {}) };
  if (!input || typeof input !== 'object') return result;
  for (const def of meta.settings) {
    const value = (input as Record<string, unknown>)[def.key];
    if (value === undefined) continue;
    if (def.options.some((o) => o.value === value)) result[def.key] = value as number | string;
  }
  return result;
}
