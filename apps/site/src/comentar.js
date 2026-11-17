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
let photos = false; // mural de fotos (Foto no telão)
const MEDIA = (env.VITE_MEDIA_SERVER_URL || '').replace(/\/$/, '');
const photoInput = form.elements.photo;
const photoPreview = $('[data-photo-preview]');

/** Reduz a foto no próprio celular (até 1600 px, JPEG): envio rápido e leve. */
async function shrink(file, max = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.84));
  } finally {
    URL.revokeObjectURL(url);
  }
}

photoInput.addEventListener('change', () => {
  const f = photoInput.files?.[0];
  if (!f) return;
  photoPreview.src = URL.createObjectURL(f);
  photoPreview.hidden = false;
  $('[data-photo-label]').textContent = 'Trocar foto';
});
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
    board = params.get('demo') === 'fotos'
      ? { title: 'Sua foto no telão', question: 'Mande sua foto e apareça no telão!', companyName: 'Festa de 10 anos', open: true, kind: 'photos' }
      : { title: 'Deixe seu recado', question: 'O que você achou do nosso atendimento?', companyName: 'Padaria Boa Massa', open: true, autoApprove: false };
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
  photos = board.kind === 'photos';
  if (photos) {
    $('[data-photo]').hidden = false;
    $('[data-text-label]').textContent = 'Legenda (opcional)';
    text.rows = 2;
    text.placeholder = 'Ex.: Que festa!';
    sendBtn.textContent = 'Enviar foto';
    $('.cm-done h1').textContent = 'Foto enviada';
    const legal = $('.cm-legal');
    legal.firstChild.textContent = 'Sua foto pode aparecer na TV da loja. Guardamos a foto, a legenda e o nome, para exibição e moderação. Só envie foto em que todos concordam em aparecer. Para pedir a exclusão, fale com a loja. ';
  }
  show('form');
}

text.addEventListener('input', () => { $('[data-count]').textContent = `${text.value.length} de ${COMMENT_LIMITS.text}`; });

function fail(msg) {
  errBox.textContent = msg;
  errBox.hidden = false;
  sendBtn.disabled = false;
  sendBtn.textContent = photos ? 'Enviar foto' : 'Enviar comentário';
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
  let photo = null;
  if (photos) {
    // A foto vai para o servidor de mídias da loja; o comentário guarda só o link.
    const blob = await shrink(photoInput.files[0]);
    const res = await fetch(`${MEDIA}/v1/public/${cid}/${bid}/${id}.jpg`, {
      method: 'PUT', body: blob, headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'image/jpeg' },
    });
    if (!res.ok) {
      const e = new Error((await res.json().catch(() => ({}))).error || 'upload');
      e.upload = true;
      throw e;
    }
    photo = (await res.json()).url;
  }
  const b = writeBatch(db);
  b.set(limRef, {
    windowStart: lim.reset ? serverTimestamp() : prev.windowStart,
    count: lim.reset ? 1 : prev.count + 1,
    lastAt: serverTimestamp(),
    lastId: id,
  });
  b.set(doc(db, 'companies', cid, 'commentBoards', bid, 'comments', id), { name, text: body, status, createdAt: serverTimestamp(), uid: user.uid, ...(photo ? { photo } : {}) });
  await b.commit();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errBox.hidden = true;
  const { text: body } = cleanComment({ text: text.value });
  if (photos && !photoInput.files?.[0]) return fail('Escolha ou tire uma foto.');
  if (!photos && body.length < 2) return fail('Escreva o seu comentário.');
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
    if (err.upload) return fail(`A foto não foi enviada: ${err.message === 'upload' ? 'tente de novo.' : err.message}`);
    if (err.code === 'permission-denied') return fail('O mural não aceitou o envio agora. Ele pode ter sido fechado pela loja.');
    fail('Não foi possível enviar. Confira a internet e tente de novo.');
  }
});

function done(live) {
  const who = firstName(form.elements.name.value);
  const what = photos ? 'Sua foto' : 'Seu comentário';
  $('[data-done-text]').textContent = live
    ? `Obrigado${who ? `, ${who}` : ''}! ${what} já está na TV.`
    : `Obrigado${who ? `, ${who}` : ''}! A equipe da loja vai ver e, se aprovar, ${photos ? 'ela' : 'ele'} aparece na TV.`;
  form.reset();
  photoPreview.hidden = true;
  $('[data-photo-label]').textContent = 'Tirar ou escolher foto';
  $('[data-count]').textContent = `0 de ${COMMENT_LIMITS.text}`;
  sendBtn.disabled = false;
  sendBtn.textContent = photos ? 'Enviar foto' : 'Enviar comentário';
  show('done');
}
$('[data-again]').addEventListener('click', () => show('form'));

load();
