import { useEffect } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router';
import { Button, FullScreenMessage } from './components/ui';
import { CreateRoomPage } from './pages/CreateRoomPage';
import { JoinPage } from './pages/JoinPage';
import { LandingPage } from './pages/LandingPage';
import { RoomPage } from './pages/RoomPage';

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
        <Route
          path="*"
          element={
            <FullScreenMessage emoji="🧭" title="ページが見つかりません">
              <Link to="/">
                <Button size="lg">トップへ戻る</Button>
              </Link>
            </FullScreenMessage>
          }
        />
      </Routes>
    </>
  );
}
