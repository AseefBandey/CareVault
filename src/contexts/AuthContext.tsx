import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authIsConfigured, authService, type VaultSession, type VaultUser } from '../services/authService';

interface AuthContextValue {
  user: VaultUser | null;
  session: VaultSession | null;
  loading: boolean;
  configured: boolean;
  authError: string | null;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  sendPhoneCode: (phone: string) => Promise<void>;
  verifyPhoneCode: (phone: string, code: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInDemo: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const DEMO_SESSION_KEY = 'carevault.demo.session';
const DEMO_USER_ID = 'carevault-local-demo-user';

function readDemoSession(): VaultSession | null {
  try {
    const raw = window.sessionStorage.getItem(DEMO_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as VaultSession;
    return session.user?.id === DEMO_USER_ID ? session : null;
  } catch {
    window.sessionStorage.removeItem(DEMO_SESSION_KEY);
    return null;
  }
}

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<VaultUser | null>(null);
  const [session, setSession] = useState<VaultSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const configured = authIsConfigured();

  useEffect(() => {
    let active = true;
    if (!configured) {
      const demoSession = readDemoSession();
      setSession(demoSession);
      setUser(demoSession?.user ?? null);
      setLoading(false);
      return () => { active = false; };
    }
    authService.initialize()
      .then(result => {
        if (!active) return;
        setSession(result.session);
        setUser(result.user);
      })
      .catch(error => {
        if (!active) return;
        setAuthError(error instanceof Error ? error.message : 'Could not restore the sign-in session.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [configured]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    if (!configured) {
      const cleanEmail = email.trim();
      const demoEmailUser: VaultUser = {
        id: `demo-${cleanEmail.replace(/[^a-zA-Z0-9]/g, '')}`,
        email: cleanEmail,
        user_metadata: { full_name: cleanEmail.split('@')[0] },
      };
      const demoEmailSession: VaultSession = {
        access_token: 'demo-email-token',
        refresh_token: 'demo-email-refresh',
        expires_at: 4102444800,
        user: demoEmailUser,
      };
      window.sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(demoEmailSession));
      setUser(demoEmailUser);
      setSession(demoEmailSession);
      return;
    }
    try {
      const result = await authService.signInWithEmail(email, password);
      setSession(result.session);
      setUser(result.user);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign in failed.';
      setAuthError(message);
      throw error;
    }
  }, [configured]);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    if (!configured) {
      const cleanEmail = email.trim();
      const demoEmailUser: VaultUser = {
        id: `demo-${cleanEmail.replace(/[^a-zA-Z0-9]/g, '')}`,
        email: cleanEmail,
        user_metadata: { full_name: cleanEmail.split('@')[0] },
      };
      const demoEmailSession: VaultSession = {
        access_token: 'demo-email-token',
        refresh_token: 'demo-email-refresh',
        expires_at: 4102444800,
        user: demoEmailUser,
      };
      window.sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(demoEmailSession));
      setUser(demoEmailUser);
      setSession(demoEmailSession);
      return;
    }
    try {
      const result = await authService.signUpWithEmail(email, password);
      if (result.session && result.user) {
        setSession(result.session);
        setUser(result.user);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed.';
      setAuthError(message);
      throw error;
    }
  }, [configured]);

  const sendPhoneCode = useCallback(async (phone: string) => {
    setAuthError(null);
    try { await authService.sendPhoneCode(phone); }
    catch (error) { const message = error instanceof Error ? error.message : 'Could not send a verification code.'; setAuthError(message); throw error; }
  }, []);

  const verifyPhoneCode = useCallback(async (phone: string, code: string) => {
    setAuthError(null);
    try {
      const result = await authService.verifyPhoneCode(phone, code);
      setSession(result.session);
      setUser(result.user);
    } catch (error) { const message = error instanceof Error ? error.message : 'Verification failed.'; setAuthError(message); throw error; }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    if (!configured) {
      // Instant demo login simulation with Google profile
      const googleUser: VaultUser = {
        id: 'carevault-google-demo-user',
        email: 'alex.morgan.health@gmail.com',
        user_metadata: {
          full_name: 'Alex Morgan',
          name: 'Alex Morgan',
          provider: 'google',
          avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
        },
      };
      const googleSession: VaultSession = {
        access_token: 'google-demo-token',
        refresh_token: 'google-demo-refresh',
        expires_at: 4102444800,
        user: googleUser,
      };
      window.sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(googleSession));
      setUser(googleUser);
      setSession(googleSession);
      return;
    }
    try {
      await authService.signInWithGoogle();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google sign-in could not start. Check your Supabase Google OAuth provider configuration.';
      setAuthError(message);
      throw error;
    }
  }, [configured]);

  const signInDemo = useCallback(async (username: string, password: string) => {
    setAuthError(null);
    if (username.trim().toLowerCase() !== 'test' || password !== 'test') {
      const message = 'Demo sign-in failed. Use username “test” and password “test”.';
      setAuthError(message);
      throw new Error(message);
    }
    const demoUser: VaultUser = {
      id: DEMO_USER_ID,
      email: 'test@carevault.local',
      user_metadata: { full_name: 'Demo Tester' },
    };
    const demoSession: VaultSession = {
      access_token: 'local-demo-only',
      refresh_token: 'local-demo-only',
      expires_at: 4102444800,
      user: demoUser,
    };
    window.sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(demoSession));
    setUser(demoUser);
    setSession(demoSession);
  }, []);

  const logout = useCallback(async () => {
    await authService.signOut(session);
    window.sessionStorage.removeItem(DEMO_SESSION_KEY);
    setSession(null);
    setUser(null);
  }, [session]);

  const value = useMemo<AuthContextValue>(() => ({
    user, session, loading, configured, authError,
    signInWithEmail, signUpWithEmail, sendPhoneCode, verifyPhoneCode, signInWithGoogle, signInDemo, logout,
    clearAuthError: () => setAuthError(null),
  }), [user, session, loading, configured, authError, signInWithEmail, signUpWithEmail, sendPhoneCode, verifyPhoneCode, signInWithGoogle, signInDemo, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
};
