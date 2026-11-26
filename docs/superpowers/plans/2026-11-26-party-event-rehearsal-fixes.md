# 懇親会のリハーサルで見つかった課題の直し Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** リハーサルで出た「どこを押せばいいか分からない」をなくし、夕食の席の表示・チームごとのゲームの1位・クイズ／座席決め／ビンゴの改善・配色の手直しを、本番（翌日）までに入れる。

**Architecture:** サーバー権威のまま、`server/games/party-event/` の規則（quiz / seats / bingo）に操作と項目を足し、`PartyEventView` に夕食の席（`dinner`）を足す。夕食の席は新しい設定ファイル `dinner.json`（名簿と同じ置き場。無ければ出さない）から読む。入室は、懇親会のルームでは「名簿から自分の名前を押す」を最初に出し、押した名前で参加・座席の名前選び・クイズのチームまで一度に決める。

**Tech Stack:** TypeScript（strict, ESM）, React 19 + react-router, Tailwind（デザイントークン）, Socket.IO, Zod, Vitest, Playwright。npm。

**Spec:** この文書の「要件」（ユーザーの依頼をそのまま書いたもの。ブレインストーミングは「一旦実装してほしい」で省いた）。

## 要件（ユーザーの依頼）

1. 入室と動線: リハーサルで「どこを押したらいいの」となった。迷わず参加して、いま押すものが分かるようにする
2. 夕食は決まった席に座る（2つのテーブルに、チーム A〜F と司会）。懇親会のルームのページに夕食の席を出す。丸の色は所属（2色）
3. 夕食の各チームで、話題に困ったらゲームで遊び、チームごとに1位を決める
4. クイズ: 他のチームの回答を見られるようにする。最後の問題の得点を上げる
5. 座席（二次会）: 参加者が自分で「くじを引く」ボタンを押す。結果を待つ間のわくわくする演出を足す
6. ビンゴ: 参加者が自分でマスを押せるようにする
7. 色合い: 主催の新しいデザインテンプレート（ビジネス用）の要素を、ゲームに似合う範囲で取り入れる

**実装側で決めたこと（ユーザーに最後に伝える）**

- 二次会の席は今の座席決め（くじ）で決める。ビンゴは二次会の企画として今のまま
- クイズの「他のチームの回答」は、締め切った後（答えの段）から全員に見せる。回答タイム中は見せない（写せないように）
- 最後の問題の点数は、`quiz.json` の問題ごとの `points`（既定 1）で決める。本番データでは最後の問題を 3 点にする
- 夕食のチーム名とクイズのチーム名が同じなら、名前を選んだ時点でクイズのチームも自動で決まる（あとから「変える」もできる）
- ビンゴの「ビンゴ！」の受付は、今までどおり呼ばれた番号だけでサーバーが判定する。マスを押すのは画面の上で開ける操作で、「ビンゴ！」ボタンは自分で開けたマスで1列そろうと出る
- 参加者のくじは、司会が座席決めを出している間だけ引ける。司会の「1人引く」「残り全員」は残す（スマホが無い人のため）

## Global Constraints

- 公開リポジトリ: 実名・会社名・チーム名の実データ・本番URL/IP・ルームコード・司会用URLをコード・テスト・コミット・PR に書かない。試験と開発は `server/event/sample/` のサンプルで行う
- 懇親会の不変条件（`CLAUDE.md`「壊してはいけないこと」）をすべて保つ。特に: クイズの答えは `reveal` まで参加者に配らない／ビンゴの受付は呼ばれた番号で判定／保存形式は `version: 1` のまま、古い保存も読める（足す項目は省略可にし、`restore` の `{ ...empty(), ...snap }` で埋まること）
- 不正な操作は `UserError`（平易な日本語）。操作の値は `String()` / `Number()` で確かめてから使う
- 画面: 色・角丸・影を直接書かない（意味の名前のトークンと共通部品）。絵文字をアイコンにしない。本文 16px 以上。押すものの名前は「」で、ガイド（`client/guides.tsx`）の文も一緒に直す
- E2E は `data-testid` で掴む。消す・変えるときは `e2e/` も直す
- 各タスクの終わりに `npm run typecheck` と `npm test` が通ること。画面を変えたタスクは `npx playwright test e2e/party-event.spec.ts` も
- コメントは日本語で「なぜ」を書く

