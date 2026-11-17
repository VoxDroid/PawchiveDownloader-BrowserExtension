import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { abortError, isAbortError, isTransientStatus } from '../net/limiter';
import type { FileCategory } from '../pawchive/types';

/**
 * Streams files into ZIP archives without holding them in memory twice:
 * fflate emits the archive in chunks, which are folded into Blobs (that the
 * browser may keep on disk) every few megabytes.
 *
 * Media is stored, not deflated: images, video and archives are already
 * compressed and deflating them only costs time. Archives are split into
 * parts below `maxPartBytes` because fflate writes classic ZIP (no ZIP64).
 */

export interface ZipSpecEntry {
  name: string;
  url?: string;
  text?: string;
  category: FileCategory;
  /** Times this entry broke off mid-download and the part was rebuilt. */
  restarts?: number;
}

export interface ZipSpec {
  entries: ZipSpecEntry[];
  maxPartBytes: number;
  /** Files larger than this are handed back to be downloaded on their own. */
  separateOverBytes: number;
  maxRetries: number;
}

export interface ZipPart {
  blob: Blob;
  size: number;
  /** Names of the entries in this part. */
  names: string[];
}

export interface ZipResult {
  parts: ZipPart[];
  failed: Array<{ name: string; error: string }>;
  deferred: Array<{ name: string; url: string; size: number }>;
}

export interface ZipCallbacks {
  fetch: typeof fetch;
  /** Waits for the site's pacing before each request. */
  pace(url: string, signal: AbortSignal): Promise<void>;
  /** Reports an answer to the shared rate limiter; returns a cooldown if any. */
  note(url: string, status: number, retryAfter: string | null): number | null;
  backoff(attempt: number): number;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  progress(info: { bytes: number; entry: number; entries: number; name: string }): void;
}

const FLUSH_BYTES = 8 * 1024 * 1024;
/** Local header + central directory record + data descriptor, roughly. */
const ENTRY_OVERHEAD = 200;
const STORE_CATEGORIES = new Set<FileCategory>(['image', 'video', 'audio', 'archive', 'document']);

class PartWriter {
  readonly names: string[] = [];
  size = 0;
  private readonly zip: Zip;
  private blobs: Blob[] = [];
  private pending: Uint8Array[] = [];
  private pendingBytes = 0;
  private error: Error | null = null;
  private resolveDone!: () => void;
  private rejectDone!: (error: Error) => void;
  readonly done: Promise<void>;

  constructor() {
    this.done = new Promise<void>((resolve, reject) => {
      this.resolveDone = resolve;
      this.rejectDone = reject;
    });
    this.zip = new Zip((err, chunk, final) => {
      if (err) {
        this.error = err;
        this.rejectDone(err);
        return;
      }
      this.pending.push(chunk);
      this.pendingBytes += chunk.length;
      this.size += chunk.length;
      if (this.pendingBytes >= FLUSH_BYTES || final) this.flush();
      if (final) this.resolveDone();
    });
  }

  private flush(): void {
    if (this.pending.length === 0) return;
    this.blobs.push(new Blob(this.pending as BlobPart[]));
    this.pending = [];
    this.pendingBytes = 0;
  }

  get empty(): boolean {
    return this.names.length === 0;
  }

  throwIfFailed(): void {
    if (this.error) throw this.error;
  }

  addText(name: string, text: string): void {
    const entry = new ZipDeflate(name, { level: 6 });
    entry.mtime = new Date();
    this.zip.add(entry);
    entry.push(new TextEncoder().encode(text), true);
    this.names.push(name);
  }

  /** Starts a streamed entry; returns functions to feed and finish it. */
  open(name: string, store: boolean): { push(chunk: Uint8Array): void; close(): void } {
    const entry = store ? new ZipPassThrough(name) : new ZipDeflate(name, { level: 6 });
    entry.mtime = new Date();
    this.zip.add(entry);
    this.names.push(name);
    return {
      push: (chunk) => entry.push(chunk, false),
      close: () => entry.push(new Uint8Array(0), true),
    };
  }

  async finish(): Promise<ZipPart> {
    this.zip.end();
    await this.done;
    this.flush();
    return {
      blob: new Blob(this.blobs, { type: 'application/zip' }),
      size: this.size,
      names: this.names,
    };
  }

  terminate(): void {
    this.zip.terminate();
  }
}

/** Gives duplicate names a " (2)" suffix so no entry overwrites another. */
export function uniqueNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    if (!used.has(name.toLowerCase())) {
      used.add(name.toLowerCase());
      return name;
    }
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    for (let n = 2; ; n++) {
      const candidate = `${stem} (${n})${ext}`;
      if (!used.has(candidate.toLowerCase())) {
        used.add(candidate.toLowerCase());
        return candidate;
      }
    }
  });
}

class SkipEntry extends Error {
  constructor(readonly size: number) {
    super('too large');
  }
}

