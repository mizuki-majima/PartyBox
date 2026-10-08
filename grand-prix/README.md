# プロンプト・グランプリ 🏁

話し言葉で「こんな車」と書くと、その通りのミニカーが 3D で生まれ、
おもちゃのサーキットで CPU の車とレースする。プレイヤーは運転せず、応援しながら観戦するブラウザゲームです。

**PartyBox の 1 人用ゲーム** として、PartyBox と同じサーバー・同じ URL で動きます（トップページのカード → `/grand-prix/`）。
元は単独のリポジトリ（mizuki-majima/prompt-grand-prix）で、履歴ごとこのディレクトリに取り込んでいます。

![タイトル画面](../public/grand-prix/og.png)

- 「かっこいい車」「ヒラぺったい車」「江戸時代にあるような車」「カレーの匂いがしそうな車」…なんでも OK
- 書いた内容が **見た目** と **性能** の両方に出る
- 見た目はチョロQ風の、丸っこくてかわいいミニカー
- 1 レースはおもちゃサーキット 3 周・約 1 分強。実況テロップ付きで観戦できる

> いまは **デモ版** です。車は API を使わない `MockCarGenerator`（キーワード辞書＋ハッシュ乱数）で作っています。
> Claude による AI 生成は、あとから差し替えられるようにしてあります（[AI 生成の組み込み方](#ai-生成の組み込み方)）。

---

## 遊び方

1. **タイトル** → 「あそぶ」（左上の「← PartyBox」で PartyBox のトップへ戻れます）
2. **車づくり**: どんな車がいいか自由に書いて「この言葉で車をつくる」（入力例のボタンもあります）
   - 1〜2 秒の「生成中…」のあと、くるくる回るプレビュー・名前・性能・性格・ひとことが出ます
   - 同じ文なら何度作っても同じ車。言葉を変えれば作り直せます
3. **ライバル紹介**: CPU の車 3 台を 1 台ずつ紹介 → 出走メンバー 4 台がそろう
4. **レース観戦**: 3 周を自動で走ります
   - 実況テロップ（追い抜き・スピン・最終コーナーの追い上げ…）
   - カメラは「自動／自車／先頭／俯瞰」をボタンで切り替え（自動ではハプニングや自車のバトルに寄ります）
   - 画面左に順位、上に周回とタイム。自分の車には頭の上に赤い目印
5. **リザルト**: 表彰台・順位・タイム・ハイライト。「もう一回」（同じ顔ぶれで再戦）か「車を作り直す」。下のリンクから PartyBox のほかのゲームへ

右下のボタンで効果音のオン／オフができます。

### 性能（合計はいつも 24）

| 項目 | 表示 | レースでの効き目 |
|---|---|---|
| speed | スピード | 最高速度 |
| acceleration | かそく | 加速の速さ（スタートやコーナーの立ち上がり） |
| handling | まがる | カーブでの減速の少なさ |
| stability | あんてい | スピン・コースアウトの起きにくさ |

各 1〜10 で、**合計はちょうど 24** に揃えます。「最強の車」と書いても全部 10 にはならず、得意・不得意の配分が変わるだけです。
調子・スタートの反応・周ごとのゆらぎ・スリップストリーム・最終周の「本気モード」などのランダム要素があり、
弱い車にも勝つチャンスがあります（何百レースを回すテストで勝率の偏りを確認しています）。

---

## ローカルでの起動

PartyBox のリポジトリのルートで動かします（このディレクトリ専用の `package.json` はありません）。

```bash
npm install
npm run dev        # http://localhost:5173/grand-prix/ で開発サーバー（PartyBox のトップは http://localhost:5173/）
```

| コマンド（ルートで実行） | 内容 |
|---|---|
| `npm run dev` | 開発サーバー（ホットリロード） |
| `npm test` | ユニットテスト（PartyBox のテストと一緒に、設計図の検証・生成器・レースのバランス・実況も回る） |
| `npm run typecheck` | 型チェック |
| `npm run build` / `npm start` | 本番ビルド（`dist/client/grand-prix/`）と起動（http://localhost:3001/grand-prix/） |
| `npm run test:e2e` | トップのカードから車づくり → レース開始 → PartyBox に戻るまでをブラウザで確認（`e2e/grand-prix.spec.ts`） |

### 開発用の URL パラメータ（`npm run dev` のときだけ有効）

| パラメータ | 内容 |
|---|---|
| `/grand-prix/?gallery` | 手書きの設計図サンプルを並べて表示（`?gallery=0` で 1 台だけ） |
| `/grand-prix/?gen=かっこいい車\|江戸の車` | 生成結果を並べて表示（`\|` 区切り） |
| `/grand-prix/?speed=8` | ゲーム全体を早送り |
| `/grand-prix/?laps=1` | 1 周だけのレース（ゴール演出の確認用） |

---

## 配信のしくみ（PartyBox との統合）

- Vite のマルチページビルドで、PartyBox の `index.html` と `grand-prix/index.html` を一緒にビルドする（ルートの `vite.config.ts`）
  - three.js は `three-*.js` という別ファイルになり、PartyBox のページでは読み込まれない
  - 本番ビルドのこのページにだけ Content-Security-Policy を `<meta>` で入れる
- PartyBox のサーバー（`server/app.ts`）が `/grand-prix/` でこのページを返す。`/grand-prix` などは `/grand-prix/` に転送する
  - このページには、単独で公開していたとき（`vercel.json`）と同じ `X-Frame-Options` などのヘッダーを付ける（`/grand-prix/index.html` も `/grand-prix/` へ転送）
- 画像（`og.png`・`favicon.svg`）は `public/grand-prix/` にある
- デプロイは PartyBox と同じ（ルートの README「デプロイ」）。GitHub Pages / Vercel 用の設定はこのリポジトリには持ち込んでいない
  - 元のリポジトリから公開していた GitHub Pages（`https://mizuki-majima.github.io/prompt-grand-prix/`）は、このリポジトリの変更では止まらない。PartyBox の公開 URL が決まったら、元のリポジトリ側で PartyBox の `/grand-prix/` へ転送するか公開をやめる

### 公開前のチェック

- `index.html` の `og:image` はサイト内の絶対パス（`/grand-prix/og.png`）です。公開 URL が決まったら `https://…/grand-prix/og.png` にすると SNS でのプレビューが確実になります
- 外部の API を呼ぶようにしたら、ルートの `vite.config.ts` の CSP の `connect-src` に追加してください（同じサーバーの `/api` なら不要）

---

## しくみ

### 設計図 JSON（CarBlueprint）

車は「基本図形の組み合わせ」を並べた JSON で表します。牛車や屋台、UFO のような、車の形をしていない乗り物も作れます。

```json
{
  "name": "お江戸号",
  "concept": "牛車をモチーフにした雅な一台",
  "parts": [
    { "shape": "box", "size": [1.2, 0.8, 0.9], "position": [0, 0.6, 0], "color": "#5d4037", "role": "body", "material": "wood" },
    { "shape": "cylinder", "size": [0.5, 0.08], "position": [0.3, 0.5, 0.5], "rotation": [90, 0, 0], "color": "#3e2723", "role": "wheel" }
  ],
  "wheelStyle": "wooden",
  "stats": { "speed": 3, "acceleration": 4, "handling": 7, "stability": 10 },
  "personality": "のんびり屋。でも最後まで諦めない",
  "catchphrase": "急がば回れでござる"
}
```

- 形: `box` / `cylinder` / `sphere` / `cone` / `torus` / `capsule`（`size` の意味は形ごと。`src/blueprint/types.ts` に説明あり）
- `role: "wheel"` のパーツは走行中に車軸まわりで回転。車輪が無く `wheelStyle: "none"` なら宙に浮いて走る
- パーツは最大 30 個。組み立て時に全体の大きさを決まった範囲に収め直す
- `normalizeBlueprint()`（`src/blueprint/schema.ts`）がどんな入力も検証・補正し、**必ず走れる車** にする
  （不正な形 → box、色が読めない → 役割ごとの標準色、車輪が無い → 4 輪を追加、stats → 各 1〜10・合計 24、文字列 → 制御文字除去と長さ制限）
- 純粋な JSON なので `encodeBlueprint()` / `decodeBlueprint()`（`src/blueprint/serialize.ts`）で URL に載せられる形にできる

### MockCarGenerator（いまの生成器）

`src/generator/`

1. 入力文をならす（全角→半角、カタカナ→ひらがな）。辞書側も同じ処理をするので「カッコイイ」「かっこいい」「格好いい」が同じ扱い
2. キーワード辞書（`dictionary.ts`）で特徴を拾う。長い言葉から順に照合し、使った文字は再利用しない（「面白い」の「白」を色にしない）
   - 例: かっこいい → シャープなスポーツカー＋スポイラー / ひらぺったい → 低く・幅広く / 江戸・昔 → 牛車＋木目 / かわいい → 丸く・パステル＋目 / カレー → 屋台＋鍋＋カレー色
   - 色の名前（赤・あお・ゴールド…）も拾う
3. 13 種類の「形の型」（ミニカー、スポーツカー、F1、軽トラ、ワゴン、牛車、屋台、UFO、ロケット、どうぶつ、ケーキ、船、新幹線）に寸法補正・配色・飾り（20 種類以上）を足して組み立てる
4. 辞書に無い部分は、**入力文のハッシュ値を種にした乱数** で決める。だから同じ文なら必ず同じ車
5. 名前・コンセプト・性格・口ぐせも辞書と型から作る。辞書に無い単語は「宇宙人号」「プニプニ号」のように名前に使う

### レース

`src/race/RaceSim.ts` は描画と独立した純粋なシミュレーションです。

- コースの曲率から「ここではこれ以上出すとはみ出す」速度を求め、ブレーキ距離を考えた速度プロファイルに沿って加減速
- 車はコース中心線に沿った距離と横ずれで動く（追い越し・イン側のライン取り・押し合い）
- 固定ステップ（1/60 秒）で進むのでフレームレートに左右されず、テストでは何百レースを一瞬で回せる
- 追い抜き・首位交代・スピン・コースアウト・スリップストリーム・接戦・ファステストラップなどをイベントとして出し、
  実況（`Commentary.ts`）・カメラ（`CameraDirector.ts`）・効果音・ハイライトがそれを使う

### 軽さのための工夫

- WebGL のレンダラーはアプリ全体で 1 つ。画面ごとに canvas を付け替える
- 車の動かないパーツは材質ごとに 1 つのメッシュへまとめる（30 パーツでも描画は数回）
- 木・積み木・観客・煙・紙吹雪などはインスタンス化／2D canvas
- 影の範囲をカメラの見ている場所に合わせて狭め、くっきり＆軽く
- 重い端末では描画解像度を自動で下げる
- 効果音は WebAudio で合成（音声ファイル無し）

### セキュリティ

- 入力文や生成された名前・口ぐせは `textContent` でのみ表示し、HTML として解釈しない（`src/ui/dom.ts`）
- 設計図は必ず `normalizeBlueprint()` を通す（URL 共有や AI 出力が壊れていても安全に車になる）
- 本番は CSP で外部スクリプトを禁止

### ディレクトリ構成

`grand-prix/` の中:

```
index.html              このゲームのページ（/grand-prix/）
src/
  app/App.ts            画面遷移（FLOW）と共有状態
  screens/              タイトル・車づくり・ライバル紹介・レース・リザルト
  blueprint/            設計図の型・検証と補正・シリアライズ・手書きサンプル
  generator/            CarGenerator インターフェースと MockCarGenerator（辞書・型・飾り・配色）
  car/                  設計図 → 3D の車（CarModel）、ショールーム
  race/                 シミュレーション、実況、カメラ、ハイライト、レースの 3D 表示
  track/                コースの形（TrackData）と見た目（TrackView）
  engine/               レンダラー（Stage）、環境光、パーティクル、テクスチャ
  ui/                   DOM ヘルパー、HUD、テロップ、ゴール演出
  audio/Sfx.ts          効果音
prompts/car-designer.md LLM 用システムプロンプトの下書き
tests/                  ユニットテスト（ルートの npm test で実行）
```

---

## AI 生成の組み込み方

いまの構造のまま、Claude で車を生成するように差し替えられます。
**API キーをブラウザに置かないため、必ずサーバーを経由します。** PartyBox に統合したので、PartyBox の Express サーバーに API を足すだけで済みます（同じオリジンなので CSP の変更も不要）。

### 1. サーバーの API（`server/app.ts` に `POST /api/generate-car` を追加）

```bash
npm install @anthropic-ai/sdk
# サーバーの環境変数に ANTHROPIC_API_KEY を設定する（コードやリポジトリには書かない）
```

```ts
// server/app.ts（import はファイルの先頭へ。ルートは startPartyServer の中、SPA の配信より前に置く）
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';

const client = new Anthropic(); // ANTHROPIC_API_KEY を環境変数から読む
const SYSTEM = readFileSync(path.resolve(process.cwd(), 'grand-prix/prompts/car-designer.md'), 'utf8');

app.post('/api/generate-car', express.json({ limit: '4kb' }), async (req, res) => {
  const prompt = (req.body as { prompt?: unknown } | undefined)?.prompt;
  if (typeof prompt !== 'string' || prompt.trim() === '' || prompt.length > 60) {
    res.status(400).json({ error: 'invalid prompt' });
    return;
  }
  // ここで回数制限をチェックする（下の「API 料金の対策」参照）

  try {
    const response = await client.beta.messages.create({
      model: process.env.CLAUDE_MODEL ?? 'claude-opus-5-5',
      max_tokens: 8000,
      output_config: { effort: 'low' }, // 待ち時間とコストを抑える。質を上げたければ 'medium'
      // 安全上の理由で断られたときに、同じリクエストを別モデルで自動再実行する
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });
    if (response.stop_reason === 'refusal') {
      res.status(422).json({ error: 'refused' });
      return;
    }
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    // JSON 部分だけ取り出して返す（検証と補正はフロントの normalizeBlueprint が必ず行う）
    res.type('application/json').send(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return void res.status(429).json({ error: 'busy' });
    if (err instanceof Anthropic.APIError) return void res.status(502).json({ error: 'upstream' });
    throw err;
  }
});
```

- システムプロンプトは `grand-prix/prompts/car-designer.md` の下書きをそのまま使えます（スキーマ・ルール・出力例入り）
  - Docker の実行用イメージには `dist` しか入らないので、`Dockerfile` の 2 段目に `COPY --from=build /app/grand-prix/prompts ./grand-prix/prompts` を足す
- モデルは `CLAUDE_MODEL` 環境変数で切り替えられます。品質・速さ・料金のバランスを見て選んでください
- 出力がルールから外れても、フロントの `normalizeBlueprint()` が必ず走れる車に直します
- 開発中は Vite が `/api` を PartyBox のサーバーへ中継するので、`npm run dev` のままで試せます

### 2. フロント側の生成器（`grand-prix/src/generator/ClaudeCarGenerator.ts`）

```ts
import { normalizeBlueprint } from '../blueprint/schema';
import type { CarBlueprint } from '../blueprint/types';
import type { CarGenerator, GenerateOptions } from './CarGenerator';
import { designCar } from './MockCarGenerator';

export class ClaudeCarGenerator implements CarGenerator {
  readonly label = 'AI 生成（Claude）';
  constructor(private readonly endpoint = '/api/generate-car') {}

  async generate(prompt: string, options: GenerateOptions = {}): Promise<CarBlueprint> {
    options.onProgress?.('AI が車をデザイン中…');
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: options.signal ?? AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { blueprint } = normalizeBlueprint({ ...(await res.json()), prompt });
      return blueprint;
    } catch (err) {
      if ((err as Error).name === 'AbortError' && options.signal?.aborted) throw err;
      // 失敗しても止めない: デモ版の生成器で必ず車を出す
      return designCar(prompt);
    }
  }
}
```

### 3. 切り替え（`grand-prix/src/generator/index.ts`）

```ts
export function createCarGenerator(): CarGenerator {
  if (import.meta.env.VITE_USE_AI === '1') return new ClaudeCarGenerator();
  return new MockCarGenerator();
}
```

ビルド時に `VITE_USE_AI=1` を渡せば AI 版、渡さなければデモ版になります（Docker なら `Dockerfile` の 1 段目に `ARG VITE_USE_AI` を足し、`docker build --build-arg VITE_USE_AI=1`）。
画面の「デモ版」表示は `generator.label` から出しているので自動で切り替わります。
ライバルの車（`grand-prix/src/generator/rivals.ts`）は、API 料金を抑えるためデモ版のままにしておくのがおすすめです。

### API 料金の対策（一般公開するとき）

- **回数制限**: IP ごと（例: 1 分 3 回・1 日 20 回）と、サイト全体の 1 日の上限を設ける（PartyBox はサーバー 1 台で動かす前提なので、メモリ上のカウンターで足りる。Caddy の後ろなので IP は `X-Forwarded-For` から取り、Express の `trust proxy` を設定する）
- **キャッシュ**: 正規化した入力文をキーに結果を保存し、同じ文なら API を呼ばない（「同じ文なら同じ車」も保てる）
- **入力と出力の上限**: 入力は 60 文字まで、`max_tokens` を抑える、`effort` は低め
- **Anthropic Console の利用上限（Spend limits）** を設定しておく
- **不正利用対策**: `Origin` ヘッダーの確認、必要なら Cloudflare などの前段で Bot 対策
- **失敗時はデモ版に切り替え**: 上限到達や障害時もゲームは止めない（上のフロント実装の `catch`）

---

## 今後の拡張（入れやすくしてあるもの）

| 機能 | 入れ方 |
|---|---|
| 勝敗予想 | `src/app/App.ts` の `FLOW` を `['title', 'build', 'rivals', 'predict', 'race', 'result']` にして、`predict` 画面を `register` する。各画面は `app.next()` で次へ進むだけなので、ほかは変更不要。結果は `app.state.lastResult` で答え合わせできる |
| AI による車の生成 | 上の「AI 生成の組み込み方」 |
| 友達の車と対戦 | `encodeBlueprint()` で URL（例: `#car=...`）に載せ、受け取り側で `decodeBlueprint()` → `app.state.rivals` に入れる |
| コースの追加 | `src/track/TrackData.ts` に `TrackDefinition`（コントロールポイント・幅・区間名）を足し、`getTrack(def)` で使う。見た目・実況の区間名・シミュレーションはコースの定義から自動で作られる |

---

## 技術スタック

- TypeScript + Vite（UI は React を使わず DOM を直接組み立てる。PartyBox と同じビルド・同じサーバーで配信）
- Three.js（物理エンジンは使わず、コースに沿った簡易な自前シミュレーション）
- Vitest（ユニットテスト）
- フォント: [M PLUS Rounded 1c](https://fonts.google.com/specimen/M+PLUS+Rounded+1c)（Google Fonts）
