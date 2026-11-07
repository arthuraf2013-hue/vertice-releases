import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  networkSummary, screenStatus, greeting, formatBytes, boardOrders, formatOrderNumber,
  formatCustomerName, timeAgo,
} from '@vertice/shared';
import { useSession, useUnitFilter } from '../session.jsx';
import { useCol, useNow, useById } from '../data/hooks.js';
import { Card, MetricCard, NetworkHealth, DeviceCard, TextLink, Loading, StatusBadge, EmptyState, Button } from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

export function Dashboard() {
  const { base, company, member, user, units } = useSession();
  const now = useNow();
  const nav = useNavigate();
  const allScreens = useCol(`${base}/screens`);
  const screens = useUnitFilter(allScreens);
  const media = useCol(`${base}/media`);
  const schedules = useCol(`${base}/schedules`);
  const integrations = useCol(`${base}/integrations`);
  const orders = useCol(`${base}/orders`, { where: [['status', 'in', ['preparing', 'ready']]] });
  const mediaById = useById(media);
  const unitById = useById(units);

  const summary = useMemo(() => networkSummary(screens || [], now), [screens, now]);
  if (!allScreens || !media || !schedules) return <Loading />;

  const firstName = (member?.name || user?.name || '').split(' ')[0];
  const monthAgo = now - 30 * 864e5;
  const newMedia = media.filter((m) => m.createdAt > monthAgo).length;
  const published = schedules.filter((s) => s.status === 'published');
  const drafts = schedules.filter((s) => s.status === 'draft');
  const quota = (company.storageQuotaMB || 0) * 1024 * 1024;
  const usedPct = quota ? Math.round(((company.storageUsedBytes || 0) / quota) * 100) : 0;

  // "Onde agir agora": o que precisa de atenção, do mais grave ao mais leve.
  const actions = [];
  for (const s of screens) {
    const st = screenStatus(s, now);
    if (st.key === 'offline') actions.push({ tone: 'offline', icon: 'xCircle', title: `${s.name} está offline`, text: `${st.reason}. Confira energia e internet da TV.`, to: '/monitoramento' });
  }
  for (const s of screens) {
    const st = screenStatus(s, now);
    if (st.key === 'warn') actions.push({ tone: 'warn', icon: 'alert', title: `${s.name} pede atenção`, text: st.reason, to: '/monitoramento' });
  }
  if (drafts.length) actions.push({ tone: 'sync', icon: 'calendar', title: `${drafts.length} ${drafts.length > 1 ? 'grades em rascunho' : 'grade em rascunho'}`, text: `"${drafts[0].name}" ainda não está nas telas.`, to: '/programacao' });
  if (usedPct >= 80) actions.push({ tone: 'warn', icon: 'storage', title: `Armazenamento em ${usedPct}%`, text: 'Remova mídias antigas ou amplie o plano.', to: '/midias' });

  const board = boardOrders(orders || [], { now, readyTtlMin: 10 });

  return (
    <div className="vx-page">
      <header className="vx-hello">
        <div>
          <div className="vx-overline">{new Date(now).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}</div>
          <h1 className="vx-display">{greeting(new Date(now))}, {firstName}.</h1>
          <p className="vx-page-sub">Sua rede de telas, organizada para o dia a dia.</p>
        </div>
      </header>

      <div className="vx-grid-4">
        <MetricCard icon="screen" label="Telas online" value={summary.healthy} total={summary.total} bar={summary.healthyPct}
          note={summary.total ? `${summary.healthyPct}% da rede com conexão saudável` : 'Nenhuma tela pareada ainda'} link="/telas" linkLabel="Ver telas" />
        <MetricCard icon="image" label="Biblioteca de mídias" value={media.length} dot="sync"
          note={<><span className="vx-metric-delta">+{newMedia}</span> nos últimos 30 dias</>} link="/midias" linkLabel="Ver mídias" />
        <MetricCard icon="calendar" label="Grades de programação" value={schedules.length}
          note={`${published.length} ${published.length === 1 ? 'publicada' : 'publicadas'}${drafts.length ? ` · ${drafts.length} em rascunho` : ''}`} link="/programacao" linkLabel="Abrir grades" />
        <MetricCard icon="storage" label="Armazenamento" value={`${usedPct}%`} bar={usedPct} dot={usedPct >= 80 ? 'warn' : 'online'}
          note={`${formatBytes(company.storageUsedBytes)} de ${formatBytes(quota)}`} link="/empresa" linkLabel="Ver plano" />
      </div>

      <div className="vx-grid-3">
        <NetworkHealth summary={summary} now={now} />
        <Card title="Onde agir agora" icon="alert" iconTone="neutral">
          {actions.length ? (
            <ul className="vx-actions">
              {actions.slice(0, 5).map((a, i) => (
                <li key={i}>
                  <button type="button" onClick={() => nav(a.to)}>
                    <span className={`vx-dot ${a.tone}`} />
                    <span><b>{a.title}</b><span>{a.text}</span></span>
                    <Icon name="chevronRight" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="check" title="Tudo em ordem">Nenhuma tela com problema e nenhuma grade parada.</EmptyState>
          )}
        </Card>
        <Card title="Pedidos agora" icon="receipt" iconTone="neutral" actions={<TextLink to="/empresa?aba=integracoes">Integração</TextLink>}>
          {integrations?.length ? (
            <>
              <div className="vx-orders-counts">
                <div><span className="vx-overline">EM PREPARO</span><b className="vx-num">{board.preparing.length}</b></div>
                <div><span className="vx-overline">PRONTOS</span><b className="vx-num">{board.ready.length}</b></div>
              </div>
              <ul className="vx-order-list">
                {[...board.ready.slice(0, 3), ...board.preparing.slice(0, 3 - Math.min(3, board.ready.length))].map((o) => (
                  <li key={o.id}>
                    <span className="vx-order-num">{formatOrderNumber(o.number)}</span>
                    <span>{formatCustomerName(o.customerName, 'first-initial') || 'Cliente'}</span>
                    {o.status === 'ready' ? <StatusBadge status="online">Pronto {timeAgo(o.readyAt, now)}</StatusBadge> : <StatusBadge status="sync">Em preparo</StatusBadge>}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState icon="plug" title="Conecte o GerenciaAI" action={<Button size="sm" onClick={() => nav('/empresa?aba=integracoes')}>Conectar</Button>}>
              Mostre na TV o número do pedido e o nome do cliente quando o pedido ficar pronto.
            </EmptyState>
          )}
        </Card>
      </div>

      <section>
        <div className="vx-section-head">
          <h2 className="vx-card-title">Suas telas</h2>
          <TextLink to="/telas">Ver todas</TextLink>
        </div>
        {screens.length ? (
          <div className="vx-grid-devices">
            {screens.slice(0, 4).map((s) => (
              <DeviceCard key={s.id} screen={s} now={now} media={mediaById.get(s.nowPlaying?.mediaId)} unitName={unitById.get(s.unitId)?.name} onClick={() => nav(`/telas?tela=${s.id}`)} />
            ))}
          </div>
        ) : (
          <Card><EmptyState icon="screen" title="Nenhuma tela ainda" action={<Button variant="primary" icon="plus" onClick={() => nav('/telas?parear=1')}>Parear tela</Button>}>Instale o player na TV Box e digite aqui o código que aparecer na tela.</EmptyState></Card>
        )}
      </section>
    </div>
  );
}
