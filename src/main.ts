import './style.css';
import { App } from './app/App';
import { buildScreen } from './screens/BuildScreen';
import { raceScreen } from './screens/RaceScreen';
import { resultScreen } from './screens/ResultScreen';
import { rivalsScreen } from './screens/RivalsScreen';
import { titleScreen } from './screens/TitleScreen';

const root = document.getElementById('app')!;
const params = new URLSearchParams(location.search);

if (import.meta.env.DEV && (params.has('gallery') || params.has('gen'))) {
  // 開発用: ?gallery で手書きサンプル、?gen=文1|文2 で生成結果を並べて確認する
  void import('./dev/gallery').then((m) => m.showGallery(root, params));
} else {
  const app = new App(root);
  app
    .register('title', titleScreen)
    .register('build', buildScreen)
    .register('rivals', rivalsScreen)
    .register('race', raceScreen)
    .register('result', resultScreen);
  // 開発用: ?speed=8 で早送り
  if (import.meta.env.DEV && params.has('speed')) app.stage.timeScale = Number(params.get('speed')) || 1;
  app.goto('title');
}
