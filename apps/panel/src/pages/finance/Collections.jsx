import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { COLLECTION_LABEL, toMillis } from '@vertice/shared';
import { api } from '../../data/api.js';
import { Card, Table, EmptyState, Button, Modal, Input, StatusBadge, useToast, useConfirm } from '../../ui/kit.jsx';
import { Icon } from '../../ui/Icon.jsx';
import { moneyFull as money } from '../../ui/charts.jsx';
import { Summary, Pills, Filters, SearchBox, ClientCell, RowMenu, Two } from './parts.jsx';
import { day } from './useFinance.js';

const DAY = 86_400_000;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const TONE = { ok: 'online', overdue: 'warn', suspended: 'offline', near: 'offline', scheduled: 'warn', canceled: 'idle' };

const FILTERS = [
  { value: 'all', label: 'Todas', test: (c) => c.coll.stage !== 'ok' || c.failing.length > 0 },
  { value: 'near', label: 'Perto do cancelamento', test: (c) => c.coll.stage === 'near' },
  { value: 'suspended', label: 'Suspensas', test: (c) => c.coll.stage === 'suspended' || c.coll.stage === 'near' },
  { value: 'overdue', label: 'Vencidas', test: (c) => c.coll.stage === 'overdue' },
  { value: 'scheduled', label: 'Cancelamento agendado', test: (c) => c.coll.stage === 'scheduled' },
  { value: 'canceled', label: 'Canceladas', test: (c) => c.coll.stage === 'canceled' },
  { value: 'falha', label: 'Falha no Asaas', test: (c) => c.failing.length > 0 },
];

function situation(c) {
  const s = c.coll;
  if (s.stage === 'scheduled') return `Pedido em ${day(c.cancelRequestedAt || c.updatedAt)}`;
  if (s.stage === 'canceled') return `${c.cancelReason === 'pedido' ? 'A pedido' : c.cancelReason === 'inadimplencia' ? 'Falta de pagamento' : 'Cancelada'} em ${day(c.canceledAt)}`;
  if (s.daysUnpaid) return `${plural(s.daysUnpaid, 'dia', 'dias')} sem renovar · ${plural(c.openCount, 'fatura', 'faturas')} · ${money(c.openAmount)}`;
  return c.openCount ? `${plural(c.openCount, 'fatura em aberto', 'faturas em aberto')}` : 'em dia';
}

function nextStep(c) {
  const s = c.coll;
  if (s.stage === 'scheduled') return <Two top={`Cancela em ${day(s.cancelAt)}`} sub="vale até lá" />;
  if (s.stage === 'canceled') return <Two top="Reativar quando pagar" sub={c.openCount ? 'há fatura em aberto' : 'sem fatura em aberto'} />;
  if (s.autoCancelAt && s.daysUnpaid) return <Two top={`Cancela em ${day(s.autoCancelAt)}`} sub={s.daysToCancel > 0 ? `faltam ${plural(s.daysToCancel, 'dia', 'dias')}` : 'na próxima rodada'} />;
  if (s.stage === 'overdue') return <Two top="Lembrar o cliente" sub={`bloqueia após a tolerância de ${c.graceDays ?? 5} dias`} />;
  return '—';
}

function AsaasCell({ c }) {
  if (c.failing.length) {
    return <span className="vx-fin-sync" title={c.failing[0].syncError?.message}><Icon name="alert" />Falha na sincronização</span>;
  }
  if (!c.doc) return <span className="vx-faint">Sem CPF/CNPJ</span>;
  const charged = c.invoices.find((i) => (i.state.key === 'open' || i.state.key === 'overdue') && i.asaasPaymentId);
  return charged ? <span className="vx-chip-soft">Cobrança no Asaas</span> : <span className="vx-faint">Cliente {c.asaasCustomerId ? 'no Asaas' : 'ainda não criado'}</span>;
}

