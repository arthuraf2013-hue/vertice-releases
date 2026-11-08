import { useMemo, useState } from 'react';
import { aggregatePlays, daysAgoISO, localISODate, formatDuration, toCsv, APP_KINDS } from '@vertice/shared';
import { useSession } from '../session.jsx';
import { useCol, useById } from '../data/hooks.js';
import {
  PageHeader, Button, Card, MetricCard, Loading, EmptyState, Segmented, Select, MediaThumb,
} from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

const PERIODS = [
  { value: 'today', label: 'Hoje' },
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: 'month', label: 'Este mês' },
  { value: 'custom', label: 'Escolher' },
];

function range(period, custom) {
  const today = localISODate();
  if (period === 'today') return [today, today];
  if (period === '7') return [daysAgoISO(6), today];
  if (period === '30') return [daysAgoISO(29), today];
  if (period === 'month') return [`${today.slice(0, 8)}01`, today];
  const from = custom.from || today;
  const to = custom.to || today;
  return from <= to ? [from, to] : [to, from];
}
const br = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const fmtNum = (n) => Number(n || 0).toLocaleString('pt-BR');

/**
 * Relatórios: quantas vezes e por quanto tempo cada mídia passou, em cada tela.
 * As TVs somam as exibições no aparelho e mandam os totais do dia a cada 5 minutos.
 */
