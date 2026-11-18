// Campos de configuração dos aplicativos de dados (tempo, esportes, economia, calendário, mural)
// e a prévia com dados reais quando o navegador consegue ler a fonte (senão, dados de exemplo).
import { useEffect, useState } from 'react';
import {
  geocodeUrl, safeHttpUrl, LEAGUES, NEWS_FEEDS, NEWS_PUBLISHERS, CURRENCIES, INDICATORS, WORLD_ZONES, APP_SOURCES,
  parseBirthdays, parseExtraDates, countdownParts, blockedWordList, COMMENT_LIMITS,
  TIMER_MODES, normalizeTimer, timerTotal, parseStarts, pollOptions, POLL_LIMITS, normalizeQueueConfig, driveFolderId, streamKind,
} from '@vertice/shared';
import { Button, Input, Select, Toggle, Segmented, PillGroup } from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';
import { WodWeek } from './MoreFields.jsx';

export const OPEN_METEO_KEY = import.meta.env.VITE_OPEN_METEO_KEY || '';
const CITY_KINDS = ['weather', 'rain', 'air', 'sunmoon'];
const opt = (list) => list.map((n) => ({ value: String(n), label: String(n) }));

/** Busca de cidade (Open-Meteo geocoding, sem chave). Usada por clima, chuva, ar e sol. */
export function CityField({ c, set }) {
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
  );
}

const LEAGUE_OPTIONS = [
  ...Object.entries(LEAGUES).filter(([, l]) => !l.state).map(([id, l]) => ({ value: id, label: l.label })),
  ...Object.entries(LEAGUES).filter(([, l]) => l.state).sort((a, b) => a[1].label.localeCompare(b[1].label)).map(([id, l]) => ({ value: id, label: `Estadual: ${l.label}` })),
  { value: 'outro', label: 'Outro campeonato (pelo número)' },
];

function LeagueFields({ c, set, kind }) {
  const known = !!LEAGUES[c.leagueId];
  const [other, setOther] = useState(!known);
  return (
    <>
      <Select label="Campeonato" value={other ? 'outro' : String(c.leagueId)} options={LEAGUE_OPTIONS}
        onChange={(e) => { if (e.target.value === 'outro') setOther(true); else { setOther(false); set({ leagueId: Number(e.target.value) }); } }} />
      {other && (
        <Input label="Número do campeonato no TheSportsDB" inputMode="numeric" value={String(c.leagueId || '')} onChange={(e) => set({ leagueId: Number(e.target.value.replace(/\D/g, '')) || '' })}
          help="Está no endereço da página do campeonato em thesportsdb.com (ex.: /league/4351)." />
      )}
      <Input label="Seu time (opcional)" value={c.team} maxLength={40} onChange={(e) => set({ team: e.target.value })} placeholder="Ex.: Sport" help={kind === 'matches' ? 'Preenchido, a tela mostra só os jogos dele.' : 'Preenchido, a linha dele fica em destaque.'} />
      {kind === 'matches' ? (
        <div className="vx-form-row">
          <Select label="Próximos jogos" value={String(c.upcoming)} onChange={(e) => set({ upcoming: Number(e.target.value) })} options={opt([2, 3, 4, 5])} />
          <Select label="Últimos resultados" value={String(c.results)} onChange={(e) => set({ results: Number(e.target.value) })} options={opt([1, 2, 3, 4])} />
        </div>
      ) : (
        <div className="vx-form-row">
          <Select label="Times na tela" value={String(c.rows)} onChange={(e) => set({ rows: Number(e.target.value) })} options={opt([6, 8, 10, 12, 16, 20])} />
          <Input label="Temporada (opcional)" value={c.season} maxLength={9} onChange={(e) => set({ season: e.target.value })} placeholder="Automática" help="Ex.: 2026 ou 2026-2027." />
        </div>
      )}
      <Input label="Chave do TheSportsDB (opcional)" value={c.apiKey} onChange={(e) => set({ apiKey: e.target.value.trim() })}
        help="Sem chave, usa a chave pública gratuita, que mostra poucos jogos por campeonato. Com a chave paga, a lista fica completa." />
    </>
  );
}

