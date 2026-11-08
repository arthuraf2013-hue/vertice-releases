import { useEffect, useMemo, useRef, useState } from 'react';
import {
  APP_THEMES, PRICE_LAYOUTS, parsePrice, formatMoney, parsePriceCsv, priceListForTv, priceMediaId, formatDateTime,
} from '@vertice/shared';
import { useSession } from '../session.jsx';
import { useCol } from '../data/hooks.js';
import { api } from '../data/api.js';
import { rebuildManifests } from '../data/manifests.js';
import {
  PageHeader, Button, Card, Loading, EmptyState, useToast, useConfirm, Input, Select, Segmented, IconButton,
} from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';
import { AppPreview } from './Apps.jsx';

const blankRow = () => ({ name: '', unit: '', price: '', promoPrice: '', highlight: false, hidden: false, _k: Math.random() });
const fromList = (l) => ({
  title: l.title || l.name || '',
  subtitle: l.subtitle || '',
  footer: l.footer || '',
  theme: l.theme || 'night',
  layout: l.layout || 'list',
  items: (l.items || []).map((it) => ({
    ...it,
    price: it.price != null ? formatMoney(it.price) : '',
    promoPrice: it.promoPrice != null ? formatMoney(it.promoPrice) : '',
    _k: Math.random(),
  })),
});
const toSave = (d) => ({
  name: d.title.trim() || 'Tabela de preços',
  title: d.title.trim() || 'Preços',
  subtitle: d.subtitle.trim(),
  footer: d.footer.trim(),
  theme: d.theme,
  layout: d.layout,
  items: d.items
    .filter((it) => it.name.trim())
    .map((it) => ({
      name: it.name.trim().slice(0, 60),
      unit: (it.unit || '').trim().slice(0, 12),
      price: parsePrice(it.price),
      promoPrice: parsePrice(it.promoPrice),
      highlight: !!it.highlight,
      hidden: !!it.hidden,
    })),
});

