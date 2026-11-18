import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { COMMENT_STATUS, commentLink, timeAgo, qrMatrix, qrPath, formatDateTime, pollResults, pollOptions, voteLink, surveyReport, surveyLink, npsZone, toCsv } from '@vertice/shared';
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
  const list = useMemo(() => (boards || []).filter((m) => m.app?.kind === 'comments' || m.app?.kind === 'photowall').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [boards]);
  const polls = useMemo(() => (boards || []).filter((m) => m.app?.kind === 'poll'), [boards]);
  const surveys = useMemo(() => (boards || []).filter((m) => m.app?.kind === 'survey'), [boards]);
  const [picked, setPicked] = useState(null);
  const [view, setView] = useState('murais');
  if (!boards) return <Loading />;
  const board = list.find((b) => b.id === picked) || list[0];
  return (
    <div className="vx-page">
      <PageHeader overline="CONTEÚDO" title="Interação" subtitle="Comentários, fotos e votos do público. Só o que você aprovar aparece nas telas." />
      {(polls.length > 0 || surveys.length > 0) && (
        <Tabs value={view} onChange={setView} tabs={[
          { id: 'murais', label: 'Murais', count: list.length },
          ...(polls.length ? [{ id: 'enquetes', label: 'Enquetes', count: polls.length }] : []),
          ...(surveys.length ? [{ id: 'pesquisas', label: 'Pesquisas', count: surveys.length }] : []),
        ]} />
      )}
      {view === 'pesquisas' && surveys.length > 0 ? <Surveys surveys={surveys} base={base} companyId={companyId} canEdit={can('editor')} />
        : view === 'enquetes' && polls.length > 0 ? <Polls polls={polls} base={base} companyId={companyId} canEdit={can('editor')} /> : !board ? (
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
      <path d={qrPath(m)} fill="#060b1c" />
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
    if (!ok) return;
    const file = /\/m\/[^/]+\/([^/?#]+)$/.exec(c.photo || '')?.[1];
    act(async () => {
      await api.remove(`${base}/commentBoards/${media.id}/comments/${c.id}`);
      if (file) await api.deleteFile(`${base}/media/${file}`).catch(() => {});
    }, c.photo ? 'Foto apagada.' : 'Comentário apagado.');
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
                {c.photo && <a href={c.photo} target="_blank" rel="noreferrer" className="vx-comment-photo"><img src={c.photo} alt={`Foto de ${c.name || 'visitante'}`} loading="lazy" /></a>}
                <div className="vx-comment-text">
                  {c.text ? <p>{c.text}</p> : c.photo ? <p className="vx-faint">Foto sem legenda</p> : null}
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

/** Enquetes: resultado ao vivo, abrir/fechar e zerar os votos. */
function Polls({ polls, base, companyId, canEdit }) {
  return <div className="vx-polls">{polls.map((p) => <PollCard key={p.id} media={p} base={base} companyId={companyId} canEdit={canEdit} />)}</div>;
}

function PollCard({ media, base, companyId, canEdit }) {
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const poll = useDoc(`${base}/polls/${media.id}`);
  const tally = useDoc(`${base}/pollTallies/${media.id}`);
  const c = media.app?.config || {};
  const options = pollOptions(poll?.options || c.options);
  const r = pollResults(options, tally);
  const link = c.link || voteLink(siteBase(), companyId, media.id);
  const open = poll ? poll.open !== false : true;
  const reset = async () => {
    if (!(await confirm({ title: 'Zerar os votos?', message: 'A votação recomeça do zero e todo mundo pode votar de novo.', confirmLabel: 'Zerar', danger: true }))) return;
    const round = (Number(poll?.round) || 0) + 1;
    await api.batch([
      { op: 'update', path: `${base}/polls/${media.id}`, data: { round, updatedAt: api.NOW } },
      { op: 'set', path: `${base}/pollTallies/${media.id}`, data: { round, counts: {}, total: 0 } },
    ]);
    toast('Votos zerados.');
  };
  return (
    <Card title={media.name} icon="chart" actions={canEdit && <Button size="sm" icon="sync" onClick={reset}>Zerar votos</Button>}>
      <div className="vx-comments-board">
        <SmallQr text={link} />
        <div className="vx-comments-board-text">
          <p className="vx-comments-question">{poll?.question || c.question}</p>
          <div className="vx-poll-admin">
            {r.rows.map((row, i) => (
              <div key={i} className={`vx-poll-admin-row ${row.leader ? 'is-leader' : ''}`}>
                <span>{row.label}</span><b className="vx-num">{row.votes} · {row.pct}%</b>
                <i style={{ width: `${row.pct}%` }} />
              </div>
            ))}
            <span className="vx-faint">{r.total} {r.total === 1 ? 'voto' : 'votos'} nesta rodada</span>
          </div>
          <div className="vx-comments-link"><code>{link}</code><a className="vx-icon-btn" href={link} target="_blank" rel="noreferrer" aria-label="Abrir a página de votação"><Icon name="link" /></a></div>
          {canEdit && <Toggle label="Recebendo votos" checked={open} onChange={(v) => api.update(`${base}/polls/${media.id}`, { open: v, updatedAt: api.NOW }).then(() => toast(v ? 'Votação aberta.' : 'Votação encerrada.'))} />}
        </div>
      </div>
      {confirmDialog}
    </Card>
  );
}

/* ---------------- Pesquisas de satisfação ---------------- */

function Surveys({ surveys, base, companyId, canEdit }) {
  const [picked, setPicked] = useState(null);
  const m = surveys.find((x) => x.id === picked) || surveys[0];
  return (
    <>
      {surveys.length > 1 && (
        <div className="vx-comments-pick">
          <Select label="Pesquisa" value={m.id} onChange={(e) => setPicked(e.target.value)} options={surveys.map((x) => ({ value: x.id, label: x.name }))} />
        </div>
      )}
      <SurveyReport key={m.id} media={m} base={base} companyId={companyId} canEdit={canEdit} />
    </>
  );
}

const TONE_CLASS = { good: 'online', warn: 'warn', bad: 'offline', muted: 'muted' };

function SurveyReport({ media, base, companyId, canEdit }) {
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const survey = useDoc(`${base}/surveys/${media.id}`);
  const all = useCol(`${base}/surveys/${media.id}/responses`, { orderBy: ['at', 'desc'], limit: 2000 });
  if (!survey || !all) return <Loading />;
  const round = Number(survey.round) || 0;
  const responses = all.filter((r) => String(r.id).startsWith(`${round}_`));
  const rep = surveyReport(survey.questions || [], responses);
  const c = media.app?.config || {};
  const link = c.link || surveyLink(siteBase(), companyId, media.id);
  const open = survey.open !== false;
  const exportCsv = () => {
    const qs = survey.questions || [];
    const fmt = (q, v) => (v == null ? '' : q.type === 'choice' ? q.options?.[v] ?? '' : v);
    const csv = toCsv(responses, [
      { label: 'Data', value: (r) => (r.at ? formatDateTime(r.at) : '') },
      ...qs.map((q, i) => ({ label: q.text, value: (r) => fmt(q, r.answers?.[`q${i}`]) })),
    ]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${media.name.replace(/[^\w\s-]/g, '').trim() || 'pesquisa'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const restart = async () => {
    if (!(await confirm({ title: 'Começar uma rodada nova?', message: 'O relatório recomeça do zero e todos podem responder de novo. As respostas antigas continuam guardadas.', confirmLabel: 'Começar de novo' }))) return;
    await api.update(`${base}/surveys/${media.id}`, { round: round + 1, updatedAt: api.NOW });
    toast('Rodada nova aberta.');
  };
  return (
    <>
      <Card title={media.name} icon="clipboard" actions={(
        <div className="vx-row-actions">
          <Button size="sm" icon="download" onClick={exportCsv} disabled={!responses.length}>Planilha (CSV)</Button>
          {canEdit && <Button size="sm" icon="sync" onClick={restart}>Rodada nova</Button>}
        </div>
      )}>
        <div className="vx-comments-board">
          <SmallQr text={link} />
          <div className="vx-comments-board-text">
            <p className="vx-comments-question">{rep.total} {rep.total === 1 ? 'resposta' : 'respostas'} nesta rodada</p>
            <div className="vx-comments-link"><code>{link}</code><a className="vx-icon-btn" href={link} target="_blank" rel="noreferrer" aria-label="Abrir a pesquisa"><Icon name="link" /></a></div>
            {canEdit && <Toggle label="Recebendo respostas" checked={open} onChange={(v) => api.update(`${base}/surveys/${media.id}`, { open: v, updatedAt: api.NOW }).then(() => toast(v ? 'Pesquisa aberta.' : 'Pesquisa encerrada.'))} />}
          </div>
        </div>
      </Card>
      <div className="vx-survey-grid">
        {rep.questions.map((q, i) => (
          <Card key={i} title={`${i + 1}. ${q.text}`} className="vx-survey-card">
            {q.type === 'nps' && (() => {
              const z = npsZone(q.nps);
              return (
                <div className="vx-nps">
                  <div className="vx-nps-score"><b className="vx-num">{q.nps ?? '—'}</b><span className={`vx-chip vx-chip-${TONE_CLASS[z.tone]}`}>NPS · {z.label}</span></div>
                  <div className="vx-nps-bar" aria-hidden>
                    <i className="is-bad" style={{ flex: q.detractors }} /><i className="is-mid" style={{ flex: q.passives }} /><i className="is-good" style={{ flex: q.promoters }} />
                  </div>
                  <div className="vx-nps-legend vx-faint">
                    <span>Detratores (0–6): {q.detractors}</span><span>Neutros (7–8): {q.passives}</span><span>Promotores (9–10): {q.promoters}</span>
                  </div>
                  {q.avg != null && <span className="vx-faint">Nota média: {String(q.avg).replace('.', ',')}</span>}
                </div>
              );
            })()}
            {q.type === 'stars' && (
              <div className="vx-poll-admin">
                <p className="vx-comments-question">{q.avg != null ? `${String(q.avg).replace('.', ',')} de 5 estrelas` : 'Sem respostas'}</p>
                {[5, 4, 3, 2, 1].map((s) => {
                  const n = q.dist[s - 1];
                  const pct = q.answered ? Math.round((n * 100) / q.answered) : 0;
                  return <div key={s} className="vx-poll-admin-row"><span>{'★'.repeat(s)}</span><b className="vx-num">{n} · {pct}%</b><i style={{ width: `${pct}%` }} /></div>;
                })}
              </div>
            )}
            {q.type === 'choice' && (
              <div className="vx-poll-admin">
                {q.options.map((o, k) => <div key={k} className="vx-poll-admin-row"><span>{o}</span><b className="vx-num">{q.counts[k]} · {q.pcts[k]}%</b><i style={{ width: `${q.pcts[k]}%` }} /></div>)}
              </div>
            )}
            {q.type === 'text' && (
              q.texts.length ? (
                <ul className="vx-survey-texts">
                  {q.texts.slice(0, 50).map((t, k) => <li key={k}><span>{t.text}</span>{t.at && <small className="vx-faint">{timeAgo(t.at)}</small>}</li>)}
                </ul>
              ) : <p className="vx-faint">Nenhum comentário ainda.</p>
            )}
            <span className="vx-faint">{q.answered} {q.answered === 1 ? 'resposta' : 'respostas'}</span>
          </Card>
        ))}
      </div>
      {confirmDialog}
    </>
  );
}
