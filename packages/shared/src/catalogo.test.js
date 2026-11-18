import { describe, it, expect } from 'vitest';
import {
  parseLottery, lotterySource, prizeText, parseAgroWidget, agroUrl, horoscopeOf, SIGNS, QUIZ_BANK, parseQuiz, quizOfDay, quizStep,
  fitnessOfDay, parseClasses, classesToday, roomStatus, powerBiUrl, powerBiPages, htmlDocument, audioKind, parseM3u,
  youtubePlaylistId, youtubeChannelId, youtubeSourceUrl, clockDate, cellNumber, sheetSeries, wodForDay, campaignsFor, CAMPAIGNS,
  playsEstimate, energyEstimate, pipelineTotals, followUpsDue, referralCode, storePrice, normalizeStore, storeEffect, nextPaidUntil,
  APP_SOURCES, APP_KINDS, APP_PRESETS, STUDIO_TEMPLATES, LEAGUES, NEWS_PUBLISHERS, publisherFeeds,
  normalizeSurveyQuestions, surveyLink, validAnswer, surveyReport, npsZone, callName, spokenTicket, buildManifest,
} from './index.js';

describe('loterias', () => {
  it('lê a resposta da CAIXA', () => {
    const g = parseLottery('timemania', { numero: 2469, dataApuracao: '17/11/2026', listaDezenas: ['04', '14'], acumulado: false, nomeTimeCoracaoMesSorte: 'PAYSANDU         /PA\u0000', valorEstimadoProximoConcurso: 3500000, listaRateioPremio: [{ numeroDeGanhadores: 2 }] });
    expect(g).toMatchObject({ number: 2469, numbers: ['04', '14'], extra: 'Time do coração: PAYSANDU/PA', winners: 2 });
    expect(lotterySource.urls({ games: ['megasena', 'xx', 'quina'] })).toEqual(['https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena', 'https://servicebus2.caixa.gov.br/portaldeloterias/api/quina']);
    expect(() => lotterySource.parse(['nada'], { games: ['megasena'] })).toThrow();
  });
  it('escreve o prêmio por extenso curto', () => {
    expect(prizeText(40_000_000)).toBe('R$ 40 milhões');
    expect(prizeText(1_500_000)).toBe('R$ 1,5 milhão');
    expect(prizeText(2_000_000_000)).toBe('R$ 2 bilhões');
    expect(prizeText(800_000)).toBe('R$ 800 mil');
  });
});

describe('agro (Cepea)', () => {
  const widget = `document.write(\`<table><tbody>
    <tr>
      <td>17/11/2026</td>
      <td><span class="maior">Boi Gordo</span><br /> <span class="unidade">@</span></td>
      <td>R$ <span class="maior">395,30</span></td>
    </tr>
    <tr>
      <td>17/11/2026</td>
      <td><span class="maior">Algodão</span><br /> <span class="unidade">lp</span></td>
      <td>¢R$ <span class="maior">415,58</span></td>
    </tr></tbody></table>\`)`;
  it('lê o widget na ordem pedida', () => {
    const rows = parseAgroWidget(widget, [2, 54]);
    expect(rows[0]).toMatchObject({ label: 'Boi gordo', price: 395.3, unit: 'arroba', cents: false });
    expect(rows[1]).toMatchObject({ label: 'Algodão', price: 415.58, cents: true });
    expect(agroUrl([2, 12])).toContain('id_indicador%5B%5D=2&id_indicador%5B%5D=12');
  });
});

