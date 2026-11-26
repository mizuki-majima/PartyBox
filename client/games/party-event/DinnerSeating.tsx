import type { DinnerView } from '../../../shared/games/views';
import { Card } from '../../components/ui';

/** 所属の色（凡例の順）。名簿に無い名前は色なし */
const TONES = [
  'bg-tone-0 text-on-tone-0',
  'bg-tone-1 text-on-tone-1',
  'bg-tone-2 text-on-tone-2',
  'bg-tone-3 text-on-tone-3',
];
const toneClass = (tone: number | null) => (tone === null ? 'bg-panel text-fg' : (TONES[tone] ?? 'bg-panel text-fg'));

/**
 * 夕食の席。テーブル → チーム（破線の枠）→ 人（所属の色の丸）。
 * 受付で配る座席表と同じ並びにして、自分の席とチームの人がひと目で分かるようにする
 */
export function DinnerSeating({ dinner }: { dinner: DinnerView }) {
  return (
    <div className="flex flex-col gap-3" data-testid="dinner-seating">
      <h2 className="flex items-center gap-2 font-display text-2xl">
        <span className="event-squares" aria-hidden />
        {dinner.title}
      </h2>
      {dinner.tables.map((table) => (
        <Card key={table.name} className="!p-4">
          <div data-testid="dinner-table">
            <p className="mb-3 font-display text-xl">
              {table.name}
              <span className="ml-2 text-base text-muted">{table.count}名</span>
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {table.teams.map((team) => {
                const mine = team.members.some((m) => m.you);
                return (
                  <section
                    key={team.name}
                    className={`rounded-xl border-2 border-dashed p-3 ${mine ? 'border-accent bg-hi/25' : 'border-accent/60'}`}
                  >
                    <p className="font-display text-lg text-accent-ink">
                      {team.name}
                      {mine && <span className="ml-2 text-sm text-fg">あなたのチーム</span>}
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {team.members.map((m, i) => (
                        <li
                          key={`${m.name}-${i}`}
                          data-testid={m.you ? 'dinner-you' : undefined}
                          className={`inline-flex min-h-11 items-center rounded-full px-3.5 text-base font-extrabold ${toneClass(m.tone)} ${
                            m.you ? 'ring-4 ring-hi' : 'ring-1 ring-line'
                          }`}
                        >
                          {m.name}
                          {m.you && <span className="ml-1.5 text-xs">（あなた）</span>}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        </Card>
      ))}
      {dinner.legend.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-base font-bold" aria-label="色の見方">
          {dinner.legend.map((l) => (
            <li key={l.tone} className="inline-flex items-center gap-2">
              <span className={`inline-block h-5 w-5 rounded-full ring-1 ring-line ${toneClass(l.tone)}`} aria-hidden />
              {l.label}
              <span className="text-muted">{l.count}名</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
