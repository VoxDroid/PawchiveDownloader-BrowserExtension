/**
 * Responsible request pacing for Pawchive, ported from KemonoDownloader's
 * download_policy.py:
 *
 * - at most `maxActive` file transfers at once (Pawchive asks for five),
 * - at least `minIntervalMs` between starting two of them (one a second),
 * - when the site answers 429 (or 503 with Retry-After) every request to it
 *   pauses until the cooldown ends: the server's Retry-After when given,
 *   otherwise an exponential, jittered backoff.
 *
 * Acquisitions are served first come, first served. Time, sleeping and
 * randomness are injectable so the behaviour is testable without waiting.
 */

export interface Clock {
  /** Monotonic milliseconds. */
  now(): number;
  /** Wall clock milliseconds since the epoch (for HTTP dates). */
  wallNow(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  random(): number;
}

export const systemClock: Clock = {
  now: () => performance.now(),
  wallNow: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(abortError(signal));
      const timer = setTimeout(
        () => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        },
        Math.max(0, ms),
      );
      const onAbort = () => {
        clearTimeout(timer);
        reject(abortError(signal));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    }),
  random: () => Math.random(),
};

export function abortError(signal?: AbortSignal): Error {
  const reason: unknown = signal?.reason;
  if (reason instanceof Error) return reason;
  const error = new Error(typeof reason === 'string' ? reason : 'Aborted');
  error.name = 'AbortError';
  return error;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export interface RateLimitPolicy {
  minCooldownMs: number;
  maxCooldownMs: number;
  backoffBaseMs: number;
  backoffCapMs: number;
  /** Spread restarts after a cooldown so waiting workers do not stampede. */
  resumeSpreadMs: number;
}

export const DEFAULT_POLICY: RateLimitPolicy = {
  minCooldownMs: 1_000,
  maxCooldownMs: 300_000,
  backoffBaseMs: 2_000,
  backoffCapMs: 60_000,
  resumeSpreadMs: 1_000,
};

/** Seconds to wait from a Retry-After header (seconds or HTTP date), in ms. */
export function parseRetryAfter(
  value: string | null | undefined,
  wallNow = Date.now(),
): number | null {
  if (value == null) return null;
  const text = value.trim();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text) * 1000);
  if (/^-/.test(text)) return null;
  const when = Date.parse(text);
  if (Number.isNaN(when)) return null;
  return Math.max(0, when - wallNow);
}

export function isRateLimited(status: number, retryAfter: string | null | undefined): boolean {
  if (status === 429) return true;
  return status === 503 && parseRetryAfter(retryAfter) !== null;
}

/** Statuses worth retrying later: timeouts, rate limits and server errors. */
export function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/** `n1.pawchive.pw` and `pawchive.pw` are one site behind one front end. */
export function siteKey(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
  if (/^[\d.]+$/.test(host) || host.includes(':')) return host;
  const labels = host.split('.');
  return labels.length > 2 ? labels.slice(-2).join('.') : host;
}

export interface LimiterOptions {
  maxActive?: number;
  minIntervalMs?: number;
  policy?: Partial<RateLimitPolicy>;
  clock?: Clock;
}

export type Release = () => void;

export class SiteLimiter {
  readonly policy: RateLimitPolicy;
  private readonly clock: Clock;
  private maxActive: number;
  private minIntervalMs: number;
  private active = 0;
  private nextStartAt = 0;
  private readonly cooldownUntil = new Map<string, number>();
  private readonly strikes = new Map<string, number>();
  private chain: Promise<void> = Promise.resolve();
  private slotWaiters: Array<() => void> = [];

  constructor(options: LimiterOptions = {}) {
    this.policy = { ...DEFAULT_POLICY, ...options.policy };
    this.clock = options.clock ?? systemClock;
    this.maxActive = Math.max(1, options.maxActive ?? 5);
    this.minIntervalMs = Math.max(0, options.minIntervalMs ?? 1_000);
  }

  get activeCount(): number {
    return this.active;
  }

  configure(options: { maxActive?: number; minIntervalMs?: number }): void {
    if (options.maxActive !== undefined) this.maxActive = Math.max(1, options.maxActive);
    if (options.minIntervalMs !== undefined)
      this.minIntervalMs = Math.max(0, options.minIntervalMs);
    this.wakeSlotWaiters();
  }

  /** Milliseconds until the site of `url` may be contacted again. */
  remaining(url: string): number {
    const until = this.cooldownUntil.get(siteKey(url)) ?? 0;
    return Math.max(0, until - this.clock.now());
  }

