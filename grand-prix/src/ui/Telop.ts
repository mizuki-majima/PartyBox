import type { CommentLine } from '../race/Commentary';
import { h, setText } from './dom';

/** 実況テロップ（画面下のテレビ風の帯） */
export class Telop {
  readonly el: HTMLElement;
  private readonly text: HTMLElement;
  private readonly dot: HTMLElement;
  private shown: CommentLine | null = null;
  private readonly colors: string[];

  constructor(colors: string[]) {
    this.colors = colors;
    this.dot = h('span', { class: 'rank-dot' });
    this.text = h('span', { class: 'telop-text' });
    this.el = h('div', { class: 'telop', attrs: { 'aria-live': 'polite', hidden: '' } }, h('span', { class: 'telop-label', text: '実況' }), this.dot, this.text);
  }

  sync(line: CommentLine | null): void {
    if (line === this.shown) return;
    this.shown = line;
    if (!line) {
      this.el.classList.add('leaving');
      return;
    }
    this.el.hidden = false;
    this.el.classList.remove('leaving', 'enter');
    void this.el.offsetWidth;
    this.el.classList.add('enter');
    this.el.classList.toggle('is-player', line.player);
    this.el.classList.toggle('is-hot', line.priority >= 7);
    this.dot.style.background = this.colors[line.car] ?? '#fff';
    setText(this.text, line.text);
  }
}
