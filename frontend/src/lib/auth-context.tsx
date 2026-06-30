import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authApi, setToken, clearToken } from "./api";
import { registerForPushIfNeeded, resetPushRegistration } from "./push";
import { storage } from "@/src/utils/storage";

const TOKEN_KEY = "plos_auth_token";

interface AuthState {
  isLoading: boolean;
  isAuthed: boolean;
  user: any | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, full_name: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any | null>(null);

  const refresh = useCallback(async () => {
    try {
      const token = await storage.secureGet<string>(TOKEN_KEY, "");
      if (!token) {
        setUser(null);
        return;
      }
      const me = await authApi.me();
      setUser(me);
    } catch (_e) {
      await clearToken();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setIsLoading(false);
    })();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    await setToken(res.token);
    const me = await authApi.me();
    setUser(me);
    // Register for push (native only; web is a no-op). Non-blocking.
    registerForPushIfNeeded().catch(() => {});
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, full_name: string) => {
      const res = await authApi.register(email, password, full_name);
      await setToken(res.token);
      const me = await authApi.me();
      setUser(me);
      registerForPushIfNeeded().catch(() => {});
    },
    []
  );

  const signOut = useCallback(async () => {
    await clearToken();
    setUser(null);
    resetPushRegistration();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isAuthed: !!user,
        user,
        signIn,
        signUp,
        signOut,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
