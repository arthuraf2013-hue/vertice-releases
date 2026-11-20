import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { INVOICE_KIND_LABEL, toCsv, toMillis } from '@vertice/shared';
import { api } from '../../data/api.js';
import { Card, Table, EmptyState, Button, Modal, Input, Select, Toggle, StatusBadge, useToast, useConfirm } from '../../ui/kit.jsx';
import { Icon } from '../../ui/Icon.jsx';
import { moneyFull as money } from '../../ui/charts.jsx';
import { Summary, Pills, Filters, SearchBox, ClientCell, Two, RowMenu } from './parts.jsx';
import { day, formatDoc, downloadCsv } from './useFinance.js';

const DAY = 86_400_000;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Etiqueta da situação, com o prazo escrito. */
export function InvoiceBadge({ inv }) {
  const s = inv.state;
  if (s.key === 'paid') return <StatusBadge status="online">Paga em {day(inv.paidAt)}</StatusBadge>;
  if (s.key === 'canceled') return <StatusBadge status="idle">Cancelada</StatusBadge>;
  if (s.key === 'overdue') return <StatusBadge status="offline">Vencida há {plural(s.daysLate, 'dia', 'dias')}</StatusBadge>;
  if (s.daysToDue === 0) return <StatusBadge status="warn">Vence hoje</StatusBadge>;
  return <StatusBadge status="sync">Vence em {plural(s.daysToDue, 'dia', 'dias')}</StatusBadge>;
}

/** Ações de uma fatura (também usadas na aba Cobrança). */
export function useInvoiceActions() {
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [paying, setPaying] = useState(null);
  const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok); } catch (e) { toast(e.message, 'offline'); } };
  const items = (inv) => {
    if (inv.kind === 'loja') return [inv.invoiceUrl && { label: 'Abrir a fatura no Asaas', icon: 'link', href: inv.invoiceUrl }];
    const live = inv.state.key === 'open' || inv.state.key === 'overdue';
    return [
      inv.invoiceUrl && { label: 'Abrir a fatura no Asaas', icon: 'link', href: inv.invoiceUrl },
      inv.invoiceUrl && { label: 'Copiar o link da fatura', icon: 'copy', onClick: () => run(() => navigator.clipboard.writeText(inv.invoiceUrl), 'Link copiado.') },
      live && !inv.asaasPaymentId && { label: inv.syncError ? 'Tentar a cobrança de novo' : 'Gerar cobrança no Asaas', icon: 'sync', onClick: () => run(() => api.financeAction(inv.cid, inv.id, 'cobrar'), 'Cobrança gerada no Asaas.') },
      live && { label: 'Dar baixa (recebido por fora)', icon: 'check', onClick: () => setPaying(inv) },
      live && {
        label: 'Cancelar a fatura', icon: 'xCircle', danger: true,
        onClick: async () => {
          if (!(await confirm({ title: `Cancelar a fatura de ${inv.name}?`, message: inv.asaasPaymentId ? 'A cobrança também é apagada no Asaas e o cliente deixa de poder pagar por ela.' : 'Ela sai das contas a receber.', confirmLabel: 'Cancelar fatura', danger: true }))) return;
          await run(() => api.financeAction(inv.cid, inv.id, 'cancelar'), 'Fatura cancelada.');
        },
      },
    ];
  };
  const dialogs = <>{confirmDialog}{paying && <PaidModal inv={paying} onClose={() => setPaying(null)} />}</>;
  return { items, dialogs };
}

function PaidModal({ inv, onClose }) {
  const toast = useToast();
  const [method, setMethod] = useState('Pix');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.financeAction(inv.cid, inv.id, 'baixa', { method, paidAt: new Date(`${date}T12:00:00`).getTime() });
      toast(inv.months ? 'Baixa feita. O vencimento do cliente avançou.' : 'Baixa feita.');
      onClose();
    } catch (e) { toast(e.message, 'offline'); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Dar baixa na fatura" subtitle={`${inv.name} · ${inv.title} · ${money(inv.amount)}`} icon="check" width={480}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} onClick={save}>Dar baixa</Button></>}>
      <div className="vx-form">
        <div className="vx-form-row">
          <Select label="Recebido por" value={method} onChange={(e) => setMethod(e.target.value)} options={['Pix', 'Boleto', 'Cartão de crédito', 'Transferência', 'Dinheiro'].map((m) => ({ value: m, label: m }))} />
          <Input label="Recebido em" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {inv.asaasPaymentId && <p className="vx-help">A cobrança no Asaas é marcada como recebida, para o cliente não ser cobrado de novo.</p>}
        {inv.months > 0 && <p className="vx-help">Esta fatura renova {inv.months === 1 ? '1 mês' : `${inv.months} meses`} da assinatura.</p>}
      </div>
    </Modal>
  );
}

