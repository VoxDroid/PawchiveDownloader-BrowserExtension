<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { call } from '../../../lib/messages';
  import { historyToCsv, type HistoryEntry } from '../../../lib/storage/db';
  import { pageUrls } from '../../../lib/pawchive/urls';
  import { app, fmt, t, updateSettings } from '../../../ui/state/app.svelte';
  import { toast } from '../../../ui/state/toasts.svelte';
  import Button from '../../../ui/components/Button.svelte';
  import Checkbox from '../../../ui/components/Checkbox.svelte';
  import Dialog from '../../../ui/components/Dialog.svelte';
  import Empty from '../../../ui/components/Empty.svelte';
  import Icon from '../../../ui/components/Icon.svelte';
  import IconButton from '../../../ui/components/IconButton.svelte';
  import Segmented from '../../../ui/components/Segmented.svelte';
  import TextInput from '../../../ui/components/TextInput.svelte';
  import PageHeader from '../PageHeader.svelte';
  import { saveTextFile, stamp } from '../download';

  let entries = $state<HistoryEntry[] | null>(null);
  let stats = $state({ files: 0, posts: 0, history: 0 });
  let query = $state('');
  let status = $state<'all' | 'done' | 'problems'>('all');
  let clearOpen = $state(false);
  let forgetFiles = $state(false);
  let clearing = $state(false);
  let limit = $state(60);

  const filtered = $derived(
    (entries ?? []).filter((e) => {
      const q = query.trim().toLowerCase();
      if (q && !`${e.title} ${e.creator?.name ?? ''} ${e.folder}`.toLowerCase().includes(q))
        return false;
      if (status === 'done') return e.status === 'done' && e.files.failed === 0;
      if (status === 'problems') return e.status !== 'done' || e.files.failed > 0;
      return true;
    }),
  );
  const totalBytes = $derived((entries ?? []).reduce((sum, e) => sum + e.bytes, 0));

  // Group rows by day for a calmer, scannable list.
  const groups = $derived.by(() => {
    const result: Array<{ day: string; items: HistoryEntry[] }> = [];
    for (const entry of filtered.slice(0, limit)) {
      const day = fmt.date(entry.finishedAt);
      const last = result[result.length - 1];
      if (last?.day === day) last.items.push(entry);
      else result.push({ day, items: [entry] });
    }
    return result;
  });

  async function load() {
    [entries, stats] = await Promise.all([call('history:list'), call('history:stats')]);
  }

  onMount(load);

  // New entries appear as jobs finish.
  let lastFinished = 0;
  $effect(() => {
    const finished = app.jobs.filter((j) => j.finishedAt).length;
    if (finished > lastFinished && entries) void load();
    lastFinished = finished;
  });

  async function requeue(entry: HistoryEntry) {
    const result = await call('history:requeue', { id: entry.id }).catch(() => null);
    if (result) toast(t('history.requeued', { title: entry.title }), 'success');
    else toast(t('history.requeueFailed'), 'error');
  }

  async function reveal(entry: HistoryEntry) {
    const found = entry.firstFile
      ? await call('app:show-file', { path: entry.firstFile }).catch(() => false)
      : false;
    if (!found) {
      toast(t('history.folderMissing'), 'warning', {
        action: {
          label: t('history.openDownloads'),
          run: () => void call('app:open-downloads-folder'),
        },
      });
    }
  }

  async function remove(entry: HistoryEntry) {
    await call('history:remove', { ids: [entry.id] });
    entries = (entries ?? []).filter((e) => e.id !== entry.id);
  }

  async function clearAll() {
    clearing = true;
    await call('history:clear', { forgetFiles });
    clearing = false;
    clearOpen = false;
    forgetFiles = false;
    await load();
    toast(t('history.cleared'), 'success');
  }

  function exportCsv() {
    saveTextFile(`pawchive-history-${stamp()}.csv`, historyToCsv(filtered), 'text/csv');
  }

  function exportJson() {
    saveTextFile(
      `pawchive-history-${stamp()}.json`,
      `${JSON.stringify(filtered, null, 2)}\n`,
      'application/json',
    );
  }
