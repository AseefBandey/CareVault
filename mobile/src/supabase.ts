import 'react-native-url-polyfill/auto';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || '';
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || process.env.EXPO_PUBLIC_SUPABASE_KEY?.trim() || '';
export const isSupabaseConfigured = Boolean(
  url.startsWith('https://') &&
  key &&
  !key.includes('YOUR_') &&
  !key.includes('ENTER_') &&
  !url.includes('YOUR-PROJECT') &&
  !url.includes('ENTER_')
);

// SecureStore has small per-value limits on some platforms; chunk session data to keep auth tokens in Keychain/Keystore.
// Keys must only contain alphanumeric characters, '.', '-', and '_'.
const CHUNK_SIZE = 1700;
function sanitizeKey(k: string): string {
  return k.replace(/[^a-zA-Z0-9._-]/g, '_');
}

const secureSessionStorage = {
  async getItem(name: string): Promise<string | null> {
    try {
      const safeKey = sanitizeKey(name);
      const manifest = await SecureStore.getItemAsync(`${safeKey}_manifest`);
      if (!manifest) return null;
      const count = Number(manifest);
      if (!Number.isInteger(count) || count < 1 || count > 20) return null;
      let value = '';
      for (let i = 0; i < count; i++) {
        value += (await SecureStore.getItemAsync(`${safeKey}_chunk_${i}`)) || '';
      }
      return value || null;
    } catch {
      return null;
    }
  },
  async setItem(name: string, value: string): Promise<void> {
    try {
      const safeKey = sanitizeKey(name);
      const old = Number(await SecureStore.getItemAsync(`${safeKey}_manifest`) || 0);
      const count = Math.ceil(value.length / CHUNK_SIZE);
      if (count > 20) throw new Error('Authentication session is too large for secure local storage.');
      for (let i = 0; i < count; i++) {
        await SecureStore.setItemAsync(`${safeKey}_chunk_${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      }
      await SecureStore.setItemAsync(`${safeKey}_manifest`, String(count));
      for (let i = count; i < old; i++) {
        await SecureStore.deleteItemAsync(`${safeKey}_chunk_${i}`);
      }
    } catch (e) {
      console.warn('Secure storage setItem error:', e);
    }
  },
  async removeItem(name: string): Promise<void> {
    try {
      const safeKey = sanitizeKey(name);
      const count = Number(await SecureStore.getItemAsync(`${safeKey}_manifest`) || 0);
      for (let i = 0; i < Math.min(count, 20); i++) {
        await SecureStore.deleteItemAsync(`${safeKey}_chunk_${i}`);
      }
      await SecureStore.deleteItemAsync(`${safeKey}_manifest`);
    } catch {
      // ignore deletion errors
    }
  },
};

export const supabase = isSupabaseConfigured
  ? createClient(url, key, {
      auth: { storage: secureSessionStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType: 'pkce' },
      global: { headers: { 'X-Client-Info': 'carevault-mobile/1.0.0' } },
    })
  : null;
function resolveApiBase(): string {
  const envUrl = (process.env.EXPO_PUBLIC_API_BASE_URL || '').trim().replace(/\/$/, '');

  // If envUrl is set and is a valid real address (not 10.0.2.2 or localhost), use it:
  if (envUrl && !envUrl.includes('10.0.2.2') && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl;
  }

  // Auto-detect LAN IP from Expo dev server if running on real phone
  const hostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest2?.extra?.expoGo?.debuggerHost || '';
  const hostIp = hostUri ? hostUri.split(':')[0] : '';
  if (hostIp && hostIp !== 'localhost' && hostIp !== '127.0.0.1') {
    return `http://${hostIp}:8787/api`;
  }

  return envUrl || 'http://192.168.1.9:8787/api';
}

export const API_BASE = resolveApiBase();
export const demoLoginEnabled = process.env.EXPO_PUBLIC_ENABLE_DEMO_LOGIN !== 'false';
