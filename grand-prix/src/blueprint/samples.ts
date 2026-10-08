/**
 * 手書きの設計図サンプル。
 * - 組み立て処理（CarModel）の確認用
 * - LLM 用システムプロンプトの出力例としても使える
 * 最後の BROKEN_SAMPLE はわざと壊してあり、検証・補正の確認に使う。
 */

export const OEDO_GO = {
  name: 'お江戸号',
  concept: '牛車をモチーフにした雅な一台',
  parts: [
    { shape: 'box', size: [1.3, 0.8, 1.0], position: [-0.2, 0.95, 0], color: '#5d4037', role: 'body', material: 'wood', round: 0.1 },
    { shape: 'sphere', size: [0.8, 0.26, 0.66], position: [-0.2, 1.38, 0], color: '#212121', role: 'roof' },
    { shape: 'box', size: [1.66, 0.05, 1.3], position: [-0.2, 1.37, 0], color: '#3e2723', role: 'roof', material: 'wood', round: 0 },
    { shape: 'box', size: [0.04, 0.5, 0.8], position: [0.46, 0.98, 0], color: '#e8d5b0', role: 'deco', material: 'cloth', round: 0 },
    { shape: 'sphere', size: [0.08], position: [0.5, 1.2, 0.45], color: '#c62828', role: 'deco' },
    { shape: 'sphere', size: [0.08], position: [0.5, 1.2, -0.45], color: '#c62828', role: 'deco' },
    { shape: 'cylinder', size: [0.55, 0.12], position: [-0.2, 0.55, 0.62], rotation: [90, 0, 0], color: '#4e342e', role: 'wheel', material: 'wood' },
    { shape: 'cylinder', size: [0.55, 0.12], position: [-0.2, 0.55, -0.62], rotation: [90, 0, 0], color: '#4e342e', role: 'wheel', material: 'wood' },
    { shape: 'box', size: [1.3, 0.06, 0.06], position: [0.95, 0.62, 0.3], color: '#3e2723', role: 'deco', material: 'wood', round: 0 },
    { shape: 'box', size: [1.3, 0.06, 0.06], position: [0.95, 0.62, -0.3], color: '#3e2723', role: 'deco', material: 'wood', round: 0 },
    { shape: 'sphere', size: [0.42, 0.32, 0.28], position: [1.6, 0.6, 0], color: '#3e3e3e', role: 'deco' },
    { shape: 'sphere', size: [0.2], position: [2.0, 0.72, 0], color: '#3e3e3e', role: 'deco' },
    { shape: 'sphere', size: [0.08, 0.06, 0.1], position: [2.16, 0.66, 0], color: '#f8bbd0', role: 'deco' },
    { shape: 'cone', size: [0.04, 0.2], position: [2.0, 0.92, 0.12], rotation: [-35, 0, 0], color: '#fff8e1', role: 'deco' },
    { shape: 'cone', size: [0.04, 0.2], position: [2.0, 0.92, -0.12], rotation: [35, 0, 0], color: '#fff8e1', role: 'deco' },
    { shape: 'cylinder', size: [0.06, 0.4], position: [1.4, 0.2, 0.15], color: '#3e3e3e', role: 'deco' },
    { shape: 'cylinder', size: [0.06, 0.4], position: [1.4, 0.2, -0.15], color: '#3e3e3e', role: 'deco' },
    { shape: 'cylinder', size: [0.06, 0.4], position: [1.8, 0.2, 0.15], color: '#3e3e3e', role: 'deco' },
    { shape: 'cylinder', size: [0.06, 0.4], position: [1.8, 0.2, -0.15], color: '#3e3e3e', role: 'deco' },
  ],
  wheelStyle: 'wooden',
  stats: { speed: 3, acceleration: 4, handling: 7, stability: 10 },
  personality: 'のんびり屋。でも最後まで諦めない',
  catchphrase: '急がば回れでござる',
};

