import { toast } from "@/components/ui/use-toast";

const ERROR_TOAST_MARK = "__wattstatus_error_toast_shown__";
const DEFAULT_ERROR_MESSAGE = "Ocorreu um erro inesperado. Tente novamente.";
const DEFAULT_COOLDOWN_MS = 5000;
const recentErrorToasts = new Map<string, number>();

type ErrorLikeRecord = Record<string, unknown> & {
  [ERROR_TOAST_MARK]?: boolean;
};

export interface NotifyErrorOptions {
  title?: string;
  fallbackMessage?: string;
  message?: string;
  cooldownMs?: number;
  dedupeKey?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getNestedString = (
  source: Record<string, unknown>,
  key: string
): string | null => {
  const value = source[key];
  return typeof value === "string" && value.trim() ? value : null;
};

const translateErrorMessage = (input: string): string => {
  const message = input.trim();
  if (!message) return DEFAULT_ERROR_MESSAGE;

  const directMap: Record<string, string> = {
    "Invalid email": "E-mail inválido.",
    "Required": "Campo obrigatório.",
    "Unauthorized": "Não autorizado.",
    "Forbidden": "Acesso negado.",
    "Not Found": "Recurso não encontrado.",
    "Bad Request": "Requisição inválida.",
    "Internal Server Error": "Erro interno do servidor.",
    "Unexpected error occurred": "Ocorreu um erro inesperado.",
    "Network Error": "Erro de conexão.",
  };

  if (directMap[message]) {
    return directMap[message];
  }

  let translated = message;

  translated = translated.replace(
    /^String must contain at least (\d+) character\(s\)$/i,
    (_, count: string) => `O texto deve ter pelo menos ${count} caracteres.`
  );

  translated = translated.replace(
    /^String must contain at most (\d+) character\(s\)$/i,
    (_, count: string) => `O texto deve ter no máximo ${count} caracteres.`
  );

  translated = translated.replace(
    /^Number must be greater than ([\d.,-]+)$/i,
    (_, min: string) => `O número deve ser maior que ${min}.`
  );

  translated = translated.replace(
    /^Number must be greater than or equal to ([\d.,-]+)$/i,
    (_, min: string) => `O número deve ser maior ou igual a ${min}.`
  );

  translated = translated.replace(
    /^Number must be less than ([\d.,-]+)$/i,
    (_, max: string) => `O número deve ser menor que ${max}.`
  );

  translated = translated.replace(
    /^Number must be less than or equal to ([\d.,-]+)$/i,
    (_, max: string) => `O número deve ser menor ou igual a ${max}.`
  );

  translated = translated.replace(
    /^Expected (.+), received (.+)$/i,
    (_full: string, expected: string, received: string) =>
      `Valor inválido (esperado: ${expected.toLowerCase()}, recebido: ${received.toLowerCase()}).`
  );

  translated = translated.replace(
    /^Invalid input$/i,
    "Entrada inválida."
  );

  translated = translated.replace(
    /^Too many requests$/i,
    "Muitas tentativas. Aguarde e tente novamente."
  );

  return translated;
};

const wasAlreadyNotified = (error: unknown) =>
  isRecord(error) && Boolean((error as ErrorLikeRecord)[ERROR_TOAST_MARK]);

const markAsNotified = (error: unknown) => {
  if (!isRecord(error)) return;

  try {
    (error as ErrorLikeRecord)[ERROR_TOAST_MARK] = true;
  } catch {
    // Some error objects may be frozen/non-extensible.
  }
};

const cleanupRecentErrors = (now: number, ttlMs: number) => {
  recentErrorToasts.forEach((shownAt, key) => {
    if (now - shownAt > ttlMs) {
      recentErrorToasts.delete(key);
    }
  });
};

export const getErrorMessage = (
  error: unknown,
  fallbackMessage = DEFAULT_ERROR_MESSAGE
): string => {
  if (typeof error === "string" && error.trim()) {
    return translateErrorMessage(error);
  }

  if (error instanceof Error && error.message.trim()) {
    return translateErrorMessage(error.message);
  }

  if (isRecord(error)) {
    return translateErrorMessage(
      getNestedString(error, "error") ||
        getNestedString(error, "message") ||
        fallbackMessage
    );
  }

  return translateErrorMessage(fallbackMessage);
};

export const notifyError = (
  error: unknown,
  {
    title = "Não foi possível concluir a ação",
    fallbackMessage = DEFAULT_ERROR_MESSAGE,
    message,
    cooldownMs = DEFAULT_COOLDOWN_MS,
    dedupeKey,
  }: NotifyErrorOptions = {}
) => {
  const resolvedMessage = message || getErrorMessage(error, fallbackMessage);

  if (wasAlreadyNotified(error)) {
    return resolvedMessage;
  }

  const now = Date.now();
  cleanupRecentErrors(now, Math.max(cooldownMs * 2, 15000));

  const key = dedupeKey || `${title}|${resolvedMessage}`;
  const lastShownAt = recentErrorToasts.get(key);
  if (typeof lastShownAt === "number" && now - lastShownAt < cooldownMs) {
    markAsNotified(error);
    return resolvedMessage;
  }

  recentErrorToasts.set(key, now);
  markAsNotified(error);

  toast({
    variant: "destructive",
    duration: 7000,
    title,
    description: resolvedMessage,
  });

  return resolvedMessage;
};
