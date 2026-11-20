// Testes das regras do Firestore no emulador: `npm run test:rules`
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, updateDoc, deleteDoc, writeBatch, collection, getDocs, query, where,
  serverTimestamp, Timestamp, runTransaction, collectionGroup, increment,
} from 'firebase/firestore';
import assert from 'node:assert/strict';

let env;
const CID = 'acme';
const MIN = 60_000;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-vertice',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(() => env?.cleanup());
beforeEach(() => env.clearFirestore());

const as = (uid, token = {}) => env.authenticatedContext(uid, token).firestore();
const anon = () => env.unauthenticatedContext().firestore();

/** Empresa pronta com dona, editor e leitor (escrita sem regras). */
async function seedCompany() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'companies', CID), { name: 'Acme', ownerUid: 'owner', plan: 'start', screenLimit: 3, storageQuotaMB: 1024, storageUsedBytes: 0, screenSeq: 0 });
    await setDoc(doc(db, `companies/${CID}/members/owner`), { role: 'owner' });
    await setDoc(doc(db, `companies/${CID}/members/editor`), { role: 'editor' });
    await setDoc(doc(db, `companies/${CID}/members/viewer`), { role: 'viewer' });
    await setDoc(doc(db, 'companies', 'other'), { name: 'Outra', ownerUid: 'x' });
    await setDoc(doc(db, 'companies/other/members/x'), { role: 'owner' });
  });
}

/** Reproduz a transação de pareamento do painel. */
async function claim(db, code, kind, extra = {}) {
  return runTransaction(db, async (tx) => {
    const p = (await tx.get(doc(db, 'pairings', code))).data();
    const targetId = kind === 'screen' ? (extra.screenId || 'scr1') : p.uid;
    if (kind === 'screen') {
      const c = (await tx.get(doc(db, 'companies', CID))).data();
      tx.set(doc(db, `companies/${CID}/screens/${targetId}`), { code: 'VTX-0001', name: 'TV', deviceUid: p.uid, groupIds: [] });
      tx.update(doc(db, 'companies', CID), { screenSeq: (c.screenSeq || 0) + 1, screenCount: (c.screenCount || 0) + 1, screenOp: targetId });
    } else {
      tx.set(doc(db, `companies/${CID}/integrations/${targetId}`), { name: 'GerenciaAI', deviceUid: p.uid, unitId: extra.unitId ?? null });
    }
    tx.set(doc(db, 'devices', p.uid), { companyId: CID, kind, targetId, unitId: extra.unitId ?? null, pairingCode: code });
    tx.update(doc(db, 'pairings', code), { claimed: true, companyId: CID, targetId, companyName: 'Acme', claimedAt: serverTimestamp() });
  });
}
const DAY = 24 * 60 * MIN;
const trialCompany = (ownerUid, days = 14) => ({
  name: 'Loja', ownerUid, plan: 'start', screenLimit: 3, storageQuotaMB: 1024, storageUsedBytes: 0, screenSeq: 0, screenCount: 0,
  status: 'trial', trialEndsAt: Timestamp.fromMillis(Date.now() + days * DAY), createdAt: serverTimestamp(),
});
const pairingDoc = (uid, code, kind = 'screen', ttl = 30 * MIN) => ({
  code, kind, uid, claimed: false, appVersion: '0.1.0', createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + ttl),
});

test('conta nova cria empresa no plano Start e não consegue se dar plano maior', async () => {
  const db = as('u1', { email: 'Ana@Loja.com' });
  const ok = writeBatch(db);
  ok.set(doc(db, 'companies', 'c1'), trialCompany('u1'));
  ok.set(doc(db, 'companies/c1/members/u1'), { role: 'owner', name: 'Ana' });
  ok.set(doc(db, 'users/u1'), { companyId: 'c1' });
  await assertSucceeds(ok.commit());

  const db2 = as('u2');
  const bad = writeBatch(db2);
  bad.set(doc(db2, 'companies', 'c2'), { ...trialCompany('u2'), plan: 'rede', screenLimit: 100, storageQuotaMB: 51200 });
  await assertFails(bad.commit());
  // Ninguém se pendura numa empresa alheia.
  await assertFails(setDoc(doc(as('u3'), 'users/u3'), { companyId: 'c1' }));
  await assertFails(setDoc(doc(as('u3'), 'companies/c1/members/u3'), { role: 'owner' }));
});

test('convite: entra com o papel do convite, não com outro', async () => {
  await seedCompany();
  await assertSucceeds(setDoc(doc(as('owner'), 'invites/joana@loja.com'), { companyId: CID, role: 'viewer' }));
  await assertFails(setDoc(doc(as('editor'), 'invites/x@loja.com'), { companyId: CID, role: 'viewer' }));
  const db = as('joana', { email: 'Joana@Loja.com' });
  await assertFails(setDoc(doc(db, `companies/${CID}/members/joana`), { role: 'admin' }));
  const b = writeBatch(db);
  b.set(doc(db, `companies/${CID}/members/joana`), { role: 'viewer' });
  b.set(doc(db, 'users/joana'), { companyId: CID });
  b.delete(doc(db, 'invites/joana@loja.com'));
  await assertSucceeds(b.commit());
});

test('papéis: leitor só lê, editor publica conteúdo, admin mexe em telas', async () => {
  await seedCompany();
  await assertSucceeds(getDoc(doc(as('viewer'), 'companies', CID)));
  await assertFails(setDoc(doc(as('viewer'), `companies/${CID}/playlists/p1`), { name: 'x' }));
  await assertSucceeds(setDoc(doc(as('editor'), `companies/${CID}/playlists/p1`), { name: 'x', items: [] }));
  await assertSucceeds(setDoc(doc(as('editor'), `companies/${CID}/manifests/s1`), { slots: [] }));
  await assertFails(setDoc(doc(as('editor'), `companies/${CID}/groups/g1`), { name: 'Caixas' }));
  await assertSucceeds(setDoc(doc(as('owner'), `companies/${CID}/groups/g1`), { name: 'Caixas' }));
  // Editor só mexe no contador de armazenamento; ninguém muda o próprio plano.
  await assertSucceeds(updateDoc(doc(as('editor'), 'companies', CID), { storageUsedBytes: 1000 }));
  await assertFails(updateDoc(doc(as('editor'), 'companies', CID), { name: 'Hack' }));
  await assertFails(updateDoc(doc(as('owner'), 'companies', CID), { plan: 'rede', screenLimit: 100 }));
  // Outra empresa é invisível.
  await assertFails(getDoc(doc(as('owner'), 'companies', 'other')));
  await assertFails(getDocs(collection(as('owner'), 'companies/other/media')));
});

