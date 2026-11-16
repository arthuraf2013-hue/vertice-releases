// Fontes dos aplicativos: respostas no formato de cada serviço (gravadas, sem internet).
import { describe, it, expect } from 'vitest';
import {
  APP_SOURCES, rainSource, airSource, sunSource, matchesSource, standingsSource, headlinesSource, currencySource,
  indicatorsSource, holidaysSource, onThisDaySource, agendaSource, moonPhase, leagueSeason, parseExtraDates,
  upcomingDates, parseIcs, countdownParts, zoneTime, parseBirthdays, birthdaysOf, quoteOfDay, PROVERBS, formatQuote,
  mergeFeeds, aqiLevel, uvLevel, openMeteoUrl,
} from './feeds.js';
import { APP_KINDS, weatherUrl } from './apps.js';

const NOW = new Date(2026, 10, 16, 14, 30).getTime(); // 16/11/2026 14:30 (horário da TV)
const J = (o) => JSON.stringify(o);

describe('registro', () => {
  it('todo app com fonte existe no catálogo, tem exemplo e endereço https', () => {
    for (const [kind, src] of Object.entries(APP_SOURCES)) {
      expect(APP_KINDS[kind], kind).toBeTruthy();
      const cfg = { ...APP_KINDS[kind].defaults, lat: -8.05, lon: -34.88, url: 'https://exemplo.com/a.ics' };
      expect(src.sample(cfg, NOW), kind).toBeTruthy();
      for (const u of src.urls(cfg, { now: new Date(NOW) })) expect(u, kind).toMatch(/^https:\/\//);
      expect(src.ttl).toBeGreaterThanOrEqual(60_000);
    }
  });
  it('há pelo menos 15 aplicativos novos além dos que já existiam', () => {
    const before = ['clock', 'ticker', 'weather', 'rss', 'web', 'youtube', 'qr', 'sheet', 'studio', 'price'];
    expect(Object.keys(APP_KINDS).filter((k) => !before.includes(k)).length).toBeGreaterThanOrEqual(15);
  });
  it('Open-Meteo com chave usa o servidor de clientes (uso comercial)', () => {
    expect(openMeteoUrl('api.open-meteo.com', '/v1/forecast', { a: '1' })).toBe('https://api.open-meteo.com/v1/forecast?a=1');
    expect(openMeteoUrl('api.open-meteo.com', '/v1/forecast', { a: '1' }, 'K')).toBe('https://customer-api.open-meteo.com/v1/forecast?a=1&apikey=K');
    expect(weatherUrl(1, 2, 4, 'K')).toMatch(/^https:\/\/customer-api\.open-meteo\.com\/.*apikey=K/);
    expect(weatherUrl(1, 2, 4)).toMatch(/^https:\/\/api\.open-meteo\.com\//);
  });
});

describe('tempo', () => {
  it('chuva: avisa a primeira hora com chance alta', () => {
    const body = J({ hourly: { time: ['2026-11-16T14:00', '2026-11-16T15:00', '2026-11-16T16:00'], precipitation_probability: [10, 30, 70], precipitation: [0, 0.2, 2.35], temperature_2m: [29.4, 28.6, 26.1], weather_code: [2, 3, 61] } });
    const d = rainSource.parse([body], { city: 'Recife' });
    expect(d.headline).toBe('Chance de chuva a partir das 16:00');
    expect(d.umbrella).toBe(true);
    expect(d.hours[2]).toMatchObject({ time: '16:00', prob: 70, mm: 2.4, temp: 26 });
    const dry = rainSource.parse([J({ hourly: { time: ['2026-11-16T14:00'], precipitation_probability: [5] } })], {});
    expect(dry.headline).toMatch(/Sem chuva/);
    expect(() => rainSource.parse([J({})], {})).toThrow();
    expect(rainSource.urls({ lat: null }, {})).toEqual([]);
  });
  it('ar e UV: faixas e dicas', () => {
    const d = airSource.parse([J({ current: { us_aqi: 57, pm2_5: 12.4, pm10: 20, uv_index: 9.36 } })], { city: 'Recife' });
    expect(d).toMatchObject({ aqi: 57, pm25: 12, uv: 9.4 });
    expect(d.air.label).toBe('Moderada');
    expect(d.uvInfo.label).toBe('Muito alto');
    expect(aqiLevel(30).tone).toBe('good');
    expect(aqiLevel(250).label).toBe('Muito ruim');
    expect(uvLevel(null).label).toBe('Sem dado');
  });
  it('sol: horários do dia e fase da lua', () => {
    const d = sunSource.parse([J({ daily: { sunrise: ['2026-11-16T05:01', '2026-11-17T05:01'], sunset: ['2026-11-16T17:32', '2026-11-17T17:33'], daylight_duration: [45060], uv_index_max: [11.2] } })], {}, NOW);
    expect(d).toMatchObject({ sunrise: '05:01', sunset: '17:32', daylight: '12h31', tomorrowSunrise: '05:01' });
    expect(d.moon.name).toBeTruthy();
  });
  it('fase da lua: lua cheia e nova conhecidas', () => {
    expect(moonPhase(new Date(Date.UTC(2024, 0, 25, 18))).name).toBe('Lua cheia'); // 25/01/2024
    expect(moonPhase(new Date(Date.UTC(2024, 1, 9, 23))).name).toBe('Lua nova'); // 09/02/2024
    const full = moonPhase(new Date(Date.UTC(2024, 0, 25, 18)));
    expect(full.illum).toBeGreaterThan(95);
  });
});

describe('futebol', () => {
  const ev = (id, home, away, hs, as, ts, status = 'Match Finished') => ({ idEvent: id, strHomeTeam: home, strAwayTeam: away, intHomeScore: hs, intAwayScore: as, strTimestamp: ts, strStatus: status, strVenue: 'Ilha do Retiro' });
  it('separa resultados e próximos jogos, filtra o time sem ligar para acento', () => {
    const past = J({ events: [ev('1', 'Sport Recife', 'Náutico', '2', '1', '2026-11-10T22:00:00'), ev('2', 'Ceará', 'Fortaleza', '0', '0', '2026-11-11T22:00:00')] });
    const next = J({ events: [ev('3', 'Bahia', 'Sport Recife', null, null, '2026-11-18T00:30:00', 'Not Started'), ev('4', 'Vitória', 'Ceará', null, null, '2026-11-19T22:00:00', 'NS')] });
    const all = matchesSource.parse([past, next], { leagueId: 4351, results: 3, upcoming: 5 });
    expect(all.results.map((m) => m.id)).toEqual(['1', '2']);
    expect(all.upcoming.map((m) => m.id)).toEqual(['3', '4']);
    expect(all.results[0]).toMatchObject({ homeScore: 2, awayScore: 1, done: true });
    expect(all.upcoming[0].at).toBe(Date.UTC(2026, 10, 18, 0, 30));
    const mine = matchesSource.parse([past, next], { leagueId: 4351, team: 'sport' });
    expect(mine.results.map((m) => m.id)).toEqual(['1']);
    expect(mine.upcoming.map((m) => m.id)).toEqual(['3']);
    const ce = matchesSource.parse([past, next], { leagueId: 4351, team: 'Ceara' });
    expect(ce.results.length + ce.upcoming.length).toBe(2);
  });
  it('jogo em andamento não conta como resultado', () => {
    const d = matchesSource.parse([J({ events: [] }), J({ events: [ev('9', 'A', 'B', '1', '0', '2026-11-16T17:00:00', '2H')] })], { leagueId: 4351 });
    expect(d.upcoming[0]).toMatchObject({ live: true, done: false });
  });
  it('chave própria entra no endereço; sem chave usa a pública', () => {
    expect(matchesSource.urls({ leagueId: 4351 })[0]).toBe('https://www.thesportsdb.com/api/v1/json/123/eventspastleague.php?id=4351');
    expect(matchesSource.urls({ leagueId: 4328, apiKey: 'abc' })[1]).toBe('https://www.thesportsdb.com/api/v1/json/abc/eventsnextleague.php?id=4328');
  });
  it('temporada: brasileira pelo ano, europeia vira em julho', () => {
    expect(leagueSeason(4351, new Date(2026, 10, 1))).toBe('2026');
    expect(leagueSeason(4328, new Date(2026, 10, 1))).toBe('2026-2027');
    expect(leagueSeason(4328, new Date(2027, 2, 1))).toBe('2026-2027');
    expect(leagueSeason(4351, new Date(2026, 10, 1), '2025')).toBe('2025');
    expect(standingsSource.urls({ leagueId: 4351 }, { now: new Date(2026, 10, 1) })[0]).toContain('lookuptable.php?l=4351&s=2026');
  });
  it('tabela: ordena, corta e mantém o time escolhido', () => {
    const table = Array.from({ length: 20 }, (_, i) => ({ intRank: String(i + 1), strTeam: `Time ${i + 1}`, intPlayed: '30', intWin: '10', intDraw: '5', intLoss: '15', intGoalDifference: String(10 - i), intPoints: String(60 - i) })).reverse();
    const d = standingsSource.parse([J({ table })], { leagueId: 4351, rows: 6, team: 'Time 15' });
    expect(d.rows.map((r) => r.pos)).toEqual([1, 2, 3, 4, 5, 15]);
    expect(d.team).toBe('Time 15');
    expect(d.total).toBe(20);
    expect(() => standingsSource.parse([J({ table: null })], {})).toThrow();
  });
});

describe('notícias', () => {
  const rss = (title, items) => `<?xml version="1.0"?><rss><channel><title>${title}</title>${items.map((t) => `<item><title><![CDATA[${t}]]></title></item>`).join('')}</channel></rss>`;
  it('intercala os portais, sem repetir, e aguenta um portal fora do ar', () => {
    const cfg = { feeds: [{ label: 'A', url: 'https://a/rss' }, { label: 'B', url: 'https://b/rss' }, { label: 'C', url: 'https://c/rss' }] };
    const d = headlinesSource.parse([rss('Portal A', ['a1', 'a2', 'igual']), null, rss('Portal C', ['c1', 'Igual'])], cfg);
    expect(d.items.map((i) => `${i.source}:${i.title}`)).toEqual(['A:a1', 'C:c1', 'A:a2', 'C:Igual']);
    expect(() => headlinesSource.parse([null, null, null], cfg)).toThrow();
    expect(headlinesSource.urls({ feeds: [{ url: 'javascript:x' }, { url: 'https://ok' }] })).toEqual(['https://ok']);
  });
  it('mergeFeeds limita a quantidade', () => {
    const f = { label: 'X', items: Array.from({ length: 30 }, (_, i) => ({ title: `t${i}` })) };
    expect(mergeFeeds([f], 5)).toHaveLength(5);
  });
});

describe('economia', () => {
  it('cotações da AwesomeAPI', () => {
    const body = J({ USDBRL: { bid: '5.4321', pctChange: '-0.42', create_date: '2026-11-16 14:20:01' }, BTCBRL: { bid: '512345.6', pctChange: '2.1' } });
    const d = currencySource.parse([body], { codes: ['USD', 'EUR', 'BTC'] });
    expect(d.rows.map((r) => r.code)).toEqual(['USD', 'BTC']);
    expect(d.rows[0]).toMatchObject({ bid: 5.4321, pct: -0.42 });
    expect(currencySource.urls({ codes: ['USD', 'XXX', 'EUR'] })[0]).toBe('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL');
    expect(formatQuote(5.4321)).toBe('5,4321');
    expect(formatQuote(512345.6)).toBe('512.346');
    expect(formatQuote(61.237)).toBe('61,24');
  });
  it('indicadores do Banco Central: IPCA em 12 meses é acumulado', () => {
    const cfg = { items: ['selic', 'ipca12', 'cdi'] };
    expect(indicatorsSource.urls(cfg)).toEqual([
      'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json',
      'https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/12?formato=json',
      'https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json',
    ]);
    const ipca = Array.from({ length: 12 }, (_, i) => ({ data: `01/${String(i + 1).padStart(2, '0')}/2026`, valor: '0.40' }));
    const d = indicatorsSource.parse([J([{ data: '05/11/2026', valor: '15.00' }]), J(ipca), null], cfg);
    expect(d.rows.map((r) => r.key)).toEqual(['selic', 'ipca12']);
    expect(d.rows[0].value).toBe(15);
    expect(d.rows[1].value).toBeCloseTo(4.91, 2); // (1,004^12 − 1) × 100
    expect(() => indicatorsSource.parse([null, '<html>', null], cfg)).toThrow();
  });
});

describe('calendário', () => {
  it('feriados: lista nacional + datas da loja, a partir de hoje', () => {
    const y26 = J([{ date: '2026-11-02', name: 'Finados', type: 'national' }, { date: '2026-11-20', name: 'Consciência Negra', type: 'national' }, { date: '2026-12-25', name: 'Natal', type: 'national' }]);
    const y27 = J([{ date: '2027-01-01', name: 'Confraternização Universal', type: 'national' }]);
    const d = holidaysSource.parse([y26, y27], { extra: '08/12 Nossa Senhora da Conceição\n16/11 Aniversário da loja', count: 4 }, NOW);
    expect(d.items.map((h) => h.name)).toEqual(['Aniversário da loja', 'Consciência Negra', 'Nossa Senhora da Conceição', 'Natal']);
    expect(d.items[0]).toMatchObject({ inDays: 0, local: true });
    expect(d.items[1].inDays).toBe(4);
    expect(holidaysSource.urls({}, { now: new Date(NOW) })).toEqual(['https://brasilapi.com.br/api/feriados/v1/2026', 'https://brasilapi.com.br/api/feriados/v1/2027']);
  });
  it('datas extras: dia/mês, com ano e ISO; ignora linha sem data', () => {
    expect(parseExtraDates('8/12 Conceição\n24/06/2027 - São João\n2026-12-31: Fecha cedo\nsem data')).toEqual([
      { md: '12-08', name: 'Conceição' }, { date: '2027-06-24', name: 'São João' }, { date: '2026-12-31', name: 'Fecha cedo' },
    ]);
    expect(upcomingDates([], [{ md: '01-05', name: 'Antes' }], new Date(NOW), 3)[0].date).toBe('2027-01-05');
  });
  it('hoje na história: eventos curtos, ordenados por ano', () => {
    const events = Array.from({ length: 12 }, (_, i) => ({ year: 1900 + i * 10, text: `Fato ${i}` }));
    events.push({ year: 1500, text: 'x'.repeat(400) });
    const d = onThisDaySource.parse([J({ events })], { count: 3 }, NOW);
    expect(d.items).toHaveLength(3);
    expect(d.items.every((e) => e.text.length < 220)).toBe(true);
    expect(d.items[0].year).toBeLessThan(d.items[2].year);
    expect(onThisDaySource.urls({}, { now: new Date(NOW) })[0]).toBe('https://pt.wikipedia.org/api/rest_v1/feed/onthisday/events/11/16');
  });
  it('agenda .ics: datas, horário UTC, linhas dobradas, repetição e cancelado', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261120', 'SUMMARY:Black Friday', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART:20261117T210000Z', 'SUMMARY:Degustação de ', ' vinhos', 'LOCATION:Loja Centro\\, Recife', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART;TZID=America/Recife:20260105T090000', 'RRULE:FREQ=WEEKLY;BYDAY=MO', 'SUMMARY:Reunião semanal', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART:20261118T120000Z', 'SUMMARY:Cancelado', 'STATUS:CANCELLED', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART:20250101T120000Z', 'SUMMARY:Passado', 'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const items = parseIcs(ics, NOW, 6);
    // A reunião de hoje (09:00) já passou às 14:30: vale a da próxima segunda.
    expect(items.map((e) => e.title)).toEqual(['Degustação de vinhos', 'Black Friday', 'Reunião semanal']);
    expect(items[0]).toMatchObject({ place: 'Loja Centro, Recife', at: Date.UTC(2026, 10, 17, 21) });
    expect(new Date(items[2].at).getDay()).toBe(1); // segunda-feira
    expect(new Date(items[2].at).getDate()).toBe(23);
    expect(() => agendaSource.parse(['<html>'], {}, NOW)).toThrow();
    expect(agendaSource.urls({ url: 'webcal://x.com/a.ics' })).toEqual(['https://x.com/a.ics']);
  });
});

describe('apps sem internet', () => {
  it('contagem regressiva', () => {
    expect(countdownParts('2026-11-18T16:45', NOW)).toMatchObject({ days: 2, hours: 2, minutes: 15, done: false });
    expect(countdownParts('2020-01-01T00:00', NOW).done).toBe(true);
    expect(countdownParts('', NOW)).toBeNull();
  });
  it('relógio mundial', () => {
    const t = Date.UTC(2026, 10, 16, 23, 30);
    expect(zoneTime('Asia/Tokyo', t).time).toBe('08:30');
    expect(zoneTime('Europe/London', t).time).toBe('23:30');
    expect(zoneTime('Fuso/Inexistente', t)).toBeNull();
  });
  it('aniversariantes do mês, hoje em destaque', () => {
    const list = parseBirthdays('Ana Souza 16/11\n03/11 - Bruno\nCarla 2/12\nlinha errada\nDiego 40/11');
    expect(list).toHaveLength(3);
    const m = birthdaysOf(list, new Date(NOW));
    expect(m.map((b) => b.name)).toEqual(['Bruno', 'Ana Souza']);
    expect(m[1].today).toBe(true);
    expect(birthdaysOf(list, new Date(NOW), 'today').map((b) => b.name)).toEqual(['Ana Souza']);
  });
  it('frase do dia: muda por dia, separa o autor, usa ditados sem lista', () => {
    const a = quoteOfDay('Primeira — Autora\nSegunda', new Date(2026, 10, 16));
    const b = quoteOfDay('Primeira — Autora\nSegunda', new Date(2026, 10, 17));
    expect(a.text).not.toBe(b.text);
    expect([a, b].find((q) => q.author === 'Autora')?.text).toBe('Primeira');
    expect(PROVERBS).toContain(quoteOfDay('', new Date(NOW)).text);
  });
});
