import { useEffect, useState } from 'react';
import {
  LEAGUES, CURRENCIES, WORLD_ZONES, formatQuote, countdownParts, zoneTime, parseBirthdays, birthdaysOf, quoteOfDay,
} from '../feeds.js';
import { commentPage } from '../comments.js';
import { timeAgo } from '../format.js';
import { qrMatrix, qrPath } from '../qr.js';

/**
 * Aplicativos novos (tempo, esportes, economia, calendário, mural). Mesmo quadro fixo do AppView:
 * medidas em px de uma tela 1920×1080 (ou 1080×1920 em pé), lidas de longe.
 */

/** Relógio que anda sozinho (rodízio, contagem regressiva, relógio mundial). */
export function useNow(everyMs = 1000, fixed) {
  const [t, setT] = useState(() => fixed || Date.now());
  useEffect(() => {
    if (fixed) return undefined;
    const id = setInterval(() => setT(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs, fixed]);
  return fixed || t;
}

const pad = (n) => String(n).padStart(2, '0');
const dayMonth = (at) => {
  const d = new Date(at);
  return { day: pad(d.getDate()), month: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') };
};
const weekdayTime = (at, now) => {
  const d = new Date(at);
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toDateString() === d.toDateString();
  const day = sameDay ? 'Hoje' : tomorrow ? 'Amanhã' : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const inDaysText = (n) => (n === 0 ? 'Hoje' : n === 1 ? 'Amanhã' : `Em ${n} dias`);
const fmtNum = (v, digits = 2) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Sem dado ainda (carregando, sem internet na primeira vez ou fonte fora do ar). */
export function Waiting({ title, status, hint }) {
  return (
    <div className="vxa-center">
      {title && <div className="vxa-dx-title">{title}</div>}
      <div className="vxa-muted vxa-dx-wait">
        {status === 'error' ? (hint || 'Sem dados agora. A tela tenta de novo sozinha.') : 'Carregando…'}
      </div>
    </div>
  );
}

function Head({ over, title, right }) {
  return (
    <header className="vxa-dx-head">
      <div>
        {over && <div className="vxa-over">{over}</div>}
        {title && <div className="vxa-dx-title">{title}</div>}
      </div>
      {right && <div className="vxa-dx-head-right">{right}</div>}
    </header>
  );
}

const TONE = { good: '#3FB37F', ok: '#E3C13B', warn: '#F08A24', bad: '#E0483E', muted: 'rgba(128,128,128,.6)' };

/* ---------------- Chuva ---------------- */

export function Rain({ c, d, status, portrait }) {
  if (!d) return <Waiting title={c.city || 'Escolha a cidade'} status={status} />;
  const hours = d.hours.slice(0, portrait ? 8 : 12);
  return (
    <div className="vxa-dx">
      <Head over={d.city || c.city} title={d.headline} right={d.umbrella ? <span className="vxa-dx-pill">Leve o guarda-chuva</span> : null} />
      <div className="vxa-rain-bars" style={{ gridTemplateColumns: `repeat(${hours.length}, 1fr)` }}>
        {hours.map((h) => (
          <div key={h.time} className="vxa-rain-col">
            <span className="vxa-rain-pct">{h.prob}%</span>
            <div className="vxa-rain-track"><div className="vxa-rain-fill" style={{ height: `${Math.max(3, h.prob)}%`, opacity: h.prob >= 50 ? 1 : 0.55 }} /></div>
            <b>{h.time}</b>
            <span className="vxa-muted">{h.temp}°</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Ar e UV ---------------- */

function Meter({ label, value, info, max }) {
  const pct = value == null ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div className="vxa-meter">
      <div className="vxa-over">{label}</div>
      <div className="vxa-meter-value" style={{ color: TONE[info.tone] }}>{value ?? '—'}</div>
      <div className="vxa-meter-label">{info.label}</div>
      <div className="vxa-meter-bar"><div style={{ width: `${pct}%`, background: TONE[info.tone] }} /></div>
      {info.tip && <div className="vxa-meter-tip">{info.tip}</div>}
    </div>
  );
}

export function Air({ c, d, status, portrait }) {
  if (!d) return <Waiting title={c.city || 'Escolha a cidade'} status={status} />;
  return (
    <div className="vxa-dx">
      <Head over={d.city || c.city} title="Qualidade do ar e sol" />
      <div className={`vxa-meters ${portrait ? 'col' : ''}`}>
        <Meter label="Qualidade do ar" value={d.aqi} info={d.air} max={200} />
        <Meter label="Índice UV" value={d.uv != null ? fmtNum(d.uv, 0) : null} info={d.uvInfo} max={12} />
      </div>
      {d.pm25 != null && <div className="vxa-dx-foot vxa-muted">Partículas finas (PM2,5): {d.pm25} µg/m³ · Fonte: Open-Meteo / CAMS</div>}
    </div>
  );
}

/* ---------------- Sol e lua ---------------- */

/**
 * Lua desenhada pela fração iluminada. No hemisfério sul (Brasil) a lua crescente aparece
 * iluminada do lado esquerdo; no norte, do direito.
 */
function MoonDisc({ illum, waxing, size = 300, south = true }) {
  const k = illum / 100; // 0 nova, 1 cheia
  const r = 50;
  const rx = Math.abs(1 - 2 * k) * r;
  const lit = waxing !== south ? 1 : 0; // 1 = lado direito iluminado
  // Metade iluminada + elipse que soma (gibosa) ou subtrai (crescente).
  const half = `M50 0 A50 50 0 0 ${lit} 50 100`;
  const ell = `A${rx} 50 0 0 ${k > 0.5 ? lit : 1 - lit} 50 0`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className="vxa-moon">
      <circle cx="50" cy="50" r={r} fill="rgba(128,128,128,.28)" />
      <path d={`${half} ${ell}`} fill="#F6EFD8" />
    </svg>
  );
}

export function SunMoon({ c, d, status, portrait }) {
  if (!d) return <Waiting title={c.city || 'Escolha a cidade'} status={status} />;
  const m = d.moon;
  return (
    <div className="vxa-dx">
      <Head over={d.city || c.city} title="Sol e lua hoje" />
      <div className={`vxa-sun ${portrait ? 'col' : ''}`}>
        <div className="vxa-sun-times">
          <div><span className="vxa-over">Nascer do sol</span><b>{d.sunrise}</b></div>
          <div><span className="vxa-over">Pôr do sol</span><b>{d.sunset}</b></div>
          <div className="vxa-muted vxa-sun-light">{d.daylight} de luz{d.uvMax != null ? ` · UV máximo ${Math.round(d.uvMax)}` : ''}</div>
        </div>
        <div className="vxa-sun-moon">
          <MoonDisc illum={m.illum} waxing={m.waxing} size={portrait ? 300 : 340} />
          <b>{m.name}</b>
          <span className="vxa-muted">{m.illum}% iluminada · cheia em {new Date(m.nextFull).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Futebol ---------------- */

function MatchRow({ m, now }) {
  const score = m.homeScore != null && m.awayScore != null;
  return (
    <li className={`vxa-match ${m.live ? 'is-live' : ''}`}>
      <span className="vxa-match-team is-home">{m.home}</span>
      <span className="vxa-match-score">{score ? `${m.homeScore} × ${m.awayScore}` : '×'}</span>
      <span className="vxa-match-team">{m.away}</span>
      <span className="vxa-match-when vxa-muted">{m.live ? <em className="vxa-dx-pill is-live">Ao vivo</em> : m.at ? weekdayTime(m.at, now) : ''}</span>
    </li>
  );
}

export function Matches({ c, d, status, now, portrait }) {
  const t = useNow(60_000, now);
  if (!d) return <Waiting title={LEAGUES[c.leagueId]?.label || 'Jogos'} status={status} />;
  return (
    <div className="vxa-dx">
      <Head over={d.league} title={d.team ? `Jogos do ${d.team}` : 'Jogos'} />
      <div className={`vxa-matches ${portrait ? 'col' : ''}`}>
        {!!d.upcoming.length && (
          <section><h3 className="vxa-dx-sub">Próximos jogos</h3><ul>{d.upcoming.map((m) => <MatchRow key={m.id} m={m} now={t} />)}</ul></section>
        )}
        {!!d.results.length && (
          <section><h3 className="vxa-dx-sub">Últimos resultados</h3><ul>{[...d.results].reverse().map((m) => <MatchRow key={m.id} m={m} now={t} />)}</ul></section>
        )}
        {!d.upcoming.length && !d.results.length && <div className="vxa-muted vxa-dx-wait">Nenhum jogo encontrado{d.team ? ` para ${d.team}` : ''}.</div>}
      </div>
    </div>
  );
}

export function Standings({ c, d, status }) {
  if (!d) return <Waiting title={LEAGUES[c.leagueId]?.label || 'Tabela'} status={status} hint="Tabela indisponível agora. Confira o campeonato e a temporada." />;
  const n = d.rows.length;
  const fs = Math.max(26, Math.min(48, Math.floor(760 / (n + 1) / 1.7)));
  return (
    <div className="vxa-dx">
      <Head over="Classificação" title={d.league} />
      <table className="vxa-table" style={{ fontSize: fs }}>
        <thead><tr><th>#</th><th>Time</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th></tr></thead>
        <tbody>
          {d.rows.map((r) => (
            <tr key={r.team} className={d.team && r.team === d.team ? 'is-hl' : ''}>
              <td>{r.pos}</td><td className="vxa-table-name">{r.team}</td><td><b>{r.pts}</b></td><td>{r.played}</td><td>{r.win}</td><td>{r.draw}</td><td>{r.loss}</td><td>{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Manchetes em rotação ---------------- */

export function Headlines({ c, d, status, now }) {
  const t = useNow(1000, now);
  if (!d) return <Waiting title="Manchetes" status={status} hint="Não consegui ler os portais agora." />;
  const every = Math.max(5, Number(c.everySec) || 8) * 1000;
  const i = Math.floor(t / every) % d.items.length;
  const it = d.items[i];
  return (
    <div className="vxa-dx vxa-headline">
      <div className="vxa-over">{it.source || 'Notícias'}</div>
      <div key={i} className="vxa-headline-title">{it.title}</div>
      <div className="vxa-headline-dots">{d.items.slice(0, 12).map((_, k) => <i key={k} className={k === i ? 'is-on' : ''} />)}</div>
    </div>
  );
}

/* ---------------- Economia ---------------- */

/** Letra do valor: todos os cartões com o mesmo tamanho, cabendo o maior número. */
function valueSize(texts, cols, portrait) {
  const longest = Math.max(4, ...texts.map((t) => String(t).length));
  const inner = ((portrait ? 1080 - 140 : 1720) - 36 * (cols - 1)) / cols - 92 - 80; // padding e "R$"
  return Math.max(56, Math.min(112, Math.floor(inner / (longest * 0.64))));
}

export function Currency({ d, status, portrait }) {
  if (!d) return <Waiting title="Cotações" status={status} />;
  const cols = portrait ? 1 : Math.min(3, d.rows.length);
  const fs = valueSize(d.rows.map((r) => formatQuote(r.bid)), cols, portrait);
  return (
    <div className="vxa-dx">
      <Head over="Cotações em reais" title="Câmbio" right={d.updated ? <span className="vxa-muted">Atualizado {String(d.updated).slice(11, 16)}</span> : null} />
      <div className="vxa-cards" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {d.rows.map((r) => (
          <div key={r.code} className="vxa-card">
            <span className="vxa-over">{CURRENCIES[r.code] || r.name}</span>
            <b className="vxa-card-value" style={{ fontSize: fs }}><small>R$</small>{formatQuote(r.bid)}</b>
            {r.pct != null && <span className={`vxa-delta ${r.pct > 0 ? 'is-up' : r.pct < 0 ? 'is-down' : ''}`}>{r.pct > 0 ? '▲' : r.pct < 0 ? '▼' : '■'} {fmtNum(Math.abs(r.pct))}% hoje</span>}
          </div>
        ))}
      </div>
      <div className="vxa-dx-foot vxa-muted">Valores de referência para compra. Fonte: AwesomeAPI</div>
    </div>
  );
}

export function Indicators({ d, status, portrait }) {
  if (!d) return <Waiting title="Indicadores" status={status} />;
  const cols = portrait ? 1 : Math.min(3, d.rows.length);
  const text = (r) => (r.unit === 'R$' ? fmtNum(r.value, 4) : `${fmtNum(r.value)}%`);
  const fs = valueSize(d.rows.map(text), cols, portrait);
  return (
    <div className="vxa-dx">
      <Head over="Banco Central do Brasil" title="Indicadores econômicos" />
      <div className="vxa-cards" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {d.rows.map((r) => (
          <div key={r.key} className="vxa-card">
            <span className="vxa-over">{r.label}</span>
            <b className="vxa-card-value" style={{ fontSize: fs }}>{r.unit === 'R$' && <small>R$</small>}{text(r)}</b>
            <span className="vxa-muted">{r.unit === '% ao ano' ? 'ao ano · ' : r.unit === '%' ? '' : ''}{r.date ? `referência ${r.date}` : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Calendário ---------------- */

function DateRows({ items, render }) {
  return <ul className="vxa-dates">{items.map(render)}</ul>;
}

export function Holidays({ d, status }) {
  if (!d) return <Waiting title="Próximos feriados" status={status} />;
  return (
    <div className="vxa-dx">
      <Head over="Calendário" title="Próximos feriados" />
      <DateRows items={d.items} render={(h) => {
        const { day, month } = dayMonth(new Date(`${h.date}T12:00:00`).getTime());
        return (
          <li key={h.date + h.name}>
            <span className="vxa-date"><b>{day}</b>{month}</span>
            <span className="vxa-dates-name">{h.name}{h.local && <em className="vxa-dx-pill">Local</em>}</span>
            <span className="vxa-dates-when">{inDaysText(h.inDays)}</span>
          </li>
        );
      }} />
    </div>
  );
}

export function Agenda({ c, d, status, now }) {
  const t = useNow(60_000, now);
  if (!d) return <Waiting title={c.title || 'Agenda'} status={status} hint="Não consegui ler o calendário. O endereço é público (formato iCal)?" />;
  return (
    <div className="vxa-dx">
      <Head over="Agenda" title={d.title} />
      {d.items.length ? (
        <DateRows items={d.items} render={(e) => {
          const { day, month } = dayMonth(e.at);
          return (
            <li key={`${e.at}${e.title}`}>
              <span className="vxa-date"><b>{day}</b>{month}</span>
              <span className="vxa-dates-name">{e.title}{e.place && <small className="vxa-muted">{e.place}</small>}</span>
              <span className="vxa-dates-when">{e.allDay ? inDaysText(Math.round((new Date(e.at).setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 86_400_000)) : weekdayTime(e.at, t).split(' · ')[1]}</span>
            </li>
          );
        }} />
      ) : <div className="vxa-center vxa-muted vxa-dx-wait">Nenhum evento nos próximos dias.</div>}
    </div>
  );
}

export function Countdown({ c, now }) {
  const t = useNow(c.showSeconds ? 1000 : 15_000, now);
  const p = countdownParts(c.target, t);
  if (!p) return <Waiting title={c.title || 'Contagem regressiva'} status="error" hint="Escolha a data no painel." />;
  if (p.done) return <div className="vxa-center"><div className="vxa-dx-big">{c.doneText || 'Chegou o dia!'}</div></div>;
  const blocks = [[p.days, p.days === 1 ? 'dia' : 'dias'], [p.hours, 'horas'], [p.minutes, 'min'], ...(c.showSeconds ? [[p.seconds, 'seg']] : [])];
  const when = new Date(Date.parse(c.target));
  return (
    <div className="vxa-center vxa-count">
      <div className="vxa-dx-title">{c.title || 'Faltam'}</div>
      <div className="vxa-count-blocks">
        {blocks.map(([v, l]) => <div key={l}><b>{l === 'dias' || l === 'dia' ? v : pad(v)}</b><span>{l}</span></div>)}
      </div>
      <div className="vxa-muted vxa-count-when">{when.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}{when.getHours() || when.getMinutes() ? `, ${pad(when.getHours())}:${pad(when.getMinutes())}` : ''}</div>
    </div>
  );
}

export function Birthdays({ c, now, portrait }) {
  const t = useNow(60_000, now);
  const list = birthdaysOf(parseBirthdays(c.list), new Date(t), c.scope);
  const month = new Date(t).toLocaleDateString('pt-BR', { month: 'long' });
  const cols = portrait ? 1 : list.length > 8 ? 3 : list.length > 4 ? 2 : 1;
  return (
    <div className="vxa-dx">
      <Head over={c.scope === 'today' ? 'Hoje' : month} title={c.title || 'Aniversariantes'} />
      {list.length ? (
        <ul className="vxa-bdays" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {list.slice(0, portrait ? 12 : 18).map((b) => (
            <li key={b.name + b.day} className={b.today ? 'is-today' : ''}>
              <span className="vxa-date"><b>{pad(b.day)}</b>{b.today ? 'hoje' : month.slice(0, 3)}</span>
              <span>{b.name}</span>
            </li>
          ))}
        </ul>
      ) : <div className="vxa-center vxa-muted vxa-dx-wait">Nenhum aniversariante {c.scope === 'today' ? 'hoje' : 'neste mês'}.</div>}
    </div>
  );
}

export function OnThisDay({ d, status }) {
  if (!d) return <Waiting title="Hoje na história" status={status} />;
  return (
    <div className="vxa-dx">
      <Head over={d.date} title="Hoje na história" />
      <ul className="vxa-history">
        {d.items.map((e) => <li key={e.year + e.text}><b>{e.year}</b><span>{e.text}</span></li>)}
      </ul>
      <div className="vxa-dx-foot vxa-muted">Fonte: Wikipédia, licença CC BY-SA</div>
    </div>
  );
}

/* ---------------- Informação ---------------- */

export function WorldClock({ c, now, portrait }) {
  const t = useNow(15_000, now);
  const zones = (c.zones?.length ? c.zones : ['America/Sao_Paulo']).slice(0, 6);
  const cols = portrait ? (zones.length > 3 ? 2 : 1) : zones.length <= 3 ? zones.length : zones.length === 4 ? 2 : 3;
  return (
    <div className="vxa-dx">
      <Head over="Agora em" title="Relógio mundial" />
      <div className="vxa-world" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {zones.map((z) => {
          const zt = zoneTime(z, t);
          const night = zt && (zt.hour < 6 || zt.hour >= 19);
          return (
            <div key={z} className={`vxa-world-city ${night ? 'is-night' : ''}`}>
              <span className="vxa-over">{WORLD_ZONES[z] || z.split('/').pop().replace(/_/g, ' ')}</span>
              <b>{zt?.time || '--:--'}</b>
              <span className="vxa-muted">{zt ? `${zt.day === 1 ? 'Amanhã' : zt.day === -1 ? 'Ontem' : 'Hoje'} · UTC${zt.offset}` : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Quote({ c, now }) {
  const t = useNow(60_000, now);
  const q = quoteOfDay(c.list, new Date(t));
  return (
    <div className="vxa-center vxa-quote">
      {c.title && <div className="vxa-over">{c.title}</div>}
      <blockquote><span aria-hidden>“</span>{q.text}</blockquote>
      {q.author && <cite>{q.author}</cite>}
    </div>
  );
}

/* ---------------- Mural de comentários ---------------- */

function SmallQr({ text, size }) {
  const m = qrMatrix(text);
  if (!m) return null;
  const n = m.length + 8;
  return (
    <div className="vxa-qr-box" style={{ width: size, height: size }}>
      <svg viewBox={`-4 -4 ${n} ${n}`} width="100%" height="100%" shapeRendering="crispEdges" aria-label="QR Code">
        <rect x="-4" y="-4" width={n} height={n} fill="#fff" />
        <path d={qrPath(m)} fill="#0E1A2B" />
      </svg>
    </div>
  );
}

export function Comments({ c, comments, now, portrait }) {
  const t = useNow(1000, now);
  const list = comments || [];
  const per = Math.max(1, Math.min(portrait ? 4 : 3, Number(c.maxShown) || 3));
  const page = commentPage(list, per, c.rotateSec, t);
  const shortLink = String(c.link || '').replace(/^https?:\/\//, '').replace(/\?.*$/, '');
  return (
    <div className={`vxa-wall ${portrait ? 'col' : ''}`}>
      <aside className="vxa-wall-side">
        <div className="vxa-over">{c.title || 'Deixe seu recado'}</div>
        {c.question && <div className="vxa-wall-question">{c.question}</div>}
        {c.showQr !== false && c.link && (
          <div className="vxa-wall-qr">
            <SmallQr text={c.link} size={portrait ? 300 : 340} />
            <span>Aponte a câmera e comente{shortLink ? <small>{shortLink}</small> : null}</span>
          </div>
        )}
      </aside>
      <div className="vxa-wall-list">
        {page.length ? page.map((m) => (
          <figure key={m.id} className="vxa-wall-card">
            <blockquote>{m.text}</blockquote>
            <figcaption><b>{m.name || 'Anônimo'}</b>{m.at ? <span className="vxa-muted"> · {timeAgo(m.at, t)}</span> : null}</figcaption>
          </figure>
        )) : (
          <div className="vxa-wall-empty">
            <b>Seja o primeiro a comentar</b>
            <span className="vxa-muted">Envie seu comentário pelo QR Code. Ele aparece aqui depois de aprovado.</span>
          </div>
        )}
      </div>
    </div>
  );
}
