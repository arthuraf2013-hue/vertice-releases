import { describe, it, expect } from 'vitest';
import {
  buildManifest, layoutForScreen, normalizeLayout, normalizeBar, isOpen, volumeAt, nextOpening, hoursFor, alertFor, normalizeAlert,
  callNext, callNumber, callAgain, spokenTicket, normalizeQueueConfig, formatTicket,
  timerAt, timerTotal, timerElapsed, timerCommand, parseStarts, normalizeTimer,
  pollResults, pollOptions, voteLink, voteId,
  driveFolderId, parseDriveList, driveListUrl, streamKind,
  auditEntry, describeAudit, publicCatalog, proposalTotals, normalizeCatalog, APP_KINDS, APP_SOURCES,
} from './index.js';

const at = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi);

describe('layouts e barra inferior', () => {
  const layouts = [
    { id: 'g', template: 'side', groupIds: ['lojas'], updatedAt: 5, zones: { side: { playlistId: 'p2' } } },
    { id: 's', template: 'lshape', screenIds: ['t1'], updatedAt: 1 },
    { id: 'off', template: 'split', screenIds: ['t1'], active: false, updatedAt: 9 },
  ];
  it('marcado direto na tela vale mais que por grupo; desligado não vale', () => {
    expect(layoutForScreen(layouts, { id: 't1', groupIds: ['lojas'] }).id).toBe('s');
    expect(layoutForScreen(layouts, { id: 't2', groupIds: ['lojas'] }).id).toBe('g');
    expect(layoutForScreen(layouts, { id: 't3' })).toBeNull();
  });
  it('normaliza zonas do modelo e a barra', () => {
    const l = normalizeLayout({ template: 'lshape', zones: { side: { playlistId: 'x' } }, sideWidth: 90 });
    expect(Object.keys(l.zones)).toEqual(['side', 'foot']);
    expect(l.sideWidth).toBe(40);
    expect(normalizeBar({ enabled: true, lines: 'a\n\n b ', theme: '?' })).toMatchObject({ lines: ['a', 'b'], theme: 'brand' });
  });
  it('manifesto leva zonas, logo da barra e baixa os arquivos das zonas', () => {
    const media = [
      { id: 'm1', type: 'image', url: 'https://x/m1.jpg', sizeBytes: 10 },
      { id: 'm2', type: 'image', url: 'https://x/m2.jpg', sizeBytes: 20 },
      { id: 'logo', type: 'image', url: 'https://x/logo.png', sizeBytes: 5, name: 'logo.png' },
    ];
    const playlists = [{ id: 'p1', items: [{ mediaId: 'm1' }] }, { id: 'p2', items: [{ mediaId: 'm2' }] }];
    const schedules = [{ id: 's1', status: 'published', screenIds: ['t1'], fallbackPlaylistId: 'p1', slots: [] }];
    const lay = [{ id: 'L', template: 'side', screenIds: ['t1'], zones: { side: { playlistId: 'p2' } }, bar: { enabled: true, lines: ['Oi'], logoMediaId: 'logo' } }];
    const m = buildManifest({ screen: { id: 't1' }, schedules, playlists, media, company: {}, layouts: lay });
    expect(m.layout.template).toBe('side');
    expect(m.layout.zones.side[0].mediaId).toBe('m2');
    expect(m.layout.bar.logo.mediaId).toBe('logo');
    expect(m.assets.map((a) => a.mediaId).sort()).toEqual(['logo', 'm1', 'm2']);
    expect(m.alert).toBeNull();
    expect(m.hours).toBeNull();
  });
});

