/**
 * Aplicativos e recursos inspirados no catálogo dos concorrentes (SmileCast e outros):
 * loterias, horóscopo, cotações agro, quiz, fitness, agenda de aulas, sala de reunião, cinema,
 * Power BI, código HTML, rádio, listas IPTV, biblioteca de campanhas, calculadora, CRM, indicação e loja.
 * Tudo aqui é conta pura (sem navegador), testável e igual no painel e na TV.
 */
import { parseIcs, APP_SOURCES } from './feeds.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const json = (t) => (t == null ? null : typeof t === 'string' ? JSON.parse(t) : t);

/** Número estável a partir de um texto (mesmo dia + mesma chave = mesmo resultado). */
export function seedOf(text = '') {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ---------------- Loterias CAIXA ---------------- */

/** API pública do portal de loterias da CAIXA (libera CORS). Cores das próprias modalidades. */
export const LOTTERY_GAMES = {
  megasena: { label: 'Mega-Sena', color: '#209869' },
  lotofacil: { label: 'Lotofácil', color: '#930089' },
  quina: { label: 'Quina', color: '#260085' },
  lotomania: { label: 'Lotomania', color: '#F78100' },
  duplasena: { label: 'Dupla Sena', color: '#A61324' },
  timemania: { label: 'Timemania', color: '#00A84E' },
  diadesorte: { label: 'Dia de Sorte', color: '#CB852B' },
  maismilionaria: { label: '+Milionária', color: '#1B2A6B' },
};
export const LOTTERY_API = 'https://servicebus2.caixa.gov.br/portaldeloterias/api';
const lotteryKeys = (c) => (c.games?.length ? c.games : ['megasena', 'lotofacil', 'quina']).filter((k) => LOTTERY_GAMES[k]).slice(0, 6);
const cleanText = (s) => String(s || '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim();

/** Resposta da CAIXA → resultado que a TV mostra. */
export function parseLottery(key, j) {
  if (!j || !Array.isArray(j.listaDezenas)) return null;
  const extra = cleanText(j.nomeTimeCoracaoMesSorte);
  return {
    key,
    label: LOTTERY_GAMES[key]?.label || key,
    color: LOTTERY_GAMES[key]?.color || '#209869',
    number: j.numero,
    date: j.dataApuracao || '',
    numbers: j.listaDezenas.map(String),
    second: Array.isArray(j.listaDezenasSegundoSorteio) ? j.listaDezenasSegundoSorteio.map(String) : null,
    trevos: Array.isArray(j.trevosSorteados) ? j.trevosSorteados.map(String) : null,
    extra: extra ? (key === 'timemania' ? `Time do coração: ${extra.replace(/\s*\/\s*/, '/')}` : key === 'diadesorte' ? `Mês da sorte: ${extra}` : extra) : '',
    accumulated: !!j.acumulado,
    nextDate: j.dataProximoConcurso || '',
    nextPrize: Number(j.valorEstimadoProximoConcurso) || 0,
    winners: (j.listaRateioPremio || [])[0]?.numeroDeGanhadores ?? null,
  };
}

export const lotterySource = {
  ttl: 30 * MIN,
  urls: (c) => lotteryKeys(c).map((k) => `${LOTTERY_API}/${k}`),
  parse(texts, c) {
    const games = lotteryKeys(c).map((k, i) => {
      try { return parseLottery(k, json(texts[i])); } catch { return null; }
    }).filter(Boolean);
    if (!games.length) throw new Error('sem resultados');
    return { games };
  },
  sample: (c) => ({
    games: lotteryKeys(c).map((k, i) => ({
      key: k, label: LOTTERY_GAMES[k].label, color: LOTTERY_GAMES[k].color, number: 3087 - i * 7, date: '17/11/2026',
      numbers: k === 'lotofacil' ? ['01', '03', '05', '07', '10', '11', '12', '13', '14', '16', '17', '18', '19', '20', '23'] : k === 'quina' ? ['03', '07', '11', '19', '53'] : ['06', '10', '23', '25', '41', '50'],
      second: null, trevos: null, extra: '', accumulated: i === 0, nextDate: '19/11/2026', nextPrize: [40_000_000, 1_700_000, 8_000_000][i % 3], winners: i === 0 ? 0 : 3,
    })),
  }),
};

/** 40000000 → "R$ 40 milhões". */
export function prizeText(v) {
  const n = Number(v) || 0;
  if (n >= 1e9) return `R$ ${(n / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${n >= 2e9 ? 'bilhões' : 'bilhão'}`;
  if (n >= 1e6) return `R$ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${n >= 2e6 ? 'milhões' : 'milhão'}`;
  if (n >= 1e3) return `R$ ${(n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ---------------- Cotações agro (Cepea/Esalq-USP) ---------------- */

/** Indicadores conferidos no widget público do Cepea (id do indicador → nome e unidade). */
export const AGRO_PRODUCTS = {
  2: { label: 'Boi gordo', unit: 'arroba' },
  3: { label: 'Bezerro (SP)', unit: 'cabeça' },
  12: { label: 'Soja (PR)', unit: 'saca 60 kg' },
  92: { label: 'Soja (Paranaguá)', unit: 'saca 60 kg' },
  77: { label: 'Milho', unit: 'saca 60 kg' },
  23: { label: 'Café arábica', unit: 'saca 60 kg' },
  24: { label: 'Café robusta', unit: 'saca 60 kg' },
  53: { label: 'Açúcar (SP)', unit: 'saca 50 kg' },
  35: { label: 'Açúcar (PE)', unit: 'saca 50 kg' },
  54: { label: 'Algodão', unit: 'libra-peso (centavos)' },
  91: { label: 'Arroz em casca (RS)', unit: 'saca 50 kg' },
  72: { label: 'Mandioca', unit: 'tonelada' },
  124: { label: 'Suíno', unit: 'kg' },
  130: { label: 'Frango resfriado', unit: 'kg' },
  103: { label: 'Etanol hidratado (SP)', unit: 'litro' },
  100: { label: 'Etanol hidratado (PE)', unit: 'litro' },
};
const agroIds = (c) => (c.items?.length ? c.items : [2, 12, 77, 23, 53, 124]).map(Number).filter((k) => AGRO_PRODUCTS[k]).slice(0, 8);

export function agroUrl(ids) {
  return `https://www.cepea.org.br/br/widgetproduto.js.php?${ids.map((i) => `id_indicador%5B%5D=${i}`).join('&')}`;
}

/** Widget do Cepea (HTML dentro de document.write) → linhas, na ordem pedida. */
export function parseAgroWidget(text = '', ids = []) {
  const rows = [];
  const re = /<tr>\s*<td>([\d/]+)<\/td>\s*<td><span class="maior">([\s\S]*?)<\/span><br \/>\s*<span class="unidade">([\s\S]*?)<\/span><\/td>\s*<td>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = re.exec(String(text)))) {
    const raw = m[4].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const value = Number(raw.replace(/[^\d,]/g, '').replace(',', '.'));
    rows.push({ date: m[1], name: m[2].trim(), unit: m[3].trim(), price: Number.isFinite(value) ? value : null, cents: /¢/.test(raw) });
  }
  // O widget devolve na ordem dos ids; se vier um a menos (indicador fora do ar), cai no nome.
  return rows.map((r, i) => {
    const id = ids.length === rows.length ? ids[i] : null;
    const known = id ? AGRO_PRODUCTS[id] : null;
    return { ...r, id, label: known?.label || r.name, unit: known?.unit || r.unit };
  });
}