describe('horóscopo, quiz e fitness', () => {
  it('horóscopo muda com o dia e é estável no mesmo dia', () => {
    const a = horoscopeOf('leao', new Date('2026-11-18T10:00:00'));
    expect(a).toEqual(horoscopeOf('leao', new Date('2026-11-18T22:00:00')));
    const days = new Set(Array.from({ length: 10 }, (_, i) => horoscopeOf('leao', new Date(2026, 10, 1 + i)).love));
    expect(days.size).toBeGreaterThan(3);
    expect(SIGNS).toHaveLength(12);
  });
  it('banco de perguntas: 4 alternativas distintas e certa na lista', () => {
    for (const [q, ...opts] of QUIZ_BANK) {
      expect(q.length).toBeLessThanOrEqual(110);
      expect(new Set(opts).size).toBe(opts.length);
    }
  });
  it('perguntas próprias primeiro; a certa troca de lugar', () => {
    const list = quizOfDay({ list: 'Cor do céu? | Azul | Verde | Roxo\nlinha ruim', perDay: 3 }, new Date('2026-11-18'));
    expect(list).toHaveLength(3);
    expect(list[0].q).toBe('Cor do céu?');
    expect(list[0].options[list[0].answer]).toBe('Azul');
    expect(parseQuiz('a|b')).toEqual([]);
    expect(quizOfDay({ useBank: false, list: '' })).toEqual([]);
  });
  it('quiz: pensar, depois a resposta, depois a próxima', () => {
    expect(quizStep(3, { thinkSec: 10, revealSec: 5, count: 3 })).toMatchObject({ index: 0, phase: 'think', left: 7 });
    expect(quizStep(12, { thinkSec: 10, revealSec: 5, count: 3 })).toMatchObject({ index: 0, phase: 'reveal' });
    expect(quizStep(16, { thinkSec: 10, revealSec: 5, count: 3 })).toMatchObject({ index: 1, phase: 'think' });
    expect(quizStep(46, { thinkSec: 10, revealSec: 5, count: 3 }).index).toBe(0);
  });
  it('fitness usa as frases próprias quando houver', () => {
    expect(fitnessOfDay({ list: 'Vai!\nForça!', count: 5 })).toHaveLength(2);
    expect(fitnessOfDay({ count: 3 })).toHaveLength(3);
  });
});

describe('aulas e sala de reunião', () => {
  it('entende dias, intervalos e "todo dia"', () => {
    const l = parseClasses('seg a sex 07:00-08:00 Spinning | Ana | Sala 2\nter e qui 18h30 às 19h30 Pilates\nsab 9:00-10:00 Funcional\nlixo');
    expect(l.map((x) => x.days)).toEqual([[1, 2, 3, 4, 5], [2, 4], [6]]);
    expect(l[1]).toMatchObject({ start: '18:30', end: '19:30', title: 'Pilates' });
    expect(parseClasses('sex a seg 10:00-11:00 Yoga')[0].days).toEqual([5, 6, 0, 1]);
  });
  it('marca agora, a seguir e encerradas', () => {
    const l = parseClasses('todo dia 06:00-07:00 A\ntodo dia 07:00-08:00 B\ntodo dia 09:00-10:00 C\ntodo dia 11:00-12:00 D');
    const r = classesToday(l, new Date('2026-11-18T07:30:00'));
    expect(r.map((x) => x.status)).toEqual(['done', 'now', 'next', 'later']);
  });
  it('sala livre ou ocupada', () => {
    const at = (h, m = 0) => new Date(2026, 10, 18, h, m).getTime();
    const ev = [{ title: 'A', start: at(9), end: at(10) }, { title: 'B', start: at(11), end: at(12) }];
    expect(roomStatus(ev, at(9, 30))).toMatchObject({ busy: true, current: { title: 'A' } });
    const free = roomStatus(ev, at(10, 15));
    expect(free.busy).toBe(false);
    expect(free.freeUntil).toBe(at(11));
    expect(APP_SOURCES.room.urls({ url: 'webcal://x.com/a.ics' })).toEqual(['https://x.com/a.ics']);
  });
});

