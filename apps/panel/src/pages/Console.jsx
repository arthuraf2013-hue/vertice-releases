// Console da Vetta Sistemas: todos os clientes, planos, vencimentos, pagamentos e bloqueio.
// Aparece só para quem tem platformAdmins/{uid} (criado à mão no console do Firebase).
import { useEffect, useMemo, useState } from 'react';
import {
  PLANS, LICENSE_LABEL, LICENSE_STATUS, DEFAULT_TRIAL_DAYS, DEFAULT_GRACE_DAYS, licenseState, nextPaidUntil,
  screenStatus, formatBytes, formatMoney as fmtMoney, ROLE_LABEL,
} from '@vertice/shared';
import { useSession } from '../session.jsx';
import { useCol, useNow } from '../data/hooks.js';
import { api } from '../data/api.js';
import {
  PageHeader, Button, Card, Table, Input, Select, Loading, EmptyState, Modal, useToast, useConfirm, StatusBadge, MetricCard, Toggle, Segmented,
} from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';
import { StoreAdmin } from './Store.jsx';
import { referralCode } from '@vertice/shared';

const DAY = 86400000;
const money = (n) => (n ? `R$ ${fmtMoney(n)}` : '—');
const day = (ms) => (ms ? new Date(ms).toLocaleDateString('pt-BR') : '—');
const toInput = (ms) => (ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '');
/** Data do campo (AAAA-MM-DD) → fim daquele dia no horário local. */
const fromInput = (v) => (v ? new Date(`${v}T23:59:00`).getTime() : null);
const PLAN_OPTIONS = Object.entries(PLANS).map(([value, p]) => ({ value, label: `${p.name}, ${p.screens} telas` }));
const licLabel = (lic) => (lic.blocked ? 'Bloqueado' : lic.overdue ? 'Vencido' : LICENSE_LABEL[lic.status]);

const FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'trial', label: 'Em teste' },
  { value: 'attention', label: 'Atenção' },
  { value: 'blocked', label: 'Bloqueados' },
];