const AGRO_SAMPLE = { 2: 395.3, 3: 3496.75, 12: 159.78, 92: 167.43, 77: 67.21, 23: 1688, 24: 960.04, 53: 127.42, 35: 130.32, 54: 415.58, 91: 81.62, 72: 612.5, 124: 8.8, 130: 8.34, 103: 2.93, 100: 2.96 };

export const agroSource = {
  ttl: 2 * HOUR,
  urls: (c) => [agroUrl(agroIds(c))],
  parse([t], c) {
    const rows = parseAgroWidget(t, agroIds(c)).filter((r) => r.price != null);
    if (!rows.length) throw new Error('sem cotações');
    return { rows, source: 'Cepea/Esalq-USP' };
  },
  sample: (c) => ({
    source: 'Cepea/Esalq-USP',
    rows: agroIds(c).map((id) => ({ id, label: AGRO_PRODUCTS[id].label, unit: AGRO_PRODUCTS[id].unit, date: '17/11/2026', price: AGRO_SAMPLE[id] ?? 100, cents: id === 54 })),
  }),
};

/* ---------------- Horóscopo do dia ---------------- */

export const SIGNS = [
  ['aries', 'Áries', '21/03 a 19/04', '♈'], ['touro', 'Touro', '20/04 a 20/05', '♉'], ['gemeos', 'Gêmeos', '21/05 a 20/06', '♊'],
  ['cancer', 'Câncer', '21/06 a 22/07', '♋'], ['leao', 'Leão', '23/07 a 22/08', '♌'], ['virgem', 'Virgem', '23/08 a 22/09', '♍'],
  ['libra', 'Libra', '23/09 a 22/10', '♎'], ['escorpiao', 'Escorpião', '23/10 a 21/11', '♏'], ['sagitario', 'Sagitário', '22/11 a 21/12', '♐'],
  ['capricornio', 'Capricórnio', '22/12 a 19/01', '♑'], ['aquario', 'Aquário', '20/01 a 18/02', '♒'], ['peixes', 'Peixes', '19/02 a 20/03', '♓'],
].map(([key, label, dates, symbol]) => ({ key, label, dates, symbol }));

const H_LOVE = [
  'Uma conversa sincera aproxima quem está ao seu lado.', 'Bom dia para um gesto de carinho sem motivo especial.',
  'Escute mais do que fala: alguém quer ser ouvido.', 'Um reencontro pode trazer boas lembranças.',
  'Paciência com quem você gosta faz toda a diferença hoje.', 'Surpreenda com um convite simples e cheio de afeto.',
  'Deixe o orgulho de lado e dê o primeiro passo.', 'Momento leve para rir junto e esquecer o relógio.',
  'Elogios sinceros abrem portas no coração.', 'Valorize quem está presente nos dias comuns.',
  'Uma mensagem inesperada pode alegrar sua noite.', 'Combine planos a dois para o fim de semana.',
  'Cuide também de você: carinho começa em casa.', 'Diga o que sente com calma e clareza.', 'Uma boa notícia chega por alguém próximo.',
];
const H_WORK = [
  'Organize a agenda logo cedo e o dia rende mais.', 'Uma ideia sua pode ganhar destaque na equipe.',
  'Bom momento para terminar o que ficou pela metade.', 'Peça ajuda: trabalho em grupo resolve mais rápido.',
  'Atenção aos detalhes evita retrabalho.', 'Uma reunião traz uma solução que parecia distante.',
  'Defina uma prioridade e não se disperse.', 'Seu esforço será notado por quem importa.',
  'Dia favorável para aprender algo novo.', 'Revise números e prazos antes de decidir.',
  'Uma parceria pode abrir caminhos interessantes.', 'Mantenha a calma diante de imprevistos.',
  'Boa hora para colocar um projeto no papel.', 'Simplifique: menos é mais nas tarefas de hoje.', 'Reconheça o trabalho dos colegas.',
];
const H_TIP = [
  'Beba bastante água ao longo do dia.', 'Faça uma pausa curta a cada hora.', 'Caminhe um pouco depois do almoço.',
  'Arrume um cantinho da casa ou da mesa.', 'Ligue para alguém de quem sente falta.', 'Durma um pouco mais cedo hoje.',
  'Anote três coisas boas que aconteceram.', 'Ouça aquela música que levanta o astral.', 'Experimente um caminho diferente.',
  'Separe um tempo só para você.', 'Comece pelo mais difícil e alivie a tarde.', 'Desconecte das telas antes de dormir.',
];
const H_COLORS = ['azul', 'verde', 'amarelo', 'branco', 'lilás', 'laranja', 'vermelho', 'rosa', 'dourado', 'prata'];

/** Texto do dia para um signo (entretenimento): muda todo dia, igual em todas as telas. */
export function horoscopeOf(signKey, date = new Date()) {
  const sign = SIGNS.find((s) => s.key === signKey) || SIGNS[0];
  const day = isoDay(new Date(date));
  const pick = (list, part) => list[seedOf(`${day}:${sign.key}:${part}`) % list.length];
  return {
    ...sign,
    love: pick(H_LOVE, 'amor'),
    work: pick(H_WORK, 'trabalho'),
    tip: pick(H_TIP, 'dica'),
    color: pick(H_COLORS, 'cor'),
    number: (seedOf(`${day}:${sign.key}:n`) % 60) + 1,
  };
}

/* ---------------- Quiz do dia ---------------- */

