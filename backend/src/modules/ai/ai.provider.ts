// Model provider abstraction. The provider only ever receives facts already
// computed by the engine; it never gets database access, ids it can act on
// or integration tokens.
const number = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const aiConfig = () => ({
  enabled: process.env.AI_ENABLED === "true",
  provider: (process.env.AI_PROVIDER || "anthropic").toLowerCase(),
  apiKey: process.env.AI_API_KEY || "",
  baseUrl: process.env.AI_BASE_URL || "https://api.anthropic.com",
  modelFast: process.env.AI_MODEL_FAST || "claude-haiku-5-5",
  modelReasoning: process.env.AI_MODEL_REASONING || "claude-sonnet-5-5",
  maxOutputTokens: number(process.env.AI_MAX_OUTPUT_TOKENS, 500),
  timeoutMs: number(process.env.AI_REQUEST_TIMEOUT_MS, 12000),
  maxToolCalls: number(process.env.AI_MAX_TOOL_CALLS, 2),
  dailyUserBudget: number(process.env.AI_DAILY_USER_BUDGET, 60),
  monthlyGlobalBudget: number(process.env.AI_MONTHLY_GLOBAL_BUDGET, 20000),
  maxConcurrent: number(process.env.AI_MAX_CONCURRENT_REQUESTS, 4),
  // USD per million tokens, for the cost estimate only.
  priceInput: number(process.env.AI_PRICE_INPUT_PER_MTOK, 1),
  priceOutput: number(process.env.AI_PRICE_OUTPUT_PER_MTOK, 5),
});
export type AIConfig = ReturnType<typeof aiConfig>;

export interface CompletionRequest {
  model: string;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
  signal?: AbortSignal;
}
export interface CompletionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}
export interface ModelProvider {
  readonly name: string;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

export class ProviderError extends Error {
  constructor(message: string, public readonly status: number | null, public readonly retryable: boolean) {
    super(message);
    this.name = "ProviderError";
  }
}

// Anthropic Messages API over fetch: no SDK in the bundle.
export class AnthropicProvider implements ModelProvider {
  readonly name = "anthropic";
  constructor(private config: AIConfig, private fetchImpl: typeof fetch = fetch) {}

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const response = await this.fetchImpl(`${this.config.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: request.messages,
      }),
      signal: request.signal,
    });
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new ProviderError(`Provedor respondeu ${response.status}`, response.status, retryable);
    }
    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      model?: string;
    };
    return {
      text: (data.content ?? []).filter((part) => part.type === "text").map((part) => part.text ?? "").join("").trim(),
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      model: data.model ?? request.model,
    };
  }
}

export const createProvider = (config: AIConfig): ModelProvider | null => {
  if (!config.enabled || !config.apiKey) return null;
  if (config.provider === "anthropic") return new AnthropicProvider(config);
  return null;
};

// One call with a hard timeout and at most one retry on 429/5xx.
export const completeWithLimits = async (
  provider: ModelProvider,
  request: Omit<CompletionRequest, "signal">,
  timeoutMs: number,
  retries = 1,
): Promise<CompletionResult> => {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await provider.complete({ ...request, signal: controller.signal });
    } catch (error) {
      const retryable = error instanceof ProviderError && error.retryable;
      if (!retryable || attempt >= retries) {
        if (controller.signal.aborted) throw new ProviderError("Tempo esgotado no provedor", null, false);
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
};
