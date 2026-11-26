# 参加者の画面の整理と「嘘つきは誰だ？」の周回 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 懇親会の参加者の画面を「ゲームに関係するものだけ大きく、詳しいことは押して見る」形に整理し、「嘘つきは誰だ？」を1つのお題で3〜5周話してから投票する形にする。

**Architecture:** 参加者の画面は、各企画で「表紙」（いま遊ぶもの）だけを出し、得点・テーブルの一覧・読まれた番号・遊び方などは「くわしく」のボタンからモーダルで開く。司会の画面は変えない。嘘つきは `TurnSequence` に周回（laps）を足し、1つのお題の中で順番を何周も回してから投票に入る。

**Tech Stack:** TypeScript, React 19, Socket.IO, Vitest, Playwright。npm。

**Spec:** この文書の「要件」（ユーザーの依頼。質問は「作り始めて」で省いた）。

## 要件（ユーザーの依頼・2026-11-26）

1. 参加者のページが煩雑。情報量が多いので、画面に大きく見せるのはゲームに関係するものだけにして、詳しいことを知りたい人はどこかを押す動線にしたい
   - 常に大きく見えていてほしいもの: **何問目か・問題・回答**
   - テーブル（夕食の席・座席の一覧）と遊び方は、表紙に書かなくても分かる
2. 嘘つきは誰だ？は、1つのテーマで3〜5周くらい会話して、犯人探しをするようにしたい

**実装側で決めたこと（最後にユーザーに伝える）**

- 変えるのは懇親会の**参加者の画面だけ**。司会の画面はそのまま
- 「あなた」の帯は1行に縮める（名前・夕食のチームと、小さな「夕食の席」「表示名を変える」）。「いまやること」は残すが、小さい1行にする（リハーサルの「どこを押したらいいの」への答えのため）
- 表紙から外すもの → 「くわしく」から開く: 待機画面の説明と夕食の席、クイズの得点・チームの変更・送信ずみのチーム、座席の数と「いま引いた人」とテーブルの一覧、ビンゴの読まれた番号の一覧とビンゴした人。各企画の「やり方」の説明は、右上の「遊び方」に任せて表紙から外す
- 表紙に残すもの: クイズ = 何問目・問題・答える所・（答えの段で）答えと正誤とみんなの回答・（結果で）優勝。座席 = 自分のくじ・結果・同じテーブルの人。ビンゴ = 読まれた番号・自分のカード・（あれば）景品の結果
- 嘘つき: 「1つのお題で話す周回数」を足す（1周・3周・4周・5周、既定 3周）。お題の数（ラウンド数）の既定を 1 にする（1・2・3）。1周は今までどおりの遊び方と試験のため。10秒裁判は1周のまま変えない

## Global Constraints

- 公開リポジトリ: 実名・会社名・本番URL/IP・ルームコード・司会用URLを書かない
- 懇親会の不変条件（`CLAUDE.md`）を保つ。サーバーの動き（懇親会）は変えない（画面だけ）
- 画面: 色・角丸・影はトークン。本文 16px 以上。押すものの名前は「」。ボタン名を変えたら `client/guides.tsx` も直す
- E2E は `data-testid`。変えたら `e2e/` も直す。E2E の前に `.e2e-state/` を消す
- 各タスクの終わりに `npm run typecheck`・`npm test`、画面を変えたら関係する E2E

## Review Focus

1. 参加者がチームを持っていない（名簿に無い人）とき、クイズの表紙にチームを選ぶ所が出て、答えられること
2. 嘘つきで、途中で切断した人の番は飛ばし、周回が止まらないこと（全員切断なら投票へ進む）
3. 嘘つきの発言の記録が周回をまたいで残り、何周目の発言か分かること
4. 「くわしく」のモーダルを開いている間に段が進んでも、表紙が正しく変わること（モーダルの中身も新しい状態）
5. 司会の画面が今までどおり（一覧・得点・進行が全部見える）こと

---

### Task 1: 嘘つきは誰だ？を、1つのお題で何周も話す

**Files:**
- Modify: `server/games/TurnSequence.ts`, `server/games/liar/LiarGame.ts`, `shared/games.ts`, `shared/games/views.ts`, `client/games/liar/LiarScreen.tsx`, `client/components/talk.tsx`, `client/guides.tsx`
- Test: `tests/games.test.ts`, `e2e/games.spec.ts`

