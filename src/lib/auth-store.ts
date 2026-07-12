"use client";

import { create } from "zustand";
import type { AuthUser } from "./types";

/**
 * Real authentication client. No credentials or user data are hardcoded or
 * persisted client-side anymore — the session lives entirely in the
 * httpOnly JWT cookie set by /api/auth/login. This store just reflects
 * whatever the server confirms via /api/auth/me.
 */
interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  loading: false,
  hydrated: false,

  hydrate: async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      set({ user: data.user ?? null, hydrated: true });
    } catch {
      set({ user: null, hydrated: true });
    }
  },

  login: async (email, password) => {
    set({ loading: true });
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        set({ loading: false });
        return { ok: false, error: data.error ?? "Login failed." };
      }
      set({ user: data.user, loading: false });
      return { ok: true };
    } catch {
      set({ loading: false });
      return { ok: false, error: "Network error — could not reach the server." };
    }
  },

  logout: async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    set({ user: null });
  },
}));