function FeedsField({ c, set }) {
  const feeds = Array.isArray(c.feeds) ? c.feeds : [];
  const upd = (i, p) => set({ feeds: feeds.map((f, k) => (k === i ? { ...f, ...p } : f)) });
  const add = (f) => feeds.length < 4 && !feeds.some((x) => x.url === f.url) && set({ feeds: [...feeds, f] });
  return (
    <div className="vx-field">
      <span className="vx-label">Portais (até 4)</span>
      {feeds.map((f, i) => (
        <div key={i} className="vx-form-row vx-feed-row">
          <Input label="Nome na tela" value={f.label} maxLength={30} onChange={(e) => upd(i, { label: e.target.value })} />
          <Input label="Endereço do feed (RSS)" value={f.url} onChange={(e) => upd(i, { url: e.target.value.trim() })} placeholder="https://…" />
          <button type="button" className="vx-icon-btn" aria-label={`Tirar ${f.label || 'portal'}`} onClick={() => set({ feeds: feeds.filter((_, k) => k !== i) })}><Icon name="trash" /></button>
        </div>
      ))}
      <div className="vx-chips">
        {[...NEWS_FEEDS, ...Object.values(NEWS_PUBLISHERS).flatMap((p) => Object.entries(p.feeds).map(([n, url]) => ({ label: Object.keys(p.feeds).length > 1 ? `${p.label} · ${n}` : p.label, url })))]
          .filter((f, i, all) => all.findIndex((x) => x.url === f.url) === i && !feeds.some((x) => x.url === f.url)).slice(0, 40).map((f) => (
          <button key={f.url} type="button" className="vx-chip-btn" disabled={feeds.length >= 4} onClick={() => add(f)}><Icon name="plus" /> {f.label}</button>
        ))}
        {feeds.length < 4 && <button type="button" className="vx-chip-btn" onClick={() => add({ label: '', url: '' })}><Icon name="plus" /> Outro portal</button>}
      </div>
      <span className="vx-help">A TV mostra só o título e o nome do portal. Use portais que permitem exibir as manchetes.</span>
    </div>
  );
}