  /**
   * Waits for a transfer slot. Resolves with a release function that must be
   * called once the transfer ends; calling it twice is harmless.
   */
  acquire(url: string, signal?: AbortSignal): Promise<Release> {
    const turn = this.chain.then(() => this.waitForTurn(url, signal));
    this.chain = turn.then(
      () => undefined,
      () => undefined,
    );
    return turn.then(() => {
      let released = false;
      return () => {
        if (released) return;
        released = true;
        this.active = Math.max(0, this.active - 1);
        this.wakeSlotWaiters();
      };
    });
  }

  /**
   * Waits for the site's cooldown and the start interval without taking a
   * slot. For work that already holds a slot and makes several requests in a
   * row, such as building a ZIP archive.
   */
  pace(url: string, signal?: AbortSignal): Promise<void> {
    const turn = this.chain.then(() => this.waitForTurn(url, signal, false));
    this.chain = turn.then(
      () => undefined,
      () => undefined,
    );
    return turn;
  }

  /** Waits out a cooldown without taking a slot (for API requests). */
  async waitForSite(url: string, signal?: AbortSignal): Promise<void> {
    let waited = false;
    for (let left = this.remaining(url); left > 0; left = this.remaining(url)) {
      await this.clock.sleep(left, signal);
      waited = true;
    }
    if (waited && this.policy.resumeSpreadMs > 0) {
      await this.clock.sleep(this.clock.random() * this.policy.resumeSpreadMs, signal);
    }
  }

  private async waitForTurn(url: string, signal?: AbortSignal, takeSlot = true): Promise<void> {
    for (;;) {
      if (signal?.aborted) throw abortError(signal);
      if (this.remaining(url) > 0) {
        await this.waitForSite(url, signal);
        continue;
      }
      if (takeSlot && this.active >= this.maxActive) {
        await this.waitForSlot(signal);
        continue;
      }
      const wait = this.nextStartAt - this.clock.now();
      if (wait > 0) {
        await this.clock.sleep(wait, signal);
        continue;
      }
      break;
    }
    if (takeSlot) this.active += 1;
    this.nextStartAt = this.clock.now() + this.minIntervalMs;
  }

  private waitForSlot(signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(abortError(signal));
      const wake = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      const onAbort = () => {
        this.slotWaiters = this.slotWaiters.filter((w) => w !== wake);
        reject(abortError(signal));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.slotWaiters.push(wake);
    });
  }

  private wakeSlotWaiters(): void {
    const waiters = this.slotWaiters;
    this.slotWaiters = [];
    for (const wake of waiters) wake();
  }

  /**
   * Records an HTTP answer from `url`. Returns the cooldown in ms when it was
   * a rate limit, else null. A success after the cooldown resets the backoff.
   */
  note(url: string, status: number, retryAfter?: string | null): number | null {
    const key = siteKey(url);
    if (!key) return null;
    const now = this.clock.now();
    const until = this.cooldownUntil.get(key) ?? 0;
    if (!isRateLimited(status, retryAfter)) {
      if (status > 0 && status < 400 && now >= until) this.strikes.delete(key);
      return null;
    }
    const cooling = now < until;
    // Answers to requests sent before the cooldown began are one strike, not many.
    const strikes = Math.max(1, (this.strikes.get(key) ?? 0) + (cooling ? 0 : 1));
    this.strikes.set(key, strikes);
    const fromHeader = parseRetryAfter(retryAfter, this.clock.wallNow());
    let delay: number;
    if (fromHeader !== null) delay = fromHeader;
    else if (cooling) delay = 0;
    else delay = this.jittered(strikes - 1);
    delay = Math.min(Math.max(delay, this.policy.minCooldownMs), this.policy.maxCooldownMs);
    const next = Math.max(until, now + delay);
    this.cooldownUntil.set(key, next);
    return next - now;
  }

  /** Puts the whole site on cooldown, e.g. after a failure without a status. */
  penalize(url: string, attempt: number): number {
    const key = siteKey(url);
    const now = this.clock.now();
    const delay = Math.min(
      Math.max(this.jittered(attempt), this.policy.minCooldownMs),
      this.policy.maxCooldownMs,
    );
    const next = Math.max(this.cooldownUntil.get(key) ?? 0, now + delay);
    this.cooldownUntil.set(key, next);
    return next - now;
  }

  /** Jittered exponential backoff for retry `attempt` (0-based), in ms. */
  backoff(attempt: number): number {
    return this.jittered(attempt);
  }

  private jittered(attempt: number): number {
    const full = Math.min(
      this.policy.backoffCapMs,
      this.policy.backoffBaseMs * 2 ** Math.min(Math.max(attempt, 0), 30),
    );
    return full / 2 + (this.clock.random() * full) / 2;
  }

  reset(): void {
    this.cooldownUntil.clear();
    this.strikes.clear();
  }
}