## Review Focus

1. 回答タイム中に、参加者のビューに他チームの回答（`answers`）や答えが入っていないこと（Task 5 の試験）
2. 古い `rooms.json`（`bingo.punched` が無い・`dinner` が無い）を読み戻しても、ルームが壊れず続きから動くこと（Task 7 の試験）
3. 名簿の名前で入るとき、同じ名前の人がつながっている（2台目のスマホ）と入れず、切断中なら本人として戻ること（Task 3 の試験）
4. 座席決めを出していない間に、参加者が「くじを引く」を送っても席が決まらないこと／2回押しても1回分しか決まらないこと（Task 6 の試験）
5. 本番の置き場に `dinner.json` が無いとき、サンプルの夕食の席（作りものの名前）を出さないこと（Task 1 の試験）

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| `server/event/config.ts` | `DinnerConfig` と `dinner.json` の読み込み、`QuizQuestion.points` |
| `server/event/sample/dinner.json`（新規） | 開発・試験用の夕食の席（サンプルの名前） |
| `server/games/party-event/dinner.ts`（新規） | 夕食の席のビューと「名前 → チーム」の引き当て |
| `server/games/party-event/quiz.ts` | 点数、答えの段での全チームの回答 |
| `server/games/party-event/seats.ts` | `drawSelf` |
| `server/games/party-event/bingo.ts` | `punch`、開けたマスでのビュー |
| `server/games/party-event/PartyEventGame.ts` | 操作の追加、`claimPerson`、`joinRoster`、ビューに `dinner` |
| `server/rooms/RoomManager.ts` / `Room.ts` | `room:check` の名簿、`room:join` の `personId`、`room:create` の `label`、結果に `label` |
| `server/results.ts` / `shared/results.ts` | 結果の `label` |
| `shared/games/views.ts` / `shared/protocol.ts` | 型 |
| `client/games/party-event/DinnerSeating.tsx`（新規） | 夕食の席の表示 |
| `client/games/party-event/MeBar.tsx`（新規） | 「あなた」の帯と「いまやること」 |
| `client/games/party-event/*Section.tsx` / `PartyEventScreen.tsx` | 各企画の画面 |
| `client/pages/RoomPage.tsx` | 懇親会の入室（名簿から押して入る） |
| `client/pages/CreateRoomPage.tsx` / `Lobby.tsx` / `LandingPage.tsx` / `ResultsPage.tsx` | チームのルーム・懇親会に戻る・チームごとの1位 |
| `client/lib/eventReturn.ts`（新規） | 「チームで遊ぶ」から戻る先（懇親会のルームコード）とチーム名の保存 |
| `client/themes/party-event.css` / `docs/design.md` | 配色 |
| `README.md` / `CLAUDE.md` / `client/guides.tsx` | 説明・決めたこと・遊び方 |

---

### Task 1: 夕食の席の設定（`dinner.json`）

**Files:**
- Modify: `server/event/config.ts`
- Create: `server/event/sample/dinner.json`
- Test: `tests/event-config.test.ts`

**Interfaces:**
- Produces:
  - `DinnerConfig = { title: string; legend: { label: string; groups: string[] }[]; tables: { name: string; teams: { name: string; members: string[] }[] }[] }`
  - `EventConfig.dinner: DinnerConfig | null`
  - Zod: `title` 既定 `'夕食の席'`（1〜60）、`legend` 0〜4件（`label` 1〜20、`groups` 1〜10件・各 1〜40）既定 `[]`、`tables` 1〜10件（`name` 1〜20、`teams` 1〜10件（`name` 1〜20、`members` 1〜20件・各 1〜40））
  - 読み込みの規則: 置き場に `dinner.json` があればそれ（形式違いは起動失敗）。無ければ、3ファイル（quiz/bingo/seats）が全部サンプルのときだけサンプル、1つでも置き場から読めていれば `null`

