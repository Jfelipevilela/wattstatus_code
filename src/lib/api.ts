import { notifyError } from "@/lib/error-toast";

// Requests already include "/api/..."; use same-origin as fallback (Netlify rewrite handles /api).
const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:4000");

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type ApiRequestOptions = RequestInit & {
  skipErrorToast?: boolean;
  errorToastTitle?: string;
  errorToastFallback?: string;
  errorToastCooldownMs?: number;
  errorToastDedupeKey?: string;
};

const getDefaultErrorTitle = (status: number) => {
  if (status === 0) return "Falha de conexão";
  if (status === 401 || status === 403) return "Acesso negado";
  if (status === 404) return "Recurso não encontrado";
  if (status >= 500) return "Erro no servidor";
  return "Não foi possível concluir a ação";
};

export const apiRequest = async <T>(
  path: string,
  options: ApiRequestOptions = {},
  token?: string
): Promise<T> => {
  const {
    skipErrorToast = false,
    errorToastTitle,
    errorToastFallback,
    errorToastCooldownMs,
    errorToastDedupeKey,
    ...fetchOptions
  } = options;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      credentials: fetchOptions.credentials || "include",
      headers,
    });
  } catch (err) {
    const networkError =
      err instanceof ApiError
        ? err
        : new ApiError(
            0,
            "Não foi possível conectar ao servidor. Verifique sua internet e tente novamente."
          );

    if (!skipErrorToast) {
      notifyError(networkError, {
        title: errorToastTitle || getDefaultErrorTitle(networkError.status),
        fallbackMessage:
          errorToastFallback ||
          "Não foi possível conectar ao servidor. Tente novamente.",
        cooldownMs: errorToastCooldownMs,
        dedupeKey: errorToastDedupeKey || `api:${path}:network`,
      });
    }

    throw networkError;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      (data && (data.error || data.message)) ||
      response.statusText ||
      "Erro inesperado";
    const apiError = new ApiError(response.status, message);

    if (!skipErrorToast) {
      notifyError(apiError, {
        title: errorToastTitle || getDefaultErrorTitle(response.status),
        fallbackMessage: errorToastFallback,
        cooldownMs: errorToastCooldownMs,
        dedupeKey:
          errorToastDedupeKey ||
          `api:${response.status}:${path}:${typeof message === "string" ? message : ""}`,
      });
    }

    throw apiError;
  }

  return data as T;
};
