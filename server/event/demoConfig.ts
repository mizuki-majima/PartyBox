/**
 * 常設のルームがあるサーバーの、懇親会のデモで使う仮名のデータ。
 *
 * 常設のルームがある間は、コードを知らない人に本番の名簿とクイズ（答え）を見せない決まり。
 * それでもデモで動きを確かめられるように、本番のデータから「形だけ同じ」データをその場で作る。
 * - 伏せるもの: 名前・所属（企業名）・チーム名・テーブル名・各題名・クイズの問題文と選択肢と答えの文章・解説・景品・ビンゴの種
 * - そろえるもの: 人数・所属の内訳・座席のテーブル数と席数・夕食のテーブル／チームの数と人数・色分け・
 *   クイズの問題数と選択肢の数と正解の番号と点数・ビンゴの当選数と景品の数
 * 本番のデータはリポジトリに置かないので、ここには作り方だけを書く
 */
import type { EventConfig } from './config';

const FAMILY = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '松本', '井上', '木村', '林', '斎藤', '清水', '山口', '池田', '橋本', '阿部', '石川', '前田', '藤田'];
const GIVEN = ['翔太', '美咲', '大輔', '彩', '健太', '陽菜', '拓也', '結衣', '直樹', '真由', '亮', '由佳', '悠斗', '葵', '誠', '七海', '達也', '花子', '和也', '優子'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * i 番目の架空の名前（名字×名前の組み合わせ。足りなくなったら番号を付けるので、どの i でも重ならない）。
 * 名前は名字と一緒に順に変わるようにずらす（7 は名前の数 20 と互いに素なので、25×20 通りが一巡するまで重ならない）
 */
export function fakePersonName(i: number): string {
  const f = i % FAMILY.length;
  const q = Math.floor(i / FAMILY.length);
  const g = (f + 7 * (q % GIVEN.length)) % GIVEN.length;
  const round = Math.floor(i / (FAMILY.length * GIVEN.length));
  const base = `${FAMILY[f]} ${GIVEN[g]}`;
  return round === 0 ? base : `${base}${round + 1}`;
}

const letter = (i: number) => LETTERS[i] ?? String(i + 1);

/** 本番の値 → 仮名 の対応を、出てきた順に作る */
function mapper(make: (i: number) => string): (real: string) => string {
  const seen = new Map<string, string>();
  return (real) => {
    let v = seen.get(real);
    if (v === undefined) {
      v = make(seen.size);
      seen.set(real, v);
    }
    return v;
  };
}

export function demoEventConfig(real: EventConfig): EventConfig {
  const rosterNames = real.seats.participants.map((p) => (typeof p === 'string' ? p : p.name));
  const dinnerNames = real.dinner?.tables.flatMap((t) => t.teams.flatMap((m) => m.members)) ?? [];
  const realNames = new Set([...rosterNames, ...dinnerNames]);

  // 名前: 名簿の人 → 夕食にだけいる人（飛び入りなど）の順に、本番の名前と重ならない架空の名前を割り当てる
  let next = 0;
  const person = mapper(() => {
    let name = fakePersonName(next++);
    while (realNames.has(name)) name = fakePersonName(next++);
    return name;
  });
  // 所属: 「A社」「B社」…（名簿に出てきた順）。所属なしは所属なしのまま
  const company = mapper((i) => `${letter(i)}社`);
  const group = (g: string) => (g ? company(g) : '');
  // チーム: 夕食のチームの順に「チームA」…。クイズのチームも同じ対応を使う（夕食のチームとそろえるため）
  const team = mapper((i) => `チーム${letter(i)}`);

  const participants = real.seats.participants.map((p) =>
    typeof p === 'string' ? person(p) : { name: person(p.name), group: group(p.group) },
  );

  const dinner = real.dinner && {
    title: '夕食の席',
    legend: real.dinner.legend.map((l) => {
      const groups = l.groups.map(group);
      return { label: groups.join('+').slice(0, 20), groups };
    }),
    tables: real.dinner.tables.map((t, i) => ({
      name: `テーブル${i + 1}`,
      teams: t.teams.map((m) => ({ name: team(m.name), members: m.members.map(person) })),
    })),
  };

  return {
    quiz: {
      title: 'クイズ',
      secondsPerQuestion: real.quiz.secondsPerQuestion,
      teams: real.quiz.teams.map(team),
      questions: real.quiz.questions.map((q, i) => {
        const base = {
          question: `（デモ）第${i + 1}問。本番では、ここに問題文が出ます`,
          ...(q.note !== undefined ? { note: '（デモ）本番では、ここに解説が出ます' } : {}),
          ...(q.points !== undefined ? { points: q.points } : {}),
        };
        // 選択問題は正解の番号をそのまま（どの番号が正解かは秘密ではない）。自由回答の答えの文章は伏せる
        return q.choices && typeof q.answer === 'number'
          ? { ...base, choices: q.choices.map((_, k) => `選択肢${k + 1}`), answer: q.answer }
          : { ...base, answer: '（デモ）答えの例' };
      }),
    },
    bingo: {
      title: 'ビンゴ',
      seed: 'demo',
      winnersCount: real.bingo.winnersCount,
      prizes: real.bingo.prizes.map((_, i) => `景品${i + 1}`),
    },
    seats: {
      title: '座席決め',
      participants,
      tables: real.seats.tables.map((t, i) => ({ name: `テーブル${i + 1}`, seats: t.seats })),
      ...(real.seats.fillOrder !== undefined ? { fillOrder: real.seats.fillOrder } : {}),
    },
    room: null,
    dinner,
    source: 'デモ（本番の人数・構成に合わせた仮名のデータ）',
  };
}
