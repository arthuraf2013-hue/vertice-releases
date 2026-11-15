// Vértice: serviço de alertas e cobrança.
//
// Roda em um computador ou servidor sempre ligado (o mesmo do servidor de mídias serve) e faz:
//   - a cada minuto: testes de alerta pedidos no painel (Empresa › Alertas)
//   - a cada 2 minutos: TV que parou de responder / voltou → e-mail e WhatsApp do cliente
//   - a cada hora: avisos de fim do teste grátis e de vencimento da mensalidade (uma vez cada),
//     e correção do contador de telas de cada empresa
//   - todo dia às 8h: resumo para a Vetta (bloqueados, vencidos, testes acabando)
//
// Usa uma conta de serviço do Firebase (Admin SDK): ela ignora as regras, então este processo
// fica só no servidor da Vetta. Configuração em .env ao lado deste arquivo (veja .env.example).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';
import { inQuiet, screenTransitions, offlineMessage, billingNotices } from './rules.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(HERE, '.env'));

const TZ = process.env.TZ_LOJAS || 'America/Recife';
const PANEL_URL = (process.env.PANEL_URL || 'https://vertice.vettasistemas.com.br/app/').replace(/\/?$/, '/');
const VETTA_EMAIL = process.env.VETTA_EMAIL || '';
const ONCE = process.argv.includes('--once');

const credFile = process.env.GOOGLE_APPLICATION_CREDENTIALS && path.resolve(HERE, process.env.GOOGLE_APPLICATION_CREDENTIALS);
initializeApp(credFile && fs.existsSync(credFile)
  ? { credential: cert(JSON.parse(fs.readFileSync(credFile, 'utf8'))) }
  : { credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
const db = getFirestore();

const ms = (v) => (v == null ? null : typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : Date.parse(v));
const log = (...a) => console.log(new Date().toISOString(), ...a);

/* ---------- Envio ---------- */

const mailer = process.env.SMTP_HOST
  ? nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  })
  : null;

