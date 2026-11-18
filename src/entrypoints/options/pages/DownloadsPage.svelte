<script lang="ts">
  import { flip } from 'svelte/animate';
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { call } from '../../../lib/messages';
  import type { Item, Job } from '../../../lib/jobs/types';
  import { app, fmt, overallProgress, t } from '../../../ui/state/app.svelte';
  import { toast } from '../../../ui/state/toasts.svelte';
  import type { IconName } from '../../../ui/icons.generated';
  import Button from '../../../ui/components/Button.svelte';
  import Empty from '../../../ui/components/Empty.svelte';
  import Icon from '../../../ui/components/Icon.svelte';
  import IconButton from '../../../ui/components/IconButton.svelte';
  import JobCard from '../../../ui/components/JobCard.svelte';
  import Segmented from '../../../ui/components/Segmented.svelte';
  import VirtualList from '../../../ui/components/VirtualList.svelte';
  import PageHeader from '../PageHeader.svelte';
  import SupportCard from '../../../ui/components/SupportCard.svelte';
  import { SUPPORT_PROMPT_AFTER } from '../../../lib/links';
  import { supportCardDismissed } from '../../../lib/storage/prefs';
  import { onMount } from 'svelte';

  type Filter = 'all' | 'active' | 'finished';
  let filter = $state<Filter>('all');
  let openId = $state<string | null>(null);
  let detail = $state<Job | null>(null);
  let itemFilter = $state<'all' | 'failed'>('all');

  const isLive = (status: string) =>
    status === 'running' || status === 'queued' || status === 'resolving' || status === 'paused';
  const jobs = $derived(
    [...app.jobs]
      .filter((j) =>
        filter === 'all' ? true : filter === 'active' ? isLive(j.status) : !isLive(j.status),
      )
      .sort(
        (a, b) => Number(isLive(b.status)) - Number(isLive(a.status)) || b.createdAt - a.createdAt,
      ),
  );
  const totals = $derived(overallProgress(app.jobs));
  const finishedCount = $derived(app.jobs.filter((j) => !isLive(j.status)).length);
  const anyRunning = $derived(
    app.jobs.some(
      (j) => j.status === 'running' || j.status === 'queued' || j.status === 'resolving',
    ),
  );
  const anyPaused = $derived(app.jobs.some((j) => j.status === 'paused'));
  const items = $derived(
    (detail?.items ?? []).filter((i) => itemFilter === 'all' || i.status === 'failed'),
  );

  // Refresh the open job's items whenever its summary changes.
  $effect(() => {
    const summary = app.jobs.find((j) => j.id === openId);
    void summary?.stats.done;
    void summary?.stats.failed;
    void summary?.status;
    if (!openId) return;
    const id = openId;
    call('jobs:detail', { jobId: id })
      .then((job) => {
        if (openId === id) detail = job;
      })
      .catch(() => undefined);
  });

  function toggle(id: string) {
    if (openId === id) {
      openId = null;
      detail = null;
    } else {
      openId = id;
      detail = null;
      itemFilter = 'all';
    }
  }

  async function all(action: 'pause' | 'resume') {
    await call('jobs:all', { action });
  }

  async function showFile(path: string) {
    const found = await call('app:show-file', { path }).catch(() => false);
    if (!found) toast(t('downloads.fileMissing'), 'warning');
  }

  // A one-time thank-you once someone has finished a few downloads.
  let showSupport = $state(false);
  onMount(async () => {
    const [dismissed, stats] = await Promise.all([
      supportCardDismissed.getValue(),
      call('history:stats').catch(() => ({ history: 0 })),
    ]);
    showSupport = !dismissed && stats.history >= SUPPORT_PROMPT_AFTER;
  });
  function dismissSupport() {
    showSupport = false;
    void supportCardDismissed.setValue(true);
  }

  const ITEM_ICON: Record<Item['status'], IconName> = {
    pending: 'clock',
    active: 'download',
    done: 'success',
    failed: 'error',
    skipped: 'skip',
    cancelled: 'close',
  };
</script>

