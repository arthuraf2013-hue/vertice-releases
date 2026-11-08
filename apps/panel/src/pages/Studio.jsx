import { useMemo, useState } from 'react';
import {
  STUDIO_TEMPLATES, STUDIO_ICONS, APP_THEMES, appTheme, studioFields, appDefaultSeconds, formatDateTime,
} from '@vertice/shared';
import { AppView } from '@vertice/shared/apps';
import { useSession } from '../session.jsx';
import { useCol, useById } from '../data/hooks.js';
import { api } from '../data/api.js';
import { rebuildManifests } from '../data/manifests.js';
import {
  PageHeader, Button, Card, Loading, useToast, useConfirm, Modal, Input, Select, Toggle, IconButton, MediaThumb,
} from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';
import { AppPreview } from './Apps.jsx';

const TEMPLATES = Object.entries(STUDIO_TEMPLATES);
const isPiece = (m) => m.type === 'app' && m.app?.kind === 'studio';

/** Miniatura ao vivo de uma peça (o mesmo desenho da TV). */
function Mini({ config, image }) {
  return (
    <div className="vx-studio-mini">
      <AppView app={{ kind: 'studio', config }} imageSrc={image} />
    </div>
  );
}

/**
 * Estúdio: peças prontas a partir de modelos (oferta, aviso, cardápio, boas-vindas, evento).
 * A peça é desenhada ao vivo na TV: mudar um preço não exige refazer arte.
 */
