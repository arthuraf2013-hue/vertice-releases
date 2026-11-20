import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PLANS, toCsv, referralCode } from '@vertice/shared';
import { Card, Table, EmptyState, Button, StatusBadge } from '../../ui/kit.jsx';
import { moneyFull as money } from '../../ui/charts.jsx';
import { Summary, Pills, Filters, SearchBox, ClientCell, MethodTag, RowMenu, Two } from './parts.jsx';
import { day, formatDoc, downloadCsv } from './useFinance.js';

/** Situação financeira do cliente, numa palavra. */
export function clientSituation(c) {
  if (c.kind === 'canceled') return { key: 'canceled', label: 'Cancelado', tone: 'idle' };
  if (c.kind === 'trial') return { key: 'trial', label: c.lic.blocked ? 'Teste acabou' : `Teste até ${day(c.trialEndsAt)}`, tone: c.lic.blocked ? 'offline' : 'sync' };
  if (c.kind === 'paused') return { key: 'paused', label: 'Suspenso', tone: 'offline' };
  if (c.failing.length) return { key: 'failing', label: 'Falha no Asaas', tone: 'offline' };
  if (c.overdueCount || c.coll.daysUnpaid) return { key: 'overdue', label: c.lic.blocked ? 'Vencido, bloqueado' : 'Vencido', tone: c.lic.blocked ? 'offline' : 'warn' };
  if (c.kind === 'courtesy') return { key: 'courtesy', label: 'Cortesia', tone: 'idle' };
  if (c.openCount) return { key: 'open', label: 'Em aberto', tone: 'sync' };
  return { key: 'ok', label: 'Em dia', tone: 'online' };
}

const FILTERS = [
  { value: 'all', label: 'Todos', test: (c) => c.kind !== 'canceled' },
  { value: 'overdue', label: 'Vencidos', test: (c) => clientSituation(c).key === 'overdue' },
  { value: 'failing', label: 'Falha no Asaas', test: (c) => c.failing.length > 0 },
  { value: 'open', label: 'Em aberto', test: (c) => clientSituation(c).key === 'open' },
  { value: 'ok', label: 'Em dia', test: (c) => clientSituation(c).key === 'ok' },
  { value: 'trial', label: 'Em teste', test: (c) => c.kind === 'trial' },
  { value: 'courtesy', label: 'Cortesia', test: (c) => c.kind === 'courtesy' },
  { value: 'canceled', label: 'Cancelados', test: (c) => c.kind === 'canceled' },
];