test('pareamento de TV: código, reivindicação, manifesto e sinal de vida', async () => {
  await seedCompany();
  const tv = as('tv-1');
  await assertSucceeds(setDoc(doc(tv, 'pairings/AB2CD3'), pairingDoc('tv-1', 'AB2CD3')));
  // Outra TV não sobrescreve um código existente; código com validade longa demais é recusado.
  await assertFails(setDoc(doc(as('tv-2'), 'pairings/AB2CD3'), pairingDoc('tv-2', 'AB2CD3')));
  await assertFails(setDoc(doc(as('tv-2'), 'pairings/ZZ2ZZ3'), pairingDoc('tv-2', 'ZZ2ZZ3', 'screen', 24 * 60 * MIN)));
  // Ninguém lista códigos.
  await assertFails(getDocs(collection(as('owner'), 'pairings')));
  // Editor não pareia; admin sim.
  await assertFails(claim(as('editor'), 'AB2CD3', 'screen'));
  await assertSucceeds(claim(as('owner'), 'AB2CD3', 'screen'));
  // Código já usado não é reivindicado de novo (nem por outra empresa).
  await assertFails(claim(as('x'), 'AB2CD3', 'screen'));

  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `companies/${CID}/manifests/scr1`), { slots: [] }));
  await assertSucceeds(getDoc(doc(tv, 'devices/tv-1')));
  await assertSucceeds(getDoc(doc(tv, `companies/${CID}/manifests/scr1`)));
  await assertFails(getDoc(doc(tv, `companies/${CID}/manifests/outra`)));
  await assertFails(getDocs(collection(tv, `companies/${CID}/media`)));
  // Sinal de vida: só os campos permitidos e com a hora do servidor.
  await assertSucceeds(updateDoc(doc(tv, `companies/${CID}/screens/scr1`), { lastSeen: serverTimestamp(), appVersion: '0.1.0', nowPlaying: null }));
  await assertFails(updateDoc(doc(tv, `companies/${CID}/screens/scr1`), { lastSeen: serverTimestamp(), name: 'Hack' }));
  await assertFails(updateDoc(doc(tv, `companies/${CID}/screens/scr1`), { lastSeen: Timestamp.fromMillis(Date.now() + 864e5) }));
});

test('aparelho não forja o próprio registro nem o de outro', async () => {
  await seedCompany();
  await assertFails(setDoc(doc(as('tv-9'), 'devices/tv-9'), { companyId: CID, kind: 'screen', targetId: 's1', pairingCode: 'AAAAAA' }));
  // Admin não registra um aparelho que não pediu código.
  await assertFails(setDoc(doc(as('owner'), 'devices/tv-9'), { companyId: CID, kind: 'screen', targetId: 's1', pairingCode: 'AAAAAA' }));
});

