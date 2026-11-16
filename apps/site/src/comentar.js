// Página pública do mural de comentários: /comentar?e={empresa}&m={mural}
// Quem comenta entra como usuário anônimo do Firebase (sem cadastro). As regras do Firestore
// conferem tamanho, mural aberto, licença da loja e o limite de envios por aparelho.
import './comentar.css';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore/lite';
import { cleanComment, nextLimit, COMMENT_LIMITS, firstName } from '@vertice/shared/comments';

const env = import.meta.env;
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};
const params = new URLSearchParams(location.search);
const cid = params.get('e') || '';
const bid = params.get('m') || '';
// Sem configuração do Firebase (ou ?demo=1): página de exemplo, nada é enviado.
const demo = params.has('demo') || !config.apiKey;

const $ = (s) => document.querySelector(s);
const show = (name) => document.querySelectorAll('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== name; });
const form = $('.cm-form');
const text = form.elements.text;
const errBox = $('[data-error]');
const sendBtn = $('.cm-send');

let fb = null;
let board = null;
const firebase = () => {
  if (!fb) {
    const app = initializeApp(config);
    fb = { auth: getAuth(app), db: getFirestore(app) };
  }
  return fb;
};

function closed(msg) {
  if (msg) $('[data-closed-text]').textContent = msg;
  show('closed');
}

async function load() {
  if (demo) {
    board = { title: 'Deixe seu recado', question: 'O que você achou do nosso atendimento?', companyName: 'Padaria Boa Massa', open: true, autoApprove: false };
  } else {
    if (!/^[\w-]{1,64}$/.test(cid) || !/^[\w-]{1,64}$/.test(bid)) return closed('Link incompleto. Aponte a câmera de novo para o QR Code da TV.');
    try {
      const snap = await getDoc(doc(firebase().db, 'companies', cid, 'commentBoards', bid));
      if (!snap.exists()) return closed('Este mural não existe mais.');
      board = snap.data();
    } catch {
      return closed('Não foi possível abrir o mural. Confira a internet e tente de novo.');
    }
    // Já entra como anônimo enquanto a pessoa escreve (o envio fica mais rápido).
    signInAnonymously(firebase().auth).catch(() => {});
  }
  $('[data-store]').textContent = board.companyName || 'Mural de comentários';
  document.title = `${board.title || 'Comentários'} | ${board.companyName || 'Vértice'}`;
  if (!board.open) return closed();
  $('[data-question]').textContent = board.question || board.title || 'Deixe seu comentário';
  show('form');
}

text.addEventListener('input', () => { $('[data-count]').textContent = `${text.value.length} de ${COMMENT_LIMITS.text}`; });

function fail(msg) {
  errBox.textContent = msg;
  errBox.hidden = false;
  sendBtn.disabled = false;
  sendBtn.textContent = 'Enviar comentário';
}

async function send(status) {
  const { auth, db } = firebase();
  const user = auth.currentUser || (await signInAnonymously(auth)).user;
  const limRef = doc(db, 'commentLimits', user.uid);
  const prevSnap = await getDoc(limRef);
  const prev = prevSnap.exists() ? prevSnap.data() : null;
  const lim = nextLimit(prev && { windowStart: prev.windowStart?.toMillis?.(), count: prev.count }, Date.now());
  if (!lim.allowed) {
    const e = new Error('limite');
    e.waitMin = lim.waitMin;
    throw e;
  }
  const id = `${user.uid.slice(0, 20)}-${Date.now().toString(36)}`;
  const { name, text: body } = cleanComment({ name: form.elements.name.value, text: text.value });
  const b = writeBatch(db);
  b.set(limRef, {
    windowStart: lim.reset ? serverTimestamp() : prev.windowStart,
    count: lim.reset ? 1 : prev.count + 1,
    lastAt: serverTimestamp(),
    lastId: id,
  });
  b.set(doc(db, 'companies', cid, 'commentBoards', bid, 'comments', id), { name, text: body, status, createdAt: serverTimestamp(), uid: user.uid });
  await b.commit();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errBox.hidden = true;
  const { text: body } = cleanComment({ text: text.value });
  if (body.length < 2) return fail('Escreva o seu comentário.');
  sendBtn.disabled = true;
  sendBtn.textContent = 'Enviando…';
  // Robô preencheu o campo invisível: finge que deu certo e não envia nada.
  if (form.elements.website.value) return done(false);
  if (demo) return setTimeout(() => done(false), 500);
  try {
    if (board.autoApprove) {
      // Aprovação automática: se tiver palavra bloqueada, as regras recusam e vai para a moderação.
      try { await send('approved'); return done(true); } catch (err) { if (err.message === 'limite') throw err; }
    }
    await send('pending');
    done(false);
  } catch (err) {
    if (err.message === 'limite') return fail(`Você já enviou ${COMMENT_LIMITS.perWindow} comentários. Tente de novo em ${err.waitMin} min.`);
    if (err.code === 'permission-denied') return fail('O mural não aceitou o comentário agora. Ele pode ter sido fechado pela loja.');
    fail('Não foi possível enviar. Confira a internet e tente de novo.');
  }
});

function done(live) {
  const who = firstName(form.elements.name.value);
  $('[data-done-text]').textContent = live
    ? `Obrigado${who ? `, ${who}` : ''}! Seu comentário já está no mural da TV.`
    : `Obrigado${who ? `, ${who}` : ''}! A equipe da loja vai ler e, se aprovar, ele aparece na TV.`;
  form.reset();
  $('[data-count]').textContent = `0 de ${COMMENT_LIMITS.text}`;
  sendBtn.disabled = false;
  sendBtn.textContent = 'Enviar comentário';
  show('done');
}
$('[data-again]').addEventListener('click', () => show('form'));

load();
