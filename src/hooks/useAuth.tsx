import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest, invalidateCsrfToken } from "@/lib/api";
import { notifyError } from "@/lib/error-toast";
import { toast } from "@/components/ui/use-toast";

interface User { id: string; name: string; email: string; }
interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, confirmPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
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

  const beginRequest = () => {
    currentRequest.current?.abort();
    const controller = new AbortController();
    currentRequest.current = controller;
    generation.current++;
    setLoading(true);
    return { controller, version: generation.current };
  };
  const loadProfile = useCallback(async () => {
    const { controller, version } = beginRequest();
    try {
      const data = await apiRequest<{ user: User }>("/api/auth/me", {
        method: "GET", skipErrorToast: true, signal: controller.signal,
      });
      if (version === generation.current) {
        queryClient.clear();
        setUser((previous) => previous?.id === data.user.id && previous.name === data.user.name && previous.email === data.user.email
          ? previous : data.user);
      }
    } catch (error) {
      if (controller.signal.aborted || version !== generation.current) return;
      if (!(error instanceof ApiError && error.status === 401)) {
        notifyError(error, { title: "Erro ao validar sessão", fallbackMessage: "Não foi possível validar sua sessão." });
      }
      setUser(null);
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [queryClient]);

  useEffect(() => {
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("wattstatus-session");
      channel.current.onmessage = () => {
        queryClient.clear();
        invalidateCsrfToken();
        setUser(null);
        void loadProfile();
      };
    }
    const refreshVisibleSession = () => {
      if (document.visibilityState === "visible" && activeActions.current === 0) void loadProfile();
    };
    const endExpiredSession = () => {
      currentRequest.current?.abort();
      generation.current++;
      setUser(null);
      setLoading(false);
      queryClient.clear();
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
  }, [loadProfile, queryClient]);

  const signIn = async (path: string, body: Record<string, unknown>) => {
    activeActions.current++;
    const { controller, version } = beginRequest();
    try {
      const data = await apiRequest<{ user: User }>(path, {
        method: "POST", body: JSON.stringify(body), signal: controller.signal,
      });
      if (version !== generation.current) return;
      queryClient.clear();
      setUser(data.user);
      channel.current?.postMessage("session-changed");
    } finally {
      activeActions.current--;
      if (version === generation.current) setLoading(false);
    }
  };
  const login = (email: string, password: string) => signIn("/api/auth/login", { email, password });
  const register = (name: string, email: string, password: string, confirmPassword: string) =>
    signIn("/api/auth/register", { name, email, password, confirmPassword, acceptTerms: true });
  const logout = async () => {
    activeActions.current++;
    const { controller, version } = beginRequest();
    try {
      await apiRequest("/api/auth/logout", { method: "POST", body: "{}", signal: controller.signal });
      if (version !== generation.current) return;
      setUser(null);
      queryClient.clear();
      channel.current?.postMessage("session-changed");
      toast({ title: "Logout realizado com sucesso!", description: "Você saiu da sua conta." });
    } catch (error) {
      if (!controller.signal.aborted) {
        notifyError(error, { title: "Não foi possível encerrar a sessão", fallbackMessage: "Tente sair novamente." });
      }
      throw error;
    } finally {
      activeActions.current--;
      if (version === generation.current) setLoading(false);
    }
  };
  return <AuthContext.Provider value={{ user, token: null, loading, login, register, logout, refreshUser: loadProfile }}>
    {children}
  </AuthContext.Provider>;
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
};
