import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";

// Retries only what a retry can fix: rate limits, server errors and network
// failures. 401/403/404/400 answer the same way the second time.
export const shouldRetry = (failureCount: number, error: unknown) => {
  if (failureCount >= 2) return false;
  if (!(error instanceof ApiError)) return failureCount < 1;
  return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;
};

// Exponential backoff with jitter; a server Retry-After (up to 30 s) wins
// when it asks for a longer wait.
export const retryDelay = (attempt: number, error?: unknown) => {
  const backoff = Math.min(1000 * 2 ** attempt, 8000) + Math.random() * 300;
  const asked = error instanceof ApiError ? error.retryAfterMs : undefined;
  return asked === undefined ? backoff : Math.max(backoff, Math.min(asked, 30_000));
};

// Default: data stays fresh for 30 s, so moving between pages reuses it instead
// of refetching. Hooks with different freshness needs override staleTime.
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        retry: shouldRetry,
        retryDelay,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
