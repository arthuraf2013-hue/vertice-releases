import { useMemo, useState } from 'react';
import {
  aggregatePlays, daysAgoISO, localISODate, formatDuration, toCsv, APP_KINDS,
} from '@vertice/shared';
import { useSession } from '../session.jsx';
import { useCol, useById } from '../data/hooks.js';
import { api } from '../data/api.js';
import { rebuildManifests } from '../data/manifests.js';
import {
  PageHeader, Button, Card, MetricCard, Loading, EmptyState, useToast, useConfirm, Modal, Input, Segmented, IconButton, MediaThumb, Chip,
} from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

const br = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
const blank = { name: '', doc: '', contact: '', phone: '', email: '', contractFrom: '', contractTo: '', notes: '' };

/** Situação do contrato hoje. */
function contract(a, today = localISODate()) {
  if (!a.contractTo && !a.contractFrom) return { tone: 'idle', text: 'Sem contrato' };
  if (a.contractFrom && today < a.contractFrom) return { tone: 'sync', text: `Começa em ${br(a.contractFrom)}` };
  if (a.contractTo && today > a.contractTo) return { tone: 'offline', text: `Venceu em ${br(a.contractTo)}` };
  if (a.contractTo) {
    const days = Math.round((new Date(`${a.contractTo}T12:00`) - new Date(`${today}T12:00`)) / 86400000);
    return days <= 15 ? { tone: 'warn', text: days === 0 ? 'Vence hoje' : `Vence em ${days} ${days === 1 ? 'dia' : 'dias'}` } : { tone: 'online', text: `Vigente até ${br(a.contractTo)}` };
  }
  return { tone: 'online', text: 'Vigente' };
}

const PERIODS = [{ value: '7', label: '7 dias' }, { value: '30', label: '30 dias' }, { value: 'month', label: 'Este mês' }, { value: 'contract', label: 'Contrato' }, { value: 'custom', label: 'Escolher' }];
function range(period, a, custom) {
  const today = localISODate();
  if (period === '7') return [daysAgoISO(6), today];
  if (period === 'month') return [`${today.slice(0, 8)}01`, today];
  if (period === 'contract' && a?.contractFrom) return [a.contractFrom, a.contractTo && a.contractTo < today ? a.contractTo : today];
  if (period === 'custom') return custom.from <= custom.to ? [custom.from, custom.to] : [custom.to, custom.from];
  return [daysAgoISO(29), today];
}

/**
 * Anunciantes: quem anuncia nas suas telas, o contrato e a comprovação de exibição.
 * A mídia é ligada ao anunciante em Mídias › Ajustar (ou aqui, em "Mídias do anunciante").
 */
