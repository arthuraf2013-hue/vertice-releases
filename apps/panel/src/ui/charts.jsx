// Gráficos do painel (SVG próprio, sem biblioteca): linha/área com cruz de leitura, barras por mês e
// barra de participação. Linhas de 2 px, marcadores de 8 px, grade discreta, um eixo só, dica ao passar
// o mouse e uma tabela com os mesmos números para quem prefere ler (ou usa leitor de tela).
import { useEffect, useId, useRef, useState } from 'react';
import { formatMoney } from '@vertice/shared';

const W_MIN = 280;

/** Largura do contêiner, acompanhando o redimensionamento. */
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(W_MIN, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** R$ curto para eixos e rótulos: "R$ 2,8 mil", "R$ 950". */
export function moneyShort(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(n) >= 1000) return `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `R$ ${Math.round(n).toLocaleString('pt-BR')}`;
}
export const moneyFull = (v) => `R$ ${formatMoney(Number(v) || 0)}`;

/** Marcas "redondas" do eixo (até 4 divisões). */
function niceTicks(max) {
  if (!(max > 0)) return [0, 1];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  const top = Math.ceil(max / step) * step;
  const out = [];
  for (let v = 0; v <= top + step / 2; v += step) out.push(v);
  return out;
}

function TableView({ labels, series, format }) {
  return (
    <div className="vx-chart-table">
      <table>
        <thead><tr><th scope="col">Período</th>{series.map((s) => <th key={s.key} scope="col">{s.label}</th>)}</tr></thead>
        <tbody>
          {labels.map((l, i) => (
            <tr key={`${l}-${i}`}><th scope="row">{l}</th>{series.map((s) => <td key={s.key}>{format(s.values[i])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Moldura com o botão "Ver em tabela". */
export function ChartBox({ children, table, label }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <div className="vx-chart">
      {asTable ? table : children}
      <button type="button" className="vx-chart-toggle" onClick={() => setAsTable(!asTable)} aria-pressed={asTable} aria-label={`${asTable ? 'Ver gráfico' : 'Ver em tabela'}: ${label}`}>
        {asTable ? 'Ver gráfico' : 'Ver em tabela'}
      </button>
    </div>
  );
}

/**
 * Linha (com área opcional na primeira série).
 * series: [{ key, label, color, values, dashed?, area? }]; labels: rótulos do eixo x.
 * partialLast: o último trecho da primeira série fica tracejado (mês ainda em andamento).
 * tickEvery: mostra 1 rótulo a cada N pontos (séries diárias).
 */
export function LineChart({ series, labels, height = 240, format = moneyFull, axisFormat = moneyShort, partialLast = false, markers = true, tickEvery = 1, label = 'Gráfico', lastLabel = true }) {
  const [ref, width] = useWidth();
  const gid = useId().replace(/:/g, '');
  const [hover, setHover] = useState(null);
  const pad = { l: 64, r: 16, t: 22, b: 26 };
  const n = labels.length;
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const x = (i) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v) => pad.t + ih - (Math.max(0, v) / top) * ih;
  const path = (vals, from = 0, to = vals.length - 1) => vals.slice(from, to + 1).map((v, k) => `${k ? 'L' : 'M'}${x(from + k).toFixed(1)},${y(v).toFixed(1)}`).join('');

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = Math.round(((px - pad.l) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const main = series[0];
  const lastI = n - 1;
  const solidTo = partialLast && n > 1 ? lastI - 1 : lastI;

  return (
    <ChartBox label={label} table={<TableView labels={labels} series={series} format={format} />}>
      <div ref={ref} className="vx-chart-plot" style={{ height }}>
        <svg width={width} height={height} role="img" aria-label={`${label}. Último valor: ${format(main.values[lastI])}.`}>
          <defs>
            <linearGradient id={`fill-${gid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={main.color} stopOpacity="0.22" />
              <stop offset="1" stopColor={main.color} stopOpacity="0.04" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} className="vx-chart-grid" />
              <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="vx-chart-axis">{axisFormat(t)}</text>
            </g>
          ))}
          {labels.map((l, i) => ((i % tickEvery === 0 && i < n - Math.ceil(tickEvery / 2)) || i === lastI) && (
            <text key={`${l}-${i}`} x={x(i)} y={height - 6} textAnchor={i === lastI ? 'end' : 'middle'} className="vx-chart-axis">{l}</text>
          ))}
          {main.area !== false && n > 1 && (
            <path d={`${path(main.values)}L${x(lastI)},${y(0)}L${x(0)},${y(0)}Z`} fill={`url(#fill-${gid})`} />
          )}
          {series.map((s, si) => (
            <g key={s.key}>
              <path d={path(s.values, 0, si === 0 ? solidTo : lastI)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '5 4' : undefined} />
              {si === 0 && solidTo < lastI && <path d={path(s.values, solidTo, lastI)} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray="5 4" />}
            </g>
          ))}
          {markers && main.values.map((v, i) => (
            <circle key={i} cx={x(i)} cy={y(v)} r={i === lastI ? 5 : 4} fill={i === lastI ? main.color : 'var(--bg-card)'} stroke={main.color} strokeWidth="2" />
          ))}
          {!markers && <circle cx={x(lastI)} cy={y(main.values[lastI])} r="5" fill={main.color} stroke="var(--bg-card)" strokeWidth="2" />}
          {lastLabel && (
            <text x={Math.min(x(lastI), width - pad.r)} y={y(main.values[lastI]) - 12} textAnchor="end" className="vx-chart-value">{axisFormat(main.values[lastI])}</text>
          )}
          {hover != null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} className="vx-chart-cross" />
              {series.map((s) => <circle key={s.key} cx={x(hover)} cy={y(s.values[hover])} r="5" fill={s.color} stroke="var(--bg-card)" strokeWidth="2" />)}
            </g>
          )}
          <rect x={pad.l} y={pad.t} width={iw} height={ih} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        </svg>
        {hover != null && (
          <div className="vx-chart-tip" style={{ left: Math.min(Math.max(x(hover), 90), width - 90), top: pad.t }}>
            <b>{labels[hover]}</b>
            {series.map((s) => (
              <span key={s.key}><i style={{ background: s.color }} />{s.label}<strong>{format(s.values[hover])}</strong></span>
            ))}
          </div>
        )}
      </div>
    </ChartBox>
  );
}

