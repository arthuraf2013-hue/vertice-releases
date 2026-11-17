import { useEffect, useMemo, useState } from 'react';
import {
  APP_KINDS, APP_THEMES, TICKER_SPEEDS, normalizeApp, appDefaultSeconds, geocodeUrl, weatherUrl, summarizeWeather,
  youtubeId, safeHttpUrl, formatDateTime, sheetCsvUrl, sheetTable, qrContent, parsePrice,
  APP_SOURCES, sampleComments, commentLink, blockPattern, blockedWordList,
  voteLink, pollOptions, normalizeQueueConfig, sampleQueue, sampleTally, samplePhotos,
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
import { siteBase } from '../data/site.js';
import { NewAppFields, validateNewApp, useSourcePreview, CityField, OPEN_METEO_KEY } from './AppFields.jsx';

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
  const { base, companyId, can, member, company } = useSession();
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
    if (e.kind === 'comments' || e.kind === 'photowall') return saveBoard(e, data);
    if (e.kind === 'poll') return savePoll(e, data);
    if (e.kind === 'queue' || e.kind === 'timer') return saveLive(e, data);
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

  /** Mural de comentários (ou de fotos): a mídia do app, o mural público e a moderação, no mesmo lote. */
  const saveBoard = async (e, data) => {
    const id = e.id || api.newId(`${base}/media`);
    const c = e.config;
    const words = blockedWordList(c.blockedWords);
    const config = { ...c, boardId: id, link: commentLink(siteBase(), companyId, id) };
    const ops = [
      e.id
        ? { op: 'update', path: `${base}/media/${id}`, data: { ...data, app: { kind: e.kind, config } } }
        : { op: 'set', path: `${base}/media/${id}`, data: { ...data, app: { kind: e.kind, config }, sizeBytes: 0, createdAt: api.NOW, createdBy: member?.name || '' } },
      {
        op: 'set',
        merge: true,
        path: `${base}/commentBoards/${id}`,
        data: {
          title: (c.title || 'Comentários').slice(0, 60), question: (c.question || '').slice(0, 140), autoApprove: !!c.autoApprove,
          companyName: company?.name || '', theme: c.theme || 'brand', kind: e.kind === 'photowall' ? 'photos' : 'comments', updatedAt: api.NOW, ...(e.id ? {} : { open: true }),
        },
      },
      { op: 'set', path: `${base}/commentSettings/${id}`, data: { autoApprove: !!c.autoApprove, words, blockPattern: blockPattern(words) } },
    ];
    await api.batch(ops);
    if (usage.has(id)) await rebuildManifests(companyId);
    toast(e.id ? 'Mural salvo.' : `Mural criado. Coloque numa playlist e acompanhe ${e.kind === 'photowall' ? 'as fotos' : 'os comentários'} em Interação.`);
    setEdit(null);
  };

  /** Enquete: a mídia, a pergunta pública e o placar. Mudou as respostas, os votos recomeçam. */
  const savePoll = async (e, data) => {
    const id = e.id || api.newId(`${base}/media`);
    const options = pollOptions(e.config.options);
    const config = { ...e.config, options, pollId: id, link: voteLink(siteBase(), companyId, id) };
    const prev = e.id ? await api.getDoc(`${base}/polls/${id}`) : null;
    const changed = !prev || JSON.stringify(prev.options || []) !== JSON.stringify(options);
    const round = prev ? (Number(prev.round) || 0) + (changed ? 1 : 0) : 0;
    const ops = [
      e.id
        ? { op: 'update', path: `${base}/media/${id}`, data: { ...data, app: { kind: 'poll', config } } }
        : { op: 'set', path: `${base}/media/${id}`, data: { ...data, app: { kind: 'poll', config }, sizeBytes: 0, createdAt: api.NOW, createdBy: member?.name || '' } },
      { op: 'set', merge: true, path: `${base}/polls/${id}`, data: { question: config.question.slice(0, 120), options, round, companyName: company?.name || '', theme: config.theme || 'brand', updatedAt: api.NOW, ...(prev ? {} : { open: true }) } },
      ...(changed ? [{ op: 'set', path: `${base}/pollTallies/${id}`, data: { round, counts: {}, total: 0 } }] : []),
    ];
    await api.batch(ops);
    if (usage.has(id)) await rebuildManifests(companyId);
    toast(e.id ? (changed && prev ? 'Enquete salva. As respostas mudaram, então os votos recomeçaram.' : 'Enquete salva.') : 'Enquete criada. Coloque numa playlist; os votos aparecem ao vivo.');
    setEdit(null);
  };

  /** Senhas e cronômetro: a mídia e o documento que a TV escuta (o estado ao vivo). */
  const saveLive = async (e, data) => {
    const id = e.id || api.newId(`${base}/media`);
    const col = e.kind === 'queue' ? 'queues' : 'timers';
    const config = { ...e.config, ...(e.kind === 'queue' ? { ...normalizeQueueConfig(e.config), queueId: id } : { timerId: id }) };
    const live = e.kind === 'queue'
      ? { title: config.title, types: config.types, counters: config.counters, digits: config.digits, updatedAt: api.NOW }
      : { title: config.title || '', updatedAt: api.NOW };
    const ops = [
      e.id
        ? { op: 'update', path: `${base}/media/${id}`, data: { ...data, app: { kind: e.kind, config } } }
        : { op: 'set', path: `${base}/media/${id}`, data: { ...data, app: { kind: e.kind, config }, sizeBytes: 0, createdAt: api.NOW, createdBy: member?.name || '' } },
      e.id
        ? { op: 'set', merge: true, path: `${base}/${col}/${id}`, data: live }
        : { op: 'set', path: `${base}/${col}/${id}`, data: e.kind === 'queue' ? { ...live, seq: {}, current: null, history: [] } : { ...live, status: 'stopped', startedAt: null, pausedAt: null, pausedMs: 0 } },
    ];
    await api.batch(ops);
    if (usage.has(id)) await rebuildManifests(companyId);
    toast(e.id ? 'Aplicativo salvo.' : e.kind === 'queue' ? 'Fila criada. Coloque numa playlist e chame as senhas em Operação › Chamar senha.' : 'Cronômetro criado. Coloque numa playlist e comande em Operação › Cronômetro.');
    setEdit(null);
  };

  const remove = async (m) => {
    const used = usage.get(m.id);
    const ok = await confirm({
      title: `Excluir "${m.name}"?`,
      message: `${used ? `Ele sai das playlists: ${[...used].join(', ')}.` : 'Ele não está em nenhuma playlist.'}${m.app?.kind === 'comments' ? ' Os comentários do mural também são apagados.' : m.app?.kind === 'photowall' ? ' As fotos enviadas também são apagadas.' : m.app?.kind === 'poll' ? ' Os votos também são apagados.' : ''}`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    const ops = [{ op: 'delete', path: `${base}/media/${m.id}` }];
    if (m.app?.kind === 'comments' || m.app?.kind === 'photowall') {
      // O mural sai junto: comentários (e fotos), moderação e a página pública.
      const comments = await api.getCol(`${base}/commentBoards/${m.id}/comments`);
      for (const cm of comments) {
        ops.push({ op: 'delete', path: `${base}/commentBoards/${m.id}/comments/${cm.id}` });
        const file = /\/m\/[^/]+\/([^/?#]+)$/.exec(cm.photo || '')?.[1];
        if (file) api.deleteFile(`${base}/media/${file}`).catch(() => {});
      }
      ops.push({ op: 'delete', path: `${base}/commentBoards/${m.id}` }, { op: 'delete', path: `${base}/commentSettings/${m.id}` });
    }
    if (m.app?.kind === 'poll') {
      const votes = await api.getCol(`${base}/polls/${m.id}/votes`);
      for (const v of votes.slice(0, 400)) ops.push({ op: 'delete', path: `${base}/polls/${m.id}/votes/${v.id}` });
      ops.push({ op: 'delete', path: `${base}/polls/${m.id}` }, { op: 'delete', path: `${base}/pollTallies/${m.id}` });
    }
    if (m.app?.kind === 'queue') ops.push({ op: 'delete', path: `${base}/queues/${m.id}` });
    if (m.app?.kind === 'timer') ops.push({ op: 'delete', path: `${base}/timers/${m.id}` });
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
          <NewAppFields kind={value.kind} c={c} set={set} />
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
  const fresh = validateNewApp(v.kind, c);
  if (fresh) return fresh;
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
  return (
    <>
      <CityField c={c} set={set} />
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
    fetch(weatherUrl(c.lat, c.lon, c.days || 4, OPEN_METEO_KEY))
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
  // Apps de dados: a fonte de verdade quando o navegador deixa ler; senão, exemplo.
  const src = useSourcePreview(app.kind, c);
  const shown = (app.kind === 'comments' || app.kind === 'photowall') && !c.link ? { ...app, config: { ...c, link: `${siteBase()}comentar` } }
    : app.kind === 'poll' && !c.link ? { ...app, config: { ...c, link: `${siteBase()}votar` } } : app;
  const live = app.kind === 'queue' ? sampleQueue() : app.kind === 'timer' ? { demoElapsed: 10 + 4 * 60 + 37 } : app.kind === 'poll' ? { tally: sampleTally(pollOptions(c.options).length || 3) } : null;
  return (
    <div className="vx-app-preview">
      <div className="vx-section-head">
        <span className="vx-label">Prévia na TV</span>
        <Segmented value={portrait ? 'p' : 'l'} onChange={(v) => setPortrait(v === 'p')} options={[{ value: 'l', label: 'Deitada' }, { value: 'p', label: 'Em pé' }]} />
      </div>
      <div className={`vx-app-screen ${portrait ? 'is-portrait' : ''}`}>
        <AppView app={shown} weather={weather} feed={feed} table={table} data={live || src.data} comments={app.kind === 'comments' ? sampleComments() : app.kind === 'photowall' ? samplePhotos() : null} imageSrc={imageSrc} status={src.status || status} preview />
      </div>
      {app.kind === 'rss' && <p className="vx-help">Na prévia aparecem manchetes de exemplo. A TV mostra as do feed.</p>}
      {app.kind === 'sheet' && table && !table.real && <p className="vx-help">O navegador não deixou ler a planilha daqui; a prévia mostra uma tabela de exemplo. A TV lê a planilha direto.</p>}
      {APP_SOURCES[app.kind] && src.data && !src.real && <p className="vx-help">Prévia com dados de exemplo: o navegador do painel não lê essa fonte direto. A TV lê.</p>}
      {app.kind === 'comments' && <p className="vx-help">Na prévia aparecem comentários de exemplo. A TV mostra os que você aprovar.</p>}
      {app.kind === 'photowall' && <p className="vx-help">Na prévia aparecem fotos de exemplo. A TV mostra as que você aprovar.</p>}
      {(app.kind === 'queue' || app.kind === 'timer' || app.kind === 'poll') && <p className="vx-help">Prévia com dados de exemplo. Na TV, tudo muda ao vivo.</p>}
      {app.kind === 'stream' && <p className="vx-help">A transmissão toca só na TV (precisa de internet lá).</p>}
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
