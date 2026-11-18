import './site.css';

// TV do exemplo: troca de cena a cada 5 s até a pessoa escolher uma.
const scenes = [...document.querySelectorAll('.scene')];
const tabs = [...document.querySelectorAll('[data-go]')];
let idx = 0;
let auto = !matchMedia('(prefers-reduced-motion: reduce)').matches;
const show = (name) => {
  scenes.forEach((s) => s.classList.toggle('is-on', s.dataset.scene === name));
  tabs.forEach((t) => { const on = t.dataset.go === name; t.classList.toggle('is-on', on); t.setAttribute('aria-pressed', String(on)); });
};
tabs.forEach((t) => t.addEventListener('click', () => { auto = false; show(t.dataset.go); }));
if (scenes.length) {
  setInterval(() => { if (!auto) return; idx = (idx + 1) % scenes.length; show(scenes[idx].dataset.scene); }, 5000);
}
const clock = document.querySelector('[data-clock]');
const tick = () => { if (clock) clock.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
tick();
setInterval(tick, 20_000);

// Contato e dias de teste vêm das configurações da plataforma (console da Vetta), leitura pública.
const PROJECT = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'vertice-7ffa0';
fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/platform/settings`)
  .then((r) => (r.ok ? r.json() : null))
  .then((d) => {
    const f = d?.fields || {};
    const wa = f.supportWhatsApp?.stringValue;
    const days = f.trialDays?.integerValue;
    if (days) document.querySelectorAll('[data-trial]').forEach((e) => { e.textContent = days; });
    if (wa) {
      const msg = encodeURIComponent('Olá! Quero saber mais sobre o Vértice para a minha loja.');
      document.querySelectorAll('[data-whatsapp]').forEach((a) => { a.href = `https://wa.me/${wa}?text=${msg}`; a.target = '_blank'; a.rel = 'noreferrer'; });
    }
    if (f.signupOpen?.booleanValue === false) {
      document.querySelectorAll('a[href="/app/#/?criar"]').forEach((a) => { a.textContent = 'Pedir uma demonstração'; if (wa) a.href = `https://wa.me/${wa}`; });
    }
  })
  .catch(() => {});

// Indique e ganhe: quem chega por um link de indicação (?ref=CODIGO) leva o código até o cadastro no painel.
try {
  const ref = new URLSearchParams(location.search).get('ref');
  if (ref && /^[A-Za-z0-9]{4,12}$/.test(ref)) localStorage.setItem('vx-ref', ref.toUpperCase());
} catch { /* sem storage */ }