**Interfaces:**
- `TurnSequence.reset(order: string[], laps = 1)`、`TurnSequence.lap: number`（1 始まり。始まる前は 1）、`TurnSequence.laps: number`。`next()` は最後の人の次で `lap < laps` なら次の周の先頭へ戻る（誰も話せない周が1周続いたら null）。`Statement.lap?: number`（記録した周）
- 設定 `laps`（`liar` だけ）: options `[1, 3, 4, 5]`（label「n周」）、default 3。`rounds`: options `[1, 2, 3]`、default 1
- `LiarView.lap: number`、`LiarView.laps: number`

- [ ] **Step 1: 失敗する試験**（`tests/games.test.ts`）: `it('嘘つき: 1つのお題で laps 周話してから投票になり、発言に周が付く')` — 3人・`laps: 3` → TALK が 9 回（周ごとに同じ順番）→ VOTE。`statements` の `lap` が 1,1,1,2,2,2,3,3,3。`it('嘘つき: 切断した人の番は、どの周でも飛ばす')`。既存の通しプレイは `laps: 1` を付ける
- [ ] **Step 2: 失敗を確かめる**
- [ ] **Step 3: 実装**。画面: 発言の段の見出しに「n周目 / m周」（testid `liar-lap`）。みんなの発言を周ごとに見出しで区切る（`StatementLog` に周の見出し。周の無い発言は今までどおり）。`howToPlay` と `guides.tsx` を「1つのお題で、順番に何周か話す」に直す
- [ ] **Step 4: `npx vitest run tests/games.test.ts`・typecheck。E2E の嘘つきは「1周」を選んで今までの流れのまま通す**
- [ ] **Step 5: コミット** `feat: 嘘つきは誰だ？を、1つのお題で何周か話してから投票にする`

### Task 2: 懇親会の参加者の画面を「表紙」と「くわしく」に分ける

**Files:**
- Create: `client/games/party-event/MoreSheet.tsx`（「くわしく」のボタンとモーダル）
- Modify: `client/games/party-event/MeBar.tsx`, `PartyEventScreen.tsx`, `QuizSection.tsx`, `SeatsSection.tsx`, `BingoSection.tsx`, `client/guides.tsx`, `README.md`, `CLAUDE.md`
- Test: `e2e/party-event.spec.ts`, `e2e/results.spec.ts`

**Interfaces:**
- `MoreSheet({ label, title, testId, children }: { label: string; title: string; testId: string; children: ReactNode })` — 小さなボタン（`${testId}-open`）と、押すと開くモーダル（中身は `children`。開いている間も新しい状態で描き直す）。閉じるボタンつき
- 参加者だけの変更。`game.isHost` のときは今までどおり全部出す

- [ ] **Step 1: E2E を新しい表紙に合わせて書き換え、落ちることを確かめる**
  - 待機: `dinner-seating` は表紙に無い（`toHaveCount(0)`）。`me-dinner-open` で開ける。`event-howto-waiting` は出ない
  - クイズ: 表紙に `question`・答える所・（答えの段）`quiz-answer`・`quiz-all-answers`。`quiz-scores` は `quiz-more-open` を押すと見える。`quiz-team-change` も「くわしく」の中
  - 座席: 表紙に `seats-tables` が無い。`seats-more-open` で開ける
  - ビンゴ: 表紙に `bingo-card`。読まれた番号の一覧は `bingo-more-open` の中
- [ ] **Step 2: 実装**（下の表紙の決まりどおり）。`MeBar` は1行（名前・夕食のチーム・小さな「夕食の席」「表示名を変える」）。`NowBanner` は小さい1行
- [ ] **Step 3: `npx playwright test e2e/party-event.spec.ts e2e/results.spec.ts`・typecheck・`npm test`。390px で待機・クイズ（問題・答え・結果）・座席・ビンゴを撮って、1画面目に何問目・問題・答える所が入ることを確かめる**
- [ ] **Step 4: README（説明書きの節）・`CLAUDE.md`（決めたこと）・`guides.tsx` を直してコミット** `feat: 懇親会の参加者の画面を、ゲームに関係するものだけにし、詳しいことは「くわしく」から開く`

### Task 3: 通しの確認と PR

- [ ] `npm run typecheck`・`npm test`・`npm run test:e2e`（`.e2e-state/` を消してから）
- [ ] 別のレビュアーにブランチ全体を見てもらい、直す
- [ ] PR（マージはユーザーに確かめてから）。本番の反映（`deploy.sh`）の手順を渡す。懇親会の最中には反映しない