export const SHARP_GT = {
  name: 'シャープGT',
  concept: '風を切り裂く、低くて鋭いスポーツカー',
  parts: [
    { shape: 'box', size: [2.0, 0.36, 1.0], position: [0, 0.38, 0], color: '#e53935', role: 'body', round: 0.25 },
    { shape: 'box', size: [0.5, 0.2, 0.96], position: [0.95, 0.32, 0], rotation: [0, 0, -10], color: '#e53935', role: 'body', round: 0.2 },
    { shape: 'box', size: [2.02, 0.37, 0.16], position: [0, 0.385, 0], color: '#fafafa', role: 'deco', round: 0.25 },
    { shape: 'box', size: [0.85, 0.3, 0.8], position: [-0.15, 0.66, 0], color: '#263238', role: 'window', material: 'glass', round: 0.55 },
    { shape: 'box', size: [0.25, 0.05, 1.1], position: [-0.92, 0.86, 0], color: '#212121', role: 'spoiler', round: 0 },
    { shape: 'box', size: [0.06, 0.3, 0.06], position: [-0.92, 0.68, 0.35], color: '#212121', role: 'spoiler', round: 0 },
    { shape: 'box', size: [0.06, 0.3, 0.06], position: [-0.92, 0.68, -0.35], color: '#212121', role: 'spoiler', round: 0 },
    { shape: 'box', size: [0.05, 0.08, 0.22], position: [1.08, 0.4, 0.32], color: '#fffde7', role: 'light', round: 0.3 },
    { shape: 'box', size: [0.05, 0.08, 0.22], position: [1.08, 0.4, -0.32], color: '#fffde7', role: 'light', round: 0.3 },
    { shape: 'box', size: [0.05, 0.08, 0.25], position: [-1.0, 0.45, 0.32], color: '#ff1744', role: 'light', round: 0.3 },
    { shape: 'box', size: [0.05, 0.08, 0.25], position: [-1.0, 0.45, -0.32], color: '#ff1744', role: 'light', round: 0.3 },
    { shape: 'cylinder', size: [0.3, 0.26], position: [0.62, 0.3, 0.5], rotation: [90, 0, 0], color: '#212121', role: 'wheel' },
    { shape: 'cylinder', size: [0.3, 0.26], position: [0.62, 0.3, -0.5], rotation: [90, 0, 0], color: '#212121', role: 'wheel' },
    { shape: 'cylinder', size: [0.32, 0.3], position: [-0.62, 0.32, 0.5], rotation: [90, 0, 0], color: '#212121', role: 'wheel' },
    { shape: 'cylinder', size: [0.32, 0.3], position: [-0.62, 0.32, -0.5], rotation: [90, 0, 0], color: '#212121', role: 'wheel' },
  ],
  wheelStyle: 'sporty',
  stats: { speed: 9, acceleration: 7, handling: 5, stability: 3 },
  personality: '負けず嫌いのスピード狂',
  catchphrase: '前だけ見てろ！',
};

