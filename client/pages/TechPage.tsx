/**
 * 技術者向けのページ（/tech）。PartyBox がどう作られているかを、構成図・シーケンス図で説明する。
 *
 * - 図は Mermaid の文（client/pages/tech/diagrams.ts）から、このページを開いたときだけ描く
 *   （Mermaid は大きいので、ほかのページのファイルには入れない）
 * - ゲームの一覧と、使っている部品の版は、コード（shared/games.ts・package.json）からその場で作る
 * - 公開リポジトリなので、本番の URL・IP・資源の名前・ルームコード・合言葉は書かない
 *
 * 仕組みを変えたら、ここの説明と図も直す。
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import pkg from '../../package.json';
import { Icon } from '../components/Icon';
import { Logo } from '../components/ui';
import { Catalog } from './tech/Catalog';
import { Diagram } from './tech/Diagram';
import {
  ACTION_FLOW,
  AD_DODGE_HIT,
  AD_DODGE_STATES,
  ARCHITECTURE,
  BASE_STATES,
  CREATE_JOIN,
  RECONNECT,
  TIMER,
} from './tech/diagrams';
import { HitZoneFigure } from './tech/HitZoneFigure';
import { LiveClock } from './tech/LiveClock';

const deps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };
/** package.json に書いてある版（^ や ~ は外す） */
const ver = (name: string) => (deps[name] ?? '').replace(/^[\^~]/, '');

