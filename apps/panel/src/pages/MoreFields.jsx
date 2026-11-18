// Campos do editor dos aplicativos do catálogo ampliado (loterias, quiz, cinema, agro, aniversariante,
// aulas, fitness, sala, pesquisa, Power BI, HTML e rádio).
import { useState } from 'react';
import {
  LOTTERY_GAMES, AGRO_PRODUCTS, TRIBUTE_TEMPLATES, FITNESS_BACKS, parseQuiz, parseClasses, powerBiUrl, powerBiPages,
  audioKind, isInsecureAudio, safeHttpUrl, youtubeId, youtubePlaylistId, youtubeChannelId, CLOCK_DATE_FORMATS, WEEK_KEYS,
} from '@vertice/shared';
import { Button, Input, Select, Toggle, Segmented, PillGroup, Modal, MediaThumb } from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';
import { useSession } from '../session.jsx';
import { useCol } from '../data/hooks.js';
import { api } from '../data/api.js';

const opt = (list, fmt = String) => list.map((n) => ({ value: String(n), label: fmt(n) }));
const secs = (list) => opt(list, (n) => `${n} segundos`);

/** Foto da biblioteca de Mídias (a TV baixa junto e mostra sem internet). */
export function PhotoField({ c, set, label = 'Foto', help }) {
  const { base } = useSession();
  const images = useCol(base ? `${base}/media` : null, { where: [['type', '==', 'image']] }) || [];
  const [picking, setPicking] = useState(false);
  const img = images.find((m) => m.id === c.imageMediaId);
  return (
    <div className="vx-field">
      <span className="vx-label">{label}</span>
      <div className="vx-studio-photo">
        {img?.url ? <img src={img.url} alt="" /> : <span className="vx-faint">Sem foto</span>}
        <Button size="sm" icon="image" onClick={() => setPicking(true)}>{c.imageMediaId ? 'Trocar' : 'Escolher da biblioteca'}</Button>
        {c.imageMediaId && <Button size="sm" variant="ghost" onClick={() => set({ imageMediaId: '' })}>Tirar</Button>}
      </div>
      {help && <span className="vx-help">{help}</span>}
      {picking && (
        <Modal open onClose={() => setPicking(false)} width={860} icon="image" title="Escolher foto" subtitle="Imagens enviadas em Mídias.">
          {images.length ? (
            <div className="vx-adv-picker">
              {images.map((m) => (
                <button key={m.id} type="button" className={`vx-adv-pick ${c.imageMediaId === m.id ? 'is-on' : ''}`} onClick={() => { set({ imageMediaId: m.id }); setPicking(false); }}>
                  <MediaThumb media={m} />
                  <span className="vx-ellipsis">{m.name}</span>
                </button>
              ))}
            </div>
          ) : <p className="vx-muted">Nenhuma imagem em Mídias ainda. Envie uma foto por lá.</p>}
        </Modal>
      )}
    </div>
  );
}

/** Url da foto escolhida, para a prévia. */
export function usePhotoUrl(id) {
  const { base } = useSession();
  const images = useCol(base && id ? `${base}/media` : null, { where: [['type', '==', 'image']] }) || [];
  return images.find((m) => m.id === id)?.url || null;
}

