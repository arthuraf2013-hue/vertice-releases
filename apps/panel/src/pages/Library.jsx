import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CAMPAIGNS, campaignsFor, studioFields, APP_KINDS, publisherFeeds } from '@vertice/shared';
import { AppView } from '@vertice/shared/apps';
import { useSession } from '../session.jsx';
import { api } from '../data/api.js';
import { PageHeader, Button, Card, Chip, useToast } from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** Peça pronta da biblioteca → app do Estúdio, com as cores da campanha. */
const pieceConfig = (c) => ({ template: c.template, theme: 'brand', colors: c.colors || null, imageMediaId: '', fields: studioFields(c.template, c.fields) });

/**
 * KITS: um pacote de aplicativos e uma playlist pronta para um tipo de uso, criado num clique.
 * O de comunicação interna segue o caso das indústrias (aniversariantes, campanhas, notícias, indicadores).
 */
const KITS = {
  interna: {
    label: 'Comunicação interna',
    desc: 'Aniversariantes, campanhas do mês, avisos de segurança, notícias da Agência Brasil, indicadores econômicos e o quiz do dia.',
    apps: (month) => [
      { name: 'Aniversariantes do mês', kind: 'birthdays', config: { title: 'Aniversariantes do mês', list: '', scope: 'month', theme: 'wine' } },
      { name: 'Notícias', kind: 'headlines', config: { feeds: publisherFeeds('agenciabrasil', ['Últimas', 'Economia']), everySec: 8, theme: 'night' } },
      { name: 'Indicadores', kind: 'indicators', config: { items: ['selic', 'ipca12', 'cdi'], theme: 'brand' } },
      { name: 'Quiz do dia', kind: 'quiz', config: { ...APP_KINDS.quiz.defaults, perDay: 3 } },
      ...campaignsFor(month).filter((c) => ['Saúde', 'Segurança', 'Interna'].includes(c.tag)).slice(0, 4).map((c) => ({ name: c.title, kind: 'studio', config: pieceConfig(c) })),
    ],
  },
  varejo: {
    label: 'Loja e varejo',
    desc: 'Datas do mês com oferta, relógio, previsão de chuva, Wi-Fi por QR Code e as manchetes do g1.',
    apps: (month) => [
      { name: 'Relógio', kind: 'clock', config: { ...APP_KINDS.clock.defaults, style: 'both' } },
      { name: 'Wi-Fi para clientes', kind: 'qr', config: { ...APP_KINDS.qr.defaults, mode: 'wifi', title: 'Wi-Fi grátis para clientes' } },
      { name: 'Manchetes', kind: 'headlines', config: { feeds: publisherFeeds('g1', ['Últimas']), everySec: 8, theme: 'night' } },
      ...campaignsFor(month).filter((c) => ['Varejo', 'Data', 'Aviso'].includes(c.tag)).slice(0, 4).map((c) => ({ name: c.title, kind: 'studio', config: pieceConfig(c) })),
    ],
  },
  academia: {
    label: 'Academia',
    desc: 'Frases de motivação, agenda de aulas, cronômetro de treino, horóscopo e resultado das loterias.',
    apps: () => [
      { name: 'Fitness', kind: 'fitness', config: { ...APP_KINDS.fitness.defaults } },
      { name: 'Aulas de hoje', kind: 'classes', config: { ...APP_KINDS.classes.defaults, list: 'seg a sex 07:00-08:00 Funcional\nseg qua sex 18:00-19:00 Spinning\nter qui 19:00-20:00 Pilates' } },
      { name: 'Horóscopo', kind: 'horoscope', config: { ...APP_KINDS.horoscope.defaults } },
      { name: 'Loterias', kind: 'lottery', config: { ...APP_KINDS.lottery.defaults } },
    ],
  },
};

export function Library() {
  const { base, member, can } = useSession();
  const toast = useToast();
  const nav = useNavigate();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [busy, setBusy] = useState('');
  const list = month === 0 ? CAMPAIGNS.filter((c) => c.month == null) : CAMPAIGNS.filter((c) => c.month === month);

  const use = async (c) => {
    setBusy(c.id);
    try {
      await api.add(`${base}/media`, {
        type: 'app', name: c.title, app: { kind: 'studio', config: pieceConfig(c) }, defaultDurationSec: null, sizeBytes: 0,
        createdAt: api.NOW, updatedAt: api.NOW, createdBy: member?.name || '',
      });
      toast('Peça criada no Estúdio. Ajuste o texto se quiser e coloque numa playlist.');
    } finally { setBusy(''); }
  };

  const kit = async (key) => {
    setBusy(key);
    try {
      const items = KITS[key].apps(now.getMonth() + 1);
      const ids = items.map(() => api.newId(`${base}/media`));
      const ops = items.map((it, i) => ({
        op: 'set', path: `${base}/media/${ids[i]}`,
        data: { type: 'app', name: it.name, app: { kind: it.kind, config: it.config }, defaultDurationSec: null, sizeBytes: 0, createdAt: api.NOW, updatedAt: api.NOW, createdBy: member?.name || '' },
      }));
      ops.push({ op: 'set', path: `${base}/playlists/${api.newId(`${base}/playlists`)}`, data: { name: KITS[key].label, items: ids.map((mediaId) => ({ mediaId, durationSec: null, validFrom: null, validTo: null })), createdAt: api.NOW, updatedAt: api.NOW } });
      await api.batch(ops);
      toast(`Kit criado: ${items.length} aplicativos e a playlist "${KITS[key].label}". Agora é só programar nas telas.`);
      nav('/playlists');
    } finally { setBusy(''); }
  };

  return (
    <div className="vx-page">
      <PageHeader overline="CONTEÚDO" title="Biblioteca" subtitle="Campanhas prontas para cada mês e kits completos por tipo de negócio. Use, ajuste no Estúdio e programe." />

      <Card title="Kits prontos" icon="layers">
        <div className="vx-kits">
          {Object.entries(KITS).map(([k, kitDef]) => (
            <div key={k} className="vx-kit">
              <b>{kitDef.label}</b>
              <p className="vx-faint">{kitDef.desc}</p>
              {can('editor') && <Button size="sm" icon="plus" loading={busy === k} onClick={() => kit(k)}>Criar kit</Button>}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Campanhas do mês" icon="calendar">
        <div className="vx-lib-months" role="tablist" aria-label="Mês">
          {MONTHS.map((m, i) => (
            <button key={m} type="button" role="tab" aria-selected={month === i + 1} className={`vx-chip-btn ${month === i + 1 ? 'is-on' : ''}`} onClick={() => setMonth(i + 1)}>{m.slice(0, 3)}</button>
          ))}
          <button type="button" role="tab" aria-selected={month === 0} className={`vx-chip-btn ${month === 0 ? 'is-on' : ''}`} onClick={() => setMonth(0)}>Ano todo</button>
        </div>
        <div className="vx-lib-grid">
          {list.map((c) => (
            <div key={c.id} className="vx-lib-card">
              <div className="vx-lib-thumb"><AppView app={{ kind: 'studio', config: pieceConfig(c) }} preview /></div>
              <div className="vx-lib-meta">
                <Chip>{c.tag}</Chip>
                <b>{c.title}</b>
              </div>
              {can('editor') && <Button size="sm" icon="plus" loading={busy === c.id} onClick={() => use(c)}>Usar</Button>}
            </div>
          ))}
        </div>
        <p className="vx-help"><Icon name="alert" /> Campanhas de saúde seguem as datas oficiais de conscientização. Confira telefones e datas antes de publicar.</p>
      </Card>
    </div>
  );
}

