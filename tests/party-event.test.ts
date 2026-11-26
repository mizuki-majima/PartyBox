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
    const cfg = loadEventConfig();
    await host.actionOk('event:section', { section: 'quiz' });
    await host.actionOk('quiz:next'); // 第1問
    await host.actionOk('quiz:next'); // 回答タイム
    await guest.waitFor((v) => (v.game as unknown as PartyEventView).quiz.phase === 'answering', 3000, '回答タイム');

    // 参加者に届いているビューそのものに答えと解説が入っていないこと
    const note = cfg.quiz.questions[0].note!;
    expect(note).toBeTruthy(); // サンプルに解説がある前提の試験
    expect(view(guest).quiz.question?.answer).toBeNull();
    expect(view(guest).quiz.question?.note).toBeNull();
    expect(JSON.stringify(guest.view)).not.toContain(note);
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
describe('クイズ: 自分のチームの正誤', () => {
  it('答えの段になってから、正解したチームと外したチームの参加者に届く（回答タイムの間は届かない）', async () => {
    const { host, clients } = await setupEvent(4);
    const [, right, wrong, noTeam] = clients;
    const cfg = loadEventConfig();
    const correctChoice = cfg.quiz.questions[0].answer as number;
    await right.actionOk('quiz:team', { team: cfg.quiz.teams[0] });
    await wrong.actionOk('quiz:team', { team: cfg.quiz.teams[1] });
    await host.actionOk('quiz:next'); // 第1問
    await host.actionOk('quiz:next'); // 回答タイム
    await right.actionOk('quiz:answer', { qno: 1, choice: correctChoice });
    await wrong.actionOk('quiz:answer', { qno: 1, choice: correctChoice + 1 });
    await wrong.waitFor((v) => (v.game as unknown as PartyEventView).quiz.myAnswer !== null, 3000, '回答');
    // 回答タイムの間は、正誤を送らない（答えの手がかりになる）
    expect(view(right).quiz.myCorrect).toBeNull();
    expect(view(wrong).quiz.myCorrect).toBeNull();

    await host.actionOk('quiz:next'); // 答え
    await noTeam.waitFor((v) => (v.game as unknown as PartyEventView).quiz.phase === 'reveal', 3000, '答え');
    await right.waitFor((v) => (v.game as unknown as PartyEventView).quiz.phase === 'reveal', 3000, '答え');
    await wrong.waitFor((v) => (v.game as unknown as PartyEventView).quiz.phase === 'reveal', 3000, '答え');
    expect(view(right).quiz.myCorrect).toBe(true);
    expect(view(wrong).quiz.myCorrect).toBe(false);
    expect(view(noTeam).quiz.myCorrect).toBeNull(); // チームを選んでいない人には出さない
  });
});