export function MoreAppFields({ kind, c, set }) {
  switch (kind) {
    case 'lottery':
      return (
        <>
          <PillGroup label="Modalidades (até 6)" value={c.games} onChange={(v) => set({ games: v.slice(0, 6) })} options={Object.entries(LOTTERY_GAMES).map(([value, g]) => ({ value, label: g.label }))} />
          <Select label="Trocar de modalidade a cada" value={String(c.everySec)} onChange={(e) => set({ everySec: Number(e.target.value) })} options={secs([6, 8, 10, 15])} />
          <p className="vx-help">Resultado oficial do portal de loterias da CAIXA, conferido a cada 30 minutos. Coloque o tempo na playlist como (modalidades × tempo de cada).</p>
        </>
      );
    case 'horoscope':
      return (
        <>
          <Select label="Trocar de signo a cada" value={String(c.everySec)} onChange={(e) => set({ everySec: Number(e.target.value) })} options={secs([4, 5, 6, 8])} />
          <p className="vx-help">Os doze signos em sequência, com amor, trabalho, dica, cor e número da sorte. O texto muda todo dia e é igual em todas as telas. Para entretenimento.</p>
        </>
      );
    case 'quiz':
      return <QuizFields c={c} set={set} />;
    case 'cinema':
      return <CinemaFields c={c} set={set} />;
    case 'agro':
      return (
        <>
          <Input label="Título" value={c.title} maxLength={40} onChange={(e) => set({ title: e.target.value })} />
          <PillGroup label="Produtos (até 8)" value={(c.items || []).map(String)} onChange={(v) => set({ items: v.slice(0, 8).map(Number) })} options={Object.entries(AGRO_PRODUCTS).map(([value, p]) => ({ value, label: p.label }))} />
          <p className="vx-help">Indicadores diários do Cepea/Esalq-USP, com a fonte na tela. Atualiza a cada 2 horas. Funciona no player Android e Windows (a versão web do player não consegue ler essa fonte).</p>
        </>
      );
    case 'tribute':
      return (
        <>
          <div className="vx-form-row">
            <Input label="Nome" value={c.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Ana Souza" />
            <Input label="Setor ou cargo (opcional)" value={c.role} maxLength={40} onChange={(e) => set({ role: e.target.value })} placeholder="Ex.: Financeiro" />
          </div>
          <label className="vx-field">
            <span className="vx-label">Mensagem</span>
            <textarea className="vx-input vx-textarea" rows={3} maxLength={160} value={c.message} onChange={(e) => set({ message: e.target.value })} />
          </label>
          <Segmented label="Modelo" value={c.template} onChange={(v) => set({ template: v })} options={Object.entries(TRIBUTE_TEMPLATES).map(([value, t]) => ({ value, label: t.label }))} />
          <PhotoField c={c} set={set} help="Sem foto, aparece a inicial do nome." />
          <p className="vx-help">Para entrar só no dia certo, programe a playlist em Programação (ou use as datas de validade da mídia na playlist).</p>
        </>
      );
    case 'classes': {
      const n = parseClasses(c.list).length;
      return (
        <>
          <Input label="Título" value={c.title} maxLength={40} onChange={(e) => set({ title: e.target.value })} />
          <label className="vx-field">
            <span className="vx-label">Grade da semana</span>
            <textarea className="vx-input vx-textarea" rows={8} value={c.list} onChange={(e) => set({ list: e.target.value })}
              placeholder={'seg a sex 07:00-08:00 Spinning | Prof. Ana | Sala 2\nter qui 18:30-19:30 Pilates | Carla\nsab 09:00-10:00 Funcional\ntodo dia 06:00-06:45 Musculação livre'} />
            <span className="vx-help">Uma aula por linha: dias, horário de início e fim, nome | professor | sala. {n ? `${n} aula(s) entendida(s).` : ''}</span>
          </label>
        </>
      );
    }
    case 'fitness':
      return (
        <>
          <Segmented label="Fundo" value={c.back} onChange={(v) => set({ back: v })} options={Object.entries(FITNESS_BACKS).map(([value, b]) => ({ value, label: b.label }))} />
          <PhotoField c={c} set={set} label="Ou uma foto sua de fundo" help="A frase fica por cima, com uma sombra para dar leitura." />
          <div className="vx-form-row">
            <Select label="Frases por exibição" value={String(c.count)} onChange={(e) => set({ count: Number(e.target.value) })} options={opt([1, 2, 3, 4, 5])} />
            <Select label="Trocar a cada" value={String(c.everySec)} onChange={(e) => set({ everySec: Number(e.target.value) })} options={secs([5, 8, 10, 15])} />
          </div>
          <label className="vx-field">
            <span className="vx-label">Suas frases (opcional)</span>
            <textarea className="vx-input vx-textarea" rows={4} value={c.list} onChange={(e) => set({ list: e.target.value })} placeholder="Uma por linha. Em branco, usamos as frases prontas (trocam todo dia)." />
          </label>
        </>
      );
    case 'room':
      return (
        <>
          <Input label="Nome da sala" value={c.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} />
          <Input label="Agenda da sala (.ics)" value={c.url} onChange={(e) => set({ url: e.target.value.trim() })} placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics"
            help="Outlook: Configurações › Calendário › Calendários compartilhados › Publicar (ICS). Google Agenda: Configurações da agenda › Endereço público em formato iCal. A TV confere a cada 5 minutos." />
        </>
      );
    case 'survey':
      return <SurveyFields c={c} set={set} />;
    case 'powerbi': {
      const pages = powerBiPages(c.pages);
      return (
        <>
          <Input label="Link do relatório publicado" value={c.url} onChange={(e) => set({ url: e.target.value.trim() })} placeholder="https://app.powerbi.com/view?r=…"
            help={'No Power BI: Arquivo › Inserir relatório › Publicar na Web (público). Use só com dados que podem ficar públicos; relatórios com login não abrem na TV.'} />
          <label className="vx-field">
            <span className="vx-label">Páginas em rodízio (opcional)</span>
            <textarea className="vx-input vx-textarea" rows={3} value={c.pages} onChange={(e) => set({ pages: e.target.value })} placeholder={'ReportSection\nReportSection2'} />
            <span className="vx-help">O nome técnico de cada página aparece no endereço do relatório depois de "pageName=". {pages.length ? `${pages.length} página(s).` : 'Em branco: fica na primeira página.'}</span>
          </label>
          <div className="vx-form-row">
            <Select label="Trocar de página a cada" value={String(c.everySec)} onChange={(e) => set({ everySec: Number(e.target.value) })} options={secs([15, 20, 30, 45, 60])} />
            <Select label="Recarregar os dados" value={String(c.reloadMin)} onChange={(e) => set({ reloadMin: Number(e.target.value) })} options={[[0, 'Nunca'], [5, 'A cada 5 min'], [15, 'A cada 15 min'], [60, 'A cada 1 h']].map(([v, l]) => ({ value: String(v), label: l }))} />
          </div>
        </>
      );
    }
    case 'html':
      return (
        <>
          <label className="vx-field">
            <span className="vx-label">Código</span>
            <textarea className="vx-input vx-textarea vx-mono" rows={8} maxLength={50000} value={c.code} onChange={(e) => set({ code: e.target.value })} placeholder={'<iframe src="https://…" width="100%" height="100%" frameborder="0"></iframe>'} spellCheck={false} />
            <span className="vx-help">Roda isolado do Vértice (sem acesso ao painel nem à TV). Widgets que dependem de login podem não funcionar.</span>
          </label>
          <div className="vx-form-row">
            <Input label="Esquerda (%)" type="number" min={0} max={95} value={c.x} onChange={(e) => set({ x: Number(e.target.value) })} />
            <Input label="Topo (%)" type="number" min={0} max={95} value={c.y} onChange={(e) => set({ y: Number(e.target.value) })} />
            <Input label="Largura (%)" type="number" min={5} max={100} value={c.w} onChange={(e) => set({ w: Number(e.target.value) })} />
            <Input label="Altura (%)" type="number" min={5} max={100} value={c.h} onChange={(e) => set({ h: Number(e.target.value) })} />
          </div>
          <label className="vx-studio-color"><input type="color" value={c.bg || '#000000'} onChange={(e) => set({ bg: e.target.value })} /><span>Cor do fundo</span></label>
        </>
      );
    case 'radio':
      return (
        <>
          <Input label="Link da rádio" value={c.url} onChange={(e) => set({ url: e.target.value.trim() })} placeholder="https://stream.suaradio.com.br/aovivo.mp3"
            help="O link direto do áudio (mp3, aac ou .m3u8), não o site da rádio. Toque só rádios que você tem direito de reproduzir no seu estabelecimento (ECAD)." />
          {isInsecureAudio(c.url) && <p className="vx-help vx-help-warn"><Icon name="alert" />Link com http (sem "s"): toca no player Android e Windows, mas não na versão web do player.</p>}
          <div className="vx-form-row">
            <Input label="Nome na tela" value={c.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Rádio da Loja" />
            <Input label="Frase (opcional)" value={c.slogan} maxLength={60} onChange={(e) => set({ slogan: e.target.value })} />
          </div>
          <PhotoField c={c} set={set} label="Logo (opcional)" />
          <p className="vx-help">Para tocar de fundo enquanto as mídias passam, escolha esta rádio em Telas › (tela) › Som ambiente.</p>
        </>
      );
    default:
      return null;
  }
}

function QuizFields({ c, set }) {
  const { companyId } = useSession();
  const own = parseQuiz(c.list);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const gen = async () => {
    setBusy(true); setError('');
    try {
      const r = await api.aiText(companyId, { mode: 'quiz', topic, count: 10 });
      const lines = (r.questions || []).map((q) => q.join(' | '));
      if (!lines.length) throw new Error('A IA não trouxe perguntas. Tente outro tema.');
      set({ list: [String(c.list || '').trim(), ...lines].filter(Boolean).join('\n') });
    } catch (e) { setError(e.message || 'A IA não respondeu.'); } finally { setBusy(false); }
  };
  return (
    <>
      <Input label="Título" value={c.title} maxLength={40} onChange={(e) => set({ title: e.target.value })} />
      <div className="vx-form-row">
        <Select label="Perguntas por dia" value={String(c.perDay)} onChange={(e) => set({ perDay: Number(e.target.value) })} options={opt([3, 5, 8, 10, 15, 20])} />
        <Select label="Tempo para pensar" value={String(c.thinkSec)} onChange={(e) => set({ thinkSec: Number(e.target.value) })} options={secs([6, 8, 10, 12, 15, 20])} />
        <Select label="Resposta na tela" value={String(c.revealSec)} onChange={(e) => set({ revealSec: Number(e.target.value) })} options={secs([3, 4, 5, 6, 8])} />
      </div>
      <Toggle label="Usar o banco de perguntas do Vértice" help="Conhecimentos gerais, conferidas, embaralhadas todo dia. As suas perguntas entram primeiro." checked={c.useBank !== false} onChange={(v) => set({ useBank: v })} />
      <label className="vx-field">
        <span className="vx-label">Suas perguntas (opcional)</span>
        <textarea className="vx-input vx-textarea" rows={6} value={c.list} onChange={(e) => set({ list: e.target.value })} placeholder={'Pergunta? | resposta certa | errada | errada | errada\nEm que ano a loja abriu? | 1998 | 2005 | 1990 | 2010'} />
        <span className="vx-help">Uma por linha: a pergunta, a certa e de 1 a 3 erradas, separadas por |. As alternativas trocam de lugar sozinhas. {own.length ? `${own.length} pergunta(s).` : ''}</span>
      </label>
      <div className="vx-inline-search">
        <input className="vx-input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Tema para a IA (ex.: segurança no trabalho, futebol, café)" aria-label="Tema das perguntas" />
        <Button icon="sparkles" loading={busy} onClick={gen}>Criar 10 com IA</Button>
      </div>
      {error && <p className="vx-help vx-help-warn"><Icon name="alert" />{error}</p>}
      <p className="vx-help">Confira as perguntas da IA antes de salvar. Tempo na playlist: perguntas × (pensar + resposta) = {(Number(c.perDay) || 5) * ((Number(c.thinkSec) || 10) + (Number(c.revealSec) || 5))} s.</p>
    </>
  );
}

const RATINGS = ['L', '10', '12', '14', '16', '18'];

function CinemaFields({ c, set }) {
  const movies = Array.isArray(c.movies) ? c.movies : [];
  const upd = (i, p) => set({ movies: movies.map((m, k) => (k === i ? { ...m, ...p } : m)) });
  return (
    <>
      <div className="vx-form-row">
        <Input label="Título" value={c.title} maxLength={30} onChange={(e) => set({ title: e.target.value })} />
        <Select label="Tempo de cada filme" value={String(c.secPerMovie || 60)} onChange={(e) => set({ secPerMovie: Number(e.target.value) })} options={secs([30, 45, 60, 90, 120, 150])} />
      </div>
      <div className="vx-field">
        <span className="vx-label">Filmes (até 10)</span>
        {movies.map((m, i) => (
          <div key={i} className="vx-cine-row">
            <div className="vx-form-row">
              <Input label="Filme" value={m.title} maxLength={60} onChange={(e) => upd(i, { title: e.target.value })} />
              <Input label="Trailer no YouTube" value={m.url} onChange={(e) => upd(i, { url: e.target.value.trim() })} placeholder="https://youtu.be/…" error={m.url && !youtubeId(m.url) ? 'Link do YouTube inválido' : undefined} />
            </div>
            <div className="vx-form-row">
              <Select label="Classificação" value={m.rating || ''} onChange={(e) => upd(i, { rating: e.target.value })} options={[{ value: '', label: '—' }, ...RATINGS.map((r) => ({ value: r, label: r === 'L' ? 'Livre' : `${r} anos` }))]} />
              <Input label="Gênero" value={m.genre} maxLength={30} onChange={(e) => upd(i, { genre: e.target.value })} placeholder="Ex.: Animação" />
              <Input label="Sessões ou estreia" value={m.info} maxLength={50} onChange={(e) => upd(i, { info: e.target.value })} placeholder="Ex.: 14h · 16h30 · 19h" />
              <button type="button" className="vx-icon-btn" aria-label={`Tirar ${m.title || 'filme'}`} onClick={() => set({ movies: movies.filter((_, k) => k !== i) })}><Icon name="trash" /></button>
            </div>
          </div>
        ))}
        {movies.length < 10 && <button type="button" className="vx-chip-btn" onClick={() => set({ movies: [...movies, { title: '', url: '', rating: '', genre: '', info: '' }] })}><Icon name="plus" /> Filme</button>}
      </div>
      <Toggle label="Sem som" checked={c.muted !== false} onChange={(v) => set({ muted: v })} />
      <p className="vx-help">Use o trailer oficial publicado pela distribuidora no YouTube. Tempo na playlist: filmes × tempo de cada.</p>
    </>
  );
}

const Q_TYPES = [{ value: 'nps', label: 'Nota 0 a 10' }, { value: 'stars', label: 'Estrelas' }, { value: 'choice', label: 'Múltipla escolha' }, { value: 'text', label: 'Texto livre' }];

function SurveyFields({ c, set }) {
  const qs = Array.isArray(c.questions) ? c.questions : [];
  const upd = (i, p) => set({ questions: qs.map((q, k) => (k === i ? { ...q, ...p } : q)) });
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= qs.length) return;
    const next = [...qs];
    [next[i], next[j]] = [next[j], next[i]];
    set({ questions: next });
  };
  return (
    <>
      <div className="vx-form-row">
        <Input label="Título na tela" value={c.title} maxLength={50} onChange={(e) => set({ title: e.target.value })} />
        <Input label="Chamada" value={c.subtitle} maxLength={50} onChange={(e) => set({ subtitle: e.target.value })} />
      </div>
      <div className="vx-field">
        <span className="vx-label">Perguntas (até 8)</span>
        {qs.map((q, i) => (
          <div key={i} className="vx-survey-q">
            <div className="vx-form-row">
              <Select label={`Pergunta ${i + 1}`} value={q.type} onChange={(e) => upd(i, { type: e.target.value })} options={Q_TYPES} />
              <div className="vx-row-actions">
                <button type="button" className="vx-icon-btn" aria-label="Subir" onClick={() => move(i, -1)}><Icon name="arrowUp" /></button>
                <button type="button" className="vx-icon-btn" aria-label="Descer" onClick={() => move(i, 1)}><Icon name="arrowDown" /></button>
                <button type="button" className="vx-icon-btn" aria-label={`Tirar pergunta ${i + 1}`} onClick={() => set({ questions: qs.filter((_, k) => k !== i) })}><Icon name="trash" /></button>
              </div>
            </div>
            <Input label="Texto da pergunta" value={q.text} maxLength={140} onChange={(e) => upd(i, { text: e.target.value })} />
            {q.type === 'choice' && (
              <label className="vx-field">
                <span className="vx-label">Respostas (uma por linha, de 2 a 6)</span>
                <textarea className="vx-input vx-textarea" rows={4} value={(q.options || []).join('\n')} onChange={(e) => upd(i, { options: e.target.value.split('\n').slice(0, 6).map((s) => s.slice(0, 40)) })} />
              </label>
            )}
          </div>
        ))}
        {qs.length < 8 && <button type="button" className="vx-chip-btn" onClick={() => set({ questions: [...qs, { type: 'stars', text: '' }] })}><Icon name="plus" /> Pergunta</button>}
      </div>
      <Toggle label="Mostrar o QR Code na tela" checked={c.showQr !== false} onChange={(v) => set({ showQr: v })} />
      <p className="vx-help">As respostas são anônimas (uma por aparelho). O relatório com a nota NPS, médias e sugestões fica em <b>Interação › Pesquisas</b>.</p>
    </>
  );
}

