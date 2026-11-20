/**
 * The sites the extension downloads from. Pawchive, Kemono and Coomer run the
 * same software, so one client, planner and engine serve all three.
 *
 * A service is written bare for Pawchive (`patreon`) and with its site for the
 * others (`patreon@kemono`), exactly as the desktop app does, so keys, history,
 * the watchlist and jobs sent to the app through the bridge mean the same
 * thing on both sides, and everything saved before other sites existed keeps
 * working.
 */

export type Site = 'pawchive' | 'kemono' | 'coomer';

export interface SiteInfo {
  id: Site;
  name: string;
  /** The host the extension talks to. */
  host: string;
  /** Every domain the site used, current first; old links still open. */
  domains: readonly string[];
}

export const SITES: Readonly<Record<Site, SiteInfo>> = {
  pawchive: { id: 'pawchive', name: 'Pawchive', host: 'pawchive.pw', domains: ['pawchive.pw'] },
  kemono: {
    id: 'kemono',
    name: 'Kemono',
    host: 'kemono.cr',
    domains: ['kemono.cr', 'kemono.su', 'kemono.party'],
  },
  coomer: {
    id: 'coomer',
    name: 'Coomer',
    host: 'coomer.st',
    domains: ['coomer.st', 'coomer.su', 'coomer.party'],
  },
};

export const SITE_IDS: readonly Site[] = ['pawchive', 'kemono', 'coomer'];

export function isSite(value: unknown): value is Site {
  return typeof value === 'string' && (SITE_IDS as readonly string[]).includes(value);
}

export function siteName(site: Site): string {
  return SITES[site].name;
}

export function siteOrigin(site: Site): string {
  return `https://${SITES[site].host}`;
}

export function apiBase(site: Site): string {
  return `${siteOrigin(site)}/api/v1`;
}

export function thumbnailOrigin(site: Site): string {
  return `https://img.${SITES[site].host}`;
}

/** Where creator icons and banners live. */
export function imageOrigin(site: Site): string {
  return site === 'pawchive' ? siteOrigin(site) : thumbnailOrigin(site);
}

/** The site a host belongs to, subdomains included (n1., img., www.). */
export function siteFromHost(hostname: string): Site | null {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  for (const site of SITE_IDS) {
    if (SITES[site].domains.some((d) => host === d || host.endsWith(`.${d}`))) return site;
  }
  return null;
}

/** The site a URL belongs to, or null. Only https counts. */
export function siteFromUrl(url: string): Site | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? siteFromHost(parsed.hostname) : null;
  } catch {
    return null;
  }
}

/** True when the host is exactly one of the site's own domains (no media server). */
export function isSitePageHost(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '');
  return SITE_IDS.some((site) => SITES[site].domains.includes(host));
}

/** Splits `patreon@kemono` into the site and the bare service. */
export function splitService(service: string): { site: Site; bare: string } {
  const at = service.lastIndexOf('@');
  if (at < 0) return { site: 'pawchive', bare: service };
  const site = service.slice(at + 1).toLowerCase();
  return { site: isSite(site) ? site : 'pawchive', bare: service.slice(0, at) };
}

/** The service as the extension stores it: bare on Pawchive, `bare@site` elsewhere. */
export function qualify(site: Site, service: string): string {
  const { bare } = splitService(service);
  return site === 'pawchive' ? bare : `${bare}@${site}`;
}

/** The site a (possibly qualified) service belongs to. */
export function siteOfService(service: string): Site {
  return splitService(service).site;
}

/** The bare service, as the site shows it (`patreon` for `patreon@kemono`). */
export function bareService(service: string): string {
  return splitService(service).bare;
}

/** Host-permission match patterns for every domain of every site. */
export const SITE_MATCHES: readonly string[] = SITE_IDS.flatMap((site) =>
  SITES[site].domains.flatMap((d) => [`https://${d}/*`, `https://*.${d}/*`]),
);

/** Match patterns for the sites' pages only (where the panel runs). */
export const SITE_PAGE_MATCHES: readonly string[] = SITE_IDS.flatMap((site) =>
  SITES[site].domains.flatMap((d) => [`https://${d}/*`, `https://www.${d}/*`]),
);