export function Studio() {
  const { base, companyId, can, member } = useSession();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const media = useCol(`${base}/media`, { orderBy: ['createdAt', 'desc'] });
  const playlists = useCol(`${base}/playlists`);
  const mediaById = useById(media);
  const [edit, setEdit] = useState(null);

  const usage = useMemo(() => {
    const m = new Map();
    for (const p of playlists || []) for (const it of p.items || []) m.set(it.mediaId, (m.get(it.mediaId) || new Set()).add(p.name));
    return m;
  }, [playlists]);

  if (!media) return <Loading />;
  const pieces = media.filter(isPiece);
  const images = media.filter((m) => m.type === 'image');
  const imgUrl = (id) => mediaById.get(id)?.url || null;

  const start = (template, from) => {
    if (from) {
      const c = from.app.config || {};
      return setEdit({ id: from.id, name: from.name, seconds: from.defaultDurationSec || '', template: c.template, theme: c.theme || 'brand', colors: c.colors || null, imageMediaId: c.imageMediaId || '', fields: studioFields(c.template, c.fields) });
    }
    setEdit({ name: STUDIO_TEMPLATES[template].label, seconds: '', template, theme: 'brand', colors: null, imageMediaId: '', fields: studioFields(template, {}) });
  };

  const save = async (e) => {
    const data = {
      type: 'app',
      name: e.name.trim() || STUDIO_TEMPLATES[e.template].label,
      app: { kind: 'studio', config: { template: e.template, theme: e.theme, colors: e.colors || null, imageMediaId: e.imageMediaId || '', fields: e.fields } },
      defaultDurationSec: Number(e.seconds) || null,
      updatedAt: api.NOW,
    };
    if (e.id) {
      await api.update(`${base}/media/${e.id}`, data);
      if (usage.has(e.id)) await rebuildManifests(companyId);
      toast(usage.has(e.id) ? 'Peça salva. As telas já recebem a mudança.' : 'Peça salva.');
    } else {
      await api.add(`${base}/media`, { ...data, sizeBytes: 0, createdAt: api.NOW, createdBy: member?.name || '' });
      toast('Peça criada. Coloque numa playlist para ela aparecer nas telas.');
    }
    setEdit(null);
  };

  const duplicate = async (m) => {
    const { id, ...rest } = m; // eslint-disable-line no-unused-vars
    await api.add(`${base}/media`, { ...rest, name: `${m.name} (cópia)`, createdAt: api.NOW, updatedAt: api.NOW, createdBy: member?.name || '' });
    toast('Peça duplicada.');
  };

  const remove = async (m) => {
    const used = usage.get(m.id);
    const ok = await confirm({ title: `Excluir "${m.name}"?`, danger: true, confirmLabel: 'Excluir', message: used ? `Ela sai das playlists: ${[...used].join(', ')}.` : 'Ela não está em nenhuma playlist.' });
    if (!ok) return;
    const ops = [{ op: 'delete', path: `${base}/media/${m.id}` }];
    for (const p of playlists || []) {
      if ((p.items || []).some((it) => it.mediaId === m.id)) ops.push({ op: 'update', path: `${base}/playlists/${p.id}`, data: { items: p.items.filter((it) => it.mediaId !== m.id), updatedAt: api.NOW } });
    }
    await api.batch(ops);
    if (used) await rebuildManifests(companyId);
    toast('Peça excluída.');
  };

  return (
    <div className="vx-page">
      <PageHeader overline="CONTEÚDO" title="Estúdio" subtitle="Monte peças a partir de modelos. A TV desenha ao vivo: mudou o preço, mudou na tela." />

      <Card title="Comece por um modelo" icon="palette">
        <div className="vx-studio-templates">
          {TEMPLATES.map(([key, t]) => (
            <button key={key} type="button" className="vx-studio-tpl" onClick={() => can('editor') && start(key)} disabled={!can('editor')}>
              <Mini config={{ template: key, theme: 'brand', fields: studioFields(key, {}) }} image={t.image && images[0] ? images[0].url : null} />
              <b>{t.label}</b>
              <span className="vx-faint">{t.desc}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card title={`Suas peças${pieces.length ? ` (${pieces.length})` : ''}`} icon="layers">
        {pieces.length ? (
          <div className="vx-studio-pieces">
            {pieces.map((m) => {
              const c = m.app.config || {};
              const used = usage.get(m.id);
              return (
                <div key={m.id} className="vx-studio-piece">
                  <button type="button" className="vx-studio-piece-prev" onClick={() => can('editor') && start(null, m)} aria-label={`Editar ${m.name}`}>
                    <Mini config={c} image={imgUrl(c.imageMediaId)} />
                  </button>
                  <div className="vx-studio-piece-info">
                    <div className="vx-ellipsis"><b>{m.name}</b></div>
                    <span className="vx-faint">{STUDIO_TEMPLATES[c.template]?.label || 'Peça'} · {used ? `em ${used.size} ${used.size === 1 ? 'playlist' : 'playlists'}` : 'fora das playlists'}</span>
                    {m.updatedAt && <span className="vx-faint">Editada {formatDateTime(m.updatedAt)}</span>}
                  </div>
                  {can('editor') && (
                    <div className="vx-row-actions">
                      <Button size="sm" icon="edit" onClick={() => start(null, m)}>Editar</Button>
                      <IconButton icon="layers" label="Duplicar" variant="ghost" onClick={() => duplicate(m)} />
                      <IconButton icon="trash" label="Excluir" variant="danger" onClick={() => remove(m)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : <p className="vx-muted" style={{ margin: 0 }}>Nenhuma peça ainda. Escolha um modelo acima para criar a primeira.</p>}
      </Card>

      {edit && <PieceEditor value={edit} onChange={setEdit} images={images} imgUrl={imgUrl} onClose={() => setEdit(null)} onSave={save} />}
      {confirmDialog}
    </div>
  );
}

function PieceEditor({ value, onChange, images, imgUrl, onClose, onSave }) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const tpl = STUDIO_TEMPLATES[value.template];
  const set = (p) => onChange({ ...value, ...p });
  const setField = (k, v) => onChange({ ...value, fields: { ...value.fields, [k]: v } });
  const base = appTheme(value.theme);
  const colors = value.colors || null;
  const config = { template: value.template, theme: value.theme, colors, imageMediaId: value.imageMediaId, fields: value.fields };
  const submit = async () => { setBusy(true); try { await onSave(value); } finally { setBusy(false); } };

  return (
    <Modal open onClose={onClose} width={1100} icon="palette" title={value.id ? `Editar peça · ${tpl.label}` : `Nova peça · ${tpl.label}`} subtitle={tpl.desc}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit} loading={busy}>Salvar peça</Button></>}>
      <div className="vx-app-editor">
        <div className="vx-form">
          <div className="vx-form-row">
            <Input label="Nome da peça" value={value.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
            <Input label="Tempo na playlist (s)" type="number" min={3} max={600} value={value.seconds} placeholder={String(appDefaultSeconds('studio'))} onChange={(e) => set({ seconds: e.target.value })} />
          </div>
          {tpl.fields.map(([key, label, type, , max]) => {
            const v = value.fields[key] ?? '';
            if (type === 'icon') {
              return (
                <div key={key} className="vx-field">
                  <span className="vx-label">{label}</span>
                  <div className="vx-chips">{Object.entries(STUDIO_ICONS).map(([k, l]) => <button key={k} type="button" className={`vx-chip-btn ${v === k ? 'is-on' : ''}`} onClick={() => setField(key, k)}>{l}</button>)}</div>
                </div>
              );
            }
            if (type === 'area' || type === 'lines') {
              return (
                <label key={key} className="vx-field">
                  <span className="vx-label">{label}</span>
                  <textarea className="vx-input vx-textarea" rows={type === 'lines' ? 5 : 3} maxLength={type === 'lines' ? 600 : max} value={v} onChange={(e) => setField(key, e.target.value)} />
                </label>
              );
            }
            return <Input key={key} label={label} value={v} maxLength={max || 20} inputMode={type === 'money' ? 'decimal' : undefined} onChange={(e) => setField(key, e.target.value)} placeholder={type === 'money' ? 'Em branco: não mostra' : undefined} />;
          })}

          {tpl.image && (
            <div className="vx-field">
              <span className="vx-label">Foto</span>
              <div className="vx-studio-photo">
                {value.imageMediaId && imgUrl(value.imageMediaId) ? <img src={imgUrl(value.imageMediaId)} alt="" /> : <span className="vx-faint">Sem foto</span>}
                <Button size="sm" icon="image" onClick={() => setPicking(true)}>{value.imageMediaId ? 'Trocar' : 'Escolher da biblioteca'}</Button>
                {value.imageMediaId && <Button size="sm" variant="ghost" onClick={() => set({ imageMediaId: '' })}>Tirar</Button>}
              </div>
              <span className="vx-help">A foto vem de Mídias e é baixada pela TV junto com a peça (funciona sem internet).</span>
            </div>
          )}

          <div className="vx-form-row">
            <Select label="Cores" value={value.theme} onChange={(e) => set({ theme: e.target.value })} options={Object.entries(APP_THEMES).map(([k, t]) => ({ value: k, label: t.label }))} />
            <Toggle label="Cores próprias" checked={!!colors} onChange={(on) => set({ colors: on ? { bg: base.bg, fg: base.fg, accent: base.accent } : null })} />
          </div>
          {colors && (
            <div className="vx-studio-colors">
              {[['bg', 'Fundo'], ['fg', 'Texto'], ['accent', 'Destaque']].map(([k, l]) => (
                <label key={k} className="vx-studio-color">
                  <input type="color" value={colors[k]} onChange={(e) => set({ colors: { ...colors, [k]: e.target.value } })} />
                  <span>{l}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <AppPreview app={{ kind: 'studio', config }} imageSrc={imgUrl(value.imageMediaId)} />
      </div>
      {picking && (
        <Modal open onClose={() => setPicking(false)} width={860} icon="image" title="Escolher foto" subtitle="Imagens enviadas em Mídias.">
          {images.length ? (
            <div className="vx-adv-picker">
              {images.map((m) => (
                <button key={m.id} type="button" className={`vx-adv-pick ${value.imageMediaId === m.id ? 'is-on' : ''}`} onClick={() => { set({ imageMediaId: m.id }); setPicking(false); }}>
                  <MediaThumb media={m} />
                  <span className="vx-ellipsis">{m.name}</span>
                </button>
              ))}
            </div>
          ) : <p className="vx-muted">Nenhuma imagem em Mídias ainda. Envie uma foto por lá.</p>}
        </Modal>
      )}
    </Modal>
  );
}
