/**
 * 座席決めの規則（party-app-aws backend/src/seats.mjs の移植）
 *
 * 名簿から1人ずつ本当のくじを引き、同じ所属が固まらないようにテーブルへ入れる。
 *
 * くじに入るのは「来ている人」だけ。名簿には来ない人も載っているので、
 *  - 参加者が自分のスマホで名簿から名前を選んだ人
 *  - 名簿に無く、当日その場で足された人（参加者が自分で足した人・司会が足した人）
 *  - 司会が「くじに入れる」にした人（スマホが無いなど、自分で選べない人）
 * だけを対象にする（来ない人で席が埋まらないように）。司会が欠席にした人は、これらに当たっても外す。
 */
import type { SeatsView } from '../../../shared/games/views';
import type { RosterPerson, SeatsConfig } from '../../event/config';
import { rosterFromConfig } from '../../event/config';
import { cleanText } from '../../utils/text';
import { UserError } from '../types';
import { drawIndex } from './cards';

/** 当日足せる人数の上限（いたずらで名簿が膨らまないように） */
export const MAX_EXTRAS = 200;
export const NAME_MAX = 20;
export const GROUP_MAX = 20;

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
  /** 司会が「くじに入れる」にした名簿の人（自分で名前を選べない人） */
  present: string[];
  /** プレイヤーID → その人が自分で足した名簿の人のID（1人1件。打ち間違いを直せるように） */
  selfAdded: Record<string, string>;
}

export function emptySeats(): SeatsState {
  return { assign: {}, absent: [], order: [], extras: [], claimed: {}, present: [], selfAdded: {} };
}

export function roster(state: SeatsState, cfg: SeatsConfig): RosterPerson[] {
  return [...rosterFromConfig(cfg), ...state.extras];
}

/** くじに入る人（欠席かどうかは見ない） */
function chosenIds(state: SeatsState): Set<string> {
  return new Set([...Object.values(state.claimed), ...state.extras.map((p) => p.id), ...state.present]);
}

/** 名前の比べ方。空白・全角半角・大文字小文字の違いは同じとみなす */
function nameKey(name: string): string {
  return name.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
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

/** まだ席が決まっていない、くじに入る人 */
function pending(state: SeatsState, people: RosterPerson[]): RosterPerson[] {
  const chosen = chosenIds(state);
  return people.filter((p) => chosen.has(p.id) && !(p.id in state.assign) && !state.absent.includes(p.id));
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

/** 司会が、自分で名前を選べない人をくじに入れる（外すときは present = false） */
export function markPresent(state: SeatsState, personId: string, present: boolean): void {
  const list = new Set(state.present);
  if (present) list.add(personId);
  else list.delete(personId);
  state.present = [...list];
}

/** 名簿に無い人を当日その場で足す（司会の操作） */
export function addExtra(state: SeatsState, name: string, group: string): RosterPerson {
  const cleanName = cleanText(name, NAME_MAX);
  if (!cleanName) throw new UserError('名前を入力してください');
  if (state.extras.length >= MAX_EXTRAS) throw new UserError('これ以上は足せません');
  const person: RosterPerson = {
    id: `x${state.extras.length + 1}`,
    name: cleanName,
    group: cleanText(group, GROUP_MAX),
  };
  state.extras = [...state.extras, person];
  return person;
}

/**
 * 名簿に無い参加者が、自分の名前を足してくじに入る（参加者の操作）。
 * 1人1件まで。2回目は打ち間違いの直しとして、前に足した名前を書き換える。
 * 名簿にある名前は足せない（一覧から選んでもらう）。
 */
export function addSelf(state: SeatsState, cfg: SeatsConfig, playerId: string, name: string, group: string): RosterPerson {
  const cleanName = cleanText(name, NAME_MAX);
  if (!cleanName) throw new UserError('名前を入力してください');
  const cleanGroup = cleanText(group, GROUP_MAX);
  const mineId = state.selfAdded[playerId];
  const key = nameKey(cleanName);
  if (roster(state, cfg).some((p) => p.id !== mineId && nameKey(p.name) === key)) {
    throw new UserError('その名前は名簿にあります。一覧から選んでください');
  }

  const mine = mineId ? state.extras.find((p) => p.id === mineId) : undefined;
  let person: RosterPerson;
  if (mine) {
    person = { ...mine, name: cleanName, group: cleanGroup };
    state.extras = state.extras.map((p) => (p.id === mine.id ? person : p));
  } else {
    person = addExtra(state, cleanName, cleanGroup);
    state.selfAdded[playerId] = person.id;
  }
  state.claimed[playerId] = person.id;
  return person;
}

export function resetSeats(state: SeatsState): void {
  state.assign = {};
  state.absent = [];
  state.order = [];
  // extras・claimed・present・selfAdded は残す（当日足した人、各自が選んだ名前、くじに入れた人はそのまま）
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
  const chosen = chosenIds(state);

  return {
    title: cfg.title,
    tables,
    noSeat,
    roster: people.map((p) => ({
      ...p,
      table: state.assign[p.id] ?? null,
      absent: state.absent.includes(p.id),
      chosen: chosen.has(p.id),
    })),
    // 自分で名前を足すときの所属の選択肢（名簿にある所属）
    groups: [...new Set(rosterFromConfig(cfg).map((p) => p.group).filter(Boolean))],
    remaining: pending(state, people).length,
    drawn: state.order.length,
    last: lastPerson ? { ...lastPerson, table: state.assign[lastId!] ?? null } : null,
    myPersonId,
  };
}