/** Banco próprio, conferido: [pergunta, certa, erradas...]. */
export const QUIZ_BANK = [
  ['Qual é o maior planeta do Sistema Solar?', 'Júpiter', 'Saturno', 'Netuno', 'Terra'],
  ['Quantos estados tem o Brasil, sem contar o Distrito Federal?', '26', '27', '25', '24'],
  ['Em que ano o Brasil declarou a independência?', '1822', '1889', '1808', '1500'],
  ['Qual é o maior oceano do mundo?', 'Pacífico', 'Atlântico', 'Índico', 'Ártico'],
  ['Quantos lados tem um hexágono?', '6', '5', '7', '8'],
  ['Qual é o símbolo químico do ouro?', 'Au', 'Ag', 'Go', 'Or'],
  ['Quem pintou a Mona Lisa?', 'Leonardo da Vinci', 'Michelangelo', 'Rafael', 'Van Gogh'],
  ['Qual é o maior rio do Brasil em volume de água?', 'Amazonas', 'São Francisco', 'Paraná', 'Tocantins'],
  ['Quantos minutos tem um dia?', '1.440', '1.240', '1.400', '1.600'],
  ['Qual é a capital da Argentina?', 'Buenos Aires', 'Montevidéu', 'Santiago', 'Assunção'],
  ['Qual país sediou a Copa do Mundo de 2014?', 'Brasil', 'Alemanha', 'África do Sul', 'Rússia'],
  ['Qual é o menor país do mundo em área?', 'Vaticano', 'Mônaco', 'San Marino', 'Malta'],
  ['Que gás as plantas absorvem na fotossíntese?', 'Gás carbônico', 'Oxigênio', 'Nitrogênio', 'Hidrogênio'],
  ['Quantos jogadores de cada time ficam em campo numa partida de futebol?', '11', '10', '12', '9'],
  ['Quem escreveu "Dom Casmurro"?', 'Machado de Assis', 'José de Alencar', 'Jorge Amado', 'Clarice Lispector'],
  ['Qual planeta é conhecido como planeta vermelho?', 'Marte', 'Vênus', 'Mercúrio', 'Júpiter'],
  ['Qual é a moeda oficial do Japão?', 'Iene', 'Yuan', 'Won', 'Rúpia'],
  ['Quantos ossos tem o corpo humano adulto?', '206', '186', '226', '300'],
  ['Qual é a capital do Brasil?', 'Brasília', 'Rio de Janeiro', 'São Paulo', 'Salvador'],
  ['Qual é o maior animal do mundo?', 'Baleia-azul', 'Elefante-africano', 'Girafa', 'Tubarão-baleia'],
  ['Em que continente fica o Egito?', 'África', 'Ásia', 'Europa', 'Oceania'],
  ['Quantas cores tem o arco-íris na divisão tradicional?', '7', '6', '5', '8'],
  ['Qual é a fórmula química da água?', 'H₂O', 'CO₂', 'O₂', 'NaCl'],
  ['Quem foi o primeiro homem a pisar na Lua?', 'Neil Armstrong', 'Buzz Aldrin', 'Yuri Gagarin', 'Michael Collins'],
  ['Qual instrumento mede a temperatura?', 'Termômetro', 'Barômetro', 'Higrômetro', 'Anemômetro'],
  ['Qual é a montanha mais alta do mundo?', 'Everest', 'K2', 'Aconcágua', 'Kilimanjaro'],
  ['Quantos segundos tem uma hora?', '3.600', '1.800', '6.000', '3.000'],
  ['Qual é o maior bioma do Brasil?', 'Amazônia', 'Cerrado', 'Caatinga', 'Mata Atlântica'],
  ['Qual bioma existe somente no Brasil?', 'Caatinga', 'Cerrado', 'Amazônia', 'Pampa'],
  ['Em que ano foi proclamada a República no Brasil?', '1889', '1822', '1888', '1930'],
  ['Que vitamina o corpo produz com a luz do sol?', 'Vitamina D', 'Vitamina C', 'Vitamina A', 'Vitamina B12'],
  ['Quantas patas tem uma aranha?', '8', '6', '10', '4'],
  ['Qual metal é o mais usado nos fios elétricos de casa?', 'Cobre', 'Ferro', 'Ouro', 'Chumbo'],
  ['Qual é a capital de Portugal?', 'Lisboa', 'Porto', 'Coimbra', 'Braga'],
  ['Quanto é 15% de 200?', '30', '15', '20', '35'],
  ['Quanto é 7 × 8?', '56', '54', '48', '64'],
  ['A que temperatura a água ferve ao nível do mar?', '100 °C', '90 °C', '120 °C', '80 °C'],
  ['Qual estado brasileiro tem a maior população?', 'São Paulo', 'Minas Gerais', 'Rio de Janeiro', 'Bahia'],
  ['Qual país tem o formato de uma bota no mapa?', 'Itália', 'Grécia', 'Portugal', 'Chile'],
  ['Qual órgão bombeia o sangue pelo corpo?', 'Coração', 'Pulmão', 'Fígado', 'Rim'],
  ['Quem compôs "As Quatro Estações"?', 'Vivaldi', 'Mozart', 'Bach', 'Beethoven'],
  ['Qual é o satélite natural da Terra?', 'Lua', 'Fobos', 'Titã', 'Europa'],
];

/** "Pergunta? | certa | errada | errada" por linha → [pergunta, certa, erradas...]. */
export function parseQuiz(text = '') {
  return String(text).split('\n')
    .map((l) => l.split('|').map((s) => s.trim()).filter(Boolean))
    .filter((p) => p.length >= 3)
    .map((p) => p.slice(0, 5).map((s) => s.slice(0, 120)));
}

/**
 * Perguntas do dia: as suas primeiro (em ordem), depois o banco, embaralhado pela data.
 * As alternativas também trocam de lugar, então a certa não fica sempre na mesma letra.
 */
export function quizOfDay(c = {}, date = new Date()) {
  const day = isoDay(new Date(date));
  const own = parseQuiz(c.list);
  const bank = c.useBank === false ? [] : [...QUIZ_BANK].sort((a, b) => seedOf(`${day}:${a[0]}`) - seedOf(`${day}:${b[0]}`));
  const all = [...own, ...bank];
  const count = Math.max(1, Math.min(20, Number(c.perDay) || 5));
  // Cada dia começa num ponto diferente da lista própria, para não repetir sempre as primeiras.
  const start = own.length > count ? seedOf(day) % own.length : 0;
  const list = own.length > count ? [...own.slice(start), ...own.slice(0, start)].slice(0, count) : all.slice(0, count);
  return list.map(([q, right, ...wrong]) => {
    const opts = [right, ...wrong].sort((a, b) => seedOf(`${day}:${q}:${a}`) - seedOf(`${day}:${q}:${b}`));
    return { q, options: opts, answer: opts.indexOf(right) };
  });
}

/** Em que pergunta e fase o quiz está, pelo tempo desde que entrou na tela. */
export function quizStep(elapsedSec, { thinkSec = 10, revealSec = 5, count = 5 } = {}) {
  const cycle = thinkSec + revealSec;
  const t = Math.max(0, elapsedSec) % (cycle * Math.max(1, count));
  const index = Math.floor(t / cycle);
  const inCycle = t - index * cycle;
  return inCycle < thinkSec
    ? { index, phase: 'think', left: Math.ceil(thinkSec - inCycle), progress: inCycle / thinkSec }
    : { index, phase: 'reveal', left: Math.ceil(cycle - inCycle), progress: 1 };
}

/* ---------------- Fitness ---------------- */

export const FITNESS_PHRASES = [
  'Disciplina vence a motivação.', 'Um treino de cada vez.', 'O suor de hoje é a força de amanhã.',
  'Não pare quando cansar. Pare quando terminar.', 'Constância é o segredo.', 'Mais uma repetição.',
  'Treino pago, dia ganho.', 'Corpo em movimento, mente em paz.', 'Começar é metade do caminho.',
  'Pequenos passos, grandes resultados.', 'Hoje é dia de superar ontem.', 'Foco no processo.',
  'A dor passa. O orgulho fica.', 'Você é mais forte do que pensa.', 'Respire fundo e vá.',
  'Cada gota de suor conta.', 'Quem treina sorri.', 'Sem desculpas, só resultados.', 'Ritmo, respiração, repetição.',
  'O melhor treino é o que você faz.',
];

