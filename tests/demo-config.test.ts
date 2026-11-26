import { describe, expect, it } from 'vitest';
import type { EventConfig } from '../server/event/config';
import { demoEventConfig, fakePersonName } from '../server/event/demoConfig';

/**
 * 常設のルームがあるサーバーの懇親会のデモで使う、仮名のデータ。
 * 本番のデータから作り、名前・企業名・問題・景品は伏せ、人数や構成は本番とそろえる。
 * （ここの名前・会社名・問題・景品は、試験用の作りもの）
 */
const REAL: EventConfig = {
  quiz: {
    title: 'ほげふが合同クイズ',
    secondsPerQuestion: 25,
    teams: ['ほげチーム', 'ふがチーム', 'ぴよチーム'],
    questions: [
      { question: 'ほげ商事の創業は何年？', choices: ['1950年', '1960年', '1970年'], answer: 1, note: '実は1960年', points: 1 },
      { question: 'ふが電機の社長の好物は？', answer: '羊羹' },
      { question: '最後の問題: 本社はどこ？', choices: ['東京', '大阪', '名古屋', '福岡'], answer: 3, points: 3 },
    ],
  },
  bingo: { title: 'ほげ杯ビンゴ', seed: 'real-seed-2026', winnersCount: 3, prizes: ['ペア温泉旅行券', '高級牛肉セット', 'ワイヤレスイヤホン'] },
  seats: {
    title: 'ほげふが二次会の座席',
    participants: [
      { name: '山本 一郎', group: 'ほげ商事' },
      { name: '川上 二葉', group: 'ほげ商事' },
      { name: '森田 三奈', group: 'ふが電機' },
      { name: '海野 四郎', group: 'ぴよ通信' },
      '空見 五月',
    ],
    tables: [
      { name: 'ほげ席', seats: 3 },
      { name: '窓側', seats: 2 },
    ],
  },
  room: { code: 'REAL01', hostToken: 'real-host-token-0123456789' },
  dinner: {
    title: 'ほげふが夕食会',
    legend: [
      { label: 'ほげ+ぴよ', groups: ['ほげ商事', 'ぴよ通信'] },
      { label: 'ふが', groups: ['ふが電機'] },
    ],
    tables: [
      { name: 'ほげテーブル', teams: [{ name: 'ほげチーム', members: ['山本 一郎', '森田 三奈'] }, { name: 'ふがチーム', members: ['川上 二葉'] }] },
      { name: 'ふがテーブル', teams: [{ name: 'ぴよチーム', members: ['海野 四郎', '空見 五月', '飛び入り 六太'] }] },
    ],
  },
  source: '/opt/partybox/event-data',
};

const SECRETS = [
  'ほげ', 'ふが', 'ぴよ', '山本', '川上', '森田', '海野', '空見', '飛び入り',
  '創業', '1950年', '羊羹', '本社', '名古屋', '実は', 'ペア温泉', '牛肉', 'イヤホン', '窓側', 'real-seed', 'REAL01', 'real-host-token',
];

const namesOf = (cfg: EventConfig) => cfg.seats.participants.map((p) => (typeof p === 'string' ? p : p.name));
const groupsOf = (cfg: EventConfig) => cfg.seats.participants.map((p) => (typeof p === 'string' ? '' : p.group));