export function Clients({ d, onOpenClient, onPay, onInvoice, onNew }) {
  const [params, setParams] = useSearchParams();
  const filter = FILTERS.some((f) => f.value === params.get('f')) ? params.get('f') : 'all';
  const setFilter = (f) => setParams({ f }, { replace: true });
  const [q, setQ] = useState('');
  const byCode = new Map(d.companies.map((c) => [referralCode(c.id), c.name]));
  const test = FILTERS.find((f) => f.value === filter).test;
  const shown = d.companies.filter((c) => test(c) && (!q || `${c.name} ${c.legalName || ''} ${c.doc} ${c.city || ''} ${c.ownerEmail || ''}`.toLowerCase().includes(q.toLowerCase())));
  const live = d.companies.filter((c) => c.kind !== 'canceled');
  const sum = (list, f) => list.reduce((a, c) => a + f(c), 0);
  const csv = () => downloadCsv(`clientes-${new Date(d.now).toISOString().slice(0, 10)}.csv`, toCsv(shown, [
    { label: 'Cliente', value: (c) => c.name }, { label: 'CPF/CNPJ', value: (c) => formatDoc(c.doc) }, { label: 'Cidade', value: (c) => c.city || '' },
    { label: 'E-mail', value: (c) => c.ownerEmail || '' }, { label: 'Plano', value: (c) => PLANS[c.plan]?.name || c.plan || '' },
    { label: 'MRR', value: (c) => String(c.mrr).replace('.', ',') }, { label: 'Em aberto', value: (c) => String(c.openAmount).replace('.', ',') },
    { label: 'Último pagamento', value: (c) => (c.lastPayment ? day(c.lastPayment.at) : '') }, { label: 'Próximo vencimento', value: (c) => day(c.nextDue) },
    { label: 'Situação', value: (c) => clientSituation(c).label },
  ]));

  return (
    <div className="vx-fin">
      <Card>
        <Summary items={[
          { label: 'Clientes', value: live.length, note: `${live.filter((c) => c.kind === 'paying').length} pagantes` },
          { label: 'MRR somado', value: money(sum(live, (c) => c.mrr)) },
          { label: 'Em aberto', value: money(sum(live, (c) => c.openAmount)) },
          { label: 'Vencido', value: money(sum(live, (c) => c.overdueAmount)), bad: live.some((c) => c.overdueAmount > 0) },
          { label: 'Falha no Asaas', value: live.filter((c) => c.failing.length).length, bad: live.some((c) => c.failing.length) },
        ]} />
      </Card>
      <Card pad={false}>
        <div className="vx-fin-bar">
          <Pills label="Situação dos clientes" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f.value, label: f.label, count: d.companies.filter(f.test).length }))} />
        </div>
        <Filters>
          <SearchBox value={q} onChange={setQ} placeholder="Nome, razão social, CPF/CNPJ ou e-mail" />
          <Button icon="download" disabled={!shown.length} onClick={csv}>Exportar</Button>
          <Button variant="primary" icon="plus" onClick={onNew}>Novo cliente</Button>
        </Filters>
        <Table rows={shown} defaultSort={{ key: 'name', dir: 'asc' }} onRowClick={(c) => onOpenClient(c.id)}
          empty={<EmptyState icon="building" title={d.companies.length ? 'Nenhum cliente neste filtro' : 'Nenhum cliente ainda'}>Use “Novo cliente” para cadastrar uma empresa e convidar o dono.</EmptyState>}
          columns={[
            { key: 'name', label: 'Cliente', sort: (c) => c.name || '', render: (c) => (
              <ClientCell c={c} sub={[formatDoc(c.doc) || c.city, c.referredBy ? `indicado por ${byCode.get(c.referredBy) || c.referredBy}` : null].filter(Boolean).join(' · ')} />
            ) },
            { key: 'plan', label: 'Plano', sort: (c) => c.plan || '', render: (c) => <Two top={PLANS[c.plan]?.name || c.plan || '—'} sub={`${c.screensUsed} de ${c.screenLimit || '—'} telas`} /> },
            { key: 'mrr', label: 'MRR', align: 'right', sort: (c) => c.mrr, sortFirst: 'desc', render: (c) => (c.mrr ? <b>{money(c.mrr)}</b> : <span className="vx-faint">{money(0)}</span>) },
            { key: 'open', label: 'Em aberto', align: 'right', sort: (c) => c.openAmount, sortFirst: 'desc', render: (c) => (c.openAmount ? money(c.openAmount) : <span className="vx-faint">{money(0)}</span>) },
            { key: 'last', label: 'Último pagamento', sort: (c) => c.lastPayment?.at, sortFirst: 'desc', render: (c) => (c.lastPayment
              ? <Two top={day(c.lastPayment.at)} sub={<>{money(c.lastPayment.amount)} · <MethodTag method={c.lastPayment.method} /></>} />
              : '—') },
            { key: 'due', label: 'Próximo vencimento', sort: (c) => c.nextDue, render: (c) => day(c.nextDue) },
            { key: 'sit', label: 'Situação', sort: (c) => clientSituation(c).label, render: (c) => { const s = clientSituation(c); return <StatusBadge status={s.tone}>{s.label}</StatusBadge>; } },
            { key: 'act', label: '', align: 'right', render: (c) => (
              <RowMenu label={`Ações de ${c.name}`} items={[
                { label: 'Abrir a ficha', icon: 'building', onClick: () => onOpenClient(c.id) },
                { label: 'Registrar pagamento', icon: 'wallet', onClick: () => onPay(c.id) },
                { label: 'Nova fatura', icon: 'receipt', onClick: () => onInvoice(c.id) },
              ]} />
            ) },
          ]} />
      </Card>
    </div>
  );
}
