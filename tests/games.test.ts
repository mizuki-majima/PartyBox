import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { GrowView, LiarView, TrialView, WhoseView } from '../shared/games/views';
import type { PartyServer } from '../server/app';
import { parseImageDataUrl, planSteps } from '../server/games/grow-answer/GrowAnswerGame';
import { tallyLiarVotes } from '../server/games/liar/LiarGame';
import { decideVerdict, generateCase } from '../server/games/trial/TrialGame';
import { scoreWhoseRound } from '../server/games/whose-answer/WhoseAnswerGame';
import data from '../server/data/trial.json';
import { setupRoom, startGame, startTestServer, type TestClient, TINY_PNG } from './helpers';

let server: PartyServer;
let open: TestClient[] = [];

beforeAll(async () => {
  server = await startTestServer({ timeScale: 0.05 });
});
afterEach(() => {
  for (const c of open.splice(0)) c.close();
});
afterAll(async () => {
  await server.close();
});

/* ================================================================== */
describe('誰の答えでしょう？', () => {
  it('得点: 当てたら+2、当てられたら1人につき-1、誰にも当てられなければ+1', () => {
    const answers = [
      { id: 'x', authorId: 'A', text: 'ナイフ' },
      { id: 'y', authorId: 'B', text: '布団' },
      { id: 'z', authorId: 'C', text: '犬' },
    ];
    const guesses = new Map([
      ['A', new Map([['y', 'B'], ['z', 'B']])], // y 正解
      ['B', new Map([['x', 'C'], ['z', 'A']])], // 全部はずれ
      ['C', new Map([['x', 'B'], ['y', 'B']])], // y 正解
    ]);
    const { deltas, entries } = scoreWhoseRound(answers, guesses);
    expect(deltas).toEqual({ A: 2 + 1, B: -2, C: 2 + 1 });
    expect(entries.find((e) => e.id === 'y')!.correctGuessers.sort()).toEqual(['A', 'C']);
  });

  it('通しプレイ: 匿名の回答一覧 → 自分の回答は選べない → 全員確定で結果 → 次ラウンド', async () => {
    const { host, clients } = await setupRoom(server.port, 'whose-answer', 3, { rounds: 2 });
    open = clients;
    const [a, b, c] = clients;
    await startGame(host, clients, 'ANSWER');
    await a.actionOk('answer', { text: 'ナイフ' });
    await b.actionOk('answer', { text: 'Switch' });
    await c.actionOk('answer', { text: '布団' });
    await Promise.all(clients.map((x) => x.waitPhase('GUESS')));

    const view = a.game as WhoseView;
    expect(view.answers).toHaveLength(3);
    // 作者は送られない
    expect(JSON.stringify(view.answers)).not.toContain(b.id);
    const mine = view.answers!.find((x) => x.mine)!;
    expect(mine.text).toBe('ナイフ');
    expect(view.candidates.sort()).toEqual([b.id, c.id].sort());
    expect(await a.action('guess', { answerId: mine.id, playerId: b.id })).toMatchObject({ ok: false, error: expect.stringContaining('自分') });
    expect(await a.action('guess', { answerId: view.answers!.find((x) => !x.mine)!.id, playerId: a.id })).toMatchObject({ ok: false });

    // 全員が正しく推理する
    const authorOf: Record<string, string> = { ナイフ: a.id, Switch: b.id, 布団: c.id };
    for (const cl of clients) {
      const v = cl.game as WhoseView;
      for (const ans of v.answers!.filter((x) => !x.mine)) {
        await cl.actionOk('guess', { answerId: ans.id, playerId: authorOf[ans.text] });
      }
    }
    await a.actionOk('lock');
    await b.actionOk('lock');
    expect(a.game.phase).toBe('GUESS');
    await c.actionOk('lock');
    const res = await host.waitPhase('RESULT');
    const result = (res.game as WhoseView).result!;
    // 3人とも 2問正解(+4) & 自分の回答を2人に当てられる(-2)
    expect(result.deltas).toEqual({ [a.id]: 2, [b.id]: 2, [c.id]: 2 });
    expect(result.entries.find((e) => e.text === 'Switch')!.authorId).toBe(b.id);
    expect(res.game!.scores[a.id]).toBe(2);

    await host.actionOk('next');
    await host.waitPhase('ANSWER', (v) => v.game!.round === 2);
    for (const cl of clients) await cl.actionOk('answer', { text: `答え${cl.id}` });
    await host.waitPhase('GUESS');
    // 推理時間切れ（誰も推理しない） → 全員「当てられなかった」+1
    const r2 = await host.waitPhase('RESULT', () => true, 8000);
    expect((r2.game as WhoseView).result!.deltas).toEqual({ [a.id]: 1, [b.id]: 1, [c.id]: 1 });
    await host.actionOk('next');
    const over = await host.waitPhase('GAME_OVER');
    expect(over.game!.scores[a.id]).toBe(3);
  });
});

