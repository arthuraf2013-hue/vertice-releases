import { useEffect, useMemo, useState } from 'react';
import { normalizeHours, HOURS_DEFAULTS, describeAudit, formatDateTime, timeAgo } from '@vertice/shared';
import { useSession } from '../session.jsx';
import { useCol } from '../data/hooks.js';
import { api } from '../data/api.js';
import { rebuildManifests } from '../data/manifests.js';
import {
  Button, Card, Input, Select, Toggle, Loading, EmptyState, Modal, useToast, useConfirm, IconButton, Field, Chip, Segmented,
} from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Campos do horário de funcionamento (empresa ou unidade). */
export function HoursFields({ value, onChange, disabled }) {
  const h = { ...HOURS_DEFAULTS, ...(value || {}) };
  const set = (p) => onChange({ ...h, ...p });
  const setVol = (i, p) => set({ volumes: h.volumes.map((v, j) => (j === i ? { ...v, ...p } : v)) });
  return (
    <fieldset className="vx-form" disabled={disabled}>
      <Toggle label="Desligar as telas fora do expediente" help="Fora do horário a TV escurece e para de tocar. Ela continua ligada para receber mudanças." checked={!!h.enabled} onChange={(v) => set({ enabled: v })} />
      {h.enabled && (
        <>
          <Field label="Dias de funcionamento">
            <div className="vx-days">
              {WEEKDAYS.map((d, i) => (
                <button key={d} type="button" className={`vx-day ${h.days.includes(i) ? 'is-on' : ''}`} aria-pressed={h.days.includes(i)}
                  onClick={() => set({ days: h.days.includes(i) ? h.days.filter((x) => x !== i) : [...h.days, i].sort() })}>{d}</button>
              ))}
            </div>
          </Field>
          <div className="vx-form-row">
            <Input label="Abre às" type="time" value={h.open} onChange={(e) => set({ open: e.target.value })} />
            <Input label="Fecha às" type="time" value={h.close} onChange={(e) => set({ close: e.target.value })} help="Pode passar da meia-noite (ex.: 18:00 às 02:00)." />
          </div>
          <Segmented label="Fora do expediente, a tela mostra" value={h.closedMode} onChange={(v) => set({ closedMode: v })}
            options={[{ value: 'black', label: 'Tela preta' }, { value: 'clock', label: 'Relógio discreto' }, { value: 'message', label: 'Aviso de fechado' }]} />
          {h.closedMode === 'message' && <Input label="Aviso" value={h.closedText} maxLength={80} onChange={(e) => set({ closedText: e.target.value })} help="Embaixo aparece quando abre de novo." />}
        </>
      )}
      <div className="vx-divider" />
      <Field label={`Volume dos vídeos: ${h.volume}%`} help="Vale para todas as telas, fora das faixas abaixo.">
        <input type="range" className="vx-range" min={0} max={100} step={5} value={h.volume} onChange={(e) => set({ volume: Number(e.target.value) })} />
      </Field>
      <Field label="Volume por horário" help="Ex.: mais baixo no almoço, sem som depois das 22h.">
        <div className="vx-vol-list">
          {h.volumes.map((v, i) => (
            <div key={i} className="vx-vol-row">
              <input className="vx-input vx-time" type="time" value={v.start} onChange={(e) => setVol(i, { start: e.target.value })} aria-label="Início" />
              <span className="vx-faint">até</span>
              <input className="vx-input vx-time" type="time" value={v.end} onChange={(e) => setVol(i, { end: e.target.value })} aria-label="Fim" />
              <input type="range" className="vx-range" min={0} max={100} step={5} value={v.level} onChange={(e) => setVol(i, { level: Number(e.target.value) })} aria-label="Volume" />
              <span className="vx-num vx-vol-pct">{v.level}%</span>
              <IconButton icon="trash" label="Remover faixa de volume" variant="danger" onClick={() => set({ volumes: h.volumes.filter((_, j) => j !== i) })} />
            </div>
          ))}
          {h.volumes.length < 6 && <Button size="sm" icon="plus" onClick={() => set({ volumes: [...h.volumes, { start: '12:00', end: '14:00', level: 40 }] })}>Adicionar faixa de volume</Button>}
        </div>
      </Field>
    </fieldset>
  );
}

/** Empresa › Horário: o padrão de todas as telas (cada unidade pode ter o seu). */
export function CompanyHours() {
  const { base, company, companyId, can } = useSession();
  const toast = useToast();
  const [h, setH] = useState(() => normalizeHours(company.hours));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.update(base, { hours: normalizeHours(h) });
      await rebuildManifests(companyId);
      toast('Horário salvo. As telas já seguem o novo horário.');
    } finally { setBusy(false); }
  };
  return (
    <Card title="Horário de funcionamento e volume" icon="door">
      <div className="vx-form vx-form-narrow">
        <HoursFields value={h} onChange={setH} disabled={!can('admin')} />
        <p className="vx-help">Unidades com horário diferente: Empresa › Unidades. Um alerta urgente aparece mesmo com a loja fechada.</p>
        {can('admin') && <div><Button variant="primary" loading={busy} onClick={save}>Salvar horário</Button></div>}
      </div>
    </Card>
  );
}

