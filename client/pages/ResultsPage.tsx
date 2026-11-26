import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { getGameMeta } from '../../shared/games';
import { type GameResult, type ResultsResponse, winnersByLabel } from '../../shared/results';
import { GameEmblem, Icon } from '../components/Icon';
import { Button, Logo, Spinner } from '../components/ui';
import { loadThemeFonts, themeOfGame } from '../themes';

/**
 * 勝者の記録（トップの1つ奥のページ）
 *
 * 卓ごとに遊んだゲームが最後まで終わるたびに、サーバーが「いつ・どのゲームで・誰が1位か」を1件残す。
 * ここではそれを、終わった順の番号を付けて一覧にする。開いている間は自動で読み直す。
 */

const REFRESH_MS = 15_000;

const two = (n: number) => String(n).padStart(2, '0');
const timeOf = (at: number) => {
  const d = new Date(at);
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
};
/**
 * 「1日」は朝5時で切り替える。懇親会が夜の0時をまたいでも、同じ日の記録として続けて数えるため
 * （0時で切り替えると、日付が変わった瞬間に「今日」が空になり、番号も1に戻ってしまう）
 */
const DAY_STARTS_AT_HOUR = 5;
const partyDay = (at: number) => new Date(at - DAY_STARTS_AT_HOUR * 60 * 60 * 1000);
const dayKey = (at: number) => {
  const d = partyDay(at);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
const dayLabel = (at: number) => {
  const d = partyDay(at);
  return `${d.getMonth() + 1}月${d.getDate()}日（${'日月火水木金土'[d.getDay()]}）`;
};

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; results: GameResult[]; loadedAt: number };

