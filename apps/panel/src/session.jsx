import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './data/api.js';
import { useDoc, useCol } from './data/hooks.js';
import { ROLES } from '@vertice/shared';

const Ctx = createContext(null);

/** Sessão: usuário, empresa, papel, filtro de unidade e tema. */
export function SessionProvider({ children }) {
  const [user, setUser] = useState(undefined);
  useEffect(() => api.auth.onChange(setUser), []);

  const profile = useDoc(user ? `users/${user.uid}` : null);
  const companyId = profile?.companyId || null;
  const company = useDoc(companyId ? `companies/${companyId}` : null);
  const member = useDoc(companyId && user ? `companies/${companyId}/members/${user.uid}` : null);
  const units = useCol(companyId ? `companies/${companyId}/units` : null, { orderBy: ['name', 'asc'] });

  const [unitId, setUnitId] = useState(() => localStorage.getItem('vx-unit') || 'all');
  const [theme, setTheme] = useState(() => localStorage.getItem('vx-theme') || 'light');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('vx-theme', theme); } catch { /* sem storage */ }
  }, [theme]);
  useEffect(() => {
    try { localStorage.setItem('vx-unit', unitId); } catch { /* sem storage */ }
  }, [unitId]);

  const value = useMemo(() => {
    const role = member?.role || 'viewer';
    const can = (min) => ROLES.indexOf(role) >= ROLES.indexOf(min);
    return {
      user, profile, company, companyId, member, role, can, units: units || [],
      unitId, setUnitId, theme, setTheme,
      base: companyId ? `companies/${companyId}` : null,
      loading: user === undefined || (user && (profile === undefined || (companyId && company === undefined))),
    };
  }, [user, profile, company, companyId, member, units, unitId, theme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);

/** Filtra uma lista pela unidade selecionada no topo. */
export function useUnitFilter(list) {
  const { unitId } = useSession();
  return useMemo(() => (list || []).filter((x) => unitId === 'all' || x.unitId === unitId), [list, unitId]);
}
