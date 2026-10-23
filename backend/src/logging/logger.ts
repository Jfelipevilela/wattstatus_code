import { AsyncLocalStorage } from "async_hooks";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  requestId?: string;
  route?: string;
  method?: string;
  userId?: string;
}

type LogFields = Record<string, unknown>;

const contextStorage = new AsyncLocalStorage<LogContext>();
const sensitiveKey =
  /(?:password|passwordhash|token|authorization|cookie|secret|api[-_]?key|credential|connectionstring|mongo(?:db)?url)/i;

const redactString = (value: string) =>
  value
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]")
    .replace(/(mongodb(?:\+srv)?:\/\/)[^@\s/]+@/gi, "$1[REDACTED]@")
    .replace(/([?&](?:token|api[_-]?key|secret)=)[^&\s]+/gi, "$1[REDACTED]");

export const sanitizeForLog = (
  value: unknown,
  seen: WeakSet<object> = new WeakSet()
): unknown => {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (value instanceof Error) {
    const error = value as Error & { code?: unknown; status?: unknown };
    return {
      name: error.name,
      ...(error.code !== undefined ? { code: error.code } : {}),
      ...(error.status !== undefined ? { status: error.status } : {}),
      ...(process.env.NODE_ENV !== "production" && error.stack
        ? { stackFrames: redactString(error.stack.split("\n").slice(1, 8).join("\n")) }
        : {}),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      sensitiveKey.test(key) ? "[REDACTED]" : sanitizeForLog(item, seen),
    ])
  );
};

export const runWithLogContext = <T>(context: LogContext, callback: () => T) =>
  contextStorage.run(context, callback);

export const updateLogContext = (fields: Partial<LogContext>) => {
  const context = contextStorage.getStore();
  if (context) Object.assign(context, fields);
};

export const getLogContext = () => contextStorage.getStore() || {};

const write = (level: LogLevel, event: string, fields: LogFields = {}) => {
  if (level === "debug" && process.env.NODE_ENV === "production") return;

  const entry = sanitizeForLog({
    ...fields,
    ...getLogContext(),
    timestamp: new Date().toISOString(),
    level,
    event,
    service: "wattstatus-backend",
  });
  const line = `${JSON.stringify(entry)}\n`;
  (level === "error" ? process.stderr : process.stdout).write(line);
};

export const logger = {
  debug: (event: string, fields?: LogFields) => write("debug", event, fields),
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  error: (event: string, fields?: LogFields) => write("error", event, fields),
};

export const getErrorFields = (error: unknown) => {
  const candidate = error as {
    name?: string;
    code?: string;
    message?: string;
    response?: { status?: number };
  };
  const statusCode = candidate?.response?.status;
  const code = candidate?.code;
  let reason = "unexpected_error";

  if (code === "ECONNABORTED" || code === "ETIMEDOUT") reason = "timeout";
  else if (statusCode === 401) reason = "invalid_or_expired_token";
  else if (statusCode === 403) reason = "permission_denied";
  else if (statusCode === 404) reason = "not_found_or_offline";
  else if (statusCode && statusCode >= 500) reason = "upstream_unavailable";
  else if (code) reason = "service_error";

  return {
    errorCode: code || (statusCode ? `HTTP_${statusCode}` : undefined),
    reason,
    error: sanitizeForLog(error),
  };
};
