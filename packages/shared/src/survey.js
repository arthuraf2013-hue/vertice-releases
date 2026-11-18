/**
 * Pesquisa de satisfação: várias perguntas (nota 0 a 10, estrelas, múltipla escolha e texto),
 * respondida pelo QR Code na página pública. Uma resposta por aparelho e por rodada.
 * Respostas em companies/{cid}/surveys/{sid}/responses/{rodada}_{uid} = { answers: { q0, q1… }, at }.
 */
export const SURVEY_LIMITS = { questions: 8, text: 140, option: 40, options: 6, answer: 500 };
export const SURVEY_TYPES = { nps: 'Nota de 0 a 10', stars: 'Estrelas (1 a 5)', choice: 'Múltipla escolha', text: 'Texto livre' };

export function normalizeSurveyQuestions(list = []) {
  return (Array.isArray(list) ? list : [])
    .map((q) => ({
      type: SURVEY_TYPES[q?.type] ? q.type : 'stars',
      text: String(q?.text || '').trim().slice(0, SURVEY_LIMITS.text),
      ...(q?.type === 'choice' ? { options: (q.options || []).map((o) => String(o).trim().slice(0, SURVEY_LIMITS.option)).filter(Boolean).slice(0, SURVEY_LIMITS.options) } : {}),
    }))
    .filter((q) => q.text && (q.type !== 'choice' || q.options.length >= 2))
    .slice(0, SURVEY_LIMITS.questions);
}

export function surveyLink(base, companyId, surveyId) {
  if (!base || !companyId || !surveyId) return '';
  return `${String(base).replace(/\/$/, '')}/pesquisa?e=${encodeURIComponent(companyId)}&m=${encodeURIComponent(surveyId)}`;
}

/** Resposta válida para a pergunta (o mesmo que as regras conferem). */
export function validAnswer(q, v) {
  if (v == null || v === '') return false;
  if (q.type === 'nps') return Number.isInteger(v) && v >= 0 && v <= 10;
  if (q.type === 'stars') return Number.isInteger(v) && v >= 1 && v <= 5;
  if (q.type === 'choice') return Number.isInteger(v) && v >= 0 && v < (q.options || []).length;
  return typeof v === 'string' && v.trim().length > 0 && v.length <= SURVEY_LIMITS.answer;
}

/** Respostas → relatório por pergunta: NPS, média de estrelas, contagem por opção e textos. */
export function surveyReport(questions = [], responses = []) {
  return {
    total: responses.length,
    questions: questions.map((q, i) => {
      const vals = responses.map((r) => r.answers?.[`q${i}`]).filter((v) => validAnswer(q, v));
      const base = { type: q.type, text: q.text, answered: vals.length };
      if (q.type === 'nps') {
        const promoters = vals.filter((v) => v >= 9).length;
        const detractors = vals.filter((v) => v <= 6).length;
        return { ...base, promoters, passives: vals.length - promoters - detractors, detractors, nps: vals.length ? Math.round(((promoters - detractors) / vals.length) * 100) : null, avg: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null };
      }
      if (q.type === 'stars') {
        const dist = [1, 2, 3, 4, 5].map((s) => vals.filter((v) => v === s).length);
        return { ...base, dist, avg: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null };
      }
      if (q.type === 'choice') {
        const counts = (q.options || []).map((_, k) => vals.filter((v) => v === k).length);
        return { ...base, options: q.options, counts, pcts: counts.map((n) => (vals.length ? Math.round((n * 100) / vals.length) : 0)) };
      }
      const texts = responses.map((r) => ({ text: r.answers?.[`q${i}`], at: r.at })).filter((x) => validAnswer(q, x.text));
      return { ...base, texts };
    }),
  };
}

/** Faixa do NPS (como o mercado lê). */
export function npsZone(nps) {
  if (nps == null) return { label: 'Sem respostas', tone: 'muted' };
  if (nps >= 75) return { label: 'Excelência', tone: 'good' };
  if (nps >= 50) return { label: 'Qualidade', tone: 'good' };
  if (nps >= 0) return { label: 'Aperfeiçoamento', tone: 'warn' };
  return { label: 'Crítico', tone: 'bad' };
}
