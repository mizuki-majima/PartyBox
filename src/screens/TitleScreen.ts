import type { App, Screen } from '../app/App';
import { pickRivals } from '../generator/rivals';
import { RaceSim } from '../race/RaceSim';
import { RaceView } from '../race/RaceView';
import { getTrack } from '../track/TrackData';
import { button } from '../ui/components';
import { h } from '../ui/dom';

/** タイトル画面。背景ではデモのレースがずっと走っている。 */
export function titleScreen(app: App): Screen {
  let view: RaceView | null = null;
  return {
    mount(root) {
      const cars = pickRivals(4);
      const sim = new RaceSim(
        getTrack(),
        cars.map((bp, i) => ({ id: `demo${i}`, name: bp.name, stats: bp.stats })),
        { endless: true },
      );
      view = new RaceView(sim, cars, { attract: true });
      app.stage.setView(view);

      root.append(
        h(
          'div',
          { class: 'screen title-screen' },
          h(
            'div',
            { class: 'title-box' },
            h('div', { class: 'title-kicker', text: 'ことばでつくる ミニカーレース' }),
            h('h1', { class: 'title-logo' }, h('span', { text: 'プロンプト' }), h('span', { text: 'グランプリ' })),
            h('p', { class: 'title-lead', text: '「こんな車」と書くだけで、ミニカーができあがる。\nあとは応援するだけ！' }),
            button('あそぶ', () => app.next(), 'start'),
          ),
        ),
      );
    },
    unmount() {
      view?.dispose();
      view = null;
    },
  };
}
