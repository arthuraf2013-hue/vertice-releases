import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  recurringMetrics, cashMetrics, mrrByMonth, receivedByMonth, methodSplit, monthLabel,
} from '@vertice/shared';
import { Card } from '../../ui/kit.jsx';
import { Icon } from '../../ui/Icon.jsx';
import { LineChart, BarChart, ShareBar, moneyFull } from '../../ui/charts.jsx';
import { Kpi, Delta, Section } from './parts.jsx';
import { pct } from './useFinance.js';

const DAY = 86_400_000;
const money = moneyFull;
const signed = (v) => `${v >= 0 ? '+' : '−'}${money(Math.abs(v))}`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function Overview({ d }) {
  const { now } = d;
  const r = useMemo(() => recurringMetrics({ companies: d.companies, events: d.events, now }), [d, now]);
  const cash = useMemo(() => cashMetrics({ invoices: d.invoices, receipts: d.receipts, now }), [d, now]);
  const months = useMemo(() => mrrByMonth({ companies: d.companies, events: d.events, now }), [d, now]);
  const received = useMemo(() => receivedByMonth(d.receipts, now, 12), [d, now]);
  const split = useMemo(() => methodSplit(d.receipts.filter((x) => x.at >= now - 365 * DAY)), [d, now]);
  const mv = r.thisMonth;
  const near = d.companies.filter((c) => c.coll.stage === 'near');
  const suspended = d.companies.filter((c) => c.coll.stage === 'suspended' || c.coll.stage === 'near');
  const failing = d.companies.filter((c) => c.failing.length);
  const thisMonth = monthLabel(now);
  const prevMonth = months[months.length - 2]?.label;

  const actions = [
    { to: '/vetta/faturas?f=vencidas', title: 'Faturas vencidas', n: cash.overdueCount, note: cash.overdueCount ? `${money(cash.overdue)} · ${plural(cash.overdueClients, 'cliente', 'clientes')}` : 'nenhuma em atraso' },
    { to: '/vetta/cobranca?f=near', title: 'Perto do cancelamento', n: near.length, note: `menos de 15 dias para o cancelamento automático (${d.settings.cancelAfterDays ?? 90} dias sem pagar)` },
    { to: '/vetta/cobranca?f=suspended', title: 'Contas suspensas', n: suspended.length, note: 'telas paradas por falta de pagamento' },
    { to: '/vetta/cobranca?f=falha', title: 'Falhas no Asaas', n: failing.length, note: 'cobrança que não foi gerada no Asaas' },
  ];

  return (
    <div className="vx-fin">
      <Section title="Receita recorrente">
        <div className="vx-kpis vx-kpis-4">
          <Kpi icon="sync" label="MRR" value={money(r.mrr)} chip={<Delta value={r.growth} label={`vs ${prevMonth}`} />} note={r.growth == null ? 'soma das mensalidades ativas' : null} />
          <Kpi icon="coin" label="ARR" value={money(r.arr)} note="MRR × 12" />
          <Kpi icon="sparkles" label={`MRR líquido novo · ${thisMonth}`} value={signed(mv.net)} note={`novos ${money(mv.newMrr + mv.reactivation)} · expansão ${money(mv.expansion)} · saídas ${money(mv.out)}`} />
          <Kpi icon="pulse" label="Quick ratio" value={r.quickRatio == null ? '—' : r.quickRatio === Infinity ? 'só entradas' : r.quickRatio.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} note="entradas ÷ saídas, 3 meses fechados" />
        </div>
      </Section>

      <Section title="Retenção">
        <div className="vx-kpis vx-kpis-4">
          <Kpi icon="user" label="Churn de clientes" value={pct(r.churnAccounts)} note="por mês · média de 3 meses" tone={r.churnAccounts > 0.05 ? 'warn' : null} />
          <Kpi icon="arrowDown" label="Churn de receita" value={pct(r.churnRevenue)} note="por mês · média de 3 meses" tone={r.churnRevenue > 0.05 ? 'warn' : null} />
          <Kpi icon="trophy" label="NRR" value={pct(r.nrr, 0)} note={r.nrr == null ? 'precisa de 12 meses de histórico' : 'receita retida com expansão, 12 meses'} />
          <Kpi icon="shield" label="GRR" value={pct(r.grr, 0)} note={r.grr == null ? 'precisa de 12 meses de histórico' : 'receita retida sem expansão, 12 meses'} />
        </div>
      </Section>

      <Section title="Base de clientes">
        <div className="vx-kpis vx-kpis-3">
          <Kpi icon="users" label="Contas pagantes" value={r.paying} note={`${plural(r.trial, 'em teste', 'em teste')} · ${plural(r.courtesy, 'cortesia', 'cortesias')}${r.paused ? ` · ${plural(r.paused, 'pausada', 'pausadas')}` : ''}`} />
          <Kpi icon="wallet" label="ARPA" value={money(r.arpa)} note="receita média por conta" />
          <Kpi icon="coin" label="LTV" value={r.ltv == null ? '—' : money(r.ltv)} note={r.ltv == null ? 'sem cancelamentos nos últimos 3 meses' : 'ARPA ÷ churn de clientes'} />
        </div>
      </Section>

      <Section title="Caixa e cobrança">
        <div className="vx-kpis vx-kpis-5">
          <Kpi icon="receipt" label="Faturado no mês" value={money(cash.billed)} note={cash.billedPaidShare == null ? 'nenhuma fatura vence este mês' : `${pct(cash.billedPaidShare, 0)} já pago`} />
          <Kpi icon="coin" label="Recebido no mês" value={money(cash.received)} />
          <Kpi icon="calendar" label="Previsão · 30 dias" value={money(cash.forecast30)} note="faturas em aberto a vencer" />
          <Kpi icon="alert" label="Vencido" value={money(cash.overdue)} tone={cash.overdue > 0 ? 'bad' : null} note={cash.delinquency == null ? 'sem faturas nos últimos 90 dias' : `inadimplência ${pct(cash.delinquency, 0)}`} />
          <Kpi icon="clock" label="Prazo médio de recebimento" value={cash.avgDaysToPay == null ? '—' : plural(cash.avgDaysToPay, 'dia', 'dias')} note="emissão → pagamento, 90 dias" />
        </div>
      </Section>

      <Card>
        <h2 className="vx-card-title">Precisa de ação</h2>
        <div className="vx-fin-actions">
          {actions.map((a) => (
            <Link key={a.title} to={a.to} className={`vx-fin-action ${a.n ? 'has-items' : ''}`}>
              <span className="vx-fin-action-text"><b>{a.title}</b><small>{a.note}</small></span>
              <span className="vx-fin-action-n">{a.n}<Icon name="arrowRight" /></span>
            </Link>
          ))}
        </div>
      </Card>

      <div className="vx-fin-2col">
        <Card>
          <div className="vx-card-head"><h2 className="vx-card-title">Evolução do MRR · 12 meses</h2><Link className="vx-fin-link" to="/vetta/mrr">MRR e movimentações<Icon name="arrowRight" /></Link></div>
          <LineChart label="MRR por mês" labels={months.map((m) => (m.current ? 'hoje' : m.label))}
            series={[{ key: 'mrr', label: 'MRR', color: 'var(--series-1)', values: months.map((m) => m.value) }]} partialLast />
        </Card>
        <Card>
          <h2 className="vx-card-title">Movimento do MRR · {thisMonth}</h2>
          <ul className="vx-fin-moves">
            <Move label="Novos clientes" sub={plural(mv.newCount, 'conta', 'contas')} value={mv.newMrr} />
            {mv.reactivationCount > 0 && <Move label="Reativações" sub={plural(mv.reactivationCount, 'conta', 'contas')} value={mv.reactivation} />}
            <Move label="Expansão" value={mv.expansion} />
            <Move label="Contração" value={-mv.contraction} />
            <Move label="Cancelamentos" sub={plural(mv.churnCount, 'conta', 'contas')} value={-mv.churn} />
          </ul>
          <div className="vx-fin-net"><span>Variação líquida</span><b>{signed(mv.net)}</b></div>
        </Card>
      </div>

      <div className="vx-fin-2col">
        <Card>
          <div className="vx-card-head"><h2 className="vx-card-title">Recebido por mês</h2><Link className="vx-fin-link" to="/vetta/recebimentos">Recebimentos<Icon name="arrowRight" /></Link></div>
          <BarChart label="Recebido" values={received.map((m) => m.value)} labels={received.map((m) => m.label)} />
        </Card>
        <Card>
          <h2 className="vx-card-title">Meios de pagamento · 12 meses</h2>
          <ShareBar parts={split} showCount />
        </Card>
      </div>
    </div>
  );
}

function Move({ label, sub, value }) {
  const up = value > 0;
  const zero = !value;
  return (
    <li>
      <span><b>{label}</b>{sub && <small>{sub}</small>}</span>
      <strong className={zero ? '' : up ? 'is-up' : 'is-down'}>
        {!zero && <Icon name={up ? 'arrowUp' : 'arrowDown'} />}{zero ? money(0) : signed(value)}
      </strong>
    </li>
  );
}