describe('horário de funcionamento', () => {
  const h = { enabled: true, days: [1, 2, 3, 4, 5], open: '08:00', close: '18:00', volumes: [{ start: '12:00', end: '14:00', level: 20 }], volume: 80 };
  it('aberto só nos dias e horas marcados', () => {
    expect(isOpen(h, at(2026, 11, 16, 9))).toBe(true); // segunda
    expect(isOpen(h, at(2026, 11, 16, 18))).toBe(false);
    expect(isOpen(h, at(2026, 11, 15, 10))).toBe(false); // domingo
    expect(isOpen({ enabled: false }, at(2026, 11, 15, 3))).toBe(true);
  });
  it('expediente que passa da meia-noite', () => {
    const bar = { enabled: true, days: [5], open: '18:00', close: '02:00' };
    expect(isOpen(bar, at(2026, 11, 20, 23))).toBe(true); // sexta
    expect(isOpen(bar, at(2026, 11, 21, 1))).toBe(true); // madrugada de sábado
    expect(isOpen(bar, at(2026, 11, 22, 1))).toBe(false); // madrugada de domingo
  });
  it('volume por faixa', () => {
    expect(volumeAt(h, at(2026, 11, 16, 12, 30))).toBe(20);
    expect(volumeAt(h, at(2026, 11, 16, 15))).toBe(80);
  });
  it('próxima abertura e horário da unidade', () => {
    expect(nextOpening(h, at(2026, 11, 16, 19))).toBe('Abrimos amanhã às 08:00');
    expect(hoursFor({ hours: h }, { hours: { enabled: true, open: '10:00', close: '22:00', days: [0] } }).open).toBe('10:00');
    expect(hoursFor({ hours: h }, { hours: { enabled: false } }).open).toBe('08:00');
  });
});

describe('alerta urgente', () => {
  it('vale até o prazo e só para as telas marcadas', () => {
    const a = { active: true, title: 'Atenção', until: 2000, screenIds: ['t1'] };
    expect(alertFor(a, 't1', 1000)).toBeTruthy();
    expect(alertFor(a, 't2', 1000)).toBeNull();
    expect(alertFor(a, 't1', 3000)).toBeNull();
    expect(alertFor({ ...a, until: 0, screenIds: [] }, 't9', 9e12)).toBeTruthy();
    expect(normalizeAlert({ active: false })).toBeNull();
    // O alerta do manifesto (já normalizado) continua valendo na TV.
    expect(alertFor(normalizeAlert(a), 't1', 1000)).toBeTruthy();
  });
});

describe('chamada de senhas', () => {
  it('chama a próxima de cada tipo, guarda o histórico e repete', () => {
    let q = {};
    q = { ...q, ...callNext(q, { prefix: 'A', counter: 'Guichê 1', at: 1 }) };
    q = { ...q, ...callNext(q, { prefix: 'P', counter: 'Guichê 2', at: 2 }) };
    q = { ...q, ...callNext(q, { prefix: 'A', counter: 'Guichê 1', at: 3 }) };
    expect(q.current.code).toBe('A002');
    expect(q.seq).toEqual({ A: 2, P: 1 });
    expect(q.history.map((h) => h.code)).toEqual(['P001', 'A001']);
    const again = callAgain(q, { at: 9 });
    expect(again.current.code).toBe('A002');
    expect(again.current.n).toBe(q.current.n + 1);
    const n = callNumber(q, { prefix: 'A', number: 1, counter: 'Guichê 3', at: 10 });
    expect(n.current.code).toBe('A001');
    expect(n.history[0].code).toBe('A002');
    expect(spokenTicket(q.current)).toBe('Senha A 2, Guichê 1');
  });
  it('normaliza tipos e guichês', () => {
    const c = normalizeQueueConfig({ types: [{ prefix: 'pr1', label: 'Pref' }], counters: 'Sala 1\n\nSala 2', digits: 9 });
    expect(c.types[0].prefix).toBe('PR');
    expect(c.counters).toEqual(['Sala 1', 'Sala 2']);
    expect(formatTicket('A', 7, c.digits)).toBe('A007');
  });
});

