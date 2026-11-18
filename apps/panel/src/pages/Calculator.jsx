import { useMemo, useState } from 'react';
import { playsEstimate, energyEstimate, TV_WATTS, appDefaultSeconds } from '@vertice/shared';
import { useSession } from '../session.jsx';
import { useCol } from '../data/hooks.js';
import { PageHeader, Card, Input, Select } from '../ui/kit.jsx';

const n = (v) => Number(v).toLocaleString('pt-BR');
const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Calculadora: quantas vezes uma mídia passa (para vender espaço ao anunciante) e quanto as telas
 * gastam de energia (para o orçamento do cliente).
 */
export function Calculator() {
  const { base } = useSession();
  const playlists = useCol(`${base}/playlists`) || [];
  const screens = useCol(`${base}/screens`) || [];
  const media = useCol(`${base}/media`) || [];
  const [p, setP] = useState({ playlistId: '', cycleSec: 120, slots: 1, hoursPerDay: 12, screens: '', days: 30 });
  const [e, setE] = useState({ size: '43', watts: TV_WATTS[43], boxWatts: 10, hoursPerDay: 12, days: 30, screens: '', tariff: 0.85 });
  const set = (patch) => setP((x) => ({ ...x, ...patch }));
  const setEn = (patch) => setE((x) => ({ ...x, ...patch }));

  // Ciclo da playlist escolhida: soma dos tempos (item > mídia > padrão).
  const byId = useMemo(() => new Map(media.map((m) => [m.id, m])), [media]);
  const cycleOf = (pl) => (pl?.items || []).reduce((sum, it) => {
    const m = byId.get(it.mediaId);
    const sec = Number(it.durationSec) || Number(m?.defaultDurationSec) || (m?.type === 'app' ? appDefaultSeconds(m.app?.kind) : Number(m?.durationSec) || 10);
    return sum + sec;
  }, 0);
  const screensN = p.screens === '' ? screens.length || 1 : Number(p.screens);
  const r = playsEstimate({ ...p, screens: screensN });
  const en = energyEstimate({ ...e, screens: e.screens === '' ? screens.length || 1 : Number(e.screens) });

  return (
    <div className="vx-page">
      <PageHeader overline="COMERCIAL" title="Calculadora" subtitle="Quantas vezes um anúncio aparece e quanto as telas gastam de energia." />
      <div className="vx-calc-grid">
        <Card title="Exibições de um anúncio" icon="chart">
          <div className="vx-form">
            <Select label="Usar o ciclo de uma playlist (opcional)" value={p.playlistId} onChange={(ev) => {
              const pl = playlists.find((x) => x.id === ev.target.value);
              set({ playlistId: ev.target.value, ...(pl ? { cycleSec: cycleOf(pl) || p.cycleSec } : {}) });
            }} options={[{ value: '', label: 'Digitar o ciclo' }, ...playlists.map((x) => ({ value: x.id, label: `${x.name} (${cycleOf(x)} s)` }))]} />
            <div className="vx-form-row">
              <Input label="Ciclo da playlist (s)" type="number" min={1} value={p.cycleSec} onChange={(ev) => set({ cycleSec: ev.target.value, playlistId: '' })} help="Tempo para a playlist dar uma volta inteira." />
              <Input label="Vezes do anúncio por ciclo" type="number" min={1} max={20} value={p.slots} onChange={(ev) => set({ slots: ev.target.value })} />
            </div>
            <div className="vx-form-row">
              <Input label="Horas ligada por dia" type="number" min={1} max={24} value={p.hoursPerDay} onChange={(ev) => set({ hoursPerDay: ev.target.value })} />
              <Input label="Telas" type="number" min={1} value={p.screens} placeholder={String(screens.length || 1)} onChange={(ev) => set({ screens: ev.target.value })} />
              <Input label="Dias da campanha" type="number" min={1} value={p.days} onChange={(ev) => set({ days: ev.target.value })} />
            </div>
          </div>
          <div className="vx-calc-result">
            <div><span className="vx-faint">Por tela, por dia</span><b className="vx-num">{n(r.perDayPerScreen)}</b></div>
            <div><span className="vx-faint">Todas as telas, por dia</span><b className="vx-num">{n(r.perDay)}</b></div>
            <div className="is-main"><span className="vx-faint">Na campanha toda</span><b className="vx-num">{n(r.total)}</b></div>
          </div>
          <p className="vx-help">Estimativa com as telas ligadas o tempo todo do expediente. O número real fica em Relatórios, com a prova de exibição por tela.</p>
        </Card>

        <Card title="Consumo de energia" icon="pulse">
          <div className="vx-form">
            <div className="vx-form-row">
              <Select label="Tamanho da TV" value={e.size} onChange={(ev) => setEn({ size: ev.target.value, watts: TV_WATTS[ev.target.value] || e.watts })}
                options={[...Object.keys(TV_WATTS).map((k) => ({ value: k, label: `${k} polegadas (≈ ${TV_WATTS[k]} W)` })), { value: 'outra', label: 'Outra (digitar)' }]} />
              <Input label="Potência da TV (W)" type="number" min={1} value={e.watts} onChange={(ev) => setEn({ watts: ev.target.value, size: 'outra' })} help="Está na etiqueta atrás da TV." />
              <Input label="TV box ou PC (W)" type="number" min={0} value={e.boxWatts} onChange={(ev) => setEn({ boxWatts: ev.target.value })} />
            </div>
            <div className="vx-form-row">
              <Input label="Horas por dia" type="number" min={1} max={24} value={e.hoursPerDay} onChange={(ev) => setEn({ hoursPerDay: ev.target.value })} />
              <Input label="Dias por mês" type="number" min={1} max={31} value={e.days} onChange={(ev) => setEn({ days: ev.target.value })} />
              <Input label="Telas" type="number" min={1} value={e.screens} placeholder={String(screens.length || 1)} onChange={(ev) => setEn({ screens: ev.target.value })} />
              <Input label="Tarifa (R$/kWh)" type="number" step="0.01" min={0} value={e.tariff} onChange={(ev) => setEn({ tariff: ev.target.value })} help="Está na conta de luz, com impostos." />
            </div>
          </div>
          <div className="vx-calc-result">
            <div><span className="vx-faint">Consumo por mês</span><b className="vx-num">{n(en.kwh)} kWh</b></div>
            <div className="is-main"><span className="vx-faint">Custo por mês</span><b className="vx-num">{brl(en.cost)}</b></div>
          </div>
          <p className="vx-help">Desligar as telas fora do expediente (Empresa › Horário) reduz a conta na mesma proporção das horas.</p>
        </Card>
      </div>
    </div>
  );
}