async function sendEmail(to, subject, text) {
  if (!to.length) return 'sem destinatário';
  if (!mailer) return 'e-mail não configurado no servidor';
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#141b26">
<p style="font-weight:700;color:#293548;letter-spacing:.04em">VÉRTICE</p>
${text.split('\n').map((l) => `<p style="font-size:15px;line-height:1.5;margin:0 0 10px">${l.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])}</p>`).join('')}
<p style="margin:22px 0"><a href="${PANEL_URL}" style="background:#293548;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">Abrir o painel</a></p>
<p style="font-size:12px;color:#6b7686;border-top:1px solid #e3e7ee;padding-top:10px">Vértice · Vetta Sistemas. Você recebe este aviso porque está cadastrado nos alertas da empresa.</p></div>`;
  await mailer.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to: to.join(', '), subject, text: `${text}\n\n${PANEL_URL}`, html });
  return 'enviado';
}

/** WhatsApp por Z-API, Evolution API ou um webhook próprio (WHATSAPP_PROVIDER). */
async function sendWhatsApp(numbers, text) {
  const provider = process.env.WHATSAPP_PROVIDER;
  if (!numbers.length) return 'sem destinatário';
  if (!provider) return 'WhatsApp não configurado no servidor';
  for (const phone of numbers) {
    let url; let headers = { 'Content-Type': 'application/json' }; let body;
    if (provider === 'zapi') {
      url = `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}/send-text`;
      if (process.env.ZAPI_CLIENT_TOKEN) headers['Client-Token'] = process.env.ZAPI_CLIENT_TOKEN;
      body = { phone, message: text };
    } else if (provider === 'evolution') {
      url = `${process.env.EVOLUTION_URL.replace(/\/$/, '')}/message/sendText/${process.env.EVOLUTION_INSTANCE}`;
      headers.apikey = process.env.EVOLUTION_APIKEY;
      body = { number: phone, text };
    } else {
      url = process.env.WHATSAPP_WEBHOOK_URL;
      if (process.env.WHATSAPP_WEBHOOK_TOKEN) headers.Authorization = `Bearer ${process.env.WHATSAPP_WEBHOOK_TOKEN}`;
      body = { to: phone, text };
    }
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`WhatsApp (${provider}) respondeu ${res.status}`);
  }
  return 'enviado';
}

/** Manda pelos canais da empresa e registra em alertLog (aparece em Empresa › Alertas). */
async function notifyCompany(cid, company, { subject, text, kind }) {
  const a = company.alerts || {};
  const emails = a.emails || [];
  const phones = a.whatsapps || [];
  const result = {};
  try { result.email = await sendEmail(emails, subject, text); } catch (e) { result.email = `falhou: ${e.message}`; }
  try { result.whatsapp = await sendWhatsApp(phones, `*${subject}*\n${text}`); } catch (e) { result.whatsapp = `falhou: ${e.message}`; }
  await db.collection(`companies/${cid}/alertLog`).add({ at: FieldValue.serverTimestamp(), kind, text: subject, to: [...emails, ...phones], result });
  log('alerta', cid, kind, subject, JSON.stringify(result));
}

/* ---------- Licença (mesma conta de packages/shared/src/license.js) ---------- */

function blocked(c, now = Date.now()) {
  const st = c.status || 'active';
  if (st === 'suspended' || st === 'canceled') return true;
  if (st === 'trial') return !ms(c.trialEndsAt) || ms(c.trialEndsAt) <= now;
  if (!ms(c.paidUntil)) return false;
  return now >= ms(c.paidUntil) + (Number.isFinite(c.graceDays) ? c.graceDays : 5) * 86400000;
}

/* ---------- Tarefas ---------- */

async function runAlertTests() {
  const snap = await db.collectionGroup('alertTests').get();
  for (const t of snap.docs) {
    const cid = t.ref.parent.parent.id;
    const company = (await db.doc(`companies/${cid}`).get()).data();
    if (company) {
      await notifyCompany(cid, company, {
        kind: 'teste', subject: `Vértice: teste de alerta (${company.name})`,
        text: 'Este é um teste. Quando uma TV parar de responder, o aviso chega assim, neste e-mail e no WhatsApp cadastrados.',
      });
    }
    await t.ref.delete();
  }
}

async function runOffline() {
  const now = Date.now();
  const companies = await db.collection('companies').where('alerts.enabled', '==', true).get();
  for (const c of companies.docs) {
    const company = c.data();
    if (blocked(company, now)) continue;
    const a = company.alerts || {};
    const screens = (await c.ref.collection('screens').get()).docs.map((d) => ({ id: d.id, name: d.get('name') || d.id, lastSeen: ms(d.get('lastSeen')) }));
    const stateRef = db.doc(`workerState/alerts_${c.id}`);
    const state = (await stateRef.get()).get('screens') || {};
    const { down, up, next } = screenTransitions(screens, state, { offlineMinutes: a.offlineMinutes || 15, now });
    const backs = a.notifyBack === false ? [] : up;
    // No horário de silêncio o estado anda, mas o aviso não sai (quem caiu de madrugada avisa ao fim do silêncio).
    const quiet = inQuiet(a.quietStart, a.quietEnd, TZ, now);
    if (quiet) {
      for (const s of down) next[s.id] = 'online';
      await stateRef.set({ screens: next, at: FieldValue.serverTimestamp() });
      continue;
    }
    if (down.length || backs.length) await notifyCompany(c.id, company, { kind: down.length ? 'offline' : 'online', ...offlineMessage(company, down, backs, now) });
    await stateRef.set({ screens: next, at: FieldValue.serverTimestamp() });
  }
}

async function ownerEmails(cid, company) {
  if (company.ownerEmail) return [company.ownerEmail];
  const owners = await db.collection(`companies/${cid}/members`).where('role', 'in', ['owner', 'admin']).get();
  return owners.docs.map((d) => d.get('email')).filter(Boolean);
}

async function runBilling() {
  const now = Date.now();
  const settings = (await db.doc('platform/settings').get()).data() || {};
  const companies = await db.collection('companies').get();
  for (const c of companies.docs) {
    const company = c.data();
    const data = { ...company, trialEndsAt: ms(company.trialEndsAt), paidUntil: ms(company.paidUntil) };
    const sent = company.notices || {};
    for (const n of billingNotices(data, { now, tz: TZ, graceDefault: settings.graceDays ?? 5 })) {
      const key = n.key.replace(/[./:]/g, '-');
      if (sent[key]) continue;
      const contact = settings.supportWhatsApp ? `\nFale com a Vetta Sistemas pelo WhatsApp: https://wa.me/${settings.supportWhatsApp}` : '';
      let result;
      try { result = await sendEmail(await ownerEmails(c.id, company), n.subject, n.text + contact); } catch (e) { result = `falhou: ${e.message}`; }
      await c.ref.update({ [`notices.${key}`]: Timestamp.now() });
      await c.ref.collection('alertLog').add({ at: FieldValue.serverTimestamp(), kind: 'cobranca', text: n.subject, to: await ownerEmails(c.id, company), result: { email: result } });
      log('cobrança', c.id, n.key, result);
    }
    // Contador de telas (o limite do plano é conferido por ele nas regras).
    const real = (await c.ref.collection('screens').count().get()).data().count;
    if (company.screenCount !== real) await c.ref.update({ screenCount: real });
  }
}

