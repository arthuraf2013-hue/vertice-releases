import { useMemo, useState } from 'react';
import { methodSplit, PAYMENT_METHODS, toCsv, INVOICE_KIND_LABEL } from '@vertice/shared';
import { Card, Table, EmptyState, Button } from '../../ui/kit.jsx';
import { ShareBar, moneyFull as money } from '../../ui/charts.jsx';
import { Summary, Filters, SearchBox, SelectBox, ClientCell, MethodTag, Two } from './parts.jsx';
import { day, PERIODS, periodStart, formatDoc, downloadCsv } from './useFinance.js';

export function receiptsCsv(rows) {
  return toCsv(rows, [
    { label: 'Pagamento', value: (r) => day(r.at) }, { label: 'Cliente', value: (r) => r.name }, { label: 'CPF/CNPJ', value: (r) => formatDoc(r.doc) },
    { label: 'Fatura', value: (r) => r.title }, { label: 'Meio', value: (r) => PAYMENT_METHODS.find((m) => m.key === r.method)?.label },
    { label: 'Canal', value: (r) => r.channel }, { label: 'Valor', value: (r) => String(r.amount).replace('.', ',') },
  ]);
}

export function Receipts({ d }) {
  const [q, setQ] = useState('');
  const [period, setPeriod] = useState('30');
  const [method, setMethod] = useState('all');
  const from = periodStart(period, d.now);
  const inPeriod = useMemo(() => d.receipts.filter((r) => r.at >= from).map((r) => ({ ...r, doc: d.byId.get(r.cid)?.doc || '' })), [d, from]);
  const shown = inPeriod.filter((r) => (method === 'all' || r.method === method)
    && (!q || `${r.name} ${r.doc} ${r.title}`.toLowerCase().includes(q.toLowerCase()) || r.doc.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§')));
  const total = shown.reduce((a, r) => a + r.amount, 0);
  const clients = new Set(shown.map((r) => r.cid)).size;
  const split = methodSplit(inPeriod);
  const periodName = PERIODS.find((p) => p.value === period)?.label.toLowerCase();

  return (
    <div className="vx-fin">
      <Card>
        <Summary items={[
          { label: `Recebido · ${periodName}`, value: money(total) },
          { label: 'Pagamentos', value: shown.length },
          { label: 'Ticket médio', value: money(shown.length ? total / shown.length : 0) },
          { label: 'Clientes', value: clients },
        ]} />
        <ShareBar parts={split} inline showCount />
      </Card>
      <Card pad={false}>
        <Filters>
          <SearchBox value={q} onChange={setQ} placeholder="Cliente, CPF/CNPJ ou fatura" />
          <SelectBox label="Período" value={period} onChange={setPeriod} options={PERIODS} />
          <SelectBox label="Meio de pagamento" value={method} onChange={setMethod} options={[{ value: 'all', label: 'Todos os meios' }, ...PAYMENT_METHODS.map((m) => ({ value: m.key, label: m.label }))]} />
          <Button icon="download" disabled={!shown.length} onClick={() => downloadCsv(`recebimentos-${new Date(d.now).toISOString().slice(0, 10)}.csv`, receiptsCsv(shown))}>Exportar</Button>
        </Filters>
        <Table rows={shown} rowKey={(r) => `${r.cid}/${r.id}`} defaultSort={{ key: 'at', dir: 'desc' }}
          empty={<EmptyState icon="coin" title="Nenhum recebimento neste filtro">Mude o período ou o meio de pagamento.</EmptyState>}
          columns={[
            { key: 'at', label: 'Pagamento', sort: (r) => r.at, sortFirst: 'desc', render: (r) => day(r.at) },
            { key: 'name', label: 'Cliente', sort: (r) => r.name, render: (r) => <ClientCell name={r.name} sub={formatDoc(r.doc)} /> },
            { key: 'title', label: 'Fatura', sort: (r) => r.title, render: (r) => { const kind = INVOICE_KIND_LABEL[r.kind] || 'Pagamento'; return <Two top={r.title} sub={r.title.startsWith(kind) ? null : kind} />; } },
            { key: 'method', label: 'Meio de pagamento', sort: (r) => r.method, render: (r) => <MethodTag method={r.method} /> },
            { key: 'channel', label: 'Canal' },
            { key: 'amount', label: 'Valor', align: 'right', sort: (r) => r.amount, sortFirst: 'desc', render: (r) => <b>{money(r.amount)}</b> },
          ]} />
      </Card>
    </div>
  );
}
