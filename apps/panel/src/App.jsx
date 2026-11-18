import { useState } from 'react';
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
import { Library } from './pages/Library.jsx';
import { Calculator } from './pages/Calculator.jsx';
import { Crm } from './pages/Crm.jsx';
import { Academy } from './pages/Academy.jsx';
import { Referral } from './pages/Referral.jsx';
import { Store } from './pages/Store.jsx';
import { Downloads } from './pages/Downloads.jsx';
import { Captures } from './pages/Captures.jsx';
import { Apps } from './pages/Apps.jsx';
import { Comments } from './pages/Comments.jsx';
import { Price } from './pages/Price.jsx';
import { Reports } from './pages/Reports.jsx';
import { Advertisers } from './pages/Advertisers.jsx';
import { Studio } from './pages/Studio.jsx';
import { VideoWalls } from './pages/VideoWalls.jsx';
import { Console } from './pages/Console.jsx';
import { Layouts } from './pages/Layouts.jsx';
import { Alert } from './pages/Alert.jsx';
import { QueueDesk } from './pages/QueueDesk.jsx';
import { TimerDesk } from './pages/TimerDesk.jsx';
import { ScreenMap } from './pages/ScreenMap.jsx';
import { IndoorMedia } from './pages/IndoorMedia.jsx';

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
    // Conta só da Vetta: abre direto no console.
    if (s.isVetta) {
      return (
        <Routes>
          <Route element={<Shell />}>
            <Route path="vetta" element={<Console />} />
            <Route path="*" element={<Navigate to="/vetta" replace />} />
          </Route>
        </Routes>
      );
    }
    return <NoCompany email={s.user.email} />;
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
        <Route path="comentarios" element={<Comments />} />
        <Route path="price" element={<Price />} />
        <Route path="relatorios" element={<Reports />} />
        <Route path="anunciantes" element={<Advertisers />} />
        <Route path="estudio" element={<Studio />} />
        <Route path="videowall" element={<VideoWalls />} />
        <Route path="layouts" element={<Layouts />} />
        <Route path="alerta" element={<Alert />} />
        <Route path="senhas" element={<QueueDesk />} />
        <Route path="cronometro" element={<TimerDesk />} />
        <Route path="mapa" element={<ScreenMap />} />
        <Route path="midia-indoor" element={<IndoorMedia />} />
        <Route path="empresa" element={<Company />} />
        <Route path="downloads" element={<Downloads />} />
        <Route path="biblioteca" element={<Library />} />
        <Route path="calculadora" element={<Calculator />} />
        <Route path="crm" element={<Crm />} />
        <Route path="academia" element={<Academy />} />
        <Route path="indique" element={<Referral />} />
        <Route path="loja" element={<Store />} />
        {s.isVetta && <Route path="vetta" element={<Console />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

/** Conta sem empresa: pode ter um convite esperando (ex.: dono de um cliente criado pela Vetta). */
function NoCompany({ email }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const check = async () => {
    setBusy(true); setMsg('');
    try {
      const ok = await api.auth.acceptInvite();
      if (!ok) setMsg('Ainda não há convite para este e-mail.');
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="vx-boot">
      <EmptyState icon="building" title="Sua conta ainda não está ligada a uma empresa"
        action={<div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}><Button variant="primary" loading={busy} onClick={check} icon="sync">Procurar convite</Button><Button onClick={() => api.auth.signOut()} icon="logout">Sair</Button></div>}>
        Peça ao administrador da sua empresa (ou à Vetta Sistemas) um convite para o e-mail {email}.
        {msg && <><br /><b>{msg}</b></>}
      </EmptyState>
    </div>
  );
}