- [ ] **Step 1: 失敗する試験を書く**（`tests/event-config.test.ts` に `describe('夕食の席（dinner.json）')`）
  - `it('置き場の dinner.json を読む')`: `tables[0].teams[0].members` が書いたとおり、`title` 省略で `'夕食の席'`
  - `it('置き場に名簿があって dinner.json が無ければ null（サンプルの名前を本番に出さない）')`: `seats.json` だけ書く → `dinner === null`
  - `it('置き場が空ならサンプルを使う')`: 何も書かない → `dinner?.tables.length` が 1 以上
  - `it('形式が違えば起動を失敗させる')`: `tables: []` → `loadEventConfig()` が `/dinner\.json の形式が正しくありません/` を投げる
- [ ] **Step 2: `npx vitest run tests/event-config.test.ts` で失敗を確かめる**
- [ ] **Step 3: `config.ts` に `DinnerConfig` と読み込みを足す。サンプルは、サンプル名簿の12人を2テーブル×2チーム×3人に分け、`legend` は `[{ label: 'あおぞら社', groups: ['あおぞら社'] }, { label: 'みどり社・ほしぞら社', groups: ['みどり社', 'ほしぞら社'] }]`**
- [ ] **Step 4: 試験が通ることを確かめる**（`npx vitest run tests/event-config.test.ts`、`npm run typecheck`）
- [ ] **Step 5: README の「懇親会」に `dinner.json` の書き方を足して、コミット** `feat: 夕食の席（dinner.json）を読めるようにする`

### Task 2: 夕食の席のビューと、名前を選ぶとチームが決まる

**Files:**
- Create: `server/games/party-event/dinner.ts`
- Modify: `server/games/party-event/PartyEventGame.ts`, `shared/games/views.ts`
- Test: `tests/party-event-rules.test.ts`, `tests/party-event.test.ts`

**Interfaces:**
- Consumes: Task 1 の `DinnerConfig`
- Produces:
  - `views.ts`: `DinnerMemberView { name: string; tone: number | null; you: boolean }`、`DinnerTeamView { name: string; members: DinnerMemberView[] }`、`DinnerTableView { name: string; count: number; teams: DinnerTeamView[] }`、`DinnerView { title: string; tables: DinnerTableView[]; legend: { label: string; tone: number; count: number }[]; myTeam: string | null; myTable: string | null }`。`PartyEventView.dinner: DinnerView | null`
  - `dinner.ts`: `teamOfName(cfg: DinnerConfig, name: string): { table: string; team: string } | null`（名前は `NFKC`・空白除去・小文字で比べる。seats.ts の `nameKey` と同じ）、`dinnerView(cfg: DinnerConfig, roster: RosterPerson[], myName: string | null): DinnerView`（`tone` は名簿で引いた所属が `legend[i].groups` に入る `i`。名簿に無い名前は `null`）
  - `PartyEventGame.claimPerson(playerId: string, personId: string, takeover: boolean): void` — `seats.claim` のあと、選んだ人の名前の夕食チームが `cfg.quiz.teams` にあれば `quizState.teamOf[playerId]` をそれにする。`seats:claim` 操作もこれを通す

- [ ] **Step 1: 失敗する試験を書く**
  - rules: `it('名前から夕食のチームを引く（全角・空白の違いは同じ）')`、`it('所属の色は legend の順、名簿に無い名前は tone null')`、`it('自分の名前に you が付き、myTeam / myTable が入る')`
  - socket（`tests/party-event.test.ts`）: `it('名簿で名前を選ぶと、夕食のチームと同じ名前のクイズのチームに入る')` — サンプルの夕食のチーム名をクイズのチーム名に合わせた設定で `seats:claim` → `view.game.quiz.myTeam` がそのチーム、`view.game.dinner.myTeam` も同じ
- [ ] **Step 2: 失敗を確かめる**（`npx vitest run tests/party-event-rules.test.ts tests/party-event.test.ts`）
- [ ] **Step 3: `dinner.ts` と `claimPerson`、`viewFor` に `dinner` を足す**（サンプルの夕食のチーム名は `チーム A`〜`チーム D` にして、サンプルのクイズのチーム名と揃える）
- [ ] **Step 4: 試験が通る・`npm run typecheck`**
- [ ] **Step 5: コミット** `feat: 懇親会のビューに夕食の席を足し、名前を選ぶとクイズのチームも決まるようにする`