describe('懇親会のデモの仮名のデータ', () => {
  it('本番の名前・企業名・問題・答え・景品・題名・常設のルームが残らない', () => {
    const text = JSON.stringify(demoEventConfig(REAL));
    for (const s of SECRETS) expect(text, s).not.toContain(s);
    expect(demoEventConfig(REAL).room).toBeNull();
  });

  it('人数・所属の内訳・テーブルと席・夕食のチームと人数・問題の数と選択肢の数と点数・景品の数は本番と同じ', () => {
    const demo = demoEventConfig(REAL);
    expect(demo.seats.participants).toHaveLength(5);
    // 所属は「同じ会社の人は同じ仮名」で、内訳（2人・1人・1人・所属なし1人）が同じ
    const g = groupsOf(demo);
    expect(g[0]).toBe(g[1]);
    expect(new Set(g.slice(0, 4)).size).toBe(3);
    expect(g[4]).toBe('');
    expect(demo.seats.tables.map((t) => t.seats)).toEqual([3, 2]);
    expect(demo.dinner!.tables.map((t) => t.teams.map((m) => m.members.length))).toEqual([[2, 1], [3]]);
    expect(demo.dinner!.legend.map((l) => l.groups.length)).toEqual([2, 1]);
    expect(demo.quiz.secondsPerQuestion).toBe(25);
    expect(demo.quiz.questions.map((q) => [q.choices?.length ?? 0, typeof q.answer, q.points])).toEqual([
      [3, 'number', 1],
      [0, 'string', undefined],
      [4, 'number', 3],
    ]);
    // 選択問題の正解は、選択肢の範囲の中
    for (const q of demo.quiz.questions) if (q.choices) expect(q.answer as number).toBeLessThan(q.choices.length);
    expect(demo.bingo.prizes).toHaveLength(3);
    expect(demo.bingo.winnersCount).toBe(3);
  });

  it('同じ人・同じ会社は、名簿と夕食の席で同じ仮名になる（色分けもそのまま効く）。クイズのチームは夕食のチームとそろう', () => {
    const demo = demoEventConfig(REAL);
    const names = namesOf(demo);
    const groups = groupsOf(demo);
    const [t1, t2] = demo.dinner!.tables;
    expect(t1.teams[0].members).toEqual([names[0], names[2]]);
    expect(t1.teams[1].members).toEqual([names[1]]);
    expect(t2.teams[0].members.slice(0, 2)).toEqual([names[3], names[4]]);
    // 名簿にいない人（飛び入り）にも、名簿と重ならない仮名
    expect(names).not.toContain(t2.teams[0].members[2]);
    expect(demo.dinner!.legend[0].groups).toEqual([groups[0], groups[3]]);
    expect(demo.dinner!.legend[1].groups).toEqual([groups[2]]);
    const dinnerTeams = demo.dinner!.tables.flatMap((t) => t.teams.map((m) => m.name));
    expect(demo.quiz.teams).toEqual(dinnerTeams);
  });

  it('仮名の名前は重ならず、本番の名簿にある名前とも同じにならない', () => {
    const clash = fakePersonName(0);
    const real: EventConfig = { ...REAL, seats: { ...REAL.seats, participants: [clash, ...REAL.seats.participants] } };
    const names = namesOf(demoEventConfig(real));
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain(clash);
  });

  it('架空の名前は、名字も名前もばらける（同じ名前ばかりにならない）。500人を超えても重ならない', () => {
    const first12 = Array.from({ length: 12 }, (_, i) => fakePersonName(i));
    expect(new Set(first12.map((n) => n.split(' ')[1])).size).toBeGreaterThanOrEqual(10);
    expect(new Set(first12.map((n) => n.split(' ')[0])).size).toBe(12);
    const many = Array.from({ length: 1200 }, (_, i) => fakePersonName(i));
    expect(new Set(many).size).toBe(1200);
  });

  it('選択問題の正解の番号は本番と切り離す（本番の答えを変えても、デモの正解は変わらない）', () => {
    // 選択肢は並べ替えずに配るので、番号を本番と同じにすると、デモから本番の答えが読めてしまう
    const shifted: EventConfig = {
      ...REAL,
      quiz: {
        ...REAL.quiz,
        questions: REAL.quiz.questions.map((q) => (q.choices ? { ...q, answer: ((q.answer as number) + 1) % q.choices.length } : q)),
      },
    };
    expect(demoEventConfig(shifted).quiz.questions.map((q) => q.answer)).toEqual(demoEventConfig(REAL).quiz.questions.map((q) => q.answer));
  });

  it('名前の書き方の揺れ（全角の空白・空白なし）は、本番と同じく同じ人として扱う', () => {
    const real: EventConfig = {
      ...REAL,
      dinner: { ...REAL.dinner!, tables: [{ name: '一卓', teams: [{ name: 'ほげチーム', members: ['山本　一郎', '森田三奈'] }] }] },
    };
    const demo = demoEventConfig(real);
    const names = namesOf(demo);
    expect(demo.dinner!.tables[0].teams[0].members).toEqual([names[0], names[2]]);
  });

  it('本番の名簿の名前と、書き方が違うだけ（全角の空白など）の仮名も使わない', () => {
    const plain = fakePersonName(0);
    const clash = plain.replace(' ', '　');
    const real: EventConfig = { ...REAL, seats: { ...REAL.seats, participants: [clash, ...REAL.seats.participants] } };
    expect(namesOf(demoEventConfig(real))).not.toContain(plain);
  });

  it('本番の名簿が名字だけ・名前だけ（2文字）でも、それを含む仮名を使わない', () => {
    const real: EventConfig = { ...REAL, seats: { ...REAL.seats, participants: ['佐藤', '翔太', '鈴木', ...REAL.seats.participants] } };
    const names = namesOf(demoEventConfig(real));
    for (const n of names) for (const part of ['佐藤', '翔太', '鈴木']) expect(n, n).not.toContain(part);
    expect(new Set(names).size).toBe(names.length);
  });

  it('夕食の席が無ければ、無いまま', () => {
    expect(demoEventConfig({ ...REAL, dinner: null }).dinner).toBeNull();
  });
});
