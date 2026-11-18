import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LEAD_STAGES, LEAD_SOURCES, pipelineTotals, followUpsDue, formatMoney, parsePrice } from '@vertice/shared';
import { useSession } from '../session.jsx';
import { useCol } from '../data/hooks.js';
import { api } from '../data/api.js';
import { PageHeader, Button, Card, Loading, EmptyState, Modal, Input, Select, useToast, useConfirm } from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

const STAGE_LABEL = Object.fromEntries(LEAD_STAGES);
const today = () => new Date().toISOString().slice(0, 10);
const waLink = (phone, text) => `https://wa.me/${String(phone || '').replace(/\D/g, '').replace(/^(?!55)/, '55')}?text=${encodeURIComponent(text)}`;

/**
 * CRM: o funil de quem pode anunciar nas telas (ou virar cliente). Cada contato tem etapa,
 * valor mensal, próxima ação e histórico de notas. Fechou, vira anunciante.
 */
export function Crm() {
  const { base, can, company } = useSession();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const leads = useCol(`${base}/leads`, { orderBy: ['updatedAt', 'desc'] });
  const [edit, setEdit] = useState(null);
  const totals = useMemo(() => pipelineTotals(leads || []), [leads]);
  const due = useMemo(() => followUpsDue(leads || []), [leads]);
  if (!leads) return <Loading />;

  const move = async (l, stage) => {
    await api.update(`${base}/leads/${l.id}`, { stage, updatedAt: api.NOW });
    if (stage === 'ganho') toast(`${l.name} fechado! Cadastre em Anunciantes para acompanhar as exibições.`);
  };
  const save = async (l) => {
    const data = {
      name: l.name.trim(), contact: (l.contact || '').trim(), phone: (l.phone || '').trim(), email: (l.email || '').trim(),
      source: l.source || '', stage: l.stage || 'novo', value: parsePrice(l.value) || 0, nextAt: l.nextAt || '', next: (l.next || '').trim(),
      notes: (l.notes || '').slice(0, 2000), updatedAt: api.NOW,
    };
    if (l.id) await api.update(`${base}/leads/${l.id}`, data);
    else await api.add(`${base}/leads`, { ...data, createdAt: api.NOW });
    toast(l.id ? 'Contato salvo.' : 'Contato criado.');
    setEdit(null);
  };
  const remove = async (l) => {
    if (!(await confirm({ title: `Excluir ${l.name}?`, message: 'O contato e as notas saem do CRM.', confirmLabel: 'Excluir', danger: true }))) return;
    await api.remove(`${base}/leads/${l.id}`);
    setEdit(null);
  };

  return (
    <div className="vx-page">
      <PageHeader overline="COMERCIAL" title="CRM" subtitle="Quem pode anunciar nas suas telas: etapas, valores e o próximo passo de cada conversa."
        actions={can('editor') && <Button variant="primary" icon="plus" onClick={() => setEdit({ stage: 'novo', source: 'Visita' })}>Novo contato</Button>} />

      <div className="vx-crm-stats">
        <Card><span className="vx-faint">Em negociação</span><b className="vx-num vx-crm-big">{totals.open}</b></Card>
        <Card><span className="vx-faint">Valor em aberto (mês)</span><b className="vx-num vx-crm-big">R$ {formatMoney(['novo', 'conversa', 'proposta', 'negociacao'].reduce((a, k) => a + totals.by[k].value, 0))}</b></Card>
        <Card><span className="vx-faint">Fechados (mês)</span><b className="vx-num vx-crm-big">R$ {formatMoney(totals.by.ganho.value)}</b></Card>
        <Card><span className="vx-faint">Taxa de fechamento</span><b className="vx-num vx-crm-big">{totals.winRate == null ? '—' : `${totals.winRate}%`}</b></Card>
      </div>

      {due.length > 0 && (
        <Card title="Retornos de hoje" icon="bell">
          <div className="vx-crm-due">
            {due.map((l) => (
              <div key={l.id} className="vx-crm-due-row">
                <button type="button" className="vx-link" onClick={() => setEdit(l)}><b>{l.name}</b></button>
                <span className="vx-faint">{l.next || 'Retornar contato'}{l.nextAt < today() ? ` · atrasado desde ${l.nextAt.split('-').reverse().join('/')}` : ''}</span>
                {l.phone && <a className="vx-btn vx-btn-sm" href={waLink(l.phone, `Olá ${l.contact || ''}! Aqui é da ${company?.name || 'nossa empresa'}, sobre as telas de anúncio.`)} target="_blank" rel="noreferrer"><Icon name="phone" />WhatsApp</a>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {leads.length ? (
        <div className="vx-crm-board">
          {LEAD_STAGES.map(([stage, label]) => {
            const col = leads.filter((l) => (l.stage || 'novo') === stage);
            return (
              <section key={stage} className={`vx-crm-col is-${stage}`} aria-label={label}>
                <header><b>{label}</b><span className="vx-num">{col.length}{totals.by[stage].value ? ` · R$ ${formatMoney(totals.by[stage].value)}` : ''}</span></header>
                {col.map((l) => (
                  <article key={l.id} className="vx-crm-card">
                    <button type="button" className="vx-crm-card-main" onClick={() => setEdit(l)}>
                      <b>{l.name}</b>
                      {l.contact && <span className="vx-faint">{l.contact}</span>}
                      {l.value > 0 && <span className="vx-num">R$ {formatMoney(l.value)}/mês</span>}
                      {l.nextAt && <span className={`vx-crm-next ${l.nextAt <= today() ? 'is-due' : ''}`}><Icon name="calendar" />{l.nextAt.split('-').reverse().join('/')}{l.next ? ` · ${l.next}` : ''}</span>}
                    </button>
                    {can('editor') && (
                      <select className="vx-crm-move" value={stage} aria-label={`Mudar etapa de ${l.name}`} onChange={(e) => move(l, e.target.value)}>
                        {LEAD_STAGES.map(([k, lb]) => <option key={k} value={k}>{lb}</option>)}
                      </select>
                    )}
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState icon="funnel" title="Nenhum contato ainda" action={can('editor') && <Button variant="primary" icon="plus" onClick={() => setEdit({ stage: 'novo', source: 'Visita' })}>Novo contato</Button>}>
            Anote cada comércio que pode anunciar nas suas telas. O funil mostra quanto está em negociação e quem precisa de retorno hoje.
          </EmptyState>
        </Card>
      )}

      {edit && <LeadEditor value={edit} onChange={setEdit} onClose={() => setEdit(null)} onSave={save} onRemove={edit.id && can('editor') ? () => remove(edit) : null} />}
      {confirmDialog}
    </div>
  );
}

function LeadEditor({ value, onChange, onClose, onSave, onRemove }) {
  const [busy, setBusy] = useState(false);
  const set = (p) => onChange({ ...value, ...p });
  const submit = async () => { setBusy(true); try { await onSave(value); } finally { setBusy(false); } };
  return (
    <Modal open onClose={onClose} width={720} icon="funnel" title={value.id ? value.name : 'Novo contato'}
      footer={<>
        {onRemove && <Button variant="ghost" icon="trash" onClick={onRemove}>Excluir</Button>}
        <span style={{ flex: 1 }} />
        {value.stage === 'proposta' && <Link className="vx-btn" to="/midia-indoor"><Icon name="file" />Montar proposta</Link>}
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={busy} disabled={!String(value.name || '').trim()} onClick={submit}>Salvar</Button>
      </>}>
      <div className="vx-form">
        <div className="vx-form-row">
          <Input label="Empresa" value={value.name || ''} maxLength={60} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Farmácia Central" />
          <Input label="Pessoa de contato" value={value.contact || ''} maxLength={60} onChange={(e) => set({ contact: e.target.value })} />
        </div>
        <div className="vx-form-row">
          <Input label="WhatsApp" value={value.phone || ''} maxLength={20} inputMode="tel" onChange={(e) => set({ phone: e.target.value })} placeholder="(81) 9…" />
          <Input label="E-mail" value={value.email || ''} maxLength={80} type="email" onChange={(e) => set({ email: e.target.value })} />
        </div>
        <div className="vx-form-row">
          <Select label="Etapa" value={value.stage || 'novo'} onChange={(e) => set({ stage: e.target.value })} options={LEAD_STAGES.map(([v, l]) => ({ value: v, label: l }))} />
          <Select label="Origem" value={value.source || ''} onChange={(e) => set({ source: e.target.value })} options={[{ value: '', label: '—' }, ...LEAD_SOURCES.map((s) => ({ value: s, label: s }))]} />
          <Input label="Valor por mês (R$)" inputMode="decimal" value={value.value ?? ''} onChange={(e) => set({ value: e.target.value })} />
        </div>
        <div className="vx-form-row">
          <Input label="Próximo retorno" type="date" value={value.nextAt || ''} onChange={(e) => set({ nextAt: e.target.value })} />
          <Input label="O que fazer" value={value.next || ''} maxLength={80} onChange={(e) => set({ next: e.target.value })} placeholder="Ex.: Mandar a proposta" />
        </div>
        <label className="vx-field">
          <span className="vx-label">Notas</span>
          <textarea className="vx-input vx-textarea" rows={5} maxLength={2000} value={value.notes || ''} onChange={(e) => set({ notes: e.target.value })} placeholder="O que foi conversado, objeções, horários das telas que interessam…" />
        </label>
        {value.stage && STAGE_LABEL[value.stage] && value.stage === 'ganho' && <p className="vx-help">Fechou! Cadastre em <Link to="/anunciantes">Anunciantes</Link> para mandar o relatório de exibições.</p>}
      </div>
    </Modal>
  );
}

