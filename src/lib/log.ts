import type { LogLevel } from './settings';

export interface LogEntry {
  id: number;
  at: number;
  level: LogLevel;
  scope: string;
  message: string;
  detail?: string;
}

const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface Logger {
  debug(message: string, detail?: unknown): void;
  info(message: string, detail?: unknown): void;
  warn(message: string, detail?: unknown): void;
  error(message: string, detail?: unknown): void;
  scope(name: string): Logger;
}

function describe(detail: unknown): string | undefined {
  if (detail === undefined) return undefined;
  if (detail instanceof Error) return detail.stack ?? `${detail.name}: ${detail.message}`;
  if (typeof detail === 'string') return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

/** A bounded, in-memory log the dashboard can show, search and export. */
export class LogBook {
  private entries: LogEntry[] = [];
  private nextId = 1;
  private listeners = new Set<(entry: LogEntry) => void>();

  constructor(
    private readonly capacity = 2000,
    public level: LogLevel = 'info',
  ) {}

  add(level: LogLevel, scope: string, message: string, detail?: unknown): void {
    if (RANK[level] < RANK[this.level]) return;
    const entry: LogEntry = {
      id: this.nextId++,
      at: Date.now(),
      level,
      scope,
      message,
      detail: describe(detail),
    };
    this.entries.push(entry);
    if (this.entries.length > this.capacity)
      this.entries.splice(0, this.entries.length - this.capacity);
    for (const listener of this.listeners) listener(entry);
    if (level === 'error') console.error(`[${scope}] ${message}`, detail ?? '');
  }

  logger(scope: string): Logger {
    return {
      debug: (m, d) => this.add('debug', scope, m, d),
      info: (m, d) => this.add('info', scope, m, d),
      warn: (m, d) => this.add('warn', scope, m, d),
      error: (m, d) => this.add('error', scope, m, d),
      scope: (name) => this.logger(`${scope}/${name}`),
    };
  }

  list(): LogEntry[] {
    return [...this.entries];
  }

  restore(entries: readonly LogEntry[]): void {
    this.entries = [...entries, ...this.entries].slice(-this.capacity);
    this.nextId = Math.max(this.nextId, ...this.entries.map((e) => e.id + 1));
  }

  clear(): void {
    this.entries = [];
  }

  subscribe(listener: (entry: LogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function formatLog(entries: readonly LogEntry[]): string {
  return entries
    .map(
      (e) =>
        `${new Date(e.at).toISOString()} ${e.level.toUpperCase().padEnd(5)} [${e.scope}] ${e.message}${e.detail ? `\n    ${e.detail.replace(/\n/g, '\n    ')}` : ''}`,
    )
    .join('\n');
}
