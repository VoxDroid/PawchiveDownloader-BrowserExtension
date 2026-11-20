/**
 * Questions the panel asks before queueing a download. One prompt at a time;
 * each resolves with the user's choice, or 'cancel' when dismissed.
 */

export type MediaChoice = 'cancel' | 'thumbnails' | 'continue';

export const mediaPrompt = $state<{
  open: boolean;
  site: string;
  host: string;
  resolve: ((choice: MediaChoice) => void) | null;
}>({ open: false, site: '', host: '', resolve: null });

/** Asks what to do when a site's media server does not answer. */
export function askMediaDown(site: string, host: string): Promise<MediaChoice> {
  // A newer question replaces an unanswered one.
  mediaPrompt.resolve?.('cancel');
  return new Promise((resolve) => {
    mediaPrompt.site = site;
    mediaPrompt.host = host;
    mediaPrompt.resolve = resolve;
    mediaPrompt.open = true;
  });
}

export function answerMediaDown(choice: MediaChoice): void {
  const resolve = mediaPrompt.resolve;
  mediaPrompt.open = false;
  mediaPrompt.resolve = null;
  resolve?.(choice);
}
