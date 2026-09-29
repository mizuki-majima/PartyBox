import type { RaceResult } from './RaceSim';

export interface Highlight {
  icon: string;
  title: string;
  text: string;
}

const fmt = (sec: number) => `${sec.toFixed(2)}秒`;

/** レース結果から「見どころ」を拾う（リザルト画面用） */
export function buildHighlights(result: RaceResult): Highlight[] {
  const { entries, events } = result;
  const byIndex = new Map(entries.map((e) => [e.index, e]));
  const name = (i: number) => byIndex.get(i)?.name ?? '???';
  const out: Highlight[] = [];

  const [first, second] = entries;
  if (first && second) {
    const margin = second.time - first.time;
    if (margin < 0.6) out.push({ icon: '📸', title: '写真判定級', text: `${first.name}と${second.name}の差は、わずか${fmt(margin)}！` });
  }

  const best = entries.filter((e) => Number.isFinite(e.bestLap)).sort((a, b) => a.bestLap - b.bestLap)[0];
  if (best) out.push({ icon: '⏱️', title: 'ファステストラップ', text: `${best.name}（${fmt(best.bestLap)}）` });

  const comeback = entries
    .map((e) => ({ e, gain: e.worstPosition - e.position }))
    .filter((x) => x.gain >= 2)
    .sort((a, b) => b.gain - a.gain)[0];
  if (comeback) out.push({ icon: '🔥', title: '大逆転', text: `${comeback.e.name}が${comeback.e.worstPosition}位から${comeback.e.position}位まで追い上げ！` });

  const passer = [...entries].sort((a, b) => b.overtakes - a.overtakes)[0];
  if (passer && passer.overtakes >= 2) out.push({ icon: '💨', title: 'オーバーテイク王', text: `${passer.name}（${passer.overtakes}回抜いた）` });

  const leadChanges = events.filter((e) => e.type === 'lead').length;
  if (leadChanges >= 3) out.push({ icon: '🔄', title: '大混戦', text: `トップが${leadChanges}回も入れかわった！` });

  const clumsy = [...entries].sort((a, b) => b.spins + b.courseOuts - (a.spins + a.courseOuts))[0];
  if (clumsy && clumsy.spins + clumsy.courseOuts > 0) {
    const parts = [clumsy.spins ? `スピン${clumsy.spins}回` : '', clumsy.courseOuts ? `コースアウト${clumsy.courseOuts}回` : ''].filter(Boolean);
    out.push({ icon: '🌀', title: 'ハプニング賞', text: `${clumsy.name}（${parts.join('・')}）` });
  }

  const boost = events.find((e) => e.type === 'boost');
  if (boost) out.push({ icon: '⚡', title: '本気モード', text: `${name(boost.car)}が最終ラップで本気を出した！` });

  const poleToWin = first && first.gridPosition === 1;
  if (first && !comeback && first.gridPosition >= 3) {
    out.push({ icon: '🚀', title: 'うしろからの優勝', text: `${first.name}は${first.gridPosition}番手スタートから勝った！` });
  } else if (poleToWin && leadChanges <= 1) {
    out.push({ icon: '👑', title: '完全勝利', text: `${first.name}がスタートからゴールまで逃げ切り！` });
  }

  return out.slice(0, 5);
}

/** プレイヤーの順位に応じたひとこと */
export function playerMessage(position: number, total: number): { title: string; text: string } {
  if (position === 1) return { title: '優勝！', text: 'おめでとう！きみの車がいちばん！' };
  if (position === 2) return { title: '2位！', text: 'おしい！あとちょっとだった！' };
  if (position === 3) return { title: '3位！', text: '表彰台にのぼったよ！' };
  if (position === total) return { title: `${position}位…`, text: '次はきっと勝てる！言葉を変えて作り直してみる？' };
  return { title: `${position}位`, text: 'よくがんばった！' };
}
