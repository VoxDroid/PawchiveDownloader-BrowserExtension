/**
 * The bridge to the Pawchive Downloader desktop app (docs/BRIDGE.md in the app
 * repository). The app listens on 127.0.0.1 only, on the first free port of
 * 49517 to 49519, accepts requests from browser-extension origins only, and
 * needs the token it handed out when the user paired with a six-digit code.
 *
 * Jobs are sent in the app's own JobRequest shape, which is the extension's
 * with its services qualified the same way (`patreon@kemono`), so the app
 * downloads exactly what the extension would have.
 */
import type { JobOptions, JobRequest, JobSummary } from './jobs/types';

export const BRIDGE_PORTS: readonly number[] = [49517, 49518, 49519];
/** How long to wait for the app before deciding it is not running. */
export const BRIDGE_TIMEOUT_MS = 1500;

export interface BridgeState {
  token: string | null;
  port: number | null;
  appVersion: string | null;
  pairedAt: number | null;
}

export const EMPTY_BRIDGE: BridgeState = {
  token: null,
  port: null,
  appVersion: null,
  pairedAt: null,
};

export interface BridgeStatus {
  /** The app answered on one of its ports. */
  running: boolean;
  /** The app accepts this extension's token. */
  paired: boolean;
  port: number | null;
  version: string | null;
}

/** A job of the app's queue, as `GET /v1/jobs` lists it. */
export type AppJobSummary = JobSummary & { folder?: string; browseUrl?: string | null };

export type AppJobAction = 'pause' | 'resume' | 'cancel' | 'retry';

export class BridgeError extends Error {
  constructor(
    readonly code:
      | 'not-running'
      | 'not-paired'
      | 'bad-code'
      | 'forbidden'
      | 'http'
      | 'network'
      | 'unknown-action',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'BridgeError';
  }
}

/** The app's job options: the extension's, with thumbnails-only as its own mode. */
export function toAppOptions(options: Partial<JobOptions> | undefined): Record<string, unknown> {
  const o = options ?? {};
  const out: Record<string, unknown> = {};
  if (o.thumbnailsOnly) out.mode = 'thumbnails';
  else if (o.mode) out.mode = o.mode;
  if (o.categories) out.categories = o.categories;
  if (o.saveContent) out.saveContent = o.saveContent;
  if (o.saveMetadata !== undefined) out.saveMetadata = o.saveMetadata;
  if (o.saveComments !== undefined) out.saveComments = o.saveComments;
  if (o.saveAnnouncements !== undefined) out.saveAnnouncements = o.saveAnnouncements;
  if (o.previewOnly) out.previewOnly = o.previewOnly;
  if (o.skipDownloaded !== undefined) out.skipDownloaded = o.skipDownloaded;
  return out;
}

/**
 * The request as the app reads it. The shapes already match; only the options
 * are translated, and fields the app does not know are left out.
 */
export function toAppRequest(request: JobRequest): Record<string, unknown> {
  const options = toAppOptions(request.options);
  switch (request.kind) {
    case 'posts':
      return {
        kind: 'posts',
        title: request.title ?? null,
        creator: request.creator ?? null,
        posts: request.posts.map((p) => ({
          post: p.post,
          ...(p.fileIndexes ? { fileIndexes: p.fileIndexes } : {}),
        })),
        options,
      };
    case 'refs':
      return {
        kind: 'refs',
        title: request.title ?? null,
        creator: request.creator ?? null,
        refs: request.refs,
        options,
      };
    case 'creator':
      return {
        kind: 'creator',
        service: request.service,
        creatorId: request.creatorId,
        query: request.query ?? null,
        ...(request.postIds ? { postIds: request.postIds } : {}),
        since: request.since ?? null,
        options,
      };
  }
}

export interface BridgeDeps {
  fetch: typeof fetch;
  load: () => Promise<BridgeState>;
  save: (state: BridgeState) => Promise<void>;
  timeoutMs?: number;
}

export class AppBridge {
  private readonly timeoutMs: number;

  constructor(private readonly deps: BridgeDeps) {
    this.timeoutMs = deps.timeoutMs ?? BRIDGE_TIMEOUT_MS;
  }

