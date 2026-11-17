import { describe, expect, it } from 'vitest';
import { coerceSettings, DEFAULT_SETTINGS, resolveLocale } from '../../src/lib/settings';

describe('coerceSettings', () => {
  it('returns defaults for nothing', () => {
    expect(coerceSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(coerceSettings('junk')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and drops unknown keys', () => {
    const s = coerceSettings({ theme: 'plum', language: 'ja', concurrency: 2, bogus: true });
    expect(s.theme).toBe('plum');
    expect(s.language).toBe('ja');
    expect(s.concurrency).toBe(2);
    expect('bogus' in s).toBe(false);
  });

  it('clamps numbers to the polite limits', () => {
    const s = coerceSettings({ concurrency: 50, requestIntervalMs: 10, maxRetries: '7', zipMaxSizeMb: 99999 });
    expect(s.concurrency).toBe(5);
    expect(s.requestIntervalMs).toBe(1000);
    expect(s.maxRetries).toBe(7);
    expect(s.zipMaxSizeMb).toBe(3900);
  });

  it('rejects bad enums, colors, templates and intervals', () => {
    const s = coerceSettings({
      theme: 'neon',
      accent: 'red',
      folderTemplate: '../{oops}',
      fileTemplate: '',
      watchIntervalMinutes: 7,
      categories: { image: false, video: 'no' },
      showFloatingButton: 'yes',
    });
    expect(s.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(s.accent).toBe(DEFAULT_SETTINGS.accent);
    expect(s.folderTemplate).toBe(DEFAULT_SETTINGS.folderTemplate);
    expect(s.fileTemplate).toBe(DEFAULT_SETTINGS.fileTemplate);
    expect(s.watchIntervalMinutes).toBe(DEFAULT_SETTINGS.watchIntervalMinutes);
    expect(s.categories.image).toBe(false);
    expect(s.categories.video).toBe(true);
    expect(s.showFloatingButton).toBe(true);
  });

  it('accepts system theme and auto language', () => {
    const s = coerceSettings({ theme: 'system', language: 'auto', accent: '#AABBCC' });
    expect(s.theme).toBe('system');
    expect(s.language).toBe('auto');
    expect(s.accent).toBe('#aabbcc');
  });
});

describe('resolveLocale', () => {
  it('maps browser languages', () => {
    expect(resolveLocale('auto', 'pt-BR')).toBe('pt_BR');
    expect(resolveLocale('auto', 'pt-PT')).toBe('pt_BR');
    expect(resolveLocale('auto', 'zh-TW')).toBe('zh_CN');
    expect(resolveLocale('auto', 'de-AT')).toBe('de');
    expect(resolveLocale('auto', 'it')).toBe('en');
    expect(resolveLocale('ko', 'en-US')).toBe('ko');
  });
});