<PageHeader title={t('nav.downloads')} description={t('downloads.description')}>
  {#snippet actions()}
    {#if anyRunning}<Button icon="pause" onclick={() => all('pause')}
        >{t('downloads.pauseAll')}</Button
      >{/if}
    {#if anyPaused}<Button icon="play" onclick={() => all('resume')}
        >{t('downloads.resumeAll')}</Button
      >{/if}
    <Button
      variant="ghost"
      icon="trash"
      disabled={finishedCount === 0}
      onclick={() => call('jobs:clear-finished')}>{t('downloads.clearFinished')}</Button
    >
  {/snippet}
</PageHeader>

{#if showSupport}
  <div class="support"><SupportCard ondismiss={dismissSupport} /></div>
{/if}

<div class="stats">
  <div class="stat">
    <span class="label">{t('downloads.statActive')}</span>
    <span class="value mono-num">{totals.active}</span>
  </div>
  <div class="stat">
    <span class="label">{t('downloads.statSpeed')}</span>
    <span class="value mono-num">{totals.speed > 0 ? `${fmt.bytes(totals.speed)}/s` : '-'}</span>
  </div>
  <div class="stat">
    <span class="label">{t('downloads.statProgress')}</span>
    <span class="value mono-num"
      >{totals.active > 0 ? `${Math.round(totals.ratio * 100)}%` : '-'}</span
    >
  </div>
  <div class="stat">
    <span class="label">{t('downloads.statFinished')}</span>
    <span class="value mono-num">{finishedCount}</span>
  </div>
</div>

<div class="toolbar">
  <Segmented
    label={t('downloads.filter')}
    size="sm"
    bind:value={filter}
    options={[
      { value: 'all', label: t('downloads.filterAll') },
      { value: 'active', label: t('downloads.filterActive') },
      { value: 'finished', label: t('downloads.filterFinished') },
    ]}
  />
</div>

{#if jobs.length === 0}
  <Empty icon="queue" title={t('downloads.emptyTitle')} body={t('downloads.emptyBody')} />
{:else}
  <div class="list">
    {#each jobs as job (job.id)}
      <div animate:flip={{ duration: 260, easing: cubicOut }}>
        <JobCard {job} onopen={() => toggle(job.id)}>
          {#snippet details()}
            <div class="details-toggle">
              <Button
                size="sm"
                variant="ghost"
                iconRight={openId === job.id ? 'chevronUp' : 'chevronDown'}
                onclick={() => toggle(job.id)}
              >
                {openId === job.id
                  ? t('downloads.hideItems')
                  : t('downloads.showItems', { count: job.stats.total })}
              </Button>
              {#if job.finishedAt}<span class="faint">{fmt.relative(job.finishedAt)}</span>{/if}
            </div>
            {#if openId === job.id}
              <div class="details" transition:slide={{ duration: 220 }}>
                {#if !detail}
                  <p class="muted pad">{t('common.loading')}</p>
                {:else}
                  <div class="item-tools">
                    <Segmented
                      label={t('downloads.filter')}
                      size="sm"
                      bind:value={itemFilter}
                      options={[
                        { value: 'all', label: t('downloads.itemsAll') },
                        { value: 'failed', label: t('downloads.itemsFailed') },
                      ]}
                    />
                  </div>
                  <div
                    class="items"
                    style="height:{Math.min(360, Math.max(1, items.length) * 40)}px"
                  >
                    <VirtualList {items} rowHeight={40} key={(i) => i.id}>
                      {#snippet row(item)}
                        <div class="item {item.status}">
                          <Icon name={ITEM_ICON[item.status]} spin={false} />
                          <div class="item-main">
                            <span class="truncate" title={item.path}>{item.label}</span>
                            {#if item.error || item.skipReason}
                              <span class="item-note truncate" title={item.error}
                                >{item.skipReason ? t(`skip.${item.skipReason}`) : item.error}</span
                              >
                            {/if}
                          </div>
                          <span class="mono-num faint"
                            >{item.bytes > 0 ? fmt.bytes(item.bytes) : ''}</span
                          >
                          {#if item.status === 'done'}
                            <IconButton
                              size="sm"
                              icon="folderOpen"
                              label={t('downloads.showInFolder')}
                              tipSide="left"
                              onclick={() => showFile(item.path)}
                            />
                          {/if}
                        </div>
                      {/snippet}
                      {#snippet empty()}
                        <p class="muted pad">{t('downloads.noItems')}</p>
                      {/snippet}
                    </VirtualList>
                  </div>
                {/if}
              </div>
            {/if}
          {/snippet}
        </JobCard>
      </div>
    {/each}
  </div>
{/if}

<style>
  .support {
    margin-bottom: 20px;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }
  .stat {
    display: grid;
    gap: 4px;
    padding: 14px 16px;
    border-radius: var(--radius-lg);
    background: var(--bg-elev);
    border: 1px solid var(--border);
  }
  .label {
    font-size: var(--fs-xs);
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }
  .value {
    font-size: var(--fs-xl);
    font-weight: 700;
  }
  .toolbar {
    display: flex;
    margin-bottom: 14px;
  }
  .toolbar :global(.segmented) {
    width: 320px;
  }
  .list {
    display: grid;
    gap: 10px;
  }
  .details-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: -4px -6px -6px;
    font-size: var(--fs-xs);
  }
  .details {
    display: grid;
    gap: 10px;
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }
  .item-tools :global(.segmented) {
    width: 220px;
  }
  .items {
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    overflow: hidden;
    background: var(--bg);
  }
  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 100%;
    padding: 0 8px 0 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    font-size: var(--fs-sm);
  }
  .item > :global(.icon) {
    color: var(--text-faint);
  }
  .done > :global(.icon) {
    color: var(--success);
  }
  .failed > :global(.icon) {
    color: var(--danger);
  }
  .active > :global(.icon) {
    color: var(--accent-strong);
  }
  .item-main {
    flex: 1;
    min-width: 0;
    display: grid;
    line-height: 1.3;
  }
  .item-note {
    font-size: var(--fs-xs);
    color: var(--text-faint);
  }
  .failed .item-note {
    color: var(--danger);
  }
  .pad {
    padding: 12px;
  }
</style>
