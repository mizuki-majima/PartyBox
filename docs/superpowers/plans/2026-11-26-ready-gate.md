# 準備OKを待ってから進む Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ゲーム開始・説明を読む画面・各ラウンドの頭を、時間で進めず「全員の準備OK → 自動でカウントダウン（ホストが止められる）→ 進む」にし、ラウンドの頭でホストが「ロビーに戻る」「ここで終了」を選べるようにする。

**Architecture:** `BaseGame` に「準備の関門」（`openGate`）を1つ作り、全ゲームの開始・各ゲームのラウンドの頭はそれを呼ぶだけにする。関門の状態はビューの共通の欄 `gate` で配り、画面は共通の部品 `ReadyGate` で出す。

**Tech Stack:** TypeScript（strict）、React 19、Socket.IO、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-11-26-ready-gate-design.md`

## Global Constraints

- 関門: 全員（切れている人を除く、抜けていない参加者）が準備OK → 自動でカウントダウン 3秒（`ctx.scale` を通す）→ 進む。カウントダウン中はホストが「止める」→ 全員の準備OKを取り消して待つ画面に戻る
- ホストは待つ画面で「待たずに始める」（ゲーム開始）／「待たずに進む」（それ以外）＝すぐカウントダウン。今の汎用の `skip` を使う
- 関門を置く所: ゲーム開始（全ゲーム。今の 4秒の代わり）、嘘つきの役割確認（毎ラウンド。15秒をやめる）、10秒裁判の事件と役職（毎件。30秒をやめる）、誰の答え・全員一致・広告をすり抜けろ！の「ROUND n」（**2ラウンド目から**。1ラウンド目は今までどおり 3秒で進む）。回答を育てろはゲーム開始だけ。懇親会は変えない
- ラウンドの頭（2ラウンド目から）でホストに「ロビーに戻る」（今の `room:backToLobby`）と「ここで終了」。ゲーム開始の関門には「ロビーに戻る」だけ
- ここで終了: それまでに終わったラウンド（`round - 1`）の点で最終結果（GAME_OVER、`endReason` は null）→ 勝者の記録に残る
- 10秒裁判はトップの一覧とロビーの「ゲーム変更」から隠す（`GameMeta.hidden`）。`/play/ten-sec-trial` は開ける
- 懇親会のデモの仮名に、本番の名前（`nameKey` で2文字以上）を一部にでも含むものを使わない
- 画面の文言は日本語・短く平易。押すものの名前は「」でそのとおりに書く（CLAUDE.md）。E2E は `data-testid` で掴む

## Review Focus

1. 準備OKを押したあとに切れた人・押す前に切れた人がいても止まらないこと（切れたら待つ相手から外れ、残りがそろっていれば進む）→ Task 1 の試験「切れている人は待たない」
2. カウントダウン中に人が抜けて最少人数を下回ったら、今までどおりゲームを打ち切ること（関門の途中でも `onPlayerLeave` の打ち切りが先）→ Task 1 の試験で、カウントダウン中に抜けて GAME_OVER になることを見る
3. 「止める」を2回押す・カウントダウンが終わる瞬間に押す、で二重に進まないこと（`advance` の多重呼び出し無視に乗る）→ Task 1 の試験で、止めたあとに準備OKがそろうと1回だけ進む
4. 「ここで終了」を1ラウンド目（ゲーム開始の関門）やホスト以外が押しても何も起きないこと → Task 2 の試験
5. 嘘つき・10秒裁判の画面で、今までの「確認した！」の数の表示が新しい関門の数と食い違わないこと → Task 3 で、画面の数を `gate.ready` から出す

---

### Task 1: `BaseGame` の準備の関門と、ゲーム開始

**Files:**
- Modify: `server/games/BaseGame.ts`（関門の状態・`openGate`・`handleAction` での `ready` / `gate:stop`・切断と退出での確認・`baseView` の `gate`・`start()`）
- Modify: `shared/protocol.ts`（`GameViewBase` に `gate: GateView | null`、`GateView` 型）
- Modify: `tests/helpers.ts`（`startGame` が全員の `ready` を送ってから最初のフェーズを待つ。`passGate(clients)` を足す）
- Modify: 既存の Vitest で `room:start` のあと直接フェーズを待っているもの（`grep -n "room:start" tests/*.ts`）を `passGate` 経由に
- Test: `tests/ready-gate.test.ts`（新規）

**Interfaces:**
- Produces（`shared/protocol.ts`）: `interface GateView { ready: string[]; counting: boolean; canEnd: boolean }`、`GameViewBase.gate: GateView | null`
- Produces（`BaseGame`）: `protected openGate(phase: P | 'START', opts: { roundHead?: boolean; onGo: () => void }): void`（待つ画面を出す。`canEnd = roundHead === true && this.round > 1`）、`static readonly GATE_COUNTDOWN_MS = 3000`
- Produces（操作）: `game:action { type: 'ready' }`（関門があるときは BaseGame が受ける。参加者のみ）、`{ type: 'gate:stop' }`（ホストのみ・カウントダウン中のみ）
- Produces（試験の道具）: `passGate(clients: TestClient[]): Promise<void>`（全員が `ready` を送る）

- [ ] **Step 1: 試験を書く** — `tests/ready-gate.test.ts`（誰の答え・3人で）:
  - `開始しても時間では進まない`: `room:start` → phase `START`・`gate.counting === false`・`deadline === null`。`sleep(300)`（4000ms × 1/50 を十分越える）後も `START`
  - `全員が準備OKを押すと、自動でカウントダウン → 最初のラウンドへ`: 2人が ready → まだ `counting false`、3人目 → `counting true`・`deadline` あり → `ROUND_INTRO` か `ANSWER`
  - `止めると準備OKが取り消され、もう一度そろうと1回だけ進む`: カウントダウン中に host `gate:stop` → `counting false`・`gate.ready` 空。ホスト以外の `gate:stop` は ok:false。もう一度全員 ready → 進み、`round === 1`
  - `切れている人は待たない`: 1人が close → 残り2人の ready で `counting true`
  - `ホストの「待たずに始める」（skip）でカウントダウンに入る`: ready 0人で host `skip` → `counting true`
  - `カウントダウン中に人が抜けて最少人数を下回ると、打ち切る`（2人のゲームで）: 全員 ready → カウントダウン中に1人 `room:leave` → `GAME_OVER`・`endReason` あり
- [ ] **Step 2: 落ちることを確かめる** — `npx vitest run tests/ready-gate.test.ts` → `gate` が無く・START が 4秒で進んで落ちる
- [ ] **Step 3: 実装する** — `openGate` は `setPhase(phase, { onEnd: () => this.beginCountdown() })`（時間なし）。`beginCountdown` は `counting = true` にして `setPhase(this.phase, { duration: GATE_COUNTDOWN_MS, onEnd: 関門を消して onGo })`。待つ相手は `this.active.filter((id) => this.ctx.isConnected(id))`。そろったら `advance()`（1人もつながっていなければ進まない）。`start()` は `openGate('START', { onGo: () => this.beginGame() })`。`handleAction` は関門があるとき `ready` と `gate:stop` を先に受ける（`skip` は今の汎用のまま）。`onPlayerConnectionChange` と `onPlayerLeave`（打ち切りの判定のあと）で関門の確認をやり直す。`helpers.ts` と既存の試験を直す
- [ ] **Step 4: 通ることを確かめる** — `npx tsc --noEmit -p . && npx vitest run` → すべて通る
- [ ] **Step 5: コミット** — `feat: ゲーム開始のあと、全員の準備OKを待ってからカウントダウンして始める（ホストは止められる）`

---

### Task 2: 各ラウンドの頭の関門と「ここで終了」

**Files:**
- Modify: `server/games/BaseGame.ts`（`gate:end` と `finishEarly()`）
- Modify: `server/games/whose-answer/WhoseAnswerGame.ts:88`・`server/games/unanimous/UnanimousGame.ts:88`・`server/games/ad-dodge/AdDodgeGame.ts:111`（2ラウンド目から `openGate('ROUND_INTRO', { roundHead: true, onGo })`。1ラウンド目は今の 3秒）
- Modify: `server/games/liar/LiarGame.ts:93`（`openGate('ROLE', { roundHead: true, onGo: () => this.nextTurn() })`。ROLE の独自の `ready` と完了判定を外し、ビューの `ready` も外す）・`server/games/trial/TrialGame.ts:151`（同じく BRIEFING）
- Modify: 嘘つき・10秒裁判の型（`shared/games/views.ts` の `LiarView.ready`・`TrialView.ready` を外す）
- Test: `tests/ready-gate.test.ts`（足す）、既存の `tests/games.test.ts`・`tests/results.test.ts`・`tests/unanimous.test.ts`（2ラウンド目の頭で `passGate`）

**Interfaces:**
- Consumes: Task 1 の `openGate`・`GateView`・`passGate`
- Produces: `game:action { type: 'gate:end' }`（ホストのみ・`gate.canEnd` のときのみ）。`protected finishEarly(): void`（`round` と `totalRounds` を `round - 1` にして `endGame(null)`）

- [ ] **Step 1: 試験を書く**:
  - `2ラウンド目の頭は、全員の準備OKまで待つ`（誰の答え・2ラウンド）: 1ラウンド目を終える → `ROUND_INTRO`・`round 2`・`gate.canEnd true`・`deadline null`。`sleep(300)` 後も同じ。`passGate` → `ANSWER`
  - `ここで終了: それまでの点で最終結果を出し、勝者の記録に残す`: 2ラウンド目の頭で host `gate:end` → `GAME_OVER`・`endReason null`・`totalRounds 1`・`server.manager.results.list()` が1件増える
  - `ここで終了は、ゲーム開始の関門・ホスト以外では受け付けない`: START で host `gate:end` → ok:false、2ラウンド目の頭で参加者の `gate:end` → ok:false
  - `嘘つきの役割確認は時間で進まず、全員の「確認した！」で進む`（`mode: 'secret', laps: 1`）: ROLE で `sleep(600)`（15000 × 1/50 を越える）後も ROLE → 全員 ready → `TALK`
  - `10秒裁判の事件と役職も同じ`: BRIEFING で `sleep(1000)`（30000 × 1/50）後も BRIEFING → 全員 ready → `TESTIMONY`
- [ ] **Step 2: 落ちることを確かめる** — `npx vitest run tests/ready-gate.test.ts`
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 通ることを確かめる** — `npx tsc --noEmit -p . && npx vitest run`
- [ ] **Step 5: コミット** — `feat: 各ラウンドの頭と説明の画面も、全員の準備OKで進め、ホストは「ここで終了」できる`

---

### Task 3: 画面（`ReadyGate`）と E2E

**Files:**
- Create: `client/components/ReadyGate.tsx`（`export function ReadyGate({ readyLabel = '準備OK', skipLabel = '待たずに進む' }: { readyLabel?: string; skipLabel?: string })`）
- Modify: `client/components/game.tsx`（`StartSplash` は遊び方の下に `<ReadyGate skipLabel="待たずに始める" />`。今の4秒の数字と「すぐに始める」を外す）
- Modify: `client/games/whose-answer/WhoseScreen.tsx`・`unanimous/UnanimousScreen.tsx`・`ad-dodge/AdDodgeScreen.tsx`（`ROUND_INTRO` で `game.gate` があれば `RoundIntro` の中に `<ReadyGate />`）、`liar/LiarScreen.tsx`・`trial/TrialScreen.tsx`（役割確認・事件の画面の独自の「確認した！」と数の表示を `<ReadyGate readyLabel="確認した！" />` に置き換える）
- Modify: `client/guides.tsx`（各ゲームの遊び方に「全員が「準備OK」を押すと、3・2・1 で始まります」を1行。ホストの「止める」「ここで終了」も）
- Modify: E2E（`e2e/helpers.ts` に `readyAll(players)`。`games.spec.ts`・`unanimous.spec.ts`・`results.spec.ts`・`ad-dodge.spec.ts`・`solo-demo.spec.ts` の開始のあとと2ラウンド目の頭で押す。嘘つき・10秒裁判の `ready` を `gate-ready` に）
- Test: `e2e/games.spec.ts` に `準備の関門: 全員の準備OKでカウントダウン → ホストが止める → もう一度そろって始まる → 2ラウンド目の頭で「ここで終了」→ 最終結果`（誰の答え・3人）

**Interfaces:**
- Consumes: Task 1・2 の `game.gate`（`GateView`）、操作 `ready`・`gate:stop`・`gate:end`・`skip`、ルームの `room:backToLobby`（画面に今ある「ロビーへ」の送り方を使う）
- Produces（目印）: 準備OKボタン `gate-ready`（押したあとは押せない表示）、数の表示 `gate-status`、カウントダウンの数字 `gate-count`、ホストの「止める」`gate-stop`、「待たずに始める／進む」`gate-skip`、「ロビーに戻る」`gate-lobby`（確かめてから）、「ここで終了」`gate-end`（確かめてから。`gate.canEnd` のときだけ）

- [ ] **Step 1: E2E を書く**（上の Test の1件）
- [ ] **Step 2: 落ちることを確かめる** — `E2E_PORT=3250 PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 npx playwright test e2e/games.spec.ts -g 準備の関門`
- [ ] **Step 3: 画面を作り、既存の E2E を直す**
- [ ] **Step 4: 通ることを確かめる** — `.e2e-state/` をよけてから E2E を全部流す（`npx playwright test`）→ すべて通る
- [ ] **Step 5: コミット** — `feat: 準備OKの画面（全員の準備OK・カウントダウン・止める・ここで終了・ロビーに戻る）`

---

### Task 4: 10秒裁判を隠す・デモの仮名の直し・文書

**Files:**
- Modify: `shared/games.ts`（`GameMeta.hidden?: boolean`、10秒裁判に `hidden: true`）、`client/pages/LandingPage.tsx`・`client/pages/Lobby.tsx:357`（`!g.hidden` だけ出す）、`client/pages/tech/Catalog.tsx`（隠しているゲームに「（一覧に出していない）」）
- Modify: `server/event/demoConfig.ts`（本番の名前の `nameKey` が2文字以上なら、それを含む仮名を使わない）
- Modify: README（ゲームの状態管理の節・ゲーム一覧の10秒裁判）、CLAUDE.md（決めたことの表に3行）、`client/pages/tech/diagrams.ts`（`BASE_STATES` と `AD_DODGE_STATES` を関門の形に）
- Test: `tests/demo-config.test.ts`（`本番の名簿が名字だけ（2文字）でも、それを含む仮名を使わない`: 名簿 `['加藤', '健太', ...]` → どの仮名も `加藤`・`健太` を含まない）、`e2e/navigation.spec.ts`（トップに `game-card-ten-sec-trial` が無い・`/play/ten-sec-trial` は開ける）

- [ ] **Step 1: 試験を書く**
- [ ] **Step 2: 落ちることを確かめる** — `npx vitest run tests/demo-config.test.ts` と該当の E2E
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 通ることを確かめる** — `npx tsc --noEmit -p . && npx vitest run`、`npx playwright test e2e/navigation.spec.ts`
- [ ] **Step 5: コミット** — `feat: 10秒裁判を一覧から隠し、デモの仮名に本番の名字を使わないようにする`