test('GerenciaAI: pareia, envia pedidos da própria unidade e a TV lê', async () => {
  await seedCompany();
  const pdv = as('pdv-1');
  await assertSucceeds(setDoc(doc(pdv, 'pairings/PD2V34'), pairingDoc('pdv-1', 'PD2V34', 'integration')));
  await assertSucceeds(claim(as('owner'), 'PD2V34', 'integration', { unitId: 'u1' }));
  const order = { number: '137', customerName: 'Maria Silva', status: 'preparing', unitId: 'u1', source: 'gerenciaai', terminal: 'Caixa 1', integrationUid: 'pdv-1', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), expireAt: Timestamp.fromMillis(Date.now() + 864e5) };
  await assertSucceeds(setDoc(doc(pdv, `companies/${CID}/orders/pdv-1_v1`), order));
  await assertSucceeds(updateDoc(doc(pdv, `companies/${CID}/orders/pdv-1_v1`), { status: 'ready', readyAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  // Id fora do padrão, outra unidade, status inválido ou campo extra: recusados.
  await assertFails(setDoc(doc(pdv, `companies/${CID}/orders/v2`), order));
  await assertFails(setDoc(doc(pdv, `companies/${CID}/orders/pdv-1_v3`), { ...order, unitId: 'u2' }));
  await assertFails(setDoc(doc(pdv, `companies/${CID}/orders/pdv-1_v4`), { ...order, status: 'paid' }));
  await assertFails(setDoc(doc(pdv, `companies/${CID}/orders/pdv-1_v5`), { ...order, cpf: '000' }));
  // Integração não lê mídias nem pedidos de outra empresa, e não escreve em outra empresa.
  await assertFails(getDocs(collection(pdv, `companies/${CID}/media`)));
  await assertFails(setDoc(doc(pdv, `companies/other/orders/pdv-1_v1`), order));
  // Uma TV da empresa lê os pedidos abertos.
  await assertSucceeds(setDoc(doc(as('tv-1'), 'pairings/TV2345'), pairingDoc('tv-1', 'TV2345')));
  await assertSucceeds(claim(as('owner'), 'TV2345', 'screen'));
  await assertSucceeds(getDocs(query(collection(as('tv-1'), `companies/${CID}/orders`), where('status', 'in', ['preparing', 'ready']))));
  // Anônimo sem pareamento, não.
  await assertFails(getDocs(collection(anon(), `companies/${CID}/orders`)));
  await assertFails(getDocs(collection(as('estranho'), `companies/${CID}/orders`)));
});

test('desconectar: admin apaga o aparelho e ele perde o acesso', async () => {
  await seedCompany();
  await setDoc(doc(as('tv-1'), 'pairings/AB2CD3'), pairingDoc('tv-1', 'AB2CD3'));
  await claim(as('owner'), 'AB2CD3', 'screen');
  await assertFails(deleteDoc(doc(as('editor'), 'devices/tv-1')));
  await assertSucceeds(deleteDoc(doc(as('owner'), 'devices/tv-1')));
  await assertFails(getDoc(doc(as('tv-1'), `companies/${CID}/screens/scr1`)));
});

test('controle remoto: admin manda comando, a TV responde e manda a foto da tela', async () => {
  await seedCompany();
  await assertSucceeds(setDoc(doc(as('tv-1'), 'pairings/AB2CD3'), pairingDoc('tv-1', 'AB2CD3')));
  await assertSucceeds(claim(as('owner'), 'AB2CD3', 'screen'));
  const live = (db, n) => doc(db, `companies/${CID}/screens/scr1/live/${n}`);
  const tv = as('tv-1');
  // Só admin manda comando, só tipos conhecidos, com a hora do servidor.
  await assertSucceeds(setDoc(live(as('owner'), 'command'), { id: 'c1', type: 'screenshot', at: serverTimestamp(), by: 'owner' }));
  await assertFails(setDoc(live(as('editor'), 'command'), { id: 'c2', type: 'reload', at: serverTimestamp() }));
  await assertFails(setDoc(live(as('owner'), 'command'), { id: 'c3', type: 'rm -rf', at: serverTimestamp() }));
  await assertFails(setDoc(live(tv, 'command'), { id: 'c4', type: 'reload', at: serverTimestamp() }));
  // A TV lê o comando dela e responde; outra TV/empresa não.
  await assertSucceeds(getDoc(live(tv, 'command')));
  await assertSucceeds(setDoc(live(tv, 'diagnostics'), { at: serverTimestamp(), appVersion: '0.3.0', ack: { id: 'c1', ok: true } }, { merge: true }));
  await assertFails(setDoc(live(tv, 'diagnostics'), { at: serverTimestamp(), hack: true }));
  await assertSucceeds(setDoc(live(tv, 'screenshot'), { at: serverTimestamp(), image: 'data:image/jpeg;base64,AAAA' }));
  await assertFails(setDoc(live(tv, 'screenshot'), { at: serverTimestamp(), image: 'javascript:alert(1)' }));
  await assertFails(setDoc(live(as('owner'), 'screenshot'), { at: serverTimestamp(), image: 'data:image/jpeg;base64,AAAA' }));
  await assertSucceeds(getDoc(live(as('viewer'), 'diagnostics')));
  await assertFails(getDoc(live(as('x'), 'diagnostics')));
  await assertFails(getDoc(live(anon(), 'screenshot')));
});

test('capturas: a TV guarda e apaga o próprio histórico; o painel só lê', async () => {
  await seedCompany();
  await assertSucceeds(setDoc(doc(as('tv-1'), 'pairings/AB2CD3'), pairingDoc('tv-1', 'AB2CD3')));
  await assertSucceeds(claim(as('owner'), 'AB2CD3', 'screen'));
  const cap = (db, id) => doc(db, `companies/${CID}/screens/scr1/captures/${id}`);
  const tv = as('tv-1');
  await assertSucceeds(setDoc(cap(tv, '1'), { image: 'data:image/jpeg;base64,AAAA', at: serverTimestamp() }));
  await assertFails(setDoc(cap(tv, '2'), { image: 'data:image/png;base64,AAAA', at: serverTimestamp() }));
  await assertFails(setDoc(cap(tv, '3'), { image: 'data:image/jpeg;base64,AAAA', at: serverTimestamp(), extra: 1 }));
  await assertFails(setDoc(cap(as('owner'), '4'), { image: 'data:image/jpeg;base64,AAAA', at: serverTimestamp() }));
  await assertSucceeds(getDoc(cap(as('viewer'), '1')));
  await assertFails(getDoc(cap(as('x'), '1')));
  await assertSucceeds(deleteDoc(cap(tv, '1')));
});

test('relatórios: a TV grava só as exibições dela; membros leem', async () => {
  await seedCompany();
  await assertSucceeds(setDoc(doc(as('tv-1'), 'pairings/AB2CD3'), pairingDoc('tv-1', 'AB2CD3')));
  await assertSucceeds(claim(as('owner'), 'AB2CD3', 'screen'));
  const st = (db, id) => doc(db, `companies/${CID}/playStats/${id}`);
  const tv = as('tv-1');
  const data = (screenId = 'scr1', date = '2026-11-07') => ({ screenId, date, items: { m1: { plays: 3, seconds: 30, name: 'Pão' } }, updatedAt: serverTimestamp() });
  await assertSucceeds(setDoc(st(tv, 'scr1_2026-11-07'), data()));
  await assertSucceeds(setDoc(st(tv, 'scr1_2026-11-07'), data())); // reenviar o total do dia
  await assertFails(setDoc(st(tv, 'scr2_2026-11-07'), data('scr2'))); // outra tela
  await assertFails(setDoc(st(tv, 'scr1_2026-11-08'), data('scr1', '2026-11-07'))); // id não bate com o dia
  await assertFails(setDoc(st(as('owner'), 'scr1_2026-11-06'), data('scr1', '2026-11-06'))); // painel não inventa exibição
  await assertSucceeds(getDocs(query(collection(as('viewer'), `companies/${CID}/playStats`), where('date', '>=', '2026-11-01'))));
  await assertFails(getDoc(st(as('x'), 'scr1_2026-11-07')));
});

test('price: editor mantém as tabelas de preço; leitor só lê', async () => {
  await seedCompany();
  const pl = (db) => doc(db, `companies/${CID}/priceLists/L1`);
  await assertSucceeds(setDoc(pl(as('editor')), { name: 'Pães', items: [{ name: 'Pão', price: 12.9 }] }));
  await assertFails(setDoc(pl(as('viewer')), { name: 'x' }));
  await assertSucceeds(getDoc(pl(as('viewer'))));
  await assertFails(getDoc(pl(as('x'))));
});

test('anunciantes e video walls: editor grava; leitor só lê; de fora não vê', async () => {
  await seedCompany();
  for (const col of ['advertisers', 'videowalls']) {
    const d = (db) => doc(db, `companies/${CID}/${col}/x1`);
    await assertSucceeds(setDoc(d(as('editor')), { name: 'Teste' }));
    await assertFails(setDoc(d(as('viewer')), { name: 'x' }));
    await assertSucceeds(getDoc(d(as('viewer'))));
    await assertFails(getDoc(d(as('x'))));
  }
});

/* ---------- Comercial: licença, limite de telas e console da Vetta ---------- */

async function setCompany(data) {
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'companies', CID), data));
}
async function pairScreen(code, tvUid, screenId) {
  await setDoc(doc(as(tvUid), `pairings/${code}`), pairingDoc(tvUid, code));
  return claim(as('owner'), code, 'screen', { screenId });
}

