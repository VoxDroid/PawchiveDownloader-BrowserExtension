import { storage } from 'wxt/utils/storage';

/** Small per-device interface state that does not belong in synced settings. */
export const supportCardDismissed = storage.defineItem<boolean>('local:supportCardDismissed', {
  fallback: false,
});