/** Fundos desenhados na própria TV (sem foto de banco de imagens): não pesam nem dependem de licença. */
export const FITNESS_BACKS = {
  iron: { label: 'Ferro', bg: '#121212', fg: '#FFFFFF', accent: '#FF5A1F' },
  track: { label: 'Pista', bg: '#7A1E12', fg: '#FFF4EC', accent: '#FFD23F' },
  neon: { label: 'Neon', bg: '#0B0B2B', fg: '#F2F2FF', accent: '#00E5A0' },
  steel: { label: 'Aço', bg: '#2A3440', fg: '#FFFFFF', accent: '#7FD1FF' },
  sunrise: { label: 'Amanhecer', bg: '#2B1055', fg: '#FFFFFF', accent: '#FF8A3D' },
};

/** Frases deste dia (rodízio): o dia escolhe por onde começar. */
export function fitnessOfDay(c = {}, date = new Date()) {
  const own = String(c.list || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const list = own.length ? own : FITNESS_PHRASES;
  const start = seedOf(isoDay(new Date(date))) % list.length;
  const n = Math.max(1, Math.min(list.length, Number(c.count) || 3));
  return Array.from({ length: n }, (_, i) => list[(start + i) % list.length]);
}

/* ---------------- Agenda de aulas ---------------- */

export const WEEK_KEYS = [['dom', 'Domingo'], ['seg', 'Segunda'], ['ter', 'Terça'], ['qua', 'Quarta'], ['qui', 'Quinta'], ['sex', 'Sexta'], ['sab', 'Sábado']];
const DAY_ALIASES = { dom: 0, domingo: 0, seg: 1, segunda: 1, ter: 2, terca: 2, qua: 3, quarta: 3, qui: 4, quinta: 4, sex: 5, sexta: 5, sab: 6, sabado: 6 };
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };

/**
 * "seg qua sex 07:00-08:00 Spinning | Prof. Ana | Sala 2" (um ou mais dias; "todo dia" = todos).
 * @returns {{ days:number[], start:string, end:string, title:string, who:string, where:string }[]}
 */
export function parseClasses(text = '') {
  const out = [];
  for (const line of String(text).split('\n')) {
    const m = /^\s*(.*?)\s*(\d{1,2}[:h]\d{2})\s*(?:-|a|às|até)\s*(\d{1,2}[:h]\d{2})\s+(.+)$/i.exec(line);
    if (!m) continue;
    const dayText = m[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const range = /^(\w+)\.?\s+(?:a|ate)\s+(\w+)\.?$/.exec(dayText.trim());
    let days;
    if (/todo|diari/.test(dayText)) days = [0, 1, 2, 3, 4, 5, 6];
    else if (range && DAY_ALIASES[range[1]] != null && DAY_ALIASES[range[2]] != null) {
      days = [];
      for (let d = DAY_ALIASES[range[1]]; ; d = (d + 1) % 7) { days.push(d); if (d === DAY_ALIASES[range[2]] || days.length > 7) break; }
    } else days = [...new Set(dayText.split(/[\s,/]+|\se\s/).map((d) => DAY_ALIASES[d.replace(/\.$/, '')]).filter((d) => d != null))];
    if (!days.length) continue;
    const [title, who = '', where = ''] = m[4].split('|').map((s) => s.trim());
    const fix = (t) => { const [h, mm] = t.replace('h', ':').split(':'); return `${pad(Number(h))}:${mm}`; };
    out.push({ days, start: fix(m[2]), end: fix(m[3]), title: title.slice(0, 50), who: who.slice(0, 40), where: where.slice(0, 30) });
  }
  return out;
}

/** Aulas de hoje em ordem, com "agora", "próxima" e "encerrada". */
export function classesToday(list = [], now = new Date()) {
  const d = new Date(now);
  const mins = d.getHours() * 60 + d.getMinutes();
  const today = list.filter((c) => c.days.includes(d.getDay())).sort((a, b) => toMin(a.start) - toMin(b.start));
  let nextMarked = false;
  return today.map((c) => {
    const s = toMin(c.start);
    const e = toMin(c.end);
    let status = mins >= e ? 'done' : mins >= s ? 'now' : 'later';
    if (status === 'later' && !nextMarked) { status = 'next'; nextMarked = true; }
    return { ...c, status, startsIn: s - mins };
  });
}

/* ---------------- Sala de reunião (agenda .ics) ---------------- */

/** Livre ou ocupada agora, a reunião em andamento e as próximas de hoje. */
export function roomStatus(events = [], now = Date.now()) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const today = events.filter((e) => (e.end || e.start + HOUR) > now && e.start <= end.getTime()).sort((a, b) => a.start - b.start);
  const current = today.find((e) => e.start <= now && (e.end || e.start + HOUR) > now) || null;
  const next = today.filter((e) => e !== current);
  return { busy: !!current, current, next: next.slice(0, 4), freeUntil: current ? null : next[0]?.start || null };
}

export const roomSource = {
  ttl: 5 * MIN,
  urls: (c) => {
    const u = String(c.url || '').trim().replace(/^webcal:/i, 'https:');
    return /^https?:\/\//.test(u) ? [u] : [];
  },
  parse([t], c, now = Date.now()) {
    if (t == null) throw new Error('sem agenda');
    return { events: parseIcs(t, now - 12 * HOUR, 30) };
  },
  sample: (c, now = Date.now()) => {
    const at = (h, m = 0) => { const d = new Date(now); d.setHours(h, m, 0, 0); return d.getTime(); };
    const h = new Date(now).getHours();
    return { events: [
      { title: 'Alinhamento comercial', start: at(h, 0), end: at(h, 50), location: '' },
      { title: 'Treinamento de segurança', start: at(h + 1, 30), end: at(h + 2, 30), location: '' },
      { title: 'Reunião com fornecedor', start: at(h + 3), end: at(h + 3, 45), location: '' },
    ] };
  },
};

// Fontes novas entram no mesmo registro dos outros apps de dados (a TV e a prévia usam APP_SOURCES).
Object.assign(APP_SOURCES, { lottery: lotterySource, agro: agroSource, room: roomSource });

/* ---------------- Power BI, HTML, rádio, IPTV, YouTube ---------------- */

/** Só relatórios "Publicar na Web" (app.powerbi.com/view?r=...): abrem sem login na TV. */
export function powerBiUrl(input = '', pageName = '') {
  let u;
  try { u = new URL(String(input).trim()); } catch { return null; }
  if (u.protocol !== 'https:' || !/(^|\.)powerbi\.com$/.test(u.hostname)) return null;
  if (!u.searchParams.get('r') && !/\/reportEmbed/.test(u.pathname)) return null;
  if (pageName) u.searchParams.set('pageName', pageName);
  return u.toString();
}

