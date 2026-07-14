import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { getToken, setToken, setUnauthorizedHandler } from '../api/client';

interface AuthValue { token: string | null; login: (t: string) => void; logout: () => void }
const AuthCtx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTok] = useState<string | null>(() => getToken());
  const value = useMemo<AuthValue>(() => ({
    token,
    login: (t) => { setToken(t); setTok(t); },
    logout: () => { setToken(null); setTok(null); },
  }), [token]);
  useEffect(() => { setUnauthorizedHandler(() => value.logout()); return () => setUnauthorizedHandler(null); }, [value]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export function useAuth(): AuthValue { const v = useContext(AuthCtx); if (!v) throw new Error('useAuth outside provider'); return v; }
export function RequireAuth() { const { token } = useAuth(); return token ? <Outlet /> : <Navigate to="/login" replace />; }