describe('Power BI, HTML, rádio, IPTV e YouTube', () => {
  it('Power BI: só "Publicar na Web" e com página', () => {
    expect(powerBiUrl('https://app.powerbi.com/view?r=abc', 'ReportSection2')).toBe('https://app.powerbi.com/view?r=abc&pageName=ReportSection2');
    expect(powerBiUrl('https://evil.com/view?r=abc')).toBeNull();
    expect(powerBiUrl('https://app.powerbi.com/groups/me/reports/1')).toBeNull();
    expect(powerBiPages('A, B\nC')).toEqual(['A', 'B', 'C']);
  });
  it('HTML vira documento completo; rádio reconhece o link', () => {
    expect(htmlDocument('<b>oi</b>', '#112233')).toContain('background:#112233');
    expect(htmlDocument('<b>oi</b>', 'red;}body{x')).toContain('background:#000');
    expect(audioKind('https://r.com/live.m3u8')).toBe('hls');
    expect(audioKind('https://r.com/stream')).toBe('direct');
    expect(audioKind('ftp://r')).toBeNull();
  });
  it('lista M3U', () => {
    const m = parseM3u('#EXTM3U\n#EXTINF:-1 tvg-logo="l.png" group-title="Notícias",Canal Um\nhttps://a/1.m3u8\n#EXTINF:-1,Dois\nhttp://a/2.ts\nlixo');
    expect(m).toEqual([{ name: 'Canal Um', url: 'https://a/1.m3u8', logo: 'l.png', group: 'Notícias' }, { name: 'Dois', url: 'http://a/2.ts', logo: '', group: '' }]);
  });
  it('YouTube: playlist e canal ao vivo', () => {
    expect(youtubePlaylistId('https://www.youtube.com/playlist?list=PLabcdefghijk123')).toBe('PLabcdefghijk123');
    expect(youtubeChannelId('https://www.youtube.com/channel/UC1234567890abcdefghijkl')).toBe('UC1234567890abcdefghijkl');
    expect(youtubeSourceUrl({ source: 'live', channel: 'UC1234567890abcdefghijkl' })).toContain('live_stream?');
    expect(youtubeSourceUrl({ source: 'playlist', url: 'nada' })).toBeNull();
  });
});

describe('relógio, planilha, WOD e campanhas', () => {
  it('formatos de data', () => {
    const d = new Date(2026, 10, 18);
    expect(clockDate(d, 'short')).toBe('18/11/2026');
    expect(clockDate(d, 'long')).toMatch(/^Quarta-feira, 18 de novembro$/);
  });
  it('planilha vira série com meta', () => {
    expect(cellNumber('R$ 1.234,5')).toBe(1234.5);
    const s = sheetSeries({ rows: [['A', '10', '20'], ['B', '30', ''], ['C', 'x']] }, { sort: true });
    expect(s.rows.map((r) => r.label)).toEqual(['B', 'A']);
    expect(s.rows[1]).toMatchObject({ reached: false, pct: (10 / 30) * 100 });
  });
  it('WOD do dia da semana, ou o fixo', () => {
    expect(wodForDay({ week: { qua: 'Burpees' }, wod: 'Fixo' }, new Date(2026, 10, 18))).toBe('Burpees');
    expect(wodForDay({ week: {}, wod: 'Fixo' }, new Date(2026, 10, 18))).toBe('Fixo');
  });
  it('campanhas usam modelos do Estúdio que existem', () => {
    for (const c of CAMPAIGNS) {
      const t = STUDIO_TEMPLATES[c.template];
      expect(t, c.id).toBeTruthy();
      for (const k of Object.keys(c.fields)) expect(t.fields.some((f) => f[0] === k), `${c.id}.${k}`).toBe(true);
    }
    expect(campaignsFor(10)[0].month).toBe(10);
    expect(new Set(CAMPAIGNS.map((c) => c.id)).size).toBe(CAMPAIGNS.length);
  });
});

describe('catálogo', () => {
  it('atalhos apontam para tipos que existem', () => {
    for (const p of APP_PRESETS) if (!p.action) expect(APP_KINDS[p.kind], p.id).toBeTruthy();
    expect(Object.values(LEAGUES).filter((l) => l.state).length).toBeGreaterThanOrEqual(20);
    expect(publisherFeeds('g1', ['Política', 'Inexistente'])).toEqual([{ label: 'g1 · Política', url: NEWS_PUBLISHERS.g1.feeds['Política'] }]);
  });
});

