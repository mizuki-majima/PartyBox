import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';

/**
 * Mermaid の図を1つ描く。
 *
 * Mermaid は大きい（数 MB）ので、このページを開いて図が画面に近づいたときにだけ読み込む
 * （ほかのページのファイルには入らない）。読めない・描けないときは、図の元の文をそのまま出す。
 * 色と文字は、いまのテーマ（共通画面のスイススタイル）のトークンから取る。
 */

type MermaidApi = (typeof import('mermaid'))['default'];

let loader: Promise<MermaidApi> | null = null;

function loadMermaid(): Promise<MermaidApi> {
  if (!loader) {
    loader = import('mermaid').then(({ default: mermaid }) => {
      const css = getComputedStyle(document.documentElement);
      const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
      const fg = v('--t-fg', '#111111');
      const bg = v('--t-panel', '#ffffff');
      const sub = v('--t-panel-2', '#efefef');
      const accent = v('--t-accent', '#e10600');
      const muted = v('--t-muted', '#5f5f5f');
      mermaid.initialize({
        startOnLoad: false,
        // 図の中の文字は HTML として読まない（図の元はこのリポジトリの文だけだが、念のため）
        securityLevel: 'strict',
        theme: 'base',
        fontFamily: v('--t-font-body', 'sans-serif'),
        themeVariables: {
          fontFamily: v('--t-font-body', 'sans-serif'),
          fontSize: '15px',
          background: bg,
          primaryColor: bg,
          primaryTextColor: fg,
          primaryBorderColor: fg,
          secondaryColor: sub,
          tertiaryColor: v('--t-bg', '#fafafa'),
          lineColor: fg,
          textColor: fg,
          clusterBkg: v('--t-bg', '#fafafa'),
          clusterBorder: fg,
          edgeLabelBackground: bg,
          actorBkg: bg,
          actorBorder: fg,
          actorTextColor: fg,
          actorLineColor: muted,
          signalColor: fg,
          signalTextColor: fg,
          labelBoxBkgColor: fg,
          labelBoxBorderColor: fg,
          labelTextColor: bg,
          loopTextColor: fg,
          noteBkgColor: bg,
          noteBorderColor: accent,
          noteTextColor: fg,
          activationBkgColor: sub,
          activationBorderColor: fg,
          sequenceNumberColor: bg,
          altBackground: sub,
          labelColor: fg,
          stateBkg: bg,
          stateLabelColor: fg,
          compositeBackground: v('--t-bg', '#fafafa'),
          compositeTitleBackground: sub,
          transitionColor: fg,
          transitionLabelColor: fg,
          specialStateColor: fg,
        },
        // スイススタイルに合わせて、影と角丸を消す（Mermaid は箱に影を付ける）
        themeCSS: '* { filter: none !important; } rect { rx: 0 !important; ry: 0 !important; }',
        // 図は縮めずに原寸で描き、はみ出したら枠の中で横にスクロールする（スマホで文字が潰れないように）
        flowchart: { useMaxWidth: false, curve: 'linear', htmlLabels: true, padding: 12, wrappingWidth: 360 },
        sequence: { useMaxWidth: false, mirrorActors: false, wrap: false, boxMargin: 8, noteMargin: 8 },
        state: { useMaxWidth: false },
      });
      return mermaid;
    });
    // 読み込みに失敗したら、次に開いたときにもう一度試す
    loader.catch(() => {
      loader = null;
    });
  }
  return loader;
}

type State = { kind: 'waiting' } | { kind: 'ok'; svg: string } | { kind: 'error' };

export function Diagram({ code, title, caption, testId }: { code: string; title: string; caption?: string; testId?: string }) {
  const rawId = useId();
  // useId の値には「:」が入り、要素の id としては使いにくいので除く
  const id = `mmd-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const boxRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [state, setState] = useState<State>({ kind: 'waiting' });
  const [fit, setFit] = useState(false);
  /** 図が枠より広いか（広ければ「横にスクロールできます」と出す） */
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || state.kind !== 'ok') return;
    const check = () => setWide(el.scrollWidth > el.clientWidth + 2);
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [state.kind, fit]);

  // 画面に近づいてから描く（図が8つあるので、最初に全部描くとスマホで重い）
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    (async () => {
      try {
        const mermaid = await loadMermaid();
        // 文字の幅を測ってから箱の大きさを決めるので、文字の読み込みを待つ
        await document.fonts?.ready;
        const { svg } = await mermaid.render(id, code);
        if (!cancelled) setState({ kind: 'ok', svg });
      } catch (err) {
        console.error('[tech] 図を描けませんでした', err);
        if (!cancelled) setState({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [near, code, id]);

  return (
    <figure className="border-t-4 border-line pt-3" data-testid={testId}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <figcaption className="font-display text-xl leading-tight">{title}</figcaption>
        {state.kind === 'ok' && (
          <button
            type="button"
            onClick={() => setFit((f) => !f)}
            aria-pressed={fit}
            className="min-h-11 border-2 border-line px-3 text-sm font-extrabold hover:bg-fg hover:text-bg"
          >
            {fit ? '原寸で見る' : '幅に合わせる'}
          </button>
        )}
      </div>
      {caption && <p className="mt-1 text-sm text-muted">{caption}</p>}
      {state.kind === 'ok' && wide && !fit && (
        <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-muted">
          <Icon name="next" className="h-3 w-3" /> 図は横にスクロールできます
        </p>
      )}
      <div
        ref={boxRef}
        className={`tech-diagram mt-3 overflow-x-auto border border-line bg-panel p-3 ${
          fit ? '[&_svg]:!h-auto [&_svg]:!max-w-full' : ''
        }`}
        data-state={state.kind}
      >
        {state.kind === 'waiting' && <p className="py-10 text-center text-sm text-muted">図を読み込んでいます…</p>}
        {state.kind === 'ok' && (
          <div className={fit ? 'w-full' : 'w-max min-w-full'} dangerouslySetInnerHTML={{ __html: state.svg }} />
        )}
        {state.kind === 'error' && (
          <div>
            <p className="mb-2 text-sm font-bold text-danger-ink">図を表示できませんでした。代わりに Mermaid のソースを表示します。</p>
            <pre className="overflow-x-auto text-xs leading-relaxed">{code}</pre>
          </div>
        )}
      </div>
      {state.kind !== 'error' && (
        <details className="mt-2 text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold underline underline-offset-4">
            Mermaid のソース
          </summary>
          <pre className="mt-2 overflow-x-auto border border-line bg-panel-2 p-3 text-xs leading-relaxed">{code}</pre>
        </details>
      )}
    </figure>
  );
}
