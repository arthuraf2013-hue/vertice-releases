import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ROLE_LABEL, ROLES, PLANS, formatBytes, formatDateTime, timeAgo, normalizePairingCode, isValidPairingCode,
  PAIRING_KIND, boardOrders, formatOrderNumber, STATUS_WARN_MS,
} from '@vertice/shared';
import { useSession } from '../session.jsx';
import { useCol, useNow, useById } from '../data/hooks.js';
import { api, supportWhatsApp } from '../data/api.js';
import {
  PageHeader, Button, Card, Tabs, Table, Input, Select, Loading, EmptyState, Modal, useToast, useConfirm, IconButton,
  StatusBadge, MetricCard,
} from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

export function Company() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('aba') || 'dados';
  return (
    <div className="vx-page">
      <PageHeader overline="GESTÃO" title="Empresa" subtitle="Dados da empresa, quem acessa o painel, integrações e o seu plano." />
      <Tabs value={tab} onChange={(aba) => setParams({ aba }, { replace: true })} tabs={[
        { id: 'dados', label: 'Dados' }, { id: 'usuarios', label: 'Usuários' }, { id: 'integracoes', label: 'Integrações' }, { id: 'licenca', label: 'Plano' },
      ]} />
      {tab === 'dados' && <CompanyData />}
      {tab === 'usuarios' && <Users />}
      {tab === 'integracoes' && <Integrations />}
      {tab === 'licenca' && <Plan />}
    </div>
  );
}