/** Campos extras de tipos que já existiam (relógio, YouTube, planilha, WOD da semana). */
export function ClockExtra({ c, set }) {
  return (
    <div className="vx-form-row">
      <Segmented label="Estilo" value={c.style || 'digital'} onChange={(v) => set({ style: v })} options={[{ value: 'digital', label: 'Digital' }, { value: 'analog', label: 'Ponteiros' }, { value: 'both', label: 'Os dois' }]} />
      <Select label="Data" value={c.dateFormat || 'long'} onChange={(e) => set({ dateFormat: e.target.value })} options={Object.entries(CLOCK_DATE_FORMATS).map(([value, label]) => ({ value, label }))} />
    </div>
  );
}

export function YoutubeFields({ c, set }) {
  const source = c.source || 'video';
  return (
    <>
      <Segmented label="O que tocar" value={source} onChange={(v) => set({ source: v })} options={[{ value: 'video', label: 'Um vídeo' }, { value: 'playlist', label: 'Uma playlist' }, { value: 'live', label: 'Canal ao vivo' }]} />
      {source === 'video' && <Input label="Link do vídeo" value={c.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" />}
      {source === 'playlist' && <Input label="Link da playlist" value={c.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://www.youtube.com/playlist?list=PL…" help="A playlist precisa ser pública ou não listada. Os vídeos tocam em sequência e repetem." />}
      {source === 'live' && <Input label="Canal" value={c.channel} onChange={(e) => set({ channel: e.target.value.trim() })} placeholder="https://www.youtube.com/channel/UC… ou o id UC…" help="Quando o canal está ao vivo, a transmissão entra sozinha. Fora do ar, o YouTube mostra o aviso dele. Programe o horário em Programação." />}
      <Toggle label="Sem som" help="Muitas TVs só tocam automático sem som." checked={c.muted !== false} onChange={(v) => set({ muted: v })} />
    </>
  );
}

export function SheetMode({ c, set }) {
  return (
    <>
      <Segmented label="Mostrar como" value={c.mode || 'table'} onChange={(v) => set({ mode: v })} options={[{ value: 'table', label: 'Tabela' }, { value: 'bars', label: 'Barras' }, { value: 'ranking', label: 'Ranking' }, { value: 'kpis', label: 'Indicadores' }]} />
      {c.mode && c.mode !== 'table' && <p className="vx-help">Coluna A: nome; coluna B: valor; coluna C (opcional): meta. Ex.: "Loja Centro | R$ 48.200 | R$ 45.000".</p>}
    </>
  );
}

export function WodWeek({ c, set }) {
  const [open, setOpen] = useState(Object.values(c.week || {}).some(Boolean));
  const week = c.week || {};
  if (!open) return <button type="button" className="vx-chip-btn" onClick={() => setOpen(true)}><Icon name="calendar" /> Treinos da semana (um por dia)</button>;
  return (
    <div className="vx-field">
      <span className="vx-label">Treinos da semana</span>
      <div className="vx-wod-week">
        {WEEK_KEYS.map(([k, label]) => (
          <label key={k} className="vx-field">
            <span className="vx-help">{label}</span>
            <textarea className="vx-input vx-textarea" rows={3} value={week[k] || ''} onChange={(e) => set({ week: { ...week, [k]: e.target.value } })} placeholder="Em branco: usa o WOD do dia acima" />
          </label>
        ))}
      </div>
    </div>
  );
}

/** Problema que impede salvar os tipos novos (ou null). */
export function validateMoreApp(kind, c) {
  if (kind === 'lottery' && !c.games?.length) return 'Escolha pelo menos uma modalidade.';
  if (kind === 'agro' && !c.items?.length) return 'Escolha pelo menos um produto.';
  if (kind === 'tribute' && !String(c.name || '').trim()) return 'Escreva o nome do aniversariante.';
  if (kind === 'classes' && !parseClasses(c.list).length) return 'Escreva pelo menos uma aula, por exemplo: seg 07:00-08:00 Spinning.';
  if (kind === 'room' && !safeHttpUrl(String(c.url || '').replace(/^webcal:/i, 'https:'))) return 'Cole o endereço público da agenda da sala (.ics).';
  if (kind === 'quiz' && c.useBank === false && !parseQuiz(c.list).length) return 'Escreva perguntas ou ligue o banco de perguntas.';
  if (kind === 'cinema' && !(c.movies || []).some((m) => m.title && youtubeId(m.url))) return 'Coloque pelo menos um filme com o trailer do YouTube.';
  if (kind === 'survey') {
    const qs = (c.questions || []).filter((q) => String(q.text || '').trim());
    if (!qs.length) return 'Escreva pelo menos uma pergunta.';
    if (qs.some((q) => q.type === 'choice' && (q.options || []).filter((o) => o.trim()).length < 2)) return 'Perguntas de múltipla escolha precisam de pelo menos 2 respostas.';
  }
  if (kind === 'powerbi' && !powerBiUrl(c.url)) return 'Cole o link de "Publicar na Web" do Power BI (app.powerbi.com/view?r=…).';
  if (kind === 'html' && !String(c.code || '').trim()) return 'Cole o código.';
  if (kind === 'radio' && !audioKind(c.url)) return 'Cole o link direto do áudio da rádio (começando com https://).';
  if (kind === 'youtube') {
    if (c.source === 'playlist' && !youtubePlaylistId(c.url)) return 'Cole o link de uma playlist do YouTube (com list=…).';
    if (c.source === 'live' && !youtubeChannelId(c.channel)) return 'Cole o link do canal (youtube.com/channel/UC…) ou o id que começa com UC.';
  }
  return null;
}
