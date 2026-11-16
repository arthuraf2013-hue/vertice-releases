import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { COMMENT_STATUS, commentLink, timeAgo, qrMatrix, qrPath, formatDateTime } from '@vertice/shared';
import { useSession } from '../session.jsx';
import { useCol, useDoc, useNow } from '../data/hooks.js';
import { api } from '../data/api.js';
import { siteBase } from '../data/site.js';
import {
  PageHeader, Button, Card, Loading, EmptyState, useToast, useConfirm, Toggle, Tabs, Select, IconButton,
} from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

/**
 * Comentários: moderação dos murais (app "Mural de comentários"). O público envia pelo QR Code
 * ou pelo link; aqui a equipe aprova, oculta ou apaga. Só os aprovados vão para a TV.
 */
export function Comments() {
  const { base, companyId, can } = useSession();
  const boards = useCol(`${base}/media`, { where: [['type', '==', 'app']] });
  const list = useMemo(() => (boards || []).filter((m) => m.app?.kind === 'comments').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [boards]);
  const [picked, setPicked] = useState(null);
  if (!boards) return <Loading />;
  const board = list.find((b) => b.id === picked) || list[0];
  return (
    <div className="vx-page">
      <PageHeader overline="CONTEÚDO" title="Comentários" subtitle="O que o público mandou pelos murais. Só o que você aprovar aparece nas telas." />
      {!board ? (
        <Card>
          <EmptyState icon="message" title="Nenhum mural ainda"
            action={can('editor') && <Link className="vx-btn vx-btn-primary" to="/aplicativos"><Icon name="plus" />Criar mural em Aplicativos</Link>}>
            Crie um "Mural de comentários" em Aplicativos e coloque numa playlist. A TV mostra o QR Code e os comentários aprovados.
          </EmptyState>
        </Card>
      ) : (
        <>
          {list.length > 1 && (
            <div className="vx-comments-pick">
              <Select label="Mural" value={board.id} onChange={(e) => setPicked(e.target.value)} options={list.map((b) => ({ value: b.id, label: b.name }))} />
            </div>
          )}
          <Board key={board.id} media={board} base={base} companyId={companyId} canEdit={can('editor')} />
        </>
      )}
    </div>
  );
}

function SmallQr({ text }) {
  const m = qrMatrix(text);
  if (!m) return null;
  const n = m.length + 8;
  return (
    <svg className="vx-comments-qr" viewBox={`-4 -4 ${n} ${n}`} shapeRendering="crispEdges" role="img" aria-label="QR Code do mural">
      <rect x="-4" y="-4" width={n} height={n} fill="#fff" />
      <path d={qrPath(m)} fill="#141b26" />
    </svg>
  );
}

