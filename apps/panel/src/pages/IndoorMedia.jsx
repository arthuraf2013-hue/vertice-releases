import { useMemo, useState } from 'react';
import {
  normalizeCatalog, publicCatalog, proposalTotals, PROPOSAL_STATUS, catalogLink, CATALOG_DEFAULTS, formatMoney, formatDateTime, localISODate,
} from '@vertice/shared';
import { useSession } from '../session.jsx';
import { useCol } from '../data/hooks.js';
import { api } from '../data/api.js';
import { siteBase } from '../data/site.js';
import {
  PageHeader, Button, Card, Loading, EmptyState, useToast, useConfirm, Modal, Input, Select, Toggle, Tabs, PillGroup, IconButton, StatusBadge,
} from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

const num = (n) => Number(n || 0).toLocaleString('pt-BR');
const brDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

/**
 * Mídia indoor: vender espaço nas telas. Catálogo público (pontos, público e pacotes) e
 * propostas com as contas prontas, que viram anunciante quando o cliente aceita.
 */
export function IndoorMedia() {
  const [tab, setTab] = useState('propostas');
  return (
    <div className="vx-page">
      <PageHeader overline="COMERCIAL" title="Mídia indoor" subtitle="Venda espaço nas suas telas: catálogo para anunciantes e propostas com inserções e alcance calculados." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'propostas', label: 'Propostas' }, { id: 'catalogo', label: 'Catálogo público' }]} />
      {tab === 'propostas' ? <Proposals /> : <Catalog />}
    </div>
  );
}

