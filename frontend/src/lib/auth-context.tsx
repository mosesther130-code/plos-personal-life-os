import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
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
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// Extract session_id from a redirect URL (supports #session_id=... and ?session_id=...)
function extractSessionId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    // hash fragment
    const hashMatch = url.match(/[#&]session_id=([^&]+)/);
    if (hashMatch) return decodeURIComponent(hashMatch[1]);
    // query
    const qMatch = url.match(/[?&]session_id=([^&]+)/);
    if (qMatch) return decodeURIComponent(qMatch[1]);
  } catch (_e) {}
  return null;
}

function cleanUrlAfterAuth() {
  if (Platform.OS !== "web") return;
  try {
    if (typeof window !== "undefined" && window.history && window.location) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  } catch (_e) {}
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any | null>(null);
  const processedSessionRef = useRef<string | null>(null);

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

  // Exchange a session_id from the Emergent redirect for a session_token.
  const processSessionId = useCallback(async (session_id: string) => {
    if (!session_id || processedSessionRef.current === session_id) return;
    processedSessionRef.current = session_id;
    try {
      const res = await authApi.googleSession(session_id);
      await setToken(res.token);
      const me = await authApi.me().catch(() => null);
      setUser(
        me || {
          user_id: res.user_id,
          email: res.email,
          full_name: res.full_name,
        }
      );
      cleanUrlAfterAuth();
      registerForPushIfNeeded().catch(() => {});
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[auth] Google session exchange failed:", (e as any)?.message);
    }
  }, []);

  useEffect(() => {
    (async () => {
      // 1. WEB — check URL for session_id BEFORE checking existing session
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const sid = extractSessionId(window.location.hash) || extractSessionId(window.location.search);
        if (sid) {
          await processSessionId(sid);
          setIsLoading(false);
          return;
        }
      }
      // 2. MOBILE — cold start: check the initial deep link URL
      if (Platform.OS !== "web") {
        try {
          const initialUrl = await Linking.getInitialURL();
          const sid = extractSessionId(initialUrl);
          if (sid) {
            await processSessionId(sid);
            setIsLoading(false);
            return;
          }
        } catch (_e) {}
      }
      // 3. Otherwise: check existing session
      await refresh();
      setIsLoading(false);
    })();

    // Hot-link listener (mobile only) — handles app-open-via-URL while running
    let sub: any = null;
    if (Platform.OS !== "web") {
      sub = Linking.addEventListener("url", ({ url }) => {
        const sid = extractSessionId(url);
        if (sid) processSessionId(sid);
      });
    }
    return () => {
      try { sub?.remove?.(); } catch (_e) {}
    };
  }, [refresh, processSessionId]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    await setToken(res.token);
    const me = await authApi.me();
    setUser(me);
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

  const signInWithGoogle = useCallback(async () => {
    // Emergent-managed Google sign-in. Platform-specific redirect.
    const redirectUrl =
      Platform.OS === "web"
        ? (typeof window !== "undefined" ? window.location.origin + "/" : "/")
        : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

    if (Platform.OS === "web") {
      if (typeof window !== "undefined") {
        window.location.href = authUrl;
      }
      return;
    }
    // Mobile
    try {
      const result: any = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      if (result?.type === "success" && result?.url) {
        const sid = extractSessionId(result.url);
        if (sid) {
          await processSessionId(sid);
        }
      }
      // user cancelled → do nothing (result.type === "cancel" or "dismiss")
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[auth] Google sign-in aborted:", (e as any)?.message);
    }
  }, [processSessionId]);

  const signOut = useCallback(async () => {
    try { await authApi.logout(); } catch (_e) {}
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
        signInWithGoogle,
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
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
