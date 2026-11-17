import { describe, expect, it } from 'vitest';
import {
  isRateLimited,
  isTransientStatus,
  parseRetryAfter,
  SiteLimiter,
  siteKey,
} from '../../src/lib/net/limiter';
import { FakeClock, flush } from '../helpers/fake-clock';

const FILE = 'https://n1.pawchive.pw/data/x';

describe('parseRetryAfter', () => {
  it('reads seconds and HTTP dates', () => {
    const now = Date.UTC(2026, 10, 17, 12, 0, 0);
    expect(parseRetryAfter('5', now)).toBe(5000);
    expect(parseRetryAfter('1.5', now)).toBe(1500);
    expect(parseRetryAfter('Tue, 17 Nov 2026 12:00:30 GMT', now)).toBe(30_000);
    expect(parseRetryAfter('Tue, 17 Nov 2026 11:00:00 GMT', now)).toBe(0);
  });

  it('rejects junk', () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('')).toBeNull();
    expect(parseRetryAfter('-3')).toBeNull();
    expect(parseRetryAfter('soon')).toBeNull();
  });
});

describe('status helpers', () => {
  it('detects rate limits', () => {
    expect(isRateLimited(429, null)).toBe(true);
    expect(isRateLimited(503, '10')).toBe(true);
    expect(isRateLimited(503, null)).toBe(false);
    expect(isRateLimited(200, '10')).toBe(false);
  });

  it('detects transient statuses', () => {
    expect([408, 425, 429, 500, 502, 503].every(isTransientStatus)).toBe(true);
    expect([200, 400, 403, 404].some(isTransientStatus)).toBe(false);
  });

  it('groups subdomains into one site', () => {
    expect(siteKey('https://n1.pawchive.pw/x')).toBe('pawchive.pw');
    expect(siteKey('https://pawchive.pw/x')).toBe('pawchive.pw');
    expect(siteKey('http://127.0.0.1:8080/x')).toBe('127.0.0.1');
    expect(siteKey('nope')).toBe('');
  });
});

describe('SiteLimiter', () => {
  it('spaces out starts by the minimum interval', async () => {
    const clock = new FakeClock();
    const limiter = new SiteLimiter({ clock, maxActive: 5, minIntervalMs: 1000 });
    const started: number[] = [];
    for (let i = 0; i < 3; i++) void limiter.acquire(FILE).then(() => started.push(clock.now()));
    await clock.advance(5000);
    expect(started).toEqual([0, 1000, 2000]);
  });

  it('never exceeds the active limit', async () => {
    const clock = new FakeClock();
    const limiter = new SiteLimiter({ clock, maxActive: 2, minIntervalMs: 0 });
    const releases: Array<() => void> = [];
    for (let i = 0; i < 3; i++) void limiter.acquire(FILE).then((r) => releases.push(r));
    await clock.advance(10);
    expect(releases).toHaveLength(2);
    expect(limiter.activeCount).toBe(2);
    releases[0]!();
    releases[0]!(); // releasing twice is harmless
    await flush();
    await clock.advance(1);
    expect(releases).toHaveLength(3);
    expect(limiter.activeCount).toBe(2);
  });

  it('serves waiters in order and honours configure()', async () => {
    const clock = new FakeClock();
    const limiter = new SiteLimiter({ clock, maxActive: 1, minIntervalMs: 0 });
    const order: number[] = [];
    const first = await limiter.acquire(FILE);
    void limiter.acquire(FILE).then(() => order.push(2));
    void limiter.acquire(FILE).then(() => order.push(3));
    await clock.advance(10);
    expect(order).toEqual([]);
    limiter.configure({ maxActive: 3 });
    await clock.advance(10);
    expect(order).toEqual([2, 3]);
    first();
  });

  it('cools the whole site down after a 429 with Retry-After', async () => {
    const clock = new FakeClock();
    const limiter = new SiteLimiter({ clock, minIntervalMs: 0, policy: { resumeSpreadMs: 0 } });
    expect(limiter.note('https://pawchive.pw/api', 429, '10')).toBe(10_000);
    expect(limiter.remaining(FILE)).toBe(10_000);
    let started = false;
    void limiter.acquire(FILE).then(() => (started = true));
    await clock.advance(9_000);
    expect(started).toBe(false);
    await clock.advance(1_000);
    expect(started).toBe(true);
  });

  it('backs off exponentially without Retry-After and resets after success', () => {
    const clock = new FakeClock();
    clock.randomValue = 1;
    const limiter = new SiteLimiter({ clock });
    expect(limiter.note(FILE, 429)).toBe(2000);
    // a second answer during the cooldown is the same strike
    expect(limiter.note(FILE, 429)).toBe(2000);
    clock.time = 3000;
    expect(limiter.note(FILE, 429)).toBe(4000);
    clock.time = 10_000;
    expect(limiter.note(FILE, 200)).toBeNull();
    expect(limiter.note(FILE, 429)).toBe(2000);
  });

  it('clamps cooldowns to the policy bounds', () => {
    const clock = new FakeClock();
    const limiter = new SiteLimiter({ clock });
    expect(limiter.note(FILE, 429, '0')).toBe(1000);
    clock.time = 5000;
    expect(limiter.note(FILE, 429, '99999')).toBe(300_000);
    expect(limiter.note('nope', 429)).toBeNull();
  });

  it('can be penalized and reset', () => {
    const clock = new FakeClock();
    clock.randomValue = 0;
    const limiter = new SiteLimiter({ clock });
    expect(limiter.penalize(FILE, 2)).toBe(4000);
    expect(limiter.backoff(0)).toBe(1000);
    limiter.reset();
    expect(limiter.remaining(FILE)).toBe(0);
  });

  it('rejects waiters that are aborted', async () => {
    const clock = new FakeClock();
    const limiter = new SiteLimiter({ clock, maxActive: 1, minIntervalMs: 0 });
    await limiter.acquire(FILE);
    const controller = new AbortController();
    const pending = limiter.acquire(FILE, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
    const already = new AbortController();
    already.abort();
    await expect(limiter.acquire(FILE, already.signal)).rejects.toThrow();
  });
});
