import './style.css';
import { Stage } from './engine/Stage';
import { RaceSim } from './race/RaceSim';
import { RaceView } from './race/RaceView';
import { TOY_CIRCUIT, TrackData } from './track/TrackData';

const app = document.getElementById('app')!;
const stage = new Stage();
stage.attach(app);

const track = new TrackData(TOY_CIRCUIT);
const sim = new RaceSim(track, [
  { id: 'a', name: 'あか', stats: { speed: 8, acceleration: 6, handling: 5, stability: 5 } },
  { id: 'b', name: 'あお', stats: { speed: 5, acceleration: 8, handling: 6, stability: 5 } },
  { id: 'c', name: 'きいろ', stats: { speed: 4, acceleration: 5, handling: 9, stability: 6 } },
  { id: 'd', name: 'みどり', stats: { speed: 6, acceleration: 6, handling: 6, stability: 6 } },
]);
stage.setView(new RaceView(sim, ['#ff5a5a', '#3fa7ff', '#ffd23f', '#7ed957']));
