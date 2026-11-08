import { useEffect, useMemo, useState } from 'react';
import {
  APP_KINDS, APP_THEMES, TICKER_SPEEDS, normalizeApp, appDefaultSeconds, geocodeUrl, weatherUrl, summarizeWeather,
  youtubeId, safeHttpUrl, formatDateTime, sheetCsvUrl, sheetTable, qrContent, parsePrice,
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
            <span>Tabela de preços fica em <a href="#/price">Price</a>; peças de oferta e aviso, no <a href="#/estudio">Estúdio</a>.</span>
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
          {value.kind === 'qr' && <QrFields c={c} set={set} />}
          {value.kind === 'sheet' && (
            <>
              <Input label="Link da planilha do Google" value={c.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://docs.google.com/spreadsheets/d/…"
                help={'Na planilha: Compartilhar → "Qualquer pessoa com o link" pode ver. Ou Arquivo → Compartilhar → Publicar na Web. A aba certa vai pelo link (gid).'} />
              <Input label="Título na tela (opcional)" value={c.title} maxLength={40} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: Escala da semana" />
              <div className="vx-form-row">
                <Select label="Linhas na tela" value={String(c.rows)} onChange={(e) => set({ rows: Number(e.target.value) })} options={[5, 8, 10, 12, 15, 20].map((n) => ({ value: String(n), label: String(n) }))} />
                <Toggle label="Primeira linha é o cabeçalho" checked={c.header !== false} onChange={(v) => set({ header: v })} />
              </div>
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
  if (v.kind === 'sheet' && !sheetCsvUrl(c.url)) return 'Cole o link de uma planilha do Google (docs.google.com/spreadsheets/…).';
  if (v.kind === 'qr') {
    if (c.mode === 'pix' && (!c.pixKey?.trim() || !c.pixName?.trim() || !c.pixCity?.trim())) return 'Para o Pix, informe a chave, o nome e a cidade de quem recebe.';
    if (c.mode === 'link' && !safeHttpUrl(c.url)) return 'Informe o link (começando com https://).';
    if (!qrContent(c)) return 'Preencha o conteúdo do QR Code.';
  }
  return null;
}

const QR_MODES = [{ value: 'link', label: 'Link' }, { value: 'wifi', label: 'Wi-Fi' }, { value: 'pix', label: 'Pix' }, { value: 'text', label: 'Texto' }];
const QR_TITLES = { link: 'Aponte a câmera do celular', wifi: 'Conecte-se ao nosso Wi-Fi', pix: 'Pague com Pix', text: 'Aponte a câmera do celular' };

function QrFields({ c, set }) {
  const mode = (m) => set({ mode: m, title: Object.values(QR_TITLES).includes(c.title) || !c.title ? QR_TITLES[m] : c.title });
  return (
    <>
      <Segmented label="O que o QR abre" value={c.mode} onChange={mode} options={QR_MODES} />
      {c.mode === 'link' && <Input label="Link" value={c.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://instagram.com/sualoja" />}
      {c.mode === 'wifi' && (
        <>
          <div className="vx-form-row">
            <Input label="Nome da rede" value={c.ssid} maxLength={32} onChange={(e) => set({ ssid: e.target.value })} />
            <Input label="Senha" value={c.password} maxLength={63} onChange={(e) => set({ password: e.target.value })} />
          </div>
          <div className="vx-form-row">
            <Select label="Segurança" value={c.security || 'WPA'} onChange={(e) => set({ security: e.target.value })} options={[{ value: 'WPA', label: 'WPA/WPA2 (o comum)' }, { value: 'WEP', label: 'WEP' }, { value: 'nopass', label: 'Sem senha' }]} />
            <Toggle label="Mostrar a senha na tela" checked={c.showPassword !== false} onChange={(v) => set({ showPassword: v })} />
          </div>
        </>
      )}
      {c.mode === 'pix' && (
        <>
          <Input label="Chave Pix" value={c.pixKey} maxLength={77} onChange={(e) => set({ pixKey: e.target.value })} placeholder="CNPJ, e-mail, telefone (+55…) ou chave aleatória" />
          <div className="vx-form-row">
            <Input label="Nome de quem recebe" value={c.pixName} maxLength={25} onChange={(e) => set({ pixName: e.target.value })} />
            <Input label="Cidade" value={c.pixCity} maxLength={15} onChange={(e) => set({ pixCity: e.target.value })} />
          </div>
          <div className="vx-form-row">
            <Input label="Valor fixo (opcional)" inputMode="decimal" value={c.pixAmount} onChange={(e) => set({ pixAmount: e.target.value })} placeholder="Em branco: o cliente digita" />
            <Input label="Mensagem (opcional)" value={c.pixMessage} maxLength={40} onChange={(e) => set({ pixMessage: e.target.value })} />
          </div>
          {parsePrice(c.pixAmount) == null && c.pixAmount && <p className="vx-help vx-help-warn"><Icon name="alert" />Valor não entendido; use, por exemplo, 12,90.</p>}
          <p className="vx-help">Confira lendo o QR da prévia com o app do seu banco antes de colocar nas telas.</p>
        </>
      )}
      {c.mode === 'text' && (
        <label className="vx-field">
          <span className="vx-label">Texto</span>
          <textarea className="vx-input vx-textarea" rows={3} maxLength={500} value={c.text} onChange={(e) => set({ text: e.target.value })} />
        </label>
      )}
      <Input label="Título" value={c.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} />
      <Input label="Subtítulo (opcional)" value={c.subtitle} maxLength={80} onChange={(e) => set({ subtitle: e.target.value })} placeholder="Ex.: Siga a gente e ganhe 10% na próxima compra" />
    </>
  );
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
export function AppPreview({ app, portraitDefault = false, imageSrc = null }) {
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
  // Planilha: tenta ler de verdade (planilha publicada costuma deixar); senão, tabela de exemplo.
  const [table, setTable] = useState(null);
  const csvUrl = app.kind === 'sheet' ? sheetCsvUrl(c.url) : null;
  useEffect(() => {
    if (!csvUrl) { setTable(null); return undefined; }
    let alive = true;
    fetch(csvUrl).then((r) => (r.ok ? r.text() : Promise.reject())).then((txt) => alive && setTable({ ...sheetTable(txt, { header: c.header !== false, rows: c.rows }), real: true }))
      .catch(() => alive && setTable({ ...sheetTable(SAMPLE_SHEET, { header: c.header !== false, rows: c.rows }), real: false }));
    return () => { alive = false; };
  }, [csvUrl, c.header, c.rows]);
  // Notícias: o navegador do painel não lê feeds de outros sites; a TV lê. Na prévia, manchetes de exemplo.
  const feed = app.kind === 'rss' ? { source: c.source || 'Notícias', items: SAMPLE_NEWS } : null;
  return (
    <div className="vx-app-preview">
      <div className="vx-section-head">
        <span className="vx-label">Prévia na TV</span>
        <Segmented value={portrait ? 'p' : 'l'} onChange={(v) => setPortrait(v === 'p')} options={[{ value: 'l', label: 'Deitada' }, { value: 'p', label: 'Em pé' }]} />
      </div>
      <div className={`vx-app-screen ${portrait ? 'is-portrait' : ''}`}>
        <AppView app={app} weather={weather} feed={feed} table={table} imageSrc={imageSrc} status={status} />
      </div>
      {app.kind === 'rss' && <p className="vx-help">Na prévia aparecem manchetes de exemplo. A TV mostra as do feed.</p>}
      {app.kind === 'sheet' && table && !table.real && <p className="vx-help">O navegador não deixou ler a planilha daqui; a prévia mostra uma tabela de exemplo. A TV lê a planilha direto.</p>}
    </div>
  );
}

const SAMPLE_SHEET = 'Dia,Turno,Responsável\nSegunda,Manhã,Ana\nSegunda,Tarde,Bruno\nTerça,Manhã,Carla\nTerça,Tarde,Diego\nQuarta,Manhã,Edu\nQuarta,Tarde,Fernanda';

const SAMPLE_NEWS = [
  { title: 'As manchetes do feed aparecem aqui, atualizadas a cada 15 minutos' },
  { title: 'A primeira notícia fica em destaque, em letras grandes' },
  { title: 'As outras aparecem logo abaixo, em lista' },
  { title: 'Sem internet, a TV mostra as últimas que conseguiu ler' },
];
