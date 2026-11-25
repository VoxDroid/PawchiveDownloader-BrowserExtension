import { call } from '../../../lib/messages';
import { siteFromUrl, siteName } from '../../../lib/pawchive/sites';
import { askMediaDown } from '../prompts.svelte';
import type { JobOptions, JobRequest } from '../../../lib/jobs/types';
import { app, t } from '../../../ui/state/app.svelte';
import { toast } from '../../../ui/state/toasts.svelte';
import type { FooterChoice } from './DownloadFooter.svelte';

/** Job options for what the user picked in the panel footer. */
export function choiceOptions(choice: FooterChoice): Partial<JobOptions> {
  const content = app.settings.saveContent === 'none' ? 'txt' : app.settings.saveContent;
  return {
    mode: choice.mode,
    saveContent: choice.saveText ? content : 'none',
    skipDownloaded: choice.skipDownloaded,
  };
}

/**
 * Before a Kemono or Coomer download, one tiny request checks the media server
 * behind `probeUrl` (any full file of the job). When it does not answer, the
 * user picks: cancel, thumbnails instead, or queue the full files anyway.
 * Returns the request to send, or null to cancel.
 */
async function checkMediaServer(
  request: JobRequest,
  probeUrl: string | null | undefined,
): Promise<JobRequest | null> {
  const site = probeUrl ? siteFromUrl(probeUrl) : null;
  if (!probeUrl || !site || site === 'pawchive') return request;
  const check = await call('media:check', { url: probeUrl }).catch(() => null);
  if (!check || check.reachable) return request;
  const choice = await askMediaDown(siteName(site), check.host);
  if (choice === 'cancel') return null;
  if (choice === 'continue') return request;
  return { ...request, options: { ...request.options, thumbnailsOnly: true } };
}

/** Sends a job to the background and confirms it with a toast. */
export async function queueJob(
  request: JobRequest,
  message: string,
  probeUrl?: string | null,
): Promise<boolean> {
  try {
    const checked = await checkMediaServer(request, probeUrl);
    if (!checked) return false;
    // With the desktop app paired and running, it downloads instead; when it
    // is closed, the extension does it itself.
    if (app.settings.sendToApp) {
      const sent = await call('bridge:send', { request: checked }).catch(() => null);
      if (sent?.ok) {
        toast(sent.duplicate ? t('bridge.sentDuplicate') : t('bridge.sent'), 'success');
        return true;
      }
      toast(
        sent && !sent.ok && sent.code === 'not-paired'
          ? t('bridge.fallbackUnpaired')
          : t('bridge.fallback'),
        'info',
      );
    }
    await call('jobs:create', { request: checked });
    toast(message, 'success', {
      action: {
        label: t('common.view'),
        run: () => void call('app:open-dashboard', { tab: 'downloads' }),
      },
    });
    return true;
  } catch (error) {
    toast(
      t('toast.queueFailed', { error: error instanceof Error ? error.message : String(error) }),
      'error',
    );
    return false;
  }
}