/** "ReportSection1, ReportSectionabc" ou uma por linha → lista de páginas. */
export const powerBiPages = (text = '') => String(text).split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 12);

/** Código colado vira um documento completo (o iframe roda isolado, sem acesso ao app). */
export function htmlDocument(code = '', bg = '#000000') {
  const src = String(code || '').slice(0, 50_000);
  if (/<html[\s>]/i.test(src)) return src;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:${/^#[0-9a-f]{3,8}$/i.test(bg) ? bg : '#000'};overflow:hidden}</style></head><body>${src}</body></html>`;
}

/** Tipo do link de áudio: hls (.m3u8), arquivo/stream direto ou inválido. */
export function audioKind(url = '') {
  const s = String(url).trim();
  if (!/^https?:\/\//i.test(s)) return null;
  if (/\.m3u8(\?|$)/i.test(s)) return 'hls';
  if (/\.(m3u|pls)(\?|$)/i.test(s)) return 'playlist';
  return 'direct';
}

/** Rádio que só aceita http dentro de um app https (TV web) não toca: avisa no painel. */
export const isInsecureAudio = (url = '') => /^http:\/\//i.test(String(url).trim());

/**
 * Lista M3U (IPTV) → canais. Cada "#EXTINF:-1 tvg-logo=".." group-title="..",Nome" seguido do link.
 * @returns {{ name:string, url:string, logo:string, group:string }[]}
 */
export function parseM3u(text = '', max = 300) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const out = [];
  let info = null;
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    if (l.startsWith('#EXTINF')) {
      const attr = (k) => (new RegExp(`${k}="([^"]*)"`, 'i').exec(l) || [])[1] || '';
      info = { name: (l.split(',').slice(1).join(',') || attr('tvg-name')).trim(), logo: attr('tvg-logo'), group: attr('group-title') };
    } else if (!l.startsWith('#') && /^https?:\/\//i.test(l)) {
      out.push({ name: (info?.name || `Canal ${out.length + 1}`).slice(0, 60), url: l, logo: info?.logo || '', group: (info?.group || '').slice(0, 40) });
      info = null;
      if (out.length >= max) break;
    }
  }
  return out;
}

/** Id da playlist do YouTube num link (…&list=PL…) ou o próprio id. */
export function youtubePlaylistId(input = '') {
  const s = String(input).trim();
  if (/^(PL|UU|LL|FL|OL|RD)[\w-]{10,}$/.test(s)) return s;
  const m = /[?&]list=([\w-]{10,})/.exec(s);
  return m ? m[1] : null;
}

/** Id do canal (UC…) num link youtube.com/channel/UC… ou o próprio id. */
export function youtubeChannelId(input = '') {
  const s = String(input).trim();
  if (/^UC[\w-]{22}$/.test(s)) return s;
  const m = /youtube\.com\/channel\/(UC[\w-]{22})/.exec(s);
  return m ? m[1] : null;
}

/** Endereço do player do YouTube para playlist ou transmissão ao vivo do canal. */
export function youtubeSourceUrl({ source = 'video', url = '', channel = '', muted = true, shuffle = false } = {}) {
  const base = { autoplay: '1', mute: muted ? '1' : '0', controls: '0', modestbranding: '1', rel: '0', playsinline: '1' };
  if (source === 'playlist') {
    const id = youtubePlaylistId(url);
    if (!id) return null;
    const q = new URLSearchParams({ ...base, list: id, loop: '1' });
    if (shuffle) q.set('index', '1');
    return `https://www.youtube-nocookie.com/embed/videoseries?${q}`;
  }
  if (source === 'live') {
    const id = youtubeChannelId(channel || url);
    if (!id) return null;
    return `https://www.youtube.com/embed/live_stream?${new URLSearchParams({ ...base, channel: id })}`;
  }
  return null;
}

/* ---------------- Relógio ---------------- */

export const CLOCK_DATE_FORMATS = {
  long: 'Terça-feira, 18 de novembro',
  full: 'Terça-feira, 18 de novembro de 2026',
  short: '18/11/2026',
  medium: '18 nov. 2026',
  weekday: 'Terça · 18/11',
};

