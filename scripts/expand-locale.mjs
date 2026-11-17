// Expands a compact translation source into a runtime dictionary.
//
// In a source file, plural messages are written once under their base key:
//   - a string, for languages with a single form (ja, ko, zh_CN)
//   - [one, other] for de, es, pt_BR and fr ("many" reuses "other")
//   - [one, few, many] for ru ("other", used for fractions, reuses "few")
// Keys follow the order of en.json, so files stay easy to diff.
//
// Usage: node scripts/expand-locale.mjs <locale> <source.json>
import { readFileSync, writeFileSync } from 'node:fs';

const [locale, sourcePath] = process.argv.slice(2);
if (!locale || !sourcePath) {
  console.error('Usage: node scripts/expand-locale.mjs <locale> <source.json>');
  process.exit(2);
}
const dir = new URL('../src/lib/i18n/locales/', import.meta.url);
const en = JSON.parse(readFileSync(new URL('en.json', dir), 'utf8'));
const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
const tag = locale.replace('_', '-');
const categories = new Intl.PluralRules(tag).resolvedOptions().pluralCategories;
const PLURAL = /_(zero|one|two|few|many|other)$/;

function forms(base, value) {
  if (typeof value === 'string')
    return Object.fromEntries(categories.map((c) => [`${base}_${c}`, value]));
  if (!Array.isArray(value)) throw new Error(`${locale}: "${base}" must be a string or an array`);
  if (locale === 'ru') {
    const [one, few, many] = value;
    return {
      [`${base}_one`]: one,
      [`${base}_few`]: few,
      [`${base}_many`]: many,
      [`${base}_other`]: few,
    };
  }
  const [one, other] = value;
  const out = { [`${base}_one`]: one, [`${base}_other`]: other };
  if (categories.includes('many')) out[`${base}_many`] = other;
  return out;
}

const result = {};
const done = new Set();
const missing = [];
for (const key of Object.keys(en)) {
  const base = key.replace(PLURAL, '');
  if (PLURAL.test(key)) {
    if (done.has(base)) continue;
    done.add(base);
    if (!(base in source)) missing.push(base);
    else Object.assign(result, forms(base, source[base]));
    continue;
  }
  if (!(key in source)) missing.push(key);
  else result[key] = source[key];
}
const extra = Object.keys(source).filter((k) => !(k in result) && !done.has(k));
if (missing.length || extra.length) {
  console.error(
    `${locale}: missing ${missing.join(', ') || '-'}; unknown ${extra.join(', ') || '-'}`,
  );
  process.exit(1);
}
writeFileSync(new URL(`${locale}.json`, dir), `${JSON.stringify(result, null, 2)}\n`);
console.log(`${locale}: ${Object.keys(result).length} messages`);
