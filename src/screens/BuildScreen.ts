import type { App, Screen } from '../app/App';
import { LIMITS, type CarBlueprint } from '../blueprint/types';
import { CarModel } from '../car/CarModel';
import { ShowroomView } from '../car/ShowroomView';
import { EXAMPLE_PROMPTS } from '../generator';
import { button, carCard } from '../ui/components';
import { clear, h, setText } from '../ui/dom';

const INPUT_MAX = 60;

/**
 * 車づくり画面。
 * 自由記述 → 生成（1〜2 秒の演出）→ くるくる回るプレビューと名刺を表示。
 */
export function buildScreen(app: App): Screen {
  let view: ShowroomView | null = null;
  let abort: AbortController | null = null;

  return {
    mount(root) {
      view = new ShowroomView('#fff3d6');
      view.setCars([], { slots: 1 });

      const preview = h('div', { class: 'build-preview' });
      const overlay = h('div', { class: 'preview-overlay' }, h('div', { class: 'preview-hint', text: 'ここに きみの車が あらわれるよ' }));
      const loading = h('div', { class: 'loading', attrs: { hidden: '' } }, h('div', { class: 'loading-dots' }, h('i'), h('i'), h('i')), h('div', { class: 'loading-text', text: '生成中…' }));
      preview.append(overlay, loading);

      const input = h('input', {
        class: 'prompt-input',
        attrs: {
          type: 'text',
          maxlength: String(INPUT_MAX),
          placeholder: '例: カレーの匂いがしそうな車',
          'aria-label': 'どんな車？',
          enterkeyhint: 'go',
          autocomplete: 'off',
        },
      });
      const counter = h('span', { class: 'counter', text: `0/${INPUT_MAX}` });
      const generateBtn = button('この言葉で車をつくる', () => void generate(input.value), 'primary');
      const chips = h(
        'div',
        { class: 'chips' },
        ...EXAMPLE_PROMPTS.map((p) =>
          h('button', {
            class: 'chip',
            text: p,
            attrs: { type: 'button' },
            on: {
              click: () => {
                input.value = p;
                updateCounter();
                void generate(p);
              },
            },
          }),
        ),
      );
      const cardSlot = h('div', { class: 'card-slot' });
      const raceBtn = button('この車でレースへ！', () => app.next(), 'go');
      const actions = h('div', { class: 'build-actions', attrs: { hidden: '' } }, raceBtn);
      const errorBox = h('div', { class: 'build-error', attrs: { hidden: '' } });

      const panel = h(
        'div',
        { class: 'build-panel' },
        h('h2', { class: 'panel-title', text: 'どんな車にする？' }),
        h('p', { class: 'panel-lead', text: '話し言葉で自由に書いてね。書いたことが、見た目と性能の両方に出るよ。' }),
        h('div', { class: 'input-row' }, input, counter),
        generateBtn,
        h('div', { class: 'demo-note', text: app.generator.label }),
        h('div', { class: 'chips-label', text: 'たとえば…' }),
        chips,
        errorBox,
        cardSlot,
        actions,
      );

      root.append(h('div', { class: 'screen build-screen' }, preview, panel));
      app.stage.attach(preview);
      app.stage.setView(view);

      function updateCounter() {
        setText(counter, `${Array.from(input.value).length}/${INPUT_MAX}`);
      }
      input.addEventListener('input', updateCounter);
      input.addEventListener('keydown', (e) => {
        // 日本語入力の変換確定の Enter では生成しない
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
          e.preventDefault();
          void generate(input.value);
        }
      });

      function showCar(bp: CarBlueprint, pop: boolean) {
        view?.setCars([new CarModel(bp)], { slots: 1, pop });
        overlay.hidden = true;
        clear(cardSlot);
        cardSlot.append(carCard(bp, { badge: 'きみの車' }));
        actions.hidden = false;
        setText(generateBtn, 'この言葉で作り直す');
        if (pop) requestAnimationFrame(() => cardSlot.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
      }

      async function generate(raw: string) {
        const prompt = raw.trim();
        errorBox.hidden = true;
        if (!prompt) {
          errorBox.hidden = false;
          setText(errorBox, 'どんな車がいいか、ひとこと書いてみてね');
          input.focus();
          return;
        }
        abort?.abort();
        const ctrl = (abort = new AbortController());
        input.disabled = true;
        generateBtn.disabled = true;
        chips.classList.add('disabled');
        actions.hidden = true;
        loading.hidden = false;
        overlay.hidden = true;
        if (view) view.spinSpeed = 5;
        try {
          const bp = await app.generator.generate(Array.from(prompt).slice(0, LIMITS.promptMax).join(''), {
            signal: ctrl.signal,
            onProgress: (m) => setText(loading.querySelector('.loading-text')!, m),
          });
          app.state.player = bp;
          app.state.rivals = []; // 車が変わったらライバルも選び直す
          showCar(bp, true);
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
          console.error(err);
          errorBox.hidden = false;
          setText(errorBox, 'うまく作れなかったみたい。もう一度ためしてね');
        } finally {
          if (abort === ctrl) {
            input.disabled = false;
            generateBtn.disabled = false;
            chips.classList.remove('disabled');
            loading.hidden = true;
            if (view) view.spinSpeed = 0.6;
          }
        }
      }

      // 作り直しで戻ってきたときは、前の車と文を出しておく
      const prev = app.state.player;
      if (prev) {
        input.value = prev.prompt ?? '';
        updateCounter();
        showCar(prev, false);
      } else {
        setTimeout(() => input.focus(), 50);
      }
    },
    unmount() {
      abort?.abort();
      view?.dispose();
      view = null;
    },
  };
}