export const MARUMARU = {
  name: 'まるまるポコ',
  concept: 'ころんと丸い、パステルカラーの癒し系',
  parts: [
    { shape: 'sphere', size: [0.9, 0.55, 0.7], position: [0, 0.65, 0], color: '#f8bbd0', role: 'body' },
    { shape: 'sphere', size: [0.5, 0.45, 0.5], position: [-0.1, 1.05, 0], color: '#fff9c4', role: 'cabin' },
    { shape: 'sphere', size: [0.28, 0.24, 0.42], position: [0.22, 1.08, 0], color: '#b3e5fc', role: 'window', material: 'glass' },
    { shape: 'sphere', size: [0.14], position: [0.8, 0.74, 0.3], color: '#ffffff', role: 'light' },
    { shape: 'sphere', size: [0.14], position: [0.8, 0.74, -0.3], color: '#ffffff', role: 'light' },
    { shape: 'sphere', size: [0.07], position: [0.92, 0.76, 0.3], color: '#263238', role: 'deco' },
    { shape: 'sphere', size: [0.07], position: [0.92, 0.76, -0.3], color: '#263238', role: 'deco' },
    { shape: 'sphere', size: [0.08, 0.05, 0.08], position: [0.78, 0.55, 0.46], color: '#ff80ab', role: 'deco' },
    { shape: 'sphere', size: [0.08, 0.05, 0.08], position: [0.78, 0.55, -0.46], color: '#ff80ab', role: 'deco' },
    { shape: 'cylinder', size: [0.02, 0.4], position: [-0.2, 1.55, 0], color: '#90a4ae', role: 'deco' },
    { shape: 'sphere', size: [0.08], position: [-0.2, 1.77, 0], color: '#ff4081', role: 'deco' },
    { shape: 'cylinder', size: [0.28, 0.24], position: [0.5, 0.28, 0.55], color: '#5d4037', role: 'wheel' },
    { shape: 'cylinder', size: [0.28, 0.24], position: [0.5, 0.28, -0.55], color: '#5d4037', role: 'wheel' },
    { shape: 'cylinder', size: [0.28, 0.24], position: [-0.5, 0.28, 0.55], color: '#5d4037', role: 'wheel' },
    { shape: 'cylinder', size: [0.28, 0.24], position: [-0.5, 0.28, -0.55], color: '#5d4037', role: 'wheel' },
  ],
  wheelStyle: 'cute',
  stats: { speed: 5, acceleration: 8, handling: 7, stability: 4 },
  personality: 'おっとり。でも加速は得意',
  catchphrase: 'ぽこぽこ〜♪',
};

export const CURRY_YATAI = {
  name: 'カレー屋台号',
  concept: 'スパイスの香りをまき散らす屋台カー',
  parts: [
    { shape: 'box', size: [1.6, 0.5, 1.0], position: [0, 0.6, 0], color: '#a1887f', role: 'body', material: 'wood', round: 0.1 },
    { shape: 'box', size: [1.7, 0.08, 1.1], position: [0, 0.88, 0], color: '#6d4c41', role: 'body', material: 'wood', round: 0 },
    { shape: 'box', size: [0.06, 0.8, 0.06], position: [0.75, 1.3, 0.48], color: '#5d4037', role: 'deco', material: 'wood', round: 0 },
    { shape: 'box', size: [0.06, 0.8, 0.06], position: [0.75, 1.3, -0.48], color: '#5d4037', role: 'deco', material: 'wood', round: 0 },
    { shape: 'box', size: [0.06, 0.8, 0.06], position: [-0.75, 1.3, 0.48], color: '#5d4037', role: 'deco', material: 'wood', round: 0 },
    { shape: 'box', size: [0.06, 0.8, 0.06], position: [-0.75, 1.3, -0.48], color: '#5d4037', role: 'deco', material: 'wood', round: 0 },
    { shape: 'box', size: [1.9, 0.14, 1.35], position: [0, 1.75, 0], color: '#e65100', role: 'roof', round: 0.3 },
    { shape: 'box', size: [1.5, 0.32, 0.03], position: [0, 1.52, 0.52], color: '#1a237e', role: 'deco', material: 'cloth', round: 0 },
    { shape: 'box', size: [1.5, 0.32, 0.03], position: [0, 1.52, -0.52], color: '#1a237e', role: 'deco', material: 'cloth', round: 0 },
    { shape: 'sphere', size: [0.14, 0.2, 0.14], position: [0.88, 1.4, 0.56], color: '#ff7043', role: 'light' },
    { shape: 'cylinder', size: [0.26, 0.3], position: [-0.3, 1.08, 0], color: '#b0bec5', role: 'deco', material: 'metal' },
    { shape: 'cylinder', size: [0.24, 0.03], position: [-0.3, 1.23, 0], color: '#d18a00', role: 'deco' },
    { shape: 'sphere', size: [0.09], position: [-0.3, 1.36, 0], color: '#ffffff', role: 'deco' },
    { shape: 'sphere', size: [0.07], position: [-0.24, 1.5, 0.04], color: '#ffffff', role: 'deco' },
    { shape: 'sphere', size: [0.15, 0.08, 0.15], position: [0.35, 0.98, 0], color: '#fafafa', role: 'deco' },
    { shape: 'box', size: [0.6, 0.05, 0.05], position: [1.05, 0.72, 0.4], color: '#5d4037', role: 'deco', material: 'wood', round: 0 },
    { shape: 'box', size: [0.6, 0.05, 0.05], position: [1.05, 0.72, -0.4], color: '#5d4037', role: 'deco', material: 'wood', round: 0 },
    { shape: 'cylinder', size: [0.42, 0.1], position: [-0.1, 0.42, 0.58], rotation: [90, 0, 0], color: '#6d4c41', role: 'wheel', material: 'wood' },
    { shape: 'cylinder', size: [0.42, 0.1], position: [-0.1, 0.42, -0.58], rotation: [90, 0, 0], color: '#6d4c41', role: 'wheel', material: 'wood' },
  ],
  wheelStyle: 'wooden',
  stats: { speed: 4, acceleration: 6, handling: 6, stability: 8 },
  personality: '人情に厚い。おなかがすくと本気を出す',
  catchphrase: '辛さは速さだ！',
};