test('cadastro aberto: teste grátis com prazo da configuração; fechado pela Vetta, não cria', async () => {
  const mk = (uid, data) => {
    const db = as(uid, { email: `${uid}@loja.com` });
    const b = writeBatch(db);
    b.set(doc(db, 'companies', `c-${uid}`), data);
    b.set(doc(db, `companies/c-${uid}/members/${uid}`), { role: 'owner' });
    b.set(doc(db, `users/${uid}`), { companyId: `c-${uid}` });
    return b.commit();
  };
  await assertFails(mk('a1', { ...trialCompany('a1', 60) }));                       // teste longo demais
  await assertFails(mk('a2', { ...trialCompany('a2'), status: 'active' }));         // sem teste = de graça
  await assertFails(mk('a3', { ...trialCompany('a3'), paidUntil: Timestamp.fromMillis(Date.now() + 365 * DAY) }));
  await assertSucceeds(mk('a4', trialCompany('a4')));
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'platform/settings'), { signupOpen: false, trialDays: 7 }));
  await assertFails(mk('a5', trialCompany('a5', 7)));
  // Qualquer um lê as configurações públicas; só a Vetta muda.
  await assertSucceeds(getDoc(doc(anon(), 'platform/settings')));
  await assertFails(setDoc(doc(as('a4'), 'platform/settings'), { signupOpen: true }));
});

test('limite de telas: conferido no servidor, contador anda junto com a tela', async () => {
  await seedCompany();
  await setCompany({ screenLimit: 2, screenCount: 0 });
  await assertSucceeds(pairScreen('AA2AA2', 'tv-1', 's1'));
  await assertSucceeds(pairScreen('BB2BB2', 'tv-2', 's2'));
  await assertFails(pairScreen('CC2CC2', 'tv-3', 's3'));
  // Tela criada sem mexer no contador, ou contador baixado à toa: recusado.
  await assertFails(setDoc(doc(as('owner'), `companies/${CID}/screens/s9`), { name: 'X' }));
  await assertFails(updateDoc(doc(as('owner'), 'companies', CID), { screenCount: 0, screenOp: 's1' }));
  // Excluir a tela libera a vaga.
  const db = as('owner');
  const b = writeBatch(db);
  b.delete(doc(db, `companies/${CID}/screens/s1`));
  b.update(doc(db, 'companies', CID), { screenCount: 1, screenOp: 's1' });
  await assertSucceeds(b.commit());
  await assertSucceeds(pairScreen('DD2DD2', 'tv-4', 's4'));
});

test('licença: vencida, fim do teste ou suspensa param a TV e a publicação', async () => {
  await seedCompany();
  await pairScreen('AB2CD3', 'tv-1', 'scr1');
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `companies/${CID}/manifests/scr1`), { slots: [] }));
  const tv = as('tv-1');
  const read = () => getDoc(doc(tv, `companies/${CID}/manifests/scr1`));
  const publish = () => setDoc(doc(as('editor'), `companies/${CID}/manifests/scr1`), { slots: [] });

  await setCompany({ status: 'active', paidUntil: Timestamp.fromMillis(Date.now() + 10 * DAY) });
  await assertSucceeds(read()); await assertSucceeds(publish());
  await setCompany({ paidUntil: Timestamp.fromMillis(Date.now() - 2 * DAY) });        // vencida, ainda na tolerância
  await assertSucceeds(read());
  await setCompany({ paidUntil: Timestamp.fromMillis(Date.now() - 6 * DAY) });        // passou da tolerância
  await assertFails(read()); await assertFails(publish());
  await assertSucceeds(getDoc(doc(as('viewer'), `companies/${CID}/manifests/scr1`)));  // o painel ainda vê
  await setCompany({ graceDays: 10 });
  await assertSucceeds(read());
  await setCompany({ status: 'trial', trialEndsAt: Timestamp.fromMillis(Date.now() - MIN) });
  await assertFails(read());
  await setCompany({ status: 'suspended', paidUntil: Timestamp.fromMillis(Date.now() + 30 * DAY) });
  await assertFails(read()); await assertFails(publish());
  // Bloqueada também não pareia tela nova.
  await assertFails(pairScreen('XY2XY3', 'tv-2', 's2'));
});

test('console da Vetta: vê e administra clientes; cliente não se promove', async () => {
  await seedCompany();
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'platformAdmins/vetta'), { name: 'Arthur' }));
  const v = as('vetta', { email: 'arthur@vetta.com' });
  await assertSucceeds(getDocs(collection(v, 'companies')));
  await assertFails(getDocs(collection(as('owner'), 'companies')));
  await assertSucceeds(getDocs(collection(v, `companies/${CID}/members`)));
  await assertSucceeds(updateDoc(doc(v, 'companies', CID), { plan: 'pro', screenLimit: 15, status: 'active', paidUntil: Timestamp.fromMillis(Date.now() + 30 * DAY) }));
  await assertSucceeds(setDoc(doc(v, `companies/${CID}/payments/p1`), { amount: 99.9, paidAt: serverTimestamp() }));
  await assertSucceeds(getDocs(collection(as('owner'), `companies/${CID}/payments`)));
  await assertFails(getDocs(collection(as('editor'), `companies/${CID}/payments`)));
  await assertFails(setDoc(doc(as('owner'), `companies/${CID}/payments/p2`), { amount: 1 }));
  await assertFails(updateDoc(doc(as('owner'), 'companies', CID), { status: 'active', paidUntil: Timestamp.fromMillis(Date.now() + 999 * DAY) }));
  await assertFails(setDoc(doc(as('owner'), 'platformAdmins/owner'), { name: 'eu' }));
  // Cliente novo criado pela Vetta, com convite para o dono.
  await assertSucceeds(setDoc(doc(v, 'companies/novo'), { name: 'Mercado Bom Preço', plan: 'pro', screenLimit: 15, status: 'active' }));
  await assertSucceeds(setDoc(doc(v, 'invites/dono@bompreco.com'), { companyId: 'novo', role: 'owner' }));
  await assertFails(setDoc(doc(as('owner'), 'invites/outro@x.com'), { companyId: CID, role: 'owner' }));
  const dono = as('dono', { email: 'dono@bompreco.com' });
  const b = writeBatch(dono);
  b.set(doc(dono, 'companies/novo/members/dono'), { role: 'owner' });
  b.set(doc(dono, 'users/dono'), { companyId: 'novo' });
  b.delete(doc(dono, 'invites/dono@bompreco.com'));
  await assertSucceeds(b.commit());
  // Situação de todas as telas, só para a Vetta.
  await assertSucceeds(getDocs(query(collectionGroup(v, 'screens'))));
  await assertFails(getDocs(query(collectionGroup(as('owner'), 'screens'))));
});

