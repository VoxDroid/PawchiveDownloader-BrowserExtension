import { PawchiveClient } from '../../lib/pawchive/client';
import type { PageRef } from '../../lib/pawchive/types';
import type { PostRef as JobPostRef } from '../../lib/jobs/types';
import { parsePageUrl } from '../../lib/pawchive/urls';

/** What the content script knows about the page it runs on. */
export const page = $state({
  url: location.href,
  ref: parsePageUrl(location.href) as PageRef,
  panelOpen: false,
  selecting: false,
  /** Post cards selected on the page, keyed by `service:creator:post`. */
  selected: {} as Record<string, JobPostRef & { title: string }>,
  /** Cards on the page, in page order. */
  cards: [] as Array<JobPostRef & { title: string }>,
});

export const selectedCount = () => Object.keys(page.selected).length;

export function setUrl(url: string): void {
  if (url === page.url) return;
  page.url = url;
  page.ref = parsePageUrl(url);
  page.selected = {};
}

export function cardKey(ref: JobPostRef): string {
  return `${ref.service}:${ref.creatorId}:${ref.postId}`;
}

export function toggleCard(card: JobPostRef & { title: string }, on?: boolean): void {
  const key = cardKey(card);
  const next = on ?? !page.selected[key];
  if (next) page.selected[key] = card;
  else delete page.selected[key];
}

export function selectAllCards(on: boolean): void {
  if (!on) {
    page.selected = {};
    return;
  }
  for (const card of page.cards) page.selected[cardKey(card)] = card;
}

/**
 * The content script runs on the site's own origin, so API requests are
 * same-origin and carry the user's session like the site's own requests.
 */
export const siteClient = new PawchiveClient({
  fetch: (input, init) => window.fetch(input, init),
  minIntervalMs: 200,
});
