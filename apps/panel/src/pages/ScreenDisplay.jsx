import { DISPLAY_DEFAULTS, DISPLAY_LIMITS, FIT_MODES, ROTATIONS, ROTATION_MIN_VERSION, compareVersions } from '@vertice/shared';
import { Button, Field } from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

const ROTATION_HINT = {
  0: 'Logo da TV embaixo',
  90: 'Logo da TV à direita',
  180: 'Logo da TV em cima',
  270: 'Logo da TV à esquerda',
};
const FIT_SHORT = { cover: 'Preencher', contain: 'Inteira', blur: 'Fundo desfocado', fill: 'Esticar' };
const FIT_HELP = {
  cover: 'Ocupa a tela toda. Se a proporção for diferente, corta um pouco das bordas.',
  contain: 'Mostra a mídia inteira. Sobram faixas pretas quando a proporção é diferente.',
  blur: 'Mostra a mídia inteira e preenche as faixas com ela mesma desfocada. Em vídeos, vale como "Inteira".',
  fill: 'Estica até as bordas. Pode deformar a imagem.',
};

/**
 * Posição do conteúdo na TV: rotação (como a TV foi instalada), zoom e deslocamento
 * (TVs que cortam as bordas) e o preenchimento padrão das mídias.
 */
export function ScreenDisplay({ value, onChange, calibrating, onCalibrate, calibBusy, disabled, appVersion }) {
  const d = { ...DISPLAY_DEFAULTS, ...value };
  const set = (patch) => onChange({ ...d, ...patch });
  const isDefault = d.zoom === 100 && !d.offsetX && !d.offsetY;
  // App antigo na TV: recebe só "horizontal/vertical" e ignora 180° e 270°.
  const appAntigo = (d.rotation === 180 || d.rotation === 270) && appVersion && compareVersions(appVersion, ROTATION_MIN_VERSION) < 0;

  return (
    <div className="vx-display">
      <div className="vx-display-main">
        <Field label="Como a TV está instalada">
          <div className="vx-rot-grid" role="radiogroup">
            {[0, 90, 180, 270].map((r) => (
              <button key={r} type="button" role="radio" aria-checked={d.rotation === r} disabled={disabled}
                className={`vx-rot ${d.rotation === r ? 'is-on' : ''}`} onClick={() => set({ rotation: r })}>
                <TvGlyph rotation={r} />
                <b>{r}°</b>
                <span>{ROTATIONS[r]}</span>
              </button>
            ))}
          </div>
          <span className="vx-help">Escolha pelo lado em que ficou o logo (ou o LED) da TV. Na opção marcada: {ROTATION_HINT[d.rotation]}.</span>
          {appAntigo && (
            <div className="vx-alert vx-alert-warn" role="status">
              <Icon name="alert" />
              <span>Esta TV está com o app v{appVersion}, que pode não girar {d.rotation}°: ela mostra como {d.rotation === 180 ? '0°' : '90°'}. Instale o Vértice Player {ROTATION_MIN_VERSION} ou mais novo na TV.</span>
            </div>
          )}
        </Field>

        <Field label="Preenchimento padrão das mídias">
          <div className="vx-seg vx-seg-wrap" role="radiogroup">
            {Object.keys(FIT_MODES).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={d.fit === k} disabled={disabled}
                className={`vx-seg-item ${d.fit === k ? 'is-on' : ''}`} onClick={() => set({ fit: k })}>{FIT_SHORT[k]}</button>
            ))}
          </div>
          <span className="vx-help">{FIT_HELP[d.fit]} Cada mídia pode ter um ajuste próprio em Mídias.</span>
        </Field>

        <div className="vx-adjust">
          <div className="vx-adjust-head">
            <span className="vx-field-label">Ajuste fino (TVs que cortam as bordas)</span>
            {!isDefault && !disabled && <button type="button" className="vx-link-btn" onClick={() => set({ zoom: 100, offsetX: 0, offsetY: 0 })}>Restaurar</button>}
          </div>
          <Slider label="Tamanho" unit="%" value={d.zoom} min={DISPLAY_LIMITS.zoom[0]} max={DISPLAY_LIMITS.zoom[1]} step={1} disabled={disabled} onChange={(zoom) => set({ zoom })} />
          <Slider label="Horizontal" unit="%" value={d.offsetX} min={DISPLAY_LIMITS.offset[0]} max={DISPLAY_LIMITS.offset[1]} step={0.5} disabled={disabled} onChange={(offsetX) => set({ offsetX })} signed />
          <Slider label="Vertical" unit="%" value={d.offsetY} min={DISPLAY_LIMITS.offset[0]} max={DISPLAY_LIMITS.offset[1]} step={0.5} disabled={disabled} onChange={(offsetY) => set({ offsetY })} signed />
        </div>
      </div>

      <aside className="vx-display-side">
        <DisplayPreview display={d} />
        <div className={`vx-calib-box ${calibrating ? 'is-on' : ''}`}>
          <b><Icon name="maximize" />Grade de ajuste na TV</b>
          <span className="vx-help">
            {calibrating
              ? 'A grade está na TV. Mexa nos ajustes: a TV atualiza em poucos segundos, sem precisar salvar.'
              : 'Mostra bordas, cantos e o centro na TV por 10 minutos, para acertar a posição olhando a tela.'}
          </span>
          {!disabled && (
            <Button size="sm" variant={calibrating ? 'secondary' : 'primary'} loading={calibBusy} onClick={() => onCalibrate(!calibrating)}>
              {calibrating ? 'Tirar a grade da TV' : 'Mostrar grade na TV'}
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
}

export function Slider({ label, unit, value, min, max, step, onChange, disabled, signed }) {
  const fmt = (v) => `${signed && v > 0 ? '+' : ''}${String(v).replace('.', ',')}${unit}`;
  const clamp = (v) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  return (
    <div className="vx-slider">
      <span className="vx-slider-label">{label}</span>
      <button type="button" className="vx-slider-step" aria-label={`Diminuir ${label}`} disabled={disabled || value <= min} onClick={() => onChange(clamp(value - step))}>−</button>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))} />
      <button type="button" className="vx-slider-step" aria-label={`Aumentar ${label}`} disabled={disabled || value >= max} onClick={() => onChange(clamp(value + step))}>+</button>
      <span className="vx-slider-value vx-num">{fmt(value)}</span>
    </div>
  );
}

