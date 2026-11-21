import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PartyEventView } from '../shared/games/views';
import type { PartyServer } from '../server/app';
import { loadEventConfig } from '../server/event/config';
import { PartyEventGame } from '../server/games/party-event/PartyEventGame';
import type { GameContext } from '../server/games/types';
import { TestClient, setupRoom, sleep, startGame, startTestServer } from './helpers';

let server: PartyServer;
let open: TestClient[] = [];

beforeAll(async () => {
  server = await startTestServer();
});
afterEach(() => {
  for (const c of open.splice(0)) c.close();
});
afterAll(async () => {
  await server.close();
});

/** 懇親会のルームを立てて進行まで進める */
async function setupEvent(count = 3) {
  const r = await setupRoom(server.port, 'party-event', count);
  open.push(...r.clients);
  await startGame(r.host, r.clients, 'EVENT');
  return r;
}

const view = (c: TestClient) => c.view!.game as unknown as PartyEventView;

/* ================================================================== */
describe('司会用URL', () => {
  it('ルームを作った人に合言葉が渡り、参加者には渡らない', async () => {
    const { host, clients } = await setupEvent();
    expect(host.session!.hostToken).toMatch(/^[0-9a-f]{24}$/);
    expect(clients[1].session!.hostToken).toBeUndefined();
    expect(host.view!.youAreHost).toBe(true);
    expect(clients[1].view!.youAreHost).toBe(false);
  });

  it('合言葉を示した人は司会になり、違う合言葉は弾かれる', async () => {
    const { host, clients } = await setupEvent();
    const guest = clients[1];

    expect((await guest.emit('room:claimHost', { token: 'まちがい' })).ok).toBe(false);
    expect(guest.view!.youAreHost).toBe(false);

    await guest.ok('room:claimHost', { token: host.session!.hostToken });
    await guest.waitFor((v) => v.youAreHost, 3000, '司会になる');
    expect(view(guest).isHost).toBe(true);
  });

  it('司会でない人は進行できない', async () => {
    const { clients } = await setupEvent();
    const res = await clients[1].action('bingo:draw');
    expect(res.ok).toBe(false);
    expect(view(clients[1]).bingo.called).toHaveLength(0);
  });

  it('司会の回線が切れても、参加者に司会が移らない', async () => {
    const { host, clients } = await setupEvent();
    const hostId = host.id;
    host.close();
    await sleep(400); // hostTransferMs(150) を十分に超える
    await clients[1].waitFor((v) => v.players.some((p) => p.id === hostId && !p.connected), 3000, 'ホストの切断');
    expect(clients[1].view!.hostId).toBe(hostId);
    expect(clients[1].view!.youAreHost).toBe(false);
  });
});

/* ================================================================== */
describe('企画の切り替え', () => {
  it('司会が選んだ企画が全員に出る。切り替えても状態は消えない', async () => {
    const { host, clients } = await setupEvent();
    expect(view(clients[1]).section).toBe('none');

    await host.actionOk('event:section', { section: 'bingo' });
    await clients[1].waitFor((v) => (v.game as unknown as PartyEventView).section === 'bingo', 3000, 'ビンゴ');

    await host.actionOk('bingo:draw');
    await clients[1].waitFor((v) => (v.game as unknown as PartyEventView).bingo.called.length === 1, 3000, '1つ引く');

    // 座席決めへ移ってビンゴに戻っても、引いた番号は残っている
    await host.actionOk('event:section', { section: 'seats' });
    await host.actionOk('event:section', { section: 'bingo' });
    expect(view(host).bingo.called).toHaveLength(1);
  });
});

/* ================================================================== */
describe('クイズ（通信の中身）', () => {
  it('答えは reveal まで参加者に届かない', async () => {
    const { host, clients } = await setupEvent();
    const guest = clients[1];
    await host.actionOk('event:section', { section: 'quiz' });
    await host.actionOk('quiz:next'); // 第1問
    await host.actionOk('quiz:next'); // 回答タイム
    await guest.waitFor((v) => (v.game as unknown as PartyEventView).quiz.phase === 'answering', 3000, '回答タイム');

    // 参加者に届いているビューそのものに答えが入っていないこと
    expect(view(guest).quiz.question?.answer).toBeNull();
    expect(JSON.stringify(guest.view)).not.toContain('解説');
    expect(view(host).quiz.question?.answer).not.toBeNull();

    await host.actionOk('quiz:next'); // 答え
    await guest.waitFor((v) => (v.game as unknown as PartyEventView).quiz.phase === 'reveal', 3000, '答え');
    expect(view(guest).quiz.question?.answer).not.toBeNull();
  });

  it('チームを選ばないと回答できない。選べばチームの回答として記録される', async () => {
    const { host, clients } = await setupEvent();
    const guest = clients[1];
    const cfg = loadEventConfig();
    await host.actionOk('event:section', { section: 'quiz' });
    await host.actionOk('quiz:next');
    await host.actionOk('quiz:next');

    expect((await guest.action('quiz:answer', { qno: 1, choice: 0 })).ok).toBe(false);
    await guest.actionOk('quiz:team', { team: cfg.quiz.teams[0] });
    await guest.actionOk('quiz:answer', { qno: 1, choice: 0 });

    await host.waitFor((v) => (v.game as unknown as PartyEventView).quiz.answeredTeams.length === 1, 3000, '回答');
    expect(view(host).quiz.answers?.[0].team).toBe(cfg.quiz.teams[0]);
    // 他の参加者には中身が見えない
    expect(view(clients[2]).quiz.answers).toBeNull();
  });
});

