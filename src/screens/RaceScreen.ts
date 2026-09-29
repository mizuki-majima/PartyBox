import type { App, Screen } from '../app/App';
import { mainColor } from '../blueprint/colors';
import { pickRivals } from '../generator/rivals';
import { CAMERA_LABELS, type CameraMode } from '../race/CameraDirector';
import { Commentary } from '../race/Commentary';
import { RaceSim } from '../race/RaceSim';
import { RaceView } from '../race/RaceView';
import { getTrack } from '../track/TrackData';
import { Celebration } from '../ui/Celebration';
import { button } from '../ui/components';
import { h } from '../ui/dom';
import { RaceHud } from '../ui/RaceHud';
import { Telop } from '../ui/Telop';

/** 全車ゴールしてからリザルトへ移るまでの秒数 */
const RESULT_DELAY = 4;

/** レース観戦画面 */
export function raceScreen(app: App): Screen {
  let view: RaceView | null = null;
  let celebration: Celebration | null = null;
  return {
    mount(root) {
      const player = app.state.player;
      if (!player) {
        app.goto('build');
        return;
      }
      if (app.state.rivals.length === 0) app.state.rivals = pickRivals(3);
      const blueprints = [player, ...app.state.rivals];
      // 開発用: ?laps=1 で短いレースにして演出を確認できる
      const devLaps = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('laps')) : 0;
      const sim = new RaceSim(
        getTrack(),
        blueprints.map((bp, i) => ({ id: `car${i}`, name: bp.name, stats: bp.stats, isPlayer: i === 0 })),
        { laps: devLaps > 0 ? devLaps : 3 },
      );
      view = new RaceView(sim, blueprints);
      const director = view.director;
      const hud = new RaceHud(blueprints, 0);
      const commentary = new Commentary(sim, blueprints);
      const telop = new Telop(blueprints.map(mainColor));
      const cel = (celebration = new Celebration());

      const toResult = () => {
        const result = sim.result();
        if (!result) return;
        app.state.lastResult = { result, blueprints };
        app.state.raceCount++;
        app.next();
      };
      const resultBtn = button('結果を見る', toResult, 'go');
      resultBtn.hidden = true;

      // カメラ切り替えボタン
      const camButtons = (['auto', 'player', 'leader', 'overhead'] as const).map((mode) =>
        h('button', {
          class: 'cam-btn',
          text: CAMERA_LABELS[mode],
          attrs: { type: 'button', 'aria-pressed': 'false' },
          on: { click: () => director.select(mode) },
        }),
      );
      const syncCamButtons = (mode: CameraMode, auto: boolean) => {
        const modes = ['auto', 'player', 'leader', 'overhead'];
        camButtons.forEach((b, i) => {
          const active = auto ? modes[i] === 'auto' : modes[i] === mode;
          b.classList.toggle('active', active);
          b.classList.toggle('current', auto && modes[i] === mode);
          b.setAttribute('aria-pressed', String(active));
        });
      };
      director.onChange = syncCamButtons;
      syncCamButtons(director.mode, director.auto);

      let finishedFor = 0;
      let flagShown = false;
      view.onFrame = (dt) => {
        for (const e of sim.drainEvents()) {
          commentary.handle(e);
          director.onEvent(e, sim);
          if (e.type === 'finish') {
            const car = sim.cars[e.car];
            if (e.position === 1 && !flagShown) {
              flagShown = true;
              cel.flag('FINISH!', `${blueprints[e.car].name} 優勝！`);
              cel.confetti(car.input.isPlayer ? 220 : 120);
            }
            if (car.input.isPlayer) {
              const pos = e.position ?? car.position;
              if (pos !== 1) cel.flag(`${pos}位でゴール！`, blueprints[e.car].name);
              if (pos <= 3) cel.confetti(pos === 1 ? 160 : 90);
              resultBtn.hidden = false;
            }
          }
        }
        commentary.update(dt);
        telop.sync(commentary.current);
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
          cel.el,
          h(
            'div',
            { class: 'race-top' },
            h('div', { class: 'cam-group', attrs: { role: 'group', 'aria-label': 'カメラ' } }, h('span', { class: 'cam-label', text: 'カメラ' }), ...camButtons),
            button('やめる', () => app.goto('build'), 'ghost'),
          ),
          h('div', { class: 'race-bottom' }, telop.el, resultBtn),
        ),
      );
    },
    unmount() {
      celebration?.dispose();
      celebration = null;
      view?.dispose();
      view = null;
    },
  };
}
