import { EVENT_GAMES, GAMES, SOLO_GAMES } from '../../../shared/games';
import { themeOfGame } from '../../themes';

/**
 * ゲームの一覧。shared/games.ts（カタログ）からその場で作るので、ゲームを足せばここにも自動で出る
 */
interface Row {
  id: string;
  title: string;
  kind: string;
  players: string;
  time: string;
  theme: string;
  settings: string;
}

const rows: Row[] = [
  ...GAMES.map((g) => ({
    id: g.id,
    title: g.title,
    kind: g.hidden ? 'ルームで遊ぶ（一覧に出していない）' : 'ルームで遊ぶ',
    players: `${g.minPlayers}〜${g.maxPlayers}人`,
    time: g.estimatedTime,
    theme: themeOfGame(g.id),
    settings: g.settings.map((s) => s.key).join(', ') || '—',
  })),
  ...EVENT_GAMES.map((g) => ({
    id: g.id,
    title: g.title,
    kind: 'イベント（司会が進行）',
    players: `${g.minPlayers}〜${g.maxPlayers}人`,
    time: g.estimatedTime,
    theme: themeOfGame(g.id),
    settings: g.settings.map((s) => s.key).join(', ') || '—',
  })),
  ...SOLO_GAMES.map((g) => ({
    id: g.id,
    title: g.title,
    kind: '1人用・別ページ',
    players: g.players,
    time: g.estimatedTime,
    theme: '独自の CSS',
    settings: '—',
  })),
];

export function Catalog() {
  return (
    <div className="overflow-x-auto" data-testid="tech-catalog">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b-2 border-line">
            <th className="py-2 pr-3 font-extrabold">id</th>
            <th className="py-2 pr-3 font-extrabold">名前</th>
            <th className="py-2 pr-3 font-extrabold">種類</th>
            <th className="py-2 pr-3 font-extrabold">人数</th>
            <th className="py-2 pr-3 font-extrabold">時間</th>
            <th className="py-2 pr-3 font-extrabold">テーマ</th>
            <th className="py-2 font-extrabold">設定のキー</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line align-top">
              <td className="py-2 pr-3 font-mono text-xs">{r.id}</td>
              <td className="py-2 pr-3 font-bold">{r.title}</td>
              <td className="py-2 pr-3">{r.kind}</td>
              <td className="py-2 pr-3 tabular-nums">{r.players}</td>
              <td className="py-2 pr-3">{r.time}</td>
              <td className="py-2 pr-3 font-mono text-xs">{r.theme}</td>
              <td className="py-2 font-mono text-xs">{r.settings}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