test('alertas: admin configura e pede teste; editor não', async () => {
  await seedCompany();
  await assertSucceeds(updateDoc(doc(as('owner'), 'companies', CID), { alerts: { enabled: true, emails: ['a@b.com'], offlineMinutes: 15 } }));
  await assertFails(updateDoc(doc(as('editor'), 'companies', CID), { alerts: { enabled: false } }));
  await assertSucceeds(setDoc(doc(as('owner'), `companies/${CID}/alertTests/t1`), { at: serverTimestamp(), by: 'owner' }));
  await assertFails(setDoc(doc(as('editor'), `companies/${CID}/alertTests/t2`), { at: serverTimestamp(), by: 'editor' }));
});

/* ---------- Mural de comentários ---------- */

const BOARD = `companies/${CID}/commentBoards/mural1`;

/** Envio como a página pública faz: contador de envios + comentário, no mesmo lote. */
async function sendComment(uid, { id, status = 'pending', text = 'Muito bom!', name = 'Ana', reset } = {}) {
  const db = as(uid, { firebase: { sign_in_provider: 'anonymous' } });
  const limRef = doc(db, `commentLimits/${uid}`);
  const prev = (await getDoc(limRef)).data();
  const b = writeBatch(db);
  const startNew = reset ?? !prev;
  b.set(limRef, {
    windowStart: startNew ? serverTimestamp() : prev.windowStart,
    count: startNew ? 1 : prev.count + 1,
    lastAt: serverTimestamp(),
    lastId: id,
  });
  b.set(doc(db, `${BOARD}/comments/${id}`), { name, text, status, createdAt: serverTimestamp(), uid });
  return b.commit();
}

async function seedBoard({ autoApprove = false, open = true, blockPattern = 'a^' } = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, BOARD), { title: 'Recados', question: 'Gostou?', open, autoApprove, companyName: 'Acme', theme: 'brand' });
    await setDoc(doc(db, `companies/${CID}/commentSettings/mural1`), { autoApprove, blockPattern, words: [] });
  });
}

test('mural: editor cria o mural; qualquer um lê o título; leitor não mexe', async () => {
  await seedCompany();
  const board = { title: 'Recados', question: 'O que achou?', open: true, autoApprove: false, companyName: 'Acme', theme: 'brand', updatedAt: serverTimestamp() };
  await assertFails(setDoc(doc(as('viewer'), BOARD), board));
  await assertSucceeds(setDoc(doc(as('editor'), BOARD), board));
  await assertSucceeds(setDoc(doc(as('editor'), `companies/${CID}/commentSettings/mural1`), { autoApprove: false, blockPattern: 'a^', words: [] }));
  await assertSucceeds(getDoc(doc(anon(), BOARD)));
  // Configuração de moderação (palavras bloqueadas) não é pública.
  await assertFails(getDoc(doc(anon(), `companies/${CID}/commentSettings/mural1`)));
  await assertFails(getDoc(doc(as('x'), `companies/${CID}/commentSettings/mural1`)));
  await assertFails(setDoc(doc(as('editor'), BOARD), { ...board, title: 'x'.repeat(61) }));
});

test('mural: visitante envia comentário; vai como "aguardando" e não lê o que outros mandaram', async () => {
  await seedCompany();
  await seedBoard();
  await assertSucceeds(sendComment('v1', { id: 'v1-1' }));
  // Sem login não envia; aprovado direto não (aprovação automática desligada).
  await assertFails(setDoc(doc(anon(), `${BOARD}/comments/x`), { name: '', text: 'oi oi', status: 'pending', createdAt: serverTimestamp(), uid: 'x' }));
  await assertFails(sendComment('v2', { id: 'v2-1', status: 'approved' }));
  // Sem o contador no mesmo lote, não entra.
  await assertFails(setDoc(doc(as('v3'), `${BOARD}/comments/v3-1`), { name: '', text: 'oi oi', status: 'pending', createdAt: serverTimestamp(), uid: 'v3' }));
  // Campos e tamanhos.
  await assertFails(sendComment('v4', { id: 'v4-1', text: 'x'.repeat(201) }));
  await assertFails(sendComment('v5', { id: 'v5-1', name: 'n'.repeat(31) }));
  // Visitante não lê comentários (nem o próprio).
  await assertFails(getDoc(doc(as('v1'), `${BOARD}/comments/v1-1`)));
  await assertFails(getDocs(collection(anon(), `${BOARD}/comments`)));
});