export const PIKA_UFO = {
  name: 'ピカピカUFO',
  concept: '車輪を捨てて宙に浮いた、宇宙からの来訪者',
  parts: [
    { shape: 'sphere', size: [1.0, 0.24, 1.0], position: [0, 0.5, 0], color: '#b0bec5', role: 'body', material: 'metal' },
    { shape: 'sphere', size: [0.45], position: [0, 0.72, 0], color: '#80deea', role: 'window', material: 'glass' },
    { shape: 'sphere', size: [0.16], position: [0.05, 0.86, 0], color: '#9ccc65', role: 'deco' },
    { shape: 'torus', size: [0.86, 0.05], position: [0, 0.5, 0], rotation: [90, 0, 0], color: '#76ff03', role: 'light' },
    { shape: 'sphere', size: [0.07], position: [0.72, 0.42, 0], color: '#ffeb3b', role: 'light' },
    { shape: 'sphere', size: [0.07], position: [-0.72, 0.42, 0], color: '#ffeb3b', role: 'light' },
    { shape: 'sphere', size: [0.07], position: [0, 0.42, 0.72], color: '#ffeb3b', role: 'light' },
    { shape: 'sphere', size: [0.07], position: [0, 0.42, -0.72], color: '#ffeb3b', role: 'light' },
    { shape: 'cone', size: [0.35, 0.3], position: [0, 0.28, 0], rotation: [180, 0, 0], color: '#78909c', role: 'body', material: 'metal' },
  ],
  wheelStyle: 'none',
  stats: { speed: 7, acceleration: 5, handling: 9, stability: 3 },
  personality: '地球の重力にまだ慣れていない',
  catchphrase: 'ワレワレハ、ハヤイ',
};

/** わざと壊した設計図（検証・補正の確認用） */
export const BROKEN_SAMPLE = {
  name: 12345,
  concept: '<img src=x onerror=alert(1)> こわれたデータ',
  parts: [
    { shape: 'hexagon', size: 'big', position: [100, -50, 'x'], color: 'rainbow' },
    'not a part',
    { shape: 'sphere', size: [0.5], position: [0, 0.6, 0], color: 'blue', role: 'chassis' },
  ],
  wheelStyle: 'square',
  stats: { speed: 999, acceleration: -5, handling: 'fast' },
};

export const SAMPLE_BLUEPRINTS: unknown[] = [OEDO_GO, SHARP_GT, MARUMARU, CURRY_YATAI, PIKA_UFO, BROKEN_SAMPLE];