/* ---------------- Unidades ---------------- */

export function Units() {
  const { base, companyId, can, units } = useSession();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const screens = useCol(`${base}/screens`);
  const [edit, setEdit] = useState(null);
  if (!screens) return <Loading />;
  const count = (u) => screens.filter((s) => s.unitId === u.id).length;
  const remove = async (u) => {
    if (count(u)) return toast(`Mova as ${count(u)} telas desta unidade antes de excluir.`);
    if (!(await confirm({ title: `Excluir a unidade "${u.name}"?`, confirmLabel: 'Excluir', danger: true }))) return;
    await api.remove(`${base}/units/${u.id}`);
    toast('Unidade excluída.');
  };
  return (
    <>
      <Card pad={false} title="Unidades" icon="pin" actions={can('admin') && <Button size="sm" variant="primary" icon="plus" onClick={() => setEdit({ name: '', address: '', city: '', geo: null, hours: { enabled: false }, catalog: { show: true, audience: '', description: '' } })}>Nova unidade</Button>}>
        {units.length === 0 ? (
          <EmptyState icon="pin" title="Nenhuma unidade">Cadastre as lojas para filtrar as telas, ver no mapa, ter horário próprio e aparecer no catálogo para anunciantes.</EmptyState>
        ) : (
          <div className="vx-unit-list">
            {units.map((u) => (
              <div key={u.id} className="vx-unit-row">
                <span className="vx-tile"><Icon name="pin" /></span>
                <div className="vx-app-row-text">
                  <b>{u.name}</b>
                  <span className="vx-faint">{[u.address, u.city || u.geo?.city].filter(Boolean).join(' · ') || 'Sem endereço'} · {count(u)} {count(u) === 1 ? 'tela' : 'telas'}</span>
                </div>
                {u.geo?.lat != null ? <Chip tone="online">No mapa</Chip> : <Chip>Sem local</Chip>}
                {u.hours?.enabled && <Chip>Horário próprio</Chip>}
                {can('admin') && (
                  <div className="vx-row-actions">
                    <Button size="sm" icon="edit" onClick={() => setEdit({ ...u, catalog: { show: true, ...(u.catalog || {}) } })}>Editar</Button>
                    <IconButton icon="trash" label={`Excluir ${u.name}`} variant="danger" onClick={() => remove(u)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
      {edit && <UnitEditor value={edit} onClose={() => setEdit(null)} onSaved={async (hoursChanged) => {
        if (hoursChanged) await rebuildManifests(companyId);
        toast('Unidade salva.');
        setEdit(null);
      }} />}
      {confirmDialog}
    </>
  );
}

/** Busca de endereço (OpenStreetMap / Nominatim). Poucas buscas, feitas à mão: dentro da política de uso. */
export async function searchAddress(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=br&accept-language=pt-BR&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Busca indisponível agora.');
  return (await res.json()).map((r) => ({
    label: r.display_name,
    lat: Number(r.lat),
    lon: Number(r.lon),
    city: r.address?.city || r.address?.town || r.address?.village || r.address?.municipality || '',
  }));
}

function UnitEditor({ value, onClose, onSaved }) {
  const { base } = useSession();
  const [f, setF] = useState(value);
  const [q, setQ] = useState(value.address || '');
  const [found, setFound] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const find = async () => {
    setError('');
    try {
      const r = await searchAddress([q, f.city].filter(Boolean).join(', '));
      setFound(r);
      if (!r.length) setError('Endereço não encontrado. Tente rua, número e cidade.');
    } catch (e) { setError(e.message); }
  };
  const save = async () => {
    if (!f.name?.trim()) return setError('Dê um nome para a unidade.');
    setBusy(true);
    try {
      const data = {
        name: f.name.trim(), address: (f.address || '').trim(), city: (f.city || f.geo?.city || '').trim(),
        geo: f.geo || null, hours: normalizeHours(f.hours),
        catalog: { show: f.catalog?.show !== false, audience: Number(f.catalog?.audience) || 0, description: (f.catalog?.description || '').slice(0, 200) },
      };
      if (f.id) await api.update(`${base}/units/${f.id}`, data);
      else await api.add(`${base}/units`, data);
      await onSaved(JSON.stringify(normalizeHours(value.hours)) !== JSON.stringify(data.hours));
    } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} width={760} icon="pin" title={f.id ? 'Editar unidade' : 'Nova unidade'}
      footer={<>{error && <span className="vx-field-error vx-mr-auto"><Icon name="alert" />{error}</span>}<Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} onClick={save}>Salvar</Button></>}>
      <div className="vx-form">
        <Input label="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Loja Boa Viagem" />
        <div className="vx-form-row">
          <Input label="Endereço" value={q} onChange={(e) => { setQ(e.target.value); setF({ ...f, address: e.target.value }); }} placeholder="Rua, número, bairro" />
          <Input label="Cidade" value={f.city || ''} onChange={(e) => setF({ ...f, city: e.target.value })} />
        </div>
        <div className="vx-row-actions">
          <Button size="sm" icon="search" onClick={find} disabled={!q.trim()}>Achar no mapa</Button>
          {f.geo?.lat != null && <span className="vx-help"><Icon name="check" /> Local marcado ({f.geo.lat.toFixed(4)}, {f.geo.lon.toFixed(4)}). No Mapa de telas dá para ajustar arrastando.</span>}
        </div>
        {found?.length > 0 && (
          <div className="vx-found">
            {found.map((r) => (
              <button key={`${r.lat},${r.lon}`} type="button" className="vx-found-item" onClick={() => { setF({ ...f, geo: { lat: r.lat, lon: r.lon, city: r.city }, city: f.city || r.city }); setFound(null); }}>
                <Icon name="pin" /><span>{r.label}</span>
              </button>
            ))}
            <span className="vx-help">Dados de endereço © colaboradores do OpenStreetMap.</span>
          </div>
        )}
        <div className="vx-divider" />
        <Toggle label="Horário próprio nesta unidade" help="Sem isso, vale o horário da empresa." checked={!!f.hours?.enabled} onChange={(v) => setF({ ...f, hours: { ...normalizeHours(f.hours), enabled: v } })} />
        {f.hours?.enabled && <HoursFields value={f.hours} onChange={(hours) => setF({ ...f, hours: { ...hours, enabled: true } })} />}
        <div className="vx-divider" />
        <Toggle label="Mostrar no catálogo para anunciantes" checked={f.catalog?.show !== false} onChange={(v) => setF({ ...f, catalog: { ...f.catalog, show: v } })} />
        <div className="vx-form-row">
          <Input label="Pessoas por dia (estimativa)" type="number" min={0} value={f.catalog?.audience || ''} onChange={(e) => setF({ ...f, catalog: { ...f.catalog, audience: e.target.value } })} help="Fluxo médio da loja. Entra no alcance das propostas." />
          <Input label="Descrição para anunciantes" value={f.catalog?.description || ''} maxLength={200} onChange={(e) => setF({ ...f, catalog: { ...f.catalog, description: e.target.value } })} placeholder="Ex.: 3 TVs no caixa e na vitrine, público família" />
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Registro de atividades ---------------- */

export function Activity() {
  const { base } = useSession();
  const [limit, setLimit] = useState(100);
  const [area, setArea] = useState('');
  const [who, setWho] = useState('');
  const rows = useCol(`${base}/audit`, { orderBy: ['at', 'desc'], limit });
  const list = useMemo(() => (rows || []).filter((r) => (!area || r.area === area) && (!who || r.byName === who)), [rows, area, who]);
  if (!rows) return <Loading />;
  const areas = [...new Set(rows.map((r) => r.area).filter(Boolean))].sort();
  const people = [...new Set(rows.map((r) => r.byName).filter(Boolean))].sort();
  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['Quando;Quem;O que;Área;Item', ...list.map((r) => [formatDateTime(r.at), r.byName, describeAudit(r), r.area, r.targetName || r.targetId].map(esc).join(';'))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    a.download = 'atividades-vertice.csv';
    a.click();
  };
  return (
    <Card pad={false} title="Registro de atividades" icon="history" iconTone="neutral"
      actions={<div className="vx-row-actions">
        <div className="vx-select-wrap"><select className="vx-input vx-select vx-input-sm" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Área"><option value="">Todas as áreas</option>{areas.map((a) => <option key={a}>{a}</option>)}</select><Icon name="chevronDown" /></div>
        <div className="vx-select-wrap"><select className="vx-input vx-select vx-input-sm" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Pessoa"><option value="">Todas as pessoas</option>{people.map((a) => <option key={a}>{a}</option>)}</select><Icon name="chevronDown" /></div>
        <Button size="sm" icon="download" onClick={exportCsv} disabled={!list.length}>CSV</Button>
      </div>}>
      {list.length === 0 ? (
        <EmptyState icon="history" title="Nada registrado ainda">Aqui aparece quem publicou, mudou ou excluiu o quê, e quando.</EmptyState>
      ) : (
        <ol className="vx-audit">
          {list.map((r) => (
            <li key={r.id} className={`vx-audit-row a-${r.action}`}>
              <span className="vx-audit-dot" aria-hidden />
              <div>
                <b>{describeAudit(r)}</b>
                <span className="vx-faint">{formatDateTime(r.at)} · {timeAgo(r.at)}{r.fields?.length && r.action === 'update' ? ` · ${r.fields.slice(0, 4).join(', ')}` : ''}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
      {rows.length >= limit && <div className="vx-card-foot"><Button size="sm" onClick={() => setLimit(limit + 200)}>Ver mais antigos</Button></div>}
    </Card>
  );
}