function Board({ media, base, companyId, canEdit }) {
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const now = useNow();
  const boardDoc = useDoc(`${base}/commentBoards/${media.id}`);
  const comments = useCol(`${base}/commentBoards/${media.id}/comments`, { orderBy: ['createdAt', 'desc'], limit: 300 });
  const [tab, setTab] = useState('pending');
  const [busy, setBusy] = useState(false);
  const link = media.app?.config?.link || commentLink(siteBase(), companyId, media.id);
  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, hidden: 0 };
    for (const x of comments || []) c[x.status] = (c[x.status] || 0) + 1;
    return c;
  }, [comments]);
  const shown = (comments || []).filter((x) => x.status === tab);

  const setStatus = (ids, status) => api.batch(ids.map((id) => ({ op: 'update', path: `${base}/commentBoards/${media.id}/comments/${id}`, data: { status, moderatedAt: api.NOW } })));
  const act = async (fn, msg) => {
    setBusy(true);
    try { await fn(); if (msg) toast(msg); } catch { toast('Não foi possível salvar. Confira a internet.'); } finally { setBusy(false); }
  };
  const remove = async (c) => {
    const ok = await confirm({ title: 'Apagar este comentário?', message: 'Ele some da TV e do histórico. Use também quando alguém pedir a exclusão.', confirmLabel: 'Apagar', danger: true });
    if (ok) act(() => api.remove(`${base}/commentBoards/${media.id}/comments/${c.id}`), 'Comentário apagado.');
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast('Link copiado.'); } catch { toast(link); }
  };
  const open = boardDoc ? boardDoc.open !== false : true;

  return (
    <div className="vx-comments">
      <Card title={media.name} icon="message"
        actions={canEdit && <Link className="vx-btn vx-btn-sm" to="/aplicativos"><Icon name="edit" />Configurar</Link>}>
        <div className="vx-comments-board">
          <SmallQr text={link} />
          <div className="vx-comments-board-text">
            <p className="vx-comments-question">{media.app?.config?.question}</p>
            <div className="vx-comments-link">
              <code>{link}</code>
              <IconButton icon="copy" label="Copiar link" onClick={copy} />
              <a className="vx-icon-btn" href={link} target="_blank" rel="noreferrer" aria-label="Abrir a página do mural"><Icon name="link" /></a>
            </div>
            <p className="vx-help">O QR Code aparece na TV junto com os comentários. Também dá para imprimir este ou mandar o link no WhatsApp e no Instagram.</p>
            {canEdit && (
              <Toggle label="Recebendo comentários" help={open ? 'O público consegue enviar agora.' : 'Fechado: a página mostra "Mural fechado".'}
                checked={open} onChange={(v) => act(() => api.update(`${base}/commentBoards/${media.id}`, { open: v, updatedAt: api.NOW }), v ? 'Mural aberto.' : 'Mural fechado.')} />
            )}
            {media.app?.config?.autoApprove && <p className="vx-help vx-help-warn"><Icon name="alert" />Aprovação automática ligada: os comentários vão direto para a TV (menos os com palavras bloqueadas).</p>}
          </div>
        </div>
      </Card>

      <Card pad={false}>
        <div className="vx-comments-bar">
          <Tabs value={tab} onChange={setTab} tabs={['pending', 'approved', 'hidden'].map((id) => ({ id, label: { pending: 'Aguardando', approved: 'Aprovados', hidden: 'Ocultos' }[id], count: counts[id] }))} />
          {canEdit && tab === 'pending' && counts.pending > 1 && (
            <Button size="sm" icon="check" loading={busy} onClick={() => act(() => setStatus(shown.map((x) => x.id), 'approved'), `${shown.length} comentários aprovados.`)}>Aprovar todos</Button>
          )}
        </div>
        {!comments ? <Loading /> : shown.length === 0 ? (
          <EmptyState icon="message" title={{ pending: 'Nada esperando aprovação', approved: 'Nenhum comentário aprovado', hidden: 'Nenhum comentário oculto' }[tab]}>
            {tab === 'pending' ? 'Os comentários novos aparecem aqui assim que chegam.' : null}
          </EmptyState>
        ) : (
          <ul className="vx-comments-list">
            {shown.map((c) => (
              <li key={c.id} className="vx-comment">
                <div className="vx-comment-text">
                  <p>{c.text}</p>
                  <span className="vx-faint">
                    <b>{c.name || 'Sem nome'}</b> · <time title={c.createdAt ? formatDateTime(c.createdAt) : ''}>{timeAgo(c.createdAt, now)}</time>
                    {c.status !== 'pending' && c.moderatedAt ? ` · ${COMMENT_STATUS[c.status].toLowerCase()} ${timeAgo(c.moderatedAt, now)}` : ''}
                  </span>
                </div>
                {canEdit && (
                  <div className="vx-row-actions">
                    {c.status !== 'approved' && <Button size="sm" variant="primary" icon="check" disabled={busy} onClick={() => act(() => setStatus([c.id], 'approved'), 'Aprovado. Já vai para as telas.')}>Aprovar</Button>}
                    {c.status !== 'hidden' && <Button size="sm" icon="eye" disabled={busy} onClick={() => act(() => setStatus([c.id], 'hidden'), 'Comentário ocultado.')}>Ocultar</Button>}
                    {c.status === 'hidden' && <Button size="sm" disabled={busy} onClick={() => act(() => setStatus([c.id], 'pending'))}>Voltar para aguardando</Button>}
                    <IconButton icon="trash" label="Apagar comentário" variant="danger" disabled={busy} onClick={() => remove(c)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {confirmDialog}
    </div>
  );
}
