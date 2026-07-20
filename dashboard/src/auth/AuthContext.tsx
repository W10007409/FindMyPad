import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { getToken, setToken, getSession, setSession, setUnauthorizedHandler, type Session } from '../api/client';

interface AuthValue {
  token: string | null;
  session: Session | null;
  login: (t: string, s: Session) => void;
  logout: () => void;
  clearMustChange: () => void;
}
const AuthCtx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTok] = useState<string | null>(() => getToken());
  const [session, setSess] = useState<Session | null>(() => getSession());
  const value = useMemo<AuthValue>(() => ({
    token,
    session,
    login: (t, s) => { setToken(t); setSession(s); setTok(t); setSess(s); },
    logout: () => { setToken(null); setSession(null); setTok(null); setSess(null); },
    clearMustChange: () => {
      setSess((prev) => {
        const next = prev ? { ...prev, mustChangePassword: false } : prev;
        setSession(next); return next;
      });
    },
  }), [token, session]);
  useEffect(() => { setUnauthorizedHandler(() => value.logout()); return () => setUnauthorizedHandler(null); }, [value]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export function useAuth(): AuthValue { const v = useContext(AuthCtx); if (!v) throw new Error('useAuth outside provider'); return v; }
export function isAdmin(s: Session | null): boolean { return s?.role === 'admin'; }

/** Authenticated gate. Also forces the first-login password change before anything else. */
export function RequireAuth() {
  const { token, session } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (session?.mustChangePassword) return <Navigate to="/change-password" replace />;
  return <Outlet />;
}

/** Gate for admin-only routes (무응답·AP매핑). */
export function RequireAdmin() {
  const { token, session } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (session?.mustChangePassword) return <Navigate to="/change-password" replace />;
  return isAdmin(session) ? <Outlet /> : <Navigate to="/" replace />;
}
