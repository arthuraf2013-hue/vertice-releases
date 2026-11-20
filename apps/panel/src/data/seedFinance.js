// Base fictícia do console da Vetta na demonstração (?vetta na URL): cerca de 50 empresas com 14 meses de
// história coerente. Cada empresa tem o seu ciclo; o MRR de hoje menos os eventos dá o MRR de cada dia
// passado, e os recebimentos e as faturas batem com os ciclos pagos. Números fixos (sorteio com semente).

const DAY = 86_400_000;
const NAMES = [
  'Mercado Bom Preço', 'Farmácia Vida', 'Açaí da Praça', 'Ótica Visão', 'Padaria Pão Quente', 'Academia Força Total', 'Clínica Sorriso', 'Pet Shop Amigo Fiel',
  'Restaurante Sabor do Sertão', 'Barbearia Navalha de Ouro', 'Hortifruti Verde Vale', 'Loja Moda Recife', 'Lanchonete Ponto Certo', 'Auto Peças Avenida',
  'Sorveteria Gelato', 'Material de Construção Forte', 'Drogaria Popular Olinda', 'Pizzaria Forno a Lenha', 'Escola Pequeno Saber', 'Laboratório Vital',
  'Supermercado Família', 'Café da Esquina', 'Salão Beleza Pura', 'Distribuidora Água Viva', 'Churrascaria Gaúcha', 'Papelaria Papel & Cia', 'Hamburgueria Brasa',
  'Clínica Veterinária Bicho Bom', 'Ótica Olhar', 'Mercadinho São José', 'Loja de Calçados Passo Firme', 'Floricultura Jardim', 'Conveniência 24h Posto Sul',
  'Restaurante Mar Aberto', 'Livraria Página', 'Doceria Doce Mel', 'Academia Corpo em Forma', 'Imobiliária Lar Novo', 'Concessionária Nordeste Motos',
  'Pousada Beira-Mar', 'Rede Farma Mais', 'Cervejaria do Porto', 'Studio Pilates Equilíbrio', 'Agência Loop Mídia', 'Bistrô da Praça', 'Empório Natural',
  'Clínica Odonto Prime', 'Casa de Carnes Boi Bom',
];
const CITIES = ['Recife', 'Olinda', 'Jaboatão', 'Paulista', 'Caruaru', 'Petrolina', 'Cabo de Santo Agostinho', 'Camaragibe', 'Garanhuns', 'João Pessoa'];
const PRICES = { start: [99.9, 89.9, 99.9, 119.9], pro: [249.9, 229.9, 279.9], rede: [1490, 990] };
const LIMITS = { start: 3, pro: 15, rede: 100 };
const STORAGE = { start: 1024, pro: 10240, rede: 51200 };

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const addMonths = (ms, n) => {
  const d = new Date(ms);
  const day = d.getDate();
  d.setMonth(d.getMonth() + n);
  if (d.getDate() !== day) d.setDate(0);
  return d.getTime();
};
const cnpj = (r) => Array.from({ length: 14 }, () => Math.floor(r() * 10)).join('');