function Catalog() {
  const { base, company, companyId, units, can } = useSession();
  const toast = useToast();
  const screens = useCol(`${base}/screens`);
  const [f, setF] = useState(() => normalizeCatalog(company.catalog || CATALOG_DEFAULTS));
  const [busy, setBusy] = useState(false);
  if (!screens) return <Loading />;
  const pub = publicCatalog({ company, units, screens, settings: f });
  const link = catalogLink(siteBase(), companyId);
  const setPack = (i, p) => setF({ ...f, packages: f.packages.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const save = async () => {
    setBusy(true);
    try {
      const settings = normalizeCatalog(f);
      await api.update(base, { catalog: settings });
      await api.set(`publicCatalogs/${companyId}`, { ...publicCatalog({ company, units, screens, settings }), updatedAt: api.NOW });
      toast(settings.enabled ? 'Catálogo publicado.' : 'Catálogo salvo e tirado do ar.');
    } finally { setBusy(false); }
  };
  return (
    <div className="vx-app-editor">
      <Card title="Catálogo" icon="building">
        <fieldset className="vx-form" disabled={!can('admin')}>
          <Toggle label="Página pública ligada" help="Qualquer pessoa com o link vê os pontos, o público estimado e os pacotes. Nada interno aparece." checked={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} />
          <Input label="Título" value={f.title} maxLength={80} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <label className="vx-field"><span className="vx-label">Apresentação</span><textarea className="vx-input vx-textarea" rows={3} maxLength={300} value={f.intro} onChange={(e) => setF({ ...f, intro: e.target.value })} /></label>
          <Input label="WhatsApp comercial (com DDD)" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} placeholder="81 99999-0000" help="O botão da página abre uma conversa já com a mensagem pronta." />
          <div className="vx-field">
            <span className="vx-label">Pacotes</span>
            <div className="vx-pack-list">
              {f.packages.map((p, i) => (
                <div key={i} className="vx-pack-row">
                  <input className="vx-input vx-input-sm" value={p.name} placeholder="Nome" maxLength={30} onChange={(e) => setPack(i, { name: e.target.value })} aria-label="Nome do pacote" />
                  <label><input className="vx-input vx-input-sm" type="number" min={5} max={120} value={p.seconds} onChange={(e) => setPack(i, { seconds: e.target.value })} /> s</label>
                  <label><input className="vx-input vx-input-sm" type="number" min={1} value={p.insertionsPerDay} onChange={(e) => setPack(i, { insertionsPerDay: e.target.value })} /> por dia</label>
                  <label><input className="vx-input vx-input-sm" type="number" min={1} max={366} value={p.days} onChange={(e) => setPack(i, { days: e.target.value })} /> dias</label>
                  <label>R$ <input className="vx-input vx-input-sm" type="number" min={0} step="0.01" value={p.price} onChange={(e) => setPack(i, { price: e.target.value })} /></label>
                  <IconButton icon="trash" label="Remover pacote" variant="danger" onClick={() => setF({ ...f, packages: f.packages.filter((_, j) => j !== i) })} />
                </div>
              ))}
              {f.packages.length < 6 && <Button size="sm" icon="plus" onClick={() => setF({ ...f, packages: [...f.packages, { name: '', seconds: 15, insertionsPerDay: 60, days: 30, price: 0 }] })}>Adicionar pacote</Button>}
            </div>
          </div>
          {can('admin') && <div className="vx-row-actions"><Button variant="primary" loading={busy} onClick={save}>{f.enabled ? 'Salvar e publicar' : 'Salvar'}</Button></div>}
        </fieldset>
      </Card>
      <div className="vx-app-preview">
        <Card title="O que aparece na página" icon="eye" iconTone="neutral">
          <div className="vx-cat-sum">
            <div><b className="vx-num">{pub.totalScreens}</b><span>telas</span></div>
            <div><b className="vx-num">{pub.points.length}</b><span>pontos</span></div>
            <div><b className="vx-num">{num(pub.totalAudience)}</b><span>pessoas/dia</span></div>
          </div>
          <ul className="vx-cat-points">
            {pub.points.map((p) => <li key={p.id}><b>{p.name}</b><span className="vx-faint">{p.screens} telas{p.audience ? ` · ${num(p.audience)}/dia` : ''}</span></li>)}
            {!pub.points.length && <li className="vx-faint">Nenhuma unidade com tela e marcada para o catálogo. Ajuste em Telas › Unidades.</li>}
          </ul>
          <div className="vx-comments-link"><code>{link}</code><a className="vx-icon-btn" href={company.catalog?.enabled ? link : `${link}&demo=1`} target="_blank" rel="noreferrer" aria-label="Abrir a página do catálogo"><Icon name="link" /></a></div>
          <p className="vx-help">O público por dia é a estimativa que você informa em cada unidade. As exibições de verdade ficam em Relatórios.</p>
        </Card>
      </div>
    </div>
  );
}

function Proposals() {
  const { base, units, can } = useSession();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const proposals = useCol(`${base}/proposals`, { orderBy: ['createdAt', 'desc'] });
  const screens = useCol(`${base}/screens`);
  const [edit, setEdit] = useState(null);
  const { company } = useSession();
  if (!proposals || !screens) return <Loading />;
  const packages = normalizeCatalog(company.catalog || CATALOG_DEFAULTS).packages;
  const today = localISODate(new Date());
  const blank = () => {
    const p = packages[0] || { seconds: 15, insertionsPerDay: 60, days: 30, price: 0 };
    const end = new Date(); end.setDate(end.getDate() + p.days - 1);
    return { client: '', contact: '', phone: '', email: '', unitIds: units.map((u) => u.id), packageName: p.name || '', seconds: p.seconds, insertionsPerDay: p.insertionsPerDay, start: today, end: localISODate(end), price: p.price, discount: 0, status: 'draft', notes: '' };
  };
  const toAdvertiser = async (p) => {
    if (!(await confirm({ title: `Cadastrar "${p.client}" como anunciante?`, message: `O contrato fica de ${brDate(p.start)} a ${brDate(p.end)}. Depois é só marcar as mídias dele em Mídias.`, confirmLabel: 'Cadastrar' }))) return;
    const id = await api.add(`${base}/advertisers`, { name: p.client, contact: p.contact || '', phone: p.phone || '', email: p.email || '', contractFrom: p.start, contractTo: p.end, notes: `Proposta de ${formatDateTime(p.createdAt)}`, createdAt: api.NOW });
    await api.update(`${base}/proposals/${p.id}`, { status: 'accepted', advertiserId: id, updatedAt: api.NOW });
    toast('Anunciante cadastrado. Marque as mídias dele em Mídias.');
  };
  const total = (p) => proposalTotals(p, units, screens);
  return (
    <>
      <Card pad={false} title="Propostas" icon="receipt" actions={can('editor') && <Button size="sm" variant="primary" icon="plus" onClick={() => setEdit(blank())}>Nova proposta</Button>}>
        {proposals.length === 0 ? (
          <EmptyState icon="receipt" title="Nenhuma proposta ainda">Monte uma proposta com as lojas, o número de inserções e o período. O Vértice calcula as exibições e o alcance; você imprime ou manda em PDF.</EmptyState>
        ) : (
          <div className="vx-unit-list">
            {proposals.map((p) => {
              const t = total(p);
              const st = PROPOSAL_STATUS[p.status] || PROPOSAL_STATUS.draft;
              return (
                <div key={p.id} className="vx-unit-row">
                  <span className="vx-tile"><Icon name="receipt" /></span>
                  <div className="vx-app-row-text">
                    <b>{p.client}</b>
                    <span className="vx-faint">{brDate(p.start)} a {brDate(p.end)} · {t.screens} telas · {num(t.insertions)} exibições · {formatMoney(t.total)}</span>
                  </div>
                  <StatusBadge status={st.tone === 'muted' ? 'idle' : st.tone}>{st.label}</StatusBadge>
                  <div className="vx-row-actions">
                    <Button size="sm" icon="download" onClick={() => printProposal(p, t, company, units)}>PDF</Button>
                    {can('editor') && p.status !== 'accepted' && <Button size="sm" icon="check" onClick={() => toAdvertiser(p)}>Virar anunciante</Button>}
                    {can('editor') && <Button size="sm" icon="edit" onClick={() => setEdit({ ...p })}>Editar</Button>}
                    {can('editor') && <IconButton icon="trash" label="Excluir proposta" variant="danger" onClick={async () => { if (await confirm({ title: 'Excluir esta proposta?', confirmLabel: 'Excluir', danger: true })) api.remove(`${base}/proposals/${p.id}`); }} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      {edit && <ProposalEditor value={edit} packages={packages} units={units} screens={screens} onClose={() => setEdit(null)} onSaved={() => { toast('Proposta salva.'); setEdit(null); }} />}
      {confirmDialog}
    </>
  );
}

function ProposalEditor({ value, packages, units, screens, onClose, onSaved }) {
  const { base } = useSession();
  const [f, setF] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const t = useMemo(() => proposalTotals(f, units, screens), [f, units, screens]);
  const pickPackage = (name) => {
    const p = packages.find((x) => x.name === name);
    if (!p) return setF({ ...f, packageName: '' });
    const s = f.start ? new Date(`${f.start}T12:00`) : new Date();
    const end = new Date(s); end.setDate(end.getDate() + p.days - 1);
    setF({ ...f, packageName: p.name, seconds: p.seconds, insertionsPerDay: p.insertionsPerDay, price: p.price, end: localISODate(end) });
  };
  const save = async () => {
    if (!f.client.trim()) return setError('Escreva o nome do cliente.');
    if (!f.unitIds.length) return setError('Escolha pelo menos uma unidade.');
    if (!f.start || !f.end || f.end < f.start) return setError('Confira as datas.');
    setBusy(true);
    try {
      const data = { ...f, client: f.client.trim(), price: Number(f.price) || 0, discount: Number(f.discount) || 0, seconds: Number(f.seconds) || 15, insertionsPerDay: Number(f.insertionsPerDay) || 0, updatedAt: api.NOW };
      delete data.id;
      if (f.id) await api.update(`${base}/proposals/${f.id}`, data);
      else await api.add(`${base}/proposals`, { ...data, createdAt: api.NOW });
      onSaved();
    } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} width={980} icon="receipt" title={f.id ? 'Editar proposta' : 'Nova proposta'}
      footer={<>{error && <span className="vx-field-error vx-mr-auto"><Icon name="alert" />{error}</span>}<Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} onClick={save}>Salvar proposta</Button></>}>
      <div className="vx-app-editor">
        <div className="vx-form">
          <div className="vx-form-row">
            <Input label="Cliente (anunciante)" value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} placeholder="Ex.: Café Serra Azul" />
            <Select label="Situação" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={Object.entries(PROPOSAL_STATUS).map(([k, s]) => ({ value: k, label: s.label }))} />
          </div>
          <div className="vx-form-row">
            <Input label="Contato" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} />
            <Input label="Telefone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </div>
          <PillGroup label="Unidades" value={f.unitIds} onChange={(unitIds) => setF({ ...f, unitIds })} options={units.map((u) => ({ value: u.id, label: u.name }))} />
          {packages.length > 0 && <Select label="Pacote" value={f.packageName} onChange={(e) => pickPackage(e.target.value)} options={[{ value: '', label: 'Personalizado' }, ...packages.map((p) => ({ value: p.name, label: `${p.name} · ${formatMoney(p.price)}` }))]} />}
          <div className="vx-form-row">
            <Input label="Inserções por dia, por tela" type="number" min={1} value={f.insertionsPerDay} onChange={(e) => setF({ ...f, insertionsPerDay: e.target.value, packageName: '' })} />
            <Input label="Duração do anúncio (s)" type="number" min={5} max={120} value={f.seconds} onChange={(e) => setF({ ...f, seconds: e.target.value })} />
          </div>
          <div className="vx-form-row">
            <Input label="Início" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
            <Input label="Fim" type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
          </div>
          <div className="vx-form-row">
            <Input label="Valor (R$)" type="number" min={0} step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value, packageName: '' })} />
            <Input label="Desconto (R$)" type="number" min={0} step="0.01" value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} />
          </div>
          <label className="vx-field"><span className="vx-label">Observações</span><textarea className="vx-input vx-textarea" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
        </div>
        <div className="vx-app-preview">
          <Card title="Resumo" icon="chart" iconTone="neutral">
            <dl className="vx-prop-sum">
              <div><dt>Telas</dt><dd className="vx-num">{t.screens}</dd></div>
              <div><dt>Dias</dt><dd className="vx-num">{t.days}</dd></div>
              <div><dt>Exibições no período</dt><dd className="vx-num">{num(t.insertions)}</dd></div>
              <div><dt>Alcance estimado</dt><dd className="vx-num">{num(t.audience)}</dd></div>
              <div><dt>Valor</dt><dd className="vx-num">{formatMoney(t.gross)}</dd></div>
              {t.discount > 0 && <div><dt>Desconto</dt><dd className="vx-num">−{formatMoney(t.discount)}</dd></div>}
              <div className="is-total"><dt>Total</dt><dd className="vx-num">{formatMoney(t.total)}</dd></div>
              <div><dt>Por exibição</dt><dd className="vx-num">{formatMoney(t.perInsertion)}</dd></div>
            </dl>
            {t.insertions > 0 && Number(f.insertionsPerDay) * Number(f.seconds) > 3600 * 6 && <p className="vx-help vx-help-warn"><Icon name="alert" />Mais de 6 horas de anúncio por dia em cada tela. Confira se cabe na programação.</p>}
            <p className="vx-help">Alcance = pessoas por dia das unidades × dias. É estimativa; as exibições comprovadas saem em Relatórios › Anunciante.</p>
          </Card>
        </div>
      </div>
    </Modal>
  );
}

