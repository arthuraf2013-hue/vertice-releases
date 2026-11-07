import { useState } from 'react';
import { api, isDemo } from '../data/api.js';
import { Button, Input, Logo, Tabs } from '../ui/kit.jsx';
import { Icon } from '../ui/Icon.jsx';

const AUTH_ERRORS = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Use "Entrar".',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/invalid-email': 'Confira o e-mail digitado.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem conexão com a internet.',
};

export function Login() {
  const [tab, setTab] = useState('in');
  const [f, setF] = useState({ name: '', companyName: '', email: '', password: '' });
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
      else await api.auth.signUp({ ...f, email: f.email.trim() });
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
          <svg viewBox="0 0 560 340" className="vx-login-pyr" aria-hidden>
            <polygon points="0,340 280,40 160,340" fill="#34445e" />
            <polygon points="160,340 280,40 400,340" fill="#293548" />
            <polygon points="400,340 280,40 560,340" fill="#141b26" />
            <polyline points="0,340 280,40 560,340" fill="none" stroke="#d9a84e" strokeWidth="3" />
            <polyline points="160,340 280,40 400,340" fill="none" stroke="rgba(238,242,247,.18)" strokeWidth="1.5" />
            <circle cx="280" cy="40" r="18" fill="none" stroke="#d9a84e" strokeWidth="2" className="vx-pulse" />
            <circle cx="280" cy="40" r="7" fill="#d9a84e" />
          </svg>
          <div className="vx-overline" style={{ color: 'var(--vetta-gold)' }}>DIGITAL SIGNAGE</div>
          <h1>O ponto para onde o olhar converge.</h1>
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
              <Input label="Seu nome" value={f.name} onChange={set('name')} required autoComplete="name" />
              <Input label="Nome da empresa" value={f.companyName} onChange={set('companyName')} help="Se você recebeu um convite, a conta entra na empresa que convidou." />
            </>
          )}
          <Input label="E-mail" type="email" value={f.email} onChange={set('email')} required={!isDemo} autoComplete="email" />
          <Input label="Senha" type="password" value={f.password} onChange={set('password')} required={!isDemo} minLength={isDemo ? 0 : 6} autoComplete={tab === 'in' ? 'current-password' : 'new-password'} />
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
