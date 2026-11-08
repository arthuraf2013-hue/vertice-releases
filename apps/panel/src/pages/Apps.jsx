import { useEffect, useMemo, useState } from 'react';
import {
  APP_KINDS, APP_THEMES, TICKER_SPEEDS, normalizeApp, appDefaultSeconds, geocodeUrl, weatherUrl, summarizeWeather,
  youtubeId, safeHttpUrl, formatDateTime,
} from '@vertice/shared';
import { AppView } from '@vertice/shared/apps';
import { useSession } from '../session.jsx';
import { useCol } from '../data/hooks.js';
import { api } from '../data/api.js';
import { rebuildManifests } from '../data/manifests.js';
import {
  PageHeader, Button, Card, Loading, EmptyState, useToast, useConfirm, Modal, Input, Select, Toggle, Segmented, IconButton, Chip,
} from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

const CATALOG = Object.entries(APP_KINDS).filter(([, d]) => !d.managed);
const GROUPS = ['Todos', ...new Set(CATALOG.map(([, d]) => d.group))];
const FEEDS = [
  ['g1 Brasil', 'https://g1.globo.com/rss/g1/'],
  ['g1 Pernambuco', 'https://g1.globo.com/rss/g1/pernambuco/'],
  ['g1 Economia', 'https://g1.globo.com/rss/g1/economia/'],
];

/**
 * Aplicativos: conteúdo que se atualiza sozinho. Cada app configurado vira uma "mídia" do tipo
 * app e entra nas playlists como qualquer imagem.
 */
