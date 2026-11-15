// Licença do Vértice: teste grátis, mensalidade em dia, tolerância e bloqueio.
// A mesma conta é feita nas regras do Firestore (função licensed): se mudar aqui, mude lá.
//
// Campos na empresa (companies/{id}):
//   status       'trial' | 'active' | 'suspended' | 'canceled'   (sem campo = 'active', contas antigas)
//   trialEndsAt  fim do teste grátis (status 'trial')
//   paidUntil    pago até (status 'active'; sem campo = sem vencimento, ex.: cortesia)
//   graceDays    dias de tolerância depois do vencimento (padrão 5)

export const LICENSE_STATUS = ['trial', 'active', 'suspended', 'canceled'];
export const LICENSE_LABEL = { trial: 'Teste grátis', active: 'Ativo', suspended: 'Suspenso', canceled: 'Cancelado' };
export const DEFAULT_TRIAL_DAYS = 14;
export const DEFAULT_GRACE_DAYS = 5;
const DAY = 24 * 60 * 60 * 1000;

/** Aceita número (ms), Date, Timestamp do Firestore ou { seconds }. */
export function toMillis(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000 + Math.round((v.nanoseconds || 0) / 1e6);
  const n = Date.parse(v);
  return Number.isNaN(n) ? null : n;
}

const daysBetween = (from, to) => Math.ceil((to - from) / DAY);

/**
 * Situação da licença.
 * blocked: as TVs param e o painel não publica. warn: mostrar aviso (vence logo, teste acabando, em tolerância).
 */
export function licenseState(company, now = Date.now()) {
  if (!company) return { status: 'active', blocked: false, warn: false, tone: 'online', title: '', text: '' };
  const status = company.status || 'active';
  const grace = Number.isFinite(company.graceDays) ? company.graceDays : DEFAULT_GRACE_DAYS;

  if (status === 'suspended' || status === 'canceled') {
    return {
      status, blocked: true, warn: true, tone: 'offline',
      title: status === 'suspended' ? 'Assinatura suspensa' : 'Assinatura cancelada',
      text: 'As telas estão paradas e as mudanças não chegam a elas. Fale com a Vetta Sistemas para reativar.',
    };
  }
  if (status === 'trial') {
    const end = toMillis(company.trialEndsAt);
    if (!end || end <= now) {
      return { status, blocked: true, warn: true, tone: 'offline', endsAt: end, daysLeft: 0, title: 'O teste grátis terminou', text: 'As telas estão paradas. Contrate um plano para continuar de onde parou: nada foi apagado.' };
    }
    const daysLeft = daysBetween(now, end);
    return {
      status, blocked: false, warn: daysLeft <= 3, tone: daysLeft <= 3 ? 'warn' : 'sync', endsAt: end, daysLeft,
      title: `Teste grátis: ${daysLeft === 1 ? 'último dia' : `${daysLeft} dias restantes`}`,
      text: 'Tudo liberado durante o teste. Para continuar depois, contrate um plano com a Vetta Sistemas.',
    };
  }
  // active
  const paid = toMillis(company.paidUntil);
  if (!paid) return { status, blocked: false, warn: false, tone: 'online', title: 'Assinatura ativa', text: '' };
  const blockAt = paid + grace * DAY;
  if (now >= blockAt) {
    return { status, blocked: true, warn: true, tone: 'offline', endsAt: paid, overdue: true, daysLeft: 0, title: 'Mensalidade em atraso', text: 'As telas estão paradas até a confirmação do pagamento. Fale com a Vetta Sistemas.' };
  }
  if (now >= paid) {
    const left = daysBetween(now, blockAt);
    return { status, blocked: false, warn: true, tone: 'warn', endsAt: paid, overdue: true, daysLeft: left, title: 'Mensalidade vencida', text: `As telas param em ${left === 1 ? '1 dia' : `${left} dias`} se o pagamento não for confirmado.` };
  }
  const daysLeft = daysBetween(now, paid);
  return {
    status, blocked: false, warn: daysLeft <= 5, tone: daysLeft <= 5 ? 'warn' : 'online', endsAt: paid, daysLeft,
    title: daysLeft <= 5 ? `Mensalidade vence em ${daysLeft === 1 ? '1 dia' : `${daysLeft} dias`}` : 'Assinatura ativa',
    text: daysLeft <= 5 ? 'Se já pagou, desconsidere. A confirmação pode levar até 1 dia útil.' : '',
  };
}

/** Novo "pago até": um mês depois do vencimento atual (ou de hoje, se já venceu há mais tempo). */
export function nextPaidUntil(company, months = 1, now = Date.now()) {
  const current = toMillis(company?.paidUntil);
  const from = current && current > now - 31 * DAY ? current : now;
  const d = new Date(from);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) d.setDate(0); // 31/01 + 1 mês = 28 ou 29/02
  return d.getTime();
}
