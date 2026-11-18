// Página pública da pesquisa: /pesquisa?e={empresa}&m={pesquisa}
// Resposta anônima (Firebase anônimo), uma por aparelho e por rodada. As regras do Firestore
// conferem o formato de cada resposta (nota 0–10, estrelas 1–5, opção e texto até 500 letras).
import './comentar.css';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore/lite';
import { validAnswer, SURVEY_LIMITS } from '@vertice/shared/survey';

const env = import.meta.env;
const config = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID };
const params = new URLSearchParams(location.search);
const cid = params.get('e') || '';
const sid = params.get('m') || '';
const demo = params.has('demo') || !config.apiKey;
const $ = (s) => document.querySelector(s);
const show = (name) => document.querySelectorAll('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== name; });
const send = $('[data-send]');
let fb = null;
let survey = null;
const answers = {};
const firebase = () => {
  if (!fb) { const app = initializeApp(config); fb = { auth: getAuth(app), db: getFirestore(app) }; }
  return fb;
};
const doneKey = () => `vx-survey:${cid}:${sid}:${survey?.round || 0}`;

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  e.append(...kids.filter((x) => x != null));
  return e;
}

/** Botões de escolha única (nota, estrelas, opção): marca um e guarda o valor. */
function choices(i, values, labelOf, cls) {
  const box = el('div', { class: `ps-choices ${cls}`, role: 'radiogroup' });
  for (const v of values) {
    const b = el('button', {
      type: 'button', class: 'ps-choice', 'aria-pressed': 'false', 'aria-label': labelOf(v, true),
      onclick: () => {
        answers[`q${i}`] = v;
        box.querySelectorAll('.ps-choice').forEach((x) => x.setAttribute('aria-pressed', String(x === b || (cls === 'is-stars' && Number(x.dataset.v) <= v))));
      },
    }, labelOf(v));
    b.dataset.v = String(v);
    box.append(b);
  }
  return box;
}

function render() {
  const box = $('[data-questions]');
  box.replaceChildren(...survey.questions.map((q, i) => {
    let input;
    if (q.type === 'nps') {
      input = el('div', {}, choices(i, [...Array(11).keys()], (v, long) => (long ? `Nota ${v}` : String(v)), 'is-nps'),
        el('div', { class: 'ps-scale' }, el('span', {}, 'Nada provável'), el('span', {}, 'Muito provável')));
    } else if (q.type === 'stars') {
      input = choices(i, [1, 2, 3, 4, 5], (v, long) => (long ? `${v} ${v === 1 ? 'estrela' : 'estrelas'}` : '★'), 'is-stars');
    } else if (q.type === 'choice') {
      input = choices(i, q.options.map((_, k) => k), (k) => q.options[k], 'is-list');
    } else {
      input = el('textarea', { rows: '3', maxlength: String(SURVEY_LIMITS.answer), placeholder: 'Escreva aqui (opcional)', 'aria-label': q.text, oninput: (e) => { answers[`q${i}`] = e.target.value; } });
    }
    return el('fieldset', { class: 'ps-q' }, el('legend', {}, `${i + 1}. ${q.text}`), input);
  }));
}

async function load() {
  if (demo) {
    survey = { title: 'Sua opinião importa', companyName: 'Padaria Boa Massa', open: true, round: 0, questions: [
      { type: 'nps', text: 'De 0 a 10, quanto você recomendaria a gente a um amigo?' },
      { type: 'stars', text: 'Como foi o atendimento hoje?' },
      { type: 'choice', text: 'O que você veio comprar?', options: ['Pães', 'Bolos e doces', 'Café da manhã', 'Outra coisa'] },
      { type: 'text', text: 'Quer deixar uma sugestão?' },
    ] };
  } else {
    if (!/^[\w-]{1,64}$/.test(cid) || !/^[\w-]{1,64}$/.test(sid)) return closed('Link incompleto. Aponte a câmera de novo para o QR Code da TV.');
    try {
      const snap = await getDoc(doc(firebase().db, 'companies', cid, 'surveys', sid));
      if (!snap.exists()) return closed('Esta pesquisa não existe mais.');
      survey = snap.data();
    } catch {
      return closed('Não foi possível abrir a pesquisa. Confira a internet e tente de novo.');
    }
    signInAnonymously(firebase().auth).catch(() => {});
  }
  $('[data-store]').textContent = survey.companyName || 'Pesquisa';
  document.title = `${survey.title || 'Pesquisa'} | ${survey.companyName || 'Vértice'}`;
  if (survey.open === false) return closed();
  if (localStorage.getItem(doneKey())) { $('[data-done-title]').textContent = 'Você já respondeu'; $('[data-done-text]').textContent = 'Obrigado! Sua resposta já foi registrada.'; return show('done'); }
  $('[data-title]').textContent = survey.title || 'Sua opinião importa';
  render();
  show('form');
}

function closed(msg) {
  if (msg) $('[data-closed-text]').textContent = msg;
  show('closed');
}

$('[data-view="form"]').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const err = $('[data-error]');
  const clean = {};
  survey.questions.forEach((q, i) => {
    const v = q.type === 'text' ? String(answers[`q${i}`] || '').trim() : answers[`q${i}`];
    if (validAnswer(q, v)) clean[`q${i}`] = v;
  });
  if (!Object.keys(clean).length) { err.textContent = 'Responda pelo menos uma pergunta.'; err.hidden = false; return; }
  err.hidden = true;
  send.disabled = true;
  send.textContent = 'Enviando…';
  try {
    if (!demo) {
      const { auth, db } = firebase();
      const user = auth.currentUser || (await signInAnonymously(auth)).user;
      await setDoc(doc(db, 'companies', cid, 'surveys', sid, 'responses', `${Number(survey.round) || 0}_${user.uid}`), { answers: clean, at: serverTimestamp() });
    }
    try { localStorage.setItem(doneKey(), '1'); } catch { /* sem storage */ }
    show('done');
  } catch (e) {
    const already = /permission|exists/i.test(String(e?.code || e?.message));
    err.textContent = already ? 'Este aparelho já respondeu esta pesquisa. Obrigado!' : 'Não foi possível enviar agora. Confira a internet e tente de novo.';
    err.hidden = false;
    send.disabled = false;
    send.textContent = 'Enviar respostas';
  }
});

load();
