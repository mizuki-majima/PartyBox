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
  { id: 'overview', label: '01', title: '概要' },
  { id: 'architecture', label: '02', title: 'システム構成' },
  { id: 'join', label: '03', title: 'ルームの作成と参加' },
  { id: 'action', label: '04', title: '操作が全員に届くまで' },
  { id: 'reconnect', label: '05', title: '切断と再接続' },
  { id: 'timer', label: '06', title: 'タイマーの同期' },
  { id: 'phases', label: '07', title: 'ゲームの進行（フェーズ）' },
  { id: 'ad-dodge', label: '08', title: '広告をすり抜けろ！の当たり判定' },
  { id: 'storage', label: '09', title: 'データの保存' },
  { id: 'quality', label: '10', title: 'テスト・CI・デプロイ' },
  { id: 'code', label: '11', title: 'コードの構成とゲームの追加' },
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
            PartyBox は、スマホのブラウザに集まって遊ぶゲーム集です。このページでは、その作りを説明します。
            システム構成、通信の流れ（シーケンス図）、フェーズの遷移（状態遷移図）、データの保存、テストについて、実際のコードに沿って書いています。
          </p>
          <p className="mt-3 max-w-3xl text-sm text-muted">
            このページは作成中です。説明とコードが食い違っている場合は、コードが正です。
            各図の下の「Mermaid のソース」を開くと、図の元になったテキストを確認できます。
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
                <b>1台のサーバー上の1つの Node.js プロセス</b>が、画面ファイルの配信と、すべてのルームのリアルタイム通信を担当します。
              </>,
              <>
                <b>判定はすべてサーバーで行います</b>（サーバー権威）。スマホは「押した」「入力した」という操作だけを送り、
                点数・勝敗・進行はサーバーが決めます。
              </>,
              <>
                サーバーは状態が変わるたびに、<b>プレイヤーごとに内容を変えた画面データ（ビュー）</b>を送ります。
                ほかの人の回答や嘘つきの正体などの秘密は、見てよい人のビューにしか入りません。
              </>,
              <>会員登録もログインもありません。ルームコードと、端末に保存したトークン（token）で本人を識別します。</>,
            ]}
          />
          <Table
            head={['領域', '技術', 'バージョン（package.json）']}
            mono={[2]}
            rows={[
              ['フロントエンド', 'React・TypeScript・React Router・Tailwind CSS', `react ${ver('react')} / react-router ${ver('react-router')} / tailwindcss ${ver('tailwindcss')}`],
              ['フロントエンドのビルド', 'Vite（2ページをまとめてビルド）', `vite ${ver('vite')}`],
              ['バックエンド', 'Node.js 22・Express・Socket.IO', `express ${ver('express')} / socket.io ${ver('socket.io')}`],
              ['入力の検証', 'Zod（懇親会の名簿・問題ファイル）', `zod ${ver('zod')}`],
              ['3D', 'Three.js（プロンプト・グランプリのみ）', `three ${ver('three')}`],
              ['バックエンドのビルド', 'esbuild（1つの JS ファイルにバンドル）', `esbuild ${ver('esbuild')}`],
              ['テスト', 'Vitest・Playwright', `vitest ${ver('vitest')} / @playwright/test ${ver('@playwright/test')}`],
              ['このページの図', 'Mermaid（このページを開いたときだけ読み込む）', `mermaid ${ver('mermaid')}`],
              ['フォント', '@fontsource のフォントを同梱して自前で配信（外部のサーバーからは読み込まない）', '—'],
            ]}
          />
        </Section>

        <Section id="architecture">
          <Diagram
            code={ARCHITECTURE}
            title="システム構成図"
            caption="太い線は WebSocket（Socket.IO）、細い線は通常の HTTPS です。"
            testId="tech-diagram-architecture"
          />
          <Points
            items={[
              <>
                ルームの状態は<b>プロセスのメモリ上</b>にあります。そのためサーバーは1台で動かします（台数を増やすと、同じルームの参加者が別々のサーバーにつながってしまうため）。
              </>,
              <>
                デプロイ（再起動）すると、通常のゲームのルームは消えます。懇親会のルームと勝者の記録だけはファイルに保存し、起動時に読み戻します（09 を参照）。
              </>,
              <>
                Socket.IO は WebSocket で接続し、使えない環境ではポーリングに切り替えます。接続の死活確認（ping）は20秒ごとです。
                お絵描きの画像を送るため、1回に送れるデータは 1MB までにしています。
              </>,
              <>
                すべての URL を1つのサーバーから配信します。<Code>/</Code>・<Code>/room/…</Code> などは React の SPA（<Code>index.html</Code>）、
                <Code>/grand-prix/</Code> は Three.js を使う別ページです。Three.js は別のファイルに分けてあり、SPA では読み込みません。
              </>,
              <>
                HTTP の API は <Code>/api/health</Code>（死活確認）、<Code>/api/event</Code>（常設の懇親会ルームがあるかどうかだけを返す。コードは返さない）、
                <Code>/api/results</Code>（勝者の記録）、<Code>/api/rooms/:code/images/:id</Code>（お絵描きの画像。id は推測できない乱数）の4つです。
              </>,
            ]}
          />
        </Section>

        <Section id="join">
          <Diagram code={CREATE_JOIN} title="シーケンス図：ルームの作成と参加" testId="tech-diagram-join" />
          <Points
            items={[
              <>ルームコードは6文字です。読み間違えやすい 0・O・1・I・L は使いません。</>,
              <>
                ルームを作った人は、保存したセッションで <Code>room:rejoin</Code> を送ってルーム画面に入ります（ページを再読み込みしたときと同じ流れです）。
                参加した人も、2回目以降は同じく <Code>room:rejoin</Code> で戻ります。
              </>,
              <>
                ack（応答）は <Code>{'{ ok: true, … }'}</Code> か <Code>{'{ ok: false, error }'}</Code> のどちらかです。
                error はそのまま画面に表示するので、サーバー側で平易な日本語の文にしています。
              </>,
              <>懇親会では、名前を入力する代わりに名簿から自分を選んで参加します（二重登録や入力ミスを防ぐため）。</>,
            ]}
          />
        </Section>

        <Section id="action">
          <Diagram code={ACTION_FLOW} title="シーケンス図：ゲームの操作が全員に届くまで" testId="tech-diagram-action" />
          <Points
            items={[
              <>
                操作は、どのゲームも <Code>game:action</Code> の1種類です（中身は <Code>{'{ type, … }'}</Code>）。
                ゲーム側は中身を <Code>String()</Code>・<Code>Number()</Code> で検証してから使い、不正なら <Code>UserError</Code> を投げます。
              </>,
              <>
                ゲームは状態を変えたら <Code>ctx.update()</Code> を呼ぶだけです。Room が同じ tick 内の呼び出しを1回にまとめ、
                接続中の各プレイヤーに <Code>getView(playerId)</Code> の結果を送ります。
              </>,
              <>
                送るのは差分ではなく、その人の画面に必要なデータすべてです。途中で1回取りこぼしても、次の送信で画面が正しい状態に戻ります。
              </>,
            ]}
          />
          <Table
            head={['スマホ → サーバー', '内容']}
            mono={[0]}
            rows={[
              ['room:check / room:create / room:join / room:rejoin', 'ルームの確認・作成・参加・再接続'],
              ['room:settings / room:changeGame / room:start', 'ホストによる設定変更・ゲームの変更・開始'],
              ['room:kick / room:close / room:leave / room:rename', 'キック・ルームの削除・退出・名前の変更'],
              ['room:restart / room:backToLobby', 'もう一回・ロビーに戻る'],
              ['room:claimHost', '司会用URLのトークンを示して司会になる（懇親会）'],
              ['game:action', 'ゲーム内の操作（回答・投票・タップなど）'],
            ]}
          />
          <Table
            head={['サーバー → スマホ', '内容']}
            mono={[0]}
            rows={[
              ['room:state', 'その人用のルームのビュー（参加者・設定・ゲームの状態・締切・serverNow）'],
              ['room:closed / room:kicked', 'ルームの削除・キックの通知'],
              ['session:replaced', '同じ人が別のタブで開いたため、この画面を止める'],
            ]}
          />
        </Section>

        <Section id="reconnect">
          <Diagram code={RECONNECT} title="シーケンス図：切断と再接続" testId="tech-diagram-reconnect" />
          <Points
            items={[
              <>スマホは画面を消すと接続が切れるのが普通なので、切断してもすぐにはルームから外しません。</>,
              <>
                応答が来なかっただけ（タイムアウト）のときは、参加情報を消さずに再接続します。
                消すのは、サーバーが明確に拒否したときだけです（消すと別人として参加し直すことになり、懇親会ではビンゴのカードやチームを失うため）。
              </>,
              <>画面が再表示されたときに一度ルームの状態を問い合わせ、応答がなければ接続し直します（回線が固まって、つながっているように見えるだけのことがあるため）。</>,
            ]}
          />
        </Section>

        <Section id="timer">
          <Diagram code={TIMER} title="シーケンス図：締切の時刻を配り、端末側で数える" testId="tech-diagram-timer" />
          <Points
            items={[
              <>
                サーバーは「残り何秒」ではなく、<b>締切の時刻（サーバーの時計）</b>を配ります。端末は毎回届く <Code>serverNow</Code> との差から
                自分の時計のずれを求め、補正して残り時間を数えます。
              </>,
              <>
                ゲーム画面は <Code>serverNow − 受信した時刻</Code> をずれとして使うため、片道の遅延の分だけ、端末の残り時間は少し長めに表示されます。
                この差は、締切直前の自動送信と、サーバー側の猶予（ゲームとフェーズによって 0.5〜2.5 秒）で吸収します。
              </>,
              <>テストではゲーム内の時間を短縮して実行します（Vitest は 1/50、E2E は 0.5 倍）。時間はすべて <Code>ctx.scale()</Code> を通します。</>,
            ]}
          />
          <LiveClock />
        </Section>

        <Section id="phases">
          <Diagram code={BASE_STATES} title="状態遷移図：全ゲーム共通（BaseGame）" testId="tech-diagram-phases" />
          <Points
            items={[
              <>
                フェーズは <Code>setPhase(名前, {'{ duration, grace, onEnd }'})</Code> で定義します。時間切れ・全員完了・ホストの「次へ」は
                どれも同じ <Code>advance()</Code> を通るので、二重に進むことはありません。
              </>,
              <>途中で抜けた人は完了の判定から外します。人数が2人を下回ったら、理由を付けてゲームを終了します（この結果は勝者の記録に残しません）。</>,
              <>最後まで終わったゲームは、1回につき1件だけ勝者の記録に残します（懇親会とデモは残しません）。</>,
            ]}
          />
        </Section>

        <Section id="ad-dodge">
          <p className="text-base">
            「広告をすり抜けろ！」は、悪質な広告（小さすぎる ✕、見た目と押せる場所がずれた ✕、本物そっくりの「次へ」など）をかわして、
            誰が早く最後のページに着くかを競うゲームです。卓の全員が同時にスタートします。
            <b>押した場所が当たりかどうかは、スマホではなくサーバーが判定します。</b>
          </p>
          <HitZoneFigure />
          <Diagram code={AD_DODGE_HIT} title="シーケンス図：タップから判定まで" testId="tech-diagram-ad-hit" />
          <Table
            head={['仕組み', '内容']}
            rows={[
              ['全員に同じページ', 'ラウンドごとにサーバーが乱数の種（seed）からページの並びを作り、全員に同じものを出します。1ページに罠が1つあり、ページは1つ以上の段（step）でできています'],
              ['見た目と判定の分離', '段ごとに「見た目」（スマホに配る）と「当たり判定」（サーバーだけが持つ）を持ちます。判定は 出口（exit）・次の段へ進むだけ（step）・罠（trap）の3種類です'],
              ['配らない情報', '本物の出口がどこか、どれが罠か。スマホの通信内容をのぞいても、答えは入っていません'],
              ['送る情報', 'タップした位置だけです。画面の大きさに関係なく 360×560 の論理座標に変換し、段の開始からの経過時間 t と一緒に送ります'],
              ['押せる範囲', '本物の判定は見た目より少し広く、縦横とも 44 以上（論理座標。iPhone の Safari で約 32px）にしています。見た目の小さい ✕ も、狙えば押せます。罠の判定は広げません（判定ずれの罠だけは、すぐそばの絵の ✕ に届かないよう小さめ）'],
              ['時間で動く罠', '割り込み広告でボタンがずれる、カウントのあとにスキップが出る、など。見た目と判定の両方に「t で出る・消える・ずれる」を持たせ、タップしたときの t で判定します。時間はルームの時間倍率に合わせて縮みます'],
              ['t の扱い', '電波の遅延で遅れて届いた分を補えるよう、t は「経過 − 1.5秒」から「経過」の範囲に収めます（未来の時刻は申告できません）'],
              ['ペナルティ', '罠を押すと、偽の広告ページが3秒開きます。3秒後に出る「← 戻る」で元の段に戻ります。大きな「今すぐ受け取る」を押すと、さらに3秒'],
              ['二度押し・連打', 'page・step が現在と違うタップは黙って捨てます。1人あたり1秒に8回を超えたタップは数えません（でたらめな連打で当てるのを防ぐため。ソケット全体の上限は5秒に60回）'],
              ['点数', 'ラウンドごとに、ゴールした順に 1位 +5・2位 +3・3位 +2・それ以外のゴール +1。最終的な合計の1位が勝者の記録に残ります'],
            ]}
          />
          <div>
            <p className="mb-2 font-display text-xl">罠の種類（11種類）</p>
            <p className="mb-3 text-sm text-muted">
              ラウンドごとにページ数の分だけ罠を選び、やさしい順（段階 1 → 3）に並べます。どの罠も、見た目と当たり判定を同じ場所（
              <Code>server/games/ad-dodge/stages.ts</Code>）で作っています。
            </p>
            <Table
              head={['罠', '段階', '仕組み']}
              rows={[
                ['極小の✕', '1', '広告の角に小さく薄い ✕。広告の面は罠'],
                ['偽の✕', '1', '枠の中の ✕ や「閉じる」は絵（罠）。本物は枠の外にある小さな ✕'],
                ['大きな「次へ」は広告', '1', '派手なボタンは罠。本物は記事中の文字リンク'],
                ['偽のスキップ', '2', '最初から出ている「スキップ」は罠。カウントが終わってから出るのが本物（時間で現れる判定）'],
                ['クッキーの同意', '2', '「すべて同意」は罠。小さな「設定を管理する」から、2段階で拒否までたどる'],
                ['断りにくいボタン', '2', '「損をしたいです」のような言い回しの小さな文字が本物'],
                ['偽のウイルス警告', '2', '警告のボタンはどれも罠。下にある記事のリンクが本物'],
                ['割り込み広告', '3', '少したつと広告が割り込み、ボタンがずれる（判定も同じ時刻にずれる）'],
                ['逃げる✕', '3', '✕ を押すと次の段へ（ペナルティなし）。3回目で閉じる'],
                ['閉じても閉じても', '3', '閉じると次の広告が出る。段ごとに ✕ が小さくなる'],
                ['判定ずれ', '3', '見えている広告と押せる場所がずれている。薄い点線の枠の ✕ が本物'],
              ]}
            />
          </div>
          <Diagram code={AD_DODGE_STATES} title="状態遷移図：広告をすり抜けろ！" testId="tech-diagram-ad-states" />
          <Table
            head={['ファイル', '内容']}
            mono={[0]}
            rows={[
              ['server/games/ad-dodge/stages.ts', 'ページ（罠）の生成と当たり判定'],
              ['server/games/ad-dodge/AdDodgeGame.ts', 'ゲームの進行・ペナルティ・点数・プレイヤーごとのビュー'],
              ['server/data/ad-dodge.json', '広告の文言・記事の見出し（JSON に足すだけで増やせる）'],
              ['shared/games/views.ts', 'AdDodgeView（スマホに送るビューの型）'],
              ['client/games/ad-dodge/', '画面（見た目を描き、タップ位置を 360×560 に変換して送る）'],
              ['client/themes/ad-dodge.css', 'デザイン（Windows 95 風）'],
            ]}
          />
        </Section>

        <Section id="storage">
          <Table
            head={['データ', '保存先', '詳細']}
            rows={[
              ['通常のゲームのルーム', 'メモリのみ', '再起動で消える。誰も接続していない状態が30分続くか、最後の操作から12時間たつと削除。切断から3分たった人は外れる'],
              [
                '懇親会のルーム（開始前も含む）',
                <Code key="r">rooms.json</Code>,
                '変更は1秒ごとにまとめて書き込む。一時ファイルに書いてから置き換えるので、途中で落ちても壊れない。version: 1 以外は読まない。停止時にも書き出す。最後の操作から7日で削除（常設のルームは消さない）',
              ],
              ['勝者の記録', <Code key="w">results.json</Code>, '最後まで終わったゲームを1件ずつ記録。500件まで。version: 1 以外は読まない'],
              ['お絵描きの画像', 'メモリ', 'ルームごとに200枚まで。id は推測できない乱数'],
              ['懇親会の名簿・問題・常設のルーム', '設定ディレクトリ（リポジトリには置かない）', '起動時に Zod で検証し、形式が違えば起動を失敗させる（黙ってサンプルに切り替えない）'],
              ['参加情報（playerId・token）', '端末の localStorage', 'ルームコードごとに保存。再読み込みや再接続のときに、同じ人として戻るために使う'],
            ]}
          />
          <p className="text-sm text-muted">
            保存先は環境変数（<Code>PARTYBOX_STATE_DIR</Code>・<Code>PARTYBOX_EVENT_DATA_DIR</Code>）で変えられます。
            Docker で動かす場合は、この場所をボリュームとしてコンテナの外に置かないと、コンテナを作り直したときに消えます。
          </p>
        </Section>

        <Section id="quality">
          <Table
            head={['種類', '確かめること', '動かし方']}
            rows={[
              ['Vitest（tests/）', 'ルーム・全ゲームの通しプレイ・懇親会のルール・ページ配信・勝者の記録', '実際のサーバーを空きポートで起動し、Socket.IO のクライアントを複数つないで遊ぶ。時間は 1/50、ディスクには書かない'],
              ['Playwright（e2e/）', '実際の画面での通しプレイ', 'ビルドしてサーバーを起動し、PC のホストとスマホの参加者を別々のブラウザで動かす。時間は 0.5 倍、保存先は使い捨て'],
              ['型チェック', 'TypeScript の strict（未使用の変数・引数もエラー）', <Code key="t">npm run typecheck</Code>],
              ['CI（GitHub Actions）', 'プルリクエストと main への push のたびに、型チェック・Vitest・ビルド', 'E2E は CI では実行しない（手元で実行する）'],
            ]}
          />
          <Points
            items={[
              <>
                ビルドは2つに分かれています。画面は Vite（<Code>index.html</Code> と <Code>grand-prix/index.html</Code> の2ページ）、サーバーは esbuild で1つの JS ファイルにまとめます。
              </>,
              <>Docker イメージはマルチステージビルドで作ります（ビルド用のステージでビルドし、実行用のステージには成果物と本番に必要な依存パッケージだけを入れます）。</>,
              <>本番はサーバー1台です。前段のリバースプロキシが HTTPS を受け、コンテナの PartyBox に渡します。デプロイは main を取り込んでコンテナを作り直すだけです。</>,
              <>デプロイ中は接続できなくなるので、懇親会の最中にはデプロイしません。</>,
            ]}
          />
        </Section>

        <Section id="code">
          <pre className="overflow-x-auto border border-line bg-panel p-4 text-xs leading-relaxed">{`shared/                 画面とサーバーで共有するコード
  games.ts              ゲームのカタログ（名前・人数・設定）。一覧はここから自動で生成
  protocol.ts           Socket.IO のイベントとビューの型
  games/views.ts        各ゲームのビューの型
server/
  app.ts / index.ts     HTTP・Socket.IO の設定と起動
  rooms/                RoomManager・Room・保存（persist.ts）
  games/BaseGame.ts     全ゲーム共通のフェーズ・タイマー・点数・退出の処理
  games/<ゲーム>/        各ゲームのロジック（判定・点数）
  data/*.json           お題・事件・広告の文言（JSON に足すだけで増やせる）
  event/                懇親会の設定の読み込み（Zod）。sample/ は同梱のサンプル
  results.ts            勝者の記録
client/
  pages/                トップ・ルームの作成と参加・ロビー・勝者の記録・このページ
  games/<ゲーム>/        各ゲームの画面
  components/ lib/      共通部品・ソケット通信・再接続・時計の補正
  themes/               デザイン（1テーマ = CSS 1ファイル。<html data-theme> で切り替え）
grand-prix/             プロンプト・グランプリ（Three.js の別ページ）
tests/  e2e/            Vitest と Playwright`}</pre>
          <Table
            head={['ゲームを追加するときに触るファイル', '作業']}
            mono={[0]}
            rows={[
              ['shared/games.ts', 'GameId に追加し、GAMES にメタ情報（名前・人数・設定）を1件追加'],
              ['shared/games/views.ts', 'ビューの型を追加し、AnyGameView に含める'],
              ['server/games/<id>/', 'BaseGame を継承したクラスを作る（beginGame・onAction・getView）'],
              ['server/games/registry.ts', '1行追加'],
              ['server/results.ts', '1位を決めるゲームなら、順位を付けるゲームの一覧に追加'],
              ['client/games/<id>/ と registry.tsx', '画面を作り、registry.tsx に1行追加'],
              ['client/guides.tsx', '詳しい遊び方を書く'],
              ['client/themes/', 'まだ使っていないスタイルでテーマを1つ作り、index.css と themes/index.ts に登録（docs/design.md を参照）'],
              ['client/components/Icon.tsx', 'ゲームのアイコン（SVG）を1つ追加'],
              ['tests/・e2e/', '通しプレイのテストを追加'],
            ]}
          />
        </Section>

        <Section id="catalog">
          <p className="text-sm text-muted">
            <Code>shared/games.ts</Code> から、このページを開いたときに生成している一覧です。ゲームを追加すると、ここにも自動で表示されます。
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
