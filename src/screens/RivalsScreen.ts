import type { App, Screen } from '../app/App';
import { mainColor } from '../blueprint/colors';
import { sfx } from '../audio/Sfx';
import { CarModel } from '../car/CarModel';
import { ShowroomView } from '../car/ShowroomView';
import { pickRivals } from '../generator/rivals';
import { button, carCard } from '../ui/components';
import { clear, h, setText } from '../ui/dom';

/**
 * ライバル紹介。CPU の車を 1 台ずつ見せてから、出走メンバー 4 台を並べる。
 * （勝敗予想を入れるなら、この画面の次に差し込む）
 */
export function rivalsScreen(app: App): Screen {
  let view: ShowroomView | null = null;
  return {
    mount(root) {
      const player = app.state.player;
      if (!player) {
        app.goto('build');
        return;
      }
      if (app.state.rivals.length === 0) app.state.rivals = pickRivals(3);
      const rivals = app.state.rivals;
      view = new ShowroomView('#e6f4ff', app.stage.renderer);

      const heading = h('div', { class: 'rivals-heading' });
      const cardSlot = h('div', { class: 'rivals-card' });
      const preview = h('div', { class: 'rivals-preview' });
      const nextBtn = button('つぎへ', () => (step < rivals.length ? show(step + 1) : app.next()), 'primary');
      const skipBtn = button('とばす', () => show(rivals.length), 'sub');
      const actions = h('div', { class: 'rivals-actions' }, skipBtn, nextBtn);
      root.append(h('div', { class: 'screen rivals-screen' }, preview, h('div', { class: 'rivals-panel' }, heading, cardSlot, actions)));
      app.stage.attach(preview);
      app.stage.setView(view);

      let step = 0;
      function show(i: number) {
        step = i;
        sfx.pop();
        clear(cardSlot);
        if (i < rivals.length) {
          const bp = rivals[i];
          setText(heading, `ライバル ${i + 1} / ${rivals.length}`);
          view?.setCars([new CarModel(bp)], { slots: 1, pop: true });
          cardSlot.append(carCard(bp, { badge: 'CPU' }));
          setText(nextBtn, i === rivals.length - 1 ? '出走メンバーを見る' : 'つぎのライバル');
          skipBtn.hidden = false;
        } else {
          // 出走メンバー 4 台
          const all = [player!, ...rivals];
          setText(heading, '出走メンバーがそろった！');
          view?.setCars(all.map((bp) => new CarModel(bp)), { pop: true });
          cardSlot.append(
            h(
              'div',
              { class: 'lineup' },
              ...all.map((bp, k) =>
                h(
                  'div',
                  { class: `lineup-item${k === 0 ? ' is-player' : ''}` },
                  h('span', { class: 'rank-dot', style: { background: mainColor(bp) } }),
                  h('span', { class: 'lineup-name', text: bp.name }),
                  h('span', { class: 'lineup-tag', text: k === 0 ? 'きみ' : 'CPU' }),
                ),
              ),
            ),
            h('p', { class: 'lineup-note', text: 'おもちゃサーキットを 3 周。きみは運転しないで、応援するだけ！' }),
          );
          setText(nextBtn, 'レーススタート！');
          nextBtn.className = 'btn btn-go';
          skipBtn.hidden = true;
        }
      }
      show(0);
    },
    unmount() {
      view?.dispose();
      view = null;
    },
  };
}
