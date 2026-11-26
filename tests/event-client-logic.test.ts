import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartyEventView } from '../shared/games/views';
import { getLastEventRoom, getTeamPlay, rememberEventRoom, setTeamPlay } from '../client/lib/eventReturn';
import { nowText } from '../client/games/party-event/nowText';
import { REVEAL_MS, reelSchedule } from '../client/games/party-event/seatReveal';
import { keepAwakeIn } from '../client/lib/wakeLock';

/**
 * 懇親会の画面のうち、画面の部品から切り出した決まりごと（スロットの止め方・いまやることの文・端末に覚えること）
 */

describe('座席のくじの演出（スロット）', () => {
  it('どのテーブルに決まっても、最後はそのテーブルで止まり、だんだん遅くなる', () => {
    const names = ['T1', 'T2', 'T3', 'T4'];
    for (const final of names) {
      const frames = reelSchedule(names, final);
      expect(frames.at(-1)!.name).toBe(final);
      expect(frames.at(-1)!.at).toBeLessThan(REVEAL_MS);
      const gaps = frames.slice(1).map((f, i) => f.at - frames[i].at);
      expect(gaps.every((g, i) => i === 0 || g >= gaps[i - 1])).toBe(true);
    }
  });

  it('テーブルが1つでも、その名前で止まる', () => {
    expect(reelSchedule(['T1'], 'T1').at(-1)!.name).toBe('T1');
  });
});

describe('いまやること', () => {
  const view = (over: Record<string, unknown>) =>
    ({
      section: 'none',
      isHost: false,
      quiz: { phase: 'idle', myTeam: null, question: null },
      seats: { myPersonId: null, roster: [], noSeat: [] },
      ...over,
    }) as unknown as PartyEventView;
  const me = { id: 'p1', name: 'さくら', group: '', table: null, absent: false, chosen: true, taken: false };

  it('文字で答える問題では「送信する」を押すと言う。選ぶ問題では答えを押すと言う', () => {
    const free = view({ section: 'quiz', quiz: { phase: 'answering', myTeam: 'A', question: { choices: null } } });
    expect(nowText(free)).toContain('「送信する」');
    const choice = view({ section: 'quiz', quiz: { phase: 'answering', myTeam: 'A', question: { choices: ['あ', 'い'] } } });
    expect(nowText(choice)).toBe('チームで相談して、下の答えを押しましょう');
  });

  it('欠席の人・席が足りなかった人には、くじを引けとは言わない', () => {
    const absent = view({ section: 'seats', seats: { myPersonId: 'p1', roster: [{ ...me, absent: true }], noSeat: [] } });
    expect(nowText(absent)).toBe('欠席になっています。司会に声をかけてください');
    const noSeat = view({ section: 'seats', seats: { myPersonId: 'p1', roster: [me], noSeat: [{ id: 'p1', name: 'さくら', group: '' }] } });
    expect(nowText(noSeat)).toBe('席が足りませんでした。司会の案内を待ちましょう');
    const ready = view({ section: 'seats', seats: { myPersonId: 'p1', roster: [me], noSeat: [] } });
    expect(nowText(ready)).toBe('下の「くじを引く」を押しましょう');
  });
});

describe('端末に覚えること（チームで遊ぶ・戻り先）', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T18:00:00+09:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('チームで遊ぶ記憶は12時間で切れる（翌日以降に作るルームにチーム名が付かないように）', () => {
    setTeamPlay('ABC123', 'チーム A');
    expect(getTeamPlay()).toEqual({ eventCode: 'ABC123', team: 'チーム A' });
    vi.setSystemTime(new Date('2026-11-28T06:00:01+09:00'));
    expect(getTeamPlay()).toBeNull();
  });

  it('最後に開いた懇親会のルームを覚えておき、招待で入ったゲームからも戻れるようにする（12時間）', () => {
    expect(getLastEventRoom()).toBeNull();
    rememberEventRoom('ABC123');
    expect(getLastEventRoom()).toBe('ABC123');
    vi.setSystemTime(new Date('2026-11-28T06:00:01+09:00'));
    expect(getLastEventRoom()).toBeNull();
  });
});

describe('画面を消さないとき（嘘つきは誰だ？）', () => {
  it('お題を見て・話して・投票する間は、画面を消さない（自動ロックで切断し、自分の番が飛ばされないように）', () => {
    for (const phase of ['ROLE', 'TALK', 'VOTE', 'LIAR_GUESS']) expect(keepAwakeIn('liar', phase)).toBe(true);
    for (const phase of ['START', 'RESULT', 'GAME_OVER']) expect(keepAwakeIn('liar', phase)).toBe(false);
    expect(keepAwakeIn('whose-answer', 'ANSWER')).toBe(false);
  });
});
