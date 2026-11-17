// Página pública do catálogo de mídia indoor: /midia?e={empresa}
// Lê publicCatalogs/{empresa}, que o painel publica a partir de Mídia indoor › Catálogo.
import './midia.css';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore/lite';

const env = import.meta.env;
const config = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID };
const params = new URLSearchParams(location.search);
const cid = params.get('e') || '';
const demo = params.has('demo') || !config.apiKey;
const $ = (s) => document.querySelector(s);
const money = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (n) => Number(n).toLocaleString('pt-BR');
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

const DEMO = {
  enabled: true, companyName: 'Padaria Boa Massa', title: 'Anuncie nas nossas telas', intro: 'Seu anúncio nas TVs das nossas padarias, visto por quem já está comprando, do café da manhã ao fim da tarde.',
  whatsapp: '5581999990000', totalScreens: 6, totalAudience: 2300,
  packages: [{ name: 'Básico', seconds: 15, insertionsPerDay: 60, days: 30, price: 290 }, { name: 'Destaque', seconds: 15, insertionsPerDay: 120, days: 30, price: 490 }, { name: 'Vitrine', seconds: 30, insertionsPerDay: 120, days: 30, price: 790 }],
  points: [
    { id: 'u1', name: 'Boa Viagem', city: 'Recife', screens: 3, audience: 1400, description: 'Caixa, vitrine e balcão de café. Público família e trabalhadores da região.' },
    { id: 'u2', name: 'Casa Forte', city: 'Recife', screens: 3, audience: 900, description: 'Video wall na vitrine voltado para a praça.' },
  ],
};

async function load() {
  let c = null;
  if (demo) c = DEMO;
  else if (/^[\w-]{1,64}$/.test(cid)) {
    try {
      const s = await getDoc(doc(getFirestore(initializeApp(config)), 'publicCatalogs', cid));
      c = s.exists() ? s.data() : null;
    } catch { c = null; }
  }
  if (!c || !c.enabled) {
    $('[data-company]').textContent = c?.companyName || 'Mídia indoor';
    $('[data-off]').hidden = false;
    return;
  }
  document.title = `${c.title} | ${c.companyName}`;
  $('[data-company]').textContent = c.companyName;
  $('[data-title]').textContent = c.title;
  $('[data-intro]').textContent = c.intro;
  $('[data-screens]').textContent = num(c.totalScreens || 0);
  $('[data-points]').textContent = num((c.points || []).length);
  if (c.totalAudience) $('[data-audience]').textContent = num(c.totalAudience);
  else $('[data-aud-box]').hidden = true;
  $('[data-stats]').hidden = false;
  if (c.whatsapp) {
    const a = $('[data-wa]');
    a.href = `https://wa.me/${c.whatsapp}?text=${encodeURIComponent(`Olá! Vi o catálogo de mídia de ${c.companyName} e quero uma proposta.`)}`;
    a.hidden = false;
  }
  if (c.packages?.length) {
    $('[data-packages]').replaceChildren(...c.packages.map((p) => {
      const card = el('article', 'md-pack');
      card.append(el('h3', null, p.name), el('p', 'md-price', money(p.price)));
      const ul = el('ul');
      ul.append(el('li', null, `${num(p.insertionsPerDay)} inserções por dia, por tela`), el('li', null, `Anúncio de ${p.seconds} segundos`), el('li', null, `${p.days} dias`), el('li', null, `${num(p.insertionsPerDay * p.days * (c.totalScreens || 1))} exibições no período`));
      card.append(ul);
      return card;
    }));
    $('[data-packages-sec]').hidden = false;
  }
  if (c.points?.length) {
    $('[data-point-list]').replaceChildren(...c.points.map((p) => {
      const card = el('article', 'md-point');
      card.append(el('h3', null, p.name), el('p', 'md-city', [p.city, `${p.screens} ${p.screens === 1 ? 'tela' : 'telas'}`, p.audience ? `${num(p.audience)} pessoas/dia` : ''].filter(Boolean).join(' · ')));
      if (p.description) card.append(el('p', null, p.description));
      return card;
    }));
    $('[data-points-sec]').hidden = false;
  }
}
load();
