# デザインの説明書

PartyBox の見た目は、共通画面と各ゲームで別々の「デザイン（テーマ）」を持つ。
このファイルは、各テーマの方針と、切り替えの仕組み、新しいゲームにデザインを当てる手順をまとめたもの。

## 仕組み

- **テーマ = デザイントークンの1セット**。色・フォント・角丸・影・枠線・背景・装飾を CSS カスタムプロパティで持つ。
  1テーマ = `client/themes/<名前>.css` の1ファイル
- **切り替え**は `<html data-theme="名前">`。`client/themes/index.ts` の `useTheme()` を、ゲーム中の枠（`client/games/GameShell.tsx`）が呼ぶ。
  - ゲームに入ると、そのゲームのテーマになる
  - ロビーに戻る・退出すると、共通画面のテーマ（`platform`）に戻る
  - `<html>` に付けるので、body 直下に出るダイアログ・トースト・固定の帯も同じテーマになる
- **漏れない理由**: トークンも飾りの CSS も、すべて `[data-theme='名前']` の中にだけ書く。ほかのテーマのときは当たらない
- **部品は作り直さない**。ボタン・カード・入力・バッジ・ダイアログ・タイマー・お題カード・固定の帯は、
  `client/index.css` の `.ui-*` クラスがトークンを読むだけ。テーマが変われば、同じ部品の見た目が変わる
- 画面に書く色は、**意味の名前**だけを使う（下の表）。`bg-white` や `text-rose-300` のような色そのものの名前は書かない
- フォントは `@fontsource/*` を同梱して**自前で配信**する（外のサーバーから読まない）。
  共通画面のぶんだけ最初に読み、ゲームのぶんはそのテーマを使うときに読む（`client/themes/fonts/<名前>.ts`）。
  読めるまで・読めなかったときは、`--t-font-*` の2番目以降に書いた端末のフォントで出る
- 絵文字はアイコンに使わない。線のアイコンは `client/components/Icon.tsx` の `Icon`、ゲームの印は `GameEmblem`（どちらも SVG。色はトークンから取る）
- トップのカードや部屋を作る画面では、`data-theme` を入れ子にして、**そのゲームのデザインの見本**を出している（`theme-swatch`）

### 意味の名前（Tailwind のクラスで使う）

| クラスの名前 | 意味 |
|---|---|
| `bg` / `fg` / `muted` | 地の色 / 文字の色 / 控えめな文字 |
| `panel` `panel-2` `panel-3` | 面の色（カードなど） |
| `line` / `shade` | 罫線・枠 / 沈める色 |
| `accent` `accent2` | 強調（押すもの・見出しの差し色） |
| `ok` / `danger` / `warn` | 正解・完了 / 不正解・危険 / 注意（司会の操作など） |
| `hi` / `info` / `sub` | 注目 / 案内 / 補助 |

色は3つで1組: **塗り**（`bg-ok`）、**文字として使う色**（`text-ok-ink`。地の上で読める濃さ）、**塗りの上の文字**（`text-on-ok`）。
塗りの上に文字を置くときは必ず `text-on-*` を使う（明るいテーマでも暗いテーマでも読めるように）。

### トークンの一覧（テーマが決めるもの）

| まとまり | トークン |
|---|---|
| 文字 | `--t-font-body` `--t-font-display` `--t-body-weight` `--t-display-weight` `--t-display-tracking` |
| 地 | `--t-page-bg`（模様も含む） `--t-bg` `--t-fg` `--t-muted` `--t-panel*` `--t-line` `--t-shade` |
| 色 | `--t-accent*` `--t-ok*` `--t-hi*` `--t-info*` `--t-sub*` `--t-danger*` `--t-warn*` `--t-on-*` `--t-focus` |
| 角丸・影 | `--radius-sm` 〜 `--radius-3xl`（Tailwind の `rounded-*` が読む） `--t-elev`（`shadow-*` が読む） |
| カード・面 | `--t-card-bg` `--t-card-border` `--t-card-radius` `--t-card-shadow` `--t-tile-*` |
| ボタン | `--t-btn-border` `--t-btn-radius` `--t-btn-shadow` `--t-btn-press` `--t-btn-font` `--t-btn-primary-*` `--t-btn-secondary-*` `--t-btn-danger-*` |
| 入力 | `--t-input-bg` `--t-input-fg` `--t-input-border` `--t-input-radius` `--t-input-shadow` |
| そのほか | `--t-badge-*` `--t-overlay` `--t-modal-*` `--t-q-*`（お題カード） `--t-bar-*`（固定の帯） `--t-timer-*` |

## 各テーマの方針

