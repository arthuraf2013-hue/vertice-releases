import { useMemo, useState } from 'react';
import { mrrByDay, mrrOf, mrrAt, movementsIn, MOVEMENT_LABEL, PLANS, toCsv } from '@vertice/shared';
import { Card, Table, EmptyState, Button, StatusBadge } from '../../ui/kit.jsx';
import { Icon } from '../../ui/Icon.jsx';
import { LineChart, moneyFull as money, dayLabel } from '../../ui/charts.jsx';
import { Summary, Pills, Filters, SearchBox, SelectBox, ClientCell } from './parts.jsx';
import { day, downloadCsv } from './useFinance.js';

const DAY = 86_400_000;
const signed = (v) => `${v >= 0 ? '+' : '−'}${money(Math.abs(v))}`;
const PERIODS = [{ value: '30', label: 'Últimos 30 dias' }, { value: '90', label: 'Últimos 90 dias' }, { value: '180', label: 'Últimos 180 dias' }, { value: '365', label: 'Últimos 12 meses' }];
const TONE = { new: 'online', reactivation: 'online', expansion: 'sync', contraction: 'warn', churn: 'offline' };
const TYPES = [{ value: 'all', label: 'Todos os eventos' }, ...Object.entries(MOVEMENT_LABEL).map(([value, label]) => ({ value, label }))];
const LIC_TYPES = [{ value: 'all', label: 'Pareadas e removidas' }, { value: 'activated', label: 'Telas pareadas' }, { value: 'removed', label: 'Telas removidas' }];