export function seedFinance({ set, now }) {
  const r = rng(20261120);
  const pick = (list) => list[Math.floor(r() * list.length)];
  const method = () => { const x = r(); return x < 0.66 ? 'Pix' : x < 0.86 ? 'Boleto' : x < 0.95 ? 'Cartão de crédito' : 'Transferência'; };
  let ev = 0; let le = 0;
  const event = (cid, name, type, from, to, at, extra = {}) => set(`mrrEvents/e${++ev}`, { cid, name, type, from, to, delta: Math.round((to - from) * 100) / 100, at, ...extra });

  NAMES.forEach((name, n) => {
    const id = `c-${n + 1}`;
    // Perfil da conta.
    const x = r();
    const kind = n === 1 ? 'trial' : n === 3 ? 'paused' : x < 0.07 ? 'trial' : x < 0.12 ? 'courtesy' : x < 0.26 ? 'churned' : 'paying';
    const plan = n === 0 || n === 40 ? 'rede' : r() < 0.25 ? 'pro' : 'start';
    let price = pick(PRICES[plan]);
    // Alguns entram neste mês (para o mês corrente ter movimento, como na vida real).
    const fresh = kind === 'paying' && (n === 20 || n === 27 || n === 44);
    const start = kind === 'trial' ? now - Math.floor(2 + r() * 10) * DAY : fresh ? now - (3 + (n % 9)) * DAY : now - Math.floor(30 + r() * 400) * DAY;
    const limit = LIMITS[plan] + (plan === 'start' && r() < 0.2 ? 2 : 0);
    const doc = n % 13 === 7 ? '' : cnpj(r);
    const company = {
      name, city: pick(CITIES), plan, screenLimit: limit, storageQuotaMB: STORAGE[plan], graceDays: 5, createdAt: start,
      ownerEmail: `contato@${name.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '').slice(0, 14)}.com.br`, phone: `5581999${String(100000 + n * 731).slice(-6)}`,
      ...(doc ? { cpfCnpj: doc, asaasCustomerId: `cus_${n}` } : {}),
    };

    // Telas pareadas.
    const used = kind === 'churned' ? 0 : plan === 'rede' ? 18 + Math.floor(r() * 20) : plan === 'pro' ? 2 + Math.floor(r() * 11) : Math.floor(r() * (limit + 1));
    for (let i = 1; i <= used; i++) {
      const paired = Math.min(now - DAY, start + Math.floor(r() * Math.max(1, (now - start) / DAY)) * DAY);
      set(`companies/${id}/screens/${id}-s${i}`, { name: i === 1 ? 'Caixa' : i === 2 ? 'Vitrine' : `TV ${i}`, code: `VTX-${String(i).padStart(4, '0')}`, pairedAt: paired, lastSeen: r() < 0.85 ? now - 30_000 : now - (3 + i) * 3600_000, appVersion: '0.3.8' });
      set(`licenseEvents/l${++le}`, { cid: id, screenId: `${id}-s${i}`, screenName: i === 1 ? 'Caixa' : i === 2 ? 'Vitrine' : `TV ${i}`, type: 'activated', at: paired });
    }
    if (r() < 0.15 && used) set(`licenseEvents/l${++le}`, { cid: id, screenId: `${id}-old`, screenName: 'TV antiga', type: 'removed', at: now - Math.floor(r() * 60) * DAY });
    set(`companies/${id}/members/o-${id}`, { role: 'owner', name: `Dono ${name}`, email: company.ownerEmail });

    if (kind === 'trial') {
      set(`companies/${id}`, { ...company, status: 'trial', trialEndsAt: start + 14 * DAY, source: 'cadastro', screenCount: used });
      return;
    }
    if (kind === 'courtesy') {
      set(`companies/${id}`, { ...company, status: 'active', monthlyPrice: 0, screenCount: used, notes: 'Parceiro: cortesia.' });
      return;
    }

    // Ciclos pagos: do início até hoje (ou até cancelar / parar de pagar).
    event(id, name, 'new', 0, price, start, { plan, screens: limit });
    const priceBefore = price;
    let changedAt = null;
    if (kind === 'paying' && !fresh && (r() < 0.18 || n === 8 || n === 16)) {
      changedAt = n === 8 ? now - 4 * DAY : n === 16 ? now - 9 * DAY : start + Math.floor(r() * (now - start) * 0.9);
      const up = r() < 0.8;
      price = Math.round((up ? price * (1.3 + r()) : price * 0.7) * 10) / 10;
      event(id, name, up ? 'expansion' : 'contraction', priceBefore, price, changedAt, { plan, screens: up ? limit + 2 : limit });
      company.screenLimit = up ? limit + 2 : limit;
    }
    const churnAt = kind === 'churned' ? (n === 33 || n === 38 ? now - (2 + (n % 5)) * DAY : start + Math.floor((0.3 + r() * 0.65) * (now - start))) : null;
    // Quem paga: alguns estão atrasados (3 a 33 dias), um bloqueado há 45 e um quase no cancelamento automático.
    const lateDays = kind === 'paused' ? 40 : kind === 'paying' ? (n === 5 ? 82 : n === 9 ? 45 : r() < 0.14 ? 3 + Math.floor(r() * 30) : 0) : 0;
    const stopAt = churnAt || now - lateDays * DAY;
    let due = start;
    let cycle = 0;
    // Cada ciclo que começou antes de parar foi pago (perto do começo do ciclo).
    const late = lateDays > 0 && !churnAt;
    while (late ? addMonths(due, 1) <= stopAt : due <= stopAt) {
      const amount = changedAt && due < changedAt ? priceBefore : price;
      const paidAt = Math.min(now - DAY, due + Math.floor(r() * 6 - 2) * DAY);
      const m = method();
      const iid = `m-${cycle}`;
      const channel = m === 'Transferência' ? 'Manual' : 'Asaas';
      set(`companies/${id}/invoices/${iid}`, {
        kind: cycle === 0 ? 'contratacao' : 'mensalidade', title: cycle === 0 ? `Contratação · plano ${plan[0].toUpperCase()}${plan.slice(1)}` : `Mensalidade · ${company.screenLimit} telas`,
        amount, months: 1, status: 'paid', dueAt: due, createdAt: due - 10 * DAY, paidAt, method: m, channel,
        asaasPaymentId: `pay_${id}_${cycle}`, invoiceUrl: 'https://www.asaas.com/i/demonstracao', createdBy: 'auto',
      });
      set(`companies/${id}/payments/inv-${iid}`, { amount, months: 1, method: m, channel, title: cycle === 0 ? 'Contratação' : 'Mensalidade', kind: cycle === 0 ? 'contratacao' : 'mensalidade', invoiceId: iid, paidAt, by: channel });
      due = addMonths(due, 1);
      cycle += 1;
    }
    const paidUntil = due;

    if (kind === 'churned') {
      event(id, name, 'churn', price, 0, churnAt, { plan, screens: company.screenLimit });
      set(`companies/${id}`, { ...company, status: 'canceled', monthlyPrice: price, paidUntil, canceledAt: churnAt, cancelReason: r() < 0.5 ? 'pedido' : 'inadimplencia', screenCount: used });
      if (r() < 0.3) set(`companies/${id}/invoices/m-${cycle}`, { kind: 'mensalidade', title: `Mensalidade · ${company.screenLimit} telas`, amount: price, months: 1, status: 'canceled', dueAt: paidUntil, createdAt: paidUntil - 10 * DAY, canceledAt: churnAt, cancelReason: 'conta cancelada' });
      return;
    }

    const extra = {};
    if (n === 12 || n === 30) { extra.cancelAt = paidUntil; extra.cancelRequestedAt = now - 4 * DAY; }
    if (kind === 'paused') { set(`companies/${id}`, { ...company, status: 'suspended', monthlyPrice: price, paidUntil, screenCount: used }); event(id, name, 'churn', price, 0, now - 20 * DAY, { plan }); return; }
    set(`companies/${id}`, { ...company, status: 'active', monthlyPrice: price, paidUntil, screenCount: used, ...extra });

    // Fatura do ciclo atual: em aberto se vence em até 10 dias, vencida se atrasou.
    if (paidUntil - now <= 10 * DAY && !extra.cancelAt) {
      const iid = `m-${cycle}`;
      const sync = doc ? { asaasPaymentId: `pay_${id}_${cycle}`, invoiceUrl: 'https://www.asaas.com/i/demonstracao' } : { syncError: { message: 'Cadastre o CPF ou CNPJ do cliente para cobrar pelo Asaas.', at: now - DAY, attempts: 3 } };
      set(`companies/${id}/invoices/${iid}`, {
        kind: 'mensalidade', title: `Mensalidade · ${company.screenLimit} telas`, description: `Vértice ${plan === 'rede' ? 'Rede' : plan === 'pro' ? 'Pro' : 'Start'}`,
        amount: price, months: 1, status: 'open', dueAt: paidUntil, createdAt: paidUntil - 10 * DAY, periodStart: paidUntil, createdBy: 'auto', ...sync,
      });
    }
  });

  // Pedidos da Loja.
  set('companies/c-6/storeOrders/o1', { itemId: 'espaco', item: { name: '+5 GB de mídias', kind: 'storage', storageMB: 5120 }, value: 49.9, status: 'paid', billingType: 'PIX', createdAt: now - 12 * DAY, paidAt: now - 12 * DAY, invoiceUrl: 'https://www.asaas.com/i/demonstracao' });
  set('companies/c-6/payments/loja-o1', { amount: 49.9, months: 0, method: 'Pix', channel: 'Asaas', kind: 'loja', title: '+5 GB de mídias', orderId: 'o1', paidAt: now - 12 * DAY, by: 'Loja' });
  set('companies/c-15/storeOrders/o2', { itemId: 'arte', item: { name: 'Pacote de 10 artes', kind: 'service' }, value: 149.9, status: 'pending', billingType: null, createdAt: now - DAY, invoiceUrl: 'https://www.asaas.com/i/demonstracao' });
}
