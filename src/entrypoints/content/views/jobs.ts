import { call } from '../../../lib/messages';
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

/** Sends a job to the background and confirms it with a toast. */
export async function queueJob(request: JobRequest, message: string): Promise<boolean> {
  try {
    await call('jobs:create', { request });
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
