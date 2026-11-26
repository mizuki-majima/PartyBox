import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AdDodgeView } from '../shared/games/views';
import type { PartyServer } from '../server/app';
import { finishPoints } from '../server/games/ad-dodge/AdDodgeGame';
import {
  createRng,
  generateRound,
  hitTest,
  landingStep,
  MIN_HIT,
  passPoint,
  TRAP_INFO,
  TRAP_KINDS,
  type Zone,
  zoneRectAt,
} from '../server/games/ad-dodge/stages';
import { setupRoom, startGame, startTestServer, type TestClient } from './helpers';

const settled = (zones: Zone[]) => Math.max(0, ...zones.map((z) => Math.max(z.from ?? 0, z.shift?.at ?? 0)));
const center = (z: { x: number; y: number; w: number; h: number }) => ({ x: z.x + z.w / 2, y: z.y + z.h / 2 });

describe('ページ作り・当たり判定', () => {
  it('同じ種なら同じページ。罠は重ならず、やさしい順に並ぶ', () => {
    const a = generateRound(42, 8);
    expect(JSON.stringify(generateRound(42, 8))).toBe(JSON.stringify(a));
    expect(JSON.stringify(generateRound(43, 8))).not.toBe(JSON.stringify(a));
    expect(a).toHaveLength(8);
    expect(new Set(a.map((p) => p.kind)).size).toBe(8);
    const tiers = a.map((p) => TRAP_INFO[p.kind].tier);
    expect([...tiers].sort()).toEqual(tiers);
    // 罠の種類より多いページ数でも作れる
    expect(generateRound(1, 15)).toHaveLength(15);
  });

  it('どの種・どの罠でも、すべての段に押せば進める場所がある', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 300; seed++) {
      for (const page of generateRound(seed, 10)) {
        seen.add(page.kind);
        page.steps.forEach((step, i) => {
          const p = passPoint(step.zones, settled(step.zones));
          expect(p, `${page.kind} step ${i} seed ${seed}`).not.toBeNull();
          // 最後の段だけがページを抜ける
          const acts = step.zones.filter((z) => z.act !== 'trap').map((z) => z.act);
          expect(acts).toEqual([i === page.steps.length - 1 ? 'exit' : 'step']);
        });
      }
    }
    expect([...seen].sort()).toEqual([...TRAP_KINDS].sort());
  });

  it('見えている本物（✕・ボタン・リンク）の真ん中を押せば進む。上に罠も絵も重なっていない', () => {
    const inside = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
      a.x >= b.x - 0.01 && a.y >= b.y - 0.01 && a.x + a.w <= b.x + b.w + 0.01 && a.y + a.h <= b.y + b.h + 0.01;
    for (let seed = 0; seed < 300; seed++) {
      for (const page of generateRound(seed, 11)) {
        page.steps.forEach((step, i) => {
          const pass = step.zones.find((z) => z.act !== 'trap')!;
          const t = Math.max(pass.from ?? 0, pass.shift?.at ?? 0) + 1;
          const area = zoneRectAt(pass, t)!;
          const shown = step.els.filter((e) => (e.from == null || t >= e.from) && (e.until == null || t < e.until));
          const at = (e: (typeof shown)[number]) => {
            const moved = e.shift && t >= e.shift.at;
            return { x: e.x + (moved ? e.shift!.dx : 0), y: e.y + (moved ? e.shift!.dy : 0), w: e.w, h: e.h };
          };
          // 押せる範囲の中に収まっている、見えている部品が本物
          const realIndex = shown.findIndex((e) => e.shape !== 'sheet' && e.shape !== 'ghost' && inside(at(e), area));
          const label = `${page.kind} step ${i} seed ${seed}`;
          expect(realIndex, label).toBeGreaterThanOrEqual(0);
          const c = center(at(shown[realIndex]));
          expect(hitTest(step.zones, c.x, c.y, t), label).toBe(pass);
          // 後ろに描く（上に重なる）部品が、本物の真ん中を隠していない
          for (const e of shown.slice(realIndex + 1)) {
            const r = at(e);
            expect(c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h, `${label} covered by ${e.shape}`).toBe(false);
          }
          // 本物の範囲を広げても、ほかの部品（偽の✕・派手なボタン・PR のリンクなど）の真ん中までは届かない
          shown.forEach((e, k) => {
            if (k === realIndex) return;
            const o = center(at(e));
            expect(hitTest(step.zones, o.x, o.y, t), `${label} decoy ${e.shape}/${e.tone ?? ''}`).not.toBe(pass);
          });
        });
      }
    }
  });

  it('本物の押せる範囲は、見た目が小さくても縦横とも MIN_HIT 以上（判定ずれだけは、絵の✕と重ならないよう小さめ）', () => {
    for (let seed = 0; seed < 300; seed++) {
      for (const page of generateRound(seed, 11)) {
        for (const step of page.steps) {
          const pass = step.zones.find((z) => z.act !== 'trap')!;
          const min = page.kind === 'misregister' ? 34 : MIN_HIT;
          expect(Math.min(pass.w, pass.h), `${page.kind} seed ${seed}`).toBeGreaterThanOrEqual(min);
        }
      }
    }
    // 広告のページの「← 戻る」も
    expect(Math.min(landingStep(createRng(1), 3000).zones.at(-1)!.w, landingStep(createRng(1), 3000).zones.at(-1)!.h)).toBeGreaterThanOrEqual(MIN_HIT);
  });

  it('上に重なった判定が勝つ。何も無い場所は null（罰なし）', () => {
    const zones: Zone[] = [
      { act: 'trap', x: 0, y: 0, w: 100, h: 100 },
      { act: 'exit', x: 80, y: 0, w: 20, h: 20 },
    ];
    expect(hitTest(zones, 90, 10, 0)?.act).toBe('exit');
    expect(hitTest(zones, 50, 50, 0)?.act).toBe('trap');
    expect(hitTest(zones, 200, 200, 0)).toBeNull();
  });

  it('罠の仕掛け: 見えている✕・待つ前のスキップ・ずれる前のボタン', () => {
    const find = (kind: string) => {
      for (let seed = 0; seed < 200; seed++) {
        const page = generateRound(seed, 11).find((p) => p.kind === kind);
        if (page) return page;
      }
      throw new Error(kind);
    };
    // 判定ずれ: くっきり見えている✕（絵）は罠で、薄い点線の✕が本物
    const mis = find('misregister').steps[0];
    const drawnX = mis.els.find((e) => e.shape === 'x' && e.tone === 'plain')!;
    const ghostX = mis.els.find((e) => e.shape === 'x' && e.tone === 'ghost')!;
    expect(hitTest(mis.zones, center(drawnX).x, center(drawnX).y, 0)?.act).toBe('trap');
    expect(hitTest(mis.zones, center(ghostX).x, center(ghostX).y, 0)?.act).toBe('exit');

    // 偽のスキップ: 数え終わる前に本物の場所を押すと、動画（広告）を押したことになる
    const cd = find('countdown').steps[0];
    const real = cd.els.find((e) => e.shape === 'btn' && e.tone === 'plain')!;
    expect(hitTest(cd.zones, center(real).x, center(real).y, 100)?.act).toBe('trap');
    expect(hitTest(cd.zones, center(real).x, center(real).y, real.from!)?.act).toBe('exit');

    // 割り込み広告: ずれる前ならボタン、ずれたあとの同じ場所は広告
    const sh = find('shift').steps[0];
    const btn = sh.els.find((e) => e.shape === 'btn')!;
    const at = btn.shift!.at;
    expect(hitTest(sh.zones, center(btn).x, center(btn).y, at - 1)?.act).toBe('exit');
    expect(hitTest(sh.zones, center(btn).x, center(btn).y, at)?.act).toBe('trap');
    expect(hitTest(sh.zones, center(btn).x, center(btn).y + btn.shift!.dy, at)?.act).toBe('exit');
  });

  it('ゴールの順の点', () => {
    expect([0, 1, 2, 3, 9].map(finishPoints)).toEqual([5, 3, 2, 1, 1]);
  });
});

