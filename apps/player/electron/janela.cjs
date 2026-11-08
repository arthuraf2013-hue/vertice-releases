// Lembra onde a janela do player estava (monitor, posição, tamanho, tela cheia ou janela)
// e reabre do mesmo jeito. A pessoa leva o player para outro monitor arrastando a barra do topo. Fica em %APPDATA%\Vértice Player\janela.json.
//
// A escolha da posição é pura (sem Electron) para dar para testar: ver janela.test.cjs.
const fs = require('node:fs');

const PADRAO = { width: 1280, height: 720 };
const MENOR = { width: 400, height: 250 };
// Quanto da janela precisa cair dentro de um monitor para valer a posição salva.
const VISIVEL_MIN = { width: 160, height: 90 };

const numero = (v) => typeof v === 'number' && Number.isFinite(v);

function estadoValido(e) {
  return !!e && numero(e.x) && numero(e.y) && numero(e.width) && numero(e.height)
    && e.width >= MENOR.width && e.height >= MENOR.height;
}

function lerEstado(arquivo) {
  try {
    const e = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    return estadoValido(e) ? e : null;
  } catch {
    return null;
  }
}

function salvarEstado(arquivo, estado) {
  try {
    // Grava num temporário e troca: se a energia cair no meio, o arquivo antigo continua inteiro.
    const tmp = `${arquivo}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(estado));
    fs.renameSync(tmp, arquivo);
    return true;
  } catch (err) {
    console.error('[vx] não consegui salvar a posição da janela:', err.message);
    return false;
  }
}

function areaComum(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return { width: Math.max(0, w), height: Math.max(0, h) };
}

const mesmasMedidas = (a, b) => !!a && !!b
  && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/** Tamanho que cabe na área, centralizado nela. */
function centralizar(tamanho, area) {
  const width = Math.min(Math.max(tamanho.width, MENOR.width), area.width);
  const height = Math.min(Math.max(tamanho.height, MENOR.height), area.height);
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width,
    height,
  };
}

/** Área (em pixels) da parte de `a` que cai dentro de `b`. */
function sobreposicao(a, b) {
  const c = areaComum(a, b);
  return c.width * c.height;
}

const contem = (r, p) => !!p && p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;

/**
 * Em qual monitor a janela fica depois de arrastada: o do ponto onde o mouse soltou; sem ponto
 * (monitor ligado/desligado, resolução mudou), o que tem a maior parte da janela; nenhum, o principal.
 */
function monitorDoEncaixe(monitores, ponto, janela, principal) {
  const noPonto = monitores.find((m) => contem(m.bounds, ponto));
  if (noPonto) return noPonto;
  let melhor = null;
  let area = 0;
  for (const m of monitores) {
    const a = janela ? sobreposicao(janela, m.bounds) : 0;
    if (a > area) {
      area = a;
      melhor = m;
    }
  }
  return melhor || principal || monitores[0];
}

/** O monitor salvo, se ele estiver ligado agora (pelo id, ou pelas mesmas medidas). */
function monitorSalvo(estado, monitores) {
  if (!estado) return null;
  return monitores.find((m) => estado.displayId !== undefined && m.id === estado.displayId)
    || monitores.find((m) => mesmasMedidas(m.bounds, estado.displayBounds))
    || null;
}

/**
 * Decide onde abrir a janela.
 * Tela cheia = janela sem moldura do tamanho exato do monitor (dá para arrastar pela barra do topo).
 * @param estado o que foi salvo da última vez (ou null)
 * @param monitores [{ id, bounds, workArea }] como o Electron informa agora
 * @param principal o monitor principal
 * @returns { x, y, width, height, fullscreen, maximized, displayId }
 */
function escolherPosicao(estado, monitores, principal) {
  if (!estadoValido(estado)) {
    // Primeira vez: tela cheia no monitor principal (é um aparelho de TV).
    return { ...principal.bounds, fullscreen: true, maximized: false, displayId: principal.id };
  }

  if (estado.fullscreen !== false) {
    // Volta para o monitor onde ficou da última vez. Desligado? O que tem a janela salva; senão o principal.
    const alvo = monitorSalvo(estado, monitores) || monitorDoEncaixe(monitores, null, estado, principal);
    return { ...alvo.bounds, fullscreen: true, maximized: false, displayId: alvo.id };
  }
  const modo = { fullscreen: false, maximized: !!estado.maximized };

  // 1) A posição salva ainda aparece em algum monitor: abre exatamente lá.
  const onde = monitores.find((m) => {
    const comum = areaComum(estado, m.workArea);
    return comum.width >= VISIVEL_MIN.width && comum.height >= VISIVEL_MIN.height;
  });
  if (onde) {
    const width = Math.min(estado.width, onde.workArea.width);
    const height = Math.min(estado.height, onde.workArea.height);
    return { x: estado.x, y: estado.y, width, height, ...modo, displayId: onde.id };
  }

  // 2) O monitor mudou de lugar (resolução, ordem): procura o mesmo monitor pelo id ou pelas medidas.
  //    3) Ele foi desligado/desconectado: usa o principal.
  const alvo = monitorSalvo(estado, monitores) || principal;
  return { ...centralizar(estado, alvo.workArea), ...modo, displayId: alvo.id };
}

/**
 * Liga a janela ao arquivo: salva sempre que ela muda (com folga de 0,8 s) e ao fechar.
 * `telaCheia()` diz o modo atual; `preferido()` o monitor escolhido pela pessoa (fica salvo mesmo
 * quando ele está desligado e o player abriu no principal, para voltar a ele quando religar).
 * Devolve salvarAgora() para quem vai encerrar o app sem evento de fechar (app.exit).
 */
function lembrarJanela(win, screen, arquivo, { telaCheia, preferido } = {}) {
  let timer = null;
  const salvarAgora = () => {
    clearTimeout(timer);
    // Minimizada não diz nada sobre onde a TV deve abrir: fica o último estado bom.
    if (!win || win.isDestroyed() || win.isMinimized()) return;
    const monitor = preferido?.() || screen.getDisplayMatching(win.getBounds());
    salvarEstado(arquivo, {
      ...win.getNormalBounds(),
      fullscreen: telaCheia ? !!telaCheia() : win.isFullScreen(),
      maximized: win.isMaximized(),
      displayId: monitor.id,
      displayBounds: monitor.bounds,
    });
  };
  const adiar = () => {
    clearTimeout(timer);
    timer = setTimeout(salvarAgora, 800);
  };
  for (const ev of ['move', 'resize', 'maximize', 'unmaximize']) win.on(ev, adiar);
  win.on('close', salvarAgora);
  win.on('session-end', salvarAgora); // Windows desligando
  return salvarAgora;
}

module.exports = { escolherPosicao, monitorDoEncaixe, monitorSalvo, mesmasMedidas, centralizar, lerEstado, salvarEstado, lembrarJanela, PADRAO };
