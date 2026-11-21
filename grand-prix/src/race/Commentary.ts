import type { CarBlueprint } from '../blueprint/types';
import { Rng } from '../util/rng';
import type { RaceEvent, RaceSim } from './RaceSim';

/**
 * 実況。レースのイベントを受け取って、テロップ用の一文を作る。
 * 表示の都合（優先度・最低表示時間・古くなった話題の破棄）もここで面倒を見る。
 * DOM を触らないので、テストからも使える。
 */
export interface CommentLine {
  text: string;
  /** 主役の車（色玉の表示用） */
  car: number;
  /** 大きいほど優先 */
  priority: number;
  /** プレイヤーの車が関わっているか（テロップの色を変える） */
  player: boolean;
  /** キューに入った時刻 */
  at: number;
}

const MIN_SHOW = 2.1;
const MAX_WAIT = 2.6;
const QUIET = 5.5;

export class Commentary {
  private readonly sim: RaceSim;
  private readonly blueprints: CarBlueprint[];
  private readonly rng: Rng;
  private queue: CommentLine[] = [];
  current: CommentLine | null = null;
  private shownFor = 0;
  private quietFor = 0;
  private clock = 0;
  private finalCornerSaid = false;
  private readonly spoken = new Set<string>();

  constructor(sim: RaceSim, blueprints: CarBlueprint[], seed = Math.floor(Math.random() * 1e9)) {
    this.sim = sim;
    this.blueprints = blueprints;
    this.rng = new Rng(seed);
  }

  private name(i: number): string {
    return this.blueprints[i]?.name ?? '???';
  }

  private isPlayer(i: number | undefined): boolean {
    return i !== undefined && !!this.sim.cars[i]?.input.isPlayer;
  }

  private push(text: string, car: number, priority: number, other?: number): void {
    const player = this.isPlayer(car) || this.isPlayer(other);
    const line: CommentLine = { text, car, priority: priority + (player ? 2 : 0), player, at: this.clock };
    // 同じ車の似た話題は新しい方だけ残す
    this.queue = this.queue.filter((q) => !(q.car === car && q.priority <= line.priority));
    this.queue.push(line);
  }

  /** レースのイベントを実況の文にする */
  handle(e: RaceEvent): void {
    const A = this.name(e.car);
    const B = e.other !== undefined ? this.name(e.other) : '';
    const bp = this.blueprints[e.car];
    const at = e.section;
    const pick = (list: string[]) => this.rng.pick(list);
    switch (e.type) {
      case 'start':
        this.push(pick(['スタート！各車いっせいに飛び出した！', 'シグナルグリーン！レース開始！', 'さあ始まりました、プロンプト・グランプリ！']), e.car, 9);
        break;
      case 'overtake': {
        if (e.value === 1) {
          this.push(pick([`${B}のすきに、${A}が前へ！`, `${A}、止まった${B}をかわしていく！`]), e.car, 4, e.other);
        } else if (at === '最終コーナー') {
          this.push(pick([`${A}、最終コーナーで${B}をとらえた！`, `最終コーナー！${A}が${B}を抜いた！`]), e.car, 6, e.other);
        } else {
          this.push(
            pick([
              `${A}、${B}をかわして${e.position}位に浮上！`,
              `${A}、${at}で${B}をパス！`,
              `抜いた！${A}が${B}の前へ！`,
              `${A}、${B}をオーバーテイク！`,
            ]),
            e.car,
            5,
            e.other,
          );
        }
        break;
      }
      case 'lead':
        this.push(pick([`${A}がトップに立った！`, `首位交代！先頭は${A}！`, `${A}、ついにトップへ！`]), e.car, 7, e.other);
        break;
      case 'spin':
        this.push(pick([`あーっと！${A}、${at}でスピン！`, `${A}、くるくる回ってしまった！`, `${A}、${at}でまさかのスピン！`]), e.car, 6);
        break;
      case 'courseOut':
        this.push(pick([`${A}、コースアウト！壁にタッチ！`, `${A}、${at}で大きくふくらんだ！`, `${A}、はみ出した！立て直せるか！`]), e.car, 6);
        break;
      case 'slipstream':
        this.push(pick([`${A}、${B}のスリップストリームに入った！`, `${A}、${B}の真後ろにぴったり！`]), e.car, 2, e.other);
        break;
      case 'battle':
        this.push(pick([`${A}と${B}、テール・トゥ・ノーズの接戦！`, `${A}、${B}にぴたりとくっついて離れない！`, `${B}と${A}、火花を散らすバトル！`]), e.car, 3, e.other);
        break;
      case 'lap':
        if (this.isPlayer(e.car)) {
          this.push(pick([`がんばれ${A}！${e.lap}周目！`, `${A}、${e.lap}周目に突入！いま${e.position}位！`]), e.car, 1);
        } else if (e.position === 1 && e.lap !== this.sim.laps) {
          this.push(`${A}、トップで${e.lap}周目へ！`, e.car, 1);
        }
        break;
      case 'finalLap':
        this.push(pick([`ファイナルラップ！トップは${A}！`, `いよいよ最終ラップ！先頭は${A}！`]), e.car, 8);
        break;
      case 'fastestLap':
        if ((e.lap ?? 0) >= 2) this.push(`${A}、ファステストラップ！${e.value?.toFixed(2)}秒！`, e.car, 3);
        break;
      case 'boost':
        this.push(
          pick([`${A}、本気モード突入！「${bp?.catchphrase ?? 'いくぞ！'}」`, `${A}の目の色が変わった！追い上げ開始！`, `${A}、ここで本気を出した！`]),
          e.car,
          5,
        );
        break;
      case 'finish':
        if (e.position === 1) this.push(pick([`${A}、トップでチェッカー！優勝！`, `${A}、優勝ーーー！`]), e.car, 10);
        else if (this.isPlayer(e.car)) this.push(`${A}、${e.position}位でゴール！よくがんばった！`, e.car, 8);
        else this.push(`${A}、${e.position}位でゴール`, e.car, 4);
        break;
    }
  }