/** Price: a tabela de preços vira tela. Mudou aqui, todas as telas atualizam. */
export function Price() {
  const { base, companyId, can, member } = useSession();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const lists = useCol(`${base}/priceLists`, { orderBy: ['name', 'asc'] });
  const playlists = useCol(`${base}/playlists`);
  const [sel, setSel] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addTo, setAddTo] = useState('');
  const fileRef = useRef(null);
  const editable = can('editor');

  const current = lists?.find((l) => l.id === sel);
  // Abre a primeira tabela; ao trocar de tabela, carrega o rascunho dela.
  useEffect(() => {
    if (lists && !sel && lists.length) setSel(lists[0].id);
  }, [lists, sel]);
  useEffect(() => {
    if (sel === 'new') return;
    if (current) { setDraft(fromList(current)); setDirty(false); }
  }, [sel, current?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const usedIn = useMemo(() => {
    if (!sel || sel === 'new') return [];
    const mid = priceMediaId(sel);
    return (playlists || []).filter((p) => (p.items || []).some((it) => it.mediaId === mid));
  }, [playlists, sel]);

  if (!lists) return <Loading />;

  const patch = (p) => { setDraft((d) => ({ ...d, ...p })); setDirty(true); };
  const patchRow = (i, p) => { setDraft((d) => ({ ...d, items: d.items.map((x, j) => (j === i ? { ...x, ...p } : x)) })); setDirty(true); };
  const move = (i, dir) => {
    setDraft((d) => {
      const a = [...d.items];
      [a[i], a[i + dir]] = [a[i + dir], a[i]];
      return { ...d, items: a };
    });
    setDirty(true);
  };

  const create = () => {
    if (dirty && !window.confirm('Descartar as mudanças não salvas?')) return;
    setSel('new');
    setDraft({ title: 'Nova tabela', subtitle: '', footer: '', theme: 'night', layout: 'list', items: [blankRow(), blankRow(), blankRow()] });
    setDirty(true);
  };
  const pick = (id) => {
    if (id === sel) return;
    if (dirty && !window.confirm('Descartar as mudanças não salvas?')) return;
    setSel(id);
  };

  const importCsv = async (file) => {
    const { rows, skipped } = parsePriceCsv(await file.text());
    if (!rows.length) return toast('Não achei produtos com preço nessa planilha. Confira se tem as colunas Produto e Preço.', 'warn');
    const keep = draft.items.filter((it) => it.name.trim());
    const replace = keep.length ? await confirm({ title: 'Importar planilha', message: `Achei ${rows.length} produtos. Trocar os ${keep.length} da tabela ou juntar com eles?`, confirmLabel: 'Trocar tudo' }) : true;
    const add = rows.map((r) => ({ ...r, price: formatMoney(r.price), promoPrice: r.promoPrice != null ? formatMoney(r.promoPrice) : '', _k: Math.random() }));
    patch({ items: replace ? add : [...keep, ...add] });
    toast(`${rows.length} produtos importados${skipped ? ` (${skipped} linhas sem preço ficaram de fora)` : ''}. Confira e salve.`);
  };

  const save = async () => {
    const data = toSave(draft);
    if (!data.items.length) return toast('Coloque pelo menos um produto com preço.', 'warn');
    const bad = data.items.find((it) => it.price == null);
    if (bad) return toast(`"${bad.name}" está sem preço.`, 'warn');
    setBusy(true);
    try {
      let id = sel;
      if (id === 'new') id = await api.add(`${base}/priceLists`, { ...data, createdAt: api.NOW, updatedAt: api.NOW });
      else await api.update(`${base}/priceLists/${id}`, { ...data, updatedAt: api.NOW });
      // A tabela entra nas playlists como um aplicativo (uma "mídia" sem arquivo).
      await api.set(`${base}/media/${priceMediaId(id)}`, {
        type: 'app', name: `Preços · ${data.title}`, app: { kind: 'price', config: { listId: id } }, sizeBytes: 0,
        updatedAt: api.NOW, createdBy: member?.name || '',
      }, true);
      const n = await rebuildManifests(companyId);
      setSel(id);
      setDirty(false);
      toast(usedIn.length || sel === 'new' ? `Preços salvos. ${n} ${n === 1 ? 'tela atualizada' : 'telas atualizadas'}.` : 'Preços salvos.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Excluir "${current.title || current.name}"?`, danger: true, confirmLabel: 'Excluir tabela',
      message: usedIn.length ? `Ela sai das playlists ${usedIn.map((p) => p.name).join(', ')} e das telas em seguida.` : 'Ela não está em nenhuma playlist.',
    });
    if (!ok) return;
    const mid = priceMediaId(current.id);
    const ops = [{ op: 'delete', path: `${base}/priceLists/${current.id}` }, { op: 'delete', path: `${base}/media/${mid}` }];
    for (const p of usedIn) ops.push({ op: 'update', path: `${base}/playlists/${p.id}`, data: { items: p.items.filter((it) => it.mediaId !== mid), updatedAt: api.NOW } });
    await api.batch(ops);
    if (usedIn.length) await rebuildManifests(companyId);
    setSel(null);
    setDraft(null);
    toast('Tabela excluída.');
  };

  const addToPlaylist = async () => {
    const p = (playlists || []).find((x) => x.id === addTo);
    if (!p) return;
    await api.update(`${base}/playlists/${p.id}`, { items: [...(p.items || []), { mediaId: priceMediaId(sel), durationSec: null }], updatedAt: api.NOW });
    await rebuildManifests(companyId);
    setAddTo('');
    toast(`Tabela adicionada à playlist "${p.name}".`);
  };

  const preview = draft ? { kind: 'price', config: { listId: sel }, data: priceListForTv(toSave(draft)) } : null;
  const visible = draft ? draft.items.filter((it) => it.name.trim() && !it.hidden).length : 0;

  return (
    <div className="vx-page">
      <PageHeader overline="CONTEÚDO" title="Price" subtitle="Sua tabela de preços vira tela. Altere o valor aqui e todas as telas atualizam."
        actions={editable && (
          <>
            {draft && <Button icon="upload" onClick={() => fileRef.current?.click()}>Importar planilha</Button>}
            <Button icon="plus" onClick={create}>Nova tabela</Button>
            {draft && <Button variant="primary" icon="send" onClick={save} loading={busy} disabled={!dirty && sel !== 'new'}>Salvar e publicar</Button>}
          </>
        )} />
      <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { if (e.target.files[0]) importCsv(e.target.files[0]); e.target.value = ''; }} />

      {!lists.length && !draft ? (
        <EmptyState icon="tag" title="Nenhuma tabela de preços ainda" action={editable && <Button variant="primary" icon="plus" onClick={create}>Criar a primeira tabela</Button>}>
          Monte a tabela aqui ou importe uma planilha (CSV do Excel ou Google Sheets, com as colunas Produto e Preço).
        </EmptyState>
      ) : (
        <div className="vx-price-layout">
          <nav className="vx-card vx-apps-groups" aria-label="Tabelas de preço">
            <span className="vx-overline">Tabelas</span>
            {lists.map((l) => (
              <button key={l.id} type="button" className={sel === l.id ? 'is-on' : ''} onClick={() => pick(l.id)}>
                <span className="vx-ellipsis">{l.title || l.name}</span><span className="vx-num">{(l.items || []).filter((it) => !it.hidden).length}</span>
              </button>
            ))}
            {sel === 'new' && <button type="button" className="is-on">Nova tabela<span className="vx-num">—</span></button>}
          </nav>

          {draft && (
            <>
              <Card title="Produtos" icon="tag" className="vx-price-editor" pad={false}
                actions={<span className="vx-faint">{visible} na tela{dirty ? ' · não salvo' : current?.updatedAt ? ` · salvo ${formatDateTime(current.updatedAt)}` : ''}</span>}>
                <div className="vx-price-table" role="table">
                  <div className="vx-price-tr vx-price-th" role="row">
                    <span>Produto</span><span>Unid.</span><span>Preço (R$)</span><span>Oferta (R$)</span><span title="Destaque">Dest.</span><span title="Esconder da TV">Ocultar</span><span />
                  </div>
                  {draft.items.map((it, i) => (
                    <div key={it._k} className={`vx-price-tr ${it.hidden ? 'is-hidden' : ''}`} role="row">
                      <input className="vx-input" value={it.name} maxLength={60} placeholder="Ex.: Pão francês" onChange={(e) => patchRow(i, { name: e.target.value })} disabled={!editable} aria-label="Produto" />
                      <input className="vx-input" value={it.unit} maxLength={12} placeholder="kg" onChange={(e) => patchRow(i, { unit: e.target.value })} disabled={!editable} aria-label="Unidade" />
                      <input className="vx-input vx-num" inputMode="decimal" value={it.price} placeholder="0,00" onChange={(e) => patchRow(i, { price: e.target.value })} onBlur={(e) => parsePrice(e.target.value) != null && patchRow(i, { price: formatMoney(parsePrice(e.target.value)) })} disabled={!editable} aria-label={`Preço de ${it.name || 'produto'}`} />
                      <input className="vx-input vx-num" inputMode="decimal" value={it.promoPrice} placeholder="—" onChange={(e) => patchRow(i, { promoPrice: e.target.value })} onBlur={(e) => parsePrice(e.target.value) != null && patchRow(i, { promoPrice: formatMoney(parsePrice(e.target.value)) })} disabled={!editable} aria-label={`Oferta de ${it.name || 'produto'}`} />
                      <input type="checkbox" checked={!!it.highlight} onChange={(e) => patchRow(i, { highlight: e.target.checked })} disabled={!editable} aria-label="Destaque" />
                      <input type="checkbox" checked={!!it.hidden} onChange={(e) => patchRow(i, { hidden: e.target.checked })} disabled={!editable} aria-label="Ocultar da TV" />
                      {editable ? (
                        <span className="vx-price-row-actions">
                          <IconButton icon="arrowUp" label="Subir" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} />
                          <IconButton icon="arrowDown" label="Descer" variant="ghost" disabled={i === draft.items.length - 1} onClick={() => move(i, 1)} />
                          <IconButton icon="trash" label="Remover" variant="ghost" onClick={() => patch({ items: draft.items.filter((_, j) => j !== i) })} />
                        </span>
                      ) : <span />}
                    </div>
                  ))}
                </div>
                {editable && (
                  <div className="vx-price-foot-actions">
                    <Button size="sm" icon="plus" onClick={() => patch({ items: [...draft.items, blankRow()] })}>Adicionar produto</Button>
                    <span className="vx-faint">Oferta menor que o preço aparece riscando o preço antigo. Até 60 produtos por tabela.</span>
                  </div>
                )}
              </Card>

              <div className="vx-price-side">
                <AppPreview app={preview} />
                <Card title="Na tela" icon="screen">
                  <div className="vx-form">
                    <Input label="Título" value={draft.title} maxLength={40} onChange={(e) => patch({ title: e.target.value })} disabled={!editable} />
                    <Input label="Subtítulo" value={draft.subtitle} maxLength={60} placeholder="Ex.: Preços válidos hoje" onChange={(e) => patch({ subtitle: e.target.value })} disabled={!editable} />
                    <Input label="Rodapé" value={draft.footer} maxLength={80} placeholder="Ex.: Aceitamos Pix e cartão" onChange={(e) => patch({ footer: e.target.value })} disabled={!editable} />
                    <div className="vx-form-row">
                      <Select label="Cores" value={draft.theme} onChange={(e) => patch({ theme: e.target.value })} disabled={!editable} options={Object.entries(APP_THEMES).map(([k, t]) => ({ value: k, label: t.label }))} />
                      <Segmented label="Formato" value={draft.layout} onChange={(v) => editable && patch({ layout: v })} options={Object.entries(PRICE_LAYOUTS).map(([k, l]) => ({ value: k, label: l }))} />
                    </div>
                  </div>
                </Card>
                {sel !== 'new' && (
                  <Card title="Playlists" icon="playlist">
                    {usedIn.length
                      ? <p className="vx-muted" style={{ margin: 0 }}>Está em: {usedIn.map((p) => p.name).join(', ')}.</p>
                      : <p className="vx-muted" style={{ margin: 0 }}>Ainda não está em nenhuma playlist, então não aparece nas telas.</p>}
                    {editable && (playlists || []).some((p) => !usedIn.includes(p)) && (
                      <div className="vx-inline-search" style={{ marginTop: 12 }}>
                        <select className="vx-input vx-select" value={addTo} onChange={(e) => setAddTo(e.target.value)} aria-label="Escolher playlist">
                          <option value="">Adicionar a uma playlist…</option>
                          {(playlists || []).filter((p) => !usedIn.includes(p)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <Button icon="plus" onClick={addToPlaylist} disabled={!addTo || dirty} title={dirty ? 'Salve a tabela antes' : undefined}>Adicionar</Button>
                      </div>
                    )}
                    {editable && current && <Button variant="ghost" icon="trash" className="vx-danger-link" onClick={remove}>Excluir tabela</Button>}
                  </Card>
                )}
              </div>
            </>
          )}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
