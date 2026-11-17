import { useEffect, useState } from 'react';
import { timerCommand, timerElapsed, timerAt, normalizeTimer, TIMER_MODES } from '@vertice/shared';
import { AppView } from '@vertice/shared/apps';
import { useSession } from '../session.jsx';
import { useCol, useDoc } from '../data/hooks.js';
import { api } from '../data/api.js';
import { PageHeader, Button, Card, Loading, EmptyState, Select, useToast } from '../ui/kit.jsx';

/** Cronômetro: iniciar, pausar e zerar pelo celular. Todas as TVs com o app mostram o mesmo tempo. */
export function TimerDesk() {
  const { base, can } = useSession();
  const toast = useToast();
  const apps = useCol(`${base}/media`, { where: [['app.kind', '==', 'timer']] });
  const [tid, setTid] = useState('');
  const app = apps?.find((a) => a.id === tid) || apps?.[0];
  const state = useDoc(app ? `${base}/timers/${app.id}` : null);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 500); return () => clearInterval(t); }, []);
  if (!apps) return <Loading />;
  if (!apps.length) {
    return (
      <div className="vx-page">
        <PageHeader overline="OPERAÇÃO" title="Cronômetro" />
        <Card><EmptyState icon="hourglass" title="Nenhum cronômetro" action={can('editor') && <Button variant="primary" icon="plus" onClick={() => { location.hash = '#/aplicativos'; }}>Criar em Aplicativos</Button>}>
          Crie o app "Cronômetro de treino" em Aplicativos e coloque na playlist da TV do box.
        </EmptyState></Card>
      </div>
    );
  }
  if (state === undefined) return <Loading />;
  const cfg = normalizeTimer(app.app.config);
  const st = state || {};
  const send = async (cmd) => {
    try {
      await api.set(`${base}/timers/${app.id}`, { ...timerCommand(st, cmd, Date.now()), updatedAt: Date.now() }, true);
    } catch (e) { toast(`Não deu: ${e.message || e}`); }
  };
  const phase = timerAt(cfg, timerElapsed(cfg, st, Date.now())).phase;
  const running = st.status === 'running';
  const paused = st.status === 'paused';
  return (
    <div className="vx-page vx-desk">
      <PageHeader overline="OPERAÇÃO" title="Cronômetro" subtitle={`${TIMER_MODES[cfg.mode].label}: ${TIMER_MODES[cfg.mode].desc}`} />
      {apps.length > 1 && <Select label="Cronômetro" value={app.id} onChange={(e) => setTid(e.target.value)} options={apps.map((a) => ({ value: a.id, label: a.name }))} />}
      <div className="vx-app-screen vx-timer-live"><AppView app={app.app} data={{ state: st, offset: 0 }} /></div>
      <div className="vx-desk-actions vx-timer-actions">
        {!running && !paused && <button type="button" className="vx-desk-big is-go" onClick={() => send('start')}><b>Iniciar</b><small>{cfg.prep ? `${cfg.prep} s de preparação` : 'Começa na hora'}</small></button>}
        {running && phase !== 'done' && <button type="button" className="vx-desk-big" onClick={() => send('pause')}><b>Pausar</b></button>}
        {paused && <button type="button" className="vx-desk-big is-go" onClick={() => send('resume')}><b>Continuar</b></button>}
        {(running || paused) && <button type="button" className="vx-desk-big is-stop" onClick={() => send('reset')}><b>Zerar</b><small>{phase === 'done' ? 'Treino terminou' : 'Para e volta ao começo'}</small></button>}
      </div>
    </div>
  );
}
