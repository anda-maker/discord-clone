import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function getAuthToken(): Promise<string | null> {
  // Always ask Supabase for the current session — it auto-refreshes the access token
  // when expired, so we never send a stale JWT to the backend (which would 401 as
  // "Invalid token").
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      localStorage.setItem('discord_token', session.access_token);
      return session.access_token;
    }
  } catch {}
  return localStorage.getItem('discord_token');
}

export const api = {
  async request(path: string, options: RequestInit = {}) {
    const token = await getAuthToken();
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || `Request failed (${res.status})`);
    }
    return res.json();
  },
  get: (path: string) => api.request(path),
  post: (path: string, body: any) => api.request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path: string, body: any) => api.request(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path: string) => api.request(path, { method: 'DELETE' }),
};