/** Proposta em página para imprimir ou salvar em PDF (pelo navegador). */
function printProposal(p, t, company, units) {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const names = units.filter((u) => (p.unitIds || []).includes(u.id)).map((u) => u.name).join(', ');
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Proposta ${esc(p.client)}</title>
<style>body{font-family:Manrope,system-ui,sans-serif;color:#0d1530;max-width:760px;margin:40px auto;padding:0 24px;line-height:1.5}
h1{font:800 30px/1.1 Sora,system-ui,sans-serif;margin:0 0 4px}.k{color:#e8a93a;font-weight:800;letter-spacing:.08em;font-size:12px}
table{width:100%;border-collapse:collapse;margin:20px 0}td{padding:10px 0;border-bottom:1px solid #e2e7f1}td:last-child{text-align:right;font-weight:700}
.tot td{font-size:20px;border-bottom:3px solid #0a1a44}.m{color:#4f5b78;font-size:14px}@media print{body{margin:0}}</style></head><body>
<div class="k">PROPOSTA DE MÍDIA INDOOR</div><h1>${esc(p.client)}</h1><p class="m">${esc(company.name)} · ${new Date().toLocaleDateString('pt-BR')}</p>
<table><tr><td>Período</td><td>${brDate(p.start)} a ${brDate(p.end)} (${t.days} dias)</td></tr>
<tr><td>Onde</td><td>${esc(names)} (${t.screens} telas)</td></tr>
<tr><td>Anúncio</td><td>${p.seconds} segundos, ${num(p.insertionsPerDay)} vezes por dia em cada tela</td></tr>
<tr><td>Exibições no período</td><td>${num(t.insertions)}</td></tr>
${t.audience ? `<tr><td>Alcance estimado</td><td>${num(t.audience)} pessoas</td></tr>` : ''}
<tr><td>Valor</td><td>${formatMoney(t.gross)}</td></tr>${t.discount ? `<tr><td>Desconto</td><td>−${formatMoney(t.discount)}</td></tr>` : ''}
<tr class="tot"><td>Total</td><td>${formatMoney(t.total)}</td></tr></table>
${p.notes ? `<p>${esc(p.notes)}</p>` : ''}<p class="m">As exibições são registradas por cada tela e comprovadas por relatório ao fim do período. Alcance é estimativa a partir do fluxo médio de cada loja.</p>
<script>setTimeout(()=>print(),300)</script></body></html>`);
  w.document.close();
}