export function Collections({ d, onOpenClient }) {
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [params, setParams] = useSearchParams();
  const filter = FILTERS.some((f) => f.value === params.get('f')) ? params.get('f') : 'all';
  const setFilter = (f) => setParams({ f }, { replace: true });
  const [q, setQ] = useState('');
  const [scheduling, setScheduling] = useState(null);
  const recentCanceled = (c) => c.coll.stage !== 'canceled' || (toMillis(c.canceledAt) || 0) > d.now - 90 * DAY;
  const base = d.companies.filter(recentCanceled);
  const test = FILTERS.find((f) => f.value === filter).test;
  const shown = base.filter((c) => test(c) && (!q || `${c.name} ${c.doc} ${c.city || ''}`.toLowerCase().includes(q.toLowerCase())));
  const count = (v) => base.filter(FILTERS.find((f) => f.value === v).test).length;

  const run = async (fn, ok) => { try { await fn(); toast(ok); } catch (e) { toast(e.message, 'offline'); } };
  const reminder = (c) => {
    const inv = c.invoices.find((i) => i.state.key === 'overdue' || i.state.key === 'open');
    const phone = String(c.phone || '').replace(/\D/g, '');
    const text = `Olá! Aqui é da Vetta Sistemas. A mensalidade do Vértice de ${c.name}${inv ? ` (${money(inv.amount)}, vencimento ${day(inv.dueAt)})` : ''} está em aberto.${inv?.invoiceUrl ? ` Você pode pagar por Pix, boleto ou cartão aqui: ${inv.invoiceUrl}` : ''} Qualquer dúvida, é só responder.`;
    return phone ? `https://wa.me/${phone.length <= 11 ? `55${phone}` : phone}?text=${encodeURIComponent(text)}` : null;
  };
  const items = (c) => {
    const inv = c.invoices.find((i) => (i.state.key === 'overdue' || i.state.key === 'open'));
    const failing = c.failing[0];
    const wa = reminder(c);
    return [
      { label: 'Abrir a ficha do cliente', icon: 'building', onClick: () => onOpenClient(c.id) },
      wa && c.coll.stage !== 'canceled' && { label: 'Lembrar pelo WhatsApp', icon: 'message', href: wa },
      inv?.invoiceUrl && { label: 'Copiar o link da fatura', icon: 'copy', onClick: () => run(() => navigator.clipboard.writeText(inv.invoiceUrl), 'Link copiado.') },
      failing && { label: 'Tentar a cobrança de novo', icon: 'sync', onClick: () => run(() => api.financeAction(c.id, failing.id, 'cobrar'), 'Cobrança gerada no Asaas.') },
      c.coll.autoCancelAt && c.coll.daysUnpaid > 0 && { label: 'Adiar o cancelamento em 15 dias', icon: 'clock', onClick: () => run(() => api.update(`companies/${c.id}`, { cancelHoldUntil: new Date(Math.max(c.coll.autoCancelAt, d.now) + 15 * DAY) }), 'Cancelamento adiado em 15 dias.') },
      c.coll.stage !== 'canceled' && c.coll.stage !== 'scheduled' && { label: 'Agendar cancelamento', icon: 'calendar', onClick: () => setScheduling(c) },
      c.coll.stage === 'scheduled' && { label: 'Desfazer o agendamento', icon: 'x', onClick: () => run(() => api.update(`companies/${c.id}`, { cancelAt: api.DELETE, cancelRequestedAt: api.DELETE }), 'Agendamento desfeito.') },
      c.coll.stage === 'canceled' && {
        label: 'Reativar a conta', icon: 'check',
        onClick: async () => {
          if (!(await confirm({ title: `Reativar ${c.name}?`, message: 'As telas voltam na próxima conexão. Se a mensalidade não estiver paga, registre o pagamento na ficha do cliente.', confirmLabel: 'Reativar' }))) return;
          await run(() => api.update(`companies/${c.id}`, { status: 'active', cancelReason: api.DELETE, canceledAt: api.DELETE }), 'Conta reativada.');
        },
      },
    ];
  };

  const near = d.companies.filter((c) => c.coll.stage === 'near');
  const suspended = d.companies.filter((c) => c.coll.stage === 'suspended' || c.coll.stage === 'near');
  const scheduled = d.companies.filter((c) => c.coll.stage === 'scheduled');
  const openTotal = d.companies.filter((c) => c.coll.stage !== 'ok').reduce((a, c) => a + c.openAmount, 0);

  return (
    <div className="vx-fin">
      <Card>
        <Summary items={[
          { label: 'Perto do cancelamento', value: near.length, bad: near.length > 0 },
          { label: 'Suspensas', value: suspended.length, bad: suspended.length > 0 },
          { label: 'Em aberto nessas contas', value: money(openTotal) },
          { label: 'Cancelamentos agendados', value: scheduled.length },
        ]} />
        <p className="vx-help vx-fin-rule">
          <Icon name="shield" />Regra: as telas param depois da tolerância do cliente e a conta é cancelada sozinha com {d.settings.cancelAfterDays ?? 90} dias sem pagamento. Mude em Configurações.
        </p>
      </Card>
      <Card pad={false}>
        <div className="vx-fin-bar">
          <Pills label="Situação de cobrança" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f.value, label: f.label, count: count(f.value) }))} />
        </div>
        <Filters><SearchBox value={q} onChange={setQ} placeholder="Cliente ou CPF/CNPJ" /></Filters>
        <Table rows={shown} defaultSort={{ key: 'stage', dir: 'asc' }} onRowClick={(c) => onOpenClient(c.id)}
          empty={<EmptyState icon="check" title="Nada para cobrar aqui">Nenhuma conta nesta situação.</EmptyState>}
          columns={[
            { key: 'name', label: 'Cliente', sort: (c) => c.name, render: (c) => <ClientCell c={c} /> },
            { key: 'stage', label: 'Situação', sort: (c) => ['near', 'suspended', 'overdue', 'scheduled', 'ok', 'canceled'].indexOf(c.coll.stage), render: (c) => (
              <span className="vx-fin-situation"><StatusBadge status={TONE[c.coll.stage]}>{COLLECTION_LABEL[c.coll.stage]}</StatusBadge><small>{situation(c)}</small></span>
            ) },
            { key: 'next', label: 'Próximo passo', sort: (c) => c.coll.cancelAt || c.coll.autoCancelAt, render: nextStep },
            { key: 'asaas', label: 'Asaas', render: (c) => <AsaasCell c={c} /> },
            { key: 'open', label: 'Em aberto', align: 'right', sort: (c) => c.openAmount, render: (c) => (c.openAmount ? <b>{money(c.openAmount)}</b> : '—') },
            { key: 'act', label: '', align: 'right', render: (c) => <RowMenu label={`Ações de cobrança de ${c.name}`} items={items(c)} /> },
          ]} />
      </Card>
      {scheduling && <ScheduleModal c={scheduling} d={d} onClose={() => setScheduling(null)} />}
      {confirmDialog}
    </div>
  );
}