/* ================================================================== */
describe('司会の二度押し・同時押し', () => {
  const phaseOf = (c: TestClient) => `${view(c).quiz.qno}:${view(c).quiz.phase}`;

  it('クイズ: 同じ画面から続けて届いた「次へ」は1回ぶんだけ進む（問題を読む前に回答タイムが始まらない）', async () => {
    const { host } = await setupEvent();
    await host.actionOk('quiz:next', { at: '0:idle' });
    // 画面が変わる前にもう一度押した（at は前のまま）。エラーにはせず、何もしない
    expect((await host.action('quiz:next', { at: '0:idle' })).ok).toBe(true);
    await host.waitFor(() => phaseOf(host) === '1:question', 3000, '第1問');
    await sleep(100);
    expect(phaseOf(host)).toBe('1:question');

    // 画面が変わってから押したものは進む
    await host.actionOk('quiz:next', { at: view(host).quiz.position });
    await host.waitFor(() => phaseOf(host) === '1:answering', 3000, '回答タイム');
  });

  it('クイズ: 司会2人が同じ段で同時に「次へ」を押しても、1つしか進まない。「戻す」も同じ', async () => {
    const { host, clients } = await setupEvent();
    const host2 = clients[1];
    await host2.ok('room:claimHost', { token: host.session!.hostToken });
    await host.actionOk('quiz:next', { at: '0:idle' });
    await host2.waitFor(() => phaseOf(host2) === '1:question', 3000, '第1問');
    await host.waitFor(() => phaseOf(host) === '1:question', 3000, '第1問');

    await Promise.all([
      host.actionOk('quiz:next', { at: '1:question' }),
      host2.actionOk('quiz:next', { at: '1:question' }),
    ]);
    await host.waitFor(() => phaseOf(host) === '1:answering', 3000, '回答タイム');
    await sleep(100);
    expect(phaseOf(host)).toBe('1:answering'); // 答えの段まで飛んでいない

    await Promise.all([
      host.actionOk('quiz:prev', { at: '1:answering' }),
      host2.actionOk('quiz:prev', { at: '1:answering' }),
    ]);
    await host.waitFor(() => phaseOf(host) === '1:question', 3000, '第1問に戻る');
    await sleep(100);
    expect(phaseOf(host)).toBe('1:question');
  });

  it('ビンゴ: 続けて届いた「番号を引く」「戻す」は1回ぶんだけ', async () => {
    const { host } = await setupEvent();
    await Promise.all([host.actionOk('bingo:draw', { at: 0 }), host.actionOk('bingo:draw', { at: 0 })]);
    await host.waitFor(() => view(host).bingo.called.length >= 1, 3000, '1個');
    await sleep(100);
    expect(view(host).bingo.called).toHaveLength(1);

    await host.actionOk('bingo:draw', { at: 1 });
    await host.waitFor(() => view(host).bingo.called.length === 2, 3000, '2個');
    await Promise.all([host.actionOk('bingo:undo', { at: 2 }), host.actionOk('bingo:undo', { at: 2 })]);
    await host.waitFor(() => view(host).bingo.called.length === 1, 3000, '戻す');
    await sleep(100);
    expect(view(host).bingo.called).toHaveLength(1);
  });

  it('座席: 続けて届いた「1人引く」は1人ぶんだけ', async () => {
    const { host, clients } = await setupEvent();
    const ids = view(host).seats.roster.map((p) => p.id);
    await clients[1].actionOk('seats:claim', { personId: ids[0] });
    await clients[2].actionOk('seats:claim', { personId: ids[1] });
    await Promise.all([host.actionOk('seats:draw', { at: 0 }), host.actionOk('seats:draw', { at: 0 })]);
    await host.waitFor(() => view(host).seats.drawn >= 1, 3000, '1人');
    await sleep(100);
    expect(view(host).seats.drawn).toBe(1);
    expect(view(host).seats.remaining).toBe(1);
  });

  it('at を付けない操作（反映の前から開いたままの画面）は、今までどおり受け付ける', async () => {
    const { host } = await setupEvent();
    await host.actionOk('bingo:draw');
    await host.actionOk('bingo:draw');
    await host.waitFor(() => view(host).bingo.called.length === 2, 3000, '2個');
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

  it('名簿で名前を選ぶと、夕食のチームと同じ名前のクイズのチームに入り、夕食の席に自分の印が付く', async () => {
    const { clients } = await setupEvent();
    const guest = clients[1];
    // サンプルの夕食の席では、さくら は「チーム A」。サンプルのクイズにも「チーム A」がある
    const sakura = view(guest).seats.roster.find((p) => p.name === 'さくら')!;
    await guest.actionOk('seats:claim', { personId: sakura.id });
    await guest.waitFor((v) => (v.game as unknown as PartyEventView).quiz.myTeam === 'チーム A', 3000, 'クイズのチーム');
    const d = view(guest).dinner!;
    expect(d.myTeam).toBe('チーム A');
    expect(d.tables[0].teams[0].members.find((m) => m.name === 'さくら')?.you).toBe(true);
    // ほかの人の画面では、さくら に自分の印は付かない
    expect(view(clients[2]).dinner!.tables[0].teams[0].members.find((m) => m.name === 'さくら')?.you).toBe(false);
  });

  it('参加者は座席決めを出している間だけ自分でくじを引け、2回目は弾かれる', async () => {
    const { host, clients } = await setupEvent();
    const guest = clients[1];
    await guest.actionOk('seats:claim', { personId: 'p1' });
    // 司会が座席決めを出していない間は引けない
    const early = await guest.action('seats:drawSelf');
    expect(early.ok).toBe(false);
    expect(!early.ok && early.error).toBe('いまはくじを引けません');
    expect(view(guest).seats.drawn).toBe(0);

    await host.actionOk('event:section', { section: 'seats' });
    await guest.actionOk('seats:drawSelf');
    await guest.waitFor((v) => (v.game as unknown as PartyEventView).seats.drawn === 1, 3000, 'くじ');
    const me = view(guest).seats.roster.find((p) => p.id === 'p1')!;
    expect(me.table).not.toBeNull();
    expect(view(guest).seats.last?.id).toBe('p1');
    expect((await guest.action('seats:drawSelf')).ok).toBe(false);
    expect(view(guest).seats.drawn).toBe(1);
  });

  it('別のスマホで選ばれている名前は、本人だと確かめると、こちらのスマホに移る', async () => {
    const { host, clients } = await setupEvent();
    await host.actionOk('event:section', { section: 'seats' });
    await clients[1].actionOk('seats:claim', { personId: 'p1' });
    await clients[2].waitFor((v) => (v.game as unknown as PartyEventView).seats.roster.find((p) => p.id === 'p1')!.taken, 3000, '選ばれている印');

    await clients[2].actionOk('seats:claim', { personId: 'p1', takeover: true });
    await clients[2].waitFor((v) => (v.game as unknown as PartyEventView).seats.myPersonId === 'p1', 3000, 'こちらに移った');
    await clients[1].waitFor((v) => (v.game as unknown as PartyEventView).seats.myPersonId === null, 3000, '前のスマホは選び直し');
  });

  it('名簿に無い人は自分の名前を足してくじに入れ、司会の画面に「くじに入る人」として出る', async () => {
    const { host, clients } = await setupEvent();
    await host.actionOk('event:section', { section: 'seats' });
    const groups = view(clients[1]).seats.groups;
    expect(groups.length).toBeGreaterThan(0);

    await clients[1].actionOk('seats:addSelf', { name: 'とびいり', group: groups[0] });
    await clients[1].waitFor((v) => (v.game as unknown as PartyEventView).seats.myPersonId === 'x1', 3000, '自分の名前');
    await host.waitFor((v) => (v.game as unknown as PartyEventView).seats.remaining === 1, 3000, 'くじに入る人');
    const added = view(host).seats.roster.find((p) => p.id === 'x1')!;
    expect(added).toMatchObject({ name: 'とびいり', group: groups[0], chosen: true });

    // 名簿にある名前は足せない
    const listed = view(clients[2]).seats.roster[0].name;
    expect((await clients[2].action('seats:addSelf', { name: listed, group: groups[0] })).ok).toBe(false);
    // くじに入れる操作は司会だけ
    expect((await clients[2].action('seats:present', { personId: 'p1' })).ok).toBe(false);
    await host.actionOk('seats:present', { personId: 'p1' });
    await host.waitFor((v) => (v.game as unknown as PartyEventView).seats.remaining === 2, 3000, '司会がくじに入れた');

    // 名前を選んだ人（足した人）と、司会が入れた人だけが引かれる
    await host.actionOk('seats:drawAll');
    await clients[1].waitFor((v) => (v.game as unknown as PartyEventView).seats.drawn === 2, 3000, '全員引いた');
    expect(view(host).seats.roster.filter((p) => p.table != null).map((p) => p.id).sort()).toEqual(['p1', 'x1']);
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
    before.handleAction('p2', { type: 'seats:claim', personId: 'p1' }, false); // 名前を選んだ人だけがくじに入る
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
      seats: { assign: {}, absent: [], order: [], extras: [], claimed: {}, present: [], selfAdded: {} },
    });
    expect(game.viewFor('p1', true).quiz.phase).toBe('reveal');
  });

  it('自分で名前を足す前に保存したファイル（present・selfAdded が無い）からも戻せる', () => {
    const cfg = loadEventConfig();
    const before = new PartyEventGame(ctx(), ['p1', 'p2'], {}, cfg);
    before.start();
    const old = JSON.parse(JSON.stringify(before.snapshot()));
    delete old.seats.present;
    delete old.seats.selfAdded;
    old.seats.claimed = { p2: 'p1' };

    const after = new PartyEventGame(ctx(), ['p1', 'p2'], {}, cfg);
    after.restore(old);
    expect(after.viewFor('p1', true).seats.remaining).toBe(1);
    after.handleAction('p1', { type: 'seats:addSelf', name: 'とびいり', group: '' }, false);
    expect(after.viewFor('p1', true).seats.remaining).toBe(2);
  });
});
