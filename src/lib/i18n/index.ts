import type { Locale } from '../settings';
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import ptBR from './locales/pt_BR.json';
import ru from './locales/ru.json';
import zhCN from './locales/zh_CN.json';

/**
 * Runtime translations. The browser's own chrome.i18n cannot switch language
 * without a browser restart, so the UI uses these dictionaries instead and
 * follows the language picked in Settings live. `_locales/` only carries the
 * extension's name and descriptions for the store and browser menus.
 *
 * Plural forms use CLDR categories as key suffixes: `files_one`,
 * `files_other`, and `_few` / `_many` where a language needs them.
 */

type Dictionary = Record<string, string>;
type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
type BaseKey<K> = K extends `${infer B}_${PluralSuffix}` ? B : K;
export type MessageKey = BaseKey<keyof typeof en>;
export type Params = Record<string, string | number>;

export const DICTIONARIES: Record<Locale, Dictionary> = {
  en,
  ja,
  ko,
  zh_CN: zhCN,
  es,
  pt_BR: ptBR,
  ru,
  de,
  fr,
};

/** Names of the languages in their own language, for the picker. */
export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  zh_CN: '简体中文',
  es: 'Español',
  pt_BR: 'Português (Brasil)',
  ru: 'Русский',
  de: 'Deutsch',
  fr: 'Français',
};

/** BCP 47 tags for Intl formatting. */
export const BCP47: Record<Locale, string> = {
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

const pluralRules = new Map<Locale, Intl.PluralRules>();

function pluralOf(locale: Locale, count: number): PluralSuffix {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(BCP47[locale]);
    pluralRules.set(locale, rules);
  }
  return rules.select(count) as PluralSuffix;
}

function lookup(
  dict: Dictionary,
  locale: Locale,
  key: string,
  params?: Params,
): string | undefined {
  const count = params?.count;
  if (typeof count === 'number') {
    const form = dict[`${key}_${pluralOf(locale, count)}`] ?? dict[`${key}_other`];
    if (form !== undefined) return form;
  }
  return dict[key];
}

export function translate(locale: Locale, key: MessageKey | string, params?: Params): string {
  const template =
    lookup(DICTIONARIES[locale], locale, key, params) ?? lookup(en, 'en', key, params) ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === 'number' ? new Intl.NumberFormat(BCP47[locale]).format(value) : value;
  });
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export function formatBytes(bytes: number, locale: Locale = 'en'): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  const digits = exponent === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${new Intl.NumberFormat(BCP47[locale], { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)} ${BYTE_UNITS[exponent]}`;
}

export function formatNumber(value: number, locale: Locale = 'en'): string {
  return new Intl.NumberFormat(BCP47[locale]).format(value);
}

export function formatDuration(ms: number, locale: Locale = 'en'): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const unit = (value: number, u: 'hour' | 'minute' | 'second') =>
    new Intl.NumberFormat(BCP47[locale], { style: 'unit', unit: u, unitDisplay: 'narrow' }).format(
      value,
    );
  if (h > 0) return `${unit(h, 'hour')} ${unit(m, 'minute')}`;
  if (m > 0) return `${unit(m, 'minute')} ${unit(s, 'second')}`;
  return unit(s, 'second');
}

export function formatRelative(at: number, locale: Locale = 'en', now = Date.now()): string {
  const diff = (at - now) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(BCP47[locale], { numeric: 'auto' });
  if (abs < 45) return rtf.format(Math.round(diff), 'second');
  if (abs < 2700) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 64_800) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 2_592_000) return rtf.format(Math.round(diff / 86_400), 'day');
  if (abs < 31_536_000) return rtf.format(Math.round(diff / 2_592_000), 'month');
  return rtf.format(Math.round(diff / 31_536_000), 'year');
}

export function formatDate(
  value: string | number | null,
  locale: Locale = 'en',
  withTime = false,
): string {
  if (value === null || value === '') return '';
  const date =
    typeof value === 'number'
      ? new Date(value)
      : new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(BCP47[locale], {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(date);
}
