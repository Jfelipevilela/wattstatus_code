import { API_BASE, ApiError, apiRequest, getCsrfToken } from "@/lib/api";

// Live progress of a group on/off batch, mirroring the backend queue.
export type PowerState =
  | "na-fila"
  | "enviando"
  | "conferindo"
  | "nao-enviado"
  | "ligado-confirmado"
  | "desligado-confirmado"
  | "comando-enviado-sem-confirmacao"
  | "falhou"
  | "nao-controlavel";

export type PowerEvent =
  | { type: "start"; total: number; items: { applianceId: string; name: string; state: PowerState }[] }
  | { type: "item"; applianceId: string; state: PowerState };

export interface PowerBody {
  action: "on" | "off";
  scope: unknown;
}

// Runs the batch through the streaming endpoint and reports every queue step.
// Browsers or proxies without a readable stream fall back to the plain call,
// which returns the same final result without the intermediate steps.
export const streamPower = async <R>(
  propertyId: string,
  userId: string,
  token: string | undefined,
  body: PowerBody,
  onEvent: (event: PowerEvent) => void,
): Promise<R> => {
  const fallback = () =>
    apiRequest<R>(
      `/api/properties/${propertyId}/power`,
      { method: "POST", headers: { "X-WattStatus-User": userId }, body: JSON.stringify(body), timeoutMs: 35000, skipErrorToast: true },
      token,
    );
  if (typeof fetch !== "function" || typeof TextDecoder === "undefined") return fallback();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40000);
  try {
    const response = await fetch(`${API_BASE}/api/properties/${propertyId}/power/stream`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": await getCsrfToken(),
        "X-WattStatus-User": userId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(response.status, typeof data.error === "string" ? data.error : "Não foi possível concluir o controle.");
    }
    if (!response.body || !/event-stream/.test(response.headers.get("content-type") ?? "")) return (await response.json()) as R;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const chunk = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const event = chunk.match(/^event: (\w+)/m)?.[1];
        const data = chunk.match(/^data: (.*)$/m)?.[1];
        if (!event || !data) continue;
        const parsed = JSON.parse(data);
        if (event === "start" || event === "item") onEvent(parsed as PowerEvent);
        if (event === "done") return parsed as R;
        if (event === "error") throw new ApiError(parsed.status ?? 500, parsed.error ?? "Não foi possível concluir o controle.");
      }
    }
    throw new ApiError(0, "A conexão caiu durante o controle.");
  } finally {
    clearTimeout(timer);
  }
};
