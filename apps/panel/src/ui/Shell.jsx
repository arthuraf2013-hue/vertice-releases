import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import { ROLE_LABEL } from '@vertice/shared';
import { useSession } from '../session.jsx';
import { api, isDemo, desktopConfigFile } from '../data/api.js';
import { Icon } from './Icon.jsx';
import { Logo } from './kit.jsx';
import { AppUpdate } from './AppUpdate.jsx';
import { rebuildManifests } from '../data/manifests.js';

const NAV = [
  ['PAINEL', [['/', 'dashboard', 'Dashboard']]],
  ['OPERAÇÃO', [['/telas', 'screen', 'Telas'], ['/monitoramento', 'pulse', 'Monitoramento'], ['/capturas', 'camera', 'Capturas']]],
  ['CONTEÚDO', [['/midias', 'image', 'Mídias'], ['/playlists', 'playlist', 'Playlists'], ['/programacao', 'calendar', 'Programação'], ['/aplicativos', 'apps', 'Aplicativos'], ['/comentarios', 'message', 'Comentários'], ['/price', 'tag', 'Price'], ['/estudio', 'palette', 'Estúdio'], ['/videowall', 'wall', 'Video wall']]],
  ['COMERCIAL', [['/anunciantes', 'megaphone', 'Anunciantes'], ['/relatorios', 'chart', 'Relatórios']]],
  ['GESTÃO', [['/empresa', 'building', 'Empresa'], ['/downloads', 'download', 'Downloads']]],
];

const VETTA_NAV = ['VETTA SISTEMAS', [['/vetta', 'key', 'Clientes']]];

