// Process-wide throttle for calls to device clouds. Every group command,
// from any user, goes through the gate of its provider, so a large batch
// cannot flood SmartThings, LG or Tuya (or this server) with requests.
//
// Each provider gets a maximum number of calls in flight and a minimum
// spacing between call starts. Waiting callers are served in arrival order.

export interface GateLimits {
  concurrency: number;
  minIntervalMs: number;
}

// Conservative defaults, well under the documented provider rate limits.
const DEFAULT_LIMITS: Record<string, GateLimits> = {
  smartthings: { concurrency: 4, minIntervalMs: 80 },
  "lg-thinq": { concurrency: 2, minIntervalMs: 200 },
  tuya: { concurrency: 4, minIntervalMs: 60 },
};
const FALLBACK: GateLimits = { concurrency: 2, minIntervalMs: 150 };

class Gate {
  private active = 0;
  private lastStart = 0;
  private waiting: Array<() => void> = [];
  constructor(private limits: GateLimits) {}

  private async acquire(signal?: AbortSignal) {
    if (this.active >= this.limits.concurrency || this.waiting.length) {
      await new Promise<void>((resolve, reject) => {
        const wake = () => { signal?.removeEventListener("abort", abort); resolve(); };
        const abort = () => {
          this.waiting = this.waiting.filter((item) => item !== wake);
          reject(new Error("aborted"));
        };
        if (signal?.aborted) return abort();
        signal?.addEventListener("abort", abort, { once: true });
        this.waiting.push(wake);
      });
    }
    this.active++;
    const wait = this.lastStart + this.limits.minIntervalMs - Date.now();
    this.lastStart = Math.max(Date.now(), this.lastStart + this.limits.minIntervalMs);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }

  private release() {
    this.active--;
    this.waiting.shift()?.();
  }

  async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal);
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  get load() {
    return { active: this.active, waiting: this.waiting.length };
  }
}

const gates = new Map<string, Gate>();

export const providerGate = (provider: string) => {
  let gate = gates.get(provider);
  if (!gate) {
    gate = new Gate(DEFAULT_LIMITS[provider] ?? FALLBACK);
    gates.set(provider, gate);
  }
  return gate;
};

// Test hook: replace the limits of a provider (and drop its queue state).
export const setGateLimits = (provider: string, limits: GateLimits) => {
  gates.set(provider, new Gate(limits));
};
