'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken, type User } from './api';
import { linkPush, unlinkPush } from './push';

interface AuthState {
  user: User | null;
  ready: boolean;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState>({ user: null, ready: false, signIn: () => {}, signOut: () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    api<{ user: User }>('/v1/me')
      .then(data => setUser(data.user))
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  const signIn = useCallback((token: string, next: User) => { setToken(token); setUser(next); }, []);
  const signOut = useCallback(() => { unlinkPush(getToken()); setToken(null); setUser(null); }, []);

  // A device that already allowed alerts keeps getting them for whoever is signed in.
  useEffect(() => { if (user) linkPush().catch(() => {}); }, [user]);

  return <AuthContext.Provider value={{ user, ready, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
