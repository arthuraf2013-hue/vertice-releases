import { useState } from 'react';
import { referralCode, referralLink, REFERRAL_REWARD_MONTHS } from '@vertice/shared';
import { useSession } from '../session.jsx';
import { siteBase } from '../data/site.js';
import { PageHeader, Card, Button, useToast } from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

/**
 * Indique e ganhe: cada empresa tem um código. Quem se cadastra pelo link fica marcado com ele;
 * quando o indicado paga a primeira mensalidade, a Vetta libera o prêmio no console.
 */
export function Referral() {
  const { companyId, company } = useSession();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const code = referralCode(companyId);
  const link = referralLink(siteBase(), code);
  const text = `Uso o Vértice para as TVs da ${company?.name || 'minha empresa'} e recomendo. Teste grátis por este link: ${link}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); toast('Link copiado.'); setTimeout(() => setCopied(false), 2000); } catch { toast('Não deu para copiar. Selecione o link e copie.'); }
  };
  const rewards = Number(company?.referralRewards) || 0;
  return (
    <div className="vx-page">
      <PageHeader overline="GESTÃO" title="Indique e ganhe" subtitle={`Indique o Vértice para outra empresa. Quando ela assinar, você ganha ${REFERRAL_REWARD_MONTHS} meses de mensalidade.`} />
      <div className="vx-referral">
        <Card title="Seu link" icon="share">
          <div className="vx-referral-code"><span className="vx-faint">Código</span><b className="vx-num">{code}</b></div>
          <div className="vx-comments-link"><code>{link}</code><button type="button" className="vx-icon-btn" aria-label="Copiar o link" onClick={copy}><Icon name={copied ? 'check' : 'copy'} /></button></div>
          <div className="vx-row-actions">
            <a className="vx-btn vx-btn-primary" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"><Icon name="phone" />Mandar pelo WhatsApp</a>
            <Button icon="copy" onClick={copy}>Copiar link</Button>
          </div>
        </Card>
        <Card title="Como funciona" icon="gift">
          <ol className="vx-academy-steps">
            <li>Mande o seu link para quem tem comércio, clínica, academia ou indústria.</li>
            <li>A pessoa testa grátis pelo link e o cadastro fica marcado com o seu código.</li>
            <li>Quando ela pagar a primeira mensalidade, a Vetta soma {REFERRAL_REWARD_MONTHS} meses na sua assinatura.</li>
          </ol>
          <p className="vx-help">Indicações premiadas até agora: <b>{rewards}</b>.</p>
        </Card>
      </div>
    </div>
  );
}
