import { useEffect, useMemo, useState } from 'react';
import { networkSummary, screenStatus, STATUS_LABEL, timeAgo, formatTime, compareVersions, PLAYER_MIN_VERSION } from '@vertice/shared';
import { useSession, useUnitFilter } from '../session.jsx';
import { useCol, useNow, useById } from '../data/hooks.js';
import { PageHeader, Button, Card, Table, ScreenStatus, MetricCard, Loading, EmptyState, StatusBadge, Wordmark } from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

const ORDER = { offline: 0, warn: 1, idle: 2, sync: 3, online: 4 };

export function Monitoring() {
  const { base, units, setTheme, theme } = useSession();
  const now = useNow();
  const all = useCol(`${base}/screens`);
  const screens = useUnitFilter(all);
  const unitById = useById(units);
  const [filter, setFilter] = useState('all');
  const [control, setControl] = useState(false);
  const summary = useMemo(() => networkSummary(screens || [], now), [screens, now]);

  // Sala de controle: tela cheia + tema escuro, para um monitor na parede do escritório.
  useEffect(() => {
    if (!control) return;
    const prevTheme = theme;
    setTheme('dark');
    document.documentElement.requestFullscreen?.().catch(() => {});
    const onFs = () => !document.fullscreenElement && setControl(false);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) document.exitFullscreen?.();
      setTheme(prevTheme);
    };
  }, [control]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!all) return <Loading />;
  const rows = screens
    .map((s) => ({ ...s, _st: screenStatus(s, now) }))
    .filter((s) => filter === 'all' || s._st.key === filter || (filter === 'online' && s._st.key === 'sync'))
    .sort((a, b) => ORDER[a._st.key] - ORDER[b._st.key] || a.code.localeCompare(b.code));
  const outdated = screens.filter((s) => s.appVersion && compareVersions(s.appVersion, PLAYER_MIN_VERSION) < 0).length;

  if (control) return <ControlRoom screens={screens} summary={summary} unitById={unitById} now={now} onExit={() => setControl(false)} />;

  return (
    <div className="vx-page">
      <PageHeader overline="OPERAÇÃO" title="Monitoramento" subtitle="A situação de cada tela, atualizada sozinha a cada sinal de vida (1 por minuto)."
        actions={<Button icon="maximize" onClick={() => setControl(true)}>Sala de controle</Button>} />
      <div className="vx-grid-4">
        <MetricCard icon="check" label="Online" value={summary.healthy} total={summary.total} bar={summary.healthyPct} note={summary.sync ? `${summary.sync} sincronizando mídias` : 'Todas com conteúdo em dia'} dot={summary.sync ? 'sync' : 'online'} />
        <MetricCard icon="alert" label="Atenção" value={summary.warn} dot="warn" note={outdated ? `${outdated} com app desatualizado` : 'Sem contato há mais de 15 min'} />
        <MetricCard icon="xCircle" label="Offline" value={summary.offline} dot="offline" note="Sem contato há mais de 60 min" />
        <MetricCard icon="clock" label="Aguardando" value={summary.idle} dot="idle" note="Pareadas, mas a TV ainda não ligou" />
      </div>
      <Card pad={false}>
        <div className="vx-filter-bar">
          {[['all', 'Todas'], ['online', 'Online'], ['warn', 'Atenção'], ['offline', 'Offline']].map(([k, l]) => (
            <button key={k} type="button" className={`vx-pill ${filter === k ? 'is-on' : ''}`} onClick={() => setFilter(k)} aria-pressed={filter === k}>
              {k !== 'all' && <span className={`vx-dot ${k}`} />}{l}
              <span className="vx-num vx-faint">{k === 'all' ? summary.total : k === 'online' ? summary.healthy : summary[k]}</span>
            </button>
          ))}
          <span className="vx-faint vx-ml-auto">Leitura: {formatTime(now)}</span>
        </div>
        <Table rows={rows} empty={<EmptyState icon="pulse" title="Nenhuma tela neste filtro" />}
          columns={[
            { key: 'name', label: 'Tela', render: (s) => <div><b>{s.name}</b><div className="vx-mono vx-faint">{s.code}</div></div> },
            { key: 'unit', label: 'Unidade', render: (s) => unitById.get(s.unitId)?.name || <span className="vx-faint">—</span> },
            { key: 'st', label: 'Situação', render: (s) => <ScreenStatus screen={s} now={now} withReason /> },
            { key: 'seen', label: 'Último contato', render: (s) => s.lastSeen ? <span title={new Date(s.lastSeen).toLocaleString('pt-BR')}>{timeAgo(s.lastSeen, now)}</span> : <span className="vx-faint">nunca</span> },
            { key: 'np', label: 'No ar agora', render: (s) => s.orderBoard?.mode === 'full' ? 'Painel de pedidos' : s.nowPlaying?.name || <span className="vx-faint">—</span> },
            { key: 'v', label: 'App', width: 90, render: (s) => <span className="vx-mono">{s.appVersion ? `v${s.appVersion}` : '—'}</span> },
          ]} />
      </Card>
    </div>
  );
}

function ControlRoom({ screens, summary, unitById, now, onExit }) {
  const sorted = [...screens].sort((a, b) => ORDER[screenStatus(a, now).key] - ORDER[screenStatus(b, now).key]);
  return (
    <div className="vx-control">
      <header className="vx-control-head">
        <Wordmark className="vx-control-mark" />
        <div className="vx-control-stats">
          {['online', 'warn', 'offline'].map((k) => (
            <div key={k} className={`vx-control-stat is-${k}`}><b className="vx-num">{k === 'online' ? summary.healthy : summary[k]}</b><span>{STATUS_LABEL[k]}</span></div>
          ))}
        </div>
        <div className="vx-control-clock vx-num">{formatTime(now)}</div>
        <Button icon="minimize" onClick={onExit}>Sair</Button>
      </header>
      <div className="vx-control-grid">
        {sorted.map((s) => {
          const st = screenStatus(s, now);
          return (
            <div key={s.id} className={`vx-control-tile is-${st.key}`}>
              <div className="vx-row"><span className="vx-mono">{s.code}</span><span className="vx-ml-auto"><StatusBadge status={st.key} /></span></div>
              <b>{s.name}</b>
              <span className="vx-faint">{unitById.get(s.unitId)?.name || 'Sem unidade'} · {s.lastSeen ? timeAgo(s.lastSeen, now) : 'nunca'}</span>
              {st.key !== 'online' && <span className="vx-control-reason"><Icon name="alert" />{st.reason}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
