import { useState } from 'react';
import { STORE_DEFAULTS, STORE_KINDS, STORE_ORDER_STATUS, normalizeStore, storePrice, formatMoney, formatDateTime, licenseState } from '@vertice/shared';
import { useSession } from '../session.jsx';
import { useCol, useDoc } from '../data/hooks.js';
import { api, isDemo } from '../data/api.js';
import { PageHeader, Card, Button, Chip, Modal, Input, Select, Toggle, Loading, Table, useToast } from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

const brl = (v) => `R$ ${formatMoney(v)}`;
const dateBr = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

/**
 * Loja: renovar a assinatura (mensal, semestral, anual), comprar espaço e serviços.
 * O pagamento é pelo Asaas: o cliente escolhe Pix, boleto ou cartão na fatura e, confirmado,
 * a assinatura renova sozinha.
 */
export function Store() {
  const { companyId, base, company, can } = useSession();
  const toast = useToast();
  const platform = useDoc('platform/store');
  const orders = useCol(can('admin') ? `${base}/storeOrders` : null, { orderBy: ['createdAt', 'desc'], limit: 30 });
  const [buying, setBuying] = useState(null);
  if (platform === undefined) return <Loading />;
  const items = normalizeStore(platform?.items?.length ? platform.items : STORE_DEFAULTS);
  const lic = licenseState(company);
  const groups = Object.keys(STORE_KINDS).map((k) => [k, items.filter((it) => it.kind === k)]).filter(([, l]) => l.length);
  const promos = items.filter((it) => storePrice(it).oldPrice);

  return (
    <div className="vx-page">
      <PageHeader overline="GESTÃO" title="Loja" subtitle="Renove a assinatura, amplie o espaço e contrate serviços. Pague com Pix, boleto ou cartão." />

      <div className="vx-store-top">
        <Card><span className="vx-faint">Situação</span><b>{lic.title || 'Assinatura ativa'}</b>{lic.endsAt && <span className="vx-faint">{lic.status === 'trial' ? 'Teste até' : 'Pago até'} {new Date(lic.endsAt).toLocaleDateString('pt-BR')}</span>}</Card>
        <Card><span className="vx-faint">Telas no plano</span><b className="vx-num">{company?.screenLimit ?? '—'}</b></Card>
        <Card><span className="vx-faint">Espaço</span><b className="vx-num">{company?.storageQuotaMB ? `${Math.round(company.storageQuotaMB / 1024)} GB` : '—'}</b></Card>
      </div>

      {promos.length > 0 && (
        <Card title="Promoções" icon="tag" className="vx-store-promo">
          <div className="vx-store-promos">
            {promos.map((it) => {
              const p = storePrice(it);
              return (
                <button key={it.id} type="button" className="vx-store-promo-item" onClick={() => can('admin') && setBuying(it)} disabled={!can('admin')}>
                  <b>{it.name} por {brl(p.price)}</b>
                  {p.promoUntil && <span className="vx-faint">até {dateBr(p.promoUntil)}</span>}
                  <Icon name="arrowRight" />
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {groups.map(([kind, list]) => (
        <Card key={kind} title={STORE_KINDS[kind]} icon={kind === 'months' ? 'key' : kind === 'storage' ? 'storage' : 'users'}>
          <div className="vx-store-grid">
            {list.map((it) => {
              const p = storePrice(it);
              return (
                <div key={it.id} className={`vx-store-item ${p.oldPrice ? 'is-promo' : ''}`}>
                  {p.oldPrice && <Chip tone="warn">Promoção{p.promoUntil ? ` até ${dateBr(p.promoUntil)}` : ''}</Chip>}
                  <b className="vx-store-name">{it.name}</b>
                  <p className="vx-faint">{it.desc}</p>
                  <div className="vx-store-price">
                    {p.oldPrice && <s className="vx-faint">{brl(p.oldPrice)}</s>}
                    <b className="vx-num">{brl(p.price)}</b>
                    {it.kind === 'months' && it.months > 1 && <span className="vx-faint">equivale a {brl(p.price / it.months)} por mês</span>}
                  </div>
                  {can('admin') ? <Button variant="primary" size="sm" icon="cart" onClick={() => setBuying(it)}>Comprar</Button> : <span className="vx-faint">Só o administrador compra.</span>}
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      {can('admin') && (
        <Card title="Pedidos" icon="receipt">
          {!orders ? <Loading /> : (
            <Table rows={orders} empty={<p className="vx-faint">Nenhum pedido ainda.</p>} columns={[
              { key: 'd', label: 'Data', render: (o) => (o.createdAt ? formatDateTime(o.createdAt) : '—') },
              { key: 'i', label: 'Item', render: (o) => o.item?.name || o.itemId },
              { key: 'v', label: 'Valor', render: (o) => <span className="vx-num">{brl(o.value || 0)}</span> },
              { key: 's', label: 'Situação', render: (o) => <Chip tone={o.status === 'paid' ? 'online' : o.status === 'pending' ? 'warn' : 'offline'}>{STORE_ORDER_STATUS[o.status] || o.status}</Chip> },
              { key: 'l', label: '', render: (o) => (o.status === 'pending' && o.invoiceUrl ? <a className="vx-link" href={o.invoiceUrl} target="_blank" rel="noreferrer">Pagar<Icon name="arrowRight" /></a> : null) },
            ]} />
          )}
          <p className="vx-help">O pagamento confirma sozinho: Pix em minutos, cartão na hora e boleto em até 3 dias úteis. A assinatura renova assim que confirmar.</p>
        </Card>
      )}

      {buying && <Checkout item={buying} company={company} onClose={() => setBuying(null)} onDone={(r) => {
        setBuying(null);
        if (r.invoiceUrl) { window.open(r.invoiceUrl, '_blank', 'noopener'); toast('Fatura aberta numa nova aba. Assim que o pagamento confirmar, aplicamos aqui.'); }
        else toast(isDemo ? 'Pedido de demonstração criado (sem cobrança de verdade).' : 'Pedido criado.');
      }} companyId={companyId} />}
    </div>
  );
}

function Checkout({ item, company, companyId, onClose, onDone }) {
  const [f, setF] = useState({ name: company?.legalName || company?.name || '', cpfCnpj: company?.cnpj || '', email: company?.ownerEmail || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const p = storePrice(item);
  const submit = async () => {
    setBusy(true); setError('');
    try {
      onDone(await api.storeCheckout(companyId, { itemId: item.id, itemName: item.name, value: p.price, ...f }));
    } catch (e) { setError(e.message || 'Não foi possível gerar a cobrança.'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} width={560} icon="cart" title={item.name} subtitle={`${brl(p.price)}${item.kind === 'months' ? ` · ${item.months} ${item.months === 1 ? 'mês' : 'meses'}` : ''}`}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!f.name.trim() || f.cpfCnpj.replace(/\D/g, '').length < 11} onClick={submit}>Gerar fatura</Button></>}>
      <div className="vx-form">
        <Input label="Nome ou razão social" value={f.name} maxLength={100} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div className="vx-form-row">
          <Input label="CPF ou CNPJ" value={f.cpfCnpj} inputMode="numeric" maxLength={18} onChange={(e) => setF({ ...f, cpfCnpj: e.target.value })} />
          <Input label="E-mail para a fatura" type="email" value={f.email} maxLength={120} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </div>
        {error && <p className="vx-help vx-help-warn"><Icon name="alert" />{error}</p>}
        <p className="vx-help">Abrimos a fatura do Asaas, nosso parceiro de pagamentos: lá você escolhe Pix, boleto ou cartão. Fatura sem pagamento vence em 3 dias.</p>
      </div>
    </Modal>
  );
}

/** Console da Vetta: itens, preços e promoções da Loja (platform/store). */
export function StoreAdmin() {
  const toast = useToast();
  const doc = useDoc('platform/store');
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  if (doc === undefined) return <Loading />;
  const list = items || (doc?.items?.length ? doc.items : STORE_DEFAULTS);
  const upd = (i, patch) => setItems(list.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const save = async () => {
    setBusy(true);
    try {
      const clean = list.map((it) => ({
        id: String(it.id || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40), kind: it.kind, name: String(it.name || '').slice(0, 60), desc: String(it.desc || '').slice(0, 200),
        price: Number(String(it.price).replace(',', '.')) || 0, promoPrice: Number(String(it.promoPrice || '').replace(',', '.')) || null, promoUntil: it.promoUntil || '',
        months: it.kind === 'months' ? Number(it.months) || 1 : null, storageMB: it.kind === 'storage' ? Number(it.storageMB) || 0 : null, active: it.active !== false,
      })).filter((it) => it.id && it.name && it.price > 0);
      await api.set('platform/store', { items: clean, updatedAt: api.NOW }, true);
      setItems(null);
      toast('Loja salva. Os clientes já veem os novos preços.');
    } finally { setBusy(false); }
  };
  return (
    <Card title="Loja (itens e promoções)" icon="cart" actions={<><Button size="sm" icon="plus" onClick={() => setItems([...list, { id: `item-${list.length + 1}`, kind: 'service', name: '', desc: '', price: '' }])}>Item</Button><Button size="sm" variant="primary" loading={busy} onClick={save}>Salvar loja</Button></>}>
      <div className="vx-store-admin">
        {list.map((it, i) => (
          <div key={i} className="vx-cine-row">
            <div className="vx-form-row">
              <Input label="Código" value={it.id} onChange={(e) => upd(i, { id: e.target.value })} />
              <Select label="Tipo" value={it.kind} onChange={(e) => upd(i, { kind: e.target.value })} options={Object.entries(STORE_KINDS).map(([value, label]) => ({ value, label }))} />
              <Input label="Nome" value={it.name} onChange={(e) => upd(i, { name: e.target.value })} />
            </div>
            <Input label="Descrição" value={it.desc || ''} onChange={(e) => upd(i, { desc: e.target.value })} />
            <div className="vx-form-row">
              <Input label="Preço (R$)" inputMode="decimal" value={it.price ?? ''} onChange={(e) => upd(i, { price: e.target.value })} />
              <Input label="Preço promocional" inputMode="decimal" value={it.promoPrice ?? ''} onChange={(e) => upd(i, { promoPrice: e.target.value })} />
              <Input label="Promoção até" type="date" value={it.promoUntil || ''} onChange={(e) => upd(i, { promoUntil: e.target.value })} />
              {it.kind === 'months' && <Input label="Meses" type="number" min={1} max={36} value={it.months || 1} onChange={(e) => upd(i, { months: e.target.value })} />}
              {it.kind === 'storage' && <Input label="MB a mais" type="number" min={1} value={it.storageMB || ''} onChange={(e) => upd(i, { storageMB: e.target.value })} />}
            </div>
            <div className="vx-row-actions">
              <Toggle label="À venda" checked={it.active !== false} onChange={(v) => upd(i, { active: v })} />
              <Button size="sm" variant="ghost" icon="trash" onClick={() => setItems(list.filter((_, k) => k !== i))}>Tirar</Button>
            </div>
          </div>
        ))}
      </div>
      <p className="vx-help">Pagamento pelo Asaas: configure ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN no serviço de alertas da VPS e cadastre o webhook em Asaas › Integrações apontando para /v1/asaas/webhook.</p>
    </Card>
  );
}