/* ================================================================== */
describe('嘘つきは誰だ？', () => {
  it('同票は見破れなかった扱い', () => {
    expect(tallyLiarVotes(new Map([['a', 'L'], ['b', 'L'], ['L', 'a']]), 'L').caught).toBe(true);
    expect(tallyLiarVotes(new Map([['a', 'L'], ['L', 'a']]), 'L').caught).toBe(false);
    expect(tallyLiarVotes(new Map(), 'L').caught).toBe(false);
  });

  it('通しプレイ: 嘘つきは1人だけでお題が見えない → 順番に発言 → 投票 → 逆転推理 → 結果', async () => {
    const { host, clients } = await setupRoom(server.port, 'liar', 4, { rounds: 2, mode: 'secret' });
    open = clients;
    await startGame(host, clients, 'ROLE');

    const views = clients.map((c) => c.game as LiarView);
    const liars = clients.filter((c) => (c.game as LiarView).amLiar);
    expect(liars).toHaveLength(1);
    const liar = liars[0];
    const citizens = clients.filter((c) => c !== liar);
    // 嘘つきには「あなたは嘘つき」とだけ。お題は届かない
    expect((liar.game as LiarView).myTopic).toBeNull();
    const topic = (citizens[0].game as LiarView).myTopic!;
    expect(topic).toBeTruthy();
    expect(citizens.every((c) => (c.game as LiarView).myTopic === topic)).toBe(true);
    expect(JSON.stringify(liar.view)).not.toContain(topic);
    // 誰が嘘つきかは市民に伝わらない
    expect(views.every((v) => !JSON.stringify(v).includes('liarId'))).toBe(true);

    for (const c of clients) await c.actionOk('ready');
    // 順番に発言
    for (let i = 0; i < 4; i++) {
      const v = await host.waitPhase('TALK', (v) => (v.game as LiarView).turnIndex === i);
      const speakerId = (v.game as LiarView).order[i];
      const speaker = clients.find((c) => c.id === speakerId)!;
      const other = clients.find((c) => c.id !== speakerId)!;
      expect(await other.action('speak', { text: 'ずるい' })).toMatchObject({ ok: false });
      await speaker.actionOk('speak', { text: `発言${i}` });
    }
    await host.waitPhase('VOTE');
    expect((host.game as LiarView).statements.map((s) => s.text)).toEqual(['発言0', '発言1', '発言2', '発言3']);
    expect(await liar.action('vote', { targetId: liar.id })).toMatchObject({ ok: false });

    // 市民全員が嘘つきに投票
    for (const c of citizens) await c.actionOk('vote', { targetId: liar.id });
    await liar.actionOk('vote', { targetId: citizens[0].id });
    const guess = await liar.waitPhase('LIAR_GUESS');
    const choices = (guess.game as LiarView).guessChoices!;
    expect(choices).toContain(topic);
    expect(choices).toHaveLength(6);
    expect(await citizens[0].action('guessTopic', { topic })).toMatchObject({ ok: false });
    await liar.actionOk('guessTopic', { topic });

    const res = await host.waitPhase('RESULT');
    const result = (res.game as LiarView).result!;
    expect(result).toMatchObject({ liarId: liar.id, caught: true, liarGuessCorrect: true, topic });
    for (const c of citizens) expect(result.deltas[c.id]).toBe(2);
    expect(result.deltas[liar.id]).toBe(3);

    // ラウンド2: 嘘つきが途中退出してもクラッシュせず、ラウンド無効
    await host.actionOk('next');
    await Promise.all(clients.map((c) => c.waitPhase('ROLE', (v) => v.game!.round === 2)));
    const liar2 = clients.find((c) => (c.game as LiarView).amLiar)!;
    await liar2.ok('room:leave');
    const others = clients.filter((c) => c !== liar2);
    const voided = await others[0].waitPhase('RESULT');
    expect((voided.game as LiarView).result!.note).toContain('無効');
  });

  it('ワードウルフモード: 嘘つきは別のお題を受け取り、自分が嘘つきだと知らない', async () => {
    const { host, clients } = await setupRoom(server.port, 'liar', 5, { rounds: 2, mode: 'wordwolf' });
    open = clients;
    await startGame(host, clients, 'ROLE');
    const topics = clients.map((c) => (c.game as LiarView).myTopic);
    expect(topics.every((t) => t)).toBe(true);
    expect(clients.every((c) => (c.game as LiarView).amLiar === null)).toBe(true);
    const counts = new Map<string, number>();
    for (const t of topics) counts.set(t!, (counts.get(t!) ?? 0) + 1);
    expect([...counts.values()].sort()).toEqual([1, 4]);
  });
});

