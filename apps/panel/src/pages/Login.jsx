import { useState } from 'react';
import { api, isDemo } from '../data/api.js';
import { Button, Input, Logo, Tabs } from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';
import { siteBase } from '../data/site.js';
import { useSession } from '../session.jsx';
import { DEFAULT_TRIAL_DAYS } from '@vertice/shared';

const AUTH_ERRORS = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Use "Entrar".',
  'auth/weak-password': 'A senha precisa ter pelo menos 8 caracteres.',
  'auth/invalid-email': 'Confira o e-mail digitado.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem conexão com a internet.',
};

export function Login() {
  const { settings } = useSession();
  // O site (botão "Testar grátis") abre direto em "Criar conta": /app/#/?criar
  const [tab, setTab] = useState(() => (/criar/.test(location.hash) ? 'up' : 'in'));
  const [f, setF] = useState({ name: '', companyName: '', phone: '', city: '', email: '', password: '' });
  const trialDays = settings?.trialDays || DEFAULT_TRIAL_DAYS;
  const signupOpen = settings?.signupOpen !== false;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (tab === 'in') await api.auth.signIn(f.email.trim(), f.password);
      else {
        if (!isDemo && f.password.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
        await api.auth.signUp({ ...f, email: f.email.trim(), phone: f.phone.trim(), city: f.city.trim() });
      }
    } catch (err) {
      setError(AUTH_ERRORS[err.code] || err.message);
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    if (!f.email) return setError('Digite seu e-mail para receber o link.');
    await api.auth.resetPassword(f.email.trim());
    setInfo('Enviamos um link para redefinir a senha.');
  };

  return (
    <div className="vx-login" data-theme="light">
      <aside className="vx-login-art" data-theme="dark">
        <Logo size={44} dark />
        <div className="vx-login-hero">
          <svg viewBox="60 40 1042 550" className="vx-login-pyr" aria-hidden>
            <defs>
              <linearGradient id="lb" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#0a49b8" /><stop offset=".6" stopColor="#1160d6" /><stop offset="1" stopColor="#1f78ee" /></linearGradient>
              <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#c78a2c" /><stop offset=".5" stopColor="#f1b84b" /><stop offset="1" stopColor="#d99a35" /></linearGradient>
              <linearGradient id="ls" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1160d6" /><stop offset=".6" stopColor="#2a6fd8" /><stop offset="1" stopColor="#ffffff" /></linearGradient>
            </defs>
            <polygon points="70,580 625,50 690,122 290,580" fill="url(#lb)" />
            <polygon points="625,50 690,122 625,190" fill="#08327f" fillOpacity=".8" />
            <line x1="120" y1="515" x2="470" y2="190" stroke="#55b4ff" strokeWidth="5" strokeLinecap="round" opacity=".85" />
            <polygon points="665,266 702,318 500,470 385,580" fill="url(#ls)" />
            <polygon points="740,168 1092,580 940,580 660,262" fill="url(#lg)" />
          </svg>
          <div className="vx-overline" style={{ color: 'var(--vetta-gold)' }}>DIGITAL SIGNAGE</div>
          <h1>Sua comunicação em outro nível.</h1>
          <p>Mídias, ofertas e pedidos prontos nas telas da sua loja, controlados de um lugar só.</p>
        </div>
        <div className="vx-login-foot">Vetta Sistemas · Recife</div>
      </aside>
      <main className="vx-login-main">
        <form className="vx-login-card" onSubmit={submit}>
          <h2 className="vx-page-title">{tab === 'in' ? 'Entrar no painel' : 'Criar sua conta'}</h2>
          <Tabs value={tab} onChange={(t) => { setTab(t); setError(''); }} tabs={[{ id: 'in', label: 'Entrar' }, { id: 'up', label: 'Criar conta' }]} />
          {tab === 'up' && (
            <>
              <div className={`vx-alert ${signupOpen ? 'vx-alert-online' : 'vx-alert-sync'}`}>
                <Icon name={signupOpen ? 'check' : 'key'} />
                {signupOpen
                  ? `${trialDays} dias grátis com tudo liberado, até 3 telas. Sem cartão de crédito.`
                  : 'Cadastro só por convite. Se você recebeu um convite, crie a conta com o e-mail convidado.'}
              </div>
              <Input label="Seu nome" value={f.name} onChange={set('name')} required autoComplete="name" />
              {signupOpen && <Input label="Nome da empresa" value={f.companyName} onChange={set('companyName')} help="Se você recebeu um convite, a conta entra na empresa que convidou." />}
              {signupOpen && (
                <div className="vx-form-row">
                  <Input label="WhatsApp" value={f.phone} onChange={set('phone')} autoComplete="tel" placeholder="(81) 99999-0000" />
                  <Input label="Cidade" value={f.city} onChange={set('city')} autoComplete="address-level2" />
                </div>
              )}
            </>
          )}
          <Input label="E-mail" type="email" value={f.email} onChange={set('email')} required={!isDemo} autoComplete="email" />
          <Input label="Senha" type="password" value={f.password} onChange={set('password')} required={!isDemo} minLength={isDemo || tab === 'in' ? 0 : 8} autoComplete={tab === 'in' ? 'current-password' : 'new-password'} help={tab === 'up' ? 'Pelo menos 8 caracteres.' : undefined} />
          {tab === 'up' && <p className="vx-help">Ao criar a conta, você concorda com os <a href={`${siteBase()}termos.html`} target="_blank" rel="noreferrer">termos de uso</a> e a <a href={`${siteBase()}privacidade.html`} target="_blank" rel="noreferrer">política de privacidade</a>.</p>}
          {error && <div className="vx-alert vx-alert-offline"><Icon name="alert" />{error}</div>}
          {info && <div className="vx-alert vx-alert-online"><Icon name="check" />{info}</div>}
          <Button type="submit" variant="primary" loading={busy} className="vx-btn-block">{tab === 'in' ? 'Entrar' : 'Criar conta'}</Button>
          {tab === 'in' && <button type="button" className="vx-link vx-link-btn" onClick={reset}>Esqueci minha senha</button>}
          {isDemo && <p className="vx-help" style={{ textAlign: 'center' }}>Modo demonstração: clique em Entrar com qualquer e-mail.</p>}
        </form>
      </main>
    </div>
  );
}

