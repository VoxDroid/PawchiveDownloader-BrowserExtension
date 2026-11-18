<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { call } from '../../../lib/messages';
  import { formatLog, type LogEntry } from '../../../lib/log';
  import type { LogLevel } from '../../../lib/settings';
  import { app, onLog, t, updateSettings } from '../../../ui/state/app.svelte';
  import { toast } from '../../../ui/state/toasts.svelte';
  import Button from '../../../ui/components/Button.svelte';
  import Chip from '../../../ui/components/Chip.svelte';
  import Empty from '../../../ui/components/Empty.svelte';
  import Select from '../../../ui/components/Select.svelte';
  import Switch from '../../../ui/components/Switch.svelte';
  import TextInput from '../../../ui/components/TextInput.svelte';
  import VirtualList from '../../../ui/components/VirtualList.svelte';
  import PageHeader from '../PageHeader.svelte';
  import { saveTextFile, stamp } from '../download';

  const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  let entries = $state<LogEntry[]>([]);
  let levels = $state(new Set<LogLevel>(['info', 'warn', 'error']));
  let query = $state('');
  let follow = $state(true);
  let list = $state<ReturnType<typeof VirtualList<LogEntry>>>();
  let unsubscribe: (() => void) | null = null;

  const shown = $derived(
    entries.filter(
      (e) =>
        levels.has(e.level) &&
        (!query ||
          `${e.scope} ${e.message} ${e.detail ?? ''}`.toLowerCase().includes(query.toLowerCase())),
    ),
  );
  const counts = $derived(
    Object.fromEntries(
      LEVELS.map((l) => [l, entries.filter((e) => e.level === l).length]),
    ) as Record<LogLevel, number>,
  );

  onMount(async () => {
    entries = await call('logs:list');
    unsubscribe = onLog((entry) => {
      entries = [...entries.slice(-1999), entry];
    });
  });
  onDestroy(() => unsubscribe?.());

  $effect(() => {
    if (!follow) return;
    const length = shown.length;
    void tick().then(() => list?.scrollToIndex(length));
  });

  function toggle(level: LogLevel) {
    const next = new Set(levels);
    if (next.has(level)) next.delete(level);
    else next.add(level);
    levels = next;
  }

  async function copy() {
    await navigator.clipboard.writeText(formatLog(shown));
    toast(t('common.copied'), 'success');
  }

  async function clear() {
    await call('logs:clear');
    entries = [];
  }

  function time(at: number) {
    return new Date(at).toLocaleTimeString(undefined, { hour12: false });
  }
</script>

<PageHeader title={t('nav.logs')} description={t('logs.description')}>
  {#snippet actions()}
    <Button icon="copy" disabled={!shown.length} onclick={copy}>{t('common.copy')}</Button>
    <Button
      icon="export"
      disabled={!shown.length}
      onclick={() => saveTextFile(`pawchive-downloader-${stamp()}.log`, `${formatLog(shown)}\n`)}
      >{t('common.save')}</Button
    >
    <Button variant="ghost" icon="trash" disabled={!entries.length} onclick={clear}
      >{t('common.clear')}</Button
    >
  {/snippet}
</PageHeader>

<div class="toolbar">
  <div class="chips">
    {#each LEVELS as level (level)}
      <Chip
        label={t(`logs.${level}`)}
        count={counts[level]}
        active={levels.has(level)}
        onclick={() => toggle(level)}
      />
    {/each}
  </div>
  <TextInput
    label={t('logs.search')}
    placeholder={t('logs.search')}
    icon="search"
    type="search"
    clearable
    bind:value={query}
  />
  <label class="follow"
    ><Switch label={t('logs.follow')} bind:checked={follow} /><span>{t('logs.follow')}</span></label
  >
  <label class="level">
    <span>{t('logs.record')}</span>
    <Select
      label={t('logs.record')}
      value={app.settings.logLevel}
      options={LEVELS.map((l) => ({ value: l, label: t(`logs.${l}`) }))}
      onchange={(v) => updateSettings({ logLevel: v })}
    />
  </label>
</div>

<div class="console">
  <VirtualList bind:this={list} items={shown} rowHeight={30} key={(e) => String(e.id)}>
    {#snippet row(entry)}
      <div class="line {entry.level}" title={entry.detail ?? entry.message}>
        <span class="time mono-num">{time(entry.at)}</span>
        <span class="lvl">{entry.level}</span>
        <span class="scope truncate">{entry.scope}</span>
        <span class="msg truncate"
          >{entry.message}{#if entry.detail}<span class="detail"> {entry.detail}</span>{/if}</span
        >
      </div>
    {/snippet}
    {#snippet empty()}
      <Empty compact icon="logs" title={t('logs.empty')} />
    {/snippet}
  </VirtualList>
</div>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    margin-bottom: 14px;
  }
  .chips {
    display: flex;
    gap: 6px;
  }
  .toolbar > :global(.field) {
    flex: 1;
    min-width: 200px;
  }
  .follow,
  .level {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--fs-sm);
    color: var(--text-dim);
  }
  .level :global(select) {
    min-width: 120px;
  }
  .console {
    height: calc(100vh - 290px);
    min-height: 320px;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    background: var(--bg-elev);
    overflow: hidden;
    font-size: var(--fs-sm);
  }
  .line {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 100%;
    padding: 0 14px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  }
  .line:hover {
    background: var(--bg-hover);
  }
  .time {
    color: var(--text-faint);
    flex: none;
  }
  .lvl {
    flex: none;
    width: 46px;
    text-transform: uppercase;
    font-size: var(--fs-xs);
    font-weight: 700;
    color: var(--text-faint);
  }
  .info .lvl {
    color: var(--info);
  }
  .warn .lvl {
    color: var(--warning);
  }
  .error .lvl {
    color: var(--danger);
  }
  .error {
    background: color-mix(in srgb, var(--danger) 6%, transparent);
  }
  .scope {
    flex: none;
    width: 110px;
    color: var(--text-dim);
  }
  .msg {
    flex: 1;
  }
  .detail {
    color: var(--text-faint);
    margin-left: 1ch;
  }
</style>
