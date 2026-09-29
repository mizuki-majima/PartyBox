# 🎉 PartyBox

**みんなで遊べる、かんたんオンラインゲーム。**
URLを送るだけで、友達とすぐにブラウザで遊べるパーティーゲーム集です。Discord などで通話しながら遊ぶことを想定しています。

```
サイトを開く → ゲームを選ぶ → ルームを作る → URL/コードを共有 → 友達がスマホで参加 → 全員そろったら開始 → 結果発表 → もう一回
```

## 遊べるゲーム

| ゲーム | ジャンル | 人数 | 概要 |
|---|---|---|---|
| 🕵️ 誰の答えでしょう？ | 心理戦 | 3〜8人 | 匿名で集めた回答の「書いた人」を当て合う |
| 🤝 全員一致を目指せ！ | 協力 | 3〜10人 | みんなと同じ答えを書いてチーム得点を狙う |
| 🎭 嘘つきは誰だ？ | 正体隠匿 | 4〜8人 | 1人だけお題を知らない嘘つきを話し合いで暴く（ワードウルフモードあり） |
| 🎨 回答を育てろ | お絵描き | 3〜8人 | 絵 → 文章 → 絵… と伝言し、最後にアルバムで振り返る |
| ⚖️ 10秒裁判 | 会話 | 4〜8人 | 被告・検察・弁護士・証人になって10秒ずつ発言し、有罪/無罪を判決 |

## クイックスタート

```bash
npm install

# 開発（サーバー :3001 + Vite :5173 を同時起動）
npm run dev
# → http://localhost:5173

# 本番ビルド & 起動（1つのポートで画面とWebSocketを配信）
npm run build
npm start
# → http://localhost:3001
```

### スマホから参加するには

- **同じWi-Fi内**: `npm run dev` 中に `http://<PCのIPアドレス>:5173` を開く（Vite は `host: true` で起動します）
- **インターネット越し**: 下記「デプロイ」を参照。Render / Railway / Fly.io など WebSocket が使える Node.js ホスティングに `npm run build && npm start` でそのまま載ります。Docker も用意しています。

## 技術スタック

| 領域 | 採用技術 |
|---|---|
| Frontend | React 19 / TypeScript / Vite / Tailwind CSS v4 / React Router |
| Backend | Node.js / Express 5 / Socket.IO 4 |
| テスト | Vitest（ソケット結合テスト）/ Playwright（複数ブラウザE2E） |

## ディレクトリ構成

```
shared/                  クライアント・サーバー共通
  games.ts               ゲームカタログ（タイトル・人数・設定項目など）★ゲーム一覧はここから自動生成
  protocol.ts            Socket.IO イベント・ルームビューの型
  games/views.ts         各ゲームのビュー型
server/
  index.ts / app.ts      起動・HTTP（画像配信・SPA配信）
  rooms/                 ルームシステム（Room / RoomManager）
  games/
    BaseGame.ts          全ゲーム共通の状態管理（フェーズ・タイマー・得点・退出処理）
    TurnSequence.ts      「順番に発言」ヘルパー
    registry.ts          サーバー側ゲーム登録
    <game-id>/           各ゲームのロジック
  data/*.json            お題・事件データ ★JSONを編集するだけで追加可能
client/
  pages/                 トップ / ルーム作成 / コード参加 / ルーム（ロビー）
  games/                 ゲーム共通フレーム + 各ゲーム画面、registry.tsx
  components/            UI部品（ボタン・タイマー・得点表・結果画面など）
  lib/                   ソケット接続・再接続・セッション保存・時刻補正
tests/                   Vitest（ルーム・全ゲームの結合テスト）
e2e/                     Playwright（PC + スマホの複数ブラウザで通しプレイ）
```

## 設計

### リアルタイム通信（サーバー権威型）

- クライアントは **操作（アクション）だけ** を送り、得点計算・勝敗判定・フェーズ進行はすべてサーバーで行います。
- サーバーは状態が変わるたびに、**プレイヤーごとに秘匿情報を取り除いたビュー** を生成して送信します。
  - 例: 回答フェーズ中は他人の回答内容は送らない（「誰が送信済みか」だけ送る）／嘘つきの正体・証拠カード・推理対象の作者は本人以外に送らない
- 同一 tick 内の複数の変更はまとめて1回だけ配信します（`Room.requestBroadcast`）。
- **タイマー同期**: サーバーは「締切時刻（サーバー時刻）」を配信し、クライアントは `serverNow` との差分で時計のずれを補正してカウントダウンします。締切直前には入力中の内容を自動送信し、サーバーは少しの猶予を持って締め切ります。

| クライアント → サーバー | 内容 |
|---|---|
| `room:create` / `room:join` / `room:rejoin` | ルーム作成・参加・再接続 |
| `room:settings` / `room:changeGame` / `room:start` | ホストの設定・ゲーム変更・開始 |
| `room:kick` / `room:close` / `room:leave` / `room:rename` | キック・ルーム削除・退出・名前変更 |
| `room:restart` / `room:backToLobby` | もう一回・ロビーへ |
| `game:action` | ゲーム内操作（回答・投票・発言など。`{ type, ... }`） |

| サーバー → クライアント | 内容 |
|---|---|
| `room:state` | そのプレイヤー用のルームビュー（参加者・設定・ゲーム状態・締切） |
| `room:closed` / `room:kicked` / `session:replaced` | ルーム削除・キック・別タブ接続の通知 |

### 共通ルームシステム