  /** 話題が無いときのつなぎの一言 */
  private ambient(): void {
    const sim = this.sim;
    const order = sim.order.filter((c) => !c.finished);
    if (order.length === 0 || sim.phase !== 'racing') return;
    const leader = order[0];
    const options: { text: string; car: number; key?: string }[] = [
      { text: `${this.name(leader.index)}、快調に飛ばしている`, car: leader.index },
    ];
    const player = sim.cars.find((c) => c.input.isPlayer);
    if (player && !player.finished) {
      const bp = this.blueprints[player.index];
      options.push({ text: `${bp.name}、いま${player.position}位で走行中`, car: player.index });
      options.push({ text: `${bp.name}「${bp.catchphrase}」`, car: player.index, key: 'p-catch' });
      options.push({ text: `${bp.name}は「${bp.personality}」`, car: player.index, key: 'p-pers' });
    }
    for (const c of order) {
      const bp = this.blueprints[c.index];
      if (!c.input.isPlayer) options.push({ text: `${bp.name}「${bp.catchphrase}」`, car: c.index, key: `c-${c.index}` });
    }
    const fresh = options.filter((o) => !o.key || !this.spoken.has(o.key));
    const choice = this.rng.pick(fresh.length ? fresh : options);
    if (choice.key) this.spoken.add(choice.key);
    this.push(choice.text, choice.car, 0);
  }

  /** 状況を見て出す実況（最終コーナーの追い上げなど） */
  private watch(): void {
    const sim = this.sim;
    if (sim.phase !== 'racing' || this.finalCornerSaid) return;
    for (const car of sim.order) {
      if (car.finished || car.lap !== sim.laps - 1 || car.position === 1) continue;
      if (sim.track.sectionNameAt(car.progress) !== '最終コーナー') continue;
      const ahead = sim.order[car.position - 2];
      if (!ahead || ahead.finished) continue;
      const gapSec = (ahead.progress - car.progress) / Math.max(car.v, 6);
      if (gapSec < 0.8) {
        this.finalCornerSaid = true;
        this.push(`${this.name(car.index)}、最終コーナーで追い上げ！${this.name(ahead.index)}に並びかける！`, car.index, 7, ahead.index);
        return;
      }
    }
  }

  /** 毎フレーム呼ぶ。表示するべき行は current に入る（無ければ null） */
  update(dt: number): void {
    this.clock += dt;
    this.watch();
    if (this.current) this.shownFor += dt;
    // 古い小ネタは捨てる
    this.queue = this.queue.filter((q) => q.priority >= 6 || this.clock - q.at < MAX_WAIT);
    if (!this.current && this.queue.length === 0) {
      this.quietFor += dt;
      if (this.quietFor > QUIET) {
        this.quietFor = 0;
        this.ambient();
      }
    } else {
      this.quietFor = 0;
    }
    if (this.queue.length === 0) {
      // 次の話題が無ければ、しばらく出したあと消す
      if (this.current && this.shownFor > MIN_SHOW + 1.6) this.current = null;
      return;
    }
    this.queue.sort((a, b) => b.priority - a.priority || a.at - b.at);
    const top = this.queue[0];
    const canReplace =
      !this.current || this.shownFor >= MIN_SHOW || (top.priority >= this.current.priority + 3 && this.shownFor > 0.7);
    if (!canReplace) return;
    this.queue.shift();
    this.current = top;
    this.shownFor = 0;
  }
}