| 対象 | テーマ名 | スタイル | 方針 |
|---|---|---|---|
| 共通画面 | `platform` | スイススタイル | 白・黒・赤だけ。角丸なし・影なし。細い黒の罫線と、文字の大きさ・太さで強弱を付ける。見出しは左揃え。ゲームの個性とぶつからないよう、飾りは罫線と文字だけ |
| 全員一致を目指せ！ | `unanimous` | ネオブルータリズム | 黄のベタ塗りの地、太い黒枠、ぼかさない黒のずらし影。そろった = 青＋「✓ そろった」、そろわない = ピンク＋「× ひとりだけ」 |
| 誰の答えでしょう？ | `whose-answer` | 手書き風 | 罫線入りのノート、ガタついた枠、手書きの文字。お題は黄色い付箋、見出しは蛍光ペン。回答はメモ用紙のカード |
| 懇親会 | `party-event` | メンフィス | 生成りの地に波線・ドット・三角の模様。珊瑚・青緑・黄のベタ面と、色つきのずらし影。丸い太字。ビンゴは 開いたマス = 丸、まだ = 四角 |
| 嘘つきは誰だ？ | `liar` | アールデコ | 黒の地に金の細い線。左右対称、扇の地模様、二重線の額縁。お題は象牙の札。嘘つきの札は えんじ＋印＋「嘘つき」の文字 |
| 回答を育てろ | `grow-answer` | スクラップブック | クラフト紙の台紙に、少し傾けた白い紙片とマスキングテープ。ペン字とタイプライターの文字。赤いボタンは縫い目のあるラベル |
| 10秒裁判 | `ten-sec-trial` | 和モダン | 和紙の地に墨の明朝体。枠で囲まず、細い罫線と余白で区切る。差し色は朱だけ。事件の札の見出しは縦書き、判決は判子（有罪 = 朱の角判子、無罪 = 墨の丸判子）。役は1文字の印（被・検・弁・証） |

プロンプト・グランプリ（1人用の別ページ）は対象外で、独自の CSS のまま。トップのカードだけ共通画面のデザインで出している。

| | 色 | フォント（読めないときの代わり） |
|---|---|---|
| 共通画面 | 白 `#fafafa`・黒 `#111111`・赤 `#e10600` | Zen Kaku Gothic New（Hiragino Sans / Yu Gothic）。英数字は Helvetica 系 |
| 全員一致を目指せ！ | 黄 `#ffde00`・黒・白・青 `#2b6cff`・ピンク `#ff5c8a` | 見出し Dela Gothic One、本文 Zen Kaku Gothic New（Hiragino Sans） |
| 誰の答えでしょう？ | 紙 `#fdf8ec`・鉛筆 `#2b2b2b`・赤ペン `#d9432f`・青ペン `#2f5fd0`・蛍光 `#ffe36e` | Yusei Magic（Hiragino Maru Gothic） |
| 懇親会 | 生成り `#fff7e6`・黒 `#1a1a1a`・珊瑚 `#ff6b5e`・青緑 `#00a6a6`・黄 `#ffd23f` | M PLUS Rounded 1c（Hiragino Maru Gothic） |
| 嘘つきは誰だ？ | 黒 `#0e0e10`・金 `#c9a227`・象牙 `#f3ead3`・深緑 `#0f3d33`・えんじ `#7d2318` | Shippori Mincho B1（Hiragino Mincho / Yu Mincho） |
| 回答を育てろ | クラフト紙 `#d9c7a3`・白 `#fffdf8`・紺 `#26314d`・赤 `#b8432c`・テープ黄 `#f2d95c` | 本文 Zen Kurenaido、見出しの英数字は Courier New（Hiragino Maru Gothic） |
| 10秒裁判 | 和紙 `#f4efe4`・墨 `#1c1c1c`・朱 `#c73e1d`・藍鼠 `#5b6b73` | Zen Old Mincho（Hiragino Mincho / Yu Mincho） |

## 守ること（遊びやすさ）

- 誰の番か・残り時間・自分の役や手札は、どのテーマでも画面の上のほうに、大きく出す
- 区別を色だけに頼らない。印（✓ ×）・言葉・形（丸と四角）・線の種類（実線と破線）を必ず添える
- 押すものの高さは 44px 以上（`min-h-11`）
- お絵描きの紙・QR コードの地は、どのテーマでも白のまま（`bg-[#fff]`）。色が変わると読めなく・描けなくなるため
- 動きは控えめに。`prefers-reduced-motion` のときは止まる（`client/index.css` の最後）。テーマで傾きなどを足したら、同じ条件で止める
- 画像は外の URL に頼らない（CSS・SVG・data URI だけ）

## 新しいゲームにデザインを当てる手順

1. `client/themes/platform.css` などを写して `client/themes/<名前>.css` を作り、`[data-theme='<名前>']` の中のトークンを決める。
   そのテーマだけの飾り（傾き、模様、下線など）は、同じファイルに `[data-theme='<名前>'] .ui-card { … }` の形で書く
2. `client/index.css` の先頭に `@import './themes/<名前>.css';` を足す
3. フォントを足すなら `npm i @fontsource/<書体>` して `client/themes/fonts/<名前>.ts` で読み込む
4. `client/themes/index.ts` の `THEMES` に1行（ブラウザの枠の色とフォントの読み込み）、`GAME_THEMES` に1行（ゲームID → テーマ名）足す
5. `client/components/Icon.tsx` の `EMBLEMS` に、そのゲームの印（SVG）を1つ足す
6. ゲームの画面では、色は意味の名前（`bg-ok` `text-on-ok` `text-muted` …）、面は `Card` / `.ui-tile`、ボタンは `Button` を使う。
   これだけで、テーマのトークンが当たる
7. 390px 幅で通して遊び、スクリーンショットを目で見る。`npm run typecheck`・`npm test`・関係する E2E を流す