/* ================================================================== */
describe('ビンゴ（通信の中身）', () => {
  it('参加者ごとに違うカードが配られ、他人のカードは送られない', async () => {
    const { host, clients } = await setupEvent();
    await host.actionOk('event:section', { section: 'bingo' });
    const a = view(clients[1]).bingo.myCard!;
    const b = view(clients[2]).bingo.myCard!;
    expect(a.cardId).not.toBe(b.cardId);
    expect(JSON.stringify(clients[1].view)).not.toContain(b.cardId);
  });

  it('揃っていない「ビンゴ！」は弾かれる', async () => {
    const { host, clients } = await setupEvent();
    await host.actionOk('event:section', { section: 'bingo' });
    const res = await clients[1].action('bingo:claim');
    expect(res.ok).toBe(false);
  });

  it('途中から入った人にもカードが配られる', async () => {
    const { host, code } = await setupEvent();
    await host.actionOk('event:section', { section: 'bingo' });

    const late = await TestClient.connect(server.port);
    open.push(late);
    await late.join(code, 'あとから');
    await late.waitFor((v) => Boolean((v.game as unknown as PartyEventView)?.bingo.myCard), 3000, 'カード配布');
    expect(view(late).bingo.myCard?.cardId).toMatch(/^[A-Z0-9]{4}$/);
    expect(view(late).me).not.toBeNull(); // 観戦者ではなく参加者
  });
});

/* ================================================================== */
describe('座席決め（通信の中身）', () => {
  it('名前は1人ずつしか選べない', async () => {
    const { host, clients } = await setupEvent();
    await host.actionOk('event:section', { section: 'seats' });
    await clients[1].actionOk('seats:claim', { personId: 'p1' });
    expect((await clients[2].action('seats:claim', { personId: 'p1' })).ok).toBe(false);
    await clients[2].actionOk('seats:claim', { personId: 'p2' });
    await clients[2].waitFor((v) => (v.game as unknown as PartyEventView).seats.myPersonId === 'p2', 3000, '名前の確定');
    expect(view(clients[2]).seats.myPersonId).toBe('p2');
  });
});

/* ================================================================== */
describe('再起動をまたぐ保存', () => {
  /** ルームに繋がない、試験用の最小のコンテキスト */
  const ctx = (): GameContext => ({
    update: () => {},
    playerName: (id) => id,
    isConnected: () => true,
    scale: (ms) => ms,
    storeImage: () => '',
    drawFromDeck: (_d, pool, n) => [...pool].slice(0, n),
  });

  it('引いた番号・決まった席・クイズの進行が復元される', () => {
    const cfg = loadEventConfig();
    const before = new PartyEventGame(ctx(), ['p1', 'p2'], {}, cfg);
    before.start();
    before.handleAction('p1', { type: 'event:section', section: 'bingo' }, true);
    before.handleAction('p1', { type: 'bingo:draw' }, true);
    before.handleAction('p1', { type: 'bingo:draw' }, true);
    before.handleAction('p1', { type: 'seats:draw' }, true);
    before.handleAction('p1', { type: 'quiz:next' }, true);
    const snap = before.snapshot();
    const cardId = before.viewFor('p1', false).bingo.myCard?.cardId;

    // JSON を通す（実際の保存と同じ経路）
    const after = new PartyEventGame(ctx(), ['p1', 'p2'], {}, cfg);
    after.restore(JSON.parse(JSON.stringify(snap)));
    const v = after.viewFor('p1', true);

    expect(v.section).toBe('bingo');
    expect(v.bingo.called).toEqual(before.viewFor('p1', true).bingo.called);
    expect(v.bingo.myCard?.cardId).toBe(cardId); // 手元のカードが変わらない
    expect(v.seats.drawn).toBe(1);
    expect(v.quiz.qno).toBe(1);
  });

  it('回答タイムの途中で落ちた場合は締め切った状態で戻す', () => {
    const cfg = loadEventConfig();
    const game = new PartyEventGame(ctx(), ['p1'], {}, cfg);
    game.restore({
      section: 'quiz',
      quiz: { phase: 'answering', qno: 1, startedAt: Date.now() - 60_000, deadline: Date.now() - 30_000, graded: {}, answers: {}, teamOf: {} },
      bingo: { called: [], claims: [], prizes: null, cards: {} },
      seats: { assign: {}, absent: [], order: [], extras: [], claimed: {} },
    });
    expect(game.viewFor('p1', true).quiz.phase).toBe('reveal');
  });
});
