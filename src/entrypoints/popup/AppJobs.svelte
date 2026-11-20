<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { AppJobAction, AppJobSummary } from '../../lib/bridge';
  import { call } from '../../lib/messages';
  import { fmt, t } from '../../ui/state/app.svelte';
  import IconButton from '../../ui/components/IconButton.svelte';

  /** The desktop app's queue, shown while the popup is open and the app is paired. */
  let jobs = $state<AppJobSummary[]>([]);
  let timer: ReturnType<typeof setInterval> | null = null;

  const RUNNING = new Set(['resolving', 'queued', 'running', 'paused']);
  const shown = $derived(
    [...jobs]
      .sort(
        (a, b) =>
          Number(RUNNING.has(b.status)) - Number(RUNNING.has(a.status)) ||
          b.createdAt - a.createdAt,
      )
      .slice(0, 4),
  );

  async function refresh() {
    jobs = await call('bridge:jobs').catch(() => []);
  }

  async function act(id: string, action: AppJobAction) {
    await call('bridge:action', { jobId: id, action }).catch(() => undefined);
    await refresh();
  }

  function progress(job: AppJobSummary): number {
    const { total, done, skipped, failed, partial } = job.stats;
    return total > 0 ? Math.min(1, (done + skipped + failed + partial) / total) : 0;
  }

  onMount(async () => {
    const status = await call('bridge:status').catch(() => null);
    if (!status?.paired) return;
    await refresh();
    timer = setInterval(() => void refresh(), 2000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });
</script>

{#if shown.length}
  <section class="app-jobs">
    <h2>{t('bridge.appQueue')}</h2>
    {#each shown as job (job.id)}
      <div class="row">
        <div class="info">
          <span class="title truncate" title={job.title}>{job.title}</span>
          <span class="sub muted mono-num">
            {t(`status.${job.status}`)} / {job.stats.done}/{job.stats.total}
            {#if job.speed > 0}/ {fmt.bytes(job.speed)}/s{/if}
          </span>
          <span class="bar"><span style="width: {Math.round(progress(job) * 100)}%"></span></span>
        </div>
        {#if job.status === 'running' || job.status === 'queued'}
          <IconButton
            size="sm"
            icon="pause"
            label={t('common.pause')}
            onclick={() => act(job.id, 'pause')}
          />
        {:else if job.status === 'paused'}
          <IconButton
            size="sm"
            icon="play"
            label={t('common.resume')}
            onclick={() => act(job.id, 'resume')}
          />
        {:else if job.status === 'failed'}
          <IconButton
            size="sm"
            icon="retry"
            label={t('common.retry')}
            onclick={() => act(job.id, 'retry')}
          />
        {/if}
      </div>
    {/each}
  </section>
{/if}

<style>
  .app-jobs {
    display: grid;
    gap: 6px;
    padding: 10px 14px 0;
  }
  h2 {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--text-dim);
    font-weight: 600;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 10px);
    background: var(--bg-elev);
  }
  .info {
    display: grid;
    gap: 3px;
    flex: 1;
    min-width: 0;
  }
  .sub {
    font-size: var(--fs-sm);
  }
  .bar {
    height: 4px;
    border-radius: 999px;
    background: var(--bg-elev-3, var(--border));
    overflow: hidden;
  }
  .bar > span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.4s ease;
  }
</style>
