import { create } from "zustand";
import type { CurrentUser } from "../types";
import * as api from "../lib/api";

interface AuthState {
  user: CurrentUser | null;
  checking: boolean;
  error: string | null;

  checkSession: () => Promise<void>;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  checking: true,
  error: null,

  checkSession: async () => {
    try {
      const user = await api.me();
      set({ user, checking: false });
    } catch {
      set({ user: null, checking: false });
    }
  },

  login: async (username, password) => {
    set({ error: null });
    try {
      const user = await api.login(username, password);
      set({ user });
      return true;
    } catch (err) {
      const message = err instanceof api.ApiError ? err.message : "Falha de conexão";
      set({ error: message });
      return false;
    }
  },

  logout: async () => {
    await api.logout().catch(() => null);
    set({ user: null });
  },
}));
