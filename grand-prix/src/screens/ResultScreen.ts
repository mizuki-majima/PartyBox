import type { App, Screen } from '../app/App';
import { mainColor } from '../blueprint/colors';
import { sfx } from '../audio/Sfx';
import { CarModel } from '../car/CarModel';
import { ShowroomView } from '../car/ShowroomView';
import { buildHighlights, playerMessage } from '../race/highlights';
import { button } from '../ui/components';
import { h } from '../ui/dom';
import { formatTime } from '../ui/RaceHud';

/** 表彰台の並び（左から 4位・2位・1位・3位） */
const PODIUM_ORDER = [3, 1, 0, 2];
const PODIUM_HEIGHT = [1.4, 0.95, 0.6, 0.3];

/** リザルト画面: 順位・タイム・ハイライト */
export function resultScreen(app: App): Screen {
  let view: ShowroomView | null = null;
  return {
    mount(root) {
      const record = app.state.lastResult;
      if (!record) {
        app.goto('build');
        return;
      }
      const { result, blueprints } = record;
      const entries = result.entries;
      const me = entries.find((e) => e.isPlayer);

      // 表彰台
      view = new ShowroomView('#fff0c9', app.stage.renderer);
      view.spinSpeed = 0.35;
      const slots = PODIUM_ORDER.filter((rank) => rank < entries.length);
      view.setCars(
        slots.map((rank) => new CarModel(blueprints[entries[rank].index])),
        { heights: slots.map((rank) => PODIUM_HEIGHT[rank]), pop: true },
      );

      const preview = h('div', { class: 'result-preview' });
      const msg = me ? playerMessage(me.position, entries.length) : null;
      const table = h(
        'table',
        { class: 'result-table' },
        h('thead', {}, h('tr', {}, h('th', { text: '順位' }), h('th', { text: '車' }), h('th', { text: 'タイム' }), h('th', { text: 'ベスト' }))),
        h(
          'tbody',
          {},
          ...entries.map((e) =>
            h(
              'tr',
              { class: e.isPlayer ? 'is-player' : '' },
              h('td', { class: `pos pos-${e.position}`, text: String(e.position) }),
              h(
                'td',
                {},
                h(
                  'div',
                  { class: 'name' },
                  h('span', { class: 'rank-dot', style: { background: mainColor(blueprints[e.index]) } }),
                  h('span', { class: 'name-text', text: blueprints[e.index].name }),
                  e.isPlayer ? h('span', { class: 'you', text: 'きみ' }) : null,
                ),
              ),
              h('td', { class: 'time', text: (e.estimated ? '≈' : '') + formatTime(e.time) }),
              h('td', { class: 'best', text: Number.isFinite(e.bestLap) ? e.bestLap.toFixed(2) : '-' }),
            ),
          ),
        ),
      );
      const highlights = buildHighlights(result);

      root.append(
        h(
          'div',
          { class: 'screen result-screen' },
          preview,
          h(
            'div',
            { class: 'result-panel' },
            msg ? h('div', { class: `result-banner rank-${me!.position}` }, h('div', { class: 'result-title', text: msg.title }), h('div', { class: 'result-text', text: msg.text })) : null,
            table,
            highlights.length
              ? h(
                  'div',
                  { class: 'highlights' },
                  h('div', { class: 'highlights-title', text: 'ハイライト' }),
                  ...highlights.map((hl) =>
                    h('div', { class: 'highlight' }, h('span', { class: 'hl-icon', text: hl.icon }), h('b', { text: hl.title }), h('span', { text: hl.text })),
                  ),
                )
              : null,
            h(
              'div',
              { class: 'result-actions' },
              button('もう一回', () => app.goto('race'), 'go'),
              button('車を作り直す', () => app.goto('build'), 'primary'),
            ),
          ),
        ),
      );
      app.stage.attach(preview);
      app.stage.setView(view);
      if (me && me.position === 1) sfx.fanfare(true);
      else sfx.pop();
    },
    unmount() {
      view?.dispose();
      view = null;
    },
  };
}
