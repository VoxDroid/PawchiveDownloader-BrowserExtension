import type { Clock } from '../../src/lib/net/limiter';

interface Sleeper {
  at: number;
  resolve: () => void;
  reject: (error: Error) => void;
}

/** A clock that only moves when the test says so. */
export class FakeClock implements Clock {
  time = 0;
  wall = Date.UTC(2026, 10, 17, 12, 0, 0);
  randomValue = 0.5;
  private sleepers: Sleeper[] = [];

  now(): number {
    return this.time;
  }

  wallNow(): number {
    return this.wall + this.time;
  }

  random(): number {
    return this.randomValue;
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const sleeper: Sleeper = { at: this.time + Math.max(0, ms), resolve, reject };
      if (signal?.aborted) {
        reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        return;
      }
      signal?.addEventListener('abort', () => {
        this.sleepers = this.sleepers.filter((s) => s !== sleeper);
        reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      });
      this.sleepers.push(sleeper);
    });
  }

  get pending(): number {
    return this.sleepers.length;
  }

  /** Moves time forward, waking sleepers in order and letting promises settle. */
  async advance(ms: number): Promise<void> {
    const end = this.time + ms;
    for (;;) {
      await flush();
      const next = this.sleepers.filter((s) => s.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.time = Math.max(this.time, next.at);
      this.sleepers = this.sleepers.filter((s) => s !== next);
      next.resolve();
    }
    this.time = end;
    await flush();
  }
}

export async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
