import { mainColor } from '../blueprint/colors';
import type { CarBlueprint } from '../blueprint/types';
import type { RaceSim } from '../race/RaceSim';
import { h, setText } from './dom';

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec)) return '--:--.--';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

const ROW_H = 38;

/** レース中の画面表示（順位表・周回数・タイム・カウントダウン） */
export class RaceHud {
  readonly el: HTMLElement;
  private readonly rows: { el: HTMLElement; pos: HTMLElement; gap: HTMLElement }[];
  private readonly lapEl: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly countdownEl: HTMLElement;
  private readonly board: HTMLElement;
  private lastCount = -1;
  private goTimer = 0;
  private acc = 0;

  constructor(blueprints: CarBlueprint[], playerIndex: number) {
    this.rows = blueprints.map((bp, i) => {
      const pos = h('span', { class: 'rank-pos' });
      const gap = h('span', { class: 'rank-gap' });
      const el = h(
        'div',
        { class: `rank-row${i === playerIndex ? ' is-player' : ''}` },
        pos,
        h('span', { class: 'rank-dot', style: { background: mainColor(bp) } }),
        h('span', { class: 'rank-name', text: bp.name }),
        gap,
      );
      return { el, pos, gap };
    });
    this.board = h('div', { class: 'rank-board', style: { height: `${blueprints.length * ROW_H}px` } }, ...this.rows.map((r) => r.el));
    this.lapEl = h('div', { class: 'hud-lap' });
    this.timeEl = h('div', { class: 'hud-time' });
    this.countdownEl = h('div', { class: 'hud-countdown', attrs: { 'aria-live': 'assertive' } });
    this.el = h(
      'div',
      { class: 'race-hud' },
      h('div', { class: 'hud-left' }, this.board),
      h('div', { class: 'hud-center' }, this.lapEl, this.timeEl),
      this.countdownEl,
    );
  }

  update(sim: RaceSim, dt: number): void {
    // カウントダウン
    if (sim.phase === 'countdown') {
      const n = Math.ceil(sim.countdown);
      if (n !== this.lastCount) {
        this.lastCount = n;
        this.flash(String(n));
      }
    } else if (this.lastCount > 0) {
      this.lastCount = 0;
      this.flash('GO!');
      this.goTimer = 1.0;
    } else if (this.goTimer > 0) {
      this.goTimer -= dt;
      if (this.goTimer <= 0) this.countdownEl.hidden = true;
    }

    // 順位表などは 1 秒に 10 回くらいの更新で十分
    this.acc += dt;
    if (this.acc < 0.1) return;
    this.acc = 0;

    const leader = sim.order[0];
    const lap = Math.min(sim.laps, Math.max(1, leader.lap + 1));
    setText(this.lapEl, sim.phase === 'finished' || leader.finished ? 'FINISH' : `LAP ${lap}/${sim.laps}`);
    setText(this.timeEl, formatTime(sim.time));

    sim.order.forEach((car, i) => {
      const row = this.rows[car.index];
      row.el.style.transform = `translateY(${i * ROW_H}px)`;
      setText(row.pos, String(i + 1));
      let gap = '';
      if (car.finished) gap = 'GOAL';
      else if (i > 0) gap = `+${((leader.progress - car.progress) / Math.max(car.v, 6)).toFixed(1)}`;
      setText(row.gap, gap);
      row.el.classList.toggle('is-leader', i === 0);
      row.el.classList.toggle('is-trouble', car.busy);
    });
  }

  private flash(text: string): void {
    this.countdownEl.hidden = false;
    setText(this.countdownEl, text);
    // アニメーションをやり直す
    this.countdownEl.classList.remove('pulse');
    void this.countdownEl.offsetWidth;
    this.countdownEl.classList.add('pulse');
  }
}
