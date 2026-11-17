// Renders assets/icon.svg into the PNG sizes the manifest and stores need.
// Usage: node scripts/render-icons.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const svg = readFileSync(new URL('../assets/icon.svg', import.meta.url), 'utf8');
const outDir = new URL('../public/icon/', import.meta.url);
mkdirSync(outDir, { recursive: true });

for (const size of [16, 32, 48, 96, 128]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(new URL(`${size}.png`, outDir), png);
  console.log(`icon/${size}.png`);
}
const promo = new Resvg(svg, { fitTo: { mode: 'width', value: 512 } }).render().asPng();
writeFileSync(new URL('../assets/icon-512.png', import.meta.url), promo);
console.log('assets/icon-512.png');