describe('cronômetro', () => {
  it('AMRAP: preparação, contagem regressiva e fim', () => {
    const c = { mode: 'amrap', minutes: 10, prep: 10 };
    expect(timerAt(c, 3).phase).toBe('prep');
    expect(timerAt(c, 10).display).toBe('10:00');
    expect(timerAt(c, 70).display).toBe('09:00');
    expect(timerAt(c, 10 + 600).phase).toBe('done');
  });
  it('Tabata: 8 rodadas de 20/10, sem o último descanso', () => {
    const c = { mode: 'tabata', prep: 0 };
    expect(timerTotal(c)).toBe(8 * 30 - 10);
    expect(timerAt(c, 5)).toMatchObject({ phase: 'work', round: 1, display: '00:15' });
    expect(timerAt(c, 22)).toMatchObject({ phase: 'rest', round: 1 });
    expect(timerAt(c, 31)).toMatchObject({ phase: 'work', round: 2 });
  });
  it('EMOM e For time', () => {
    expect(timerAt({ mode: 'emom', rounds: 10, prep: 0 }, 125)).toMatchObject({ round: 3, label: 'Minuto 3' });
    expect(timerAt({ mode: 'fortime', minutes: 20, prep: 0 }, 75).display).toBe('01:15');
  });
  it('iniciar, pausar e continuar', () => {
    let s = timerCommand({}, 'start', 1000);
    s = timerCommand(s, 'pause', 11_000);
    expect(timerElapsed({}, s, 99_000)).toBe(10);
    s = timerCommand(s, 'resume', 21_000);
    expect(timerElapsed({}, s, 31_000)).toBe(20);
    expect(timerElapsed({}, timerCommand(s, 'reset'), 31_000)).toBeNull();
  });
  it('começa sozinho no horário da aula', () => {
    expect(parseStarts('6:00, 07h30 18:00 x')).toEqual([360, 450, 1080]);
    const c = { mode: 'amrap', minutes: 12, prep: 10, starts: '07:30' };
    expect(timerElapsed(c, {}, at(2026, 11, 16, 7, 31).getTime())).toBe(60);
    expect(timerElapsed(c, {}, at(2026, 11, 16, 9, 0).getTime())).toBeNull();
    expect(normalizeTimer({ mode: 'tabata', work: 99 }).work).toBe(20);
  });
});

describe('enquete', () => {
  it('porcentagens somam 100 e marcam quem lidera', () => {
    const r = pollResults(['A', 'B', 'C'], { counts: { o0: 1, o1: 1, o2: 1 } });
    expect(r.total).toBe(3);
    expect(r.rows.reduce((a, x) => a + x.pct, 0)).toBe(100);
    expect(pollResults(['A', 'B'], { counts: { o1: 5 } }).rows[1].leader).toBe(true);
    expect(pollResults(['A'], null).total).toBe(0);
  });
  it('opções, link e id do voto', () => {
    expect(pollOptions('a\n\nb\nc\nd\ne\nf\ng')).toHaveLength(6);
    expect(voteLink('https://v.com/', 'c 1', 'p')).toBe('https://v.com/votar?e=c%201&m=p');
    expect(voteId(2, 'u')).toBe('2_u');
  });
});