export function Mrr({ d }) {
  const [period, setPeriod] = useState('90');
  const [tab, setTab] = useState('mrr');
  const [type, setType] = useState('all');
  const [licType, setLicType] = useState('all');
  const [q, setQ] = useState('');
  const days = Number(period);
  const from = d.now - days * DAY;
  const series = useMemo(() => mrrByDay({ companies: d.companies, events: d.events, receipts: d.receipts, now: d.now, days }), [d, days]);
  const current = d.companies.reduce((a, c) => a + mrrOf(c), 0);
  const startMrr = mrrAt(current, d.events, from);
  const mv = movementsIn(d.events, from, d.now);
  const events = d.events.filter((e) => e.at >= from);
  const activations = d.activations.filter((e) => e.at >= from);
  const match = (e) => !q || `${e.name} ${e.screenName || ''}`.toLowerCase().includes(q.toLowerCase());
  const shownEvents = events.filter((e) => (type === 'all' || e.type === type) && match(e));
  const shownLic = activations.filter((e) => (licType === 'all' || e.type === licType) && match(e));
  const step = days <= 30 ? 5 : days <= 90 ? 8 : days <= 180 ? 15 : 30;

  const csv = () => (tab === 'mrr'
    ? downloadCsv(`movimentos-mrr-${new Date(d.now).toISOString().slice(0, 10)}.csv`, toCsv(shownEvents, [
      { label: 'Data', value: (e) => day(e.at) }, { label: 'Cliente', value: (e) => e.name }, { label: 'Evento', value: (e) => MOVEMENT_LABEL[e.type] },
      { label: 'De', value: (e) => String(e.from).replace('.', ',') }, { label: 'Para', value: (e) => String(e.to).replace('.', ',') }, { label: 'Impacto', value: (e) => String(e.delta).replace('.', ',') },
    ]))
    : downloadCsv(`telas-pareadas-${new Date(d.now).toISOString().slice(0, 10)}.csv`, toCsv(shownLic, [
      { label: 'Data', value: (e) => day(e.at) }, { label: 'Cliente', value: (e) => e.name }, { label: 'Evento', value: (e) => (e.type === 'activated' ? 'Tela pareada' : 'Tela removida') }, { label: 'Tela', value: (e) => e.screenName },
    ])));

  return (
    <div className="vx-fin">
      <Card>
        <Summary items={[
          { label: 'MRR no início', value: money(startMrr) },
          { label: 'MRR no fim', value: money(current) },
          { label: 'Entrou (novos + expansão)', value: signed(mv.in) },
          { label: 'Saiu (contração + cancelamento)', value: signed(-mv.out), bad: mv.out > 0 },
          { label: 'Variação líquida', value: signed(mv.net) },
          { label: 'Telas pareadas', value: activations.filter((e) => e.type === 'activated' && !e.backfill).length },
        ]} />
      </Card>
      <Card>
        <div className="vx-card-head">
          <h2 className="vx-card-title">Evolução do MRR por dia</h2>
          <SelectBox label="Período do gráfico" value={period} onChange={setPeriod} options={PERIODS} />
        </div>
        <div className="vx-chart-legend">
          <span><i className="is-line" style={{ background: 'var(--series-1)' }} />MRR contratado</span>
          <span><i className="is-dash" style={{ borderColor: 'var(--series-3)' }} />Recebido no dia</span>
        </div>
        <LineChart label="MRR por dia" labels={series.map((s) => dayLabel(s.start))} markers={false} tickEvery={step} height={260}
          series={[
            { key: 'mrr', label: 'MRR', color: 'var(--series-1)', values: series.map((s) => s.value) },
            { key: 'rec', label: 'Recebido', color: 'var(--series-3)', values: series.map((s) => s.received), dashed: true, area: false },
          ]} />
      </Card>
      <Card pad={false}>
        <div className="vx-fin-bar">
          <Pills label="Lista" value={tab} onChange={setTab} options={[
            { value: 'mrr', label: 'Movimentações do MRR', count: events.length },
            { value: 'lic', label: 'Telas pareadas e removidas', count: activations.length },
          ]} />
        </div>
        <Filters>
          <SearchBox value={q} onChange={setQ} placeholder={tab === 'mrr' ? 'Cliente' : 'Cliente ou tela'} />
          {tab === 'mrr'
            ? <SelectBox label="Evento" value={type} onChange={setType} options={TYPES} />
            : <SelectBox label="Evento" value={licType} onChange={setLicType} options={LIC_TYPES} />}
          <Button icon="download" disabled={tab === 'mrr' ? !shownEvents.length : !shownLic.length} onClick={csv}>Exportar</Button>
        </Filters>
        {tab === 'mrr' ? (
          <Table rows={shownEvents} defaultSort={{ key: 'at', dir: 'desc' }} rowKey={(e) => e.id}
            empty={<EmptyState icon="pulse" title="Nenhuma movimentação no período">O histórico começa quando o serviço da Vetta liga o financeiro.</EmptyState>}
            columns={[
              { key: 'name', label: 'Cliente', sort: (e) => e.name, render: (e) => <ClientCell name={e.name} sub={[PLANS[e.plan]?.name, e.screens ? `${e.screens} telas` : null].filter(Boolean).join(' · ')} /> },
              { key: 'type', label: 'Evento', sort: (e) => e.type, render: (e) => <StatusBadge status={TONE[e.type]}>{MOVEMENT_LABEL[e.type]}</StatusBadge> },
              { key: 'change', label: 'Mensalidade', render: (e) => <span className="vx-fin-change">{money(e.from)}<Icon name="arrowRight" />{money(e.to)}</span> },
              { key: 'at', label: 'Data', sort: (e) => e.at, sortFirst: 'desc', render: (e) => <span title={e.backfill ? 'Data do cadastro (antes do histórico começar)' : undefined}>{day(e.at)}{e.backfill ? '*' : ''}</span> },
              { key: 'delta', label: 'Impacto no MRR', align: 'right', sort: (e) => e.delta, sortFirst: 'desc', render: (e) => (
                <b className={e.delta >= 0 ? 'vx-up' : 'vx-down'}><Icon name={e.delta >= 0 ? 'arrowUp' : 'arrowDown'} />{signed(e.delta)}</b>
              ) },
            ]} />
        ) : (
          <Table rows={shownLic} defaultSort={{ key: 'at', dir: 'desc' }} rowKey={(e) => e.id}
            empty={<EmptyState icon="screen" title="Nenhuma tela pareada ou removida no período" />}
            columns={[
              { key: 'name', label: 'Cliente', sort: (e) => e.name, render: (e) => <ClientCell name={e.name} sub="" /> },
              { key: 'type', label: 'Evento', sort: (e) => e.type, render: (e) => <StatusBadge status={e.type === 'activated' ? 'online' : 'idle'}>{e.type === 'activated' ? 'Tela pareada' : 'Tela removida'}</StatusBadge> },
              { key: 'screen', label: 'Tela', sort: (e) => e.screenName, render: (e) => e.screenName },
              { key: 'at', label: 'Data', sort: (e) => e.at, sortFirst: 'desc', render: (e) => day(e.at) },
            ]} />
        )}
        {tab === 'mrr' && shownEvents.some((e) => e.backfill) && <p className="vx-help vx-fin-foot">* Contas que já pagavam quando o histórico começou entram como “novo cliente” na data do cadastro.</p>}
      </Card>
    </div>
  );
}
