import { useEffect } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router';
import { Button, FullScreenMessage } from './components/ui';
import { CreateRoomPage } from './pages/CreateRoomPage';
import { JoinPage } from './pages/JoinPage';
import { LandingPage } from './pages/LandingPage';
import { RoomPage } from './pages/RoomPage';

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
    <FullScreenMessage emoji="🧭" title="ページが見つかりません">
      <Link to="/">
        <Button size="lg">トップへ戻る</Button>
      </Link>
    </FullScreenMessage>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

export function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/play/:gameId" element={<CreateRoomPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/room/:code" element={<RoomPage />} />
        <Route path="/grand-prix/*" element={<GrandPrixRedirect />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