export function ResultsPage() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [scope, setScope] = useState<'today' | 'all'>('today');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/results', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as ResultsResponse;
      setLoad({ kind: 'ready', results: body.results, loadedAt: Date.now() });
    } catch {
      // 読めなかったときは、前に読めた一覧を残す（会場の電波が一瞬切れても、画面が空にならないように）
      setLoad((prev) => (prev.kind === 'ready' ? prev : { kind: 'error' }));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const results = load.kind === 'ready' ? load.results : [];
  const today = dayKey(Date.now());
  // 番号は、その日に終わった順（1 がいちばん早い）。並べるのは新しい順
  const rows = useMemo(() => {
    const perDay = new Map<string, number>();
    const numbered = results.map((r) => {
      const day = dayKey(r.at);
      const no = (perDay.get(day) ?? 0) + 1;
      perDay.set(day, no);
      return { result: r, day, no };
    });
    return numbered.filter((x) => scope === 'all' || x.day === today).reverse();
  }, [results, scope, today]);
  const todayCount = results.filter((r) => dayKey(r.at) === today).length;

  // ゲームの印の横の題名を、そのゲームの文字で出す
  useEffect(() => {
    for (const id of new Set(results.map((r) => r.gameId))) loadThemeFonts(themeOfGame(id));
  }, [results]);

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between border-b border-line px-4 py-3 sm:px-6">
        <Logo />
        <Link to="/" className="inline-flex min-h-11 items-center gap-1 text-sm font-bold underline underline-offset-4 hover:text-accent-ink">
          <Icon name="undo" /> トップ
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-8 pb-20 sm:px-6">
        <div className="swiss-rule grid gap-x-8 gap-y-4 pt-4 lg:grid-cols-[16rem_1fr]">
          <div>
            <p className="text-xs font-bold tracking-[0.3em] text-accent-ink uppercase">Record</p>
            <h1 className="mt-1 font-display text-4xl leading-tight">勝者の記録</h1>
            <p className="mt-3 text-sm text-muted">
              ゲームが最後まで終わると、1位の人がここに自動で残ります。何時何分に終わったかと、その日に終わった順の番号が付きます。
            </p>
            <dl className="mt-6 border-t-4 border-line pt-3">
              <dt className="text-xs font-bold tracking-[0.2em] text-muted">TODAY</dt>
              <dd className="font-display text-5xl tabular-nums" data-testid="results-today-count">
                {two(todayCount)}
              </dd>
              <dd className="text-sm text-muted">今日、終わったゲームの数（日付は朝5時に切り替わります）</dd>
            </dl>
          </div>

          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="flex" role="group" aria-label="表示する範囲">
                {(
                  [
                    ['today', '今日'],
                    ['all', 'すべて'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setScope(value)}
                    aria-pressed={scope === value}
                    data-testid={`results-scope-${value}`}
                    className={`min-h-11 border-2 border-line px-4 text-sm font-extrabold ${value === 'all' ? '-ml-0.5' : ''} ${
                      scope === value ? 'bg-fg text-bg' : 'bg-panel'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Button size="sm" variant="secondary" onClick={() => void refresh()} loading={busy} data-testid="results-refresh">
                <Icon name="repeat" /> 読み直す
              </Button>
              {load.kind === 'ready' && (
                <p className="ml-auto text-xs text-muted">
                  {timeOf(load.loadedAt)} 時点（15秒ごとに自動で読み直します）
                </p>
              )}
            </div>

            {load.kind === 'loading' && (
              <p className="flex items-center gap-2 py-10 text-muted">
                <Spinner /> 読み込んでいます…
              </p>
            )}
            {load.kind === 'error' && (
              <p className="border-t-4 border-line py-10 font-bold" data-testid="results-error">
                記録を読み込めませんでした。電波を確かめて、「読み直す」を押してください。
              </p>
            )}
            {load.kind === 'ready' && rows.length === 0 && (
              <div className="border-t-4 border-b border-dashed border-line py-10" data-testid="results-empty">
                <p className="font-display text-2xl">{scope === 'today' ? '今日の記録は、まだありません' : '記録は、まだありません'}</p>
                <p className="mt-2 text-sm text-muted">
                  ゲームを最後（結果発表）まで遊ぶと、ここに出ます。途中でやめたゲームと、懇親会（クイズ・座席決め・ビンゴ）は残りません。
                </p>
              </div>
            )}

            {load.kind === 'ready' && <ByTeam results={results.filter((r) => scope === 'all' || dayKey(r.at) === today)} />}

            <ol className="flex flex-col" data-testid="results-list">
              {rows.map(({ result, day, no }, i) => (
                <ResultRow
                  key={result.id}
                  result={result}
                  no={no}
                  // 「すべて」のときは、日付が変わる所に見出しを入れる
                  dayHeading={scope === 'all' && (i === 0 || rows[i - 1].day !== day) ? dayLabel(result.at) : null}
                />
              ))}
            </ol>
          </div>
        </div>
      </main>
    </div>
  );
}

/** チームごとの1位（夕食のチームで遊んだ記録だけ）。各チームの代表を決めやすいように、いちばん上にまとめる */
function ByTeam({ results }: { results: GameResult[] }) {
  const teams = winnersByLabel(results);
  if (!teams.length) return null;
  return (
    <section className="mb-6 border-t-4 border-line pt-3" data-testid="results-by-team">
      <h2 className="font-display text-2xl">チームごとの1位</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {teams.map((t) => (
          <li key={t.label} className="border-2 border-line p-3">
            <p className="font-display text-xl">{t.label}</p>
            <ol className="mt-2 flex flex-col gap-1">
              {t.wins.map((w, i) => (
                <li key={`${w.at}-${i}`} className="flex flex-wrap items-baseline gap-x-2 text-base">
                  <span className="text-sm text-muted tabular-nums">{timeOf(w.at)}</span>
                  <span className="text-sm font-bold">{getGameMeta(w.gameId)?.title ?? w.gameId}</span>
                  <span className="font-extrabold">
                    <Icon name="crown" className="mr-0.5 inline-block h-[1em] w-[1em] align-[-0.1em]" />
                    {w.winners.join('・')}
                  </span>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ResultRow({ result, no, dayHeading }: { result: GameResult; no: number; dayHeading: string | null }) {
  const meta = getGameMeta(result.gameId);
  const theme = themeOfGame(result.gameId);
  return (
    <li data-testid="result-row">
      {dayHeading && <p className="mt-8 mb-2 font-display text-xl first:mt-0">{dayHeading}</p>}
      <article className="grid grid-cols-[3.5rem_1fr] gap-x-4 border-t-4 border-line py-4 sm:grid-cols-[3.5rem_6.5rem_1fr]">
        {/* 終わった順の番号 */}
        <p className="font-display text-4xl leading-none tabular-nums" aria-label={`${no}番目`}>
          {two(no)}
        </p>
        {/* 終わった時刻 */}
        <p className="col-start-2 font-display text-3xl leading-none tabular-nums sm:col-start-auto" data-testid="result-time">
          {timeOf(result.at)}
        </p>

        <div className="col-span-2 mt-3 min-w-0 sm:col-span-1 sm:mt-0">
          <div className="flex items-center gap-2">
            <span data-theme={theme} className="theme-swatch inline-flex shrink-0 items-center border border-line px-1">
              <GameEmblem id={result.gameId} className="h-7 w-9" />
            </span>
            <span className="truncate text-sm font-bold">{meta?.title ?? result.gameId}</span>
            {result.label && (
              <span className="shrink-0 border-2 border-line px-2 py-0.5 text-xs font-extrabold" data-testid="result-label">
                {result.label}
              </span>
            )}
          </div>

          {result.ranked ? (
            <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1" data-testid="result-winners">
              <span className="inline-flex items-center gap-1 bg-accent px-2 py-0.5 text-xs font-extrabold tracking-widest text-on-accent">
                <Icon name="crown" /> {result.winners.length > 1 ? '同点1位' : '1位'}
              </span>
              <span className="font-display text-3xl leading-tight break-all">
                {result.winners.length ? result.winners.join('・') : '該当なし'}
              </span>
            </p>
          ) : (
            <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1" data-testid="result-winners">
              <span className="border border-line px-2 py-0.5 text-xs font-extrabold tracking-widest">順位なし</span>
              <span className="font-display text-xl leading-tight">{result.note ?? '勝ち負けの無いゲームです'}</span>
            </p>
          )}

          <details className="mt-2">
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-bold underline underline-offset-4">
              {result.ranked ? '全員の順位を見る' : '参加した人を見る'}（{result.ranking.length}人）
            </summary>
            <ol className="mt-1 flex flex-col">
              {result.ranking.map((r, i) => (
                <li key={`${r.name}-${i}`} className="flex items-baseline gap-3 border-t border-line py-1.5 text-sm">
                  <span className="w-8 shrink-0 font-display tabular-nums">{result.ranked ? `${r.rank}位` : '—'}</span>
                  <span className="min-w-0 flex-1 break-all font-bold">
                    {r.name}
                    {r.left && <span className="ml-2 text-xs font-normal text-muted">（途中で退出）</span>}
                  </span>
                  <span className="shrink-0 tabular-nums">{r.score}点</span>
                </li>
              ))}
            </ol>
          </details>
        </div>
      </article>
    </li>
  );
}
