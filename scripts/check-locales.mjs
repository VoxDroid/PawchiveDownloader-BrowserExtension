// Verifies the translations:
//  - every locale has exactly the keys English has (plural forms aside),
//  - every plural message has the forms its language needs (CLDR),
//  - every {placeholder} in English also appears in the translation,
//  - every static t('key') used in the source exists in English,
//  - the _locales manifest strings exist for every locale.
// Usage: node scripts/check-locales.mjs [--list-used]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const localesDir = join(root, 'src/lib/i18n/locales');
const LOCALES = {
  en: 'en',
  ja: 'ja',
  ko: 'ko',
  zh_CN: 'zh-CN',
  es: 'es',
  pt_BR: 'pt-BR',
  ru: 'ru',
  de: 'de',
  fr: 'fr',
};
const PLURAL = /_(zero|one|two|few|many|other)$/;
const problems = [];

const load = (name) => JSON.parse(readFileSync(join(localesDir, `${name}.json`), 'utf8'));
const en = load('en');
const base = (key) => key.replace(PLURAL, '');
const placeholders = (text) => new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));

const enBases = new Set(Object.keys(en).map(base));
const enPlural = new Set(
  Object.keys(en)
    .filter((k) => PLURAL.test(k))
    .map(base),
);

for (const [locale, tag] of Object.entries(LOCALES)) {
  const dict = load(locale);
  const keys = Object.keys(dict);
  const bases = new Set(keys.map(base));
  for (const key of enBases) if (!bases.has(key)) problems.push(`${locale}: missing "${key}"`);
  for (const key of bases) if (!enBases.has(key)) problems.push(`${locale}: unknown "${key}"`);

  const needed = new Intl.PluralRules(tag).resolvedOptions().pluralCategories;
  for (const key of enPlural) {
    if (!bases.has(key)) continue;
    for (const category of needed) {
      if (!(`${key}_${category}` in dict))
        problems.push(`${locale}: "${key}" needs the "${category}" form`);
    }
  }
  for (const [key, value] of Object.entries(dict)) {
    if (typeof value !== 'string' || !value.trim()) problems.push(`${locale}: "${key}" is empty`);
    const source = en[key] ?? en[`${base(key)}_other`];
    if (!source || typeof value !== 'string') continue;
    for (const name of placeholders(source)) {
      if (name === 'count' && PLURAL.test(key)) continue;
      if (!value.includes(`{${name}}`)) problems.push(`${locale}: "${key}" lacks {${name}}`);
    }
  }

  const manifest = JSON.parse(
    readFileSync(join(root, 'public/_locales', locale, 'messages.json'), 'utf8'),
  );
  for (const key of ['extName', 'extDescription', 'cmdTogglePanel', 'cmdDownloadPage']) {
    if (!manifest[key]?.message) problems.push(`_locales/${locale}: missing ${key}`);
  }
}

// Static keys used in the source.
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|svelte)$/.test(name)) out.push(path);
  }
  return out;
}
const used = new Set();
for (const file of walk(join(root, 'src'))) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\bt\(\s*'([\w.-]+)'/g)) {
    used.add(match[1]);
    if (!enBases.has(match[1])) problems.push(`${relative(root, file)}: unknown key "${match[1]}"`);
  }
}

if (process.argv.includes('--list-used')) console.log([...used].sort().join('\n'));

if (problems.length) {
  console.error(`${problems.length} translation problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `Translations OK: ${Object.keys(LOCALES).length} locales, ${enBases.size} messages, ${used.size} used statically.`,
);
