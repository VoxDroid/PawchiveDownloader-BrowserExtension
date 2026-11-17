<script lang="ts">
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { call } from '../../../lib/messages';
  import { pageUrls } from '../../../lib/pawchive/urls';
  import type { WatchEntry } from '../../../lib/watch';
  import { app, fmt, t } from '../../../ui/state/app.svelte';
  import { toast } from '../../../ui/state/toasts.svelte';
  import Button from '../../../ui/components/Button.svelte';
  import Empty from '../../../ui/components/Empty.svelte';
  import Icon from '../../../ui/components/Icon.svelte';
  import IconButton from '../../../ui/components/IconButton.svelte';
  import Switch from '../../../ui/components/Switch.svelte';
  import TextInput from '../../../ui/components/TextInput.svelte';
  import PageHeader from '../PageHeader.svelte';
  import { pickTextFile, saveTextFile, stamp } from '../download';

  let entries = $state<WatchEntry[] | null>(null);
  let checking = $state<string | null>(null);
  let link = $state('');
  let adding = $state(false);
  let expanded = $state<string | null>(null);

  const sorted = $derived(
    [...(entries ?? [])].sort(
      (a, b) => b.newPosts.length - a.newPosts.length || a.name.localeCompare(b.name),
    ),
  );
  const interval = $derived(app.settings.watchIntervalMinutes);

  async function load() {
    entries = await call('watch:list');
  }

  onMount(load);

  $effect(() => {
    void app.watchNew;
    void load();
  });

  async function check(key?: string) {
    checking = key ?? 'all';
    try {
      const { found } = await call('watch:check', key ? { key } : {});
      toast(
        found > 0 ? t('watch.foundNew', { count: found }) : t('watch.nothingNew'),
        found > 0 ? 'success' : 'info',
      );
      await load();
    } finally {
      checking = null;
    }
  }

  async function add() {
    if (!link.trim()) return;
    adding = true;
    try {
      const { added } = await call('watch:import', { lines: [link] });
      if (added) {
        toast(t('watch.addedCount', { count: added }), 'success');
        link = '';
        await load();
      } else toast(t('watch.addInvalid'), 'warning');
    } finally {
      adding = false;
    }
  }

  async function downloadNew(entry: WatchEntry) {
    const result = await call('watch:download-new', { key: entry.key });
    if (result) toast(t('toast.queuedPosts', { count: entry.newPosts.length }), 'success');
    await load();
  }

  async function importList() {
    const text = await pickTextFile('.txt,text/plain');
    if (!text) return;
    const { added } = await call('watch:import', { lines: text.split(/\r?\n/) });
    toast(t('watch.addedCount', { count: added }), added ? 'success' : 'info');
    await load();
  }

  function exportList() {
    saveTextFile(
      `pawchive-watchlist-${stamp()}.txt`,
      `${(entries ?? []).map((e) => pageUrls.creator(e.service, e.creatorId)).join('\n')}\n`,
    );
  }
</script>