/** Cancelamento a pedido do cliente: a conta vale até a data e cancela sozinha. */
function ScheduleModal({ c, d, onClose }) {
  const toast = useToast();
  const [date, setDate] = useState(new Date(Math.max(toMillis(c.paidUntil) || 0, d.now + DAY)).toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.update(`companies/${c.id}`, { cancelAt: new Date(`${date}T23:59:00`), cancelRequestedAt: api.NOW, ...(reason.trim() ? { cancelNote: reason.trim().slice(0, 200) } : {}) });
      toast(`Cancelamento agendado para ${new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR')}.`);
      onClose();
    } catch (e) { toast(e.message, 'offline'); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Agendar o cancelamento de ${c.name}`} subtitle="A conta continua funcionando até a data e não recebe novas faturas." icon="calendar" width={480}
      footer={<><Button onClick={onClose}>Voltar</Button><Button variant="destructive" loading={busy} onClick={save}>Agendar cancelamento</Button></>}>
      <div className="vx-form">
        <Input label="Cancelar em" type="date" value={date} onChange={(e) => setDate(e.target.value)} help={c.paidUntil ? `Pago até ${day(c.paidUntil)}.` : undefined} />
        <Input label="Motivo (interno)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: fechou a loja do centro" />
      </div>
    </Modal>
  );
}

