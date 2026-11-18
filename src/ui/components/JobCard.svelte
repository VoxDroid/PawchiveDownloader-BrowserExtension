<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { JobSummary } from '../../lib/jobs/types';
  import type { JobAction } from '../../lib/jobs/engine';
  import { call } from '../../lib/messages';
  import { fmt, t } from '../state/app.svelte';
  import { toast } from '../state/toasts.svelte';
  import type { IconName } from '../icons.generated';
  import Icon from './Icon.svelte';
  import IconButton from './IconButton.svelte';
  import Progress from './Progress.svelte';

  interface Props {
    job: JobSummary;
    compact?: boolean;
    details?: Snippet;
    onopen?: () => void;
  }

  let { job, compact = false, details, onopen }: Props = $props();

  const s = $derived(job.stats);
  const finished = $derived(
    job.status === 'done' || job.status === 'failed' || job.status === 'cancelled',
  );
  const settled = $derived(s.done + s.failed + s.skipped + s.cancelled);
  // Finished items plus how far the running ones are, so the bar moves
  // during big files instead of jumping when each one completes.
  const progress = $derived(s.total ? Math.min(1, (settled + (s.partial ?? 0)) / s.total) : 0);
  const partial = $derived(job.status === 'done' && s.failed > 0);
  const tone = $derived(
    job.status === 'failed'
      ? 'danger'
      : partial || job.status === 'paused'
        ? 'warning'
        : job.status === 'done'
          ? 'success'
          : job.status === 'cancelled'
            ? 'muted'
            : 'accent',
  );
  const statusIcon = $derived<IconName>(
    (
      {
        resolving: 'search',
        queued: 'clock',
        running: 'download',
        paused: 'pause',
        done: partial ? 'warning' : 'success',
        failed: 'error',
        cancelled: 'close',
      } as const
    )[job.status],
  );
  const statusLabel = $derived(partial ? t('status.partial') : t(`status.${job.status}`));
  const eta = $derived(
    // Sizes of files that have not started are unknown, so only estimate
    // once everything left is already downloading.
    job.speed > 0 &&
      s.totalBytes > s.bytes &&
      job.status === 'running' &&
      settled + s.active === s.total
      ? ((s.totalBytes - s.bytes) / job.speed) * 1000
      : 0,
  );

  async function act(action: JobAction) {
    try {
      await call('jobs:action', { jobId: job.id, action });
    } catch (error) {
      toast(String(error instanceof Error ? error.message : error), 'error');
    }
  }
</script>