export function Shell() {
  const loc = useLocation();
  const { isVetta, company } = useSession();
  // Conta só da Vetta (sem empresa): só o console.
  const nav = company ? (isVetta ? [...NAV, VETTA_NAV] : NAV) : [VETTA_NAV];
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => setNavOpen(false), [loc.pathname]);
  return (
    <div className="vx-app">
      <nav className={`vx-nav ${navOpen ? 'is-open' : ''}`} aria-label="Principal">
        <div className="vx-nav-brand"><Logo size={36} /></div>
        <div className="vx-nav-scroll">
        {nav.map(([group, items]) => (
          <div key={group}>
            <div className="vx-nav-group vx-overline">{group}</div>
            {items.map(([to, icon, label]) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `vx-nav-item ${isActive ? 'is-active' : ''}`}>
                {({ isActive }) => (
                  <>
                    <Icon name={icon} />
                    {label}
                    {isActive && <span className="vx-apex" aria-hidden />}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
        </div>
        {/* Fora da rolagem: a versão e o botão de atualizar ficam sempre à vista. */}
        <AppUpdate />
      </nav>
      {navOpen && <div className="vx-nav-scrim" onClick={() => setNavOpen(false)} />}
      <div className="vx-main">
        <Topbar onMenu={() => setNavOpen(true)} />
        {isDemo && (
          <div className="vx-demo-bar">
            <Icon name="eye" />
            {desktopConfigFile ? (
              <>Modo demonstração: os dados são de exemplo. Para usar de verdade, preencha <code>{desktopConfigFile}</code> e reabra o Vértice.</>
            ) : (
              <>Modo demonstração: os dados são de exemplo e ficam só nesta aba. Configure o Firebase no arquivo <code>.env</code> para usar de verdade.</>
            )}
          </div>
        )}
        {company && <LicenseBar />}
        <main className="vx-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Aviso de licença: teste acabando, mensalidade vencida ou telas paradas. */
function LicenseBar() {
  const { license, settings, companyId, can } = useSession();
  // Enquanto bloqueada, nada foi publicado: ao voltar, publica tudo que mudou nesse meio-tempo.
  useEffect(() => {
    const key = `vx-blocked-${companyId}`;
    let was = false;
    try { was = localStorage.getItem(key) === '1'; localStorage.setItem(key, license.blocked ? '1' : '0'); } catch { /* sem storage */ }
    if (was && !license.blocked && can('editor')) rebuildManifests(companyId).catch(() => {});
  }, [license.blocked, companyId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!license.warn) return null;
  const wa = settings.supportWhatsApp;
  return (
    <div className={`vx-license-bar is-${license.blocked ? 'blocked' : 'warn'}`} role={license.blocked ? 'alert' : 'status'}>
      <Icon name={license.blocked ? 'alert' : 'clock'} />
      <span><b>{license.title}.</b> {license.text}</span>
      <span className="vx-license-actions">
        <Link to="/empresa?aba=licenca">Ver plano</Link>
        {wa && <a href={`https://wa.me/${wa}?text=${encodeURIComponent('Olá! Quero regularizar a assinatura do Vértice.')}`} target="_blank" rel="noreferrer">Falar com a Vetta</a>}
      </span>
    </div>
  );
}

function Topbar({ onMenu }) {
  const { company, units, unitId, setUnitId, theme, setTheme, user, member, role } = useSession();
  return (
    <header className="vx-topbar">
      <button type="button" className="vx-btn vx-btn-icon vx-menu-btn" onClick={onMenu} aria-label="Abrir menu"><Icon name="layers" /></button>
      {company ? <UnitPicker company={company} units={units} value={unitId} onChange={setUnitId} /> : <span className="vx-unit-company" style={{ fontWeight: 600 }}>Console da Vetta Sistemas</span>}
      <div className="vx-topbar-right">
        <button type="button" className="vx-btn vx-btn-sm" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-pressed={theme === 'dark'}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          {theme === 'dark' ? 'Painel claro' : 'Sala de controle'}
        </button>
        <UserMenu name={member?.name || user?.name || user?.email} email={user?.email} role={company ? ROLE_LABEL[role] : 'Vetta Sistemas'} />
      </div>
    </header>
  );
}

/** Seletor de unidade: filtra telas e monitoramento pela loja escolhida. */
function UnitPicker({ company, units, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(() => setOpen(false));
  const current = units.find((u) => u.id === value);
  return (
    <div className="vx-unit" ref={ref}>
      <button type="button" className="vx-unit-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="listbox">
        <span className="vx-tile is-neutral"><Icon name="pin" /></span>
        <span className="vx-unit-text">
          <span className="vx-unit-company">{company?.name || 'Sua empresa'}</span>
          <span className="vx-unit-name">{current ? current.name : 'Todas as unidades'}</span>
        </span>
        <Icon name="chevronDown" />
      </button>
      {open && (
        <div className="vx-pop vx-unit-pop" role="listbox">
          {[{ id: 'all', name: 'Todas as unidades' }, ...units].map((u) => (
            <button key={u.id} type="button" role="option" aria-selected={value === u.id} className={`vx-pop-item ${value === u.id ? 'is-active' : ''}`} onClick={() => { onChange(u.id); setOpen(false); }}>
              <Icon name={u.id === 'all' ? 'layers' : 'pin'} />
              {u.name}
              {value === u.id && <Icon name="check" className="vx-pop-check" />}
            </button>
          ))}
          {!units.length && <div className="vx-pop-note">Cadastre unidades em Telas › Unidades.</div>}
        </div>
      )}
    </div>
  );
}

function UserMenu({ name = '', email, role }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(() => setOpen(false));
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="vx-user" ref={ref}>
      <button type="button" className="vx-avatar" onClick={() => setOpen((o) => !o)} aria-label="Conta" aria-expanded={open}>{initials || <Icon name="user" />}</button>
      {open && (
        <div className="vx-pop vx-user-pop">
          <div className="vx-pop-head"><b>{name}</b><span>{email}</span><span className="vx-faint">{role}</span></div>
          <button type="button" className="vx-pop-item" onClick={() => api.auth.signOut()}><Icon name="logout" />Sair</button>
        </div>
      )}
    </div>
  );
}

function useOutside(fn) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && fn();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  });
  return ref;
}