/** Nova fatura feita no console (avulsa, contratação ou mensalidade). */
export function NewInvoiceModal({ d, cid: fixedCid, onClose }) {
  const toast = useToast();
  const options = d.companies.filter((c) => c.status !== 'canceled').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const [cid, setCid] = useState(fixedCid || options[0]?.id || '');
  const c = d.byId.get(cid);
  const [f, setF] = useState({ kind: 'avulsa', title: '', amount: '', due: new Date(d.now + 3 * DAY).toISOString().slice(0, 10), months: '0', charge: true });
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const save = async () => {
    const amount = Number(String(f.amount).replace(/\./g, '').replace(',', '.')) || 0;
    if (!cid || !(amount >= 5)) return toast('Escolha o cliente e um valor a partir de R$ 5,00.', 'offline');
    setBusy(true);
    try {
      const id = api.newId(`companies/${cid}/invoices`);
      const title = f.title.trim() || (f.kind === 'mensalidade' ? `Mensalidade · ${c?.screenLimit || 1} telas` : INVOICE_KIND_LABEL[f.kind]);
      await api.set(`companies/${cid}/invoices/${id}`, {
        kind: f.kind, title, amount, months: Number(f.months) || 0, status: 'open', createdBy: 'console',
        dueAt: new Date(`${f.due}T23:59:00`), createdAt: api.NOW,
      });
      if (f.charge) {
        try { await api.financeAction(cid, id, 'cobrar'); toast('Fatura criada e cobrança gerada no Asaas.'); } catch (e) { toast(`Fatura criada, mas a cobrança não saiu: ${e.message}`, 'warn'); }
      } else toast('Fatura criada.');
      onClose();
    } catch (e) { toast(e.message, 'offline'); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Nova fatura" subtitle="A cobrança vai pelo Asaas: o cliente escolhe Pix, boleto ou cartão." icon="receipt" width={560}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} onClick={save}>Criar fatura</Button></>}>
      <div className="vx-form">
        {!fixedCid && <Select label="Cliente" value={cid} onChange={(e) => setCid(e.target.value)} options={options.map((o) => ({ value: o.id, label: o.name }))} />}
        <div className="vx-form-row">
          <Select label="Tipo" value={f.kind} onChange={(e) => set({ kind: e.target.value, months: e.target.value === 'mensalidade' ? '1' : f.months, amount: e.target.value === 'mensalidade' && c?.monthlyPrice ? String(c.monthlyPrice).replace('.', ',') : f.amount })}
            options={['avulsa', 'contratacao', 'mensalidade'].map((k) => ({ value: k, label: INVOICE_KIND_LABEL[k] }))} />
          <Input label="Descrição" value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder={f.kind === 'avulsa' ? 'Ex.: instalação de 2 TVs' : 'Opcional'} />
        </div>
        <div className="vx-form-row">
          <Input label="Valor (R$)" inputMode="decimal" value={f.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="99,90" />
          <Input label="Vencimento" type="date" value={f.due} onChange={(e) => set({ due: e.target.value })} />
          <Select label="Ao pagar, renova" value={f.months} onChange={(e) => set({ months: e.target.value })} options={[{ value: '0', label: 'Não renova' }, ...[1, 2, 3, 6, 12].map((m) => ({ value: String(m), label: m === 1 ? '1 mês' : `${m} meses` }))]} />
        </div>
        <Toggle label="Gerar a cobrança no Asaas agora" help={c && !c.doc ? 'Este cliente ainda não tem CPF ou CNPJ: cadastre na ficha dele para a cobrança sair.' : 'O Asaas envia a fatura ao cliente por e-mail.'} checked={f.charge} onChange={(v) => set({ charge: v })} />
      </div>
    </Modal>
  );
}

const FILTERS = [
  { value: 'receber', label: 'A receber', test: (i) => i.state.key === 'open' || i.state.key === 'overdue' },
  { value: 'vencidas', label: 'Vencidas', test: (i) => i.state.key === 'overdue' },
  { value: 'avencer', label: 'A vencer', test: (i) => i.state.key === 'open' },
  { value: 'pagas', label: 'Pagas', test: (i) => i.state.key === 'paid' },
  { value: 'canceladas', label: 'Canceladas', test: (i) => i.state.key === 'canceled' },
  { value: 'falha', label: 'Falha no Asaas', test: (i) => (i.state.key === 'open' || i.state.key === 'overdue') && !!i.syncError },
  { value: 'todas', label: 'Todas', test: () => true },
];

export function Invoices({ d }) {
  const [params, setParams] = useSearchParams();
  const filter = FILTERS.some((f) => f.value === params.get('f')) ? params.get('f') : 'receber';
  const setFilter = (f) => setParams({ f }, { replace: true });
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const { items, dialogs } = useInvoiceActions();
  const rows = useMemo(() => d.invoices.map((i) => ({ ...i, doc: d.byId.get(i.cid)?.doc || '' })), [d]);
  const sum = (list) => list.reduce((a, i) => a + i.amount, 0);
  const open = rows.filter((i) => i.state.key === 'open');
  const overdue = rows.filter((i) => i.state.key === 'overdue');
  const week = open.filter((i) => toMillis(i.dueAt) <= d.now + 7 * DAY);
  const test = FILTERS.find((f) => f.value === filter).test;
  const shown = rows.filter((i) => test(i) && (!q || `${i.name} ${i.doc} ${i.title} ${i.description || ''}`.toLowerCase().includes(q.toLowerCase())));
  const csv = () => downloadCsv(`faturas-${new Date(d.now).toISOString().slice(0, 10)}.csv`, toCsv(shown, [
    { label: 'Vencimento', value: (i) => day(i.dueAt) }, { label: 'Cliente', value: (i) => i.name }, { label: 'CPF/CNPJ', value: (i) => formatDoc(i.doc) },
    { label: 'Fatura', value: (i) => i.title }, { label: 'Tipo', value: (i) => INVOICE_KIND_LABEL[i.kind] }, { label: 'Situação', value: (i) => i.state.key },
    { label: 'Valor', value: (i) => String(i.amount).replace('.', ',') }, { label: 'Pago em', value: (i) => (i.paidAt ? day(i.paidAt) : '') },
    { label: 'Link', value: (i) => i.invoiceUrl || '' },
  ]));

  return (
    <div className="vx-fin">
      <Card>
        <Summary items={[
          { label: 'A receber', value: money(sum(open) + sum(overdue)) },
          { label: 'Vencido', value: money(sum(overdue)), bad: overdue.length > 0 },
          { label: 'A vencer', value: money(sum(open)) },
          { label: 'Vence em 7 dias', value: money(sum(week)) },
        ]} />
      </Card>
      <Card pad={false}>
        <div className="vx-fin-bar">
          <Pills label="Situação das faturas" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f.value, label: f.label, count: rows.filter(f.test).length }))} />
        </div>
        <Filters>
          <SearchBox value={q} onChange={setQ} placeholder="Cliente, CPF/CNPJ ou fatura" />
          <Button icon="download" disabled={!shown.length} onClick={csv}>Exportar</Button>
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>Nova fatura</Button>
        </Filters>
        <Table rows={shown} rowKey={(i) => `${i.cid}/${i.id}`} defaultSort={{ key: 'due', dir: filter === 'pagas' ? 'desc' : 'asc' }}
          empty={<EmptyState icon="receipt" title="Nenhuma fatura neste filtro">As faturas da mensalidade são geradas sozinhas {d.settings.invoiceDaysBefore ?? 10} dias antes do vencimento.</EmptyState>}
          columns={[
            { key: 'due', label: 'Vencimento', sort: (i) => i.dueAt, render: (i) => day(i.dueAt) },
            { key: 'name', label: 'Cliente', sort: (i) => i.name, render: (i) => <ClientCell name={i.name} sub={formatDoc(i.doc)} /> },
            { key: 'title', label: 'Fatura', sort: (i) => i.title, render: (i) => <Two top={i.title} sub={i.description || INVOICE_KIND_LABEL[i.kind]} /> },
            { key: 'state', label: 'Situação', sort: (i) => ({ overdue: 0, open: 1, paid: 2, canceled: 3 }[i.state.key]), render: (i) => (
              <span className="vx-fin-state"><InvoiceBadge inv={i} />{i.syncError && i.state.key !== 'paid' && i.state.key !== 'canceled' && <span className="vx-fin-sync" title={i.syncError.message}><Icon name="alert" />Falha no Asaas</span>}</span>
            ) },
            { key: 'amount', label: 'Valor', align: 'right', sort: (i) => i.amount, render: (i) => <b>{money(i.amount)}</b> },
            { key: 'act', label: '', align: 'right', render: (i) => (
              <span className="vx-fin-row-actions">
                {i.invoiceUrl && <a className="vx-row-menu-btn" href={i.invoiceUrl} target="_blank" rel="noreferrer" aria-label="Abrir a fatura no Asaas" title="Abrir a fatura no Asaas"><Icon name="link" /></a>}
                <RowMenu label={`Ações da fatura de ${i.name}`} items={items(i)} />
              </span>
            ) },
          ]} />
      </Card>
      {creating && <NewInvoiceModal d={d} onClose={() => setCreating(false)} />}
      {dialogs}
    </div>
  );
}