<article class="job {tone}" class:compact class:finished>
  <div class="head">
    <span class="status-dot" data-tip={statusLabel}
      ><Icon name={statusIcon} spin={job.status === 'resolving'} /></span
    >
    <div class="titles">
      {#if onopen}
        <button type="button" class="title truncate link" onclick={onopen}
          >{job.title || t('common.untitled')}</button
        >
      {:else}
        <span class="title truncate">{job.title || t('common.untitled')}</span>
      {/if}
      <span class="sub truncate">
        {statusLabel}
        {#if job.subtitle}<span class="dot">/</span>{job.subtitle}{/if}
        {#if job.mode === 'zip'}<span class="dot">/</span>ZIP{/if}
      </span>
    </div>
    <div class="actions">
      {#if job.status === 'running' || job.status === 'queued' || job.status === 'resolving'}
        <IconButton size="sm" icon="pause" label={t('common.pause')} onclick={() => act('pause')} />
      {/if}
      {#if job.status === 'paused'}
        <IconButton
          size="sm"
          icon="play"
          label={t('common.resume')}
          onclick={() => act('resume')}
        />
      {/if}
      {#if !finished}
        <IconButton
          size="sm"
          icon="stop"
          label={t('common.cancel')}
          onclick={() => act('cancel')}
        />
      {/if}
      {#if finished && (s.failed > 0 || s.cancelled > 0 || job.status === 'failed')}
        <IconButton size="sm" icon="retry" label={t('common.retry')} onclick={() => act('retry')} />
      {/if}
      {#if finished}
        <IconButton
          size="sm"
          icon="close"
          label={t('common.remove')}
          tipSide="left"
          onclick={() => act('remove')}
        />
      {/if}
    </div>
  </div>

  {#if !finished || !compact}
    <Progress
      value={progress}
      indeterminate={job.status === 'resolving' || (job.status === 'queued' && settled === 0)}
      tone={tone === 'accent' ? 'accent' : tone}
      height={compact ? 4 : 6}
      label={job.title}
    />
  {/if}

  <div class="meta mono-num">
    {#if job.status === 'resolving' && job.scan}
      <span>{t('jobs.scanning', { pages: job.scan.pages, posts: job.scan.posts })}</span>
    {:else}
      <span>{t('jobs.progress', { done: s.done, total: s.total })}</span>
      {#if s.failed}<span class="bad">{t('jobs.failed', { count: s.failed })}</span>{/if}
      {#if s.skipped}<span>{t('jobs.skipped', { count: s.skipped })}</span>{/if}
      {#if s.bytes > 0}<span>{fmt.bytes(s.bytes)}</span>{/if}
      {#if job.status === 'running' && job.speed > 0}<span class="speed"
          >{fmt.bytes(job.speed)}/s</span
        >{/if}
      {#if eta > 0 && !compact}<span>{t('jobs.eta', { time: fmt.duration(eta) })}</span>{/if}
    {/if}
  </div>
  {#if job.error && job.error !== 'nothing-found'}
    <p class="error">{job.error}</p>
  {:else if job.error === 'nothing-found'}
    <p class="error">{t('error.nothingFound')}</p>
  {/if}
  {#if !compact && job.current.length && job.status === 'running'}
    <ul class="current">
      {#each job.current as name (name)}<li class="truncate">
          <Icon name="downloadOutline" />
          {name}
        </li>{/each}
    </ul>
  {/if}
  {#if details}{@render details()}{/if}
</article>

<style>
  .job {
    --tone: var(--accent);
    display: grid;
    gap: 10px;
    padding: 14px;
    border-radius: var(--radius-lg);
    background: var(--bg-elev);
    border: 1px solid var(--border);
    transition:
      border-color var(--dur) var(--ease),
      background-color var(--dur) var(--ease);
    animation: pdl-rise var(--dur-slow) var(--ease-out);
  }
  .job:hover {
    border-color: var(--border-strong);
  }
  .compact {
    padding: 10px 12px;
    gap: 7px;
    border-radius: var(--radius-md);
  }
  .success {
    --tone: var(--success);
  }
  .warning {
    --tone: var(--warning);
  }
  .danger {
    --tone: var(--danger);
  }
  .muted {
    --tone: var(--text-faint);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .status-dot {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    flex: none;
    border-radius: 9px;
    color: var(--tone);
    background: color-mix(in srgb, var(--tone) 14%, transparent);
  }
  .compact .status-dot {
    width: 26px;
    height: 26px;
    border-radius: 8px;
  }
  .titles {
    display: grid;
    min-width: 0;
    flex: 1;
  }
  .title {
    font-weight: 700;
    font-size: var(--fs-md);
    color: var(--text);
    text-align: left;
  }
  .link {
    border: 0;
    background: transparent;
    padding: 0;
  }
  .link:hover {
    color: var(--accent-strong);
  }
  .sub {
    font-size: var(--fs-xs);
    color: var(--text-dim);
  }
  .dot {
    margin: 0 6px;
    color: var(--text-faint);
  }
  .actions {
    display: flex;
    gap: 2px;
    flex: none;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    font-size: var(--fs-xs);
    color: var(--text-dim);
  }
  .bad {
    color: var(--danger);
  }
  .speed {
    color: var(--accent-strong);
  }
  .error {
    font-size: var(--fs-xs);
    color: var(--danger);
    word-break: break-word;
  }
  .current {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 2px;
    font-size: var(--fs-xs);
    color: var(--text-faint);
  }
</style>