export function Reports() {
  const { base, units } = useSession();
  const [period, setPeriod] = useState('7');
  const [custom, setCustom] = useState({ from: daysAgoISO(6), to: localISODate() });
  const [by, setBy] = useState('media');
  const [screenId, setScreenId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [advId, setAdvId] = useState('');
  const advertisers = useCol(`${base}/advertisers`, { orderBy: ['name', 'asc'] });
  const [from, to] = range(period, custom);
  const stats = useCol(`${base}/playStats`, { where: [['date', '>=', from], ['date', '<=', to]] });
  const screens = useCol(`${base}/screens`, { orderBy: ['code', 'asc'] });
  const media = useCol(`${base}/media`);
  const screenById = useById(screens);
  const mediaById = useById(media);
  const unitById = useById(units);

  const docs = useMemo(() => (stats || []).filter((d) => (!screenId || d.screenId === screenId)
    && (!unitId || screenById.get(d.screenId)?.unitId === unitId)), [stats, screenId, unitId, screenById]);
  const advertiserOf = (id) => mediaById.get(id)?.advertiserId || null;
  const aggOpts = { advertiserOf, ...(advId ? { advertiser: advId === '-' ? '' : advId } : {}) };
  const rows = useMemo(() => aggregatePlays(docs, by, aggOpts), [docs, by, advId, mediaById]); // eslint-disable-line react-hooks/exhaustive-deps
  const totals = useMemo(() => {
    const t = aggregatePlays(docs, 'media', aggOpts);
    return {
      plays: t.reduce((a, r) => a + r.plays, 0),
      seconds: t.reduce((a, r) => a + r.seconds, 0),
      media: t.length,
      screens: new Set(docs.map((d) => d.screenId)).size,
    };
  }, [docs, advId, mediaById]); // eslint-disable-line react-hooks/exhaustive-deps
  const advById = useById(advertisers);

  if (!stats || !screens || !media) return <Loading />;
  const label = (r) => {
    if (by === 'screen') {
      const s = screenById.get(r.key);
      return s ? `${s.name} (${s.code})` : 'Tela removida';
    }
    if (by === 'day') return br(r.key);
    if (by === 'advertiser') return r.key ? advById.get(r.key)?.name || 'Anunciante removido' : 'Conteúdo próprio';
    return mediaById.get(r.key)?.name || r.name || 'Mídia removida';
  };
  const max = Math.max(1, ...rows.map((r) => r.plays));

  const exportCsv = () => {
    const cols = [
      { label: by === 'screen' ? 'Tela' : by === 'day' ? 'Dia' : by === 'advertiser' ? 'Anunciante' : 'Mídia', value: label },
      ...(by === 'media' ? [{ label: 'Tipo', value: (r) => { const m = mediaById.get(r.key); return m?.type === 'app' ? APP_KINDS[m.app?.kind]?.label || 'Aplicativo' : m?.type === 'video' ? 'Vídeo' : m ? 'Imagem' : ''; } }] : []),
      { label: 'Exibições', value: 'plays' },
      { label: 'Tempo na tela (min)', value: (r) => (r.seconds / 60).toFixed(1).replace('.', ',') },
      { label: by === 'screen' ? 'Mídias' : 'Telas', value: (r) => (by === 'screen' ? r.media : r.screens) },
      { label: 'Dias', value: 'days' },
    ];
    const blob = new Blob([toCsv(rows, cols)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vertice-exibicoes-${by}-${from}_a_${to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <div className="vx-page">
      <PageHeader overline="COMERCIAL" title="Relatórios" subtitle="Quantas vezes e por quanto tempo cada mídia passou nas suas telas."
        actions={<Button icon="download" onClick={exportCsv} disabled={!rows.length}>Exportar planilha</Button>} />

      <Card className="vx-report-filters">
        <div className="vx-report-filter-row">
          <Segmented label="Período" value={period} onChange={setPeriod} options={PERIODS} />
          {period === 'custom' && (
            <div className="vx-form-row">
              <label className="vx-field"><span className="vx-label">De</span><input className="vx-input" type="date" value={custom.from} max={localISODate()} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} /></label>
              <label className="vx-field"><span className="vx-label">Até</span><input className="vx-input" type="date" value={custom.to} max={localISODate()} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} /></label>
            </div>
          )}
          <Select label="Unidade" value={unitId} onChange={(e) => { setUnitId(e.target.value); setScreenId(''); }}
            options={[{ value: '', label: 'Todas' }, ...units.map((u) => ({ value: u.id, label: u.name }))]} />
          <Select label="Tela" value={screenId} onChange={(e) => setScreenId(e.target.value)}
            options={[{ value: '', label: 'Todas' }, ...screens.filter((s) => !unitId || s.unitId === unitId).map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))]} />
          {!!advertisers?.length && (
            <Select label="Anunciante" value={advId} onChange={(e) => setAdvId(e.target.value)}
              options={[{ value: '', label: 'Todos' }, { value: '-', label: 'Conteúdo próprio' }, ...advertisers.map((a) => ({ value: a.id, label: a.name }))]} />
          )}
        </div>
        <span className="vx-faint">{from === to ? br(from) : `${br(from)} a ${br(to)}`}</span>
      </Card>

      <div className="vx-grid-4">
        <MetricCard icon="play" label="Exibições" value={fmtNum(totals.plays)} note="Vezes que uma mídia entrou na tela" />
        <MetricCard icon="clock" label="Tempo na tela" value={formatDuration(totals.seconds)} dot="sync" note="Soma de todas as telas" />
        <MetricCard icon="image" label="Mídias exibidas" value={totals.media} note="Imagens, vídeos e aplicativos" />
        <MetricCard icon="screen" label="Telas com registro" value={totals.screens} total={screens.length} note="Telas que mandaram exibições" />
      </div>

      <Card title="Exibições" icon="chart" actions={<Segmented value={by} onChange={setBy} options={[{ value: 'media', label: 'Por mídia' }, { value: 'screen', label: 'Por tela' }, ...(advertisers?.length ? [{ value: 'advertiser', label: 'Por anunciante' }] : []), { value: 'day', label: 'Por dia' }]} />}>
        {rows.length ? (
          by === 'day' ? (
            <div className="vx-report-days" role="img" aria-label="Exibições por dia">
              {rows.map((r) => (
                <div key={r.key} className="vx-report-day" title={`${br(r.key)}: ${fmtNum(r.plays)} exibições`}>
                  <span className="vx-num vx-faint">{fmtNum(r.plays)}</span>
                  <i style={{ height: `${Math.max(3, (r.plays / max) * 100)}%` }} />
                  <b>{br(r.key).slice(0, 5)}</b>
                </div>
              ))}
            </div>
          ) : (
            <table className="vx-table vx-report-table">
              <thead>
                <tr>
                  <th>{by === 'screen' ? 'Tela' : by === 'advertiser' ? 'Anunciante' : 'Mídia'}</th>
                  <th className="vx-num">Exibições</th>
                  <th className="vx-num">Tempo na tela</th>
                  <th className="vx-num">{by === 'screen' ? 'Mídias' : 'Telas'}</th>
                  <th aria-label="Participação" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>
                      <span className="vx-report-name">
                        {by === 'media' ? <MediaThumb media={mediaById.get(r.key)} className="vx-report-thumb" /> : <span className="vx-tile"><Icon name={by === 'advertiser' ? 'megaphone' : 'screen'} /></span>}
                        <span className="vx-ellipsis">{label(r)}</span>
                      </span>
                    </td>
                    <td className="vx-num">{fmtNum(r.plays)}</td>
                    <td className="vx-num">{formatDuration(r.seconds)}</td>
                    <td className="vx-num">{by === 'screen' ? r.media : r.screens}</td>
                    <td className="vx-report-bar"><div className="vx-bar"><i style={{ width: `${(r.plays / max) * 100}%` }} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          <EmptyState icon="chart" title="Nenhuma exibição nesse período">
            As telas mandam as exibições a cada 5 minutos. Players anteriores a esta versão não mandam: atualize o player das telas.
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
