// Testes das regras do Firestore no emulador: `npm run test:rules`
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, updateDoc, deleteDoc, writeBatch, collection, getDocs, query, where,
  serverTimestamp, Timestamp, runTransaction,
} from 'firebase/firestore';

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
    await setDoc(doc(db, 'companies', CID), { name: 'Acme', ownerUid: 'owner', plan: 'start', screenLimit: 3, storageQuotaMB: 2048, storageUsedBytes: 0, screenSeq: 0 });
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
    const targetId = kind === 'screen' ? 'scr1' : p.uid;
    if (kind === 'screen') {
      tx.set(doc(db, `companies/${CID}/screens/${targetId}`), { code: 'VTX-0001', name: 'TV', deviceUid: p.uid, groupIds: [] });
      tx.update(doc(db, 'companies', CID), { screenSeq: 1 });
    } else {
      tx.set(doc(db, `companies/${CID}/integrations/${targetId}`), { name: 'GerenciaAI', deviceUid: p.uid, unitId: extra.unitId ?? null });
    }
    tx.set(doc(db, 'devices', p.uid), { companyId: CID, kind, targetId, unitId: extra.unitId ?? null, pairingCode: code });
    tx.update(doc(db, 'pairings', code), { claimed: true, companyId: CID, targetId, companyName: 'Acme', claimedAt: serverTimestamp() });
  });
}
const pairingDoc = (uid, code, kind = 'screen', ttl = 30 * MIN) => ({
  code, kind, uid, claimed: false, appVersion: '0.1.0', createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + ttl),
});

test('conta nova cria empresa no plano Start e não consegue se dar plano maior', async () => {
  const db = as('u1', { email: 'Ana@Loja.com' });
  const ok = writeBatch(db);
  ok.set(doc(db, 'companies', 'c1'), { name: 'Loja', ownerUid: 'u1', plan: 'start', screenLimit: 3, storageQuotaMB: 2048, storageUsedBytes: 0, screenSeq: 0 });
  ok.set(doc(db, 'companies/c1/members/u1'), { role: 'owner', name: 'Ana' });
  ok.set(doc(db, 'users/u1'), { companyId: 'c1' });
  await assertSucceeds(ok.commit());

  const db2 = as('u2');
  const bad = writeBatch(db2);
  bad.set(doc(db2, 'companies', 'c2'), { name: 'X', ownerUid: 'u2', plan: 'rede', screenLimit: 100, storageQuotaMB: 51200, storageUsedBytes: 0, screenSeq: 0 });
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
