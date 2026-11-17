/**
 * @font-face rules for the bundled JetBrains Mono Nerd Font. Fonts declared
 * inside a shadow root are ignored by browsers, so the content script adds
 * these to the page's document; extension pages add them to their own.
 */
const WEIGHTS = [
  ['Regular', 400],
  ['Medium', 500],
  ['SemiBold', 600],
  ['Bold', 700],
] as const;

export const FONT_FAMILY = 'PDL JetBrains Mono';

export function fontFaceCss(urlOf: (path: string) => string): string {
  return WEIGHTS.map(
    ([style, weight]) => `@font-face {
  font-family: '${FONT_FAMILY}';
  src: url('${urlOf(`/fonts/JetBrainsMonoNerdFont-${style}.woff2`)}') format('woff2');
  font-weight: ${weight};
  font-style: normal;
  font-display: block;
}`,
  ).join('\n');
}

export function installFonts(doc: Document, urlOf: (path: string) => string): void {
  if (doc.getElementById('pdl-fonts')) return;
  const style = doc.createElement('style');
  style.id = 'pdl-fonts';
  style.textContent = fontFaceCss(urlOf);
  (doc.head ?? doc.documentElement).append(style);
}
