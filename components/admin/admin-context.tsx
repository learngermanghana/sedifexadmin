'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

type Scope = 'platform' | 'store';

type AdminContextValue = {
  scope: Scope;
  setScope: (scope: Scope) => void;
  role: string;
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminContextProvider({ children }: { children: React.ReactNode }) {
  const [scope, setScopeState] = useState<Scope>('platform');
  const [role, setRole] = useState('');

  useEffect(() => {
    let cancelled = false;

    fetch('/api/admin/session', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load admin session.');
        return response.json() as Promise<{ scope?: Scope; role?: string }>;
      })
      .then((session) => {
        if (cancelled) return;
        if (session.scope === 'store' || session.scope === 'platform') setScopeState(session.scope);
        if (session.role) setRole(session.role);
      })
      .catch(() => {
        if (cancelled) return;
        setRole('');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setScope = (next: Scope) => {
    // This is a presentation/filter choice only. Authorization always comes
    // from the signed HttpOnly session verified on the server.
    setScopeState(next);
  };

  const value = useMemo(() => ({ scope, setScope, role }), [scope, role]);
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdminContext() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdminContext must be used within AdminContextProvider');
  return ctx;
}
