/**
 * ESTÚDIO: peças prontas a partir de modelos. A peça é um aplicativo "studio"
 * (`media/{id}` com `app: { kind: 'studio', config }`) e é desenhada ao vivo na TV,
 * então dá para mudar um preço ou uma data sem refazer arte.
 *
 * Cada campo: [chave, rótulo, tipo, padrão, limite]. Tipos: text, area, money, lines, icon.
 */
export const STUDIO_ICONS = { info: 'Informação', clock: 'Relógio', alert: 'Atenção', heart: 'Coração', star: 'Estrela', gift: 'Presente' };

export const STUDIO_TEMPLATES = {
  offer: {
    label: 'Oferta',
    desc: 'Produto, preço "de/por" e um selo. Com ou sem foto.',
    image: true,
    fields: [
      ['badge', 'Selo', 'text', 'OFERTA', 16],
      ['product', 'Produto', 'text', 'Bolo de rolo', 40],
      ['detail', 'Detalhe', 'text', 'Fatia generosa, feito hoje', 60],
      ['oldPrice', 'Preço "de" (R$)', 'money', '42,00'],
      ['price', 'Preço "por" (R$)', 'money', '38,00'],
      ['unit', 'Unidade', 'text', 'kg', 10],
      ['footnote', 'Rodapé', 'text', 'Válido enquanto durar o estoque', 60],
    ],
  },
  notice: {
    label: 'Aviso',
    desc: 'Um recado claro, com ícone. Horários, regras, mudanças.',
    image: false,
    fields: [
      ['icon', 'Ícone', 'icon', 'clock'],
      ['overline', 'Chamada', 'text', 'NOVO HORÁRIO', 24],
      ['title', 'Título', 'text', 'Abrimos aos domingos', 50],
      ['text', 'Texto', 'area', 'A partir de 15/11, das 7h às 13h.', 160],
    ],
  },
  menu: {
    label: 'Cardápio do dia',
    desc: 'Pratos ou combos do dia, um por linha: "Nome | preço".',
    image: true,
    fields: [
      ['overline', 'Chamada', 'text', 'HOJE', 20],
      ['title', 'Título', 'text', 'Prato do dia', 40],
      ['lines', 'Itens (um por linha: Nome | preço)', 'lines', 'Galinha à cabidela | 32,90\nPeixe ao molho de coco | 36,90\nFeijoada (só sábado) | 39,90', 8],
      ['footnote', 'Rodapé', 'text', 'Acompanha arroz, feijão e salada', 60],
    ],
  },
  welcome: {
    label: 'Boas-vindas',
    desc: 'Recepção de clientes ou visitantes, com logo ou foto.',
    image: true,
    fields: [
      ['overline', 'Saudação', 'text', 'SEJA BEM-VINDO', 30],
      ['title', 'Nome', 'text', 'Padaria Boa Massa', 40],
      ['text', 'Texto', 'area', 'Desde 1998 fazendo o pão do seu bairro.', 120],
    ],
  },
  event: {
    label: 'Evento',
    desc: 'Data, hora e local em destaque. Promoções, shows, cursos.',
    image: true,
    fields: [
      ['overline', 'Chamada', 'text', 'NÃO PERCA', 24],
      ['title', 'Título', 'text', 'Festival do cuscuz', 50],
      ['date', 'Data', 'text', '22 de novembro', 30],
      ['time', 'Horário', 'text', '17h às 21h', 30],
      ['place', 'Local', 'text', 'No salão da loja', 40],
    ],
  },
};

/** Campos com os padrões do modelo (o que o usuário não mexeu fica com o exemplo). */
export function studioFields(template, fields = {}) {
  const t = STUDIO_TEMPLATES[template] || STUDIO_TEMPLATES.offer;
  const out = {};
  for (const [key, , , def] of t.fields) out[key] = fields?.[key] ?? def;
  return out;
}

/** "Nome | 32,90" → [{ name, price }]. */
export function studioLines(text = '', max = 8) {
  return String(text)
    .split('\n')
    .map((l) => l.split('|'))
    .map(([name, price]) => ({ name: (name || '').trim(), price: (price || '').trim() }))
    .filter((l) => l.name)
    .slice(0, max);
}

/** Cores da peça: as escolhidas pelo usuário por cima do tema. */
export function studioColors(theme, colors) {
  return { ...theme, ...(colors || {}) };
}