### Task 3: 懇親会は名簿から名前を選んで入る（表示名は直せる・中では選んだ人）

ユーザーの追加の依頼（2026-11-26）: 「名前を自由入力ではなく選択に。ユーザーは編集できるが、内部的には元々選択した名前で今後使われる。参加 → 名前選択（編集可能）→ クイズのチームは選ばなくてよい → 席決めは選んだ名前から引く（途中不参加の人を外す機能はそのまま）」

**Files:**
- Modify: `shared/protocol.ts`, `server/rooms/RoomManager.ts`, `server/games/party-event/PartyEventGame.ts`, `client/lib/useRoom.ts`, `client/pages/RoomPage.tsx`
- Test: `tests/party-event-rooms.test.ts`

**Interfaces:**
- Consumes: Task 2 の `claimPerson`、`teamOfName`
- Produces:
  - `RoomSummary.roster?: { id: string; name: string; team: string | null }[]`（懇親会のルームで、開始ずみのときだけ。欠席の人は除く。`team` は夕食のチーム）
  - `PartyEventGame.joinRoster(): NonNullable<RoomSummary['roster']>`、`PartyEventGame.playerOfPerson(personId: string): string | null`（その名簿の人を選んでいるプレイヤーID）
  - `'room:join'` の引数に `personId?: string; takeover?: boolean`。
    - 名簿に無い `personId` → 参加させる前に `UserError('その名前は名簿にありません')`
    - その名簿の人をもう選んでいるプレイヤーがいる: 切断中、または `takeover` なら**そのプレイヤーとして戻す**（トークンを作り直し、表示名を今回の `name` にする。つながっていた前の画面には `session:replaced`）。つながっていて `takeover` が無ければ `UserError('PERSON_IN_USE')`（画面で「別のスマホで参加中です。ご本人ならこのスマホに切り替えます」と確かめてから `takeover: true` で送り直す）
    - いなければ新しいプレイヤー（表示名 `name`）として入り、`claimPerson(id, personId, true)`
    - どれも最後に `room.requestBroadcast()`
  - `'room:rename'`: 懇親会のルームなら開始後でも表示名を変えられる（名簿の人・座席・チームは変わらない）
  - `useRoom().join(name: string, opts?: { personId?: string; takeover?: boolean }): Promise<string | null>`
  - 表示名と名簿の名前の使い分け: 座席の表・夕食の席・くじは**名簿の名前**、ヘッダー・ビンゴの受付・通常のゲーム・勝者の記録は**表示名**

- [ ] **Step 1: 失敗する試験を書く**（`tests/party-event-rooms.test.ts`）
  - `it('room:check で名簿（夕食のチームつき）が返る。通常のゲームには無い')`
  - `it('personId と直した表示名で入ると、表示名で参加し、座席の名前とクイズのチームは選んだ人のもの')`
  - `it('同じ名簿の人がつながっていれば PERSON_IN_USE、takeover なら前の画面は session:replaced で、カードは同じ')`
  - `it('切断中なら、表示名が違っても選んだ人として戻り、カードが同じ')`
  - `it('名簿に無い personId は参加させない')`
  - `it('懇親会では開始後も表示名を変えられ、座席の名前は変わらない')`
- [ ] **Step 2: 失敗を確かめる**
- [ ] **Step 3: サーバーと、`RoomPage` の `JoinForm` を作り直す**
  - 懇親会で `summary.roster` があれば、最初に「名簿から自分の名前を押してください」。夕食のチームごとに見出しを付けた名前のボタン（2列、高さ 56px 以上）。上に「名前で絞り込む」。testid: `join-roster`、各ボタン `join-roster-person`
  - 押すと、下に固定した欄に「表示名（変えてもかまいません）」の入力（選んだ名前が入っている。testid `join-display-name`）と大きな「この名前で参加する」（`join-submit`）。表示名を空にしたら選んだ名前に戻す
  - `PERSON_IN_USE` が返ったら確かめのモーダル（`join-takeover`）
  - その下に小さく「名簿に名前が無い方はこちら」（`join-free-open`）→ 今までの名前の入力欄
  - 参加後の「あなた」の帯（Task 4）に「表示名を変える」（`me-rename`）
  - 通常のゲーム・名簿が無いときは今までどおり
