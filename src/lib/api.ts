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
  timeoutMs?: number;
  skipErrorToast?: boolean;
  errorToastTitle?: string;
  errorToastFallback?: string;
  errorToastCooldownMs?: number;
  errorToastDedupeKey?: string;
};

let csrfToken: string | null = null;
let csrfRequest: Promise<string> | null = null;
let csrfGeneration = 0;
export const invalidateCsrfToken = () => { csrfGeneration++; csrfToken = null; csrfRequest = null; };
const getCsrfToken = async () => {
  if (csrfToken) return csrfToken;
  if (!csrfRequest) {
    const version = csrfGeneration;
    csrfRequest = apiRequest<{ csrfToken: string }>("/api/auth/csrf", { skipErrorToast: true })
      .then((data) => { if (version === csrfGeneration) csrfToken = data.csrfToken; return data.csrfToken; })
      .finally(() => { if (version === csrfGeneration) csrfRequest = null; });
  }
  return csrfRequest;
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
    timeoutMs = 15000,
    ...fetchOptions
  } = options;

  const headers = new Headers(fetchOptions.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const mutation = !["GET", "HEAD", "OPTIONS"].includes((fetchOptions.method || "GET").toUpperCase());
  if (mutation) headers.set("X-CSRF-Token", await getCsrfToken());
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (fetchOptions.signal?.aborted) controller.abort();
  fetchOptions.signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, timeoutMs);

  let response: Response;
  let data: Record<string, unknown>;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      credentials: fetchOptions.credentials || "include",
      headers,
      signal: controller.signal,
    });
    if (mutation && response.status === 403) {
      const rejected = await response.clone().json().catch(() => ({}));
      if (rejected.code === "CSRF_INVALID") {
        invalidateCsrfToken();
        headers.set("X-CSRF-Token", await getCsrfToken());
        response = await fetch(`${API_BASE}${path}`, {
          ...fetchOptions, credentials: fetchOptions.credentials || "include", headers, signal: controller.signal,
        });
      }
    }
    data = response.status === 204 ? {} : await response.json();
  } catch (err) {
    if (fetchOptions.signal?.aborted) throw err;
    const networkError =
      err instanceof ApiError
        ? err
        : new ApiError(
            0,
            controller.signal.aborted ? "A solicitação demorou demais. Tente novamente."
              : "Não foi possível conectar ao servidor. Verifique sua internet e tente novamente."
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
  } finally {
    clearTimeout(timeout);
    fetchOptions.signal?.removeEventListener("abort", abort);
  }

  if (fetchOptions.signal?.aborted) throw new DOMException("Solicitação cancelada", "AbortError");
  if (!response.ok) {
    const message =
      (typeof data.error === "string" ? data.error : typeof data.message === "string" ? data.message : "") ||
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

    if (response.status === 401 && !["/api/auth/login", "/api/auth/register"].includes(path)) {
      window.dispatchEvent(new Event("wattstatus-session-expired"));
    }
    throw apiError;
  }

  if (mutation && ["/api/auth/login", "/api/auth/register", "/api/auth/logout"].includes(path)) invalidateCsrfToken();
  return data as T;
};
