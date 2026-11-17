import { useMemo, useState } from 'react';
import { LAYOUT_TEMPLATES, ZONE_LABEL, BAR_THEMES, normalizeLayout, expandPlaylist, formatDateTime } from '@vertice/shared';
import { useSession } from '../session.jsx';
import { useCol } from '../data/hooks.js';
import { api } from '../data/api.js';
import { rebuildManifests } from '../data/manifests.js';
import {
  PageHeader, Button, Card, Loading, EmptyState, useToast, useConfirm, Modal, Input, Select, Toggle, PillGroup, IconButton, Chip, StatusBadge, Field,
} from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';
import { TvPreview } from '../ui/TvPreview.jsx';

/**
 * Layouts: a tela dividida em zonas (a programação na principal e playlists fixas nas outras)
 * e a barra inferior com logo, avisos e relógio. Vale para os grupos ou telas escolhidos.
 */
export function Layouts() {
  const { base, companyId, can } = useSession();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const layouts = useCol(`${base}/layouts`, { orderBy: ['name', 'asc'] });
  const playlists = useCol(`${base}/playlists`, { orderBy: ['name', 'asc'] });
  const media = useCol(`${base}/media`);
  const groups = useCol(`${base}/groups`, { orderBy: ['name', 'asc'] });
  const screens = useCol(`${base}/screens`, { orderBy: ['code', 'asc'] });
  const [edit, setEdit] = useState(null);
  if (!layouts || !playlists || !media || !groups || !screens) return <Loading />;

  const reach = (l) => screens.filter((s) => (l.screenIds || []).includes(s.id) || (l.groupIds || []).some((g) => (s.groupIds || []).includes(g))).length;
  const toggle = async (l) => {
    await api.update(`${base}/layouts/${l.id}`, { active: l.active === false, updatedAt: api.NOW });
    await rebuildManifests(companyId);
    toast(l.active === false ? 'Layout ligado. As telas já mudam.' : 'Layout desligado. As telas voltam à tela inteira.');
  };
  const remove = async (l) => {
    if (!(await confirm({ title: `Excluir o layout "${l.name}"?`, message: 'As telas dele voltam a mostrar só a programação, em tela inteira.', confirmLabel: 'Excluir', danger: true }))) return;
    await api.remove(`${base}/layouts/${l.id}`);
    await rebuildManifests(companyId);
    toast('Layout excluído.');
  };

  return (
    <div className="vx-page">
      <PageHeader overline="CONTEÚDO" title="Layouts e barra inferior" subtitle="Divida a tela em zonas e coloque uma barra fixa com logo, avisos e relógio."
        actions={can('editor') && <Button variant="primary" icon="plus" onClick={() => setEdit({ name: '', template: 'side', zones: {}, sideWidth: 30, bar: { enabled: true, clock: true, lines: [] }, groupIds: [], screenIds: [], active: true })}>Novo layout</Button>} />
      {layouts.length === 0 ? (
        <Card><EmptyState icon="layout" title="Nenhum layout ainda">
          Sem layout, cada tela mostra a programação na tela inteira. Crie um para ter, por exemplo, vídeos à esquerda, o Wi-Fi à direita e avisos correndo embaixo.
        </EmptyState></Card>
      ) : (
        <div className="vx-layout-list">
          {layouts.map((l) => {
            const n = normalizeLayout(l);
            return (
              <div key={l.id} className="vx-card vx-layout-row">
                <LayoutThumb template={n.template} bar={n.bar.enabled} side={n.sideWidth} />
                <div className="vx-app-row-text">
                  <b>{l.name}</b>
                  <span className="vx-faint">{LAYOUT_TEMPLATES[n.template].label}{n.bar.enabled ? ' + barra inferior' : ''} · {reach(l)} {reach(l) === 1 ? 'tela' : 'telas'}{l.updatedAt ? ` · editado ${formatDateTime(l.updatedAt)}` : ''}</span>
                </div>
                {l.active === false ? <StatusBadge status="offline">Desligado</StatusBadge> : <StatusBadge status="online">Ligado</StatusBadge>}
                {can('editor') && (
                  <div className="vx-row-actions">
                    <Button size="sm" onClick={() => toggle(l)}>{l.active === false ? 'Ligar' : 'Desligar'}</Button>
                    <Button size="sm" icon="edit" onClick={() => setEdit({ ...l })}>Editar</Button>
                    <IconButton icon="trash" label={`Excluir ${l.name}`} variant="danger" onClick={() => remove(l)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {edit && <LayoutEditor value={edit} playlists={playlists} media={media} groups={groups} screens={screens} onClose={() => setEdit(null)}
        onSaved={async () => { await rebuildManifests(companyId); toast('Layout salvo. As telas já recebem.'); setEdit(null); }} />}
      {confirmDialog}
    </div>
  );
}

/** Desenho pequeno do modelo (lista e escolha). */
export function LayoutThumb({ template, bar, side = 30, size = 'md' }) {
  const zones = LAYOUT_TEMPLATES[template]?.zones || [];
  return (
    <span className={`vx-lthumb vx-lthumb-${size} t-${template}`} style={{ '--side': `${side}%` }} aria-hidden>
      <span className="vx-lthumb-grid">
        <i className="z-main" />
        {zones.map((z) => <i key={z} className={`z-${z}`} />)}
      </span>
      {bar && <span className="vx-lthumb-bar" />}
    </span>
  );
}

function LayoutEditor({ value, playlists, media, groups, screens, onClose, onSaved }) {
  const [f, setF] = useState(() => ({ ...value, bar: { ...value.bar, lines: value.bar?.lines || [] } }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { base } = useSession();
  const n = normalizeLayout(f);
  const mediaById = useMemo(() => new Map(media.map((m) => [m.id, m])), [media]);
  const plById = useMemo(() => new Map(playlists.map((p) => [p.id, p])), [playlists]);
  const images = media.filter((m) => m.type === 'image');
  const setBar = (p) => setF({ ...f, bar: { ...f.bar, ...p } });
  const setZone = (z, playlistId) => setF({ ...f, zones: { ...(f.zones || {}), [z]: { playlistId } } });

  const preview = useMemo(() => {
    const zones = {};
    for (const z of LAYOUT_TEMPLATES[n.template].zones) zones[z] = expandPlaylist(plById.get(n.zones[z]?.playlistId), mediaById);
    const logo = mediaById.get(n.bar.logoMediaId);
    return { screen: { id: 'preview' }, layout: { template: n.template, sideWidth: n.sideWidth, zones, bar: n.bar.enabled ? { ...n.bar, logo: logo?.url ? { url: logo.url } : null } : null } };
  }, [JSON.stringify(n), plById, mediaById]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!f.name?.trim()) return setError('Dê um nome para o layout.');
    if (!f.groupIds.length && !f.screenIds.length) return setError('Escolha pelo menos um grupo ou uma tela.');
    const missing = LAYOUT_TEMPLATES[n.template].zones.find((z) => !n.zones[z]?.playlistId);
    if (missing) return setError(`Escolha a playlist da zona "${ZONE_LABEL[missing]}".`);
    if (n.bar.enabled && !n.bar.lines.length && !n.bar.clock && !n.bar.logoMediaId && !n.bar.title) return setError('A barra está vazia: escreva um aviso, ligue o relógio ou escolha o logo.');
    setBusy(true);
    try {
      const data = {
        name: f.name.trim(), template: n.template, sideWidth: n.sideWidth, zones: n.zones, bar: n.bar,
        groupIds: f.groupIds, screenIds: f.screenIds, active: f.active !== false, updatedAt: api.NOW,
      };
      if (f.id) await api.update(`${base}/layouts/${f.id}`, data);
      else await api.add(`${base}/layouts`, { ...data, createdAt: api.NOW });
      await onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} width={1100} icon="layout" title={f.id ? 'Editar layout' : 'Novo layout'} subtitle="A zona principal mostra a programação de cada tela. As outras zonas tocam a playlist escolhida, sem som."
      footer={<>
        {error && <span className="vx-field-error vx-mr-auto"><Icon name="alert" />{error}</span>}
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" icon="send" loading={busy} onClick={save}>Salvar e atualizar telas</Button>
      </>}>
      <div className="vx-app-editor">
        <div className="vx-form">
          <Input label="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Caixas com Wi-Fi e avisos" />
          <Field label="Modelo">
            <div className="vx-template-pick">
              {Object.entries(LAYOUT_TEMPLATES).map(([k, t]) => (
                <button key={k} type="button" className={`vx-template ${n.template === k ? 'is-on' : ''}`} aria-pressed={n.template === k} onClick={() => setF({ ...f, template: k })}>
                  <LayoutThumb template={k} bar={n.bar.enabled} side={n.sideWidth} size="sm" />
                  <b>{t.label}</b>
                  <span>{t.desc}</span>
                </button>
              ))}
            </div>
          </Field>
          {(n.template === 'side' || n.template === 'lshape') && (
            <Field label={`Largura da coluna: ${n.sideWidth}%`}>
              <input type="range" min={20} max={40} step={1} value={n.sideWidth} onChange={(e) => setF({ ...f, sideWidth: Number(e.target.value) })} className="vx-range" />
            </Field>
          )}
          {LAYOUT_TEMPLATES[n.template].zones.map((z) => (
            <Select key={z} label={ZONE_LABEL[z]} value={n.zones[z]?.playlistId || ''} onChange={(e) => setZone(z, e.target.value)}
              options={[{ value: '', label: 'Escolha a playlist' }, ...playlists.map((p) => ({ value: p.id, label: p.name }))]}
              help={z === 'side' ? 'Boa para QR do Wi-Fi, clima, cardápio ou senhas.' : z === 'foot' ? 'Faixa baixa: relógio, avisos ou cotações.' : undefined} />
          ))}

          <div className="vx-divider" />
          <Toggle label="Barra inferior" help="Faixa fixa embaixo, por cima de qualquer layout." checked={n.bar.enabled} onChange={(v) => setBar({ enabled: v })} />
          {n.bar.enabled && (
            <>
              <label className="vx-field">
                <span className="vx-label">Avisos que correm (um por linha)</span>
                <textarea className="vx-input vx-textarea" rows={3} value={(f.bar.lines || []).join('\n')} onChange={(e) => setBar({ lines: e.target.value.split('\n').slice(0, 12) })} placeholder={'Encomendas de Natal até 20/12\nAceitamos Pix'} />
              </label>
              <div className="vx-form-row">
                <Input label="Nome ao lado do logo (opcional)" value={f.bar.title || ''} maxLength={30} onChange={(e) => setBar({ title: e.target.value })} />
                <Select label="Logo" value={f.bar.logoMediaId || ''} onChange={(e) => setBar({ logoMediaId: e.target.value })}
                  options={[{ value: '', label: 'Sem logo' }, ...images.map((m) => ({ value: m.id, label: m.name }))]} help="Uma imagem da biblioteca (PNG com fundo transparente fica melhor)." />
              </div>
              <div className="vx-form-row">
                <Select label="Cores" value={n.bar.theme} onChange={(e) => setBar({ theme: e.target.value })} options={Object.entries(BAR_THEMES).map(([k, t]) => ({ value: k, label: t.label }))} />
                <Select label="Velocidade" value={n.bar.speed} onChange={(e) => setBar({ speed: e.target.value })} options={[{ value: 'slow', label: 'Devagar' }, { value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Rápido' }]} />
              </div>
              <div className="vx-form-row">
                <Toggle label="Relógio" checked={n.bar.clock} onChange={(v) => setBar({ clock: v })} />
                <Toggle label="Data embaixo do relógio" checked={n.bar.date} onChange={(v) => setBar({ date: v })} />
              </div>
            </>
          )}
          <div className="vx-divider" />
          <PillGroup label="Grupos de telas" value={f.groupIds} onChange={(groupIds) => setF({ ...f, groupIds })} options={groups.map((g) => ({ value: g.id, label: g.name }))} />
          <PillGroup label="Telas avulsas" value={f.screenIds} onChange={(screenIds) => setF({ ...f, screenIds })} options={screens.map((s) => ({ value: s.id, label: s.name }))} help="Se a tela estiver em dois layouts, vale o marcado direto nela." />
        </div>
        <div className="vx-app-preview">
          <div className="vx-section-head"><span className="vx-label">Prévia na TV</span><Chip>{LAYOUT_TEMPLATES[n.template].label}</Chip></div>
          <TvPreview manifest={preview} mainLabel="Programação da tela" />
          <p className="vx-help">A zona principal mostra a grade de cada tela. Em TVs em pé, as zonas ficam uma embaixo da outra.</p>
        </div>
      </div>
    </Modal>
  );
}