async function runDigest() {
  if (!VETTA_EMAIL) return;
  const now = Date.now();
  const rows = (await db.collection('companies').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const lines = [];
  const add = (title, list, fmt) => { if (list.length) lines.push(`${title} (${list.length}):`, ...list.map(fmt), ''); };
  const day = (v) => new Date(ms(v)).toLocaleDateString('pt-BR', { timeZone: TZ });
  add('Bloqueados', rows.filter((r) => blocked(r, now)), (r) => `• ${r.name}${r.paidUntil ? `, venceu ${day(r.paidUntil)}` : ''}`);
  add('Vencidos, ainda na tolerância', rows.filter((r) => !blocked(r, now) && r.status !== 'trial' && ms(r.paidUntil) && ms(r.paidUntil) < now), (r) => `• ${r.name}, venceu ${day(r.paidUntil)}`);
  add('Vencem nos próximos 5 dias', rows.filter((r) => r.status === 'active' && ms(r.paidUntil) > now && ms(r.paidUntil) - now < 5 * 86400000), (r) => `• ${r.name}, ${day(r.paidUntil)}${r.monthlyPrice ? `, R$ ${Number(r.monthlyPrice).toFixed(2).replace('.', ',')}` : ''}`);
  add('Testes grátis acabando', rows.filter((r) => r.status === 'trial' && ms(r.trialEndsAt) > now && ms(r.trialEndsAt) - now < 3 * 86400000), (r) => `• ${r.name}, ${day(r.trialEndsAt)}${r.phone ? `, ${r.phone}` : ''}`);
  add('Novos cadastros nas últimas 24 h', rows.filter((r) => r.source === 'cadastro' && ms(r.createdAt) > now - 86400000), (r) => `• ${r.name}${r.city ? `, ${r.city}` : ''}${r.phone ? `, ${r.phone}` : ''}${r.ownerEmail ? `, ${r.ownerEmail}` : ''}`);
  if (!lines.length) return;
  await sendEmail([VETTA_EMAIL], `Vértice: resumo de clientes (${new Date(now).toLocaleDateString('pt-BR', { timeZone: TZ })})`, lines.join('\n').trim());
  log('resumo enviado');
}

/* ---------- Agenda ---------- */

const jobs = [
  { name: 'testes', every: 60_000, run: runAlertTests },
  { name: 'telas', every: 2 * 60_000, run: runOffline },
  { name: 'cobrança', every: 60 * 60_000, run: runBilling },
];

async function safe(name, fn) {
  try { await fn(); } catch (e) { console.error(new Date().toISOString(), `[${name}]`, e.message || e); }
}

if (ONCE) {
  for (const j of jobs) await safe(j.name, j.run);
  await safe('resumo', runDigest);
  process.exit(0);
} else {
  log(`Serviço de alertas no ar. Fuso ${TZ}. E-mail: ${mailer ? 'ligado' : 'desligado'}. WhatsApp: ${process.env.WHATSAPP_PROVIDER || 'desligado'}.`);
  for (const j of jobs) {
    safe(j.name, j.run);
    setInterval(() => safe(j.name, j.run), j.every);
  }
  let lastDigest = '';
  setInterval(() => {
    const d = new Date().toLocaleString('sv-SE', { timeZone: TZ }); // AAAA-MM-DD HH:MM:SS
    if (d.slice(11, 13) === '08' && lastDigest !== d.slice(0, 10)) { lastDigest = d.slice(0, 10); safe('resumo', runDigest); }
  }, 60_000);
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}
