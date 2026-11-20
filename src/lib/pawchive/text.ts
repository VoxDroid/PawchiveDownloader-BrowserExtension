/** Decodes the few HTML entities the sites' post bodies use. */
export function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Converts post body HTML into readable plain text for `content.txt`. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/\r\n?/g, '\n')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*\/\s*(p|div|h[1-6]|li|blockquote|pre|tr)\s*>/gi, '\n')
      .replace(/<\s*li\b[^>]*>/gi, '- ')
      .replace(/<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>(.*?)<\/a>/gi, (_m, _q, href, text) =>
        text && text !== href ? `${text} (${href})` : href,
      )
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' '),
  )
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
