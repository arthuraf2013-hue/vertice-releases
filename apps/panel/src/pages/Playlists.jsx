import { useMemo, useState } from 'react';
import { expandPlaylist, totalDuration, formatDuration, formatDateTime, DEFAULT_IMAGE_SECONDS } from '@vertice/shared';
import { useSession } from '../session.jsx';
import { useCol, useById } from '../data/hooks.js';
import { api } from '../data/api.js';
import { rebuildManifests, screensUsingPlaylist } from '../data/manifests.js';
import { PageHeader, Button, Card, MediaThumb, Loading, EmptyState, useToast, useConfirm, IconButton, Modal, Input, Chip } from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

export function Playlists() {
  const { base, companyId, can } = useSession();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const playlists = useCol(`${base}/playlists`, { orderBy: ['name', 'asc'] });
  const media = useCol(`${base}/media`, { orderBy: ['createdAt', 'desc'] });
  const schedules = useCol(`${base}/schedules`);
  const mediaById = useById(media);
  const [editing, setEditing] = useState(null); // playlist | {new}

  if (!playlists || !media || !schedules) return <Loading />;

  const usedBy = (pid) => schedules.filter((s) => s.fallbackPlaylistId === pid || (s.slots || []).some((sl) => sl.playlistId === pid));

  const remove = async (p) => {
    const used = usedBy(p.id);
    if (used.length) {
      return confirm({ title: 'Esta playlist está em uso', confirmLabel: 'Entendi', message: `Ela aparece nas grades ${used.map((s) => `"${s.name}"`).join(', ')}. Troque a playlist nessas grades antes de excluir.` });
    }
    const ok = await confirm({ title: `Excluir "${p.name}"?`, danger: true, confirmLabel: 'Excluir', message: 'As mídias continuam na biblioteca.' });
    if (!ok) return;
    await api.remove(`${base}/playlists/${p.id}`);
    toast('Playlist excluída.');
  };

  return (
    <div className="vx-page">
      <PageHeader overline="CONTEÚDO" title="Playlists" subtitle="Sequências de mídias com duração e validade. Use as playlists nas grades de programação."
        actions={can('editor') && <Button variant="primary" icon="plus" onClick={() => setEditing({ name: '', items: [] })}>Nova playlist</Button>} />
      {playlists.length ? (
        <div className="vx-grid-playlists">
          {playlists.map((p) => {
            const items = expandPlaylist(p, mediaById);
            const used = usedBy(p.id);
            return (
              <article key={p.id} className="vx-card vx-playlist-card">
                <div className="vx-playlist-strip">
                  {items.slice(0, 4).map((it) => <MediaThumb key={it.key} media={mediaById.get(it.mediaId)} />)}
                  {!items.length && <div className="vx-thumb vx-thumb-empty"><Icon name="playlist" /></div>}
                </div>
                <div className="vx-playlist-body">
                  <h3 className="vx-card-title">{p.name}</h3>
                  <div className="vx-faint">{items.length} {items.length === 1 ? 'mídia' : 'mídias'} · {formatDuration(totalDuration(items))} por volta</div>
                  <div className="vx-row vx-row-tight">
                    {used.length ? used.map((s) => <Chip key={s.id} tone={s.status === 'published' ? 'online' : undefined}>{s.name}</Chip>) : <span className="vx-faint">Fora das grades</span>}
                  </div>
                  <div className="vx-playlist-foot">
                    <span className="vx-faint">Editada {formatDateTime(p.updatedAt)}</span>
                    {can('editor') && (
                      <div className="vx-row vx-row-tight">
                        <IconButton icon="trash" label="Excluir" variant="danger" onClick={() => remove(p)} />
                        <Button size="sm" icon="edit" onClick={() => setEditing(p)}>Editar</Button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Card><EmptyState icon="playlist" title="Nenhuma playlist" action={can('editor') && <Button variant="primary" icon="plus" onClick={() => setEditing({ name: '', items: [] })}>Nova playlist</Button>}>
          Monte a sequência do que passa na tela: escolha as mídias, a ordem e quanto tempo cada imagem fica.
        </EmptyState></Card>
      )}
      {editing && (
        <PlaylistEditor playlist={editing} media={media} mediaById={mediaById} onClose={() => setEditing(null)}
          onSaved={async (id) => {
            const ids = await screensUsingPlaylist(companyId, id);
            if (ids.length) await rebuildManifests(companyId, ids);
            toast(ids.length ? `Playlist salva. ${ids.length} ${ids.length > 1 ? 'telas recebem' : 'tela recebe'} a mudança agora.` : 'Playlist salva.');
          }} />
      )}
      {confirmDialog}
    </div>
  );
}

function PlaylistEditor({ playlist, media, mediaById, onClose, onSaved }) {
  const { base } = useSession();
  const [name, setName] = useState(playlist.name || '');
  const [items, setItems] = useState(() => (playlist.items || []).map((it) => ({ ...it, _k: Math.random() })));
  const [picker, setPicker] = useState(!(playlist.items || []).length);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const expanded = useMemo(() => expandPlaylist({ id: 'x', items }, mediaById), [items, mediaById]);
  const move = (i, d) => setItems((xs) => {
    const a = [...xs];
    [a[i], a[i + d]] = [a[i + d], a[i]];
    return a;
  });
  const patch = (i, p) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  // Sem tempo próprio: o item usa o tempo da mídia (ajustável em Mídias).
  const add = (m) => setItems((xs) => [...xs, { mediaId: m.id, durationSec: null, _k: Math.random() }]);

  const save = async () => {
    setBusy(true);
    const clean = items.map(({ _k, ...it }) => ({
      mediaId: it.mediaId,
      durationSec: it.durationSec ? Number(it.durationSec) : null,
      validFrom: it.validFrom || null,
      validTo: it.validTo || null,
    }));
    const data = { name: name.trim() || 'Playlist sem nome', items: clean, updatedAt: api.NOW };
    let id = playlist.id;
    if (id) await api.update(`${base}/playlists/${id}`, data);
    else id = await api.add(`${base}/playlists`, { ...data, createdAt: api.NOW });
    await onSaved(id);
    setBusy(false);
    onClose();
  };

  return (
    <Modal open onClose={onClose} width={980} icon="playlist" title={playlist.id ? 'Editar playlist' : 'Nova playlist'}
      subtitle={`${items.length} ${items.length === 1 ? 'mídia' : 'mídias'} · ${formatDuration(totalDuration(expanded))} por volta`}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save} loading={busy} disabled={!items.length}>Salvar playlist</Button></>}>
      <div className="vx-form">
        <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Café da manhã" />
        <div className={`vx-pl-editor ${picker ? 'with-picker' : ''}`}>
          <div>
            <div className="vx-section-head">
              <span className="vx-label">Sequência</span>
              <Button size="sm" icon={picker ? 'x' : 'plus'} onClick={() => setPicker(!picker)}>{picker ? 'Fechar biblioteca' : 'Adicionar mídias'}</Button>
            </div>
            {items.length ? (
              <ol className="vx-pl-items">
                {items.map((it, i) => {
                  const m = mediaById.get(it.mediaId);
                  return (
                    <li key={it._k} className="vx-pl-item">
                      <span className="vx-pl-pos vx-num">{i + 1}</span>
                      <MediaThumb media={m} className="vx-pl-thumb" />
                      <div className="vx-pl-info">
                        <b title={m?.name}>{m?.name || 'Mídia removida'}</b>
                        <div className="vx-pl-fields">
                          <label className="vx-mini-field">
                            <span>{m?.type === 'video' ? 'Duração' : 'Segundos'}</span>
                            {m?.type === 'video'
                              ? <span className="vx-mini-static">{formatDuration(m.durationSec)} (vídeo inteiro)</span>
                              : <input className="vx-input" type="number" min={2} max={600} value={it.durationSec || ''} placeholder={`${m.defaultDurationSec || DEFAULT_IMAGE_SECONDS} (da mídia)`} onChange={(e) => patch(i, { durationSec: e.target.value })} />}
                          </label>
                          <label className="vx-mini-field"><span>Exibir a partir de</span><input className="vx-input" type="date" value={it.validFrom || ''} onChange={(e) => patch(i, { validFrom: e.target.value })} /></label>
                          <label className="vx-mini-field"><span>Até</span><input className="vx-input" type="date" value={it.validTo || ''} onChange={(e) => patch(i, { validTo: e.target.value })} /></label>
                        </div>
                      </div>
                      <div className="vx-pl-actions">
                        <IconButton icon="arrowUp" label="Subir" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} />
                        <IconButton icon="arrowDown" label="Descer" variant="ghost" disabled={i === items.length - 1} onClick={() => move(i, 1)} />
                        <IconButton icon="trash" label="Remover da playlist" variant="danger" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EmptyState icon="playlist" title="Sequência vazia">Clique nas mídias da biblioteca para adicionar.</EmptyState>
            )}
          </div>
          {picker && (
            <aside className="vx-pl-picker">
              <div className="vx-search"><Icon name="search" /><input className="vx-input" placeholder="Buscar na biblioteca" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              <div className="vx-pl-picker-grid">
                {media.filter((m) => m.name.toLowerCase().includes(q.toLowerCase())).map((m) => (
                  <button key={m.id} type="button" className="vx-pl-pick" onClick={() => add(m)} title={`Adicionar ${m.name}`}>
                    <MediaThumb media={m} />
                    <span>{m.name}</span>
                    <span className="vx-pl-pick-add"><Icon name="plus" /></span>
                  </button>
                ))}
                {!media.length && <p className="vx-help">Envie mídias na página Mídias.</p>}
              </div>
            </aside>
          )}
        </div>
      </div>
    </Modal>
  );
}