test('mural: até 3 envios a cada 10 minutos por aparelho; um comentário por lote', async () => {
  await seedCompany();
  await seedBoard();
  await assertSucceeds(sendComment('v1', { id: 'a1' }));
  await assertSucceeds(sendComment('v1', { id: 'a2' }));
  await assertSucceeds(sendComment('v1', { id: 'a3' }));
  await assertFails(sendComment('v1', { id: 'a4' }));
  // Zerar a contagem antes do tempo não passa.
  await assertFails(sendComment('v1', { id: 'a5', reset: true }));
  // Janela vencida (10 min atrás): começa outra.
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'commentLimits/v1'), { windowStart: Timestamp.fromMillis(Date.now() - 11 * MIN) }));
  await assertFails(sendComment('v1', { id: 'a6', reset: false }));
  await assertSucceeds(sendComment('v1', { id: 'a7', reset: true }));
  // Dois comentários com um só contador: recusado.
  const db = as('v2');
  const b = writeBatch(db);
  b.set(doc(db, 'commentLimits/v2'), { windowStart: serverTimestamp(), count: 1, lastAt: serverTimestamp(), lastId: 'b1' });
  b.set(doc(db, `${BOARD}/comments/b1`), { name: '', text: 'um', status: 'pending', createdAt: serverTimestamp(), uid: 'v2' });
  b.set(doc(db, `${BOARD}/comments/b2`), { name: '', text: 'dois', status: 'pending', createdAt: serverTimestamp(), uid: 'v2' });
  await assertFails(b.commit());
  // O contador é só do próprio usuário.
  await assertFails(setDoc(doc(as('v3'), 'commentLimits/v1'), { windowStart: serverTimestamp(), count: 1, lastAt: serverTimestamp(), lastId: 'zz' }));
});

test('mural: aprovação automática respeita as palavras bloqueadas; mural fechado e licença vencida recusam', async () => {
  await seedCompany();
  await seedBoard({ autoApprove: true, blockPattern: '(?s).*(palavrão|feio).*' });
  await assertSucceeds(sendComment('v1', { id: 'c1', status: 'approved', text: 'Adorei o pão' }));
  await assertFails(sendComment('v2', { id: 'c2', status: 'approved', text: 'Que atendimento FEIO' }));
  await assertSucceeds(sendComment('v2', { id: 'c3', status: 'pending', text: 'Que atendimento FEIO' }));
  await assertFails(sendComment('v3', { id: 'c4', status: 'approved', name: 'Feio', text: 'oi oi' }));
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), BOARD), { open: false }));
  await assertFails(sendComment('v4', { id: 'c5' }));
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), BOARD), { open: true }));
  await setCompany({ status: 'suspended' });
  await assertFails(sendComment('v5', { id: 'c6' }));
});

test('mural: equipe modera; a TV lê só os aprovados', async () => {
  await seedCompany();
  await seedBoard();
  await pairScreen('MM2MM3', 'tv-1', 'scr1');
  await sendComment('v1', { id: 'p1', text: 'Aguardando' });
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `${BOARD}/comments/ok1`), { name: 'Bia', text: 'Aprovado', status: 'approved', createdAt: Timestamp.now(), uid: 'v9' }));
  const tv = as('tv-1');
  await assertSucceeds(getDocs(query(collection(tv, `${BOARD}/comments`), where('status', '==', 'approved'))));
  await assertFails(getDocs(collection(tv, `${BOARD}/comments`)));
  await assertFails(getDoc(doc(tv, `${BOARD}/comments/p1`)));
  // Leitor vê tudo, mas não modera; editor aprova, oculta e apaga.
  await assertSucceeds(getDocs(collection(as('viewer'), `${BOARD}/comments`)));
  await assertFails(updateDoc(doc(as('viewer'), `${BOARD}/comments/p1`), { status: 'approved', moderatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(as('editor'), `${BOARD}/comments/p1`), { status: 'approved', moderatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as('editor'), `${BOARD}/comments/p1`), { text: 'editado pela loja' }));
  await assertSucceeds(updateDoc(doc(as('editor'), `${BOARD}/comments/p1`), { status: 'hidden', moderatedAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(doc(as('editor'), `${BOARD}/comments/p1`)));
  // Outra empresa não vê nada.
  await assertFails(getDocs(collection(as('x'), `${BOARD}/comments`)));
});

/* ---------------- Recursos novos (zonas, alerta, senhas, cronômetro, enquete, fotos, auditoria, catálogo) ---------------- */

test('alerta urgente: editor envia e encerra; leitor não; editor não mexe no resto da empresa', async () => {
  await seedCompany();
  const alert = { active: true, id: 'a1', title: 'Atenção', text: 'Teste', theme: 'red', sound: true, startedAt: Date.now(), until: 0, screenIds: [], by: 'Ed' };
  await assertFails(updateDoc(doc(as('viewer'), 'companies', CID), { alert }));
  await assertSucceeds(updateDoc(doc(as('editor'), 'companies', CID), { alert }));
  await assertSucceeds(updateDoc(doc(as('editor'), 'companies', CID), { alert: { active: false, endedAt: Date.now() } }));
  await assertFails(updateDoc(doc(as('editor'), 'companies', CID), { alert, name: 'Outro nome' }));
  // Horário e catálogo: só admin.
  await assertFails(updateDoc(doc(as('editor'), 'companies', CID), { hours: { enabled: true } }));
  await assertSucceeds(updateDoc(doc(as('owner'), 'companies', CID), { hours: { enabled: true }, catalog: { enabled: true } }));
});

test('layouts e propostas: editor grava, leitor só lê, outra empresa nada', async () => {
  await seedCompany();
  const lay = { name: 'Caixas', template: 'side', zones: { side: { playlistId: 'p1' } }, bar: { enabled: true }, groupIds: ['g1'], screenIds: [], active: true };
  await assertFails(setDoc(doc(as('viewer'), `companies/${CID}/layouts/l1`), lay));
  await assertSucceeds(setDoc(doc(as('editor'), `companies/${CID}/layouts/l1`), lay));
  await assertSucceeds(getDoc(doc(as('viewer'), `companies/${CID}/layouts/l1`)));
  await assertFails(getDoc(doc(as('x'), `companies/${CID}/layouts/l1`)));
  await assertSucceeds(setDoc(doc(as('editor'), `companies/${CID}/proposals/p1`), { client: 'Café', price: 100 }));
  await assertFails(setDoc(doc(as('viewer'), `companies/${CID}/proposals/p2`), { client: 'Café' }));
});

test('registro de atividades: cada um grava o seu, só admin lê, ninguém apaga', async () => {
  await seedCompany();
  const e = (uid) => ({ action: 'publish', area: 'Grade', targetId: 's1', targetName: 'Manhã', fields: ['status'], uid, byName: 'Ed', at: serverTimestamp() });
  await assertSucceeds(setDoc(doc(as('editor'), `companies/${CID}/audit/a1`), e('editor')));
  await assertSucceeds(setDoc(doc(as('viewer'), `companies/${CID}/audit/a2`), e('viewer')));
  await assertFails(setDoc(doc(as('editor'), `companies/${CID}/audit/a3`), e('owner'))); // em nome de outro
  await assertFails(setDoc(doc(as('x'), `companies/${CID}/audit/a4`), e('x'))); // de fora
  await assertFails(setDoc(doc(as('editor'), `companies/${CID}/audit/a5`), { ...e('editor'), at: Timestamp.fromMillis(Date.now() - DAY) }));
  await assertFails(getDoc(doc(as('editor'), `companies/${CID}/audit/a1`)));
  await assertSucceeds(getDoc(doc(as('owner'), `companies/${CID}/audit/a1`)));
  await assertFails(updateDoc(doc(as('owner'), `companies/${CID}/audit/a1`), { targetName: 'apagado' }));
  await assertFails(deleteDoc(doc(as('owner'), `companies/${CID}/audit/a1`)));
});

test('senhas e cronômetro: recepção (leitor) chama e inicia; não reconfigura; TV lê', async () => {
  await seedCompany();
  await pairScreen('QQ2QQ3', 'tv-q', 'scr1');
  const Q = `companies/${CID}/queues/q1`;
  await assertFails(setDoc(doc(as('viewer'), Q), { title: 'Senhas', seq: {}, current: null, history: [] }));
  await assertSucceeds(setDoc(doc(as('editor'), Q), { title: 'Senhas', types: [{ prefix: 'A', label: 'Normal' }], counters: ['G1'], seq: {}, current: null, history: [] }));
  await assertSucceeds(updateDoc(doc(as('viewer'), Q), { seq: { A: 1 }, current: { code: 'A001', counter: 'G1', at: Date.now(), n: 1 }, history: [], updatedAt: Date.now() }));
  await assertFails(updateDoc(doc(as('viewer'), Q), { title: 'Outro' }));
  await assertFails(updateDoc(doc(as('x'), Q), { seq: { A: 2 } }));
  await assertSucceeds(getDoc(doc(as('tv-q'), Q)));
  await assertFails(updateDoc(doc(as('tv-q'), Q), { seq: { A: 9 } }));
  const T = `companies/${CID}/timers/t1`;
  await assertSucceeds(setDoc(doc(as('editor'), T), { title: 'WOD', status: 'stopped', startedAt: null, pausedAt: null, pausedMs: 0 }));
  await assertSucceeds(updateDoc(doc(as('viewer'), T), { status: 'running', startedAt: Date.now(), pausedMs: 0, updatedAt: Date.now() }));
  await assertFails(updateDoc(doc(as('viewer'), T), { status: 'explodir' }));
  await assertSucceeds(getDoc(doc(as('tv-q'), T)));
  // Licença suspensa: a TV para de ler.
  await setCompany({ status: 'suspended' });
  await assertFails(getDoc(doc(as('tv-q'), Q)));
});

async function seedPoll({ open = true, round = 0 } = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `companies/${CID}/polls/e1`), { question: 'Sabor?', options: ['A', 'B', 'C'], open, round, companyName: 'Acme', theme: 'brand' });
    await setDoc(doc(db, `companies/${CID}/pollTallies/e1`), { round, counts: {}, total: 0 });
  });
}
function vote(uid, option, { round = 0, inc = 1, key = option, onlyVote = false, onlyTally = false } = {}) {
  const db = as(uid);
  const b = writeBatch(db);
  if (!onlyTally) b.set(doc(db, `companies/${CID}/polls/e1/votes/${round}_${uid}`), { option, at: serverTimestamp() });
  if (!onlyVote) b.update(doc(db, `companies/${CID}/pollTallies/e1`), { [`counts.o${key}`]: increment(inc), total: increment(1) });
  return b.commit();
}

