import { create } from 'zustand';
import { User } from '../types';
import { supabase } from '../lib/supabase';
import { connectSocket, disconnectSocket } from '../lib/socket';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username: string) => Promise<void>;
  logout: () => Promise<void>;
  loadSession: () => Promise<void>;
  setStatus: (status: 'online' | 'idle' | 'dnd' | 'offline') => Promise<void>;
}

async function hydrateUser(userId: string, email: string | undefined, fallbackStatus: User['status'] = 'online'): Promise<User> {
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
  return {
    id: userId,
    email,
    username: profile?.username || email || 'user',
    discriminator: profile?.discriminator,
    avatar_url: profile?.avatar_url,
    status: profile?.status || fallbackStatus,
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  loading: true,

  loadSession: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const user = await hydrateUser(session.user.id, session.user.email ?? undefined);
      localStorage.setItem('discord_token', session.access_token);
      set({ user, token: session.access_token, loading: false });
      connectSocket(session.access_token);
    } else {
      set({ loading: false });
    }
  },

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const user = await hydrateUser(data.user.id, data.user.email ?? undefined);
    localStorage.setItem('discord_token', data.session.access_token);
    set({ user, token: data.session.access_token });
    connectSocket(data.session.access_token);
  },

  register: async (email, password, username) => {
    // Go through the backend so we can use the service-role admin API to skip
    // the email-confirmation flow entirely.
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, username }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Registration failed');
    }
    // Now sign in through the supabase-js client so the SDK manages the session
    // (and auto-refreshes the access token going forward).
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const user = await hydrateUser(data.user.id, data.user.email ?? undefined);
    localStorage.setItem('discord_token', data.session.access_token);
    set({ user, token: data.session.access_token });
    connectSocket(data.session.access_token);
  },

  logout: async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('discord_token');
    disconnectSocket();
    set({ user: null, token: null });
  },

  setStatus: async (status) => {
    const { user } = get();
    if (!user) return;
    set({ user: { ...user, status } });
    await supabase.from('profiles').update({ status }).eq('id', user.id);
  },
}));
