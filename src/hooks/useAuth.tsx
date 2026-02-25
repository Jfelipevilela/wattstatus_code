import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { ApiError, apiRequest } from "@/lib/api";
import { notifyError } from "@/lib/error-toast";
import { toast } from "@/components/ui/use-toast";

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string,
    confirmPassword: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(
    async (activeToken?: string | null) => {
      setLoading(true);
      try {
        const data = await apiRequest<{ user: User }>(
          "/api/auth/me",
          { method: "GET", skipErrorToast: true },
          activeToken
        );
        setUser(data.user);
        setToken(activeToken || null);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 401)) {
          notifyError(err, {
            title: "Erro ao validar sessão",
            fallbackMessage: "Não foi possível validar sua sessão.",
          });
        }
        setUser(null);
        setToken(null);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const data = await apiRequest<{ token: string; user: User }>(
        "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ email, password }),
        }
      );
      setUser(data.user);
      setToken(data.token);
    } finally {
      setLoading(false);
    }
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    confirmPassword: string
  ) => {
    setLoading(true);
    try {
      const data = await apiRequest<{ token: string; user: User }>(
        "/api/auth/register",
        {
          method: "POST",
          body: JSON.stringify({ name, email, password, confirmPassword }),
        }
      );
      setUser(data.user);
      setToken(data.token);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    const shouldNotifyLogout = Boolean(user || token);
    setLoading(true);
    try {
      await apiRequest(
        "/api/auth/logout",
        { method: "POST", skipErrorToast: true },
        token || undefined
      );
    } catch {
      // ignore logout errors to avoid trapping user
    } finally {
      setUser(null);
      setToken(null);
      setLoading(false);
      if (shouldNotifyLogout) {
        toast({
          title: "Logout realizado com sucesso!",
          description: "Você saiu da sua conta.",
        });
      }
    }
  };

  const refreshUser = async () => {
    await loadProfile(token);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
};