export async function buildZip(
  spec: ZipSpec,
  cb: ZipCallbacks,
  signal: AbortSignal,
): Promise<ZipResult> {
  const result: ZipResult = { parts: [], failed: [], deferred: [] };
  const names = uniqueNames(spec.entries.map((e) => e.name));
  let part = new PartWriter();
  let bytes = 0;

  const rollPart = async () => {
    if (part.empty) return;
    result.parts.push(await part.finish());
    part = new PartWriter();
  };

  try {
    for (let i = 0; i < spec.entries.length; i++) {
      if (signal.aborted) throw abortError(signal);
      const entry = spec.entries[i] as ZipSpecEntry;
      const name = names[i] as string;
      cb.progress({ bytes, entry: i, entries: spec.entries.length, name });

      if (entry.text !== undefined) {
        if (part.size + entry.text.length * 3 + ENTRY_OVERHEAD > spec.maxPartBytes)
          await rollPart();
        part.addText(name, entry.text);
        continue;
      }
      if (!entry.url) {
        result.failed.push({ name, error: 'No download link' });
        continue;
      }

      let lastError = 'Unknown error';
      let added = false;
      let rateLimited = 0;
      for (let attempt = 0; attempt <= spec.maxRetries && !added; attempt++) {
        if (attempt > 0) await cb.sleep(cb.backoff(attempt - 1), signal);
        await cb.pace(entry.url, signal);
        let response: Response;
        try {
          response = await cb.fetch(entry.url, { signal, credentials: 'omit' });
        } catch (error) {
          if (isAbortError(error) || signal.aborted) throw abortError(signal);
          lastError = error instanceof Error ? error.message : String(error);
          continue;
        }
        const cooldown = cb.note(entry.url, response.status, response.headers.get('Retry-After'));
        if (!response.ok || !response.body) {
          await response.body?.cancel().catch(() => undefined);
          lastError = `HTTP ${response.status}`;
          if (cooldown !== null && rateLimited < 8) {
            rateLimited += 1;
            attempt -= 1; // waiting out a rate limit does not use up a retry
            continue;
          }
          if (!isTransientStatus(response.status) && response.status !== 403) break;
          continue;
        }

        const length = Number(response.headers.get('Content-Length') ?? Number.NaN);
        if (Number.isFinite(length) && length > spec.separateOverBytes) {
          await response.body.cancel().catch(() => undefined);
          result.deferred.push({ name, url: entry.url, size: length });
          added = true;
          break;
        }
        if (Number.isFinite(length) && part.size + length + ENTRY_OVERHEAD > spec.maxPartBytes)
          await rollPart();

        const writer = part.open(name, STORE_CATEGORIES.has(entry.category));
        const reader = response.body.getReader();
        let received = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.length;
            bytes += value.length;
            if (received > spec.separateOverBytes) throw new SkipEntry(received);
            writer.push(value);
            part.throwIfFailed();
            cb.progress({ bytes, entry: i, entries: spec.entries.length, name });
          }
          writer.close();
          added = true;
        } catch (error) {
          // A half-written entry cannot be removed from a streaming archive,
          // so the part is abandoned and its finished entries are rewritten.
          reader.cancel().catch(() => undefined);
          if (signal.aborted) throw abortError(signal);
          throw Object.assign(new Error('restart-part'), { cause: error, entryIndex: i });
        }
      }
      if (!added) result.failed.push({ name, error: lastError });
    }
    await rollPart();
    return result;
  } catch (error) {
    part.terminate();
    const restart = error as Error & { cause?: unknown; entryIndex?: number };
    if (restart.message === 'restart-part' && restart.entryIndex !== undefined) {
      return restartWithout(spec, cb, signal, restart.entryIndex, restart.cause, result, names);
    }
    throw error;
  }
}

/**
 * An entry failed mid-stream. Everything already finished stays as is; the
 * broken part is rebuilt without the bad entry, which is either deferred
 * (too large) or reported as failed, and the remaining entries continue.
 */
async function restartWithout(
  spec: ZipSpec,
  cb: ZipCallbacks,
  signal: AbortSignal,
  badIndex: number,
  cause: unknown,
  done: ZipResult,
  names: string[],
): Promise<ZipResult> {
  const settled = new Set([
    ...done.parts.flatMap((p) => p.names),
    ...done.failed.map((f) => f.name),
    ...done.deferred.map((d) => d.name),
  ]);
  const bad = spec.entries[badIndex] as ZipSpecEntry;
  const badName = names[badIndex] as string;
  const retried = (bad.restarts ?? 0) < spec.maxRetries;
  if (cause instanceof SkipEntry && bad.url) {
    done.deferred.push({ name: badName, url: bad.url, size: cause.size });
  } else if (!retried) {
    done.failed.push({
      name: badName,
      error: cause instanceof Error ? cause.message : 'Download interrupted',
    });
  }

  const rest: ZipSpecEntry[] = [];
  spec.entries.forEach((entry, i) => {
    const name = names[i] as string;
    if (settled.has(name) || (i === badIndex && (cause instanceof SkipEntry || !retried))) return;
    rest.push({
      ...entry,
      name,
      restarts: i === badIndex ? (entry.restarts ?? 0) + 1 : entry.restarts,
    });
  });
  const tail = await buildZip({ ...spec, entries: rest }, cb, signal);
  return {
    parts: [...done.parts, ...tail.parts],
    failed: [...done.failed, ...tail.failed],
    deferred: [...done.deferred, ...tail.deferred],
  };
}
