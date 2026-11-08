import { useMemo, useRef, useState } from 'react';
import { formatBytes, formatDateTime, formatDuration } from '@vertice/shared';
import { useSession } from '../session.jsx';
import { useCol } from '../data/hooks.js';
import { api } from '../data/api.js';
import { rebuildManifests } from '../data/manifests.js';
import { PageHeader, Button, Card, MediaThumb, Loading, EmptyState, useToast, useConfirm, IconButton, Segmented, Modal } from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';
import { MediaSettings } from './MediaSettings.jsx';

const MAX_BYTES = 500 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm';

/** Lê dimensões/duração e gera um pôster (para vídeos) antes de subir. */
async function inspect(file) {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith('image/')) {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = url;
      });
      return { type: 'image', width: img.naturalWidth, height: img.naturalHeight };
    }
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.src = url;
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; });
    v.currentTime = Math.min(1, (v.duration || 2) / 2);
    await new Promise((res) => { v.onseeked = res; setTimeout(res, 1500); });
    const c = document.createElement('canvas');
    c.width = 480;
    c.height = Math.round((480 * v.videoHeight) / (v.videoWidth || 16)) || 270;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    const thumb = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.8));
    return { type: 'video', width: v.videoWidth, height: v.videoHeight, durationSec: Math.round(v.duration * 10) / 10, thumb };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function Media() {
  const { base, companyId, company, can, member, user } = useSession();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const allMedia = useCol(`${base}/media`, { orderBy: ['createdAt', 'desc'] });
  // Aplicativos também são "mídias" (entram nas playlists), mas moram em Aplicativos e Price.
  const media = useMemo(() => allMedia && allMedia.filter((m) => m.type !== 'app'), [allMedia]);
  const playlists = useCol(`${base}/playlists`);
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');
  const [uploads, setUploads] = useState([]); // {name, progress, error}
  const [drag, setDrag] = useState(false);
  const [settings, setSettings] = useState(null); // ids das mídias em ajuste
  const [selected, setSelected] = useState(() => new Set());
  const selecting = selected.size > 0;
  const toggleSel = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const inputRef = useRef(null);

  const usage = useMemo(() => {
    const m = new Map();
    for (const p of playlists || []) for (const it of p.items || []) m.set(it.mediaId, (m.get(it.mediaId) || new Set()).add(p.name));
    return m;
  }, [playlists]);

  if (!media) return <Loading />;
  const quota = (company.storageQuotaMB || 0) * 1024 * 1024;
  const used = company.storageUsedBytes || 0;
  const pct = quota ? Math.round((used / quota) * 100) : 0;
  const shown = media.filter((m) => (type === 'all' || m.type === type) && m.name.toLowerCase().includes(q.toLowerCase()));

  const handleFiles = async (files) => {
    if (!can('editor')) return;
    let budget = quota - used;
    for (const file of [...files]) {
      const row = { id: Math.random(), name: file.name, progress: 0 };
      setUploads((u) => [...u, row]);
      const patch = (p) => setUploads((u) => u.map((x) => (x.id === row.id ? { ...x, ...p } : x)));
      try {
        if (!ACCEPT.split(',').includes(file.type)) throw new Error('Formato não suportado. Use JPG, PNG, WEBP, GIF, MP4 ou WEBM.');
        if (file.size > MAX_BYTES) throw new Error('Arquivo acima de 500 MB.');
        if (quota && file.size > budget) throw new Error('Sem espaço no plano. Exclua mídias ou amplie o plano.');
        const meta = await inspect(file);
        const id = api.newId(`${base}/media`);
        const ext = (file.name.split('.').pop() || (meta.type === 'video' ? 'mp4' : 'jpg')).toLowerCase();
        const storagePath = `${base}/media/${id}.${ext}`;
        const { url } = await api.upload(storagePath, file, (p) => patch({ progress: p }));
        let thumbUrl = meta.type === 'image' ? url : null;
        let thumbPath = null;
        if (meta.thumb) {
          thumbPath = `${base}/media/${id}_thumb.jpg`;
          thumbUrl = (await api.upload(thumbPath, new File([meta.thumb], 'thumb.jpg', { type: 'image/jpeg' }))).url;
        }
        await api.batch([
          { op: 'set', path: `${base}/media/${id}`, data: {
            name: file.name, type: meta.type, url, thumbUrl, ext, sizeBytes: file.size, storagePath, thumbPath,
            width: meta.width, height: meta.height, durationSec: meta.durationSec || null,
            createdAt: api.NOW, createdBy: member?.name || user?.email,
          } },
          { op: 'update', path: base, data: { storageUsedBytes: api.inc(file.size) } },
        ]);
        budget -= file.size;
        setUploads((u) => u.filter((x) => x.id !== row.id));
      } catch (e) {
        patch({ error: e.message });
      }
    }
  };

  /** Exclui uma ou várias mídias (tira das playlists e recompila as telas). */
  const removeMany = async (list) => {
    const ids = new Set(list.map((m) => m.id));
    const lists = [...new Set(list.flatMap((m) => [...(usage.get(m.id) || [])]))];
    const one = list.length === 1;
    const ok = await confirm({
      title: one ? `Excluir "${list[0].name}"?` : `Excluir ${list.length} mídias?`, danger: true, confirmLabel: one ? 'Excluir mídia' : 'Excluir mídias',
      message: lists.length ? `${one ? 'Ela sai' : 'Elas saem'} das playlists ${lists.join(', ')} e das telas em seguida.` : `${one ? 'Ela não está' : 'Nenhuma delas está'} em playlist.`,
    });
    if (!ok) return;
    const bytes = list.reduce((a, m) => a + (m.sizeBytes || 0), 0);
    const ops = [
      ...list.map((m) => ({ op: 'delete', path: `${base}/media/${m.id}` })),
      { op: 'update', path: base, data: { storageUsedBytes: api.inc(-bytes) } },
    ];
    for (const p of playlists || []) {
      if ((p.items || []).some((it) => ids.has(it.mediaId))) {
        ops.push({ op: 'update', path: `${base}/playlists/${p.id}`, data: { items: p.items.filter((it) => !ids.has(it.mediaId)), updatedAt: api.NOW } });
      }
    }
    await api.batch(ops);
    await Promise.all(list.flatMap((m) => [m.storagePath && api.deleteFile(m.storagePath), m.thumbPath && api.deleteFile(m.thumbPath)]));
    if (lists.length) await rebuildManifests(companyId);
    setSelected(new Set());
    toast(one ? 'Mídia excluída.' : `${list.length} mídias excluídas.`);
  };

  /** Grava os ajustes (uma ou várias mídias) e atualiza as TVs. */
  const saveSettings = async (changes, { clearPlaylistDurations }) => {
    const ops = changes.map((c) => ({ op: 'update', path: `${base}/media/${c.id}`, data: c.patch }));
    const clear = new Set(clearPlaylistDurations);
    if (clear.size) {
      for (const p of playlists || []) {
        if ((p.items || []).some((it) => clear.has(it.mediaId) && it.durationSec)) {
          ops.push({ op: 'update', path: `${base}/playlists/${p.id}`, data: {
            items: p.items.map((it) => (clear.has(it.mediaId) ? { ...it, durationSec: null } : it)), updatedAt: api.NOW,
          } });
        }
      }
    }
    if (!ops.length) return;
    await api.batch(ops);
    await rebuildManifests(companyId);
    toast(changes.length > 1 ? `${changes.length} mídias ajustadas. As TVs recebem em segundos.` : 'Ajustes salvos. As TVs recebem em segundos.');
    setSelected(new Set());
  };

  return (
    <div className="vx-page" onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={(e) => e.currentTarget === e.target && setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}>
      <PageHeader overline="CONTEÚDO" title="Mídias" subtitle="Imagens e vídeos da sua empresa. As TVs baixam só o que está na programação delas."
        actions={can('editor') && <Button variant="primary" icon="upload" onClick={() => inputRef.current?.click()}>Enviar mídias</Button>} />
      <input ref={inputRef} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />

      <Card className="vx-storage">
        <div className="vx-storage-row">
          <span className="vx-tile"><Icon name="storage" /></span>
          <div className="vx-storage-text">
            <b>{formatBytes(used)} de {formatBytes(quota)}</b>
            <span className="vx-faint">{media.length} mídias · {media.filter((m) => m.type === 'video').length} vídeos · {media.filter((m) => m.type === 'image').length} imagens</span>
          </div>
          <span className="vx-metric-delta" style={{ color: pct >= 80 ? 'var(--status-warn)' : undefined }}>{pct}%</span>
        </div>
        <div className="vx-bar"><i style={{ width: `${pct}%`, background: pct >= 80 ? 'var(--status-warn)' : undefined }} /></div>
      </Card>

      {uploads.length > 0 && (
        <Card title="Enviando" icon="upload">
          <ul className="vx-uploads">
            {uploads.map((u) => (
              <li key={u.id}>
                <span className="vx-upload-name">{u.name}</span>
                {u.error ? (
                  <><span className="vx-badge vx-badge-offline"><Icon name="alert" />{u.error}</span><IconButton icon="x" label="Dispensar" variant="ghost" onClick={() => setUploads((x) => x.filter((y) => y.id !== u.id))} /></>
                ) : (
                  <><div className="vx-bar vx-upload-bar"><i style={{ width: `${Math.round(u.progress * 100)}%`, background: 'var(--status-sync)' }} /></div><span className="vx-num vx-faint">{Math.round(u.progress * 100)}%</span></>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="vx-toolbar">
        <div className="vx-search"><Icon name="search" /><input className="vx-input" placeholder="Buscar mídia" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar mídia" /></div>
        <Segmented value={type} onChange={setType} options={[{ value: 'all', label: 'Todas' }, { value: 'image', label: 'Imagens', icon: 'image' }, { value: 'video', label: 'Vídeos', icon: 'video' }]} />
      </div>

      {selecting && (
        <div className="vx-selbar" role="toolbar" aria-label="Mídias selecionadas">
          <b>{selected.size} {selected.size === 1 ? 'selecionada' : 'selecionadas'}</b>
          <button type="button" className="vx-link-btn" onClick={() => setSelected(new Set(shown.map((m) => m.id)))}>Selecionar as {shown.length} visíveis</button>
          <span className="vx-mr-auto" />
          <Button size="sm" variant="primary" icon="edit" onClick={() => setSettings([...selected])}>Ajustar</Button>
          {can('editor') && <Button size="sm" variant="destructive" icon="trash" onClick={() => removeMany(media.filter((m) => selected.has(m.id)))}>Excluir</Button>}
          <IconButton icon="x" label="Limpar seleção" variant="ghost" onClick={() => setSelected(new Set())} />
        </div>
      )}

      {drag && can('editor') && <div className="vx-dropzone is-active"><Icon name="upload" />Solte os arquivos para enviar</div>}

      {shown.length ? (
        <div className="vx-grid-media">
          {shown.map((m) => {
            const lists = [...(usage.get(m.id) || [])];
            return (
              <article key={m.id} className={`vx-card vx-media-card ${selected.has(m.id) ? 'is-selected' : ''} ${selecting ? 'is-selecting' : ''}`}>
                <label className="vx-media-check" title="Selecionar">
                  <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleSel(m.id)} aria-label={`Selecionar ${m.name}`} />
                  <span aria-hidden><Icon name="check" /></span>
                </label>
                <button type="button" className="vx-media-open" onClick={() => (selecting ? toggleSel(m.id) : setSettings([m.id]))} aria-label={selecting ? `Selecionar ${m.name}` : `Ajustar ${m.name}`}>
                  <MediaThumb media={m} />
                  {(m.fit || m.validFrom || m.validTo || m.muted || m.defaultDurationSec) && <span className="vx-media-flag" title="Tem ajustes próprios"><Icon name="edit" /></span>}
                </button>
                <div className="vx-media-body">
                  <div className="vx-media-name" title={m.name}>{m.name}</div>
                  <div className="vx-faint vx-media-meta">
                    {m.type === 'video' ? formatDuration(m.durationSec) : `${m.width}×${m.height}`} · {formatBytes(m.sizeBytes)}
                    {m.type === 'image' && m.defaultDurationSec ? ` · ${m.defaultDurationSec} s` : ''}
                    {m.validTo ? ` · até ${m.validTo.split('-').reverse().slice(0, 2).join('/')}` : ''}
                  </div>
                  <div className="vx-media-foot">
                    <span className={`vx-media-use ${lists.length ? '' : 'is-unused'}`}>{lists.length ? `Em ${lists.length} ${lists.length > 1 ? 'playlists' : 'playlist'}` : 'Fora das playlists'}</span>
                    {can('editor') && <IconButton icon="trash" label="Excluir" variant="danger" onClick={() => removeMany([m])} />}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState icon="image" title={media.length ? 'Nada encontrado' : 'Sua biblioteca está vazia'}
            action={can('editor') && !media.length && <Button variant="primary" icon="upload" onClick={() => inputRef.current?.click()}>Enviar mídias</Button>}>
            {media.length ? 'Tente outro nome ou filtro.' : 'Arraste imagens e vídeos para cá. Recomendado: 1920×1080 (horizontal) ou 1080×1920 (vertical), MP4 H.264.'}
          </EmptyState>
        </Card>
      )}

      {settings && (
        <MediaSettings items={media.filter((m) => settings.includes(m.id))} readOnly={!can('editor')}
          onClose={() => setSettings(null)} onSave={saveSettings} />
      )}
      {confirmDialog}
    </div>
  );
}