export function Apps() {
  const { base, companyId, can, member } = useSession();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const media = useCol(`${base}/media`, { where: [['type', '==', 'app']] });
  const playlists = useCol(`${base}/playlists`);
  const [group, setGroup] = useState('Todos');
  const [edit, setEdit] = useState(null);

  const usage = useMemo(() => {
    const m = new Map();
    for (const p of playlists || []) for (const it of p.items || []) m.set(it.mediaId, (m.get(it.mediaId) || new Set()).add(p.name));
    return m;
  }, [playlists]);

  if (!media) return <Loading />;
  const mine = media.filter((m) => APP_KINDS[m.app?.kind] && !APP_KINDS[m.app.kind].managed).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const catalog = CATALOG.filter(([, d]) => group === 'Todos' || d.group === group);

  const open = (kind, existing) => {
    const def = APP_KINDS[kind];
    setEdit(existing
      ? { id: existing.id, kind, name: existing.name, seconds: existing.defaultDurationSec || '', config: normalizeApp(existing.app).config }
      : { kind, name: def.label, seconds: '', config: { ...def.defaults } });
  };

  const save = async (e) => {
    const data = {
      type: 'app',
      name: e.name.trim() || APP_KINDS[e.kind].label,
      app: { kind: e.kind, config: e.config },
      defaultDurationSec: Number(e.seconds) || null,
      updatedAt: api.NOW,
    };
    if (e.id) {
      await api.update(`${base}/media/${e.id}`, data);
      if (usage.has(e.id)) await rebuildManifests(companyId);
      toast(usage.has(e.id) ? 'Aplicativo salvo. As telas já recebem a mudança.' : 'Aplicativo salvo.');
    } else {
      await api.add(`${base}/media`, { ...data, sizeBytes: 0, createdAt: api.NOW, createdBy: member?.name || '' });
      toast('Aplicativo criado. Coloque numa playlist para ele aparecer nas telas.');
    }
    setEdit(null);
  };

  const remove = async (m) => {
    const used = usage.get(m.id);
    const ok = await confirm({
      title: `Excluir "${m.name}"?`,
      message: used ? `Ele sai das playlists: ${[...used].join(', ')}.` : 'Ele não está em nenhuma playlist.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    const ops = [{ op: 'delete', path: `${base}/media/${m.id}` }];
    for (const p of playlists || []) {
      if ((p.items || []).some((it) => it.mediaId === m.id)) {
        ops.push({ op: 'update', path: `${base}/playlists/${p.id}`, data: { items: p.items.filter((it) => it.mediaId !== m.id), updatedAt: api.NOW } });
      }
    }
    await api.batch(ops);
    if (used) await rebuildManifests(companyId);
    toast('Aplicativo excluído.');
  };

  return (
    <div className="vx-page">
      <PageHeader overline="CONTEÚDO" title="Aplicativos" subtitle="Conteúdo que se atualiza sozinho. Escolha, configure e coloque numa playlist." />

      {mine.length > 0 && (
        <Card title="Seus aplicativos" icon="apps">
          <div className="vx-apps-mine">
            {mine.map((m) => {
              const def = APP_KINDS[m.app.kind];
              const used = usage.get(m.id);
              return (
                <div key={m.id} className="vx-app-row">
                  <span className="vx-tile"><Icon name={def.icon} /></span>
                  <div className="vx-app-row-text">
                    <b>{m.name}</b>
                    <span className="vx-faint">{def.label} · {used ? `em ${used.size} ${used.size === 1 ? 'playlist' : 'playlists'}` : 'fora das playlists'}{m.updatedAt ? ` · editado ${formatDateTime(m.updatedAt)}` : ''}</span>
                  </div>
                  {can('editor') && (
                    <div className="vx-row-actions">
                      <Button size="sm" icon="edit" onClick={() => open(m.app.kind, m)}>Configurar</Button>
                      <IconButton icon="trash" label={`Excluir ${m.name}`} variant="danger" onClick={() => remove(m)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="vx-apps-layout">
        <nav className="vx-card vx-apps-groups" aria-label="Tipos de aplicativo">
          <span className="vx-overline">Explorar por tipo</span>
          {GROUPS.map((g) => (
            <button key={g} type="button" className={group === g ? 'is-on' : ''} onClick={() => setGroup(g)}>
              {g}<span className="vx-num">{g === 'Todos' ? CATALOG.length : CATALOG.filter(([, d]) => d.group === g).length}</span>
            </button>
          ))}
          <div className="vx-apps-hint">
            <Icon name="tag" />
            <span>Tabela de preços fica em <a href="#/price">Price</a>.</span>
          </div>
        </nav>
        <div className="vx-apps-grid">
          {catalog.map(([kind, d]) => (
            <div key={kind} className="vx-card vx-app-card">
              <div className="vx-app-card-top"><span className="vx-tile vx-tile-accent"><Icon name={d.icon} /></span><Chip>{d.group}</Chip></div>
              <h3>{d.label}</h3>
              <p className="vx-faint">{d.desc}</p>
              {can('editor') && <Button size="sm" icon="plus" onClick={() => open(kind)}>Configurar</Button>}
            </div>
          ))}
        </div>
      </div>

      {edit && <AppEditor value={edit} onChange={setEdit} onClose={() => setEdit(null)} onSave={save} />}
      {confirmDialog}
    </div>
  );
}

function AppEditor({ value, onChange, onClose, onSave }) {
  const [busy, setBusy] = useState(false);
  const def = APP_KINDS[value.kind];
  const c = value.config;
  const set = (p) => onChange({ ...value, config: { ...c, ...p } });
  const problem = validate(value);
  const submit = async () => {
    setBusy(true);
    try { await onSave(value); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} width={1040} icon={def.icon} title={value.id ? `Configurar ${def.label.toLowerCase()}` : `Novo aplicativo: ${def.label}`}
      subtitle={def.desc}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit} loading={busy} disabled={!!problem} title={problem || undefined}>Salvar aplicativo</Button></>}>
      <div className="vx-app-editor">
        <div className="vx-form">
          <div className="vx-form-row">
            <Input label="Nome" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
            <Input label="Tempo na playlist (s)" type="number" min={3} max={3600} value={value.seconds} placeholder={String(appDefaultSeconds(value.kind))} onChange={(e) => onChange({ ...value, seconds: e.target.value })} />
          </div>
          {value.kind === 'clock' && (
            <>
              <Input label="Mensagem (opcional)" value={c.message} maxLength={80} onChange={(e) => set({ message: e.target.value })} placeholder="Ex.: Bom dia! Pão quentinho até as 10h." />
              <Toggle label="Mostrar a data" checked={c.showDate !== false} onChange={(v) => set({ showDate: v })} />
              <Toggle label="Mostrar os segundos" checked={!!c.showSeconds} onChange={(v) => set({ showSeconds: v })} />
            </>
          )}
          {value.kind === 'ticker' && (
            <>
              <Input label="Título" value={c.title} maxLength={40} onChange={(e) => set({ title: e.target.value })} />
              <label className="vx-field">
                <span className="vx-label">Avisos (um por linha)</span>
                <textarea className="vx-input vx-textarea" rows={5} value={(c.lines || []).join('\n')} onChange={(e) => set({ lines: e.target.value.split('\n').slice(0, 12) })} />
              </label>
              <Segmented label="Velocidade" value={c.speed} onChange={(v) => set({ speed: v })}
                options={Object.keys(TICKER_SPEEDS).map((k) => ({ value: k, label: { slow: 'Devagar', normal: 'Normal', fast: 'Rápido' }[k] }))} />
            </>
          )}
          {value.kind === 'weather' && <WeatherFields c={c} set={set} />}
          {value.kind === 'rss' && (
            <>
              <Input label="Endereço do feed (RSS)" value={c.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://g1.globo.com/rss/g1/" />
              <div className="vx-chips">{FEEDS.map(([n, u]) => <button key={u} type="button" className="vx-chip-btn" onClick={() => set({ url: u, source: c.source || n })}>{n}</button>)}</div>
              <div className="vx-form-row">
                <Input label="Nome da fonte na tela" value={c.source} maxLength={40} onChange={(e) => set({ source: e.target.value })} placeholder="Ex.: g1 Pernambuco" />
                <Select label="Manchetes" value={String(c.count)} onChange={(e) => set({ count: Number(e.target.value) })} options={[3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))} />
              </div>
            </>
          )}
          {value.kind === 'web' && (
            <>
              <Input label="Endereço do site" value={c.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://www.sualoja.com.br/cardapio" help="Alguns sites bloqueiam a exibição dentro de outros apps; nesse caso a tela fica em branco." />
              <Select label="Recarregar a página" value={String(c.reloadMin || 0)} onChange={(e) => set({ reloadMin: Number(e.target.value) })}
                options={[[0, 'Nunca'], [5, 'A cada 5 min'], [15, 'A cada 15 min'], [60, 'A cada 1 h']].map(([v, l]) => ({ value: String(v), label: l }))} />
            </>
          )}
          {value.kind === 'youtube' && (
            <>
              <Input label="Link do vídeo" value={c.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" />
              <Toggle label="Sem som" help="Muitas TVs só tocam automático sem som." checked={c.muted !== false} onChange={(v) => set({ muted: v })} />
            </>
          )}
          {'theme' in def.defaults && (
            <Select label="Cores" value={c.theme} onChange={(e) => set({ theme: e.target.value })} options={Object.entries(APP_THEMES).map(([k, t]) => ({ value: k, label: t.label }))} />
          )}
          {problem && <p className="vx-help vx-help-warn"><Icon name="alert" />{problem}</p>}
        </div>
        <AppPreview app={{ kind: value.kind, config: c }} />
      </div>
    </Modal>
  );
}

function validate(v) {
  const c = v.config;
  if (v.kind === 'weather' && (c.lat == null || c.lon == null)) return 'Escolha a cidade.';
  if (v.kind === 'rss' && !safeHttpUrl(c.url)) return 'Informe o endereço do feed (começando com https://).';
  if (v.kind === 'web' && !safeHttpUrl(c.url)) return 'Informe o endereço do site (começando com https://).';
  if (v.kind === 'youtube' && !youtubeId(c.url)) return 'Cole um link de vídeo do YouTube.';
  if (v.kind === 'ticker' && !(c.lines || []).some((l) => l.trim())) return 'Escreva pelo menos um aviso.';
  return null;
}

function WeatherFields({ c, set }) {
  const [q, setQ] = useState(c.city ? c.city.split(',')[0] : '');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const j = await (await fetch(geocodeUrl(q.trim()))).json();
      setRes((j.results || []).map((r) => ({ label: [r.name, r.admin1, r.country_code === 'BR' ? null : r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude })));
    } catch {
      setRes([]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="vx-field">
        <span className="vx-label">Cidade</span>
        <form className="vx-inline-search" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <input className="vx-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: Recife" aria-label="Buscar cidade" />
          <Button type="submit" icon="search" loading={busy}>Buscar</Button>
        </form>
        {c.city && <span className="vx-help"><Icon name="pin" /> {c.city}</span>}
        {res && (
          <div className="vx-chips">
            {res.length ? res.map((r) => (
              <button key={`${r.lat},${r.lon}`} type="button" className={`vx-chip-btn ${c.lat === r.lat && c.lon === r.lon ? 'is-on' : ''}`} onClick={() => set({ city: r.label, lat: r.lat, lon: r.lon })}>{r.label}</button>
            )) : <span className="vx-faint">Nenhuma cidade encontrada (ou sem internet).</span>}
          </div>
        )}
      </div>
      <Select label="Previsão" value={String(c.days)} onChange={(e) => set({ days: Number(e.target.value) })} options={[3, 4, 5].map((n) => ({ value: String(n), label: `${n} dias` }))} />
    </>
  );
}

/** Prévia ao vivo, igual à TV (mesmo componente do player). */
export function AppPreview({ app, portraitDefault = false }) {
  const [portrait, setPortrait] = useState(portraitDefault);
  const [weather, setWeather] = useState(null);
  const [status, setStatus] = useState(null);
  const c = app.config || {};
  useEffect(() => {
    if (app.kind !== 'weather' || c.lat == null) { setWeather(null); return undefined; }
    let alive = true;
    setStatus('loading');
    fetch(weatherUrl(c.lat, c.lon, c.days || 4))
      .then((r) => r.json())
      .then((j) => { if (alive) { setWeather(summarizeWeather(j, c.days || 4)); setStatus(null); } })
      .catch(() => alive && setStatus('error'));
    return () => { alive = false; };
  }, [app.kind, c.lat, c.lon, c.days]);
  // Notícias: o navegador do painel não lê feeds de outros sites; a TV lê. Na prévia, manchetes de exemplo.
  const feed = app.kind === 'rss' ? { source: c.source || 'Notícias', items: SAMPLE_NEWS } : null;
  return (
    <div className="vx-app-preview">
      <div className="vx-section-head">
        <span className="vx-label">Prévia na TV</span>
        <Segmented value={portrait ? 'p' : 'l'} onChange={(v) => setPortrait(v === 'p')} options={[{ value: 'l', label: 'Deitada' }, { value: 'p', label: 'Em pé' }]} />
      </div>
      <div className={`vx-app-screen ${portrait ? 'is-portrait' : ''}`}>
        <AppView app={app} weather={weather} feed={feed} status={status} />
      </div>
      {app.kind === 'rss' && <p className="vx-help">Na prévia aparecem manchetes de exemplo. A TV mostra as do feed.</p>}
    </div>
  );
}

const SAMPLE_NEWS = [
  { title: 'As manchetes do feed aparecem aqui, atualizadas a cada 15 minutos' },
  { title: 'A primeira notícia fica em destaque, em letras grandes' },
  { title: 'As outras aparecem logo abaixo, em lista' },
  { title: 'Sem internet, a TV mostra as últimas que conseguiu ler' },
];
