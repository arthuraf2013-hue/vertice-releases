// Testes de onde a janela do player reabre: `node --test apps/player/electron/janela.test.cjs`
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { escolherPosicao, proximoMonitor, lerEstado, salvarEstado } = require('./janela.cjs');

// PC com o monitor do caixa (principal) e a TV à direita.
const caixa = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
const tv = { id: 2, bounds: { x: 1920, y: 0, width: 1366, height: 768 }, workArea: { x: 1920, y: 0, width: 1366, height: 768 } };

test('primeira vez: tela cheia no monitor principal', () => {
  const p = escolherPosicao(null, [caixa, tv], caixa);
  assert.equal(p.fullscreen, true);
  assert.ok(p.x >= 0 && p.x + p.width <= 1920);
});

test('reabre exatamente onde estava, em janela', () => {
  const salvo = { x: 2000, y: 40, width: 1100, height: 620, fullscreen: false, maximized: false, displayId: 2 };
  assert.deepEqual(escolherPosicao(salvo, [caixa, tv], caixa),
    { x: 2000, y: 40, width: 1100, height: 620, fullscreen: false, maximized: false });
});

test('reabre em tela cheia no monitor da TV, não no principal', () => {
  const salvo = { x: 2053, y: 24, width: 1100, height: 720, fullscreen: true, displayId: 2, displayBounds: tv.bounds };
  const p = escolherPosicao(salvo, [caixa, tv], caixa);
  assert.equal(p.fullscreen, true);
  assert.ok(p.x >= 1920, 'tem que nascer dentro da TV para a tela cheia ir para ela');
});

test('TV desligada: abre no principal, centralizada e cabendo', () => {
  const salvo = { x: 2000, y: 40, width: 1300, height: 700, fullscreen: true, displayId: 2, displayBounds: tv.bounds };
  const p = escolherPosicao(salvo, [caixa], caixa);
  assert.ok(p.x >= 0 && p.x + p.width <= 1920 && p.y >= 0 && p.y + p.height <= 1040);
  assert.equal(p.fullscreen, true);
});

test('monitor mudou de lugar: acha o mesmo pelo id e centraliza nele', () => {
  const tvAEsquerda = { ...tv, bounds: { ...tv.bounds, x: -1366 }, workArea: { ...tv.workArea, x: -1366 } };
  const salvo = { x: 2000, y: 40, width: 1100, height: 620, fullscreen: false, displayId: 2, displayBounds: tv.bounds };
  const p = escolherPosicao(salvo, [caixa, tvAEsquerda], caixa);
  assert.ok(p.x >= -1366 && p.x + p.width <= 0);
});

test('janela quase toda fora da tela não vale: centraliza', () => {
  const salvo = { x: 1900, y: 40, width: 800, height: 600, fullscreen: false, displayId: 9 };
  const p = escolherPosicao(salvo, [caixa], caixa);
  assert.ok(p.x + p.width <= 1920);
});

test('arquivo estragado ou com tamanho absurdo é ignorado', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-jan-'));
  const arq = path.join(dir, 'janela.json');
  fs.writeFileSync(arq, '{quebrado');
  assert.equal(lerEstado(arq), null);
  fs.writeFileSync(arq, JSON.stringify({ x: 0, y: 0, width: 10, height: 10 }));
  assert.equal(lerEstado(arq), null);
  assert.equal(salvarEstado(arq, { x: 5, y: 6, width: 800, height: 600, fullscreen: false }), true);
  assert.deepEqual(lerEstado(arq), { x: 5, y: 6, width: 800, height: 600, fullscreen: false });
});

test('trocar de monitor dá a volta na lista', () => {
  assert.equal(proximoMonitor([caixa, tv], 1).id, 2);
  assert.equal(proximoMonitor([caixa, tv], 2).id, 1);
  assert.equal(proximoMonitor([caixa], 1), null);
});
