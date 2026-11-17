/**
 * File name sanitizing for the downloads API. Chromium refuses a download
 * outright when any path component is not "safe portable", so every segment
 * is cleaned to that standard (which also keeps Windows, macOS and Linux
 * happy).
 */

const ILLEGAL = /[<>:"/\\|?*]/g;
// Control characters, plus invisible direction and zero-width marks that can
// disguise a file's real extension.
const INVISIBLE =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001f\u007f\u0080-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d|conin\$|conout\$)$/i;
// Extensions the shell treats as shortcuts or system hooks; Chromium blocks them.
const SHELL_EXTENSIONS = /\.(lnk|local|scf|url|desktop|sys|cpl|cfg|ini)$/i;

export const MAX_SEGMENT_LENGTH = 120;
export const MAX_PATH_LENGTH = 240;

function truncateKeepingExtension(value: string, max: number): string {
  if (value.length <= max) return value;
  const dot = value.lastIndexOf('.');
  const ext = dot > 0 && value.length - dot <= 12 ? value.slice(dot) : '';
  const stem = value.slice(0, max - ext.length).trimEnd();
  return `${stem}${ext}`;
}

export function sanitizeSegment(input: string, fallback = '_'): string {
  let value = input
    .normalize('NFC')
    .replace(/[\t\n\r]/g, ' ')
    .replace(INVISIBLE, '')
    .replace(ILLEGAL, '_');
  value = value.replace(/\s+/g, ' ').trim();
  value = value.replace(/^[.~\s]+/, '').replace(/[.\s]+$/, '');
  if (!value) value = fallback;
  const stem = value.split('.')[0] ?? value;
  if (RESERVED.test(stem)) value = `_${value}`;
  if (SHELL_EXTENSIONS.test(value)) value = `${value}_`;
  value = truncateKeepingExtension(value, MAX_SEGMENT_LENGTH);
  return value.replace(/[.\s]+$/, '') || fallback;
}

/**
 * Cleans a relative path. Empty segments, `.` and `..` are dropped so a name
 * from the server can never point outside the downloads folder.
 */
export function sanitizePath(input: string): string {
  const segments = input
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .map((segment) => sanitizeSegment(segment));
  if (segments.length === 0) return '_';
  return fitPathLength(segments);
}

/** Shortens the longest folder names first until the whole path fits. */
function fitPathLength(segments: string[]): string {
  const total = () => segments.reduce((sum, s) => sum + s.length, 0) + segments.length - 1;
  while (total() > MAX_PATH_LENGTH) {
    let longest = 0;
    for (let i = 1; i < segments.length - 1; i++) {
      if ((segments[i]?.length ?? 0) > (segments[longest]?.length ?? 0)) longest = i;
    }
    if (segments.length === 1) longest = 0;
    const current = segments[longest] as string;
    const excess = total() - MAX_PATH_LENGTH;
    const target = Math.max(8, current.length - excess);
    if (target >= current.length) {
      // Folders are already minimal: shorten the file name itself.
      const last = segments.length - 1;
      segments[last] = truncateKeepingExtension(
        segments[last] as string,
        Math.max(16, (segments[last] as string).length - excess),
      );
      break;
    }
    segments[longest] =
      longest === segments.length - 1
        ? truncateKeepingExtension(current, target)
        : current.slice(0, target).trimEnd() || '_';
  }
  return segments.join('/');
}
