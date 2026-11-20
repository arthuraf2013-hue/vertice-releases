import { useMemo, useState } from 'react';
import { PLANS, licenseRow, LICENSE_ROW_LABEL, toCsv } from '@vertice/shared';
import { Card, Table, EmptyState, Button, StatusBadge } from '../../ui/kit.jsx';
import { Summary, Pills, Filters, SearchBox, SelectBox, ClientCell, Two, RowMenu } from './parts.jsx';
import { downloadCsv, formatDoc } from './useFinance.js';

const TONE = { livres: 'sync', cheio: 'online', nenhuma: 'warn', acima: 'offline', sem: 'idle' };
const SCOPES = [
  { value: 'base', label: 'Toda a base' }, { value: 'paying', label: 'Só pagantes' }, { value: 'trial', label: 'Só em teste' }, { value: 'canceled', label: 'Cancelados' },
];
const STATES = ['all', 'livres', 'cheio', 'nenhuma', 'acima'];

export function Licenses({ d, onOpenClient }) {
  const [scope, setScope] = useState('base');
  const [state, setState] = useState('all');
  const [q, setQ] = useState('');
  const rows = useMemo(() => d.companies.map((c) => ({ ...c, lr: licenseRow(c, c.screensUsed) })), [d]);
  const inScope = rows.filter((c) => (scope === 'base' ? c.kind !== 'canceled' : scope === 'paying' ? c.kind === 'paying' : scope === 'trial' ? c.kind === 'trial' : c.kind === 'canceled'));
  const shown = inScope.filter((c) => (state === 'all' || c.lr.state === state) && (!q || `${c.name} ${c.doc} ${LICENSE_ROW_LABEL[c.lr.state]}`.toLowerCase().includes(q.toLowerCase())));
  const total = (f) => inScope.reduce((a, c) => a + f(c), 0);
  const count = (s) => inScope.filter((c) => s === 'all' || c.lr.state === s).length;
  const csv = () => downloadCsv(`telas-${new Date(d.now).toISOString().slice(0, 10)}.csv`, toCsv(shown, [
    { label: 'Cliente', value: (c) => c.name }, { label: 'CPF/CNPJ', value: (c) => formatDoc(c.doc) }, { label: 'Plano', value: (c) => PLANS[c.plan]?.name || c.plan || '' },
    { label: 'Contratadas', value: (c) => c.lr.contracted }, { label: 'Em uso', value: (c) => c.lr.used }, { label: 'Online agora', value: (c) => c.screensOnline },
    { label: 'Livres', value: (c) => c.lr.free }, { label: 'Situação', value: (c) => LICENSE_ROW_LABEL[c.lr.state] },
  ]));

  return (
    <div className="vx-fin">
      <Card>
        <Summary items={[
          { label: 'Telas contratadas', value: total((c) => c.lr.contracted) },
          { label: 'Em uso (pareadas)', value: total((c) => c.lr.used), note: `${total((c) => c.screensOnline)} online agora` },
          { label: 'Livres', value: total((c) => c.lr.free) },
          { label: 'Clientes com telas livres', value: count('livres') },
          { label: 'Clientes com todas em uso', value: count('cheio') },
          { label: 'Clientes sem tela pareada', value: count('nenhuma'), bad: count('nenhuma') > 0 },
        ]} />
      </Card>
      <Card pad={false}>
        <div className="vx-fin-bar">
          <Pills label="Uso das telas" value={state} onChange={setState} options={STATES.map((s) => ({ value: s, label: s === 'all' ? 'Todas as situações' : LICENSE_ROW_LABEL[s], count: count(s) }))} />
        </div>
        <Filters>
          <SearchBox value={q} onChange={setQ} placeholder="Cliente ou situação" />
          <SelectBox label="Quais clientes" value={scope} onChange={setScope} options={SCOPES} />
          <Button icon="download" disabled={!shown.length} onClick={csv}>Exportar</Button>
        </Filters>
        <Table rows={shown} defaultSort={{ key: 'free', dir: 'desc' }} onRowClick={(c) => onOpenClient(c.id)}
          empty={<EmptyState icon="screen" title="Nenhum cliente nesta situação" />}
          columns={[
            { key: 'name', label: 'Cliente', sort: (c) => c.name || '', render: (c) => <ClientCell c={c} sub={`${PLANS[c.plan]?.name || c.plan || 'Sem plano'}${formatDoc(c.doc) ? ` · ${formatDoc(c.doc)}` : ''}`} /> },
            { key: 'contracted', label: 'Telas contratadas', align: 'right', sort: (c) => c.lr.contracted, sortFirst: 'desc', render: (c) => <b>{c.lr.contracted}</b> },
            { key: 'used', label: 'Em uso', align: 'right', sort: (c) => c.lr.used, sortFirst: 'desc', render: (c) => <Two top={c.lr.used} sub={`${c.screensOnline} online agora`} /> },
            { key: 'free', label: 'Livres', align: 'right', sort: (c) => c.lr.free, sortFirst: 'desc', render: (c) => (c.lr.state === 'acima' ? <b>{c.lr.used - c.lr.contracted} a mais</b> : c.lr.free) },
            { key: 'state', label: 'Situação', sort: (c) => STATES.indexOf(c.lr.state), render: (c) => <StatusBadge status={TONE[c.lr.state]}>{LICENSE_ROW_LABEL[c.lr.state]}</StatusBadge> },
            { key: 'act', label: '', align: 'right', render: (c) => (
              <RowMenu label={`Ações de ${c.name}`} items={[{ label: 'Ajustar telas contratadas', icon: 'edit', onClick: () => onOpenClient(c.id) }]} />
            ) },
          ]} />
      </Card>
    </div>
  );
}
