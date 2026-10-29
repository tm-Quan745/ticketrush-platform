import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '../types';
import { api } from '../api/client';
import { backendUnavailableMessage, isBackendUnavailable } from '../api/availability';
interface AuthContextType {
  user: User | null; isAdmin: boolean; loading: boolean;
  sessionError: string; retrySession: () => void;
  login: (email: string, password: string) => Promise<User>;
  loginWithGoogle: (credential: string) => Promise<User>;
  logout: () => Promise<void>;
  loginAsUser: () => Promise<void>; loginAsAdmin: () => Promise<void>;
}
const unavailable = async () => { throw new Error('Demo login is not enabled. Use your account.'); };
const AuthContext = createContext<AuthContextType>({
  user: null, isAdmin: false, loading: false, login: async () => { throw new Error('AuthProvider required'); },
  sessionError: '', retrySession: () => {},
  logout: async () => {}, loginAsUser: unavailable, loginAsAdmin: unavailable,
  loginWithGoogle: async () => { throw new Error('AuthProvider required'); },
});
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(api.getUser());
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true); setSessionError('');
    void api.restoreSession().then(() => { if (alive) setUser(api.getUser()); })
      .catch(error => { if (alive) setSessionError(isBackendUnavailable(error)
        ? backendUnavailableMessage
        : 'Chưa thể khôi phục phiên đăng nhập. Vui lòng thử lại.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [attempt]);
  useEffect(() => {
    const expired = () => setUser(null);
    window.addEventListener('auth:expired', expired);
    return () => window.removeEventListener('auth:expired', expired);
  }, []);
  async function login(email: string, password: string) {
    const result = await api.login(email, password); setUser(result.user); return result.user;
  }
  async function loginWithGoogle(credential: string) {
    const result = await api.loginWithGoogle(credential); setUser(result.user); return result.user;
  }
  return <AuthContext.Provider value={{ user, isAdmin: user?.role === 'ADMIN', loading, sessionError, retrySession: () => setAttempt(value => value + 1), login, loginWithGoogle,
    logout: async () => { await api.logout(); setUser(null); }, loginAsUser: unavailable, loginAsAdmin: unavailable }}>
    {children}
  </AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