/** Campos do editor para os apps novos. Devolve null para os tipos tratados no Apps.jsx. */
export function NewAppFields({ kind, c, set }) {
  if (CITY_KINDS.includes(kind) && kind !== 'weather') {
    return (
      <>
        <CityField c={c} set={set} />
        {kind === 'rain' && <Select label="Horas na tela" value={String(c.hours)} onChange={(e) => set({ hours: Number(e.target.value) })} options={[6, 8, 12].map((n) => ({ value: String(n), label: `Próximas ${n} horas` }))} />}
      </>
    );
  }
  switch (kind) {
    case 'matches':
    case 'standings':
      return <LeagueFields c={c} set={set} kind={kind} />;
    case 'headlines':
      return (
        <>
          <FeedsField c={c} set={set} />
          <Select label="Trocar de manchete a cada" value={String(c.everySec)} onChange={(e) => set({ everySec: Number(e.target.value) })} options={[6, 8, 10, 15].map((n) => ({ value: String(n), label: `${n} segundos` }))} />
        </>
      );
    case 'currency':
      return <PillGroup label="Moedas (até 6)" value={c.codes} onChange={(v) => set({ codes: v.slice(0, 6) })} options={Object.entries(CURRENCIES).map(([value, label]) => ({ value, label }))} />;
    case 'indicators':
      return <PillGroup label="Indicadores (até 5)" value={c.items} onChange={(v) => set({ items: v.slice(0, 5) })} options={Object.entries(INDICATORS).map(([value, d]) => ({ value, label: d.label }))} />;
    case 'holidays':
      return (
        <>
          <label className="vx-field">
            <span className="vx-label">Datas da sua cidade ou loja (opcional)</span>
            <textarea className="vx-input vx-textarea" rows={4} value={c.extra} onChange={(e) => set({ extra: e.target.value })} placeholder={'08/12 Nossa Senhora da Conceição\n24/06 São João\n2026-12-31 Loja fecha às 14h'} />
            <span className="vx-help">Uma por linha: dia/mês (repete todo ano) ou ano-mês-dia, seguido do nome. Os feriados nacionais entram sozinhos.</span>
          </label>
          <Select label="Datas na tela" value={String(c.count)} onChange={(e) => set({ count: Number(e.target.value) })} options={opt([3, 4, 5, 6])} />
        </>
      );
    case 'countdown':
      return (
        <>
          <Input label="Título" value={c.title} maxLength={50} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: Black Friday começa em" />
          <div className="vx-form-row">
            <Input label="Data e hora" type="datetime-local" value={c.target} onChange={(e) => set({ target: e.target.value })} />
            <Input label="Quando chegar, mostrar" value={c.doneText} maxLength={40} onChange={(e) => set({ doneText: e.target.value })} />
          </div>
          <Toggle label="Mostrar os segundos" checked={!!c.showSeconds} onChange={(v) => set({ showSeconds: v })} />
        </>
      );
    case 'birthdays':
      return (
        <>
          <Input label="Título" value={c.title} maxLength={40} onChange={(e) => set({ title: e.target.value })} />
          <label className="vx-field">
            <span className="vx-label">Aniversariantes</span>
            <textarea className="vx-input vx-textarea" rows={6} value={c.list} onChange={(e) => set({ list: e.target.value })} placeholder={'Ana Souza 12/03\nBruno Lima 28/11'} />
            <span className="vx-help">Um por linha: nome e dia/mês. A tela mostra só os do mês (ou do dia) e destaca quem faz hoje. {parseBirthdays(c.list).length ? `${parseBirthdays(c.list).length} na lista.` : ''}</span>
          </label>
          <Segmented label="Mostrar" value={c.scope} onChange={(v) => set({ scope: v })} options={[{ value: 'month', label: 'Do mês' }, { value: 'today', label: 'Só de hoje' }]} />
        </>
      );
    case 'onthisday':
      return <Select label="Fatos na tela" value={String(c.count)} onChange={(e) => set({ count: Number(e.target.value) })} options={opt([2, 3, 4])} />;
    case 'agenda':
      return (
        <>
          <Input label="Endereço do calendário (.ics)" value={c.url} onChange={(e) => set({ url: e.target.value.trim() })} placeholder="https://calendar.google.com/calendar/ical/…/public/basic.ics"
            help={'Google Agenda: Configurações da agenda → Integrar agenda → "Endereço público em formato iCal" (a agenda precisa estar pública).'} />
          <div className="vx-form-row">
            <Input label="Título" value={c.title} maxLength={40} onChange={(e) => set({ title: e.target.value })} />
            <Select label="Eventos na tela" value={String(c.count)} onChange={(e) => set({ count: Number(e.target.value) })} options={opt([3, 4, 5, 6])} />
          </div>
        </>
      );
    case 'worldclock':
      return <PillGroup label="Cidades (até 6)" value={c.zones} onChange={(v) => set({ zones: v.slice(0, 6) })} options={Object.entries(WORLD_ZONES).map(([value, label]) => ({ value, label }))} />;
    case 'quote':
      return (
        <>
          <Input label="Título (opcional)" value={c.title} maxLength={40} onChange={(e) => set({ title: e.target.value })} />
          <label className="vx-field">
            <span className="vx-label">Suas frases (opcional)</span>
            <textarea className="vx-input vx-textarea" rows={6} value={c.list} onChange={(e) => set({ list: e.target.value })} placeholder={'Uma por linha. Para mostrar o autor: Frase — Autor'} />
            <span className="vx-help">Uma frase por dia, em ordem. Em branco, a tela usa ditados populares.</span>
          </label>
        </>
      );
    case 'comments':
      return <CommentFields c={c} set={set} />;
    case 'photowall':
      return <PhotoFields c={c} set={set} />;
    case 'poll':
      return <PollFields c={c} set={set} />;
    case 'queue':
      return <QueueFields c={c} set={set} />;
    case 'timer':
      return <TimerFields c={c} set={set} />;
    case 'stream':
      return (
        <>
          <Input label="Link da transmissão" value={c.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://…/index.m3u8"
            help="Link HLS (.m3u8) ou vídeo .mp4 de um canal, câmera IP ou serviço de streaming que você tem direito de exibir. Links de YouTube vão no app YouTube." />
          <div className="vx-form-row">
            <Input label="Nome na tela (opcional)" value={c.title} maxLength={30} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: Canal da loja" />
            <Toggle label="Sem som" checked={!!c.muted} onChange={(v) => set({ muted: v })} />
          </div>
        </>
      );
    case 'drive':
      return (
        <>
          <Input label="Link da pasta do Google Drive" value={c.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://drive.google.com/drive/folders/…"
            help={'Na pasta: Compartilhar → "Qualquer pessoa com o link" pode ver. Entram JPG, PNG, WebP e GIF, em ordem de nome (use 01, 02… no começo).'} />
          <div className="vx-form-row">
            <Select label="Tempo de cada imagem" value={String(c.seconds)} onChange={(e) => set({ seconds: Number(e.target.value) })} options={[5, 8, 10, 15, 20, 30].map((n) => ({ value: String(n), label: `${n} segundos` }))} />
            <Segmented label="Imagem" value={c.fit === 'cover' ? 'cover' : 'contain'} onChange={(v) => set({ fit: v })} options={[{ value: 'contain', label: 'Inteira' }, { value: 'cover', label: 'Preenche a tela' }]} />
          </div>
          <p className="vx-help">A TV confere a pasta a cada 15 minutos. Coloque o tempo do app na playlist como (número de imagens × tempo de cada uma). As imagens vêm do Google na hora: sem internet, a TV mostra só as que já abriu.</p>
        </>
      );
    default:
      return null;
  }
}

function CommentFields({ c, set }) {
  const words = blockedWordList(c.blockedWords);
  return (
    <>
      <div className="vx-form-row">
        <Input label="Título" value={c.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} />
        <Select label="Comentários por vez" value={String(c.maxShown)} onChange={(e) => set({ maxShown: Number(e.target.value) })} options={opt([1, 2, 3, 4])} />
      </div>
      <Input label="Pergunta para o público" value={c.question} maxLength={140} onChange={(e) => set({ question: e.target.value })} placeholder="Ex.: O que você achou do nosso atendimento?" />
      <div className="vx-form-row">
        <Select label="Trocar comentários a cada" value={String(c.rotateSec)} onChange={(e) => set({ rotateSec: Number(e.target.value) })} options={[6, 8, 10, 15].map((n) => ({ value: String(n), label: `${n} segundos` }))} />
        <Toggle label="Mostrar o QR Code na tela" checked={c.showQr !== false} onChange={(v) => set({ showQr: v })} />
      </div>
      <Toggle label="Aprovar sozinho" help="Desligado (recomendado), cada comentário espera a sua aprovação em Comentários antes de ir para a TV." checked={!!c.autoApprove} onChange={(v) => set({ autoApprove: v })} />
      <label className="vx-field">
        <span className="vx-label">Palavras bloqueadas</span>
        <textarea className="vx-input vx-textarea" rows={3} value={c.blockedWords} onChange={(e) => set({ blockedWords: e.target.value })} placeholder="Separadas por vírgula ou uma por linha" />
        <span className="vx-help">Comentário com uma delas nunca entra direto: fica esperando a sua aprovação. {words.length ? `${words.length} palavra(s).` : ''}</span>
      </label>
      <p className="vx-help">Cada pessoa envia até {COMMENT_LIMITS.perWindow} comentários a cada {COMMENT_LIMITS.windowMin} minutos, com até {COMMENT_LIMITS.text} letras. Depois de salvar, o link e a moderação ficam em <b>Comentários</b>.</p>
    </>
  );
}

/** Problema que impede salvar (ou null). */
export function validateNewApp(kind, c) {
  if (CITY_KINDS.includes(kind) && (c.lat == null || c.lon == null)) return 'Escolha a cidade.';
  if ((kind === 'matches' || kind === 'standings') && !Number(c.leagueId)) return 'Escolha o campeonato.';
  if (kind === 'headlines' && !(c.feeds || []).some((f) => safeHttpUrl(f.url))) return 'Escolha pelo menos um portal.';
  if (kind === 'headlines' && (c.feeds || []).some((f) => f.url && !safeHttpUrl(f.url))) return 'Um dos endereços de feed não começa com https://.';
  if (kind === 'currency' && !c.codes?.length) return 'Escolha pelo menos uma moeda.';
  if (kind === 'indicators' && !c.items?.length) return 'Escolha pelo menos um indicador.';
  if (kind === 'worldclock' && !c.zones?.length) return 'Escolha pelo menos uma cidade.';
  if (kind === 'countdown' && !countdownParts(c.target)) return 'Escolha a data e a hora.';
  if (kind === 'birthdays' && !parseBirthdays(c.list).length) return 'Escreva pelo menos um aniversariante (nome e dia/mês).';
  if (kind === 'holidays' && String(c.extra || '').trim() && !parseExtraDates(c.extra).length) return 'Não entendi as datas. Use, por exemplo: 08/12 Nossa Senhora da Conceição.';
  if (kind === 'agenda' && !safeHttpUrl(String(c.url || '').replace(/^webcal:/i, 'https:'))) return 'Cole o endereço público do calendário (.ics).';
  if (kind === 'comments' && !String(c.question || '').trim()) return 'Escreva a pergunta para o público.';
  if (kind === 'poll' && !String(c.question || '').trim()) return 'Escreva a pergunta da enquete.';
  if (kind === 'poll' && pollOptions(c.options).length < POLL_LIMITS.minOptions) return 'Coloque pelo menos 2 respostas.';
  if (kind === 'queue' && !(c.types || []).some((t) => t.prefix)) return 'Coloque pelo menos um tipo de senha com letra.';
  if (kind === 'stream' && !streamKind(c.url)) return 'Cole um link de transmissão .m3u8 (ou vídeo .mp4).';
  if (kind === 'drive' && !driveFolderId(c.url)) return 'Cole o link de uma pasta do Google Drive.';
  return null;
}

/**
 * Dados da prévia: tenta ler a fonte de verdade pelo navegador do painel. Fontes que não deixam
 * (portais de notícias, alguns órgãos) caem nos dados de exemplo — a TV lê direto.
 * @returns {{ data: object|null, real: boolean, status: string|null }}
 */
export function useSourcePreview(kind, c) {
  const [s, setS] = useState({ data: null, real: false, status: null });
  const src = APP_SOURCES[kind];
  const key = JSON.stringify(c);
  useEffect(() => {
    if (!src) { setS({ data: null, real: false, status: null }); return undefined; }
    const urls = src.urls(c, { apikey: OPEN_METEO_KEY, now: new Date() });
    if (!urls.length) { setS({ data: src.sample(c, Date.now()), real: false, status: null }); return undefined; }
    let alive = true;
    setS((x) => ({ ...x, status: 'loading' }));
    const t = setTimeout(async () => {
      const res = await Promise.allSettled(urls.map((u) => fetch(u).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))));
      if (!alive) return;
      try {
        if (res.every((r) => r.status === 'rejected')) throw new Error('sem acesso');
        setS({ data: src.parse(res.map((r) => (r.status === 'fulfilled' ? r.value : null)), c, Date.now()), real: true, status: null });
      } catch {
        setS({ data: src.sample(c, Date.now()), real: false, status: null });
      }
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [kind, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return s;
}

function PhotoFields({ c, set }) {
  return (
    <>
      <Input label="Título" value={c.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} />
      <Input label="Chamada para o público" value={c.question} maxLength={140} onChange={(e) => set({ question: e.target.value })} />
      <div className="vx-form-row">
        <Segmented label="Na tela" value={c.layout === 'single' ? 'single' : 'mosaic'} onChange={(v) => set({ layout: v })} options={[{ value: 'mosaic', label: 'Mosaico' }, { value: 'single', label: 'Uma por vez' }]} />
        <Select label="Trocar a cada" value={String(c.rotateSec)} onChange={(e) => set({ rotateSec: Number(e.target.value) })} options={[4, 6, 8, 10].map((n) => ({ value: String(n), label: `${n} segundos` }))} />
      </div>
      <Toggle label="Mostrar o QR Code na tela" checked={c.showQr !== false} onChange={(v) => set({ showQr: v })} />
      <Toggle label="Aprovar sozinho" help="Desligado (recomendado): cada foto espera a sua aprovação em Interação antes de ir para a TV." checked={!!c.autoApprove} onChange={(v) => set({ autoApprove: v })} />
      <p className="vx-help">A pessoa tira ou escolhe a foto no celular; ela chega reduzida (até 1600 px) e conta no espaço do seu plano. Cada aparelho manda até 3 fotos a cada 10 minutos.</p>
    </>
  );
}

function PollFields({ c, set }) {
  const options = Array.isArray(c.options) ? c.options : pollOptions(c.options);
  return (
    <>
      <Input label="Pergunta" value={c.question} maxLength={POLL_LIMITS.question} onChange={(e) => set({ question: e.target.value })} />
      <label className="vx-field">
        <span className="vx-label">Respostas (uma por linha, de 2 a 6)</span>
        <textarea className="vx-input vx-textarea" rows={5} value={options.join('\n')} onChange={(e) => set({ options: e.target.value.split('\n').slice(0, POLL_LIMITS.maxOptions).map((l) => l.slice(0, POLL_LIMITS.option)) })} />
      </label>
      <div className="vx-form-row">
        <Toggle label="Mostrar o resultado ao vivo" checked={c.showResults !== false} onChange={(v) => set({ showResults: v })} />
        <Toggle label="Mostrar o QR Code" checked={c.showQr !== false} onChange={(v) => set({ showQr: v })} />
      </div>
      <p className="vx-help">Cada aparelho vota uma vez. Para recomeçar a votação, use "Zerar votos" em Interação › Enquetes.</p>
    </>
  );
}

function QueueFields({ c, set }) {
  const q = normalizeQueueConfig(c);
  const types = c.types || q.types;
  const setType = (i, p) => set({ types: types.map((t, j) => (j === i ? { ...t, ...p } : t)) });
  return (
    <>
      <Input label="Título na tela" value={c.title} maxLength={40} onChange={(e) => set({ title: e.target.value })} />
      <label className="vx-field">
        <span className="vx-label">Tipos de senha</span>
        <div className="vx-vol-list">
          {types.map((t, i) => (
            <div key={i} className="vx-type-row">
              <input className="vx-input vx-input-sm vx-prefix" value={t.prefix} maxLength={2} onChange={(e) => setType(i, { prefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} aria-label="Letra" />
              <input className="vx-input vx-input-sm" value={t.label} maxLength={24} onChange={(e) => setType(i, { label: e.target.value })} aria-label="Nome do tipo" />
              {types.length > 1 && <button type="button" className="vx-btn vx-btn-sm vx-btn-danger" onClick={() => set({ types: types.filter((_, j) => j !== i) })}>Remover</button>}
            </div>
          ))}
          {types.length < 4 && <Button size="sm" icon="plus" onClick={() => set({ types: [...types, { prefix: 'C', label: 'Convênio' }] })}>Adicionar tipo</Button>}
        </div>
        <span className="vx-help">Ex.: A (normal) e P (preferencial). Cada tipo tem a sua sequência.</span>
      </label>
      <label className="vx-field">
        <span className="vx-label">Guichês, salas ou mesas (um por linha)</span>
        <textarea className="vx-input vx-textarea" rows={3} value={(Array.isArray(c.counters) ? c.counters : q.counters).join('\n')} onChange={(e) => set({ counters: e.target.value.split('\n').slice(0, 12) })} />
      </label>
      <div className="vx-form-row">
        <Toggle label="Som de chamada" checked={c.sound !== false} onChange={(v) => set({ sound: v })} />
        <Toggle label="Falar a senha" help="Usa a voz em português do aparelho." checked={c.voice !== false} onChange={(v) => set({ voice: v })} />
      </div>
      <p className="vx-help">Depois de salvar, chame as senhas em <b>Operação › Chamar senha</b>, no computador ou no celular.</p>
    </>
  );
}

function TimerFields({ c, set }) {
  const t = normalizeTimer(c);
  const total = timerTotal(t);
  const starts = parseStarts(c.starts);
  return (
    <>
      <Select label="Tipo de treino" value={t.mode} onChange={(e) => set({ mode: e.target.value })} options={Object.entries(TIMER_MODES).map(([k, m]) => ({ value: k, label: `${m.label}: ${m.desc}` }))} />
      {(t.mode === 'amrap' || t.mode === 'fortime' || t.mode === 'countdown') && (
        <Input label={t.mode === 'fortime' ? 'Limite (minutos)' : 'Minutos'} type="number" min={1} max={120} value={c.minutes} onChange={(e) => set({ minutes: Number(e.target.value) })} />
      )}
      {(t.mode === 'interval' || t.mode === 'emom') && (
        <div className="vx-form-row">
          <Input label="Rodadas" type="number" min={1} max={99} value={c.rounds} onChange={(e) => set({ rounds: Number(e.target.value) })} />
          {t.mode === 'interval' && <Input label="Esforço (s)" type="number" min={5} max={600} value={c.work} onChange={(e) => set({ work: Number(e.target.value) })} />}
          {t.mode === 'interval' && <Input label="Descanso (s)" type="number" min={0} max={600} value={c.rest} onChange={(e) => set({ rest: Number(e.target.value) })} />}
        </div>
      )}
      <div className="vx-form-row">
        <Input label="Preparação (s)" type="number" min={0} max={30} value={c.prep} onChange={(e) => set({ prep: Number(e.target.value) })} />
        <Input label="Título do WOD" value={c.title} maxLength={40} onChange={(e) => set({ title: e.target.value })} />
      </div>
      <label className="vx-field">
        <span className="vx-label">WOD (um exercício por linha, opcional)</span>
        <textarea className="vx-input vx-textarea" rows={4} value={c.wod} onChange={(e) => set({ wod: e.target.value })} placeholder={'10 burpees\n15 kettlebell swings\n200 m corrida'} />
      </label>
      <WodWeek c={c} set={set} />
      <Input label="Começar sozinho nos horários (opcional)" value={c.starts} onChange={(e) => set({ starts: e.target.value })} placeholder="06:00, 07:00, 18:30"
        help={starts.length ? `Começa sozinho ${starts.length} vez(es) por dia. Também dá para iniciar e pausar pelo celular.` : 'Em branco: comanda pelo celular, em Operação › Cronômetro.'} />
      <Toggle label="Bipes" help="Nos 3 últimos segundos de cada fase e na troca." checked={c.beeps !== false} onChange={(v) => set({ beeps: v })} />
      <p className="vx-help">Treino de {Math.floor(total / 60)} min {total % 60 ? `${total % 60} s` : ''}{t.prep ? ` + ${t.prep} s de preparação` : ''}. Deixe o app sozinho numa playlist (ou fixe na TV) para não sair da tela no meio do treino.</p>
    </>
  );
}