export function clockDate(at, format = 'long') {
  const d = new Date(at);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  switch (format) {
    case 'full': return cap(d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    case 'short': return d.toLocaleDateString('pt-BR');
    case 'medium': return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
    case 'weekday': return `${cap(d.toLocaleDateString('pt-BR', { weekday: 'long' }).split('-')[0])} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
    default: return cap(d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));
  }
}

/* ---------------- Planilha em gráfico, indicadores e ranking ---------------- */

/** "R$ 1.234,5" | "87%" | "12.5" → número. */
export function cellNumber(v) {
  let s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Tabela → séries para gráfico/ranking: 1ª coluna = nome; 2ª = valor; 3ª (opcional) = meta. */
export function sheetSeries(table, { sort = false, max = 12 } = {}) {
  const rows = (table?.rows || []).map((r) => ({ label: r[0] || '', value: cellNumber(r[1]), raw: r[1] || '', goal: cellNumber(r[2]), goalRaw: r[2] || '' }))
    .filter((r) => r.label && r.value != null);
  const list = sort ? [...rows].sort((a, b) => b.value - a.value) : rows;
  const shown = list.slice(0, max);
  const top = Math.max(...shown.map((r) => Math.max(r.value, r.goal ?? 0)), 0) || 1;
  return { head: table?.head || null, rows: shown.map((r) => ({ ...r, pct: Math.max(0, (r.value / top) * 100), reached: r.goal != null ? r.value >= r.goal : null })) };
}

/* ---------------- Aniversariante do dia (homenagem) ---------------- */

export const TRIBUTE_TEMPLATES = {
  confete: { label: 'Confete', bg: '#FFF4E0', fg: '#3B1020', accent: '#E8A93A' },
  noite: { label: 'Noite de festa', bg: '#0A1A44', fg: '#FFFFFF', accent: '#E8A93A' },
  bolo: { label: 'Bolo', bg: '#FCE4EC', fg: '#4A1530', accent: '#D81B60' },
  baloes: { label: 'Balões', bg: '#E3F2FD', fg: '#0D2A4A', accent: '#1E88E5' },
  equipe: { label: 'Equipe', bg: '#0F3B2E', fg: '#F1F7EF', accent: '#F2C14E' },
};

/* ---------------- WOD da semana ---------------- */

/** Treino do dia pela semana ({ seg: '...', ter: '...' }); sem o dia, usa o texto fixo. */
export function wodForDay(c = {}, date = new Date()) {
  const key = WEEK_KEYS[new Date(date).getDay()][0];
  const w = c.week || {};
  return String(w[key] || '').trim() || String(c.wod || '');
}

/* ---------------- Biblioteca de campanhas (comunicação interna e varejo) ---------------- */

/**
 * Peças prontas do Estúdio, por mês. "month" null = vale o ano todo.
 * template: modelo do Estúdio (notice, event, welcome, offer, menu); colors: cores da campanha.
 */
export const CAMPAIGNS = [
  { id: 'jan-branco', month: 1, tag: 'Saúde', title: 'Janeiro Branco', template: 'notice', colors: { bg: '#F4F6F8', fg: '#0E1A2B', accent: '#5B7DB1' }, fields: { icon: 'heart', overline: 'JANEIRO BRANCO', title: 'Cuidar da mente também é cuidar da vida', text: 'Converse, descanse e peça ajuda quando precisar. Saúde mental importa.' } },
  { id: 'jan-ano', month: 1, tag: 'Interna', title: 'Metas do ano', template: 'notice', colors: { bg: '#0A1A44', fg: '#FFFFFF', accent: '#E8A93A' }, fields: { icon: 'star', overline: 'NOVO ANO, NOVAS METAS', title: 'Juntos vamos mais longe', text: 'Obrigado pelo empenho de cada um. Vamos fazer deste ano o nosso melhor.' } },
  { id: 'fev-carnaval', month: 2, tag: 'Aviso', title: 'Horário de Carnaval', template: 'notice', colors: { bg: '#5B2A86', fg: '#FFFFFF', accent: '#FFD23F' }, fields: { icon: 'clock', overline: 'CARNAVAL', title: 'Horário especial de funcionamento', text: 'Segunda e terça: das 8h às 12h. Quarta de cinzas: a partir das 12h.' } },
  { id: 'mar-mulher', month: 3, tag: 'Data', title: 'Dia Internacional da Mulher', template: 'notice', colors: { bg: '#6A1B4D', fg: '#FFFFFF', accent: '#F8B4D9' }, fields: { icon: 'star', overline: '8 DE MARÇO', title: 'Dia Internacional da Mulher', text: 'Respeito, igualdade e reconhecimento todos os dias. Parabéns a todas!' } },
  { id: 'mar-consumidor', month: 3, tag: 'Varejo', title: 'Dia do Consumidor', template: 'offer', colors: null, fields: { badge: '15 DE MARÇO', product: 'Semana do Consumidor', detail: 'Ofertas especiais em toda a loja', oldPrice: '', price: '', unit: '', footnote: 'Válido de 11 a 17 de março' } },
  { id: 'abr-verde', month: 4, tag: 'Segurança', title: 'Abril Verde', template: 'notice', colors: { bg: '#0F3B2E', fg: '#F1F7EF', accent: '#7CD67C' }, fields: { icon: 'alert', overline: 'ABRIL VERDE', title: 'Segurança no trabalho começa por você', text: 'Use os EPIs, siga os procedimentos e comunique qualquer risco ao seu líder.' } },
  { id: 'abr-pascoa', month: 4, tag: 'Data', title: 'Páscoa', template: 'notice', colors: { bg: '#FFF4E0', fg: '#4A2C17', accent: '#C77D3A' }, fields: { icon: 'gift', overline: 'FELIZ PÁSCOA', title: 'Renovação, união e esperança', text: 'Desejamos uma Páscoa de paz para você e sua família.' } },
  { id: 'mai-trabalhador', month: 5, tag: 'Interna', title: 'Dia do Trabalhador', template: 'notice', colors: { bg: '#13294B', fg: '#FFFFFF', accent: '#E8A93A' }, fields: { icon: 'star', overline: '1º DE MAIO', title: 'Feliz Dia do Trabalhador', text: 'Cada conquista desta empresa tem o seu trabalho. Obrigado!' } },
  { id: 'mai-amarelo', month: 5, tag: 'Segurança', title: 'Maio Amarelo', template: 'notice', colors: { bg: '#FFD23F', fg: '#1A1A1A', accent: '#1A1A1A' }, fields: { icon: 'alert', overline: 'MAIO AMARELO', title: 'Atenção no trânsito salva vidas', text: 'Respeite os limites de velocidade, use o cinto e não use o celular ao volante.' } },
  { id: 'mai-maes', month: 5, tag: 'Varejo', title: 'Dia das Mães', template: 'offer', colors: { bg: '#FCE4EC', fg: '#4A1530', accent: '#D81B60' }, fields: { badge: 'DIA DAS MÃES', product: 'Presentes para quem cuida de você', detail: 'Escolha com carinho, embale com amor', oldPrice: '', price: '', unit: '', footnote: 'Pergunte pelas condições especiais' } },
  { id: 'jun-sangue', month: 6, tag: 'Saúde', title: 'Junho Vermelho', template: 'notice', colors: { bg: '#8E0E1E', fg: '#FFFFFF', accent: '#FFB3B3' }, fields: { icon: 'heart', overline: 'JUNHO VERMELHO', title: 'Doe sangue, doe vida', text: 'Uma doação pode ajudar até quatro pessoas. Procure o hemocentro mais próximo.' } },
  { id: 'jun-saojoao', month: 6, tag: 'Evento', title: 'São João', template: 'event', colors: { bg: '#7A1E12', fg: '#FFF4EC', accent: '#FFD23F' }, fields: { overline: 'ARRAIÁ', title: 'Festa junina da empresa', date: '20 de junho', time: 'a partir das 17h', place: 'No pátio' } },
  { id: 'jul-ferias', month: 7, tag: 'Aviso', title: 'Férias escolares', template: 'notice', colors: { bg: '#0B5D8A', fg: '#FFFFFF', accent: '#FFD23F' }, fields: { icon: 'info', overline: 'FÉRIAS', title: 'Programação especial de férias', text: 'Fique de olho nas atividades e nos horários deste mês.' } },
  { id: 'jul-amarelo', month: 7, tag: 'Saúde', title: 'Julho Amarelo', template: 'notice', colors: { bg: '#FFF8D6', fg: '#1A1A1A', accent: '#C9A100' }, fields: { icon: 'info', overline: 'JULHO AMARELO', title: 'Hepatites virais: faça o teste', text: 'O teste é rápido e gratuito nas unidades de saúde do SUS.' } },
  { id: 'ago-lilas', month: 8, tag: 'Social', title: 'Agosto Lilás', template: 'notice', colors: { bg: '#4A2366', fg: '#FFFFFF', accent: '#C9A7EB' }, fields: { icon: 'alert', overline: 'AGOSTO LILÁS', title: 'Violência contra a mulher: denuncie', text: 'Central de Atendimento à Mulher: ligue 180. A ligação é gratuita.' } },
  { id: 'ago-pais', month: 8, tag: 'Varejo', title: 'Dia dos Pais', template: 'offer', colors: { bg: '#13294B', fg: '#FFFFFF', accent: '#E8A93A' }, fields: { badge: 'DIA DOS PAIS', product: 'Presentes para o melhor pai', detail: 'Ideias para todos os estilos', oldPrice: '', price: '', unit: '', footnote: 'Embalagem para presente grátis' } },
  { id: 'set-amarelo', month: 9, tag: 'Saúde', title: 'Setembro Amarelo', template: 'notice', colors: { bg: '#FFD23F', fg: '#1A1A1A', accent: '#1A1A1A' }, fields: { icon: 'heart', overline: 'SETEMBRO AMARELO', title: 'Conversar pode mudar um dia', text: 'Se precisar, fale com alguém. CVV: ligue 188, 24 horas, ligação gratuita.' } },
  { id: 'set-cliente', month: 9, tag: 'Varejo', title: 'Dia do Cliente', template: 'offer', colors: null, fields: { badge: '15 DE SETEMBRO', product: 'Dia do Cliente', detail: 'Obrigado pela preferência! Condições especiais hoje', oldPrice: '', price: '', unit: '', footnote: 'Válido somente hoje' } },
  { id: 'out-rosa', month: 10, tag: 'Saúde', title: 'Outubro Rosa', template: 'notice', colors: { bg: '#F8BBD0', fg: '#4A1530', accent: '#C2185B' }, fields: { icon: 'heart', overline: 'OUTUBRO ROSA', title: 'Prevenção do câncer de mama', text: 'Faça o autoexame e mantenha os exames em dia. O diagnóstico precoce salva vidas.' } },
  { id: 'out-criancas', month: 10, tag: 'Data', title: 'Dia das Crianças', template: 'notice', colors: { bg: '#E3F2FD', fg: '#0D2A4A', accent: '#FF7043' }, fields: { icon: 'gift', overline: '12 DE OUTUBRO', title: 'Feliz Dia das Crianças', text: 'Que nunca falte alegria, brincadeira e cuidado.' } },
  { id: 'nov-azul', month: 11, tag: 'Saúde', title: 'Novembro Azul', template: 'notice', colors: { bg: '#0D47A1', fg: '#FFFFFF', accent: '#90CAF9' }, fields: { icon: 'heart', overline: 'NOVEMBRO AZUL', title: 'Cuidar da saúde também é coisa de homem', text: 'Procure o médico e faça os exames de rotina, inclusive os de próstata.' } },
  { id: 'nov-consciencia', month: 11, tag: 'Data', title: 'Consciência Negra', template: 'notice', colors: { bg: '#1A1A1A', fg: '#FFFFFF', accent: '#F2C14E' }, fields: { icon: 'star', overline: '20 DE NOVEMBRO', title: 'Dia Nacional de Zumbi e da Consciência Negra', text: 'Respeito, igualdade e combate ao racismo todos os dias.' } },
  { id: 'nov-blackfriday', month: 11, tag: 'Varejo', title: 'Black Friday', template: 'offer', colors: { bg: '#000000', fg: '#FFFFFF', accent: '#FFD23F' }, fields: { badge: 'BLACK FRIDAY', product: 'Até 50% de desconto', detail: 'Em produtos selecionados de toda a loja', oldPrice: '', price: '', unit: '', footnote: 'Enquanto durarem os estoques' } },
  { id: 'dez-vermelho', month: 12, tag: 'Saúde', title: 'Dezembro Vermelho', template: 'notice', colors: { bg: '#B71C1C', fg: '#FFFFFF', accent: '#FFCDD2' }, fields: { icon: 'heart', overline: 'DEZEMBRO VERMELHO', title: 'Prevenção ao HIV e outras ISTs', text: 'Use preservativo e faça o teste: é gratuito e sigiloso no SUS.' } },
  { id: 'dez-natal', month: 12, tag: 'Data', title: 'Natal', template: 'welcome', colors: { bg: '#0F3B2E', fg: '#FFFFFF', accent: '#E53935' }, fields: { overline: 'FELIZ NATAL', title: 'Boas festas!', text: 'Que o Natal traga paz, saúde e momentos especiais com quem você ama.' } },
  { id: 'dez-horario', month: 12, tag: 'Aviso', title: 'Horário de fim de ano', template: 'notice', colors: { bg: '#13294B', fg: '#FFFFFF', accent: '#E8A93A' }, fields: { icon: 'clock', overline: 'FIM DE ANO', title: 'Horário especial nas festas', text: '24 e 31/12: das 8h às 14h. 25/12 e 01/01: fechado.' } },
  { id: 'any-boasvindas', month: null, tag: 'Interna', title: 'Boas-vindas a novos colaboradores', template: 'welcome', colors: { bg: '#0A1A44', fg: '#FFFFFF', accent: '#E8A93A' }, fields: { overline: 'SEJA BEM-VINDO(A)', title: 'Nome do novo colaborador', text: 'Hoje começa na equipe de Vendas. Desejamos muito sucesso!' } },
  { id: 'any-epi', month: null, tag: 'Segurança', title: 'Uso de EPI', template: 'notice', colors: { bg: '#FFD23F', fg: '#1A1A1A', accent: '#1A1A1A' }, fields: { icon: 'alert', overline: 'SEGURANÇA', title: 'Sem EPI, sem trabalho', text: 'Capacete, óculos, luvas e protetor auricular nas áreas sinalizadas.' } },
  { id: 'any-sipat', month: null, tag: 'Evento', title: 'SIPAT', template: 'event', colors: { bg: '#0F3B2E', fg: '#F1F7EF', accent: '#F2C14E' }, fields: { overline: 'SIPAT', title: 'Semana Interna de Prevenção de Acidentes', date: 'De 10 a 14 de março', time: 'Palestras às 9h e às 15h', place: 'Auditório' } },
  { id: 'any-meta', month: null, tag: 'Interna', title: 'Resultado do mês', template: 'notice', colors: { bg: '#13294B', fg: '#FFFFFF', accent: '#7CD67C' }, fields: { icon: 'star', overline: 'RESULTADO DO MÊS', title: 'Batemos 104% da meta!', text: 'Parabéns a todas as equipes. Vamos juntos para o próximo desafio.' } },
  { id: 'any-refeitorio', month: null, tag: 'Interna', title: 'Cardápio do refeitório', template: 'menu', colors: { bg: '#FFF4E0', fg: '#3B1020', accent: '#C77D3A' }, fields: { overline: 'REFEITÓRIO', title: 'Cardápio de hoje', lines: 'Arroz e feijão |\nFrango grelhado |\nLegumes no vapor |\nSalada verde |\nFruta da estação |', footnote: 'Bom apetite!' } },
  { id: 'any-pesquisa', month: null, tag: 'Interna', title: 'Pesquisa de clima', template: 'notice', colors: { bg: '#0B5D8A', fg: '#FFFFFF', accent: '#FFD23F' }, fields: { icon: 'info', overline: 'SUA OPINIÃO IMPORTA', title: 'Responda a pesquisa de clima', text: 'É rápido e anônimo. O link está no seu e-mail.' } },
];

/** Campanhas para o mês (as do mês primeiro, depois as do ano todo). */
export const campaignsFor = (month) => [...CAMPAIGNS.filter((c) => c.month === month), ...CAMPAIGNS.filter((c) => c.month == null)];

/* ---------------- Calculadora de exibições e energia ---------------- */

/**
 * Quantas vezes uma mídia passa: (horas ligada × 3600) ÷ duração do ciclo da playlist × telas × dias.
 * @returns {{ perDayPerScreen:number, perDay:number, total:number, cycleSec:number }}
 */
export function playsEstimate({ cycleSec = 120, slots = 1, hoursPerDay = 12, screens = 1, days = 30 } = {}) {
  const cycle = Math.max(1, Number(cycleSec) || 1);
  const perDayPerScreen = Math.floor(((Math.max(0, Number(hoursPerDay)) * 3600) / cycle) * Math.max(1, Number(slots) || 1));
  const perDay = perDayPerScreen * Math.max(0, Number(screens) || 0);
  return { perDayPerScreen, perDay, total: perDay * Math.max(0, Number(days) || 0), cycleSec: cycle };
}

/** Consumo de energia: watts × horas × dias × telas (+ TV box) e o custo pela tarifa (R$/kWh). */
export function energyEstimate({ watts = 100, boxWatts = 10, hoursPerDay = 12, days = 30, screens = 1, tariff = 0.85 } = {}) {
  const kwh = ((Number(watts) + Number(boxWatts)) * Number(hoursPerDay) * Number(days) * Number(screens)) / 1000;
  return { kwh: Math.round(kwh * 10) / 10, cost: Math.round(kwh * Number(tariff) * 100) / 100 };
}

/** Potência típica por tamanho de TV LED (média de mercado, para estimativa). */
export const TV_WATTS = { 32: 45, 43: 75, 50: 95, 55: 110, 65: 140, 75: 190 };

/* ---------------- CRM ---------------- */

export const LEAD_STAGES = [
  ['novo', 'Novo contato'], ['conversa', 'Em conversa'], ['proposta', 'Proposta enviada'],
  ['negociacao', 'Negociação'], ['ganho', 'Fechado'], ['perdido', 'Perdido'],
];
export const LEAD_SOURCES = ['Indicação', 'Visita', 'Instagram', 'WhatsApp', 'Site', 'Evento', 'Outro'];

/** Funil: quantos e quanto (R$ por mês) em cada etapa, e a taxa de fechamento. */
export function pipelineTotals(leads = []) {
  const by = Object.fromEntries(LEAD_STAGES.map(([k]) => [k, { count: 0, value: 0 }]));
  for (const l of leads) {
    const s = by[l.stage] ? l.stage : 'novo';
    by[s].count += 1;
    by[s].value += Number(l.value) || 0;
  }
  const closed = by.ganho.count + by.perdido.count;
  return { by, open: leads.length - closed, winRate: closed ? Math.round((by.ganho.count / closed) * 100) : null };
}

/** Contatos com retorno marcado para hoje ou atrasado. */
export function followUpsDue(leads = [], now = new Date()) {
  const today = isoDay(new Date(now));
  return leads.filter((l) => l.nextAt && l.nextAt <= today && !['ganho', 'perdido'].includes(l.stage)).sort((a, b) => a.nextAt.localeCompare(b.nextAt));
}

/* ---------------- Indique e ganhe ---------------- */

/** Código curto e estável da empresa (6 letras/números, sem os que confundem). */
export function referralCode(companyId = '') {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let n = seedOf(`vertice:${companyId}`);
  let s = '';
  for (let i = 0; i < 6; i++) { s += abc[n % abc.length]; n = Math.floor(n / abc.length) || seedOf(`${s}${companyId}`); }
  return s;
}
export const referralLink = (site, code) => `${String(site || '').replace(/\/$/, '')}/?ref=${encodeURIComponent(code)}`;
export const REFERRAL_REWARD_MONTHS = 12;

/* ---------------- Loja ---------------- */

/**
 * Itens à venda (a Vetta edita no console). kind:
 *  months  — renova a assinatura por N meses (mensal, semestral, anual);
 *  storage — soma MB ao espaço do plano;
 *  service — serviço feito pela equipe (instalação, artes, treinamento).
 */
export const STORE_KINDS = { months: 'Assinatura', storage: 'Espaço extra', service: 'Serviço' };

export const STORE_DEFAULTS = [
  { id: 'mensal', kind: 'months', name: 'Mensalidade', desc: 'Um mês de Vértice para todas as telas da empresa.', price: 99.9, months: 1 },
  { id: 'semestral', kind: 'months', name: 'Plano semestral', desc: 'Seis meses pagos de uma vez, com desconto.', price: 539.4, months: 6 },
  { id: 'anual', kind: 'months', name: 'Plano anual', desc: 'Doze meses pagos de uma vez: o melhor preço.', price: 1078.8, months: 12, promoPrice: 958.8, promoUntil: '' },
  { id: 'espaco-5', kind: 'storage', name: '+5 GB de espaço', desc: 'Mais espaço para vídeos e imagens, para sempre.', price: 49.9, storageMB: 5120 },
  { id: 'instalacao', kind: 'service', name: 'Instalação e configuração', desc: 'Visita técnica: instalamos o player e deixamos a programação no ar.', price: 250 },
  { id: 'artes', kind: 'service', name: 'Pacote de 10 artes', desc: 'Nossa equipe cria 10 peças com a sua marca.', price: 290 },
  { id: 'treinamento', kind: 'service', name: 'Treinamento da equipe', desc: 'Uma hora online para a sua equipe dominar o painel.', price: 150 },
];

/** Preço que vale hoje (promoção dentro do prazo). */
export function storePrice(item = {}, now = new Date()) {
  const promo = Number(item.promoPrice);
  const until = item.promoUntil ? new Date(`${item.promoUntil}T23:59:59`) : null;
  const onPromo = Number.isFinite(promo) && promo > 0 && promo < Number(item.price) && (!until || until >= now);
  return { price: onPromo ? promo : Number(item.price) || 0, oldPrice: onPromo ? Number(item.price) : null, promoUntil: onPromo ? item.promoUntil || '' : '' };
}

/** Itens que podem ir para a vitrine (nome, preço válido, ativo). */
export function normalizeStore(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((it) => it && it.id && it.name && STORE_KINDS[it.kind] && Number(it.price) > 0 && it.active !== false)
    .map((it) => ({ ...it, id: String(it.id).slice(0, 40), name: String(it.name).slice(0, 60), desc: String(it.desc || '').slice(0, 200) }));
}

/** O que muda na empresa quando o pagamento de um pedido confirma. */
export function storeEffect(item = {}, company = {}, nextPaidUntil) {
  if (item.kind === 'months') {
    const months = Math.max(1, Math.min(36, Number(item.months) || 1));
    return { status: 'active', paidUntil: nextPaidUntil(company, months) };
  }
  if (item.kind === 'storage') return { storageQuotaMB: (Number(company.storageQuotaMB) || 0) + (Number(item.storageMB) || 0) };
  return {};
}

export const STORE_ORDER_STATUS = { pending: 'Aguardando pagamento', paid: 'Pago', canceled: 'Cancelado', expired: 'Vencido' };