  private async request(
    port: number,
    path: string,
    init: { method?: 'GET' | 'POST'; token?: string | null; body?: unknown } = {},
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers: Record<string, string> = {};
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    try {
      return await this.deps.fetch(`http://127.0.0.1:${port}${path}`, {
        method: init.method ?? 'GET',
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /** The app's answer to /v1/hello on one port, or null when nothing (or something else) answers. */
  private async hello(
    port: number,
    token: string | null,
  ): Promise<{ version: string; paired: boolean } | null> {
    try {
      const response = await this.request(port, '/v1/hello', { token });
      if (!response.ok) return null;
      const body = (await response.json()) as { app?: string; version?: string; paired?: boolean };
      if (body.app !== 'Pawchive Downloader') return null;
      return { version: String(body.version ?? ''), paired: body.paired === true };
    } catch {
      return null;
    }
  }

  /** Finds the app, trying the port it used last first. */
  async status(): Promise<BridgeStatus> {
    const state = await this.deps.load();
    const ports = state.port
      ? [state.port, ...BRIDGE_PORTS.filter((p) => p !== state.port)]
      : [...BRIDGE_PORTS];
    for (const port of ports) {
      const found = await this.hello(port, state.token);
      if (!found) continue;
      if (port !== state.port || found.version !== state.appVersion) {
        await this.deps.save({ ...state, port, appVersion: found.version });
      }
      return {
        running: true,
        paired: Boolean(state.token) && found.paired,
        port,
        version: found.version,
      };
    }
    return { running: false, paired: false, port: null, version: state.appVersion };
  }

  /** Pairs with the code the app shows in Settings > Browser extension. */
  async pair(code: string, name: string): Promise<BridgeStatus> {
    const status = await this.status();
    if (!status.running || status.port === null) throw new BridgeError('not-running');
    const response = await this.request(status.port, '/v1/pair', {
      method: 'POST',
      body: { code: code.replace(/\D/g, ''), name },
    });
    if (response.status === 401) throw new BridgeError('bad-code');
    if (response.status === 403) throw new BridgeError('forbidden');
    if (!response.ok) throw new BridgeError('http', `HTTP ${response.status}`);
    const { token } = (await response.json()) as { token?: string };
    if (!token) throw new BridgeError('http', 'No token in the answer');
    const state = await this.deps.load();
    await this.deps.save({
      ...state,
      token,
      port: status.port,
      appVersion: status.version,
      pairedAt: Date.now(),
    });
    return { ...status, paired: true };
  }

  /** Forgets the pairing here, and asks the app to forget it too. */
  async unpair(): Promise<void> {
    const state = await this.deps.load();
    if (state.token && state.port !== null) {
      // Best effort: a closed app keeps the entry until it is removed there.
      await this.request(state.port, '/v1/unpair', { method: 'POST', token: state.token }).catch(
        () => null,
      );
    }
    await this.deps.save({ ...EMPTY_BRIDGE });
  }

  /**
   * Says hello while paired, so the app can show this browser as connected.
   * Cheap and local; does nothing when not paired.
   */
  async checkIn(): Promise<void> {
    const state = await this.deps.load();
    if (state.token) await this.status().catch(() => null);
  }

  /** Calls the app with the token, finding it first when needed. */
  private async authed(
    path: string,
    init: { method?: 'GET' | 'POST'; body?: unknown } = {},
  ): Promise<Response> {
    const state = await this.deps.load();
    if (!state.token) throw new BridgeError('not-paired');
    let port = state.port;
    let response: Response | null = null;
    if (port !== null) {
      response = await this.request(port, path, { ...init, token: state.token }).catch(() => null);
    }
    if (!response) {
      // The app may have started on another port since.
      const status = await this.status();
      if (!status.running || status.port === null) throw new BridgeError('not-running');
      port = status.port;
      response = await this.request(port, path, { ...init, token: state.token }).catch(() => {
        throw new BridgeError('network');
      });
    }
    if (response.status === 401) throw new BridgeError('not-paired');
    if (response.status === 403) throw new BridgeError('forbidden');
    if (response.status === 400) throw new BridgeError('unknown-action');
    if (!response.ok) throw new BridgeError('http', `HTTP ${response.status}`);
    return response;
  }

  /** Queues a download in the app. */
  async send(request: JobRequest): Promise<{ jobId: string; duplicate: boolean }> {
    const response = await this.authed('/v1/jobs', { method: 'POST', body: toAppRequest(request) });
    const body = (await response.json()) as { jobId?: string; duplicate?: boolean };
    if (!body.jobId) throw new BridgeError('http', 'No job id in the answer');
    return { jobId: body.jobId, duplicate: body.duplicate === true };
  }

  /** The app's download queue. */
  async jobs(): Promise<AppJobSummary[]> {
    const response = await this.authed('/v1/jobs');
    const body = (await response.json()) as unknown;
    return Array.isArray(body) ? (body as AppJobSummary[]) : [];
  }

  async act(jobId: string, action: AppJobAction): Promise<void> {
    await this.authed(`/v1/jobs/${encodeURIComponent(jobId)}/${action}`, { method: 'POST' });
  }

  /** Adds a creator to the app's watchlist; false when it was already there. */
  async watch(service: string, creatorId: string, name: string): Promise<boolean> {
    const response = await this.authed('/v1/watch', {
      method: 'POST',
      body: { service, creatorId, name },
    });
    const body = (await response.json()) as { added?: boolean };
    return body.added === true;
  }
}