export function Advertisers() {
  const { base, companyId, can } = useSession();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const advertisers = useCol(`${base}/advertisers`, { orderBy: ['name', 'asc'] });
  const media = useCol(`${base}/media`);
  const playlists = useCol(`${base}/playlists`);
  const from30 = daysAgoISO(29);
  const stats = useCol(`${base}/playStats`, { where: [['date', '>=', from30]] });
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const mediaById = useById(media);

  const advertiserOf = (id) => mediaById.get(id)?.advertiserId || null;
  const plays30 = useMemo(() => new Map(aggregatePlays(stats || [], 'advertiser', { advertiserOf }).map((r) => [r.key, r])), [stats, mediaById]); // eslint-disable-line react-hooks/exhaustive-deps
  const mediaCount = useMemo(() => {
    const m = new Map();
    for (const x of media || []) if (x.advertiserId) m.set(x.advertiserId, (m.get(x.advertiserId) || 0) + 1);
    return m;
  }, [media]);

  if (!advertisers || !media) return <Loading />;
  const list = advertisers.filter((a) => `${a.name} ${a.contact || ''} ${a.doc || ''}`.toLowerCase().includes(q.toLowerCase()));
  const active = advertisers.filter((a) => ['online', 'warn'].includes(contract(a).tone));
  const expiring = advertisers.filter((a) => contract(a).tone === 'warn');
  const total30 = [...plays30.entries()].filter(([k]) => k).reduce((s, [, r]) => s + r.plays, 0);

  const save = async (a) => {
    const data = { ...a, name: a.name.trim(), updatedAt: api.NOW };
    delete data.id;
    if (a.id) await api.update(`${base}/advertisers/${a.id}`, data);
    else await api.add(`${base}/advertisers`, { ...data, createdAt: api.NOW });
    setEdit(null);
    toast(a.id ? 'Anunciante salvo.' : 'Anunciante cadastrado. Ligue as mídias dele para acompanhar as exibições.');
  };

  const remove = async (a) => {
    const n = mediaCount.get(a.id) || 0;
    const ok = await confirm({
      title: `Excluir "${a.name}"?`, danger: true, confirmLabel: 'Excluir anunciante',
      message: n ? `As ${n} mídias dele continuam nas playlists, só deixam de estar ligadas a um anunciante.` : 'Nenhuma mídia está ligada a ele.',
    });
    if (!ok) return;
    const ops = media.filter((m) => m.advertiserId === a.id).map((m) => ({ op: 'update', path: `${base}/media/${m.id}`, data: { advertiserId: null } }));
    ops.push({ op: 'delete', path: `${base}/advertisers/${a.id}` });
    await api.batch(ops);
    if (n) await rebuildManifests(companyId);
    setOpen(null);
    toast('Anunciante excluído.');
  };

  return (
    <div className="vx-page">
      <PageHeader overline="COMERCIAL" title="Anunciantes" subtitle="Quem anuncia nas suas telas, a vigência do contrato e a comprovação de exibição."
        actions={can('editor') && <Button variant="primary" icon="plus" onClick={() => setEdit({ ...blank })}>Novo anunciante</Button>} />

      <div className="vx-grid-4">
        <MetricCard icon="megaphone" label="Anunciantes" value={advertisers.length} note="Cadastrados" />
        <MetricCard icon="check" label="Contratos vigentes" value={active.length} total={advertisers.length} dot="online" note="Hoje" />
        <MetricCard icon="clock" label="Vencendo" value={expiring.length} dot="warn" note="Nos próximos 15 dias" />
        <MetricCard icon="play" label="Exibições de anúncios" value={fmt(total30)} dot="sync" note="Últimos 30 dias" />
      </div>

      {advertisers.length ? (
        <Card title="Anunciantes" icon="megaphone" pad={false}
          actions={<div className="vx-search vx-search-sm"><Icon name="search" /><input className="vx-input" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar anunciante" /></div>}>
          <table className="vx-table vx-adv-table">
            <thead><tr><th>Anunciante</th><th>Contrato</th><th className="vx-num">Mídias</th><th className="vx-num">Exibições (30 dias)</th><th className="vx-num">Tempo na tela</th><th /></tr></thead>
            <tbody>
              {list.map((a) => {
                const c = contract(a);
                const p = plays30.get(a.id);
                return (
                  <tr key={a.id} className="vx-row-click" onClick={() => setOpen(a.id)}>
                    <td><b>{a.name}</b>{(a.contact || a.phone) && <div className="vx-faint">{[a.contact, a.phone].filter(Boolean).join(' · ')}</div>}</td>
                    <td><span className={`vx-state vx-state-${c.tone}`}><i />{c.text}</span></td>
                    <td className="vx-num">{mediaCount.get(a.id) || 0}</td>
                    <td className="vx-num">{fmt(p?.plays)}</td>
                    <td className="vx-num">{formatDuration(p?.seconds || 0)}</td>
                    <td className="vx-num"><Button size="sm" variant="ghost" icon="chart" onClick={(e) => { e.stopPropagation(); setOpen(a.id); }}>Relatório</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState icon="megaphone" title="Nenhum anunciante ainda" action={can('editor') && <Button variant="primary" icon="plus" onClick={() => setEdit({ ...blank })}>Cadastrar anunciante</Button>}>
          Cadastre quem paga para aparecer nas suas telas. Depois ligue as mídias dele e tire o relatório de exibição para mandar ao cliente.
        </EmptyState>
      )}

      {edit && <AdvertiserForm value={edit} onClose={() => setEdit(null)} onSave={save} />}
      {open && advertisers.find((a) => a.id === open) && (
        <AdvertiserDetail base={base} companyId={companyId} advertiser={advertisers.find((a) => a.id === open)} media={media} playlists={playlists || []}
          canEdit={can('editor')} onEdit={(a) => setEdit({ ...blank, ...a })} onRemove={remove} onClose={() => setOpen(null)} />
      )}
      {confirmDialog}
    </div>
  );
}

function AdvertiserForm({ value, onClose, onSave }) {
  const [f, setF] = useState(value);
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const err = !f.name.trim() ? 'Informe o nome.' : f.contractFrom && f.contractTo && f.contractFrom > f.contractTo ? 'O fim do contrato é antes do início.' : null;
  const submit = async () => { setBusy(true); try { await onSave(f); } finally { setBusy(false); } };
  return (
    <Modal open onClose={onClose} icon="megaphone" width={640} title={value.id ? 'Editar anunciante' : 'Novo anunciante'}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit} loading={busy} disabled={!!err} title={err || undefined}>Salvar</Button></>}>
      <form className="vx-form" onSubmit={(e) => { e.preventDefault(); if (!err) submit(); }}>
        <div className="vx-form-row">
          <Input label="Nome" value={f.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Ótica Visão" />
          <Input label="CNPJ ou CPF" value={f.doc} maxLength={20} onChange={(e) => set({ doc: e.target.value })} />
        </div>
        <div className="vx-form-row">
          <Input label="Contato" value={f.contact} maxLength={60} onChange={(e) => set({ contact: e.target.value })} />
          <Input label="Telefone" value={f.phone} maxLength={20} onChange={(e) => set({ phone: e.target.value })} />
        </div>
        <Input label="E-mail" type="email" value={f.email} maxLength={80} onChange={(e) => set({ email: e.target.value })} />
        <div className="vx-form-row">
          <label className="vx-field"><span className="vx-label">Contrato de</span><input className="vx-input" type="date" value={f.contractFrom} onChange={(e) => set({ contractFrom: e.target.value })} /></label>
          <label className="vx-field"><span className="vx-label">Até</span><input className="vx-input" type="date" value={f.contractTo} onChange={(e) => set({ contractTo: e.target.value })} /></label>
        </div>
        <label className="vx-field">
          <span className="vx-label">Observações</span>
          <textarea className="vx-input vx-textarea" rows={3} maxLength={500} value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Plano contratado, telas combinadas, forma de pagamento…" />
        </label>
        {err && f.name && <p className="vx-help vx-help-warn"><Icon name="alert" />{err}</p>}
      </form>
    </Modal>
  );
}

function AdvertiserDetail({ base, companyId, advertiser: a, media, playlists, canEdit, onEdit, onRemove, onClose }) {
  const { company } = useSession();
  const toast = useToast();
  const [period, setPeriod] = useState(a.contractFrom ? 'contract' : '30');
  const [custom, setCustom] = useState({ from: daysAgoISO(29), to: localISODate() });
  const [picking, setPicking] = useState(false);
  const [from, to] = range(period, a, custom);
  const stats = useCol(`${base}/playStats`, { where: [['date', '>=', from], ['date', '<=', to]] });
  const screens = useCol(`${base}/screens`);
  const mediaById = useById(media);
  const screenById = useById(screens);
  const mine = media.filter((m) => m.advertiserId === a.id);
  const advertiserOf = (id) => mediaById.get(id)?.advertiserId || null;
  const opts = { advertiserOf, advertiser: a.id };
  const byMedia = useMemo(() => aggregatePlays(stats || [], 'media', opts), [stats, mediaById]); // eslint-disable-line react-hooks/exhaustive-deps
  const byScreen = useMemo(() => aggregatePlays(stats || [], 'screen', opts), [stats, mediaById]); // eslint-disable-line react-hooks/exhaustive-deps
  const byDay = useMemo(() => aggregatePlays(stats || [], 'day', opts), [stats, mediaById]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = byMedia.reduce((s, r) => ({ plays: s.plays + r.plays, seconds: s.seconds + r.seconds }), { plays: 0, seconds: 0 });
  const c = contract(a);
  const mediaName = (r) => mediaById.get(r.key)?.name || r.name || 'Mídia removida';
  const screenName = (id) => { const s = screenById.get(id); return s ? `${s.name} (${s.code})` : 'Tela removida'; };
  const inPlaylists = (id) => playlists.filter((p) => (p.items || []).some((it) => it.mediaId === id)).length;

  const exportCsv = () => {
    const rows = byMedia.map((r) => ({ ...r, label: mediaName(r) }));
    const csv = toCsv(rows, [
      { label: 'Anunciante', value: () => a.name }, { label: 'Mídia', value: 'label' }, { label: 'Exibições', value: 'plays' },
      { label: 'Tempo na tela (min)', value: (r) => (r.seconds / 60).toFixed(1).replace('.', ',') }, { label: 'Telas', value: 'screens' }, { label: 'Dias', value: 'days' },
    ]);
    const el = document.createElement('a');
    el.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    el.download = `exibicoes-${a.name.replace(/\W+/g, '-').toLowerCase()}-${from}_a_${to}.csv`;
    el.click();
  };

  const printReport = () => {
    const html = reportHtml({ company: company?.name || '', a, from, to, total, byMedia, byScreen, byDay, mediaName, screenName });
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
    document.body.appendChild(frame);
    frame.contentDocument.open();
    frame.contentDocument.write(html);
    frame.contentDocument.close();
    setTimeout(() => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(() => frame.remove(), 2000);
    }, 300);
  };

  const link = async (ids) => {
    const ops = media.filter((m) => ids.has(m.id) !== (m.advertiserId === a.id))
      .map((m) => ({ op: 'update', path: `${base}/media/${m.id}`, data: { advertiserId: ids.has(m.id) ? a.id : null } }));
    if (!ops.length) return setPicking(false);
    await api.batch(ops);
    await rebuildManifests(companyId);
    setPicking(false);
    toast('Mídias do anunciante atualizadas.');
  };

  return (
    <Modal open onClose={onClose} width={1040} icon="megaphone" title={a.name}
      subtitle={[a.doc, a.contact, a.phone, a.email].filter(Boolean).join(' · ') || 'Anunciante'}
      footer={(
        <>
          {canEdit && <Button variant="ghost" icon="trash" className="vx-danger-link" style={{ marginRight: 'auto', marginTop: 0 }} onClick={() => onRemove(a)}>Excluir</Button>}
          {canEdit && <Button icon="edit" onClick={() => onEdit(a)}>Editar dados</Button>}
          <Button icon="download" onClick={exportCsv} disabled={!byMedia.length}>Planilha</Button>
          <Button variant="primary" icon="send" onClick={printReport} disabled={!byMedia.length}>Relatório para o cliente</Button>
        </>
      )}>
      <div className="vx-adv-detail">
        <div className="vx-adv-head">
          <span className={`vx-state vx-state-${c.tone}`}><i />{c.text}</span>
          {a.contractFrom && <span className="vx-faint">Contrato: {br(a.contractFrom)}{a.contractTo ? ` a ${br(a.contractTo)}` : ''}</span>}
          <Segmented value={period} onChange={setPeriod} options={a.contractFrom ? PERIODS : PERIODS.filter((p) => p.value !== 'contract')} />
        </div>
        {period === 'custom' && (
          <div className="vx-form-row" style={{ maxWidth: 420 }}>
            <label className="vx-field"><span className="vx-label">De</span><input className="vx-input" type="date" value={custom.from} onChange={(e) => setCustom((x) => ({ ...x, from: e.target.value }))} /></label>
            <label className="vx-field"><span className="vx-label">Até</span><input className="vx-input" type="date" value={custom.to} onChange={(e) => setCustom((x) => ({ ...x, to: e.target.value }))} /></label>
          </div>
        )}
        <div className="vx-grid-4">
          <MetricCard icon="play" label="Exibições" value={fmt(total.plays)} note={`${br(from)} a ${br(to)}`} />
          <MetricCard icon="clock" label="Tempo na tela" value={formatDuration(total.seconds)} dot="sync" note="Somando todas as telas" />
          <MetricCard icon="screen" label="Telas" value={byScreen.length} note="Que exibiram os anúncios" />
          <MetricCard icon="image" label="Mídias" value={mine.length} note="Ligadas a este anunciante" />
        </div>

        <div className="vx-adv-cols">
          <Card title="Por mídia" icon="image" pad={false}
            actions={canEdit && <Button size="sm" icon="link" onClick={() => setPicking(true)}>Mídias do anunciante</Button>}>
            {byMedia.length || mine.length ? (
              <table className="vx-table">
                <thead><tr><th>Mídia</th><th className="vx-num">Exibições</th><th className="vx-num">Tempo</th></tr></thead>
                <tbody>
                  {[...byMedia, ...mine.filter((m) => !byMedia.some((r) => r.key === m.id)).map((m) => ({ key: m.id, plays: 0, seconds: 0 }))].map((r) => (
                    <tr key={r.key}>
                      <td><span className="vx-report-name"><MediaThumb media={mediaById.get(r.key)} className="vx-report-thumb" /><span className="vx-ellipsis">{mediaName(r)}</span>
                        {mediaById.get(r.key) && !inPlaylists(r.key) && <Chip>fora das playlists</Chip>}</span></td>
                      <td className="vx-num">{fmt(r.plays)}</td>
                      <td className="vx-num">{formatDuration(r.seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="vx-muted vx-pad">Nenhuma mídia ligada. Use "Mídias do anunciante" ou Mídias › Ajustar › Anunciante.</p>}
          </Card>
          <Card title="Por tela" icon="screen" pad={false}>
            {byScreen.length ? (
              <table className="vx-table">
                <thead><tr><th>Tela</th><th className="vx-num">Exibições</th><th className="vx-num">Tempo</th></tr></thead>
                <tbody>{byScreen.map((r) => <tr key={r.key}><td className="vx-ellipsis">{screenName(r.key)}</td><td className="vx-num">{fmt(r.plays)}</td><td className="vx-num">{formatDuration(r.seconds)}</td></tr>)}</tbody>
              </table>
            ) : <p className="vx-muted vx-pad">Sem exibições nesse período.</p>}
          </Card>
        </div>
      </div>
      {picking && <MediaPicker media={media} advertiser={a} onClose={() => setPicking(false)} onSave={link} />}
    </Modal>
  );
}

function MediaPicker({ media, advertiser, onClose, onSave }) {
  const files = media.filter((m) => m.type !== 'app' || m.app?.kind === 'studio');
  const [sel, setSel] = useState(() => new Set(files.filter((m) => m.advertiserId === advertiser.id).map((m) => m.id)));
  const [busy, setBusy] = useState(false);
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <Modal open onClose={onClose} width={860} icon="link" title={`Mídias de ${advertiser.name}`} subtitle="Marque as mídias que são deste anunciante."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} onClick={async () => { setBusy(true); try { await onSave(sel); } finally { setBusy(false); } }}>Salvar ({sel.size})</Button></>}>
      <div className="vx-adv-picker">
        {files.map((m) => {
          const other = m.advertiserId && m.advertiserId !== advertiser.id;
          return (
            <label key={m.id} className={`vx-adv-pick ${sel.has(m.id) ? 'is-on' : ''}`}>
              <input type="checkbox" checked={sel.has(m.id)} onChange={() => toggle(m.id)} />
              <MediaThumb media={m} />
              <span className="vx-ellipsis">{m.name}</span>
              {other && <span className="vx-faint vx-adv-other">de outro anunciante</span>}
            </label>
          );
        })}
      </div>
    </Modal>
  );
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/** Relatório de comprovação de exibição, para imprimir ou salvar em PDF. */
function reportHtml({ company, a, from, to, total, byMedia, byScreen, byDay, mediaName, screenName }) {
  const max = Math.max(1, ...byDay.map((d) => d.plays));
  const rows = (list, label) => list.map((r) => `<tr><td>${esc(label(r))}</td><td class="n">${fmt(r.plays)}</td><td class="n">${esc(formatDuration(r.seconds))}</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Exibições · ${esc(a.name)}</title><style>
  @page { margin: 16mm; }
  body { font: 12px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #0E1A2B; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #E3A72F; padding-bottom: 10px; margin-bottom: 18px; }
  h1 { font-size: 22px; margin: 0; } h2 { font-size: 14px; margin: 22px 0 8px; }
  .muted { color: #5b6573; }
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .kpi { border: 1px solid #dfe3e8; border-radius: 8px; padding: 10px 12px; } .kpi b { display: block; font-size: 20px; }
  table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e6e9ed; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #5b6573; } .n { text-align: right; font-variant-numeric: tabular-nums; }
  .days { display: flex; align-items: flex-end; gap: 3px; height: 90px; } .days i { flex: 1; background: #13294B; border-radius: 2px 2px 0 0; min-height: 2px; }
  footer { margin-top: 26px; font-size: 10px; color: #8a929c; }
  </style></head><body>
  <header><div><div class="muted">${esc(company)}</div><h1>Comprovante de exibição</h1></div><div style="text-align:right"><b>${esc(a.name)}</b><div class="muted">${esc([a.doc, a.contact].filter(Boolean).join(' · '))}</div></div></header>
  <p>Período: <b>${br(from)} a ${br(to)}</b>${a.contractFrom ? ` · Contrato: ${br(a.contractFrom)}${a.contractTo ? ` a ${br(a.contractTo)}` : ''}` : ''}</p>
  <div class="kpis"><div class="kpi"><span class="muted">Exibições</span><b>${fmt(total.plays)}</b></div><div class="kpi"><span class="muted">Tempo na tela</span><b>${esc(formatDuration(total.seconds))}</b></div><div class="kpi"><span class="muted">Telas</span><b>${byScreen.length}</b></div></div>
  ${byDay.length > 1 ? `<h2>Exibições por dia</h2><div class="days">${byDay.map((d) => `<i title="${br(d.key)}: ${d.plays}" style="height:${Math.max(2, (d.plays / max) * 100)}%"></i>`).join('')}</div><div class="muted" style="display:flex;justify-content:space-between"><span>${br(byDay[0].key)}</span><span>${br(byDay[byDay.length - 1].key)}</span></div>` : ''}
  <h2>Por mídia</h2><table><thead><tr><th>Mídia</th><th class="n">Exibições</th><th class="n">Tempo</th></tr></thead><tbody>${rows(byMedia, mediaName)}</tbody></table>
  <h2>Por tela</h2><table><thead><tr><th>Tela</th><th class="n">Exibições</th><th class="n">Tempo</th></tr></thead><tbody>${rows(byScreen, (r) => screenName(r.key))}</tbody></table>
  <footer>Gerado pelo Vértice em ${new Date().toLocaleString('pt-BR')}. As telas contam cada vez que a mídia entra na tela e o tempo que ficou; telas sem internet enviam quando a conexão volta.</footer>
  </body></html>`;
}