describe('広告をすり抜けろ！ 通しプレイ', () => {
  let server: PartyServer;
  let open: TestClient[] = [];
  const g = (c: TestClient) => c.game as AdDodgeView;

  beforeAll(async () => {
    // 押せば進める場所をビューに入れる（E2E と同じ）
    process.env.PARTYBOX_AD_DODGE_REVEAL = '1';
    server = await startTestServer({ timeScale: 0.1 });
  });
  afterEach(() => {
    for (const c of open.splice(0)) c.close();
  });
  afterAll(async () => {
    delete process.env.PARTYBOX_AD_DODGE_REVEAL;
    await server.close();
  });

  /** その人の画面で、押せば進める場所を押す（押せるようになるまで待つ） */
  async function pass(c: TestClient) {
    const v = g(c);
    const target = v.debugTarget!;
    expect(target).toBeTruthy();
    // 連打の上限（1秒に8回）に当たらないように、人と同じくらいの間をあける
    const wait = Math.max(target.at - Date.now() + 5, 130);
    await new Promise((r) => setTimeout(r, wait));
    const extra = v.penalty ? { landing: v.penalty.id } : { page: v.stage!.page, step: v.stage!.step };
    const before = JSON.stringify([v.stage?.page, v.stage?.step, v.penalty?.id]);
    await c.actionOk('tap', { x: target.x, y: target.y, t: Date.now() - (v.penalty?.startedAt ?? v.stage!.startedAt), ...extra });
    await c.waitFor((view) => {
      const x = view.game as AdDodgeView;
      return x.phase !== 'RACE' || x.stage == null || JSON.stringify([x.stage?.page, x.stage?.step, x.penalty?.id]) !== before;
    });
  }

  async function runToGoal(c: TestClient) {
    for (let i = 0; i < 60 && g(c).phase === 'RACE' && g(c).stage; i++) await pass(c);
    expect(g(c).stage).toBeNull();
  }

  it('同じページ → 広告を押すとロック → 戻る → ゴールした順に点 → 勝者の記録の対象', async () => {
    const { host, clients, code } = await setupRoom(server.port, 'ad-dodge', 3, { rounds: 1, pages: 5, timeLimit: 120 });
    open = clients;
    await startGame(host, clients, 'RACE');

    // 全員に同じページ。どこを押せば進めるか（判定）はビューに入っていない
    const first = g(clients[0]).stage!;
    expect(clients.every((c) => JSON.stringify(g(c).stage!.els) === JSON.stringify(first.els))).toBe(true);
    const plain = JSON.stringify(clients[1].view);
    expect(plain).not.toContain('"zones"');
    expect(plain).not.toContain('"act"');

    // 1人目が広告を押す → 広告のページが開き、ロック中はどこを押しても戻れない
    const game = server.manager.rooms.get(code)!.game as unknown as { pages: { steps: { zones: Zone[] }[] }[] };
    const trap = game.pages[0].steps[0].zones.find((z) => z.act === 'trap')!;
    const c0 = clients[0];
    // t は届いた時点の経過時間までに切り詰められる（割り込み広告なら、出たあとの広告を押したことになる）
    await c0.actionOk('tap', { ...center(trap), t: 1e9, page: 0, step: 0 });
    const locked = await c0.waitFor((v) => (v.game as AdDodgeView).penalty != null);
    const penalty = (locked.game as AdDodgeView).penalty!;
    expect((locked.game as AdDodgeView).racers.find((r) => r.id === c0.id)!.traps).toBe(1);
    expect((locked.game as AdDodgeView).myTraps[0]?.count).toBe(1);
    // ロック中に、戻るの場所を押しても戻れない
    await c0.actionOk('tap', { x: 50, y: 25, t: 0, landing: penalty.id });
    expect(g(c0).penalty?.id).toBe(penalty.id);
    // 古い段に向けた押し直しは数えない
    await c0.actionOk('tap', { ...center(trap), t: 0, page: 0, step: 0 });
    expect(g(c0).racers.find((r) => r.id === c0.id)!.traps).toBe(1);

    // 2人目 → 3人目 → 1人目 の順にゴール
    await runToGoal(clients[1]);
    await runToGoal(clients[2]);
    await pass(c0); // 戻る
    expect(g(c0).penalty).toBeNull();
    await runToGoal(c0);

    const result = await host.waitPhase('RESULT');
    const rr = (result.game as AdDodgeView).roundResult!;
    expect(rr.rows.map((r) => r.id)).toEqual([clients[1].id, clients[2].id, c0.id]);
    expect(rr.rows.map((r) => r.points)).toEqual([5, 3, 2]);
    expect(rr.rows.every((r) => r.cleared === 5 && r.finishedMs != null)).toBe(true);
    expect(rr.pages).toHaveLength(5);
    expect(rr.worstTrap?.count).toBeGreaterThanOrEqual(1);
    expect((result.game as AdDodgeView).scores[clients[1].id]).toBe(5);

    await host.actionOk('next');
    await host.waitPhase('GAME_OVER');
  });

  it('時間切れで、進んだページの多い順。ゴールしていなければ 0点', async () => {
    const { host, clients } = await setupRoom(server.port, 'ad-dodge', 2, { rounds: 1, pages: 5, timeLimit: 60 });
    open = clients;
    await startGame(host, clients, 'RACE');
    while (g(clients[1]).racers.find((r) => r.id === clients[1].id)!.cleared < 1) await pass(clients[1]);
    await host.actionOk('skip'); // ホストが締め切る（時間切れと同じ）
    const result = await host.waitPhase('RESULT');
    const rr = (result.game as AdDodgeView).roundResult!;
    expect(rr.rows[0]).toMatchObject({ id: clients[1].id, points: 0, finishedMs: null, rank: 1 });
    expect(rr.rows[1]).toMatchObject({ id: host.id, cleared: 0, rank: 2 });
    expect(rr.rows.every((r) => r.points === 0)).toBe(true);
  });

  it('レースの外では、押しても何も起きず、判定の手がかりも出ない', async () => {
    delete process.env.PARTYBOX_AD_DODGE_REVEAL;
    try {
      const { host, clients } = await setupRoom(server.port, 'ad-dodge', 2, { rounds: 1, pages: 5 });
      open = clients;
      await startGame(host, clients, 'RACE');
      expect(g(clients[0]).debugTarget).toBeNull();
      const res = await clients[0].action('tap', { x: 'abc', y: 10, page: 0, step: 0 });
      expect(res.ok).toBe(true);
      expect(g(clients[0]).stage!.page).toBe(0);
    } finally {
      process.env.PARTYBOX_AD_DODGE_REVEAL = '1';
    }
  });
});
