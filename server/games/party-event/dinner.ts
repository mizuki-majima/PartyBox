/**
 * 夕食の席（dinner.json）
 *
 * 決まった席に座る会で、テーブル → チーム → 人 の並びを、そのまま画面に出す。
 * 名前は名簿（seats.json）の名前で書いてあり、名簿の所属から色（legend の何番目か）を決める。
 * 名前の比べ方は座席決めと同じ（空白・全角半角・大文字小文字の違いは同じとみなす）。
 */
import type { DinnerView } from '../../../shared/games/views';
import type { DinnerConfig, RosterPerson } from '../../event/config';
import { nameKey } from './seats';

/** 名前から夕食のテーブルとチームを引く。席の表に無ければ null */
export function teamOfName(cfg: DinnerConfig, name: string): { table: string; team: string } | null {
  const key = nameKey(name);
  if (!key) return null;
  for (const table of cfg.tables) {
    for (const team of table.teams) {
      if (team.members.some((m) => nameKey(m) === key)) return { table: table.name, team: team.name };
    }
  }
  return null;
}

/** myName は、この画面の人が名簿で選んだ名前（選んでいなければ null） */
export function dinnerView(cfg: DinnerConfig, roster: RosterPerson[], myName: string | null): DinnerView {
  const groupOf = new Map(roster.map((p) => [nameKey(p.name), p.group]));
  const toneOf = (name: string): number | null => {
    const group = groupOf.get(nameKey(name));
    if (group === undefined) return null;
    const i = cfg.legend.findIndex((l) => l.groups.includes(group));
    return i >= 0 ? i : null;
  };
  const myKey = myName ? nameKey(myName) : null;
  const counts = cfg.legend.map(() => 0);

  const tables = cfg.tables.map((table) => ({
    name: table.name,
    count: table.teams.reduce((n, t) => n + t.members.length, 0),
    teams: table.teams.map((team) => ({
      name: team.name,
      members: team.members.map((name) => {
        const tone = toneOf(name);
        if (tone !== null) counts[tone] += 1;
        return { name, tone, you: myKey !== null && nameKey(name) === myKey };
      }),
    })),
  }));
  const mine = myName ? teamOfName(cfg, myName) : null;

  return {
    title: cfg.title,
    tables,
    legend: cfg.legend.map((l, i) => ({ label: l.label, tone: i, count: counts[i] })),
    myTeam: mine?.team ?? null,
    myTable: mine?.table ?? null,
  };
}