function CompanyData() {
  const { base, company, can } = useSession();
  const toast = useToast();
  const [f, setF] = useState({ name: company.name || '', cnpj: company.cnpj || '', phone: company.phone || '', city: company.city || '' });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    await api.update(base, { ...f, name: f.name.trim() });
    setBusy(false);
    toast('Dados salvos.');
  };
  return (
    <Card title="Dados da empresa" icon="building">
      <form className="vx-form vx-form-narrow" onSubmit={save}>
        <fieldset disabled={!can('admin')} className="vx-form">
          <Input label="Nome da empresa" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          <div className="vx-form-row">
            <Input label="CNPJ" value={f.cnpj} onChange={(e) => setF({ ...f, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
            <Input label="Telefone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </div>
          <Input label="Cidade" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} help="Usada no clima da barra inferior (Fase 2)." />
        </fieldset>
        {can('admin') && <div><Button type="submit" variant="primary" loading={busy}>Salvar</Button></div>}
      </form>
    </Card>
  );
}

function Users() {
  const { base, companyId, company, can, user, member } = useSession();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const members = useCol(`${base}/members`, { orderBy: ['name', 'asc'] });
  const invites = useCol('invites', { where: [['companyId', '==', companyId]] });
  const [inv, setInv] = useState(null);
  if (!members) return <Loading />;
  const assignable = ROLES.filter((r) => r !== 'owner');

  const invite = async () => {
    const email = inv.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Confira o e-mail.', 'warn');
    await api.set(`invites/${email}`, { companyId, companyName: company.name, role: inv.role, invitedAt: api.NOW, invitedBy: member?.name || user.email });
    setInv(null);
    toast(`Convite criado. Peça para ${email} criar a conta no painel com esse e-mail.`);
  };
  const changeRole = (m, role) => api.update(`${base}/members/${m.id}`, { role }).then(() => toast('Permissão atualizada.'));
  const removeMember = async (m) => {
    if (!(await confirm({ title: `Remover ${m.name}?`, danger: true, confirmLabel: 'Remover', message: 'A pessoa perde o acesso ao painel desta empresa.' }))) return;
    await api.batch([{ op: 'delete', path: `${base}/members/${m.id}` }, { op: 'delete', path: `users/${m.id}` }]);
    toast('Acesso removido.');
  };

  return (
    <>
      <Card pad={false} title="Usuários" icon="users" actions={can('admin') && <Button size="sm" icon="plus" onClick={() => setInv({ email: '', role: 'editor' })}>Convidar</Button>}>
        <Table rows={members}
          columns={[
            { key: 'name', label: 'Nome', render: (m) => <div><b>{m.name}</b>{m.id === user.uid && <span className="vx-faint"> (você)</span>}<div className="vx-faint">{m.email}</div></div> },
            { key: 'role', label: 'Permissão', width: 240, render: (m) => (can('owner') && m.role !== 'owner' && m.id !== user.uid) ? (
              <div className="vx-select-wrap"><select className="vx-input vx-select vx-input-sm" value={m.role} onChange={(e) => changeRole(m, e.target.value)}>
                {assignable.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select><Icon name="chevronDown" /></div>
            ) : ROLE_LABEL[m.role] },
            { key: 'since', label: 'Desde', render: (m) => <span className="vx-faint">{formatDateTime(m.joinedAt)}</span> },
            { key: 'a', label: '', width: 60, align: 'right', render: (m) => can('owner') && m.role !== 'owner' && <IconButton icon="trash" label="Remover" variant="danger" onClick={() => removeMember(m)} /> },
          ]} />
      </Card>
      {invites?.length > 0 && (
        <Card pad={false} title="Convites pendentes" icon="send" iconTone="neutral">
          <Table rows={invites} columns={[
            { key: 'id', label: 'E-mail', render: (i) => <b>{i.id}</b> },
            { key: 'role', label: 'Permissão', render: (i) => ROLE_LABEL[i.role] },
            { key: 'at', label: 'Convidado', render: (i) => <span className="vx-faint">{formatDateTime(i.invitedAt)} por {i.invitedBy}</span> },
            { key: 'a', label: '', width: 60, align: 'right', render: (i) => can('admin') && <IconButton icon="x" label="Cancelar convite" variant="ghost" onClick={() => api.remove(`invites/${i.id}`)} /> },
          ]} />
        </Card>
      )}
      <Card title="O que cada permissão pode fazer" icon="key" iconTone="neutral">
        <ul className="vx-role-list">
          <li><b>{ROLE_LABEL.owner}</b>Tudo, inclusive gerenciar usuários e o plano.</li>
          <li><b>{ROLE_LABEL.admin}</b>Parear e configurar telas, grupos, unidades e integrações.</li>
          <li><b>{ROLE_LABEL.editor}</b>Enviar mídias, montar playlists e publicar grades.</li>
          <li><b>{ROLE_LABEL.viewer}</b>Acompanhar telas e monitoramento, sem alterar nada.</li>
        </ul>
      </Card>
      <Modal open={!!inv} onClose={() => setInv(null)} title="Convidar usuário" icon="users" width={480}
        footer={<><Button onClick={() => setInv(null)}>Cancelar</Button><Button variant="primary" onClick={invite}>Criar convite</Button></>}>
        <form className="vx-form" onSubmit={(e) => { e.preventDefault(); invite(); }}>
          <Input label="E-mail" type="email" value={inv?.email || ''} onChange={(e) => setInv({ ...inv, email: e.target.value })} help="A pessoa cria a conta no painel com este e-mail e já entra na sua empresa." />
          <Select label="Permissão" value={inv?.role || 'editor'} onChange={(e) => setInv({ ...inv, role: e.target.value })} options={assignable.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
        </form>
      </Modal>
      {confirmDialog}
    </>
  );
}

function Integrations() {
  const { base, companyId, units, can } = useSession();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const now = useNow();
  const integrations = useCol(`${base}/integrations`);
  const orders = useCol(`${base}/orders`, { where: [['status', 'in', ['preparing', 'ready']]] });
  const screens = useCol(`${base}/screens`);
  const unitById = useById(units);
  const [pair, setPair] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!integrations) return <Loading />;

  const board = boardOrders(orders || [], { now, readyTtlMin: 30 });
  const boardScreens = (screens || []).filter((s) => s.orderBoard?.mode && s.orderBoard.mode !== 'off');

  const doPair = async () => {
    const code = normalizePairingCode(pair.code);
    if (!isValidPairingCode(code)) return setError('O código tem 6 caracteres, como aparece no GerenciaAI.');
    setBusy(true);
    setError('');
    try {
      await api.claimPairing({ companyId, code, kind: PAIRING_KIND.INTEGRATION, name: pair.name.trim() || 'GerenciaAI', unitId: pair.unitId || null });
      setPair(null);
      toast('GerenciaAI conectado. Os pedidos prontos já aparecem nas telas configuradas.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async (i) => {
    if (!(await confirm({ title: `Desconectar ${i.name}?`, danger: true, confirmLabel: 'Desconectar', message: 'O GerenciaAI deixa de enviar pedidos para as telas. Dá para conectar de novo com um novo código.' }))) return;
    await api.batch([{ op: 'delete', path: `${base}/integrations/${i.id}` }, { op: 'delete', path: `devices/${i.deviceUid || i.id}` }]);
    toast('Integração desconectada.');
  };

  return (
    <>
      <Card title="GerenciaAI" icon="receipt" actions={can('admin') && <Button size="sm" variant="primary" icon="plug" onClick={() => { setPair({ code: '', name: '', unitId: units[0]?.id || '' }); setError(''); }}>Conectar caixa</Button>}>
        <p className="vx-help vx-mb-4">
          No GerenciaAI, abra <b>Configurações › Vértice</b> e clique em <b>Gerar código</b>. Digite o código aqui.
          Cada caixa (PDV) conectado envia os pedidos para as telas da unidade dele. Depois escolha, em cada tela, como os pedidos aparecem (Telas › configurar tela › Painel de pedidos).
        </p>
        <Table rows={integrations} empty={<EmptyState icon="plug" title="Nenhum caixa conectado">Conecte o GerenciaAI para mostrar o pedido e o cliente na TV quando o pedido ficar pronto.</EmptyState>}
          columns={[
            { key: 'name', label: 'Caixa', render: (i) => <b>{i.name}</b> },
            { key: 'unit', label: 'Unidade', render: (i) => unitById.get(i.unitId)?.name || <span className="vx-faint">Todas</span> },
            { key: 'st', label: 'Situação', render: (i) => i.lastSeen && now - i.lastSeen < STATUS_WARN_MS ? <StatusBadge status="online">Conectado</StatusBadge> : <StatusBadge status="idle">{i.lastSeen ? `Visto ${timeAgo(i.lastSeen, now)}` : 'Aguardando'}</StatusBadge> },
            { key: 'since', label: 'Conectado', render: (i) => <span className="vx-faint">{formatDateTime(i.pairedAt)}</span> },
            { key: 'a', label: '', width: 60, align: 'right', render: (i) => can('admin') && <IconButton icon="trash" label="Desconectar" variant="danger" onClick={() => disconnect(i)} /> },
          ]} />
      </Card>
      {integrations.length > 0 && (
        <div className="vx-grid-3">
          <MetricCard icon="clock" label="Em preparo" value={board.preparing.length} dot="sync" note="Pedidos abertos no GerenciaAI" />
          <MetricCard icon="check" label="Prontos" value={board.ready.length} note="Nos últimos 30 minutos" />
          <MetricCard icon="screen" label="Telas com painel de pedidos" value={boardScreens.length} dot={boardScreens.length ? 'online' : 'warn'} note={boardScreens.length ? boardScreens.map((s) => s.name).join(', ') : 'Ative em Telas › configurar tela'} link="/telas" linkLabel="Configurar telas" />
        </div>
      )}
      {integrations.length > 0 && (
        <Card pad={false} title="Pedidos ao vivo" icon="pulse" iconTone="neutral">
          <Table rows={[...board.ready, ...board.preparing]} empty={<EmptyState icon="receipt" title="Nenhum pedido aberto agora" />}
            columns={[
              { key: 'n', label: 'Pedido', width: 100, render: (o) => <span className="vx-order-num">{formatOrderNumber(o.number)}</span> },
              { key: 'c', label: 'Cliente', render: (o) => o.customerName || <span className="vx-faint">—</span> },
              { key: 's', label: 'Situação', render: (o) => o.status === 'ready' ? <StatusBadge status="online">Pronto</StatusBadge> : <StatusBadge status="sync">Em preparo</StatusBadge> },
              { key: 't', label: 'Caixa', render: (o) => o.terminal || '—' },
              { key: 'u', label: 'Unidade', render: (o) => unitById.get(o.unitId)?.name || '—' },
              { key: 'h', label: 'Hora', render: (o) => <span className="vx-faint">{timeAgo(o.readyAt || o.createdAt, now)}</span> },
            ]} />
        </Card>
      )}
      <Modal open={!!pair} onClose={() => setPair(null)} title="Conectar GerenciaAI" icon="plug" width={560}
        footer={<><Button onClick={() => setPair(null)}>Cancelar</Button><Button variant="primary" onClick={doPair} loading={busy}>Conectar</Button></>}>
        <form className="vx-form" onSubmit={(e) => { e.preventDefault(); doPair(); }}>
          <div className="vx-pair-code">
            <label className="vx-label" htmlFor="int-code">Código do GerenciaAI</label>
            <input id="int-code" className="vx-input vx-input-code" value={pair?.code || ''} onChange={(e) => setPair({ ...pair, code: normalizePairingCode(e.target.value) })} placeholder="9QM4TR" autoComplete="off" />
          </div>
          <div className="vx-form-row">
            <Input label="Nome do caixa" value={pair?.name || ''} onChange={(e) => setPair({ ...pair, name: e.target.value })} placeholder="GerenciaAI · Caixa 1" />
            <Select label="Unidade" value={pair?.unitId || ''} onChange={(e) => setPair({ ...pair, unitId: e.target.value })}
              options={[{ value: '', label: 'Todas as unidades' }, ...units.map((u) => ({ value: u.id, label: u.name }))]} help="Os pedidos vão para as telas desta unidade." />
          </div>
          {error && <div className="vx-alert vx-alert-offline"><Icon name="alert" />{error}</div>}
        </form>
      </Modal>
      {confirmDialog}
    </>
  );
}

function Plan() {
  const { company, base } = useSession();
  const screens = useCol(`${base}/screens`);
  const plan = PLANS[company.plan] || PLANS.start;
  const quota = (company.storageQuotaMB || plan.storageMB) * 1024 * 1024;
  const used = company.storageUsedBytes || 0;
  const n = screens?.length || 0;
  const limit = company.screenLimit || plan.screens;
  return (
    <>
      <div className="vx-grid-3">
        <MetricCard icon="key" label="Plano" value={plan.name} dot="online" note={`Até ${limit} telas e ${formatBytes(quota)}`} />
        <MetricCard icon="screen" label="Telas" value={n} total={limit} bar={(n / limit) * 100} dot={n >= limit ? 'warn' : 'online'} note={n >= limit ? 'Limite atingido' : `${limit - n} disponíveis`} />
        <MetricCard icon="storage" label="Armazenamento" value={formatBytes(used)} bar={(used / quota) * 100} note={`de ${formatBytes(quota)}`} />
      </div>
      <Card title="Ampliar o plano" icon="building" iconTone="neutral">
        <div className="vx-plans">
          {Object.entries(PLANS).map(([id, p]) => (
            <div key={id} className={`vx-plan ${company.plan === id ? 'is-current' : ''}`}>
              <b>{p.name}</b>
              <span>{p.screens} telas</span>
              <span>{formatBytes(p.storageMB * 1024 * 1024)}</span>
              {company.plan === id ? <span className="vx-badge vx-badge-pro">ATUAL</span> : null}
            </div>
          ))}
        </div>
        <p className="vx-help">Para mudar de plano ou ver o financeiro, fale com a Vetta Sistemas.</p>
        {supportWhatsApp && (
          <a className="vx-btn" href={`https://wa.me/${supportWhatsApp}?text=${encodeURIComponent(`Quero ampliar o plano do Vértice (${company.name})`)}`} target="_blank" rel="noreferrer"><Icon name="send" />Falar com a Vetta</a>
        )}
      </Card>
    </>
  );
}