describe('Drive e transmissão', () => {
  it('lê o id da pasta e a lista pública', () => {
    expect(driveFolderId('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing')).toBe('1AbCdEfGhIjKlMnOp');
    expect(driveFolderId('nada')).toBeNull();
    const html = `<div class="flip-entry" id="entry-1zzzzzzzzzzz" tabindex="0"><div class="flip-entry-info"><div class="flip-entry-title">b oferta.jpg</div></div></div>
      <div class="flip-entry" id="entry-1aaaaaaaaaaa"><a><div class="flip-entry-title">a capa.PNG</div></a></div>
      <div class="flip-entry" id="entry-1ddddddddddd"><div class="flip-entry-title">planilha.xlsx</div></div>`;
    expect(parseDriveList(html).map((f) => f.name)).toEqual(['a capa.PNG', 'b oferta.jpg']);
    expect(parseDriveList(JSON.stringify({ files: [{ id: 'k1', name: 'x.jpg', mimeType: 'image/jpeg' }] }))[0].id).toBe('k1');
    expect(driveListUrl('ID', 'KEY')).toContain('googleapis.com/drive/v3/files');
    expect(APP_SOURCES.drive.urls({ url: 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp' }, {})[0]).toContain('embeddedfolderview?id=1AbCdEfGhIjKlMnOp');
  });
  it('reconhece link de transmissão', () => {
    expect(streamKind('https://x.com/live/index.m3u8')).toBe('hls');
    expect(streamKind('https://x.com/v.mp4')).toBe('video');
    expect(streamKind('ftp://x/a.m3u8')).toBeNull();
    expect(APP_KINDS.stream && APP_KINDS.drive && APP_KINDS.queue && APP_KINDS.timer && APP_KINDS.poll && APP_KINDS.photowall).toBeTruthy();
  });
});

describe('registro de atividades', () => {
  it('registra o que importa e ignora o barulho', () => {
    expect(auditEntry('update', 'companies/c/schedules/s1', { status: 'published', updatedAt: 1, name: 'Manhã' })).toMatchObject({ action: 'publish', area: 'Grade', targetName: 'Manhã' });
    expect(auditEntry('update', 'companies/c/screens/t', { lastSeen: 1 })).toBeNull();
    expect(auditEntry('set', 'companies/c/manifests/t', { a: 1 })).toBeNull();
    expect(auditEntry('update', 'companies/c', { storageUsedBytes: 5 })).toBeNull();
    expect(auditEntry('update', 'companies/c', { alert: { active: true, title: 'Fogo' } })).toMatchObject({ action: 'alert-on', targetName: 'Fogo' });
    expect(auditEntry('update', 'companies/c/commentBoards/b/comments/x', { status: 'approved' }).action).toBe('approve');
    expect(auditEntry('delete', 'companies/c/media/m')).toMatchObject({ action: 'delete', area: 'Mídia' });
  });
  it('frase do registro', () => {
    expect(describeAudit({ byName: 'Ana', action: 'publish', area: 'Grade', targetName: 'Manhã' })).toBe('Ana publicou a grade “Manhã”');
    expect(describeAudit({ byName: 'Ana', action: 'alert-on', area: 'Alerta urgente', targetName: 'Fogo' })).toBe('Ana enviou o alerta urgente “Fogo”');
  });
});

describe('catálogo e propostas', () => {
  const units = [
    { id: 'u1', name: 'Loja Centro', city: 'Recife', catalog: { audience: 1000 } },
    { id: 'u2', name: 'Loja Boa Viagem', catalog: { audience: 500, show: false } },
    { id: 'u3', name: 'Sem tela' },
  ];
  const screens = [{ unitId: 'u1' }, { unitId: 'u1' }, { unitId: 'u2' }];
  it('catálogo público só com pontos visíveis e com tela', () => {
    const c = publicCatalog({ company: { name: 'Rede X' }, units, screens, settings: { enabled: true, whatsapp: '(81) 99999-0000' } });
    expect(c.points.map((p) => p.id)).toEqual(['u1']);
    expect(c.totalScreens).toBe(2);
    expect(c.whatsapp).toBe('81999990000');
    expect(normalizeCatalog({ packages: [{ name: '', price: 1 }] }).packages).toEqual([]);
  });
  it('contas da proposta', () => {
    const t = proposalTotals({ unitIds: ['u1'], insertionsPerDay: 60, start: '2026-12-01', end: '2026-12-30', price: 600, discount: 60 }, units, screens);
    expect(t).toMatchObject({ screens: 2, days: 30, insertions: 3600, audience: 30000, total: 540 });
    expect(t.perInsertion).toBeCloseTo(0.15);
  });
});