const SECTIONS = [
  { id: 'overview', label: '01', title: '全体' },
  { id: 'architecture', label: '02', title: 'システム構成' },
  { id: 'join', label: '03', title: 'ルームに入るまで' },
  { id: 'action', label: '04', title: '操作が全員に届くまで' },
  { id: 'reconnect', label: '05', title: '切断と再接続' },
  { id: 'timer', label: '06', title: 'タイマーの合わせ方' },
  { id: 'phases', label: '07', title: 'ゲームの段の進み方' },
  { id: 'ad-dodge', label: '08', title: '広告をすり抜けろ！の当たり判定' },
  { id: 'storage', label: '09', title: '保存するもの' },
  { id: 'quality', label: '10', title: 'テストと CI・反映' },
  { id: 'code', label: '11', title: 'コードの置き場とゲームの足し方' },
  { id: 'catalog', label: '12', title: 'ゲームの一覧' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

/** 太い罫線のあとに、左に番号と題・右に中身（トップページと同じスイススタイルの段組み） */
function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const s = SECTIONS.find((x) => x.id === id)!;
  return (
    <section id={`tech-${id}`} className="scroll-mt-4 pb-16" data-testid={`tech-section-${id}`}>
      <div className="swiss-rule grid gap-x-8 gap-y-4 pt-4 lg:grid-cols-[14rem_1fr]">
        <div>
          <p className="font-display text-5xl leading-none tabular-nums text-accent-ink">{s.label}</p>
          <h2 className="mt-2 font-display text-2xl leading-tight">{s.title}</h2>
        </div>
        <div className="flex min-w-0 flex-col gap-6">{children}</div>
      </div>
    </section>
  );
}

function Table({ head, rows, mono = [] }: { head: string[]; rows: ReactNode[][]; mono?: number[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b-2 border-line">
            {head.map((h) => (
              <th key={h} className="py-2 pr-3 font-extrabold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line align-top">
              {r.map((c, j) => (
                <td key={j} className={`py-2 pr-3 ${mono.includes(j) ? 'font-mono text-xs' : ''}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Points({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2 text-base">
      {items.map((t, i) => (
        <li key={i} className="grid grid-cols-[1.25rem_1fr] gap-1">
          <span className="mt-[0.6em] h-2 w-2 bg-accent" aria-hidden />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

const Code = ({ children }: { children: ReactNode }) => (
  <code className="bg-panel-2 px-1 font-mono text-[0.9em] break-all">{children}</code>
);

export function TechPage() {
  return (
    <div className="min-h-dvh" data-testid="tech-page">
      <header className="mx-auto flex max-w-6xl items-center justify-between border-b border-line px-4 py-3 sm:px-6">
        <Logo />
        <Link to="/" className="inline-flex min-h-11 items-center gap-1 text-sm font-bold underline underline-offset-4 hover:text-accent-ink">
          <Icon name="undo" /> トップ
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
        {/* はじめに: 開発中であることを、いちばん上に大きく出す */}
        <div className="pb-12">
          <p
            className="inline-flex items-center gap-2 bg-accent px-3 py-1.5 text-sm font-extrabold tracking-[0.2em] text-on-accent"
            data-testid="tech-dev-label"
          >
            <Icon name="alert" /> 開発中
          </p>
          <p className="mt-6 text-xs font-bold tracking-[0.3em] text-accent-ink uppercase">For engineers</p>
          <h1 className="mt-1 font-display text-4xl leading-[1.1] sm:text-6xl">PartyBox のしくみ</h1>
          <p className="mt-5 max-w-3xl text-lg">
            スマホのブラウザで集まって遊ぶゲーム集を、どう作っているかの説明です。システムの構成、通信の順番（シーケンス図）、
            段の進み方（状態遷移図）、保存するもの、テストを、実際のコードに合わせて書いています。
          </p>
          <p className="mt-3 max-w-3xl text-sm text-muted">
            このページは作っている途中です。説明とコードが食い違っていたら、コードのほうが正しいです。
            図の下の「図の元（Mermaid）」を開くと、図を書いた文がそのまま読めます。
          </p>
          <nav aria-label="目次" className="mt-8 border-t-4 border-line pt-3">
            <p className="text-xs font-bold tracking-[0.2em] text-muted">CONTENTS</p>
            <ol className="mt-2 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
              {SECTIONS.map((s) => (
                <li key={s.id} className="border-b border-line">
                  <a href={`#tech-${s.id}`} className="flex min-h-11 items-center gap-3 font-bold hover:text-accent-ink">
                    <span className="font-display tabular-nums text-accent-ink">{s.label}</span>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>

        <Section id="overview">
          <Points
            items={[
              <>
                <b>1台のサーバーの、1つの Node.js のプロセス</b>が、画面のファイルの配信と、全部のルームのリアルタイムの通信を受け持ちます。
              </>,
              <>
                <b>判定はすべてサーバー</b>で行います（サーバー権威）。スマホは「押した・書いた」という操作だけを送り、
                点数・勝ち負け・段の進みはサーバーが決めます。
              </>,
              <>
                サーバーは、状態が変わるたびに<b>人ごとに中身を変えた画面のデータ（ビュー）</b>を送ります。
                ほかの人の回答や、嘘つきの正体のような秘密は、見てよい人のビューにしか入りません。
              </>,
              <>登録もログインもありません。ルームコードと、端末に保存した合言葉（token）で同じ人だと見分けます。</>,
            ]}
          />
          <Table
            head={['ところ', '使っているもの', '版（package.json）']}
            mono={[2]}
            rows={[
              ['画面', 'React・TypeScript・React Router・Tailwind CSS', `react ${ver('react')} / react-router ${ver('react-router')} / tailwindcss ${ver('tailwindcss')}`],
              ['画面の組み立て', 'Vite（2つのページを一緒に作る）', `vite ${ver('vite')}`],
              ['サーバー', 'Node.js 22・Express・Socket.IO', `express ${ver('express')} / socket.io ${ver('socket.io')}`],
              ['設定の確かめ', 'Zod（懇親会の名簿・問題のファイル）', `zod ${ver('zod')}`],
              ['3D', 'Three.js（プロンプト・グランプリだけ）', `three ${ver('three')}`],
              ['サーバーの組み立て', 'esbuild（1つの JS にまとめる）', `esbuild ${ver('esbuild')}`],
              ['テスト', 'Vitest・Playwright', `vitest ${ver('vitest')} / @playwright/test ${ver('@playwright/test')}`],
              ['このページの図', 'Mermaid（このページを開いたときだけ読む）', `mermaid ${ver('mermaid')}`],
              ['文字', '@fontsource の文字を同梱して自前で配信（外のサーバーから読まない）', '—'],
            ]}
          />
        </Section>

        <Section id="architecture">
          <Diagram
            code={ARCHITECTURE}
            title="システム構成図"
            caption="太い線は WebSocket（Socket.IO）、細い線はふつうの HTTPS です。"
            testId="tech-diagram-architecture"
          />
          <Points
            items={[
              <>
                ルームの状態は<b>プロセスのメモリ</b>にあります。だから1台で動かします（台数を増やすと、同じルームの人が別のサーバーにつながってしまう）。
              </>,
              <>
                反映（再起動）すると、遊びのゲームのルームは消えます。懇親会のルームと勝者の記録だけはファイルに書いてあり、起動のときに読み戻します（09）。
              </>,
              <>
                Socket.IO は WebSocket でつなぎ、だめならポーリングに切り替えます。生きているかの確かめは20秒ごと。
                お絵描きの画像を送るので、1回に送れる大きさは 1MB まで。
              </>,
              <>
                URL は1つの入り口から配ります。<Code>/</Code>・<Code>/room/…</Code> などは React の SPA（<Code>index.html</Code>）、
                <Code>/grand-prix/</Code> は Three.js の別ページです。Three.js は別のファイルに分けてあり、SPA では読み込みません。
              </>,
              <>
                HTTP の API は <Code>/api/health</Code>（生きているか）、<Code>/api/event</Code>（常設の懇親会ルームがあるかどうかだけ。コードは返さない）、
                <Code>/api/results</Code>（勝者の記録）、<Code>/api/rooms/:code/images/:id</Code>（お絵描きの画像。id は推測できない乱数）の4つです。
              </>,
            ]}
          />
        </Section>

        <Section id="join">
          <Diagram code={CREATE_JOIN} title="シーケンス図：ルームを作る・参加する" testId="tech-diagram-join" />
          <Points
            items={[
              <>ルームコードは6文字。読み間違えやすい 0・O・1・I・L は使いません。</>,
              <>
                作った人は、保存した session で <Code>room:rejoin</Code> してルームの画面に入ります（ページを読み込み直したときと同じ道）。
                参加した人も、2回目からは同じように <Code>room:rejoin</Code> で戻ります。
              </>,
              <>
                ack（返事）は <Code>{'{ ok: true, … }'}</Code> か <Code>{'{ ok: false, error }'}</Code> のどちらか。
                error はそのまま画面に出すので、サーバーが平易な日本語で書きます。
              </>,
              <>懇親会は名前を打つかわりに、名簿から自分を選んで入ります（同じ人の二重登録・打ち間違いを防ぐ）。</>,
            ]}
          />
        </Section>

        <Section id="action">
          <Diagram code={ACTION_FLOW} title="シーケンス図：ゲームの操作が全員に届くまで" testId="tech-diagram-action" />
          <Points
            items={[
              <>
                操作はどのゲームも <Code>game:action</Code> の1種類です（中身は <Code>{'{ type, … }'}</Code>）。
                ゲームは中身を <Code>String()</Code>・<Code>Number()</Code> で確かめてから使い、だめなら <Code>UserError</Code> を投げます。
              </>,
              <>
                ゲームは状態を変えたら <Code>ctx.update()</Code> を呼ぶだけです。Room が同じ tick の呼び出しを1回にまとめ、
                つながっている人それぞれに <Code>getView(playerId)</Code> の結果を送ります。
              </>,
              <>
                送るのは差分ではなく、その人の画面に要るもの全部です。取りこぼしても、次の1回で画面が正しい形に戻ります。
              </>,
            ]}
          />
          <Table
            head={['スマホ → サーバー', '中身']}
            mono={[0]}
            rows={[
              ['room:check / room:create / room:join / room:rejoin', 'ルームを調べる・作る・参加・再接続'],
              ['room:settings / room:changeGame / room:start', 'ホストの設定・ゲームの変更・開始'],
              ['room:kick / room:close / room:leave / room:rename', 'キック・ルームの削除・退出・名前の変更'],
              ['room:restart / room:backToLobby', 'もう一回・ロビーへ'],
              ['room:claimHost', '司会用URLの合言葉を示す（懇親会）'],
              ['game:action', 'ゲームの中の操作（回答・投票・タップなど）'],
            ]}
          />
          <Table
            head={['サーバー → スマホ', '中身']}
            mono={[0]}
            rows={[
              ['room:state', 'その人用のルームのビュー（参加者・設定・ゲームの状態・締切・serverNow）'],
              ['room:closed / room:kicked', 'ルームの削除・キック'],
              ['session:replaced', '同じ人が別のタブで開いたので、この画面は止める'],
            ]}
          />
        </Section>

        <Section id="reconnect">
          <Diagram code={RECONNECT} title="シーケンス図：切断と再接続" testId="tech-diagram-reconnect" />
          <Points
            items={[
              <>スマホは画面を消すと回線が切れるのが当たり前なので、切れてもすぐにはルームから外しません。</>,
              <>
                返事が来なかっただけ（タイムアウト）のときは、参加情報を消さずにつなぎ直します。
                消すのは、サーバーがはっきり断ったときだけです（消すと別の人として入り直しになり、懇親会ではビンゴのカードやチームを失う）。
              </>,
              <>画面を点けたときに一度ルームをたずね、返事が無ければつなぎ直します（回線が固まって、つながっているように見えるだけのことがあるため）。</>,
            ]}
          />
        </Section>

        <Section id="timer">
          <Diagram code={TIMER} title="シーケンス図：締切の時刻を配って、端末で数える" testId="tech-diagram-timer" />
          <Points
            items={[
              <>
                サーバーは「残り何秒」ではなく、<b>締切の時刻（サーバーの時計）</b>を配ります。端末は毎回届く <Code>serverNow</Code> との差で、
                自分の時計のずれを直して数えます。
              </>,
              <>
                ゲームの画面は <Code>serverNow − 受け取った時刻</Code> をずれとして使うので、片道の遅れのぶん、端末の残り時間は少しだけ長めに出ます。
                そのぶんは、締切の直前の自動送信と、サーバー側の猶予（ゲームと段によって 0.5〜2.5 秒）で受け止めます。
              </>,
              <>試験ではゲームの中の時間を短くして流します（Vitest は 1/50、E2E は 0.5 倍）。時間はすべて <Code>ctx.scale()</Code> を通します。</>,
            ]}
          />
          <LiveClock />
        </Section>

        <Section id="phases">
          <Diagram code={BASE_STATES} title="状態遷移図：全ゲーム共通（BaseGame）" testId="tech-diagram-phases" />
          <Points
            items={[
              <>
                段（フェーズ）は <Code>setPhase(名前, {'{ duration, grace, onEnd }'})</Code> で決めます。時間切れ・全員完了・ホストの「次へ」は、
                どれも同じ <Code>advance()</Code> を通るので、2回進むことがありません。
              </>,
              <>途中で抜けた人は完了の判定から外します。2人を下回ったら、理由を付けてゲームを終えます（この結果は勝者の記録に残しません）。</>,
              <>最後まで終わったゲームは、1つにつき1回だけ勝者の記録に残します（懇親会とデモは残さない）。</>,
            ]}
          />
        </Section>

        <Section id="ad-dodge">
          <p className="text-base">
            「広告をすり抜けろ！」は、たちの悪い広告（小さすぎる ✕、押せる場所が見た目とずれた ✕、本物そっくりの「次へ」など）をかわして、
            ページを先に進んだ順を競うゲームです。卓の全員が同時に走ります。
            <b>押した所が当たりかどうかは、スマホではなくサーバーが決めます。</b>
          </p>
          <HitZoneFigure />
          <Diagram code={AD_DODGE_HIT} title="シーケンス図：タップから判定まで" testId="tech-diagram-ad-hit" />
          <Table
            head={['しくみ', '中身']}
            rows={[
              ['同じページ', 'ラウンドごとにサーバーが種（seed）からページの並びを作り、全員に同じものを出します。ページ = 罠1つで、段（step）が1つ以上あります'],
              ['見た目と判定を分ける', '段ごとに「見た目」（スマホに配る）と「当たり判定」（サーバーだけが持つ）を持ちます。判定は 出口（exit）・次の段へ進むだけ（step）・罠（trap）の3種類'],
              ['配らないもの', '本物の出口がどこか、どれが罠か。スマホの通信の中身を覗いても、答えは入っていません'],
              ['送るもの', 'タップの位置だけ。画面の大きさに関係なく 360×560 の座標に直して、段の始まりからの経過 t と一緒に送ります'],
              ['時間で動く罠', '割り込みの広告でボタンがずれる・数えたあとにスキップが出る、など。見た目と判定の両方に「t で出る・消える・ずれる」を持たせ、押したときの t で判定します。時間はルームの時間の倍率に合わせて縮みます'],
              ['t の扱い', '電波の遅れで遅く届いたぶんは戻せるように、t は「経過 − 1.5秒」から「経過」の間に収めます（先の時刻は名乗れない）'],
              ['罰', '罠を押すと、にせの広告のページが3秒開きます。時間のあとに出る「← 戻る」で元の段へ。大きな「今すぐ受け取る」を押すと、もう3秒'],
              ['二度押し・連打', 'page・step が今と違うタップは黙って捨てます。1人1秒に8回を超えたタップは数えません（でたらめに押して当てるのを防ぐ。ソケット全体の制限は5秒に60回）'],
              ['点数', 'ラウンドごとにゴールした順で 1位 +5・2位 +3・3位 +2・ほかのゴール +1。最後の合計の1位が勝者の記録に残ります'],
            ]}
          />
          <div>
            <p className="mb-2 font-display text-xl">罠の種類（11）</p>
            <p className="mb-3 text-sm text-muted">
              ラウンドごとに、ページの数だけ罠を選び、やさしい順（段階 1 → 3）に並べます。どの罠も、見た目と当たり判定を同じ所で作ります（
              <Code>server/games/ad-dodge/stages.ts</Code>）。
            </p>
            <Table
              head={['罠', '段階', '作り']}
              rows={[
                ['極小の✕', '1', '広告の角に小さく薄い✕。広告の面は罠'],
                ['偽の✕', '1', '枠の中の✕や「閉じる」は絵（罠）。本物は枠の外の小さな✕'],
                ['大きな「次へ」は広告', '1', '派手なボタンが罠。本物は記事の中の文字のリンク'],
                ['偽のスキップ', '2', '最初から出ている「スキップ」は罠。数え終わってから出るのが本物（時間で出る判定）'],
                ['クッキーの同意', '2', '「すべて同意」は罠。小さな「設定を管理する」から、断る道を2段でたどる'],
                ['断りにくいボタン', '2', '言い方の悪い小さな文字のほうが本物'],
                ['偽のウイルス警告', '2', '警告のボタンはどれも罠。下の記事のリンクが本物'],
                ['割り込み広告', '3', '少したつと広告が割り込み、ボタンがずれる（判定も同じ時刻にずれる）'],
                ['逃げる✕', '3', '✕を押すと次の段へ（罰なし）。3回目で閉じる'],
                ['閉じても閉じても', '3', '閉じると次の広告。段ごとに✕が小さくなる'],
                ['判定ずれ', '3', '見えている広告と押せる場所がずれている。薄い点線の枠の✕が本物'],
              ]}
            />
          </div>
          <Diagram code={AD_DODGE_STATES} title="状態遷移図：広告をすり抜けろ！" testId="tech-diagram-ad-states" />
          <Table
            head={['ファイル', '中身']}
            mono={[0]}
            rows={[
              ['server/games/ad-dodge/stages.ts', 'ページ（罠）の作り方と、当たり判定'],
              ['server/games/ad-dodge/AdDodgeGame.ts', 'ゲームの進行・罰・点数・人ごとのビュー'],
              ['server/data/ad-dodge.json', '広告の文句・見出し（JSON を足すだけで増やせる）'],
              ['shared/games/views.ts', 'AdDodgeView（スマホに送るビューの型）'],
              ['client/games/ad-dodge/', '画面（見た目を描き、タップを 360×560 に直して送る）'],
              ['client/themes/ad-dodge.css', 'デザイン（Windows 95 風）'],
            ]}
          />
        </Section>

        <Section id="storage">
          <Table
            head={['もの', '置き場', 'くわしく']}
            rows={[
              ['遊びのゲームのルーム', 'メモリだけ', '再起動で消える。誰もつながっていないまま30分、または最後の動きから12時間で片付け。切断して3分たった人は外れる'],
              [
                '懇親会のルーム（開始前も）',
                <Code key="r">rooms.json</Code>,
                '変わったら1秒まとめて書く。別名に書いてから差し替えるので、途中で落ちても壊れない。version: 1 以外は読まない。止めるときにも書き出す。最後の動きから7日で片付け（常設のルームは消さない）',
              ],
              ['勝者の記録', <Code key="w">results.json</Code>, '最後まで終わったゲームを1件ずつ。500件まで。version: 1 以外は読まない'],
              ['お絵描きの画像', 'メモリ', 'ルームごとに200枚まで。id は推測できない乱数'],
              ['懇親会の名簿・問題・常設のルーム', '設定の置き場（リポジトリには置かない）', '起動のときに Zod で確かめ、形が違えば起動を失敗させる（黙ってサンプルに落とさない）'],
              ['参加情報（playerId・token）', '端末の localStorage', 'ルームコードごと。読み込み直し・再接続で同じ人に戻るために使う'],
            ]}
          />
          <p className="text-sm text-muted">
            置き場の場所は環境変数（<Code>PARTYBOX_STATE_DIR</Code>・<Code>PARTYBOX_EVENT_DATA_DIR</Code>）で変えられます。
            Docker で動かすときは、この場所をコンテナの外と共有しないと、作り直しで消えます。
          </p>
        </Section>

        <Section id="quality">
          <Table
            head={['もの', '何を確かめるか', 'どう動かすか']}
            rows={[
              ['Vitest（tests/）', 'ルーム・全部のゲームの通し・懇親会の決まり・ページ配信・勝者の記録', '本物のサーバーを空いたポートで立て、Socket.IO のクライアントを何本もつないで遊ぶ。時間は 1/50、ディスクには書かない'],
              ['Playwright（e2e/）', '実際の画面での通しプレイ', 'ビルドしてサーバーを立て、PC のホストとスマホの参加者を別々のブラウザで動かす。時間は 0.5 倍、保存先は使い捨ての場所'],
              ['型チェック', 'TypeScript の strict（使っていない変数・引数もエラー）', <Code key="t">npm run typecheck</Code>],
              ['CI（GitHub Actions）', 'プルリクエストと main への push ごとに、型チェック・Vitest・ビルド', 'E2E は CI では流さない（手元で流す）'],
            ]}
          />
          <Points
            items={[
              <>
                組み立ては2段です。画面は Vite（<Code>index.html</Code> と <Code>grand-prix/index.html</Code> の2ページ）、サーバーは esbuild で1つの JS に。
              </>,
              <>Docker のイメージは2段で作ります（組み立て用の段でビルドし、動かす段には出来上がりと本番に要る部品だけを入れる）。</>,
              <>本番は1台のサーバーで、前に置いたリバースプロキシが HTTPS を受け、コンテナの PartyBox に渡します。反映は main を取り込んで作り直すだけです。</>,
              <>反映の間はつながらなくなるので、懇親会の最中には反映しません。</>,
            ]}
          />
        </Section>

        <Section id="code">
          <pre className="overflow-x-auto border border-line bg-panel p-4 text-xs leading-relaxed">{`shared/                 画面とサーバーで共通
  games.ts              ゲームのカタログ（名前・人数・設定）。一覧はここから自動で作る
  protocol.ts           Socket.IO のイベントとビューの型
  games/views.ts        各ゲームのビューの型
server/
  app.ts / index.ts     HTTP・Socket.IO・起動
  rooms/                RoomManager・Room・保存（persist.ts）
  games/BaseGame.ts     全ゲーム共通の段・タイマー・点数・退出
  games/<ゲーム>/        各ゲームの判定
  data/*.json           お題・事件・広告の文句（JSON を足すだけで増やせる）
  event/                懇親会の設定の読み込み（Zod）。sample/ は同梱のサンプル
  results.ts            勝者の記録
client/
  pages/                トップ・ルームの作成と参加・ロビー・勝者の記録・このページ
  games/<ゲーム>/        各ゲームの画面
  components/ lib/      部品・ソケット・再接続・時計
  themes/               デザイン（1テーマ = CSS 1ファイル。<html data-theme> で切り替え）
grand-prix/             プロンプト・グランプリ（Three.js の別ページ）
tests/  e2e/            Vitest と Playwright`}</pre>
          <Table
            head={['ゲームを足すときに触る所', 'すること']}
            mono={[0]}
            rows={[
              ['shared/games.ts', 'GameId に足し、GAMES にメタ情報（名前・人数・設定）を1件足す'],
              ['shared/games/views.ts', 'ビューの型を足し、AnyGameView に入れる'],
              ['server/games/<id>/', 'BaseGame を継承したクラスを作る（beginGame・onAction・getView）'],
              ['server/games/registry.ts', '1行足す'],
              ['server/results.ts', '1位を決めるゲームなら、順位の付くゲームに足す'],
              ['client/games/<id>/ と registry.tsx', '画面を作り、1行足す'],
              ['client/guides.tsx', 'くわしい遊び方を書く'],
              ['client/themes/', 'まだ使っていないスタイルでテーマを1つ作り、index.css・themes/index.ts に足す（docs/design.md）'],
              ['client/components/Icon.tsx', 'ゲームの印（SVG）を1つ足す'],
              ['tests/・e2e/', '通しの試験を足す'],
            ]}
          />
        </Section>

        <Section id="catalog">
          <p className="text-sm text-muted">
            <Code>shared/games.ts</Code> から、このページを開いたときに作っている一覧です。ゲームを足すと、ここにも出ます。
          </p>
          <Catalog />
        </Section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t-4 border-line px-4 py-6 text-sm text-muted sm:px-6">
        <Logo />
        <Link to="/" className="inline-flex min-h-11 items-center gap-1 font-bold underline underline-offset-4 hover:text-accent-ink">
          <Icon name="undo" /> トップへ戻る
        </Link>
        <p>このページは開発中です。</p>
      </footer>
    </div>
  );
}
