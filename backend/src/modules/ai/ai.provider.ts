import Anthropic from "@anthropic-ai/sdk";

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
  // Claude Haiku 5.5 list price (USD per million tokens), for the estimate only.
  priceInput: number(process.env.AI_PRICE_INPUT_PER_MTOK, 0.1),
  priceOutput: number(process.env.AI_PRICE_OUTPUT_PER_MTOK, 0.5),
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
  truncated?: boolean;
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

// Minimal surface of the official SDK client used here, so tests can inject a
// double without network access.
export interface MessagesClient {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: { signal?: AbortSignal; timeout?: number; maxRetries?: number },
    ): PromiseLike<Anthropic.Message>;
  };
}

// Official Anthropic SDK. Retries are owned by completeWithLimits (one,
// for 429/5xx only), so the SDK's own retries are turned off.
export class AnthropicProvider implements ModelProvider {
  readonly name = "anthropic";
  private client: MessagesClient;
  constructor(private config: AIConfig, client?: MessagesClient) {
    this.client = client ?? new Anthropic({
      apiKey: config.apiKey,
      ...(process.env.AI_BASE_URL ? { baseURL: config.baseUrl } : {}),
      maxRetries: 0,
      timeout: config.timeoutMs,
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    let message: Anthropic.Message;
    try {
      message = await this.client.messages.create({
        model: request.model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: request.messages,
        // Short rewrites and one-word classification: lowest effort.
        output_config: { effort: "low" },
      } as Anthropic.MessageCreateParamsNonStreaming, { signal: request.signal, timeout: this.config.timeoutMs, maxRetries: 0 });
    } catch (error) {
      if (error instanceof Anthropic.APIUserAbortError) throw new ProviderError("Solicitação cancelada", null, false);
      if (error instanceof Anthropic.APIConnectionTimeoutError) throw new ProviderError("Tempo esgotado no provedor", null, false);
      if (error instanceof Anthropic.RateLimitError) throw new ProviderError("Provedor respondeu 429", 429, true);
      if (error instanceof Anthropic.APIError) {
        const status = typeof error.status === "number" ? error.status : null;
        throw new ProviderError(`Provedor respondeu ${status ?? "erro"}`, status, status !== null && status >= 500);
      }
      throw new ProviderError("Falha de conexão com o provedor", null, true);
    }
    if (message.stop_reason === "refusal") throw new ProviderError("Provedor recusou a solicitação", 200, false);
    return {
      text: message.content.filter((block): block is Anthropic.TextBlock => block.type === "text").map((block) => block.text).join("").trim(),
      inputTokens: message.usage?.input_tokens ?? 0,
      outputTokens: message.usage?.output_tokens ?? 0,
      model: message.model ?? request.model,
      truncated: message.stop_reason === "max_tokens",
    };
  }
}

export const createProvider = (config: AIConfig): ModelProvider | null => {
  if (!config.enabled || !config.apiKey) return null;
  if (config.provider === "anthropic") return new AnthropicProvider(config);
  return null;
};

// One call with a hard timeout, external cancellation (client disconnect) and
// at most one retry on 429/5xx/connection errors.
export const completeWithLimits = async (
  provider: ModelProvider,
  request: CompletionRequest,
  timeoutMs: number,
  retries = 1,
): Promise<CompletionResult> => {
  for (let attempt = 0; ; attempt++) {
    if (request.signal?.aborted) throw new ProviderError("Solicitação cancelada", null, false);
    const controller = new AbortController();
    const cancel = () => controller.abort();
    request.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, timeoutMs);
    try {
      return await provider.complete({ ...request, signal: controller.signal });
    } catch (error) {
      if (request.signal?.aborted) throw new ProviderError("Solicitação cancelada", null, false);
      if (controller.signal.aborted) throw new ProviderError("Tempo esgotado no provedor", null, false);
      const retryable = error instanceof ProviderError && error.retryable;
      if (!retryable || attempt >= retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", cancel);
    }
  }
};