/** TV desenhada como está na parede: a "faixa do logo" mostra para que lado ela foi girada. */
function TvGlyph({ rotation }) {
  const portrait = rotation === 90 || rotation === 270;
  const w = portrait ? 26 : 44;
  const h = portrait ? 44 : 26;
  const x = (48 - w) / 2;
  const y = (48 - h) / 2;
  const chin = { 0: [x, y + h - 5, w, 5], 180: [x, y, w, 5], 90: [x + w - 5, y, 5, h], 270: [x, y, 5, h] }[rotation];
  return (
    <svg viewBox="0 0 48 48" className="vx-rot-glyph" aria-hidden>
      <rect x={x} y={y} width={w} height={h} rx="3" fill="var(--vetta-night)" />
      <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} rx="1.5" fill="var(--vetta-navy)" />
      <rect x={chin[0]} y={chin[1]} width={chin[2]} height={chin[3]} rx="1.5" fill="#0b1017" />
      <circle cx={chin[0] + chin[2] / 2} cy={chin[1] + chin[3] / 2} r="1.4" fill="var(--vetta-gold)" />
    </svg>
  );
}

/** Prévia de como o conteúdo fica na TV instalada (visto de frente). */
function DisplayPreview({ display }) {
  const portrait = display.rotation === 90 || display.rotation === 270;
  const chinSide = { 0: 'bottom', 90: 'right', 180: 'top', 270: 'left' }[display.rotation];
  const z = display.zoom / 100;
  return (
    <div className="vx-dprev-wrap">
      <div className={`vx-dprev ${portrait ? 'is-portrait' : ''} chin-${chinSide}`}>
        <div className="vx-dprev-glass">
          <div className="vx-dprev-content" style={{ transform: `translate(${display.offsetX}%, ${display.offsetY}%) scale(${z})` }}>
            <div className="vx-dprev-art">
              <span className="vx-dprev-top">▲ TOPO</span>
              <span className="vx-dprev-dot" />
              <span className="vx-dprev-title">Sua mídia aqui</span>
            </div>
            <i className="vx-dprev-corner tl" /><i className="vx-dprev-corner tr" /><i className="vx-dprev-corner bl" /><i className="vx-dprev-corner br" />
          </div>
        </div>
      </div>
      <span className="vx-help vx-center">{portrait ? 'TV na vertical' : 'TV na horizontal'} · {ROTATION_HINT[display.rotation]}</span>
    </div>
  );
}