describe('calculadora, CRM, indicação e loja', () => {
  it('exibições e energia', () => {
    expect(playsEstimate({ cycleSec: 120, slots: 1, hoursPerDay: 12, screens: 3, days: 30 })).toMatchObject({ perDayPerScreen: 360, perDay: 1080, total: 32400 });
    expect(energyEstimate({ watts: 90, boxWatts: 10, hoursPerDay: 10, days: 30, screens: 2, tariff: 1 })).toEqual({ kwh: 60, cost: 60 });
  });
  it('funil e retornos', () => {
    const leads = [{ stage: 'proposta', value: 300, nextAt: '2026-11-17' }, { stage: 'ganho', value: 500 }, { stage: 'perdido' }, { stage: 'novo', nextAt: '2026-12-01' }];
    const t = pipelineTotals(leads);
    expect(t).toMatchObject({ open: 2, winRate: 50 });
    expect(t.by.proposta.value).toBe(300);
    expect(followUpsDue(leads, new Date('2026-11-18T12:00:00'))).toHaveLength(1);
  });
  it('código de indicação estável (igual ao do servidor)', () => {
    expect(referralCode('abc')).toBe('ZHNCDM');
  });
  it('loja: promoção, vitrine e efeito', () => {
    expect(storePrice({ price: 100, promoPrice: 80, promoUntil: '2026-11-30' }, new Date('2026-11-20'))).toEqual({ price: 80, oldPrice: 100, promoUntil: '2026-11-30' });
    expect(normalizeStore([{ id: 'a', kind: 'months', name: 'X', price: 10 }, { id: 'b', kind: 'zz', name: 'Y', price: 10 }, { id: 'c', kind: 'service', name: 'Z', price: 0 }]).map((i) => i.id)).toEqual(['a']);
    const now = Date.UTC(2026, 10, 18);
    expect(storeEffect({ kind: 'months', months: 12 }, {}, nextPaidUntil).status).toBe('active');
    expect(storeEffect({ kind: 'storage', storageMB: 100 }, { storageQuotaMB: 50 }, nextPaidUntil)).toEqual({ storageQuotaMB: 150 });
    expect(now).toBeGreaterThan(0);
  });
});

describe('pesquisa de satisfação', () => {
  const qs = normalizeSurveyQuestions([{ type: 'nps', text: ' Nota? ' }, { type: 'choice', text: 'Qual?', options: ['A', ' ', 'B'] }, { type: 'choice', text: 'Só uma', options: ['A'] }, { type: 'text', text: '' }, { type: 'stars', text: 'Estrelas' }]);
  it('limpa as perguntas', () => {
    expect(qs.map((q) => q.type)).toEqual(['nps', 'choice', 'stars']);
    expect(qs[1].options).toEqual(['A', 'B']);
    expect(surveyLink('https://x.com/', 'c', 's')).toBe('https://x.com/pesquisa?e=c&m=s');
  });
  it('valida respostas como as regras', () => {
    expect(validAnswer(qs[0], 10)).toBe(true);
    expect(validAnswer(qs[0], 11)).toBe(false);
    expect(validAnswer(qs[2], 0)).toBe(false);
    expect(validAnswer(qs[1], 1)).toBe(true);
    expect(validAnswer({ type: 'text' }, '   ')).toBe(false);
  });
  it('relatório com NPS', () => {
    const r = surveyReport(qs, [{ answers: { q0: 10, q1: 0, q2: 5 } }, { answers: { q0: 3, q2: 4 } }, { answers: { q0: 9 } }]);
    expect(r.questions[0]).toMatchObject({ promoters: 2, detractors: 1, nps: 33 });
    expect(r.questions[1]).toMatchObject({ counts: [1, 0], pcts: [100, 0] });
    expect(r.questions[2].avg).toBe(4.5);
    expect(npsZone(80).label).toBe('Excelência');
    expect(npsZone(-5).tone).toBe('bad');
  });
});

describe('chamada por nome e som ambiente', () => {
  it('chama pelo nome e fala o nome', () => {
    const p = callName({}, { name: '  Maria   Souza ', counter: 'Sala 2' });
    expect(p.current).toMatchObject({ code: 'Maria Souza', name: 'Maria Souza' });
    expect(spokenTicket(p.current)).toBe('Maria Souza, Sala 2');
    expect(callName({}, { name: '  ' })).toBeNull();
  });
  it('manifesto leva a rádio de fundo da tela', () => {
    const media = [{ id: 'r1', type: 'app', name: 'Rádio', app: { kind: 'radio', config: { url: 'https://r.com/live.mp3' } } }];
    const m = buildManifest({ screen: { id: 's1', ambientMediaId: 'r1', ambientVolume: 25 }, schedules: [], playlists: [], media, company: {} });
    expect(m.ambient).toEqual({ url: 'https://r.com/live.mp3', name: 'Rádio', volume: 25 });
    expect(buildManifest({ screen: { id: 's1' }, schedules: [], playlists: [], media, company: {} }).ambient).toBeNull();
  });
});
