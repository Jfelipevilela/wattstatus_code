import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest, invalidateCsrfToken, isSessionExpired } from "@/lib/api";
import { notifyError } from "@/lib/error-toast";
import { toast } from "@/components/ui/use-toast";

interface User { id: string; name: string; email: string; }
interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string,
    confirmPassword: string,
    acceptTerms: boolean
  ) => Promise<void>;
  logout: () => Promise<boolean>;
  refreshUser: () => Promise<void>;
  // Set when the session could not be checked (429, 5xx, offline) and no user is known yet.
  sessionError: string | null;
}
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const currentRequest = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const activeActions = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);

  const userRef = useRef<User | null>(null);
  const lastValidated = useRef(0);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const applyUser = useCallback((next: User | null) => {
    // Cached queries belong to one account: drop them only when the account changes.
    if (userRef.current?.id !== next?.id) queryClient.clear();
    userRef.current = next;
    setUser((previous) => previous && next && previous.id === next.id && previous.name === next.name &&
      previous.email === next.email ? previous : next);
  }, [queryClient]);

  // background: revalidate a known session without unmounting protected pages.
  const beginRequest = (background = false) => {
    currentRequest.current?.abort();
    const controller = new AbortController();
    currentRequest.current = controller;
    generation.current++;
    if (!background) setLoading(true);
    return { controller, version: generation.current };
  };
  const loadProfile = useCallback(async (options: { background?: boolean } = {}) => {
    const background = Boolean(options.background && userRef.current);
    const { controller, version } = beginRequest(background);
    try {
      const data = await apiRequest<{ user: User }>("/api/auth/me", {
        method: "GET", skipErrorToast: true, signal: controller.signal,
      });
      if (version === generation.current) {
        lastValidated.current = Date.now();
        setSessionError(null);
        applyUser(data.user);
      }
    } catch (error) {
      if (controller.signal.aborted || version !== generation.current) return;
      if (isSessionExpired(error)) {
        setSessionError(null);
        applyUser(null);
        invalidateCsrfToken();
        return;
      }
      // 429, 5xx, timeouts and offline say nothing about the session: keep the
      // signed-in user and only surface the problem.
      if (userRef.current) {
        if (!background) {
          notifyError(error, { title: "Erro ao validar sessão", fallbackMessage: "Não foi possível validar sua sessão.",
            dedupeKey: "auth:validate" });
        }
        return;
      }
      setSessionError(error instanceof Error && error.message ? error.message : "Não foi possível validar sua sessão.");
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [applyUser]);

  useEffect(() => {
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("wattstatus-session");
      channel.current.onmessage = () => {
        invalidateCsrfToken();
        void loadProfile();
      };
    }
    const refreshVisibleSession = () => {
      // At most once a minute: a quick tab switch does not need a round trip.
      if (document.visibilityState === "visible" && activeActions.current === 0 &&
          Date.now() - lastValidated.current > 60000) void loadProfile({ background: true });
    };
    const endExpiredSession = () => {
      currentRequest.current?.abort();
      generation.current++;
      applyUser(null);
      setLoading(false);
      invalidateCsrfToken();
    };
    window.addEventListener("wattstatus-session-expired", endExpiredSession);
    document.addEventListener("visibilitychange", refreshVisibleSession);
    void loadProfile();
    return () => {
      currentRequest.current?.abort();
      channel.current?.close();
      document.removeEventListener("visibilitychange", refreshVisibleSession);
      window.removeEventListener("wattstatus-session-expired", endExpiredSession);
    };
  }, [loadProfile, applyUser]);

  const signIn = async (path: string, body: Record<string, unknown>) => {
    activeActions.current++;
    const { controller, version } = beginRequest();
    try {
      const data = await apiRequest<{ user: User }>(path, {
        method: "POST", body: JSON.stringify(body), signal: controller.signal,
      });
      if (version !== generation.current) return;
      queryClient.clear();
      userRef.current = data.user;
      lastValidated.current = Date.now();
      setSessionError(null);
      setUser(data.user);
      channel.current?.postMessage("session-changed");
    } finally {
      activeActions.current--;
      if (version === generation.current) setLoading(false);
    }
  };
  const login = (email: string, password: string) => signIn("/api/auth/login", { email, password });
  const register = (name: string, email: string, password: string, confirmPassword: string, acceptTerms: boolean) =>
    signIn("/api/auth/register", { name, email, password, confirmPassword, acceptTerms });
  const logout = async () => {
    activeActions.current++;
    const { controller, version } = beginRequest();
    try {
      await apiRequest("/api/auth/logout", { method: "POST", body: "{}", signal: controller.signal });
      if (version !== generation.current) return false;
      userRef.current = null;
      setUser(null);
      queryClient.clear();
      channel.current?.postMessage("session-changed");
      toast({ title: "Logout realizado com sucesso!", description: "Você saiu da sua conta." });
      return true;
    } catch (error) {
      if (!controller.signal.aborted) {
        notifyError(error, { title: "Não foi possível encerrar a sessão", fallbackMessage: "Tente sair novamente." });
      }
      return false;
    } finally {
      activeActions.current--;
      if (version === generation.current) setLoading(false);
    }
  };
  return <AuthContext.Provider value={{ user, token: null, loading, login, register, logout, refreshUser: () => loadProfile(), sessionError }}>
    {children}
  </AuthContext.Provider>;
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
};