- [ ] **Step 4: 試験・`npm run typecheck`・`npx playwright test e2e/party-event.spec.ts`（入室の手順が変わるので、e2e の参加の手順を名簿の押下か「名簿に名前が無い方」経由に直す）**
- [ ] **Step 5: README・`CLAUDE.md`（決めたこと・不変条件「入り直しは選んだ名簿の人で戻す」）を直してコミット** `feat: 懇親会は名簿から名前を選んで参加し、表示名だけを直せるようにする`

### Task 4: 「あなた」の帯・いまやること・夕食の席の表示

**Files:**
- Create: `client/games/party-event/DinnerSeating.tsx`, `client/games/party-event/MeBar.tsx`
- Modify: `client/games/party-event/PartyEventScreen.tsx`, `client/games/party-event/SeatsSection.tsx`（`PickMyName` を export）, `client/guides.tsx`
- Test: `e2e/party-event.spec.ts`

**Interfaces:**
- Consumes: Task 2 の `DinnerView`
- Produces: `DinnerSeating({ dinner }: { dinner: DinnerView })`（testid `dinner-seating`、各テーブル `dinner-table`、自分の丸 `dinner-you`）、`MeBar()`（testid `me-bar`）、`NowBanner()`（testid `now-banner`）

- [ ] **Step 1: e2e に `test('夕食の席が待機画面とモーダルで見られ、自分に印が付く')` を足し、失敗を確かめる**
- [ ] **Step 2: 実装**
  - `DinnerSeating`: テーブルごとのカード（見出し「{name}・{count}名」）。チームは破線の枠（`border-dashed`、`border-accent`）で囲み、メンバーは丸（`tone` 0 / 1 の色は Task 9 で決めるトークン `--t-tone-0` / `--t-tone-1`。それまでは `bg-accent` / `bg-info`）。自分は太い枠と「あなた」。下に凡例（色・ラベル・人数）
  - `MeBar`（参加者だけ。名前を選んでいれば）:「{名前} さん ・ 夕食 {チーム}（{テーブル}）」と「夕食の席」ボタン（モーダルで `DinnerSeating`）。名前を選んでいなければ「名簿から自分の名前を選ぶ」ボタン（モーダルで `PickMyName`）
  - `NowBanner`（参加者だけ）: いまやることを1文で。待機「何も押さずに、司会の合図を待ちましょう」／クイズ 問題「問題を読みましょう（まだ答えられません）」・回答タイム「チームで相談して、下の答えを押しましょう」・答え「答えと、みんなの回答を見てみましょう」・結果「結果発表です」／座席 未選択「名簿から自分の名前を押しましょう」・未抽選「「くじを引く」を押しましょう」・決定「出たテーブルへ移動しましょう」／ビンゴ「読まれた番号のマスを押して開けましょう」
  - 待機画面（参加者）に `DinnerSeating` を出す。司会のカードにも「夕食の席」ボタン
  - `guides.tsx` の懇親会の説明（参加者・司会）を、名簿から入る・夕食の席・自分でくじ・自分でマスを押す、に合わせて直す
- [ ] **Step 3: `npm run typecheck`・`npm test`・`npx playwright test e2e/party-event.spec.ts` が通る**
- [ ] **Step 4: コミット** `feat: 懇親会の画面に、あなたの帯・いまやること・夕食の席を出す`

### Task 5: クイズ — 他のチームの回答と、問題ごとの点数

**Files:**
- Modify: `server/event/config.ts`, `server/games/party-event/quiz.ts`, `shared/games/views.ts`, `client/games/party-event/QuizSection.tsx`, `server/event/sample/quiz.json`
- Test: `tests/party-event-rules.test.ts`, `tests/event-config.test.ts`