/* ================================================================== */
describe('回答を育てろ', () => {
  it('ステップ数は人数以下で、基本は文章で終わる', () => {
    expect(planSteps(3, 'random')).toEqual(['draw', 'describe', 'draw']);
    expect(planSteps(4, 'random')).toEqual(['draw', 'describe', 'draw', 'describe']);
    expect(planSteps(5, 'random')).toHaveLength(4);
    expect(planSteps(3, 'custom')).toEqual(['write', 'draw', 'describe']);
    expect(planSteps(4, 'custom')).toEqual(['write', 'draw', 'describe']);
    expect(planSteps(8, 'custom').at(-1)).toBe('describe');
  });

  it('不正な画像は拒否する', () => {
    expect(() => parseImageDataUrl('data:text/html;base64,PGgxPg==')).toThrow();
    expect(() => parseImageDataUrl('data:image/png;base64,PGgxPg==')).toThrow(); // PNGではない中身
    expect(parseImageDataUrl(TINY_PNG).mime).toBe('image/png');
  });

  it('通しプレイ: 絵 → 文章 → 絵 → 文章 と回り、アルバムで時系列表示', async () => {
    const { host, clients } = await setupRoom(server.port, 'grow-answer', 4);
    open = clients;
    await startGame(host, clients, 'DRAW');
    // 各自が別のお題を受け取る
    const prompts = clients.map((c) => (c.game as GrowView).task!.source!.text);
    expect(new Set(prompts).size).toBe(4);

    for (const c of clients) await c.actionOk('submitDrawing', { dataUrl: TINY_PNG });
    await Promise.all(clients.map((c) => c.waitPhase('DESCRIBE')));
    const task = (clients[1].game as GrowView).task!;
    expect(task.kind).toBe('describe');
    expect(task.source!.kind).toBe('drawing');
    expect(task.source!.playerId).toBe(clients[0].id); // 前の人の絵が届く
    // 画像はHTTPで取得できる
    const img = await fetch(`http://localhost:${server.port}${task.source!.imageUrl}`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/png');

    for (const c of clients) await c.actionOk('submitText', { text: `説明by${c.session!.name}` });
    await host.waitPhase('DRAW', (v) => (v.game as GrowView).step === 2);
    // 1人は時間切れで描かない → 空として扱われ、次の人は直前の文章を見る
    for (const c of clients.slice(1)) await c.actionOk('submitDrawing', { dataUrl: TINY_PNG });
    await host.waitPhase('DESCRIBE', (v) => (v.game as GrowView).step === 3, 10000);
    for (const c of clients) await c.actionOk('submitText', { text: `最終${c.session!.name}` });

    const album = await host.waitPhase('ALBUM');
    const gv = album.game as GrowView;
    expect(gv.albums).toHaveLength(1);
    expect(gv.albums![0].entries.map((e) => e.kind)).toEqual(['prompt', 'drawing', 'text', 'drawing', 'text']);
    expect(gv.albums![0].entries[0].text).toBe(prompts[0]);
    expect(await clients[1].action('album', { index: 1 })).toMatchObject({ ok: false });
    await host.actionOk('album', { index: 3 });
    const all = await clients[2].waitFor((v) => (v.game as GrowView).albums?.length === 4);
    const emptyCount = (all.game as GrowView).albums!.flatMap((a) => a.entries).filter((e) => e.empty).length;
    expect(emptyCount).toBe(1);
    await host.actionOk('next');
    await host.waitPhase('GAME_OVER');
  });
});

/* ================================================================== */
describe('10秒裁判', () => {
  it('事件と証拠をランダム生成できる', () => {
    const roles = { d: 'defendant', p: 'prosecutor', f: 'defense', w1: 'witness', w2: 'witness' } as const;
    const c = generateCase(data.cases[0], 'たろう', roles, 'guilty');
    expect(c.info.question).toContain('たろう');
    expect(c.info.summary).not.toMatch(/\{\w+\}/);
    expect(Object.keys(c.cards).sort()).toEqual(['d', 'f', 'p', 'w1', 'w2']);
    expect(Object.values(c.cards).flat().every((t) => !/\{\w+\}/.test(t))).toBe(true);
    expect(decideVerdict(['guilty', 'innocent'])).toBe('innocent');
    expect(decideVerdict(['guilty', 'guilty', 'innocent'])).toBe('guilty');
  });

  it('通しプレイ: 役職と証拠配布 → 順番に発言 → 投票 → 判決と得点', async () => {
    const { host, clients } = await setupRoom(server.port, 'ten-sec-trial', 5, { rounds: 2 });
    open = clients;
    await startGame(host, clients, 'BRIEFING');
    const roles = (host.game as TrialView).roles;
    const byRole = (r: string) => clients.filter((c) => roles[c.id] === r);
    expect(byRole('defendant')).toHaveLength(1);
    expect(byRole('prosecutor')).toHaveLength(1);
    expect(byRole('defense')).toHaveLength(1);
    expect(byRole('witness')).toHaveLength(2);
    for (const c of clients) {
      const v = c.game as TrialView;
      expect(v.myCards.length).toBeGreaterThan(0);
      expect(v.myGoal).toBeTruthy();
      // 他人の証拠カードは見えない
      const others = clients.filter((o) => o !== c).flatMap((o) => (o.game as TrialView).myCards);
      for (const card of others) if (!v.myCards.includes(card)) expect(JSON.stringify(c.view)).not.toContain(card);
    }
    const defendant = byRole('defendant')[0];
    const prosecutor = byRole('prosecutor')[0];

    for (const c of clients) await c.actionOk('ready');
    const first = await host.waitPhase('TESTIMONY');
    expect((first.game as TrialView).order[0]).toBe(prosecutor.id);
    expect((first.game as TrialView).order.at(-1)).toBe(defendant.id);
    for (let i = 0; i < 5; i++) {
      const v = await host.waitPhase('TESTIMONY', (v) => (v.game as TrialView).turnIndex === i);
      const speaker = clients.find((c) => c.id === (v.game as TrialView).order[i])!;
      await speaker.actionOk('speak', { text: i === 0 ? '被告は有罪です！' : '' });
    }
    await host.waitPhase('VOTE');
    expect(await defendant.action('vote', { verdict: 'innocent' })).toMatchObject({ ok: false });
    for (const c of clients.filter((c) => c !== defendant)) await c.actionOk('vote', { verdict: 'guilty' });
    const res = await host.waitPhase('VERDICT');
    const result = (res.game as TrialView).result!;
    expect(result.verdict).toBe('guilty');
    expect(result.deltas[prosecutor.id]).toBeGreaterThanOrEqual(3);
    expect(result.deltas[defendant.id] ?? 0).toBe(0);
    const witnessDelta = result.deltas[byRole('witness')[0].id] ?? 0;
    expect(witnessDelta).toBe(result.truth === 'guilty' ? 2 : 0);
    expect(Object.keys(result.cards)).toHaveLength(5);

    // 次の裁判では被告が交代する
    await host.actionOk('next');
    const r2 = await host.waitPhase('BRIEFING', (v) => v.game!.round === 2);
    const newDefendant = Object.entries((r2.game as TrialView).roles).find(([, r]) => r === 'defendant')![0];
    expect(newDefendant).not.toBe(defendant.id);
  });
});