export function Console() {
  const { settings } = useSession();
  const now = useNow();
  const companies = useCol('companies');
  const [screens, setScreens] = useState(null);
  useEffect(() => api.watchGroup('screens', setScreens, () => setScreens([])), []);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editingSettings, setEditingSettings] = useState(false);

  const rows = useMemo(() => {
    const byCompany = new Map();
    for (const s of screens || []) {
      const cid = s.path?.split('/')[1];
      if (!cid) continue;
      const r = byCompany.get(cid) || { total: 0, online: 0 };
      r.total += 1;
      if (!['offline', 'warn', 'idle'].includes(screenStatus(s, now).key)) r.online += 1;
      byCompany.set(cid, r);
    }
    return (companies || []).map((c) => {
      const lic = licenseState(c, now);
      const sc = byCompany.get(c.id) || { total: 0, online: 0 };
      return { ...c, lic, screensTotal: sc.total, screensOnline: sc.online, due: lic.status === 'trial' ? c.trialEndsAt : c.paidUntil };
    }).sort((a, b) => Number(b.lic.blocked) - Number(a.lic.blocked) || Number(b.lic.warn) - Number(a.lic.warn) || (a.name || '').localeCompare(b.name || ''));
  }, [companies, screens, now]);

  const shown = rows.filter((r) => {
    if (q && !`${r.name} ${r.city || ''} ${r.ownerEmail || ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === 'active') return r.lic.status === 'active' && !r.lic.blocked;
    if (filter === 'trial') return r.lic.status === 'trial' && !r.lic.blocked;
    if (filter === 'attention') return r.lic.warn && !r.lic.blocked;
    if (filter === 'blocked') return r.lic.blocked;
    return true;
  });

  const paying = rows.filter((r) => r.lic.status === 'active' && !r.lic.blocked);
  const mrr = paying.reduce((a, r) => a + (Number(r.monthlyPrice) || 0), 0);
  const totalScreens = rows.reduce((a, r) => a + r.screensTotal, 0);
  const onlineScreens = rows.reduce((a, r) => a + r.screensOnline, 0);

  if (!companies) return <Loading />;
  // Indique e ganhe: código de cada empresa → nome (para mostrar quem indicou quem).
  const byCode = new Map(companies.map((c) => [referralCode(c.id), c.name]));
  return (
    <div className="vx-page">
      <PageHeader overline="VETTA SISTEMAS" title="Clientes" subtitle="Planos, vencimentos e situação de todas as empresas que usam o Vértice."
        actions={<>
          <Button icon="edit" onClick={() => setEditingSettings(true)}>Configurações</Button>
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>Novo cliente</Button>
        </>} />
      <div className="vx-grid-4">
        <MetricCard icon="building" label="Clientes pagantes" value={paying.length} dot="online" note={`${rows.filter((r) => r.lic.status === 'trial' && !r.lic.blocked).length} em teste grátis`} />
        <MetricCard icon="wallet" label="Receita mensal" value={money(mrr)} dot="online" note="Soma das mensalidades ativas" />
        <MetricCard icon="alert" label="Precisam de atenção" value={rows.filter((r) => r.lic.warn).length} dot={rows.some((r) => r.lic.blocked) ? 'offline' : 'warn'} note={`${rows.filter((r) => r.lic.blocked).length} bloqueados`} />
        <MetricCard icon="screen" label="Telas" value={onlineScreens} total={totalScreens} bar={totalScreens ? (onlineScreens / totalScreens) * 100 : 0} dot="online" note="online agora" />
      </div>
      <Card pad={false}>
        <div className="vx-console-filters" style={{ padding: 'var(--space-4) var(--space-5)' }}>
          <input className="vx-input" placeholder="Buscar cliente, cidade ou e-mail" aria-label="Buscar cliente" value={q} onChange={(e) => setQ(e.target.value)} />
          <Segmented options={FILTERS} value={filter} onChange={setFilter} />
        </div>
        <Table rows={shown} onRowClick={(r) => setOpen(r.id)} empty={<EmptyState icon="building" title={rows.length ? 'Nenhum cliente neste filtro' : 'Nenhum cliente ainda'}>Use “Novo cliente” para cadastrar uma empresa e convidar o dono.</EmptyState>}
          columns={[
            { key: 'name', label: 'Cliente', render: (r) => <span className="vx-client-name"><b>{r.name}</b><small>{[r.city, r.ownerEmail, r.referredBy ? `indicado por ${byCode.get(r.referredBy) || r.referredBy}${r.referralRewarded ? ' (premiado)' : ''}` : null].filter(Boolean).join(' · ') || '—'}</small></span> },
            { key: 'plan', label: 'Plano', render: (r) => PLANS[r.plan]?.name || r.plan || '—' },
            { key: 'lic', label: 'Situação', render: (r) => <StatusBadge status={r.lic.tone}>{licLabel(r.lic)}</StatusBadge> },
            { key: 'due', label: 'Vence', render: (r) => <span title={r.lic.title}>{day(r.due)}{r.lic.overdue && !r.lic.blocked ? ' (vencido)' : ''}</span> },
            { key: 'screens', label: 'Telas', render: (r) => `${r.screensOnline} on / ${r.screensTotal} de ${r.screenLimit || '—'}` },
            { key: 'storage', label: 'Mídias', render: (r) => formatBytes(r.storageUsedBytes || 0) },
            { key: 'price', label: 'Mensalidade', align: 'right', render: (r) => money(r.monthlyPrice) },
          ]} />
      </Card>
      <StoreAdmin />
      {open && <ClientModal company={rows.find((r) => r.id === open)} onClose={() => setOpen(null)} settings={settings} />}
      {creating && <NewClientModal onClose={() => setCreating(false)} settings={settings} onCreated={(id) => { setCreating(false); setOpen(id); }} />}
      {editingSettings && <SettingsModal settings={settings} onClose={() => setEditingSettings(false)} />}
    </div>
  );
}

function ClientModal({ company: c, onClose, settings }) {
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const base = `companies/${c.id}`;
  const members = useCol(`${base}/members`);
  const payments = useCol(`${base}/payments`, { orderBy: ['paidAt', 'desc'], limit: 24 });
  const [f, setF] = useState(() => ({
    name: c.name || '', city: c.city || '', phone: c.phone || '', ownerEmail: c.ownerEmail || '', notes: c.notes || '',
    plan: c.plan || 'start', screenLimit: String(c.screenLimit || PLANS.start.screens), storageGB: String(Math.round((c.storageQuotaMB || 2048) / 1024)),
    monthlyPrice: c.monthlyPrice ? String(c.monthlyPrice).replace('.', ',') : '', status: c.status || 'active',
    trialEndsAt: toInput(c.trialEndsAt), paidUntil: toInput(c.paidUntil), graceDays: String(c.graceDays ?? settings.graceDays ?? DEFAULT_GRACE_DAYS),
  }));
  const [busy, setBusy] = useState('');
  const [paying, setPaying] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const price = (v) => Number(String(v).replace(/\./g, '').replace(',', '.')) || 0;

  const save = async () => {
    setBusy('save');
    try {
      await api.update(base, {
        name: f.name.trim(), city: f.city.trim(), phone: f.phone.trim(), ownerEmail: f.ownerEmail.trim().toLowerCase(), notes: f.notes.trim(),
        plan: f.plan, screenLimit: Number(f.screenLimit) || 1, storageQuotaMB: (Number(f.storageGB) || 1) * 1024,
        monthlyPrice: price(f.monthlyPrice), status: f.status, graceDays: Number(f.graceDays) || 0,
        trialEndsAt: f.trialEndsAt ? new Date(fromInput(f.trialEndsAt)) : api.DELETE,
        paidUntil: f.paidUntil ? new Date(fromInput(f.paidUntil)) : api.DELETE,
      });
      toast('Cliente salvo.');
    } catch (e) { toast(e.message, 'offline'); } finally { setBusy(''); }
  };
  const setStatus = async (status) => {
    const blocking = status === 'suspended' || status === 'canceled';
    if (blocking && !(await confirm({ title: `${status === 'suspended' ? 'Suspender' : 'Cancelar'} ${c.name}?`, message: 'As telas do cliente param na próxima conexão e o painel deixa de publicar. Nada é apagado.', confirmLabel: status === 'suspended' ? 'Suspender' : 'Cancelar assinatura', danger: true }))) return;
    setBusy(status);
    try { await api.update(base, { status }); set({ status }); toast(blocking ? 'Cliente bloqueado.' : 'Cliente reativado.'); } catch (e) { toast(e.message, 'offline'); } finally { setBusy(''); }
  };
  const recount = async () => {
    setBusy('recount');
    try {
      const n = (await api.getCol(`${base}/screens`)).length;
      await api.update(base, { screenCount: n });
      toast(`Contagem corrigida: ${n} telas.`);
    } catch (e) { toast(e.message, 'offline'); } finally { setBusy(''); }
  };

  const plan = PLANS[f.plan];
  return (
    <Modal open onClose={onClose} title={c.name} subtitle={`${c.lic.title}${c.lic.text ? `. ${c.lic.text}` : ''}`} icon="building" width={760}
      footer={<>
        {c.lic.status === 'suspended' || c.lic.status === 'canceled'
          ? <Button loading={busy === 'active'} onClick={() => setStatus('active')} icon="check">Reativar</Button>
          : <Button variant="danger" loading={busy === 'suspended'} onClick={() => setStatus('suspended')} icon="xCircle">Suspender</Button>}
        <span style={{ flex: 1 }} />
        <Button onClick={() => setPaying(true)} icon="wallet">Registrar pagamento</Button>
        <Button variant="primary" loading={busy === 'save'} onClick={save}>Salvar</Button>
      </>}>
      <div className="vx-form">
        <div className="vx-form-row">
          <Input label="Empresa" value={f.name} onChange={(e) => set({ name: e.target.value })} />
          <Input label="Cidade" value={f.city} onChange={(e) => set({ city: e.target.value })} />
        </div>
        <div className="vx-form-row">
          <Input label="E-mail do dono" value={f.ownerEmail} onChange={(e) => set({ ownerEmail: e.target.value })} help="Recebe os avisos de vencimento." />
          <Input label="Telefone" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
        </div>
        <div className="vx-form-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Select label="Plano" value={f.plan} options={PLAN_OPTIONS} onChange={(e) => { const p = PLANS[e.target.value]; set({ plan: e.target.value, screenLimit: String(p.screens), storageGB: String(p.storageMB / 1024) }); }} />
          <Input label="Telas" type="number" min={1} value={f.screenLimit} onChange={(e) => set({ screenLimit: e.target.value })} help={plan && Number(f.screenLimit) !== plan.screens ? `Plano: ${plan.screens}` : `${c.screenCount ?? '?'} em uso`} />
          <Input label="Mídias (GB)" type="number" min={1} value={f.storageGB} onChange={(e) => set({ storageGB: e.target.value })} help={`${formatBytes(c.storageUsedBytes || 0)} em uso`} />
          <Input label="Mensalidade (R$)" inputMode="decimal" value={f.monthlyPrice} onChange={(e) => set({ monthlyPrice: e.target.value })} placeholder="189,90" />
        </div>
        <div className="vx-form-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Select label="Situação" value={f.status} options={LICENSE_STATUS.map((s) => ({ value: s, label: LICENSE_LABEL[s] }))} onChange={(e) => set({ status: e.target.value })} />
          {f.status === 'trial'
            ? <Input label="Teste até" type="date" value={f.trialEndsAt} onChange={(e) => set({ trialEndsAt: e.target.value })} />
            : <Input label="Pago até" type="date" value={f.paidUntil} onChange={(e) => set({ paidUntil: e.target.value })} help="Vazio = sem vencimento (cortesia)." />}
          <Input label="Tolerância (dias)" type="number" min={0} max={60} value={f.graceDays} onChange={(e) => set({ graceDays: e.target.value })} help="Depois do vencimento, antes de bloquear." />
        </div>
        <Field2 label="Anotações internas">
          <textarea className="vx-input" rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Ex.: cobrança dia 10 por Pix, contato com o gerente Marcos." />
        </Field2>

        <div>
          <h3 className="vx-card-title" style={{ marginBottom: 8 }}>Pagamentos</h3>
          {!payments ? <Loading /> : payments.length ? (
            <Table rows={payments} columns={[
              { key: 'paidAt', label: 'Pago em', render: (p) => day(p.paidAt) },
              { key: 'amount', label: 'Valor', render: (p) => money(p.amount) },
              { key: 'method', label: 'Forma' },
              { key: 'months', label: 'Meses' },
              { key: 'paidUntil', label: 'Cobre até', render: (p) => day(p.paidUntil) },
            ]} />
          ) : <p className="vx-help">Nenhum pagamento registrado.</p>}
        </div>

        <div>
          <h3 className="vx-card-title" style={{ marginBottom: 8 }}>Acessos</h3>
          {!members ? <Loading /> : members.length ? (
            <Table rows={members} columns={[
              { key: 'name', label: 'Nome' }, { key: 'email', label: 'E-mail' }, { key: 'role', label: 'Papel', render: (m) => ROLE_LABEL[m.role] || m.role },
            ]} />
          ) : <p className="vx-help">Ninguém entrou ainda. O dono entra criando a conta com o e-mail do convite ({c.ownerEmail || 'sem e-mail'}).</p>}
          <div style={{ marginTop: 8 }}><Button size="sm" variant="ghost" loading={busy === 'recount'} onClick={recount} icon="sync">Recontar telas</Button></div>
        </div>
      </div>
      {paying && <PaymentModal company={c} onClose={() => setPaying(false)} onDone={(paidUntil) => { set({ status: 'active', paidUntil: toInput(paidUntil) }); setPaying(false); }} />}
      {confirmDialog}
    </Modal>
  );
}

function Field2({ label, children }) {
  return <div className="vx-field"><span className="vx-label">{label}</span>{children}</div>;
}

function PaymentModal({ company: c, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ amount: c.monthlyPrice ? String(c.monthlyPrice).replace('.', ',') : '', months: '1', method: 'Pix', paidAt: toInput(Date.now()) });
  const [busy, setBusy] = useState(false);
  const months = Number(f.months) || 1;
  const until = nextPaidUntil(c, months);
  const save = async () => {
    setBusy(true);
    try {
      const amount = Number(String(f.amount).replace(/\./g, '').replace(',', '.')) || 0;
      const id = api.newId(`companies/${c.id}/payments`);
      await api.batch([
        { op: 'set', path: `companies/${c.id}/payments/${id}`, data: { amount, months, method: f.method, paidAt: new Date(fromInput(f.paidAt) - 12 * 3600000), paidUntil: new Date(until), by: 'Vetta Sistemas', createdAt: api.NOW } },
        { op: 'update', path: `companies/${c.id}`, data: { status: 'active', paidUntil: new Date(until) } },
      ]);
      toast(`Pagamento registrado. Pago até ${day(until)}.`);
      onDone(until);
    } catch (e) { toast(e.message, 'offline'); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Registrar pagamento" subtitle={c.name} icon="wallet" width={480}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} onClick={save}>Registrar</Button></>}>
      <div className="vx-form">
        <div className="vx-form-row">
          <Input label="Valor (R$)" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <Select label="Meses" value={f.months} onChange={(e) => setF({ ...f, months: e.target.value })} options={[1, 2, 3, 6, 12].map((m) => ({ value: String(m), label: m === 1 ? '1 mês' : `${m} meses` }))} />
        </div>
        <div className="vx-form-row">
          <Select label="Forma" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} options={['Pix', 'Boleto', 'Cartão', 'Transferência', 'Dinheiro'].map((m) => ({ value: m, label: m }))} />
          <Input label="Pago em" type="date" value={f.paidAt} onChange={(e) => setF({ ...f, paidAt: e.target.value })} />
        </div>
        <div className="vx-callout"><Icon name="check" /><div><b>Novo vencimento: {day(until)}</b><p>O cliente volta para “Ativo” e as telas voltam na próxima conexão.</p></div></div>
      </div>
    </Modal>
  );
}

function NewClientModal({ onClose, onCreated, settings }) {
  const toast = useToast();
  const trialDays = settings.trialDays || DEFAULT_TRIAL_DAYS;
  const [f, setF] = useState({ name: '', city: '', ownerEmail: '', phone: '', plan: 'start', monthlyPrice: '', start: 'trial', paidUntil: toInput(Date.now() + 30 * DAY) });
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const email = f.ownerEmail.trim().toLowerCase();
  const ok = f.name.trim().length > 1 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const save = async () => {
    setBusy(true);
    try {
      const p = PLANS[f.plan];
      const id = api.newId('companies');
      const lic = f.start === 'trial'
        ? { status: 'trial', trialEndsAt: new Date(Date.now() + trialDays * DAY) }
        : { status: 'active', paidUntil: new Date(fromInput(f.paidUntil)) };
      await api.batch([
        { op: 'set', path: `companies/${id}`, data: {
          name: f.name.trim(), city: f.city.trim(), phone: f.phone.trim(), ownerUid: null, ownerEmail: email,
          plan: f.plan, screenLimit: p.screens, storageQuotaMB: p.storageMB, storageUsedBytes: 0, screenSeq: 0, screenCount: 0,
          monthlyPrice: Number(String(f.monthlyPrice).replace(/\./g, '').replace(',', '.')) || 0,
          graceDays: settings.graceDays ?? DEFAULT_GRACE_DAYS, source: 'vetta', createdAt: api.NOW, ...lic,
        } },
        { op: 'set', path: `invites/${email}`, data: { companyId: id, companyName: f.name.trim(), role: 'owner', invitedAt: api.NOW, invitedBy: 'Vetta Sistemas' } },
      ]);
      toast('Cliente criado. O dono entra criando a conta com o e-mail informado.');
      onCreated(id);
    } catch (e) { toast(e.message, 'offline'); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Novo cliente" subtitle="Cria a empresa e convida o dono. Ele entra no painel criando a conta com este e-mail." icon="plus" width={620}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!ok} onClick={save}>Criar cliente</Button></>}>
      <div className="vx-form">
        <div className="vx-form-row">
          <Input label="Empresa" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Mercado Bom Preço" />
          <Input label="Cidade" value={f.city} onChange={(e) => set({ city: e.target.value })} />
        </div>
        <div className="vx-form-row">
          <Input label="E-mail do dono" type="email" value={f.ownerEmail} onChange={(e) => set({ ownerEmail: e.target.value })} />
          <Input label="Telefone" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
        </div>
        <div className="vx-form-row">
          <Select label="Plano" value={f.plan} options={PLAN_OPTIONS} onChange={(e) => set({ plan: e.target.value })} />
          <Input label="Mensalidade (R$)" inputMode="decimal" value={f.monthlyPrice} onChange={(e) => set({ monthlyPrice: e.target.value })} placeholder="189,90" />
        </div>
        <Segmented label="Começa" value={f.start} onChange={(v) => set({ start: v })} options={[{ value: 'trial', label: `Teste de ${trialDays} dias` }, { value: 'active', label: 'Já contratado' }]} />
        {f.start === 'active' && <Input label="Pago até" type="date" value={f.paidUntil} onChange={(e) => set({ paidUntil: e.target.value })} />}
      </div>
    </Modal>
  );
}

function SettingsModal({ settings, onClose }) {
  const toast = useToast();
  const [f, setF] = useState({
    signupOpen: settings.signupOpen ?? true, trialDays: String(settings.trialDays || DEFAULT_TRIAL_DAYS), graceDays: String(settings.graceDays ?? DEFAULT_GRACE_DAYS),
    supportWhatsApp: settings.supportWhatsApp || '', supportEmail: settings.supportEmail || '',
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.set('platform/settings', {
        signupOpen: f.signupOpen, trialDays: Math.max(1, Math.min(60, Number(f.trialDays) || DEFAULT_TRIAL_DAYS)), graceDays: Number(f.graceDays) || 0,
        supportWhatsApp: f.supportWhatsApp.replace(/\D/g, ''), supportEmail: f.supportEmail.trim(),
      }, true);
      toast('Configurações salvas.');
      onClose();
    } catch (e) { toast(e.message, 'offline'); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Configurações da plataforma" icon="edit" width={560}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} onClick={save}>Salvar</Button></>}>
      <div className="vx-form">
        <Toggle label="Cadastro aberto com teste grátis" help="Desligado, só entra quem a Vetta cadastrar (ou quem for convidado por um cliente)." checked={f.signupOpen} onChange={(v) => setF({ ...f, signupOpen: v })} />
        <div className="vx-form-row">
          <Input label="Dias de teste grátis" type="number" min={1} max={60} value={f.trialDays} onChange={(e) => setF({ ...f, trialDays: e.target.value })} />
          <Input label="Tolerância padrão (dias)" type="number" min={0} max={60} value={f.graceDays} onChange={(e) => setF({ ...f, graceDays: e.target.value })} help="Para clientes novos." />
        </div>
        <div className="vx-form-row">
          <Input label="WhatsApp comercial" value={f.supportWhatsApp} onChange={(e) => setF({ ...f, supportWhatsApp: e.target.value })} placeholder="5581999990000" help="Com DDI. Aparece no painel dos clientes." />
          <Input label="E-mail de contato" value={f.supportEmail} onChange={(e) => setF({ ...f, supportEmail: e.target.value })} />
        </div>
      </div>
    </Modal>
  );
}
