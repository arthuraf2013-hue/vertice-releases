import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SessionProvider, useSession } from './session.jsx';
import { ToastProvider, Loading, EmptyState, Button, Logo } from './ui/kit.jsx';
import { Shell } from './ui/Shell.jsx';
import { api } from './data/api.js';
import { Login } from './pages/Login.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Screens } from './pages/Screens.jsx';
import { Monitoring } from './pages/Monitoring.jsx';
import { Media } from './pages/Media.jsx';
import { Playlists } from './pages/Playlists.jsx';
import { Schedules } from './pages/Schedules.jsx';
import { Company } from './pages/Company.jsx';
import { Downloads } from './pages/Downloads.jsx';
import { Captures } from './pages/Captures.jsx';
import { Apps } from './pages/Apps.jsx';
import { Price } from './pages/Price.jsx';
import { Reports } from './pages/Reports.jsx';
import { Advertisers } from './pages/Advertisers.jsx';
import { Studio } from './pages/Studio.jsx';
import { VideoWalls } from './pages/VideoWalls.jsx';

// HashRouter: funciona igual no Firebase Hosting e dentro do Electron, sem regra de rewrite.
export function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <HashRouter>
          <Gate />
        </HashRouter>
      </ToastProvider>
    </SessionProvider>
  );
}

function Gate() {
  const s = useSession();
  if (s.loading) return <div className="vx-boot"><Logo size={48} /><Loading /></div>;
  if (!s.user) return <Login />;
  if (!s.companyId || !s.company) {
    return (
      <div className="vx-boot">
        <EmptyState icon="building" title="Sua conta ainda não está ligada a uma empresa"
          action={<Button onClick={() => api.auth.signOut()} icon="logout">Sair</Button>}>
          Peça ao administrador da sua empresa um convite para o e-mail {s.user.email}.
        </EmptyState>
      </div>
    );
  }
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="telas" element={<Screens />} />
        <Route path="monitoramento" element={<Monitoring />} />
        <Route path="midias" element={<Media />} />
        <Route path="playlists" element={<Playlists />} />
        <Route path="programacao" element={<Schedules />} />
        <Route path="capturas" element={<Captures />} />
        <Route path="aplicativos" element={<Apps />} />
        <Route path="price" element={<Price />} />
        <Route path="relatorios" element={<Reports />} />
        <Route path="anunciantes" element={<Advertisers />} />
        <Route path="estudio" element={<Studio />} />
        <Route path="videowall" element={<VideoWalls />} />
        <Route path="empresa" element={<Company />} />
        <Route path="downloads" element={<Downloads />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