test('enquete: um voto por aparelho, placar sobe 1 na opção votada, fechada não vota', async () => {
  await seedCompany();
  await seedPoll();
  await assertSucceeds(getDoc(doc(anon(), `companies/${CID}/polls/e1`)));
  await assertSucceeds(getDoc(doc(anon(), `companies/${CID}/pollTallies/e1`)));
  await assertSucceeds(vote('v1', 1));
  await assertFails(vote('v1', 2)); // segundo voto do mesmo aparelho
  await assertFails(vote('v2', 0, { key: 1 })); // placar na opção errada
  await assertFails(vote('v3', 0, { inc: 5 })); // soma mais de 1
  await assertFails(vote('v4', 0, { onlyVote: true })); // voto sem placar
  await assertFails(vote('v5', 0, { onlyTally: true })); // placar sem voto
  await assertFails(vote('v6', 7, { key: 7 })); // opção que não existe
  let t;
  await env.withSecurityRulesDisabled(async (ctx) => { t = (await getDoc(doc(ctx.firestore(), `companies/${CID}/pollTallies/e1`))).data(); });
  assert.deepEqual([t.total, t.counts.o1], [1, 1]);
  // Visitante não lê votos; editor zera (nova rodada) e o mesmo aparelho vota de novo.
  await assertFails(getDoc(doc(as('v1'), `companies/${CID}/polls/e1/votes/0_v1`)));
  const ed = as('editor');
  const r = writeBatch(ed);
  r.update(doc(ed, `companies/${CID}/polls/e1`), { round: 1 });
  r.set(doc(ed, `companies/${CID}/pollTallies/e1`), { round: 1, counts: {}, total: 0 });
  await assertSucceeds(r.commit());
  await assertSucceeds(vote('v1', 2, { round: 1 }));
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), `companies/${CID}/polls/e1`), { open: false }));
  await assertFails(vote('v7', 0, { round: 1 }));
});