<PageHeader title={t('nav.watchlist')} description={t('watch.description')}>
  {#snippet actions()}
    <Button icon="import" onclick={importList}>{t('common.import')}</Button>
    <Button icon="export" disabled={!entries?.length} onclick={exportList}
      >{t('common.export')}</Button
    >
    <Button
      variant="primary"
      icon="sync"
      loading={checking === 'all'}
      disabled={!entries?.length}
      onclick={() => check()}>{t('watch.checkAll')}</Button
    >
  {/snippet}
</PageHeader>

<div class="add">
  <TextInput
    label={t('watch.addLabel')}
    placeholder="https://pawchive.pw/patreon/user/..."
    icon="link"
    type="url"
    bind:value={link}
    onkeydown={(e) => e.key === 'Enter' && add()}
  />
  <Button icon="plus" loading={adding} disabled={!link.trim()} onclick={add}
    >{t('watch.add')}</Button
  >
</div>
<p class="schedule faint">
  <Icon name="clock" />
  {interval > 0
    ? t('watch.schedule', { interval: t(`interval.${interval}`) })
    : t('watch.scheduleOff')}
</p>

{#if entries === null}
  <p class="muted">{t('common.loading')}</p>
{:else if entries.length === 0}
  <Empty icon="eye" title={t('watch.emptyTitle')} body={t('watch.emptyBody')} />
{:else}
  <div class="grid">
    {#each sorted as entry (entry.key)}
      <article
        class="card"
        class:fresh={entry.newPosts.length > 0}
        animate:flip={{ duration: 260, easing: cubicOut }}
      >
        <div class="top">
          <img
            class="avatar"
            src={pageUrls.icon(entry.service, entry.creatorId)}
            alt=""
            loading="lazy"
          />
          <div class="who">
            <a
              class="name truncate"
              href={pageUrls.creator(entry.service, entry.creatorId)}
              target="_blank"
              rel="noreferrer">{entry.name}</a
            >
            <span class="faint truncate">
              {entry.service}<span class="sep">/</span>{entry.lastCheckedAt
                ? t('watch.checked', { time: fmt.relative(entry.lastCheckedAt) })
                : t('watch.neverChecked')}
            </span>
          </div>
          {#if entry.newPosts.length}<span class="new mono-num"
              >{t('watch.newCount', { count: entry.newPosts.length })}</span
            >{/if}
        </div>
        {#if entry.error}<p class="error"><Icon name="warning" />{entry.error}</p>{/if}

        {#if entry.newPosts.length}
          <button
            type="button"
            class="expander"
            onclick={() => (expanded = expanded === entry.key ? null : entry.key)}
          >
            <Icon name={expanded === entry.key ? 'chevronUp' : 'chevronDown'} />
            {expanded === entry.key ? t('watch.hidePosts') : t('watch.showPosts')}
          </button>
          {#if expanded === entry.key}
            <ul class="posts" transition:slide={{ duration: 200 }}>
              {#each entry.newPosts as post (post.id)}
                <li>
                  <a
                    class="truncate"
                    href={pageUrls.post(entry.service, entry.creatorId, post.id)}
                    target="_blank"
                    rel="noreferrer">{post.title || post.id}</a
                  >
                  <span class="faint mono-num">{fmt.date(post.published)}</span>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}

        <div class="bottom">
          <label class="auto">
            <Switch
              label={t('watch.auto')}
              checked={entry.autoDownload}
              onchange={(on) =>
                call('watch:update', { key: entry.key, patch: { autoDownload: on } }).then(load)}
            />
            <span>{t('watch.auto')}</span>
          </label>
          <div class="actions">
            {#if entry.newPosts.length}
              <IconButton
                icon="check"
                label={t('watch.markSeen')}
                onclick={() => call('watch:mark-seen', { key: entry.key }).then(load)}
              />
            {/if}
            <IconButton
              icon="sync"
              label={t('watch.checkNow')}
              disabled={checking !== null}
              onclick={() => check(entry.key)}
            />
            <IconButton
              icon="trash"
              label={t('common.remove')}
              tipSide="left"
              onclick={() => call('watch:remove', { key: entry.key }).then(load)}
            />
          </div>
        </div>
        {#if entry.newPosts.length}
          <Button variant="primary" icon="download" block onclick={() => downloadNew(entry)}
            >{t('watch.downloadNew', { count: entry.newPosts.length })}</Button
          >
        {/if}
      </article>
    {/each}
  </div>
{/if}

<style>
  .add {
    display: flex;
    gap: 8px;
  }
  .add > :global(.field) {
    flex: 1;
  }
  .schedule {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--fs-xs);
    margin: 8px 2px 20px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 12px;
  }
  .card {
    display: grid;
    gap: 12px;
    align-content: start;
    padding: 14px;
    border-radius: var(--radius-lg);
    background: var(--bg-elev);
    border: 1px solid var(--border);
    transition: border-color var(--dur) var(--ease);
  }
  .card:hover {
    border-color: var(--border-strong);
  }
  .fresh {
    border-color: color-mix(in srgb, var(--success) 40%, transparent);
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--success) 6%, var(--bg-elev)),
      var(--bg-elev)
    );
  }
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .avatar {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    object-fit: cover;
    background: var(--bg-elev-2);
    border: 1px solid var(--border);
    flex: none;
  }
  .who {
    flex: 1;
    display: grid;
    min-width: 0;
  }
  .name {
    font-weight: 700;
    color: var(--text);
  }
  .who span {
    font-size: var(--fs-xs);
  }
  .sep {
    margin: 0 6px;
  }
  .new {
    padding: 2px 9px;
    border-radius: 99px;
    background: color-mix(in srgb, var(--success) 18%, transparent);
    color: var(--success);
    font-size: var(--fs-xs);
    font-weight: 700;
    white-space: nowrap;
  }
  .error {
    display: flex;
    gap: 6px;
    font-size: var(--fs-xs);
    color: var(--warning);
  }
  .expander {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 0;
    background: transparent;
    color: var(--text-dim);
    font-size: var(--fs-xs);
    font-weight: 600;
    padding: 0;
    justify-self: start;
  }
  .expander:hover {
    color: var(--text);
  }
  .posts {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
    max-height: 200px;
    overflow-y: auto;
    font-size: var(--fs-sm);
  }
  .posts li {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }
  .posts span {
    font-size: var(--fs-xs);
    white-space: nowrap;
  }
  .bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .auto {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--fs-xs);
    color: var(--text-dim);
  }
  .actions {
    display: flex;
    gap: 2px;
  }
</style>
