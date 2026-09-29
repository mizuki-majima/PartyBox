import './style.css';
import { App } from './app/App';
import { buildScreen } from './screens/BuildScreen';
import { raceScreen } from './screens/RaceScreen';
import { resultScreen } from './screens/ResultScreen';
import { rivalsScreen } from './screens/RivalsScreen';
import { titleScreen } from './screens/TitleScreen';

const root = document.getElementById('app')!;
const params = new URLSearchParams(location.search);

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Web フォントを少しだけ待つ（コースの看板の文字に使うため）。遅ければ待たない */
function waitFonts(ms: number): Promise<unknown> {
  return Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, ms))]);
}

async function start() {
  if (!hasWebGL()) {
    root.replaceChildren();
    const msg = document.createElement('div');
    msg.className = 'fatal';
    msg.textContent = 'ごめんなさい、このブラウザでは 3D の表示ができないようです。\n最新の Chrome / Safari / Edge / Firefox でお試しください。';
    msg.style.whiteSpace = 'pre-line';
    root.append(msg);
    return;
  }
  await waitFonts(1500);
  root.replaceChildren();

  if (import.meta.env.DEV && (params.has('gallery') || params.has('gen'))) {
    // 開発用: ?gallery で手書きサンプル、?gen=文1|文2 で生成結果を並べて確認する
    const m = await import('./dev/gallery');
    m.showGallery(root, params);
    return;
  }

  const app = new App(root);
  app
    .register('title', titleScreen)
    .register('build', buildScreen)
    .register('rivals', rivalsScreen)
    .register('race', raceScreen)
    .register('result', resultScreen);
  if (import.meta.env.DEV) {
    // 開発用: ?speed=8 で早送り、window.__app で状態を見られる
    if (params.has('speed')) app.stage.timeScale = Number(params.get('speed')) || 1;
    (window as unknown as { __app: App }).__app = app;
  }
  app.goto('title');
}

void start();