**Interfaces:**
- Produces: `QuizQuestion.points`（int 1〜10、既定 1）、`QuizQuestionView.points: number`、`scoresOf` は正解した問題の `points` を足す。`quizView` の `answers`: 司会は今までどおり、参加者は `reveal` / `result` のときだけ全チーム（`seconds` は `null`）、それ以外は `null`

- [ ] **Step 1: 失敗する試験を書く**
  - config: `it('points を省くと 1、書けばその点')`、`it('points が 0 や 11 ならエラー')`
  - rules: `it('正解した問題の points を足す（最後の問題 3 点）')`、`it('参加者には回答タイム中は他チームの回答を見せず、答えの段から全チーム分を見せる')`（`answering` で `quizView(..., false, 'A').answers === null`、`reveal` で全チームの `text` と `correct`）
- [ ] **Step 2: 失敗を確かめる**
- [ ] **Step 3: 実装**。画面: 問題のカードに `points > 1` なら「この問題は {points} 点」、最終問題なら「最終問題」のバッジ（testid `quiz-points`）。参加者の答えの段に「みんなの回答」（testid `quiz-all-answers`。自分のチームに印、○ / × は印と言葉で）。得点の表示と優勝の「{n} 問正解」を「{n} 点」に。サンプルの最後の問題を `points: 3` に
- [ ] **Step 4: 試験・typecheck・e2e が通る**
- [ ] **Step 5: README・ガイドの点数の説明を直してコミット** `feat: クイズで答えの段から他のチームの回答を見せ、問題ごとに点数を決められるようにする`

### Task 6: 座席決め — 参加者が自分でくじを引く（演出つき）

**Files:**
- Modify: `server/games/party-event/seats.ts`, `server/games/party-event/PartyEventGame.ts`, `client/games/party-event/SeatsSection.tsx`, `client/index.css`（演出のキーフレーム）
- Test: `tests/party-event-rules.test.ts`, `tests/party-event.test.ts`, `e2e/party-event.spec.ts`

**Interfaces:**
- Produces: `seats.drawSelf(state: SeatsState, cfg: SeatsConfig, personId: string): DrawnPerson`（選んでいない → `UserError('先に名簿から自分の名前を選んでください')`、決まっている → `'もう席が決まっています'`、欠席 → `'欠席になっています。司会に声をかけてください'`）。操作 `seats:drawSelf`（参加者。`section !== 'seats'` なら `UserError('いまはくじを引けません')`）

- [ ] **Step 1: 失敗する試験を書く**
  - rules: `it('自分のくじは自分の席だけを決め、所属が偏らない入れ方を使う')`、`it('2回目はエラーで、席は変わらない')`、`it('欠席・未選択はエラー')`
  - socket: `it('座席決めを出していない間は引けない')`
- [ ] **Step 2: 失敗を確かめる**
- [ ] **Step 3: 実装**。画面（`MySeat`）: 席が未定なら大きな「くじを引く」（testid `seats-draw-self`）。押す・司会が引く、のどちらでも、自分の席が「未定 → 決定」に変わったら演出: 約 2.6 秒、テーブル名がスロットのように回って減速 → 止まって大きく表示（テーブル名が出るまでの間は testid `seats-reveal-spinning`、出たら今までの `my-table`）。`prefers-reduced-motion` なら 0.6 秒で表示。`navigator.vibrate` があれば止まったときに短く震わせる。同じ結果で2回演出しない（`sessionStorage` に「演出ずみ」）。司会の説明文と `guides.tsx` を「参加者が自分で引く。スマホが無い人は「1人引く」」に直す
- [ ] **Step 4: 試験・typecheck・e2e（参加者が自分で引く手順を足す）が通る**
- [ ] **Step 5: コミット** `feat: 座席決めで参加者が自分でくじを引けるようにし、結果が出るまでの演出を足す`

### Task 7: ビンゴ — 自分でマスを押して開ける

