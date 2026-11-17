// Página pública da enquete: /votar?e={empresa}&m={enquete}
// Voto anônimo (Firebase anônimo), um por aparelho e por rodada. O voto e o placar são gravados
// no mesmo lote; as regras do Firestore conferem que o placar subiu só 1, na opção votada.
import './comentar.css';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, getDoc, writeBatch, serverTimestamp, increment } from 'firebase/firestore/lite';
import { pollResults, voteId } from '@vertice/shared/interact';

const env = import.meta.env;
const config = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID };
const params = new URLSearchParams(location.search);
const cid = params.get('e') || '';
const pid = params.get('m') || '';
const demo = params.has('demo') || !config.apiKey;
const $ = (s) => document.querySelector(s);
const show = (name) => document.querySelectorAll('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== name; });
const send = $('[data-send]');
let fb = null;
let poll = null;
let choice = null;
const firebase = () => {
  if (!fb) { const app = initializeApp(config); fb = { auth: getAuth(app), db: getFirestore(app) }; }
  return fb;
};
const mineKey = () => `vx-vote:${cid}:${pid}:${poll?.round || 0}`;

function closed(msg) {
  if (msg) $('[data-closed-text]').textContent = msg;
  show('closed');
}

function results(tally, mine) {
  const r = pollResults(poll.options, tally);
  const box = $('[data-results]');
  box.replaceChildren(...r.rows.map((row, i) => {
    const el = document.createElement('div');
    el.className = `vt-res-row ${i === mine ? 'is-mine' : ''}`;
    const label = document.createElement('span');
    label.textContent = row.label;
    const pct = document.createElement('b');
    pct.textContent = `${row.pct}%`;
    const bar = document.createElement('i');
    const fill = document.createElement('b');
    fill.style.width = `${row.pct}%`;
    bar.append(fill);
    el.append(label, pct, bar);
    return el;
  }));
}

async function load() {
  if (demo) {
    poll = { question: 'Qual sabor de bolo você quer no sábado?', options: ['Chocolate com morango', 'Bolo de rolo', 'Cenoura com calda', 'Macaxeira'], open: true, round: 0, companyName: 'Padaria Boa Massa' };
  } else {
    if (!/^[\w-]{1,64}$/.test(cid) || !/^[\w-]{1,64}$/.test(pid)) return closed('Link incompleto. Aponte a câmera de novo para o QR Code da TV.');
    try {
      const snap = await getDoc(doc(firebase().db, 'companies', cid, 'polls', pid));
      if (!snap.exists()) return closed('Esta enquete não existe mais.');
      poll = snap.data();
    } catch {
      return closed('Não foi possível abrir a enquete. Confira a internet e tente de novo.');
    }
    signInAnonymously(firebase().auth).catch(() => {});
  }
  $('[data-store]').textContent = poll.companyName || 'Enquete';
  document.title = `${poll.question} | ${poll.companyName || 'Vértice'}`;
  if (poll.open === false) return closed();
  $('[data-question]').textContent = poll.question;
  const prev = localStorage.getItem(mineKey());
  if (prev != null) return showDone(Number(prev), true);
  const box = $('[data-options]');
  box.replaceChildren(...poll.options.map((label, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vt-opt';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-pressed', 'false');
    const dot = document.createElement('span');
    dot.className = 'vt-dot';
    const t = document.createElement('span');
    t.textContent = label;
    b.append(dot, t);
    b.addEventListener('click', () => {
      choice = i;
      box.querySelectorAll('.vt-opt').forEach((x, j) => x.setAttribute('aria-pressed', String(j === i)));
      send.disabled = false;
    });
    return b;
  }));
  show('form');
}

async function showDone(mine, already) {
  $('[data-done-title]').textContent = already ? 'Você já votou' : 'Voto registrado';
  let tally = null;
  if (demo) tally = { counts: { o0: 42, o1: 27, o2: 18, o3: 9 } };
  else {
    try { const s = await getDoc(doc(firebase().db, 'companies', cid, 'pollTallies', pid)); tally = s.exists() ? s.data() : null; } catch { /* resultado fica para a TV */ }
  }
  if (tally) results(tally, mine);
  show('done');
}

send.addEventListener('click', async () => {
  if (choice == null) return;
  send.disabled = true;
  send.textContent = 'Votando…';
  $('[data-error]').hidden = true;
  try {
    if (!demo) {
      const { auth, db } = firebase();
      const user = auth.currentUser || (await signInAnonymously(auth)).user;
      const round = Number(poll.round) || 0;
      const b = writeBatch(db);
      b.set(doc(db, 'companies', cid, 'polls', pid, 'votes', voteId(round, user.uid)), { option: choice, at: serverTimestamp() });
      b.update(doc(db, 'companies', cid, 'pollTallies', pid), { [`counts.o${choice}`]: increment(1), total: increment(1) });
      await b.commit();
    }
    try { localStorage.setItem(mineKey(), String(choice)); } catch { /* sem storage */ }
    showDone(choice, false);
  } catch (err) {
    const e = $('[data-error]');
    e.textContent = err.code === 'permission-denied' ? 'Seu voto não entrou: você já votou nesta rodada ou a votação foi encerrada.' : 'Não foi possível votar. Confira a internet e tente de novo.';
    e.hidden = false;
    send.disabled = false;
    send.textContent = 'Votar';
  }
});

load();
