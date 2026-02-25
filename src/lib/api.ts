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
    this.status = status;
  }
}

export const apiRequest = async <T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> => {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: options.credentials || "include",
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = (data && data.error) || response.statusText;
    throw new ApiError(response.status, message);
  }

  return data as T;
};
