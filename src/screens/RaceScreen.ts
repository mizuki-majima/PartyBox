import type { App, Screen } from '../app/App';
import { pickRivals } from '../generator/rivals';
import { RaceSim } from '../race/RaceSim';
import { RaceView } from '../race/RaceView';
import { getTrack } from '../track/TrackData';
import { button } from '../ui/components';
import { h } from '../ui/dom';
import { RaceHud } from '../ui/RaceHud';

/** ゴールしてからリザルトへ移るまでの秒数 */
const RESULT_DELAY = 3.5;

/** レース観戦画面 */
export function raceScreen(app: App): Screen {
  let view: RaceView | null = null;
  return {
    mount(root) {
      const player = app.state.player;
      if (!player) {
        app.goto('build');
        return;
      }
      if (app.state.rivals.length === 0) app.state.rivals = pickRivals(3);
      const blueprints = [player, ...app.state.rivals];
      const sim = new RaceSim(
        getTrack(),
        blueprints.map((bp, i) => ({ id: `car${i}`, name: bp.name, stats: bp.stats, isPlayer: i === 0 })),
      );
      view = new RaceView(sim, blueprints);
      const hud = new RaceHud(blueprints, 0);

      const toResult = () => {
        const result = sim.result();
        if (!result) return;
        app.state.lastResult = { result, blueprints };
        app.state.raceCount++;
        app.next();
      };
      const resultBtn = button('結果を見る', toResult, 'go');
      resultBtn.hidden = true;

      let finishedFor = 0;
      view.onFrame = (dt) => {
        hud.update(sim, dt);
        if (sim.phase === 'finished') {
          finishedFor += dt;
          resultBtn.hidden = false;
          if (finishedFor > RESULT_DELAY) toResult();
        }
      };

      app.stage.setView(view);
      root.append(
        h(
          'div',
          { class: 'screen race-screen' },
          hud.el,
          h('div', { class: 'race-top' }, button('やめる', () => app.goto('build'), 'ghost')),
          h('div', { class: 'race-bottom' }, resultBtn),
        ),
      );
    },
    unmount() {
      view?.dispose();
      view = null;
    },
  };
}
