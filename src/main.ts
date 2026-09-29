import './style.css';
import { normalizeBlueprint } from './blueprint/schema';
import { SAMPLE_BLUEPRINTS } from './blueprint/samples';
import { CarModel } from './car/CarModel';
import { ShowroomView } from './car/ShowroomView';
import { Stage } from './engine/Stage';
import { RaceSim } from './race/RaceSim';
import { RaceView } from './race/RaceView';
import { TOY_CIRCUIT, TrackData } from './track/TrackData';

const app = document.getElementById('app')!;
const stage = new Stage();
stage.attach(app);

const blueprints = SAMPLE_BLUEPRINTS.map((raw) => {
  const { blueprint, issues } = normalizeBlueprint(raw);
  if (issues.length) console.info(`[blueprint] ${blueprint.name}:`, issues);
  return blueprint;
});

const params = new URLSearchParams(location.search);
if (params.has('gallery')) {
  // 手書き JSON の組み立て確認用ギャラリー（?gallery=1 で 1 台だけ）
  const view = new ShowroomView();
  const only = params.get('gallery');
  const list = only ? blueprints.filter((_, i) => String(i) === only) : blueprints;
  view.setCars(list.map((bp) => new CarModel(bp)));
  stage.setView(view);
} else {
  const racers = blueprints.slice(0, 4);
  const track = new TrackData(TOY_CIRCUIT);
  const sim = new RaceSim(
    track,
    racers.map((bp, i) => ({ id: `car${i}`, name: bp.name, stats: bp.stats })),
  );
  stage.setView(new RaceView(sim, racers.map((bp) => new CarModel(bp))));
}
