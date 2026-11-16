import { describe, it, expect } from 'vitest';
import {
  blockPattern, blockedWordList, hasBlockedWord, cleanComment, firstName, nextLimit, commentLink, commentsForTv,
  commentPage, NEVER_MATCH, COMMENT_LIMITS,
} from './comments.js';

describe('mural de comentários', () => {
  it('palavras bloqueadas viram a expressão que as regras do Firestore conferem', () => {
    expect(blockedWordList('Feio, BOBO\nfeio\n;x')).toEqual(['feio', 'bobo']);
    expect(blockPattern('')).toBe(NEVER_MATCH);
    const p = blockPattern('feio, a.b');
    expect(p).toBe('(?s).*(feio|a\\.b).*');
    // Mesma semântica de string.matches() nas regras: casa o texto inteiro.
    const re = new RegExp(`^${p.replace('(?s)', '')}$`, 's');
    expect(re.test('que atendimento feio')).toBe(true);
    expect(re.test('linha 1\nfeio')).toBe(true);
    expect(re.test('aXb')).toBe(false);
    expect(hasBlockedWord('Muito FEIO', 'feio')).toBe(true);
    expect(hasBlockedWord('bonito', ['feio'])).toBe(false);
  });
  it('limpa e corta o que vai para o banco', () => {
    const c = cleanComment({ name: '  Ana   Maria  ', text: `oi\n\ntudo\tbem ${'x'.repeat(300)}` });
    expect(c.name).toBe('Ana Maria');
    expect(c.text.startsWith('oi tudo bem')).toBe(true);
    expect(c.text.length).toBe(COMMENT_LIMITS.text);
    expect(firstName('ana maria souza')).toBe('Ana');
    expect(firstName('')).toBe('');
  });
  it('limite: 3 envios por janela de 10 minutos', () => {
    const t = 1_000_000_000;
    expect(nextLimit(null, t)).toEqual({ allowed: true, reset: true, waitMin: 0 });
    expect(nextLimit({ windowStart: t, count: 2 }, t + 60_000)).toMatchObject({ allowed: true, reset: false });
    expect(nextLimit({ windowStart: t, count: 3 }, t + 60_000)).toEqual({ allowed: false, reset: false, waitMin: 9 });
    expect(nextLimit({ windowStart: t, count: 3 }, t + 10 * 60_000)).toMatchObject({ allowed: true, reset: true });
  });
  it('link e o que a TV mostra', () => {
    expect(commentLink('https://x.com', 'emp 1', 'm1')).toBe('https://x.com/comentar?e=emp%201&m=m1');
    const tv = commentsForTv([
      { id: 'a', status: 'approved', name: 'ana souza', text: 'velho', createdAt: 1 },
      { id: 'b', status: 'pending', name: 'b', text: 'esperando', createdAt: 3 },
      { id: 'c', status: 'approved', name: '', text: 'novo', createdAt: 2 },
      { id: 'd', status: 'hidden', name: 'd', text: 'oculto', createdAt: 4 },
    ]);
    expect(tv.map((x) => x.id)).toEqual(['c', 'a']);
    expect(tv[1].name).toBe('Ana');
  });
  it('rodízio em páginas', () => {
    const list = [1, 2, 3, 4, 5].map((id) => ({ id }));
    expect(commentPage(list, 2, 10, 0).map((x) => x.id)).toEqual([1, 2]);
    expect(commentPage(list, 2, 10, 10_000).map((x) => x.id)).toEqual([3, 4]);
    expect(commentPage(list, 2, 10, 20_000).map((x) => x.id)).toEqual([5]);
    expect(commentPage(list, 2, 10, 30_000).map((x) => x.id)).toEqual([1, 2]);
    expect(commentPage(list.slice(0, 2), 3, 10, 99_000)).toHaveLength(2);
  });
});