</script>

<PageHeader title={t('nav.history')} description={t('history.description')}>
  {#snippet actions()}
    <Button icon="export" disabled={!filtered.length} onclick={exportCsv}>CSV</Button>
    <Button icon="json" disabled={!filtered.length} onclick={exportJson}>JSON</Button>
    <Button
      variant="danger"
      icon="trash"
      disabled={!entries?.length && stats.files === 0}
      onclick={() => (clearOpen = true)}>{t('history.clear')}</Button
    >
  {/snippet}
</PageHeader>

{#if !app.settings.recordHistory}
  <div class="banner" in:fade>
    <Icon name="pause" />
    <span>{t('history.recordingOff')}</span>
    <Button size="sm" variant="subtle" onclick={() => updateSettings({ recordHistory: true })}
      >{t('history.turnOn')}</Button
    >
  </div>
{/if}

<div class="summary">
  <div>
    <span class="mono-num">{fmt.number(stats.history)}</span><span>{t('history.statJobs')}</span>
  </div>
  <div>
    <span class="mono-num">{fmt.number(stats.posts)}</span><span>{t('history.statPosts')}</span>
  </div>
  <div>
    <span class="mono-num">{fmt.number(stats.files)}</span><span>{t('history.statFiles')}</span>
  </div>
  <div>
    <span class="mono-num">{fmt.bytes(totalBytes)}</span><span>{t('history.statBytes')}</span>
  </div>
</div>

<div class="toolbar">
  <TextInput
    label={t('history.search')}
    placeholder={t('history.search')}
    icon="search"
    type="search"
    clearable
    bind:value={query}
  />
  <Segmented
    label={t('history.status')}
    size="sm"
    bind:value={status}
    options={[
      { value: 'all', label: t('history.all') },
      { value: 'done', label: t('history.ok') },
      { value: 'problems', label: t('history.problems') },
    ]}
  />
</div>

{#if entries === null}
  <p class="muted">{t('common.loading')}</p>
{:else if filtered.length === 0}
  <Empty
    icon="history"
    title={entries.length ? t('history.noMatches') : t('history.emptyTitle')}
    body={entries.length ? undefined : t('history.emptyBody')}
  />
{:else}
  {#each groups as group (group.day)}
    <h2 class="day">{group.day}</h2>
    <div class="rows">
      {#each group.items as entry (entry.id)}
        <article class="row" class:bad={entry.status !== 'done' || entry.files.failed > 0}>
          <span
            class="status"
            data-tip={entry.status === 'done' && entry.files.failed
              ? t('status.partial')
              : t(`status.${entry.status}`)}
          >
            <Icon
              name={entry.status === 'done'
                ? entry.files.failed
                  ? 'warning'
                  : 'success'
                : entry.status === 'cancelled'
                  ? 'close'
                  : 'error'}
            />
          </span>
          <div class="main">
            <span class="title truncate">{entry.title || t('common.untitled')}</span>
            <span class="meta">
              {#if entry.creator}
                <a
                  href={pageUrls.creator(entry.creator.service, entry.creator.id)}
                  target="_blank"
                  rel="noreferrer">{entry.creator.name}</a
                >
                <span class="sep">/</span>
              {/if}
              <span class="mono-num">{t('history.rowFiles', { count: entry.files.done })}</span>
              {#if entry.files.failed}<span class="sep">/</span><span class="fail mono-num"
                  >{t('jobs.failed', { count: entry.files.failed })}</span
                >{/if}
              {#if entry.files.skipped}<span class="sep">/</span><span class="mono-num"
                  >{t('jobs.skipped', { count: entry.files.skipped })}</span
                >{/if}
              <span class="sep">/</span><span class="mono-num">{fmt.bytes(entry.bytes)}</span>
              {#if entry.startedAt}<span class="sep">/</span><span class="mono-num"
                  >{fmt.duration(entry.finishedAt - entry.startedAt)}</span
                >{/if}
            </span>
            {#if entry.errors.length}
              <details>
                <summary>{t('history.showErrors', { count: entry.errors.length })}</summary>
                <ul>
                  {#each entry.errors as error, i (i)}<li class="truncate" title={error}>
                      {error}
                    </li>{/each}
                </ul>
              </details>
            {/if}
          </div>
          <span class="time faint mono-num" title={fmt.date(entry.finishedAt, true)}
            >{fmt.relative(entry.finishedAt)}</span
          >
          <div class="actions">
            <IconButton
              icon="folderOpen"
              label={t('history.showFolder')}
              onclick={() => reveal(entry)}
            />
            <IconButton
              icon="retry"
              label={t('history.again')}
              disabled={!entry.refs.length}
              onclick={() => requeue(entry)}
            />
            <IconButton
              icon="trash"
              label={t('common.remove')}
              tipSide="left"
              onclick={() => remove(entry)}
            />
          </div>
        </article>
      {/each}
    </div>
  {/each}
  {#if filtered.length > limit}
    <div class="more">
      <Button variant="ghost" onclick={() => (limit += 100)}
        >{t('history.more', { count: filtered.length - limit })}</Button
      >
    </div>
  {/if}
{/if}

<Dialog
  open={clearOpen}
  title={t('history.clearTitle')}
  confirmLabel={t('history.clear')}
  danger
  busy={clearing}
  onconfirm={clearAll}
  oncancel={() => (clearOpen = false)}
>
  <p>{t('history.clearBody')}</p>
  <Checkbox bind:checked={forgetFiles}>{t('history.forgetFiles')}</Checkbox>
</Dialog>

<style>
  .banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    margin-bottom: 16px;
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--warning) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--warning) 26%, transparent);
  }
  .banner span {
    flex: 1;
  }
  .summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }
  .summary div {
    display: grid;
    gap: 2px;
    padding: 14px 16px;
    border-radius: var(--radius-lg);
    background: var(--bg-elev);
    border: 1px solid var(--border);
  }
  .summary div span:first-child {
    font-size: var(--fs-xl);
    font-weight: 700;
  }
  .summary div span:last-child {
    font-size: var(--fs-xs);
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }
  .toolbar {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    align-items: center;
  }
  .toolbar > :global(.field) {
    flex: 1;
  }
  .toolbar > :global(.segmented) {
    width: 300px;
  }
  .day {
    font-size: var(--fs-xs);
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 700;
    margin: 18px 4px 8px;
  }
  .rows {
    display: grid;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    background: var(--bg-elev);
    overflow: hidden;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 12px 12px 16px;
    border-bottom: 1px solid var(--border);
    transition: background-color var(--dur-fast) var(--ease);
    animation: pdl-fade-in var(--dur) var(--ease);
  }
  .row:last-child {
    border-bottom: 0;
  }
  .row:hover {
    background: var(--bg-hover);
  }
  .status {
    color: var(--success);
    display: inline-flex;
  }
  .bad .status {
    color: var(--warning);
  }
  .main {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .title {
    font-weight: 600;
  }
  .meta {
    font-size: var(--fs-xs);
    color: var(--text-dim);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
  }
  .sep {
    margin: 0 6px;
    color: var(--text-faint);
  }
  .fail {
    color: var(--danger);
  }
  details {
    font-size: var(--fs-xs);
    color: var(--text-dim);
    margin-top: 4px;
  }
  summary {
    cursor: pointer;
    color: var(--danger);
  }
  details ul {
    margin: 6px 0 0;
    padding-left: 16px;
    display: grid;
    gap: 2px;
  }
  .time {
    font-size: var(--fs-xs);
    white-space: nowrap;
  }
  .actions {
    display: flex;
    gap: 2px;
    opacity: 0.6;
    transition: opacity var(--dur-fast) var(--ease);
  }
  .row:hover .actions,
  .actions:focus-within {
    opacity: 1;
  }
  .more {
    display: flex;
    justify-content: center;
    margin-top: 16px;
  }
</style>
