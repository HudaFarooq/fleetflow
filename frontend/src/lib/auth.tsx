"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

import { api, ApiError } from "./api";
import type { User } from "./types";

const TOKEN_KEY = "fleetflow_token";

// The saved token lives in localStorage; this tiny store lets React subscribe to it,
// including changes made in other browser tabs.
const listeners = new Set<() => void>();
const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set(token: string | null) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    window.addEventListener("storage", listener);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", listener);
    };
  },
};

const noopSubscribe = () => () => {};

type AuthContextValue = {
  token: string | null;
  user: User | undefined;
  /** False until we know whether someone is logged in */
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  /** Swap in a new token, e.g. after a password change signs out other devices */
  replaceToken: (token: string) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  // On the server there's no localStorage, so render as logged-out until hydrated
  const token = useSyncExternalStore(tokenStore.subscribe, tokenStore.get, () => null);
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const { data: user, isPending } = useQuery({
    queryKey: ["me", token],
    queryFn: async () => {
      try {
        return await api.me(token!);
      } catch (error) {
        // Saved token has expired or is invalid
        if (error instanceof ApiError && error.status === 401) tokenStore.set(null);
        throw error;
      }
    },
    enabled: !!token,
    retry: false,
  });

  const login = useCallback(
    async (email: string, password: string) => {
      const { access_token } = await api.login(email, password);
      const me = await api.me(access_token);
      queryClient.setQueryData(["me", access_token], me);
      tokenStore.set(access_token);
      return me;
    },
    [queryClient],
  );

  const logout = useCallback(() => {
    tokenStore.set(null);
    queryClient.clear();
  }, [queryClient]);

  const replaceToken = useCallback(
    (next: string) => {
      if (user) queryClient.setQueryData(["me", next], user);
      tokenStore.set(next);
    },
    [queryClient, user],
  );

  const ready = hydrated && (!token || !isPending);
  const value = useMemo(
    () => ({ token, user, ready, login, logout, replaceToken }),
    [token, user, ready, login, logout, replaceToken],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