**Files:**
- Modify: `server/games/party-event/bingo.ts`, `server/games/party-event/PartyEventGame.ts`, `client/games/party-event/BingoSection.tsx`
- Test: `tests/party-event-rules.test.ts`, `tests/party-event-rooms.test.ts`, `e2e/party-event.spec.ts`

**Interfaces:**
- Produces: `BingoState.punched: Record<string, number[]>`（カードID → 開けた番号）、`bingo.punch(state: BingoState, cfg: BingoConfig, cardId: string, n: number): void`（カードに無い → `UserError('その番号はカードにありません')`、まだ読まれていない → `'まだ読まれていない番号です'`）、操作 `bingo:punch { number }`。`cardView(cfg, state, cardId, mode: 'opened' | 'called')`: 自分のカードは `opened`（開けた番号 ∩ 呼ばれた番号 で `marked`・`lines`・`bingo`・`reach`）、司会の確かめは `called`。`bingo:claim` の判定は変えない（呼ばれた番号）。`resetBingo` で `punched` も消す

- [ ] **Step 1: 失敗する試験を書く**
  - rules: `it('呼ばれた番号だけ開けられ、開けたマスで列を判定する')`、`it('戻した番号のマスは開いていない扱いになる')`、`it('受付の判定は呼ばれた番号のまま')`、`it('やり直すと開けたマスも消える')`
  - rooms: `it('punched の無い古い保存を読み戻しても動く')`（`restore` に `punched` の無い `bingo` を渡して、`bingo:punch` が通る）
- [ ] **Step 2: 失敗を確かめる**
- [ ] **Step 3: 実装**。画面: マスはボタン（testid `bingo-cell`、`data-number`）。押すと開く（丸＋押した印のアニメーション）。最新の番号がカードにあって未開なら、そのマスを点滅させ「いま読まれた {B 12} があります。押して開けましょう」。読まれたのに開けていないマスの数を小さく出す。「ビンゴ！」は開けたマスで1列そろったら。下の説明を「読まれた番号のマスを押すと開きます」に。`guides.tsx` も
- [ ] **Step 4: 試験・typecheck・e2e（引いた番号がカードにあればそのマスを押す）が通る**
- [ ] **Step 5: `CLAUDE.md` の不変条件「参加者のタップは当てにしない」を「受付の判定は呼ばれた番号だけ。開けたマスは画面とボタンの出し分けだけに使う」に直してコミット** `feat: ビンゴのマスを参加者が自分で押して開けるようにする`

### Task 8: チームでゲームを遊んで、チームごとの1位を残す

**Files:**
- Create: `client/lib/eventReturn.ts`
- Modify: `shared/protocol.ts`, `shared/results.ts`, `server/rooms/Room.ts`, `server/rooms/RoomManager.ts`, `server/results.ts`, `client/pages/CreateRoomPage.tsx`, `client/pages/Lobby.tsx`, `client/pages/LandingPage.tsx`, `client/pages/RoomPage.tsx`, `client/pages/ResultsPage.tsx`, `client/games/party-event/DinnerSeating.tsx`
- Test: `tests/results.test.ts`, `e2e/results.spec.ts`

**Interfaces:**
- Produces:
  - `'room:create'` に `label?: string`（`cleanText(label, 20)`。懇親会のルームでは無視）。`Room.label: string | null`、`RoomView.label: string | null`
  - `GameResult.label?: string | null`（古い `results.json` に無くても読める）。`ResultInput.label`
  - `eventReturn.ts`: `setTeamPlay(eventCode: string, team: string): void`、`getTeamPlay(): { eventCode: string; team: string } | null`、`clearTeamPlay(): void`（`localStorage`、try/catch）
