const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') || '';
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || '';
const SESSION_KEY = 'carevault.auth.session';
const VERIFIER_KEY = 'carevault.auth.pkce_verifier';

export interface VaultUser {
  id: string;
  email?: string;
  phone?: string;
  user_metadata?: Record<string, unknown>;
}

export interface VaultSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: VaultUser;
}

interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  user: VaultUser;
}

export const authIsConfigured = (): boolean => {
  const hasPlaceholder = [SUPABASE_URL, SUPABASE_ANON_KEY].some(value =>
    /YOUR-PROJECT|YOUR_SUPABASE_ANON_KEY|ENTER_YOUR_|placeholder/i.test(value),
  );
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && !hasPlaceholder);
};
export const supabaseUrl = (): string => SUPABASE_URL;
export const supabaseAnonKey = (): string => SUPABASE_ANON_KEY;

function persistSession(response: AuthResponse): VaultSession {
  const session: VaultSession = {
    access_token: response.access_token,
    refresh_token: response.refresh_token,
    expires_at: response.expires_at ?? Math.floor(Date.now() / 1000) + (response.expires_in ?? 3600),
    user: response.user,
  };
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function readSession(): VaultSession | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as VaultSession) : null;
  } catch {
    return null;
  }
}

function clearSession(): void {
  window.sessionStorage.removeItem(SESSION_KEY);
  window.sessionStorage.removeItem(VERIFIER_KEY);
}

async function authFetch(path: string, body?: unknown, accessToken?: string): Promise<any> {
  if (!authIsConfigured()) throw new Error('Authentication is not configured yet. Add the Supabase URL and anon key to .env.');
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.message || data.error_description || data.error || 'Authentication request failed.');
  return data;
}

async function sha256Base64Url(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const binary = Array.from(new Uint8Array(digest), byte => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function processOAuthCallback(): Promise<VaultSession | null> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  if (!code) return null;
  const verifier = window.sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error('The sign-in session expired. Please sign in again.');
  const response = await authFetch('token?grant_type=pkce', { auth_code: code, code_verifier: verifier });
  const session = persistSession(response as AuthResponse);
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  window.sessionStorage.removeItem(VERIFIER_KEY);
  return session;
}

export const authService = {
  async initialize(): Promise<{ session: VaultSession | null; user: VaultUser | null }> {
    if (!authIsConfigured()) return { session: null, user: null };
    const oauthSession = await processOAuthCallback();
    let session = oauthSession ?? readSession();
    if (!session) return { session: null, user: null };
    if (session.expires_at <= Math.floor(Date.now() / 1000) + 60) {
      const refreshed = await authFetch('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
      session = persistSession(refreshed as AuthResponse);
    }
    const user = (await authFetch('user', undefined, session.access_token)) as VaultUser;
    const updatedSession = { ...session, user };
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(updatedSession));
    return { session: updatedSession, user };
  },

  async signInWithEmail(email: string, password: string): Promise<{ session: VaultSession; user: VaultUser }> {
    const response = (await authFetch('token?grant_type=password', { email: email.trim(), password })) as AuthResponse;
    const session = persistSession(response);
    return { session, user: response.user };
  },

  async signUpWithEmail(email: string, password: string): Promise<{ session: VaultSession | null; user: VaultUser | null }> {
    const response = (await authFetch('signup', { email: email.trim(), password })) as AuthResponse;
    if (response.access_token) {
      const session = persistSession(response);
      return { session, user: response.user };
    }
    return { session: null, user: response.user || null };
  },

  async sendPhoneCode(phone: string): Promise<void> {
    await authFetch('otp', { phone: phone.trim(), create_user: true });
  },

  async verifyPhoneCode(phone: string, token: string): Promise<{ session: VaultSession; user: VaultUser }> {
    const response = (await authFetch('verify', { phone: phone.trim(), token: token.trim(), type: 'sms' })) as AuthResponse;
    const session = persistSession(response);
    return { session, user: response.user };
  },

  async signInWithGoogle(): Promise<void> {
    if (!authIsConfigured()) throw new Error('Add Supabase configuration before enabling Google sign-in.');
    const bytes = crypto.getRandomValues(new Uint8Array(48));
    const verifier = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    const challenge = await sha256Base64Url(verifier);
    window.sessionStorage.setItem(VERIFIER_KEY, verifier);
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const params = new URLSearchParams({ provider: 'google', redirect_to: redirectTo, code_challenge: challenge, code_challenge_method: 's256' });
    window.location.assign(`${SUPABASE_URL}/auth/v1/authorize?${params.toString()}`);
  },

  async signOut(session: VaultSession | null): Promise<void> {
    if (session && authIsConfigured()) {
      try { await authFetch('logout', {}, session.access_token); } catch { /* clear local session even if the network is unavailable */ }
    }
    clearSession();
  },
};
