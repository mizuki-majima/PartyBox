import type { App, Screen } from '../app/App';
import { pickRivals } from '../generator/rivals';
import { RaceSim } from '../race/RaceSim';
import { RaceView } from '../race/RaceView';
import { getTrack } from '../track/TrackData';
import { button } from '../ui/components';
import { h } from '../ui/dom';

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
      const cars = [player, ...app.state.rivals];
      const sim = new RaceSim(
        getTrack(),
        cars.map((bp, i) => ({ id: `car${i}`, name: bp.name, stats: bp.stats, isPlayer: i === 0 })),
      );
      view = new RaceView(sim, cars);
      app.stage.setView(view);
      root.append(h('div', { class: 'screen race-screen' }, h('div', { class: 'race-top' }, button('車を作り直す', () => app.goto('build'), 'ghost'))));
    },
    unmount() {
      view?.dispose();
      view = null;
    },
  };
}
