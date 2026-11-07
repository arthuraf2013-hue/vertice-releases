import { useMemo, useState } from 'react';
import { WEEKDAYS, toMinutes, formatDateTime } from '@vertice/shared';
import { useSession } from '../session.jsx';
import { useCol, useById } from '../data/hooks.js';
import { api } from '../data/api.js';
import { rebuildManifests } from '../data/manifests.js';
import {
  PageHeader, Button, Card, Table, Loading, EmptyState, useToast, useConfirm, IconButton, Modal, Input, Select,
  PillGroup, Chip, StatusBadge, Field,
} from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

const PRIORITIES = [
  { value: 0, label: 'Normal' },
  { value: 10, label: 'Alta (campanha)' },
  { value: 20, label: 'Máxima (urgente)' },
];
const PALETTE = ['var(--data-1)', 'var(--data-2)', 'var(--data-3)', 'var(--status-sync)', 'var(--status-online)', 'var(--accent)'];

export function Schedules() {
  const { base, companyId, can } = useSession();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const schedules = useCol(`${base}/schedules`, { orderBy: ['name', 'asc'] });
  const playlists = useCol(`${base}/playlists`, { orderBy: ['name', 'asc'] });
  const groups = useCol(`${base}/groups`, { orderBy: ['name', 'asc'] });
  const screens = useCol(`${base}/screens`, { orderBy: ['code', 'asc'] });
  const groupById = useById(groups);
  const [editing, setEditing] = useState(null);

  if (!schedules || !playlists || !groups || !screens) return <Loading />;

  const reach = (s) => screens.filter((scr) => (s.screenIds || []).includes(scr.id) || (s.groupIds || []).some((g) => (scr.groupIds || []).includes(g))).length;

  const setStatus = async (s, status) => {
    await api.update(`${base}/schedules/${s.id}`, { status, ...(status === 'published' ? { publishedAt: api.NOW } : {}), updatedAt: api.NOW });
    const n = await rebuildManifests(companyId);
    toast(status === 'published' ? `"${s.name}" publicada em ${reach(s)} ${reach(s) === 1 ? 'tela' : 'telas'}.` : `"${s.name}" voltou para rascunho.`);
    return n;
  };
  const remove = async (s) => {
    const ok = await confirm({ title: `Excluir a grade "${s.name}"?`, danger: true, confirmLabel: 'Excluir', message: s.status === 'published' ? 'As telas param de seguir esta grade agora.' : 'Ela está em rascunho e não afeta as telas.' });
    if (!ok) return;
    await api.remove(`${base}/schedules/${s.id}`);
    if (s.status === 'published') await rebuildManifests(companyId);
    toast('Grade excluída.');
  };

  return (
    <div className="vx-page">
      <PageHeader overline="CONTEÚDO" title="Programação" subtitle="Grades por dia e horário, publicadas para grupos de telas. Fora dos horários, a tela toca a playlist padrão."
        actions={can('editor') && <Button variant="primary" icon="plus" onClick={() => setEditing({ name: '', priority: 0, groupIds: [], screenIds: [], slots: [{ days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00', playlistId: playlists[0]?.id || '' }] })}>Nova grade</Button>} />
      <Card pad={false}>
        <Table rows={schedules} onRowClick={can('editor') ? setEditing : undefined}
          empty={<EmptyState icon="calendar" title="Nenhuma grade">Crie uma grade dizendo qual playlist toca em cada horário.</EmptyState>}
          columns={[
            { key: 'name', label: 'Grade', render: (s) => <b>{s.name}</b> },
            { key: 'status', label: 'Situação', render: (s) => s.status === 'published' ? <StatusBadge status="online">Publicada</StatusBadge> : <StatusBadge status="idle">Rascunho</StatusBadge> },
            { key: 'target', label: 'Para', render: (s) => (
              <div className="vx-row vx-row-tight">
                {(s.groupIds || []).map((g) => groupById.get(g) && <Chip key={g}>{groupById.get(g).name}</Chip>)}
                {(s.screenIds || []).length > 0 && <Chip>{s.screenIds.length} {s.screenIds.length > 1 ? 'telas avulsas' : 'tela avulsa'}</Chip>}
              </div>
            ) },
            { key: 'reach', label: 'Telas', width: 70, render: (s) => <span className="vx-num">{reach(s)}</span> },
            { key: 'slots', label: 'Faixas', width: 70, render: (s) => <span className="vx-num">{(s.slots || []).length}</span> },
            { key: 'prio', label: 'Prioridade', render: (s) => PRIORITIES.find((p) => p.value === (s.priority || 0))?.label },
            { key: 'upd', label: 'Atualizada', render: (s) => <span className="vx-faint">{formatDateTime(s.updatedAt)}</span> },
            { key: 'a', label: '', align: 'right', width: 150, render: (s) => can('editor') && (
              <div className="vx-row vx-row-tight vx-row-end" onClick={(e) => e.stopPropagation()}>
                {s.status === 'published'
                  ? <Button size="sm" onClick={() => setStatus(s, 'draft')}>Despublicar</Button>
                  : <Button size="sm" icon="send" onClick={() => setStatus(s, 'published')}>Publicar</Button>}
                <IconButton icon="trash" label="Excluir" variant="danger" onClick={() => remove(s)} />
              </div>
            ) },
          ]} />
      </Card>
      <p className="vx-help">Quando duas grades valem para a mesma tela no mesmo horário, a de prioridade maior passa na frente. Empate: a publicada por último.</p>
      {editing && <ScheduleEditor schedule={editing} playlists={playlists} groups={groups} screens={screens} onClose={() => setEditing(null)}
        onSaved={async (publish) => { await rebuildManifests(companyId); toast(publish ? 'Grade publicada. As telas já estão recebendo.' : 'Rascunho salvo.'); }} />}
      {confirmDialog}
    </div>
  );
}

function ScheduleEditor({ schedule, playlists, groups, screens, onClose, onSaved }) {
  const { base } = useSession();
  const [f, setF] = useState(() => ({
    name: schedule.name || '', priority: schedule.priority || 0, groupIds: schedule.groupIds || [], screenIds: schedule.screenIds || [],
    fallbackPlaylistId: schedule.fallbackPlaylistId || '', slots: (schedule.slots || []).map((s) => ({ ...s, _k: Math.random() })),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const plById = useMemo(() => new Map(playlists.map((p, i) => [p.id, { ...p, color: PALETTE[i % PALETTE.length] }])), [playlists]);
  const patchSlot = (i, p) => setF({ ...f, slots: f.slots.map((s, j) => (j === i ? { ...s, ...p } : s)) });

  const save = async (publish) => {
    if (!f.name.trim()) return setError('Dê um nome para a grade.');
    if (!f.groupIds.length && !f.screenIds.length) return setError('Escolha pelo menos um grupo ou uma tela.');
    if (f.slots.some((s) => !s.playlistId || !s.days.length)) return setError('Cada faixa precisa de dias e de uma playlist.');
    if (f.slots.some((s) => s.start === s.end)) return setError('Uma faixa tem início igual ao fim.');
    setBusy(true);
    const data = {
      name: f.name.trim(), priority: Number(f.priority), groupIds: f.groupIds, screenIds: f.screenIds,
      fallbackPlaylistId: f.fallbackPlaylistId || null,
      slots: f.slots.map(({ _k, ...s }) => ({ days: [...s.days].sort(), start: s.start, end: s.end, playlistId: s.playlistId })),
      updatedAt: api.NOW,
      ...(publish ? { status: 'published', publishedAt: api.NOW } : schedule.id ? {} : { status: 'draft' }),
    };
    if (schedule.id) await api.update(`${base}/schedules/${schedule.id}`, data);
    else await api.add(`${base}/schedules`, { ...data, createdAt: api.NOW });
    await onSaved(publish || schedule.status === 'published');
    setBusy(false);
    onClose();
  };

  return (
    <Modal open onClose={onClose} width={1000} icon="calendar" title={schedule.id ? 'Editar grade' : 'Nova grade'}
      subtitle={schedule.status === 'published' ? 'Publicada: ao salvar, as telas recebem a mudança na hora.' : 'Rascunho: não afeta as telas até publicar.'}
      footer={<>
        {error && <span className="vx-field-error vx-mr-auto"><Icon name="alert" />{error}</span>}
        <Button onClick={onClose}>Cancelar</Button>
        {schedule.status !== 'published' && <Button onClick={() => save(false)} loading={busy}>Salvar rascunho</Button>}
        <Button variant="primary" icon="send" onClick={() => save(true)} loading={busy}>{schedule.status === 'published' ? 'Salvar e atualizar telas' : 'Publicar'}</Button>
      </>}>
      <div className="vx-form">
        <div className="vx-form-row">
          <Input label="Nome da grade" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Grade da semana" />
          <Select label="Prioridade" value={f.priority} onChange={(e) => setF({ ...f, priority: Number(e.target.value) })} options={PRIORITIES} help="Campanhas com prioridade alta passam na frente da grade normal." />
        </div>
        <div className="vx-form-row">
          <PillGroup label="Grupos de telas" value={f.groupIds} onChange={(groupIds) => setF({ ...f, groupIds })} options={groups.map((g) => ({ value: g.id, label: g.name }))} />
          <PillGroup label="Telas avulsas" value={f.screenIds} onChange={(screenIds) => setF({ ...f, screenIds })} options={screens.map((s) => ({ value: s.id, label: s.name }))} help="Use para uma tela fora dos grupos." />
        </div>

        <Field label="Faixas de horário">
          <div className="vx-slots">
            {f.slots.map((s, i) => (
              <div key={s._k} className="vx-slot">
                <span className="vx-slot-swatch" style={{ background: plById.get(s.playlistId)?.color || 'var(--line-strong)' }} />
                <div className="vx-days">
                  {WEEKDAYS.map((d, di) => (
                    <button key={d} type="button" className={`vx-day ${s.days.includes(di) ? 'is-on' : ''}`} aria-pressed={s.days.includes(di)}
                      onClick={() => patchSlot(i, { days: s.days.includes(di) ? s.days.filter((x) => x !== di) : [...s.days, di] })}>{d}</button>
                  ))}
                </div>
                <input className="vx-input vx-time" type="time" value={s.start} onChange={(e) => patchSlot(i, { start: e.target.value })} aria-label="Início" />
                <span className="vx-faint">até</span>
                <input className="vx-input vx-time" type="time" value={s.end === '24:00' ? '23:59' : s.end} onChange={(e) => patchSlot(i, { end: e.target.value })} aria-label="Fim" />
                <div className="vx-select-wrap vx-slot-pl">
                  <select className="vx-input vx-select" value={s.playlistId} onChange={(e) => patchSlot(i, { playlistId: e.target.value })} aria-label="Playlist">
                    <option value="">Escolha a playlist</option>
                    {playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <Icon name="chevronDown" />
                </div>
                <IconButton icon="trash" label="Remover faixa" variant="danger" onClick={() => setF({ ...f, slots: f.slots.filter((_, j) => j !== i) })} />
              </div>
            ))}
            <Button size="sm" icon="plus" onClick={() => setF({ ...f, slots: [...f.slots, { days: [1, 2, 3, 4, 5], start: '08:00', end: '12:00', playlistId: '', _k: Math.random() }] })}>Adicionar faixa</Button>
          </div>
        </Field>

        <Select label="Fora dos horários, tocar" value={f.fallbackPlaylistId} onChange={(e) => setF({ ...f, fallbackPlaylistId: e.target.value })}
          options={[{ value: '', label: 'Nada (a tela mostra "Sem programação")' }, ...playlists.map((p) => ({ value: p.id, label: p.name }))]} />

        <WeekPreview slots={f.slots} plById={plById} fallback={plById.get(f.fallbackPlaylistId)} />
      </div>
    </Modal>
  );
}

/** Semana em 7 colunas × 24 h: mostra de relance o que toca quando. */
function WeekPreview({ slots, plById, fallback }) {
  const H0 = 5;
  const H1 = 24;
  const pct = (min) => ((Math.max(H0 * 60, Math.min(H1 * 60, min)) - H0 * 60) / ((H1 - H0) * 60)) * 100;
  const blocks = [];
  slots.forEach((s, i) => {
    const pl = plById.get(s.playlistId);
    const a = toMinutes(s.start);
    const b = toMinutes(s.end);
    for (const d of s.days) {
      if (a < b) blocks.push({ d, a, b, pl, i });
      else {
        blocks.push({ d, a, b: 1440, pl, i });
        blocks.push({ d: (d + 1) % 7, a: 0, b, pl, i });
      }
    }
  });
  return (
    <Field label="Prévia da semana">
      <div className="vx-week">
        <div className="vx-week-hours">{[6, 9, 12, 15, 18, 21].map((h) => <span key={h} style={{ top: `${pct(h * 60)}%` }}>{String(h).padStart(2, '0')}h</span>)}</div>
        {WEEKDAYS.map((d, di) => (
          <div key={d} className="vx-week-col">
            <div className="vx-week-day">{d}</div>
            <div className="vx-week-track" style={{ background: fallback ? `repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, ${fallback.color} 16%, transparent) 6px 12px)` : undefined }}>
              {blocks.filter((b) => b.d === di && b.b > H0 * 60).map((b, k) => (
                <div key={k} className="vx-week-block" style={{ top: `${pct(b.a)}%`, height: `${pct(b.b) - pct(b.a)}%`, background: b.pl?.color || 'var(--line-strong)' }} title={`${b.pl?.name || 'Sem playlist'} · ${b.a / 60 | 0}h–${b.b / 60 | 0}h`}>
                  <span>{b.pl?.name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {fallback && <div className="vx-help"><span className="vx-week-legend" style={{ background: `repeating-linear-gradient(135deg, transparent 0 3px, ${fallback.color} 3px 5px)` }} />Hachurado: playlist padrão "{fallback.name}".</div>}
    </Field>
  );
}
