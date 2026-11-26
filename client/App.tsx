import { lazy, Suspense, useEffect } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router';
import { Button, FullScreenMessage, Spinner } from './components/ui';
import { CreateRoomPage } from './pages/CreateRoomPage';
import { DemoPage } from './pages/DemoPage';
import { JoinPage } from './pages/JoinPage';
import { LandingPage } from './pages/LandingPage';
import { ResultsPage } from './pages/ResultsPage';
import { RoomPage } from './pages/RoomPage';

// 技術者向けのページは文章と図が多いので、開いたときだけ読み込む（遊ぶ人のスマホで最初に読むぶんを増やさない）
const TechPage = lazy(() => import('./pages/TechPage').then((m) => ({ default: m.TechPage })));

/**
 * プロンプト・グランプリは SPA の外のページ（/grand-prix/）。開発サーバーでは末尾のスラッシュが無いと
 * ここに来るので、ページを読み直して移動する（本番はサーバーが転送するので通常は来ない）。
 */
function GrandPrixRedirect() {
  const { pathname, search } = useLocation();
  const isPage = pathname === '/grand-prix/';
  useEffect(() => {
    if (!isPage) window.location.replace(`/grand-prix/${search}`);
  }, [isPage, search]);
  return isPage ? <NotFound /> : null;
}

function NotFound() {
  return (
    <FullScreenMessage icon="compass" title="ページが見つかりません">
      <Link to="/">
        <Button size="lg">トップへ戻る</Button>
      </Link>
    </FullScreenMessage>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  // ブレースは省略しないこと。省くと scrollTo の戻り値がそのまま返り、React 19 はそれを
  // クリーンアップ関数として次の遷移で呼ぶ。拡張機能が scrollTo を差し替えていると画面が落ちる。
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/play/:gameId" element={<CreateRoomPage />} />
        {/* 1人で試すデモ（懇親会など、司会が進行する催し物）。司会と参加者の画面を並べる */}
        <Route path="/demo/:gameId" element={<DemoPage />} />
        <Route path="/join" element={<JoinPage />} />
        {/* 勝者の記録（卓ごとに遊んだゲームの1位を、終わった順に） */}
        <Route path="/results" element={<ResultsPage />} />
        {/* 技術者向け: システム構成・シーケンス図（開発中） */}
        <Route
          path="/tech"
          element={
            <Suspense
              fallback={
                <div className="flex min-h-dvh items-center justify-center">
                  <Spinner className="h-8 w-8" />
                </div>
              }
            >
              <TechPage />
            </Suspense>
          }
        />
        <Route path="/room/:code" element={<RoomPage />} />
        {/* 司会用URL。合言葉を知っている人だけが進行できる（懇親会など） */}
        <Route path="/room/:code/h/:hostToken" element={<RoomPage />} />
        <Route path="/grand-prix/*" element={<GrandPrixRedirect />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
