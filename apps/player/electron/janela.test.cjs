// Testes de onde a janela do player reabre: `node --test apps/player/electron/janela.test.cjs`
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { escolherPosicao, monitorDoEncaixe, lerEstado, salvarEstado } = require('./janela.cjs');

// PC com o monitor do caixa (principal) e a TV à direita.
const caixa = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
const tv = { id: 2, bounds: { x: 1920, y: 0, width: 1366, height: 768 }, workArea: { x: 1920, y: 0, width: 1366, height: 768 } };

test('primeira vez: ocupa o monitor principal inteiro', () => {
  const p = escolherPosicao(null, [caixa, tv], caixa);
  assert.equal(p.fullscreen, true);
  assert.deepEqual({ x: p.x, y: p.y, width: p.width, height: p.height }, caixa.bounds);
});

test('reabre exatamente onde estava, em janela', () => {
  const salvo = { x: 2000, y: 40, width: 1100, height: 620, fullscreen: false, maximized: false, displayId: 2 };
  assert.deepEqual(escolherPosicao(salvo, [caixa, tv], caixa),
    { x: 2000, y: 40, width: 1100, height: 620, fullscreen: false, maximized: false, displayId: 2 });
});

test('arrastado para a TV: reabre ocupando a TV inteira, não o principal', () => {
  const salvo = { ...tv.bounds, fullscreen: true, displayId: 2, displayBounds: tv.bounds };
  const p = escolherPosicao(salvo, [caixa, tv], caixa);
  assert.equal(p.fullscreen, true);
  assert.equal(p.displayId, 2);
  assert.deepEqual({ x: p.x, y: p.y, width: p.width, height: p.height }, tv.bounds);
});

test('TV com outro id depois de reiniciar: acha pelas medidas', () => {
  const tvNovoId = { ...tv, id: 77 };
  const salvo = { ...tv.bounds, fullscreen: true, displayId: 2, displayBounds: tv.bounds };
  assert.equal(escolherPosicao(salvo, [caixa, tvNovoId], caixa).displayId, 77);
});

test('TV desligada: abre ocupando o principal', () => {
  const salvo = { ...tv.bounds, fullscreen: true, displayId: 2, displayBounds: tv.bounds };
  const p = escolherPosicao(salvo, [caixa], caixa);
  assert.equal(p.fullscreen, true);
  assert.deepEqual({ x: p.x, y: p.y, width: p.width, height: p.height }, caixa.bounds);
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

test('soltou a barra: vale o monitor onde o mouse estava', () => {
  // Janela do tamanho do caixa, arrastada até a metade: o mouse já está na TV.
  const janela = { x: 1500, y: 10, width: 1920, height: 1080 };
  assert.equal(monitorDoEncaixe([caixa, tv], { x: 2100, y: 20 }, janela, caixa).id, 2);
  assert.equal(monitorDoEncaixe([caixa, tv], { x: 300, y: 20 }, janela, caixa).id, 1);
});

test('sem mouse (monitor ligou/desligou): fica onde está a maior parte da janela', () => {
  assert.equal(monitorDoEncaixe([caixa, tv], null, { x: 1800, y: 0, width: 1366, height: 768 }, caixa).id, 2);
  // Monitor da janela sumiu: principal.
  assert.equal(monitorDoEncaixe([caixa], null, tv.bounds, caixa).id, 1);
});
