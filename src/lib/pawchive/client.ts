import { abortError, isAbortError, isTransientStatus, SiteLimiter, systemClock, type Clock } from '../net/limiter';
import { normalizeCreator, normalizePost } from './normalize';
import { parseRelayLinks, type RelayIndex } from './relay';
import type { Creator, Post, RawPost, RawProfile, Service } from './types';
import { apiUrls, PAGE_SIZE, pageUrls } from './urls';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get notFound(): boolean {
    return this.status === 404;
  }
}

export interface ClientOptions {
  fetch?: typeof fetch;
  limiter?: SiteLimiter;
  clock?: Clock;
  /** Attempts for network errors and 5xx answers (rate limits do not count). */
  maxRetries?: number;
  /** Rate-limited answers one request may receive before it fails. */
  maxRateLimitRetries?: number;
  /** Minimum gap between two API calls, in ms. */
  minIntervalMs?: number;
  onRetry?: (info: { url: string; attempt: number; delayMs: number; reason: string }) => void;
}

export interface CreatorScanProgress {
  pages: number;
  posts: number;
  offset: number;
}

/**
 * Small client for Pawchive's JSON API. The site (like Kemono) serves JSON only
 * to requests that ask for `text/css`, which is what its own front end sends.
 */
export class PawchiveClient {
  readonly limiter: SiteLimiter;
  private readonly fetchImpl: typeof fetch;
  private readonly clock: Clock;
  private readonly maxRetries: number;
  private readonly maxRateLimitRetries: number;
  private readonly minIntervalMs: number;
  private readonly onRetry?: ClientOptions['onRetry'];
  private nextCallAt = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(options: ClientOptions = {}) {
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.clock = options.clock ?? systemClock;
    this.limiter = options.limiter ?? new SiteLimiter({ clock: this.clock });
    this.maxRetries = Math.max(0, options.maxRetries ?? 4);
    this.maxRateLimitRetries = Math.max(0, options.maxRateLimitRetries ?? 8);
    this.minIntervalMs = Math.max(0, options.minIntervalMs ?? 250);
    this.onRetry = options.onRetry;
  }

  async getPost(service: Service, creatorId: string, postId: string, signal?: AbortSignal): Promise<Post> {
    const raw = await this.json<RawPost | { post: RawPost }>(apiUrls.post(service, creatorId, postId), signal);
    // Kemono wraps the post in { post }, Pawchive returns it bare; accept both.
    const post = 'post' in raw && raw.post ? raw.post : (raw as RawPost);
    if (!post || typeof post !== 'object' || !('id' in post)) {
      throw new ApiError('Unexpected post response', 200, apiUrls.post(service, creatorId, postId));
    }
    return normalizePost(post);
  }

  async getCreator(service: Service, creatorId: string, signal?: AbortSignal): Promise<Creator> {
    return normalizeCreator(await this.json<RawProfile>(apiUrls.profile(service, creatorId), signal));
  }

  async getCreatorPage(
    service: Service,
    creatorId: string,
    offset = 0,
    query: string | null = null,
    signal?: AbortSignal,
  ): Promise<Post[]> {
    const raw = await this.json<RawPost[]>(apiUrls.creatorPosts(service, creatorId, offset, query), signal);
    if (!Array.isArray(raw)) throw new ApiError('Unexpected posts response', 200, apiUrls.creatorPosts(service, creatorId, offset, query));
    return raw.map(normalizePost);
  }

  /** Every post of a creator, newest first, fetched page by page. */
  async getAllCreatorPosts(
    service: Service,
    creatorId: string,
    options: {
      query?: string | null;
      signal?: AbortSignal;
      maxPosts?: number;
      onProgress?: (progress: CreatorScanProgress, page: Post[]) => void;
      /** Stop early once this returns true for a page (e.g. reached known posts). */
      stopWhen?: (page: Post[]) => boolean;
    } = {},
  ): Promise<Post[]> {
    const posts: Post[] = [];
    const seen = new Set<string>();
    const maxPosts = options.maxPosts ?? Number.POSITIVE_INFINITY;
    let offset = 0;
    let pages = 0;
    for (;;) {
      const page = await this.getCreatorPage(service, creatorId, offset, options.query ?? null, options.signal);
      pages += 1;
      for (const post of page) {
        if (seen.has(post.id)) continue;
        seen.add(post.id);
        posts.push(post);
      }
      options.onProgress?.({ pages, posts: posts.length, offset }, page);
      if (page.length < PAGE_SIZE || posts.length >= maxPosts || options.stopWhen?.(page)) break;
      offset += PAGE_SIZE;
    }
    return posts.slice(0, maxPosts);
  }

  async getRecentPosts(offset = 0, query: string | null = null, signal?: AbortSignal): Promise<Post[]> {
    const raw = await this.json<RawPost[]>(apiUrls.recentPosts(offset, query), signal);
    return Array.isArray(raw) ? raw.map(normalizePost) : [];
  }

  /** Temporary relay links for the post's preview-only files. */
  async getRelayIndex(service: Service, creatorId: string, postId: string, signal?: AbortSignal): Promise<RelayIndex> {
    const html = await this.text(pageUrls.post(service, creatorId, postId), signal, 'text/html');
    return parseRelayLinks(html);
  }

  private async json<T>(url: string, signal?: AbortSignal): Promise<T> {
    const body = await this.text(url, signal, 'text/css');
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new ApiError('The site answered with something other than JSON', 200, url);
    }
  }

  private async pace(signal?: AbortSignal): Promise<void> {
    const turn = this.chain.then(async () => {
      const wait = this.nextCallAt - this.clock.now();
      if (wait > 0) await this.clock.sleep(wait, signal);
      this.nextCallAt = this.clock.now() + this.minIntervalMs;
    });
    this.chain = turn.catch(() => undefined);
    await turn;
  }

  private async text(url: string, signal: AbortSignal | undefined, accept: string): Promise<string> {
    let failures = 0;
    let rateLimits = 0;
    for (;;) {
      if (signal?.aborted) throw abortError(signal);
      await this.limiter.waitForSite(url, signal);
      await this.pace(signal);
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          headers: { Accept: accept },
          credentials: 'include',
          signal,
        });
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) throw abortError(signal);
        if (failures >= this.maxRetries) {
          throw new ApiError(error instanceof Error ? error.message : 'Network error', 0, url);
        }
        const delayMs = this.limiter.backoff(failures);
        this.onRetry?.({ url, attempt: failures + 1, delayMs, reason: 'network' });
        failures += 1;
        await this.clock.sleep(delayMs, signal);
        continue;
      }

      const cooldown = this.limiter.note(url, response.status, response.headers.get('Retry-After'));
      if (response.ok) return response.text();
      if (cooldown !== null && rateLimits < this.maxRateLimitRetries) {
        rateLimits += 1;
        this.onRetry?.({ url, attempt: rateLimits, delayMs: cooldown, reason: `HTTP ${response.status}` });
        continue;
      }
      if (isTransientStatus(response.status) && cooldown === null && failures < this.maxRetries) {
        const delayMs = this.limiter.backoff(failures);
        this.onRetry?.({ url, attempt: failures + 1, delayMs, reason: `HTTP ${response.status}` });
        failures += 1;
        await this.clock.sleep(delayMs, signal);
        continue;
      }
      throw new ApiError(`HTTP ${response.status}`, response.status, url);
    }
  }
}
