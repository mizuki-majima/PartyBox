/**
 * 座席決めの規則（party-app-aws backend/src/seats.mjs の移植）
 *
 * 名簿から1人ずつ本当のくじを引き、同じ所属が固まらないようにテーブルへ入れる。
 */
import type { SeatsView } from '../../../shared/games/views';
import type { RosterPerson, SeatsConfig } from '../../event/config';
import { rosterFromConfig } from '../../event/config';
import { drawIndex } from './cards';

export interface SeatsState {
  /** 名簿の人 → テーブル番号。席が足りなければ null */
  assign: Record<string, number | null>;
  absent: string[];
  /** 引いた順 */
  order: string[];
  /** 当日その場で足した人 */
  extras: RosterPerson[];
  /** プレイヤーID → 名簿の人のID（自分がどれか選んだもの） */
  claimed: Record<string, string>;
}

export function emptySeats(): SeatsState {
  return { assign: {}, absent: [], order: [], extras: [], claimed: {} };
}

export function roster(state: SeatsState, cfg: SeatsConfig): RosterPerson[] {
  return [...rosterFromConfig(cfg), ...state.extras];
}

function tablesOf(cfg: SeatsConfig): { name: string; seats: number }[] {
  return cfg.tables.map((t, i) => ({ name: t.name || `テーブル ${i + 1}`, seats: t.seats }));
}

/**
 * 同じ所属がいちばん少ないテーブル → 人数がいちばん少ないテーブル → 先のテーブル の順に入れる。
 * fillOrder が "sequential" なら前のテーブルから単純に埋める。
 */
function chooseTable(state: SeatsState, cfg: SeatsConfig, people: RosterPerson[], group: string): number | null {
  const tables = tablesOf(cfg);
  const byId = new Map(people.map((p) => [p.id, p]));
  const total = tables.map(() => 0);
  const same = tables.map(() => 0);
  for (const [personId, t] of Object.entries(state.assign)) {
    if (t == null || t < 0 || t >= tables.length) continue;
    total[t] += 1;
    if (group && byId.get(personId)?.group === group) same[t] += 1;
  }

  let best: number | null = null;
  for (let t = 0; t < tables.length; t++) {
    if (total[t] >= tables[t].seats) continue;
    if (cfg.fillOrder === 'sequential') return t;
    if (best === null || same[t] < same[best] || (same[t] === same[best] && total[t] < total[best])) best = t;
  }
  return best; // 席が無ければ null（「席なし」）
}

function pending(state: SeatsState, people: RosterPerson[]): RosterPerson[] {
  return people.filter((p) => !(p.id in state.assign) && !state.absent.includes(p.id));
}

export type DrawnPerson = RosterPerson & { table: number | null };

/** くじを1回引く */
export function drawOne(state: SeatsState, cfg: SeatsConfig): DrawnPerson | null {
  const people = roster(state, cfg);
  const rest = pending(state, people);
  if (!rest.length) return null;

  const person = rest[drawIndex(rest.length)];
  const table = chooseTable(state, cfg, people, person.group);
  state.assign[person.id] = table;
  state.order.push(person.id);
  return { ...person, table };
}

/** 時間が足りないときに残り全員を一度に決める */
export function drawAll(state: SeatsState, cfg: SeatsConfig): DrawnPerson[] {
  const drawn: DrawnPerson[] = [];
  for (;;) {
    const one = drawOne(state, cfg);
    if (!one) break;
    drawn.push(one);
  }
  return drawn;
}

/** 直前の1人を取り消す */
export function undoDraw(state: SeatsState): string | null {
  const personId = state.order.pop();
  if (!personId) return null;
  delete state.assign[personId];
  return personId;
}

/** 欠席にする（席が決まっていれば空ける） */
export function markAbsent(state: SeatsState, personId: string, absent: boolean): void {
  const list = new Set(state.absent);
  if (absent) {
    list.add(personId);
    delete state.assign[personId];
    state.order = state.order.filter((id) => id !== personId);
  } else {
    list.delete(personId);
  }
  state.absent = [...list];
}

/** 名簿に無い人を当日その場で足す */
export function addExtra(state: SeatsState, name: string, group: string): RosterPerson {
  const person: RosterPerson = {
    id: `x${state.extras.length + 1}`,
    name: name.slice(0, 40),
    group: group.slice(0, 20),
  };
  state.extras = [...state.extras, person];
  return person;
}

export function resetSeats(state: SeatsState): void {
  state.assign = {};
  state.absent = [];
  state.order = [];
  // extras と claimed は残す（当日足した人と、各自が選んだ名前はそのまま）
}

export function seatsView(state: SeatsState, cfg: SeatsConfig, myPersonId: string | null): SeatsView {
  const people = roster(state, cfg);
  const byId = new Map(people.map((p) => [p.id, p]));

  const tables = tablesOf(cfg).map((t) => ({ ...t, people: [] as RosterPerson[] }));
  const noSeat: RosterPerson[] = [];
  for (const [personId, t] of Object.entries(state.assign)) {
    const person = byId.get(personId);
    if (!person) continue;
    if (t == null || t < 0 || t >= tables.length) noSeat.push(person);
    else tables[t].people.push(person);
  }
  for (const t of tables) t.people.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));

  const lastId = state.order.at(-1) ?? null;
  const lastPerson = lastId ? byId.get(lastId) : undefined;

  return {
    title: cfg.title,
    tables,
    noSeat,
    roster: people.map((p) => ({ ...p, table: state.assign[p.id] ?? null, absent: state.absent.includes(p.id) })),
    remaining: pending(state, people).length,
    drawn: state.order.length,
    last: lastPerson ? { ...lastPerson, table: state.assign[lastId!] ?? null } : null,
    myPersonId,
  };
}