- 6桁のルームコード（読み間違えやすい `0/O/1/I/L` を除外）と招待URL `/room/<CODE>`、QRコード
- 参加時に **playerId + 秘密トークン** を発行し、`localStorage` に `roomCode / playerId / token / name` を保存
  - リロード・回線切断時は自動で再接続し、同じプレイヤーとして復帰（トークンで本人確認、なりすまし防止）
  - 同じプレイヤーが別タブで接続した場合は古いタブを切り離す
- 切断したプレイヤーは一定時間（既定3分）ルームに残り、その間に戻れば復帰。戻らなければ自動退出
- ホストが退出/切断したら、接続中の最古参プレイヤーへホスト権限を自動移譲
- ホスト権限: ゲーム開始・設定変更・ゲーム変更・キック・ルーム削除・進行（次へ/スキップ）・中断
- ゲーム中に参加した人は観戦者として入り、次のゲームから参加

### ゲーム状態管理（`BaseGame`）

```
LOBBY → START → (ROUND → ANSWER → RESULT) × N → GAME_OVER → もう一回 / ロビー
```

- `setPhase(phase, { duration, grace, onEnd })` で各フェーズを定義。**時間切れ・全員完了・ホストのスキップ** はすべて同じ `advance()` を通るため、二重進行が起きません。
- 途中退出したプレイヤーは完了判定から除外され、ゲームは止まりません。人数が最低人数を下回った場合は安全にゲームを終了します（例: 嘘つき本人が退出 → そのラウンドは無効）。
- フェーズ遷移中の例外はキャッチしてゲームを終了扱いにし、サーバー全体がクラッシュしないようにしています。

## 拡張方法

### お題を追加する

`server/data/` の JSON を編集するだけです（再ビルドで反映）。

| ファイル | 内容 |
|---|---|
| `unanimous.json` | 全員一致のお題（`prompts` に文字列を追加） |
| `whose-answer.json` | 誰の答えの質問（`questions`） |
| `liar.json` | 嘘つきのお題（カテゴリごと。同カテゴリ内が推理の選択肢・ワードウルフの別お題になる） |
| `grow-answer.json` | お絵描きの最初のお題（`prompts`） |
| `trial.json` | 裁判の事件テンプレート。`{d}` は被告名、`{変数}` は `vars` からランダムに選ばれる。`guilty` / `innocent` が証拠カード |

同じルームで遊んでいる間は、お題を使い切るまで同じものは出ません。

### ルール・人数・時間を変更する

- 人数・所要時間・設定の選択肢: `shared/games.ts` の該当ゲームを編集
- 得点: 各ゲームファイルの定数（`WHOSE_POINTS`, `LIAR_POINTS`, `TRIAL_POINTS`, `unanimousPoints()`）

### 新しいゲームを追加する

1. `shared/games.ts` の `GameId` と `GAMES` にメタ情報を追加 → **トップページのカード・ロビーの設定UIに自動で反映**
2. `shared/games/views.ts` にビュー型を追加
3. `server/games/<id>/` に `BaseGame` を継承したクラスを作り、`server/games/registry.ts` に1行登録

   ```ts
   export class MyGame extends BaseGame<'START' | 'ANSWER' | 'RESULT' | 'GAME_OVER'> {
     readonly gameId = 'my-game' as const;
     protected beginGame() {
       this.setPhase('ANSWER', { duration: 30_000, onEnd: () => this.showResult() });
     }
     protected onAction(playerId: string, action: GameAction) { /* 入力を検証して状態を更新 */ }
     getView(playerId: string) { return { ...this.baseView(playerId), /* 本人に見せてよい情報だけ */ }; }
   }
   ```
4. `client/games/<id>/` に画面を作り、`client/games/registry.tsx` に1行登録（共通部品 `PhaseHeader` / `AnswerForm` / `SubmissionStatus` / `Scoreboard` / `GameOverPanel` などを利用可能）

## テスト

```bash
npm test            # Vitest: ルームシステム + 全5ゲームのソケット結合テスト（29件）
npm run test:e2e    # Playwright: PCホスト + スマホ参加者の複数ブラウザで全5ゲームを通しプレイ
npm run typecheck   # 型チェック
```

確認している主な項目: 2人以上の同時接続 / 参加・退出 / リロード復帰（ロビー・ゲーム中）/ ホスト移譲 / キック / ルーム削除 / 別タブ接続 / 観戦参加 / ゲーム開始の人数チェック / 回答の秘匿 / 全員回答で自動進行 / 時間切れ / 得点計算 / 次ラウンド / ゲーム終了 / もう一回

E2E のスクリーンショットは `e2e/screenshots/` に保存されます。

## デプロイ

```bash
docker build -t partybox .
docker run -p 3001:3001 partybox
```

| 環境変数 | 既定値 | 説明 |
|---|---|---|
| `PORT` | `3001` | 待ち受けポート |
| `HOST` | （全インターフェース） | 待ち受けアドレス |
| `PARTYBOX_TIME_SCALE` | `1` | ゲーム内時間の倍率（動作確認用。`0.5` で半分の時間） |

**注意**: ルームの状態はサーバーのメモリに保持しています。サーバー再起動でルームは消え、インスタンスは1台で動かす前提です（複数台にする場合は Socket.IO の Redis Adapter と状態の外部化が必要）。

## 今後のアイデア

- お題の投稿・カスタムお題パック
- ゲームごとの効果音・BGM
- 観戦者のリアクション（スタンプ）
- 10秒裁判の「買収された証人」などの追加役職