test('foto no telão: só foto deste mural, enviada pelo servidor; mural de texto não aceita foto', async () => {
  await seedCompany();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `companies/${CID}/commentBoards/fotos1`), { title: 'Fotos', question: 'Mande', open: true, autoApprove: false, companyName: 'Acme', theme: 'night', kind: 'photos' });
    await setDoc(doc(db, `companies/${CID}/commentSettings/fotos1`), { autoApprove: false, blockPattern: 'a^', words: [] });
  });
  await seedBoard();
  const send = (uid, id, data, board = 'fotos1') => {
    const db = as(uid);
    const b = writeBatch(db);
    b.set(doc(db, `commentLimits/${uid}`), { windowStart: serverTimestamp(), count: 1, lastAt: serverTimestamp(), lastId: id });
    b.set(doc(db, `companies/${CID}/commentBoards/${board}/comments/${id}`), { name: 'Bia', text: '', status: 'pending', createdAt: serverTimestamp(), uid, ...data });
    return b.commit();
  };
  await assertSucceeds(send('v1', 'f1', { photo: `https://midias.loja.com/m/${CID}/p-fotos1-abc123.jpg` }));
  await assertFails(send('v2', 'f2', {})); // sem foto
  await assertFails(send('v3', 'f3', { photo: `https://midias.loja.com/m/${CID}/p-outro-abc.jpg` })); // de outro mural
  await assertFails(send('v4', 'f4', { photo: 'https://site-estranho.com/x.jpg' }));
  await assertFails(send('v5', 'f5', { photo: `https://midias.loja.com/m/${CID}/p-mural1-abc.jpg`, text: 'oi oi' }, 'mural1')); // mural de texto
});

test('catálogo de mídia indoor: público lê; só o admin da empresa publica', async () => {
  await seedCompany();
  await assertFails(setDoc(doc(as('editor'), `publicCatalogs/${CID}`), { enabled: true }));
  await assertFails(setDoc(doc(as('x'), `publicCatalogs/${CID}`), { enabled: true }));
  await assertSucceeds(setDoc(doc(as('owner'), `publicCatalogs/${CID}`), { enabled: true, companyName: 'Acme', points: [] }));
  await assertSucceeds(getDoc(doc(anon(), `publicCatalogs/${CID}`)));
});

test('pesquisa: resposta anônima, uma por aparelho, formato conferido; só a equipe lê', async () => {
  await seedCompany();
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `companies/${CID}/surveys/p1`), {
    title: 'Opinião', questions: [{ type: 'nps', text: 'Nota?' }, { type: 'text', text: 'Sugestão?' }], open: true, round: 0, companyName: 'Acme', theme: 'brand',
  }));
  const answer = (uid, answers, id = `0_${uid}`) => setDoc(doc(as(uid), `companies/${CID}/surveys/p1/responses/${id}`), { answers, at: serverTimestamp() });
  await assertSucceeds(getDoc(doc(anon(), `companies/${CID}/surveys/p1`)));
  await assertSucceeds(answer('a1', { q0: 9, q1: 'Ótimo atendimento' }));
  await assertFails(answer('a1', { q0: 10 })); // segunda resposta do mesmo aparelho
  await assertFails(answer('a2', { q0: 9 }, '0_outro')); // id de outra pessoa
  await assertFails(answer('a3', { q0: 99 })); // nota fora da faixa
  await assertFails(answer('a4', { q9: 1 })); // pergunta que não existe
  await assertFails(answer('a5', {})); // vazia
  await assertFails(answer('a6', { q1: 'x'.repeat(501) })); // texto longo demais
  await assertFails(getDoc(doc(as('a1'), `companies/${CID}/surveys/p1/responses/0_a1`))); // público não lê respostas
  await assertSucceeds(getDoc(doc(as('editor'), `companies/${CID}/surveys/p1/responses/0_a1`)));
  await assertFails(getDoc(doc(as('viewer'), `companies/${CID}/surveys/p1/responses/0_a1`)));
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), `companies/${CID}/surveys/p1`), { open: false }));
  await assertFails(answer('a7', { q0: 5 }));
});

test('CRM e pedidos da loja: equipe usa o CRM; pedidos só o admin lê e ninguém grava pelo app', async () => {
  await seedCompany();
  await assertSucceeds(setDoc(doc(as('editor'), `companies/${CID}/leads/l1`), { name: 'Farmácia', stage: 'novo' }));
  await assertSucceeds(getDoc(doc(as('viewer'), `companies/${CID}/leads/l1`)));
  await assertFails(setDoc(doc(as('viewer'), `companies/${CID}/leads/l2`), { name: 'X' }));
  await assertFails(getDoc(doc(as('x'), `companies/${CID}/leads/l1`)));
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `companies/${CID}/storeOrders/o1`), { status: 'pending', value: 99 }));
  await assertSucceeds(getDoc(doc(as('owner'), `companies/${CID}/storeOrders/o1`)));
  await assertFails(getDoc(doc(as('editor'), `companies/${CID}/storeOrders/o1`)));
  await assertFails(updateDoc(doc(as('owner'), `companies/${CID}/storeOrders/o1`), { status: 'paid' }));
  await assertFails(setDoc(doc(as('owner'), `companies/${CID}/storeOrders/o2`), { status: 'paid' }));
  // Catálogo da loja: público lê; só a Vetta edita.
  await assertSucceeds(getDoc(doc(anon(), 'platform/store')));
  await assertFails(setDoc(doc(as('owner'), 'platform/store'), { items: [] }));
});

test('indicação: cadastro guarda o código de quem indicou, sem passar do tamanho', async () => {
  const db = as('u9');
  const ok = writeBatch(db);
  ok.set(doc(db, 'companies', 'c9'), { ...trialCompany('u9'), referredBy: 'ZHNCDM' });
  ok.set(doc(db, 'companies/c9/members/u9'), { role: 'owner', name: 'Ana' });
  ok.set(doc(db, 'users/u9'), { companyId: 'c9' });
  await assertSucceeds(ok.commit());
  const db2 = as('u10');
  const bad = writeBatch(db2);
  bad.set(doc(db2, 'companies', 'c10'), { ...trialCompany('u10'), referredBy: 'X'.repeat(40) });
  bad.set(doc(db2, 'companies/c10/members/u10'), { role: 'owner' });
  bad.set(doc(db2, 'users/u10'), { companyId: 'c10' });
  await assertFails(bad.commit());
  // O próprio cliente não se dá o prêmio.
  await assertFails(updateDoc(doc(as('u9'), 'companies/c9'), { referralRewarded: true }));
});
