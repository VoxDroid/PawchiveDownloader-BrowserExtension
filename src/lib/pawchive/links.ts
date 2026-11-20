/**
 * Links to outside file hosts (Mega, Google Drive, Dropbox and the like) and
 * archive passwords found in a post's text. Creators often share the large
 * files there instead of attaching them. A port of the desktop app's
 * `links.rs`, so both find exactly the same links.
 */
import { htmlToText } from './text';

/** Hosts that serve downloads. Matched against the end of the host name. */
const FILE_HOSTS: readonly string[] = [
  'mega.nz',
  'mega.co.nz',
  'mega.io',
  'drive.google.com',
  'docs.google.com',
  'dropbox.com',
  'db.tt',
  'mediafire.com',
  'gofile.io',
  'pixeldrain.com',
  'catbox.moe',
  'workupload.com',
  '1drv.ms',
  'onedrive.live.com',
  'sharepoint.com',
  'box.com',
  'terabox.com',
  '1024terabox.com',
  'krakenfiles.com',
  'files.fm',
  'wetransfer.com',
  'we.tl',
  'send.cm',
  'buzzheavier.com',
  'cyberdrop.me',
  'uploadhaven.com',
  '4shared.com',
  'yadi.sk',
  'disk.yandex.com',
  'disk.yandex.ru',
  'pan.baidu.com',
  'alipan.com',
  'aliyundrive.com',
  'icloud.com',
  'drive.proton.me',
  'swisstransfer.com',
  'filen.io',
  'gigafile.nu',
  'firestorage.jp',
  'xgf.nu',
  'getuploader.com',
  'axfc.net',
  'fileditchfiles.me',
  'qiwi.gg',
  'ranoz.gg',
  'bowfile.com',
];

/** Domains with numbered or changing top-level names (bunkr.si, bunkr.cr...). */
const FILE_HOST_NAMES: readonly string[] = ['bunkr', 'bunkrr'];

/** Hosts the desktop app downloads from itself; the rest are only listed. */
export const APP_DOWNLOADABLE_HOSTS: readonly string[] = [
  'mega.nz',
  'mega.co.nz',
  'mega.io',
  'drive.google.com',
  'docs.google.com',
  'dropbox.com',
  'db.tt',
  'pixeldrain.com',
  'gofile.io',
  'mediafire.com',
];

const HREF_RE = /href\s*=\s*["']([^"']+)["']/gi;
const URL_RE = /\bhttps?:\/\/[^\s<>"'\])]+/gi;
/**
 * "Password: abc", "pass：abc", "PW=abc", "パスワード：abc", "密码：abc". A
 * separator is required, so ordinary text such as "pass the test" is not taken
 * for a password.
 */
const PASSWORD_RE =
  /(?:(?<![\p{L}\p{N}_])(?:password|passwd|pass|pwd|pw|contraseña|senha|passwort|mot de passe|пароль)(?![\p{L}\p{N}_])|パスワード|解凍パス|パス|密码|解压码|提取码|비밀번호|비번)\s*[:：=]\s*[「『"']?([^\s「」『』"'<>]{2,64})/giu;

function hostMatches(host: string, list: readonly string[]): boolean {
  return list.some((h) => host === h || host.endsWith(`.${h}`));
}

function isFileHost(url: URL): boolean {
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (hostMatches(host, FILE_HOSTS)) {
    // Google Docs pages are documents, not downloads, unless shared files.
    return host !== 'docs.google.com' || url.pathname.includes('/file/');
  }
  const labels = host.split('.');
  const name = labels[labels.length - 2];
  return name !== undefined && FILE_HOST_NAMES.includes(name);
}

/** True when the desktop app can download the link itself. */
export function appCanDownload(link: string): boolean {
  try {
    const url = new URL(link);
    return hostMatches(url.hostname.replace(/^www\./, '').toLowerCase(), APP_DOWNLOADABLE_HOSTS);
  } catch {
    return false;
  }
}

function clean(raw: string): URL | null {
  const text = raw
    .trim()
    .replace(/&amp;/g, '&')
    .replace(/[.,;:!?>]+$/, '');
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** File-host links in a post's HTML, in order, without duplicates. */
export function fileHostLinks(contentHtml: string): string[] {
  const text = htmlToText(contentHtml);
  const candidates = [
    ...Array.from(contentHtml.matchAll(HREF_RE), (m) => m[1] ?? ''),
    ...Array.from(text.matchAll(URL_RE), (m) => m[0]),
  ];
  const out: string[] = [];
  for (const raw of candidates) {
    const url = clean(raw);
    if (!url || !isFileHost(url)) continue;
    const s = url.href;
    if (!out.includes(s)) out.push(s);
    if (out.length >= 200) break;
  }
  return out;
}

/** Passwords written next to "password", "pass", "パスワード" and the like. */
export function findPasswords(contentHtml: string): string[] {
  const text = htmlToText(contentHtml);
  const out: string[] = [];
  for (const match of text.matchAll(PASSWORD_RE)) {
    const value = (match[1] ?? '').replace(/[.,;)）]+$/, '');
    // A link is not a password ("Download: https://...").
    if (value.length < 2 || value.startsWith('http') || value.includes('://')) continue;
    if (!out.includes(value)) out.push(value);
    if (out.length >= 20) break;
  }
  return out;
}

/** The text of a `links.txt` file, or null when the post has neither. */
export function linksText(
  title: string,
  url: string,
  links: readonly string[],
  passwords: readonly string[],
): string | null {
  if (links.length === 0 && passwords.length === 0) return null;
  let out = `${title}\n${url}\n`;
  if (links.length > 0) out += `\nLinks\n${links.map((l) => `${l}\n`).join('')}`;
  if (passwords.length > 0) out += `\nPasswords\n${passwords.map((p) => `${p}\n`).join('')}`;
  return out;
}
