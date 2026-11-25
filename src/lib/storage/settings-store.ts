import { storage } from 'wxt/utils/storage';
import { coerceSettings, DEFAULT_SETTINGS, type Settings } from '../settings';

/**
 * Settings sync across the user's browsers through `storage.sync`. Values are
 * always passed through coerceSettings, so a newer or older stored shape can
 * never break the extension.
 */
const item = storage.defineItem<Partial<Settings>>('sync:settings', {
  fallback: {},
  version: 1,
});

export async function loadSettings(): Promise<Settings> {
  return coerceSettings({ ...DEFAULT_SETTINGS, ...(await item.getValue()) });
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = coerceSettings({ ...(await loadSettings()), ...patch });
  await item.setValue(next);
  return next;
}

export async function resetSettings(): Promise<Settings> {
  await item.setValue({ ...DEFAULT_SETTINGS });
  return { ...DEFAULT_SETTINGS };
}

export function watchSettings(callback: (settings: Settings) => void): () => void {
  return item.watch((value) => callback(coerceSettings({ ...DEFAULT_SETTINGS, ...value })));
}

export function exportSettings(settings: Settings): string {
  return `${JSON.stringify({ app: 'pawchive-downloader', version: 1, settings }, null, 2)}\n`;
}

/**
 * The settings in an exported file, laid over `current`: what the file does
 * not name (a setting newer than the file) stays as it is. Throws when the
 * file is not settings (a backup, a favorites list), which would otherwise
 * reset every setting to its default.
 */
export function parseSettingsFile(text: string, current: Settings = DEFAULT_SETTINGS): Settings {
  const parsed: unknown = JSON.parse(text);
  const body =
    parsed && typeof parsed === 'object' && 'settings' in parsed
      ? (parsed as { settings: unknown }).settings
      : parsed;
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !Object.keys(body).some((key) => key in DEFAULT_SETTINGS)
  ) {
    throw new Error('Not a settings file');
  }
  return coerceSettings({ ...current, ...body });
}