- [ ] **Step 1: 失敗する試験を書く**: results `it('label を付けて作ったルームの結果に label が残る')`、`it('label の無い古い記録も読める')`
- [ ] **Step 2: 失敗を確かめる**
- [ ] **Step 3: 実装**
  - 夕食の席の自分のチームに「このチームでゲームを遊ぶ」（testid `team-play`）→ `setTeamPlay(code, team)` してトップのゲーム一覧へ
  - `CreateRoomPage`: `getTeamPlay()` があれば「{team} のルームとして作ります」と出し、`label` を付けて作る（「チームを付けない」で外せる）
  - `Lobby` / ルームのヘッダー: `label` があれば表示。`getTeamPlay()` があれば「懇親会の画面に戻る」（`/room/{eventCode}`、testid `back-to-event`）。トップにも同じ入口
  - `ResultsPage`: 各記録に `label` のバッジ。今日の記録に `label` があれば、上に「チームごとの1位」（チーム → そのチームの記録の1位の名前とゲーム名、終わった順）（testid `results-by-team`）
- [ ] **Step 4: 試験・typecheck・`npx playwright test e2e/results.spec.ts` が通る**
- [ ] **Step 5: README・`CLAUDE.md` の決めたことを足してコミット** `feat: 夕食のチームでゲームを遊ぶと、勝者の記録にチームごとの1位が出るようにする`

### Task 9: 配色にテンプレートの要素を取り入れる

**Files:**
- Modify: `client/themes/party-event.css`, `docs/design.md`
- Test: 目で確かめる（390px と PC 幅のスクリーンショット）、`npm test`（`tests/static.test.ts` があればそれも）

**Interfaces:**
- Produces: `--t-tone-0` / `--t-tone-1`（夕食の席の所属の色）と、それを使う Tailwind の色名（`bg-tone-0` など。既存のトークンの足し方に合わせる）

- [ ] **Step 1: 懇親会のテーマのトークンを差し替える**。メンフィスの形（波線・ドット・三角・ずらし影・丸い太字）は残し、色をテンプレートの青系に寄せる。テンプレート唯一の装飾「青の明度を段階的に並べた小さな四角の列」（`#218BFF` `#61B3FF` `#97D3FF` `#CEEDFF` `#E5F6FF`）を、地の模様と見出しの飾り（`.event-squares`）に入れる。黄・橙は「注目」と「お祝い」にだけ残す（ゲームらしさのため）
  - 地 `#f6f8fa`／文字 `#24292f`／補足 `#57606a`（6.0:1）／面 `#ffffff`／淡い面 `#e5f6ff`／線・影 `#0a3069`
  - 進行（押すもの）`accent` `#0969da`・文字 `#0550ae`・上の文字 `#ffffff`（5.19:1）
  - 正解・開いたマス `ok` `#4ac26b`・上の文字 `#24292f`（6.43:1）・文字 `#1a7f37`
  - 注目 `hi` / `warn` `#ffd23f`・上の文字 `#24292f`（10.15:1）・文字 `#7d4e00`
  - 危険 `danger` `#cf222e`・上の文字 `#ffffff`（5.36:1）・文字 `#a40e26`
  - 夕食の所属の色 `tone-0` `#b5501f`（白文字 5.08:1）、`tone-1` `#0a3069`（白文字 12.81:1）
  - 色の出どころ（テンプレートの名前・会社名）はコードにもコメントにも書かない（「主催のテンプレート」とだけ書く）
- [ ] **Step 2: 390px と 1280px で、待機・クイズ・座席・ビンゴ・夕食の席のスクリーンショットを撮って確かめる**（`e2e/screenshots/` は `.gitignore` 済み）
- [ ] **Step 3: `docs/design.md` の懇親会の行（配色）を直し、`npm run typecheck`・`npm test` を通してコミット** `style: 懇親会の配色に主催のテンプレートの色を取り入れる`

### Task 10: 通しの確認と本番の準備（非公開側）

- [ ] **Step 1: `npm run typecheck`・`npm test`・`npm run test:e2e` を全部流す**（「10秒裁判」の既知の不安定さは別扱い）
- [ ] **Step 2: 非公開リポジトリ `party-app-aws` に `data/dinner.json`（ユーザーの席の図のとおり）を作り、`data/quiz.json` の最後の問題に `points: 3` を足し、チームを夕食のチームに揃える。`docs/partybox.md` に反映の手順を書く**
- [ ] **Step 3: ユーザーに、PR・マージ・本番の反映（`deploy.sh` と `event-data` の置き換え、`docker restart`）の手順を渡す。懇親会の最中には反映しない**