/** Barras por período. partialLast: a última barra (mês em andamento) é hachurada. */
export function BarChart({ values, labels, height = 220, color = 'var(--series-1)', format = moneyFull, axisFormat = moneyShort, partialLast = true, label = 'Gráfico' }) {
  const [ref, width] = useWidth();
  const gid = useId().replace(/:/g, '');
  const [hover, setHover] = useState(null);
  const pad = { l: 64, r: 12, t: 22, b: 26 };
  const n = values.length;
  const ticks = niceTicks(Math.max(0, ...values));
  const top = ticks[ticks.length - 1] || 1;
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const slot = iw / Math.max(1, n);
  const bw = Math.max(6, Math.min(40, slot * 0.6));
  const y = (v) => pad.t + ih - (Math.max(0, v) / top) * ih;
  const best = values.indexOf(Math.max(...values));
  const bar = (i, v) => {
    const x0 = pad.l + slot * i + (slot - bw) / 2;
    const h = Math.max(v > 0 ? 2 : 0, pad.t + ih - y(v));
    const r = Math.min(4, h / 2, bw / 2);
    const yt = pad.t + ih - h;
    return `M${x0},${pad.t + ih}V${yt + r}Q${x0},${yt} ${x0 + r},${yt}H${x0 + bw - r}Q${x0 + bw},${yt} ${x0 + bw},${yt + r}V${pad.t + ih}Z`;
  };
  return (
    <ChartBox label={label} table={<TableView labels={labels} series={[{ key: 'v', label, values }]} format={format} />}>
      <div ref={ref} className="vx-chart-plot" style={{ height }}>
        <svg width={width} height={height} role="img" aria-label={`${label}. Maior valor: ${format(values[best])} em ${labels[best]}.`}>
          <defs>
            <pattern id={`hatch-${gid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill={color} opacity="0.35" />
              <line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth="3" />
            </pattern>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} className="vx-chart-grid" />
              <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="vx-chart-axis">{axisFormat(t)}</text>
            </g>
          ))}
          {values.map((v, i) => {
            const partial = partialLast && i === n - 1;
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={pad.l + slot * i} y={pad.t} width={slot} height={ih} fill="transparent" />
                <path d={bar(i, v)} fill={partial ? `url(#hatch-${gid})` : color} opacity={hover != null && hover !== i ? 0.55 : 1} />
                <text x={pad.l + slot * i + slot / 2} y={height - 6} textAnchor="middle" className="vx-chart-axis">{labels[i]}</text>
              </g>
            );
          })}
          {values[best] > 0 && (
            <text x={pad.l + slot * best + slot / 2} y={y(values[best]) - 8} textAnchor="middle" className="vx-chart-value">{axisFormat(values[best])}</text>
          )}
        </svg>
        {hover != null && (
          <div className="vx-chart-tip" style={{ left: Math.min(Math.max(pad.l + slot * hover + slot / 2, 90), width - 90), top: pad.t }}>
            <b>{labels[hover]}{partialLast && hover === n - 1 ? ' (até hoje)' : ''}</b>
            <span><i style={{ background: color }} />{label}<strong>{format(values[hover])}</strong></span>
          </div>
        )}
      </div>
    </ChartBox>
  );
}

/** Barra horizontal de participação, com legenda que diz nome, valor e fatia (a cor nunca vai sozinha). */
export function ShareBar({ parts, format = moneyFull, showCount = false, inline = false }) {
  const total = parts.reduce((a, p) => a + p.amount, 0);
  const live = parts.filter((p) => p.amount > 0);
  return (
    <div className="vx-share">
      <div className="vx-share-bar" role="img" aria-label={live.map((p) => `${p.label} ${Math.round(p.share * 100)}%`).join(', ') || 'Sem valores'}>
        {total > 0 ? live.map((p) => <span key={p.key} style={{ flexGrow: p.amount, background: p.color }} title={`${p.label}: ${format(p.amount)}`} />) : <span className="is-empty" />}
      </div>
      <ul className={`vx-share-legend ${inline ? 'is-inline' : ''}`}>
        {parts.map((p) => (
          <li key={p.key}>
            <i style={{ background: p.color }} aria-hidden="true" />
            <span>{p.label}</span>
            <b>{format(p.amount)}</b>
            <small>{total ? `${Math.round(p.share * 100)}%` : '0%'}{showCount ? ` · ${p.count} ${p.count === 1 ? 'pagamento' : 'pagamentos'}` : ''}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Rótulo do eixo x de séries diárias: "23/08". */
export const dayLabel = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

