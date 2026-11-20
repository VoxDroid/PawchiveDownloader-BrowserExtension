<script lang="ts">
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { favoritesText, favoriteUrl, type Favorite } from '../../../lib/favorites';
  import type { JobRequest } from '../../../lib/jobs/types';
  import { call } from '../../../lib/messages';
  import { bareService, siteName, siteOfService } from '../../../lib/pawchive/sites';
  import { pageUrls } from '../../../lib/pawchive/urls';
  import { fmt, t } from '../../../ui/state/app.svelte';
  import { toast } from '../../../ui/state/toasts.svelte';
  import Button from '../../../ui/components/Button.svelte';
  import Empty from '../../../ui/components/Empty.svelte';
  import IconButton from '../../../ui/components/IconButton.svelte';
  import Segmented from '../../../ui/components/Segmented.svelte';
  import TextInput from '../../../ui/components/TextInput.svelte';
  import PageHeader from '../PageHeader.svelte';
  import { pickTextFile, saveTextFile, stamp } from '../download';

  let list = $state<Favorite[] | null>(null);
  let search = $state('');
  let kind = $state<'all' | 'post' | 'creator'>('all');
  let paste = $state('');

  const shown = $derived(
    (list ?? []).filter((f) => {
      if (kind !== 'all' && f.kind !== kind) return false;
      const q = search.trim().toLowerCase();
      return !q || f.title.toLowerCase().includes(q) || f.note.toLowerCase().includes(q);
    }),
  );

  async function refresh() {
    list = await call('favorites:list').catch(() => []);
  }

  async function addPasted() {
    const { added } = await call('favorites:import', { text: paste });
    if (added === 0) toast(t('favorites.invalid'), 'error');
    else {
      toast(t('favorites.addedCount', { count: added }), 'success');
      paste = '';
    }
    await refresh();
  }

  async function importList() {
    const text = await pickTextFile('.txt,text/plain');
    if (text === null) return;
    const { added } = await call('favorites:import', { text });
    toast(t('favorites.addedCount', { count: added }), added ? 'success' : 'info');
    await refresh();
  }

  function exportList() {
    saveTextFile(`pawchive-favorites-${stamp()}.txt`, favoritesText(list ?? []));
    toast(t('favorites.exported', { count: list?.length ?? 0 }), 'success');
  }

  async function remove(f: Favorite) {
    await call('favorites:remove', { keys: [f.key] });
    toast(t('favorites.removed'));
    await refresh();
  }

  async function saveNote(f: Favorite, note: string) {
    if (note === f.note) return;
    await call('favorites:update', { key: f.key, note });
    await refresh();
  }

  async function download(f: Favorite) {
    const request: JobRequest =
      f.kind === 'post' && f.postId
        ? {
            kind: 'refs',
            title: f.title,
            refs: [{ service: f.service, creatorId: f.creatorId, postId: f.postId }],
          }
        : { kind: 'creator', service: f.service, creatorId: f.creatorId };
    await call('jobs:create', { request });
    toast(t('favorites.queued', { count: 1 }), 'success');
  }

  onMount(() => void refresh());
</script>

<PageHeader title={t('nav.favorites')} description={t('favorites.description')}>
  {#snippet actions()}
    <Button icon="import" onclick={importList}>{t('common.import')}</Button>
    <Button icon="export" disabled={!list?.length} onclick={exportList}>{t('common.export')}</Button
    >
  {/snippet}
</PageHeader>

<div class="add">
  <TextInput
    label={t('favorites.addLabel')}
    placeholder={t('favorites.addPlaceholder')}
    icon="link"
    value={paste}
    oninput={(v) => (paste = v)}
    onkeydown={(e) => e.key === 'Enter' && paste.trim() && void addPasted()}
  />
  <Button variant="primary" icon="star" disabled={!paste.trim()} onclick={addPasted}
    >{t('favorites.add')}</Button
  >
</div>

<div class="filters">
  <Segmented
    label={t('favorites.kind')}
    size="sm"
    bind:value={kind}
    options={[
      { value: 'all', label: t('history.all') },
      { value: 'creator', label: t('favorites.creators') },
      { value: 'post', label: t('favorites.posts') },
    ]}
  />
  <TextInput
    label={t('favorites.search')}
    placeholder={t('favorites.search')}
    icon="search"
    type="search"
    value={search}
    oninput={(v) => (search = v)}
  />
</div>

{#if list && list.length === 0}
  <Empty icon="star" title={t('favorites.emptyTitle')} body={t('favorites.emptyBody')} />
{:else}
  <ul class="list">
    {#each shown as f (f.key)}
      <li class="row" animate:flip={{ duration: 220, easing: cubicOut }}>
        <img
          class="avatar blurrable"
          src={pageUrls.icon(f.service, f.creatorId)}
          alt=""
          loading="lazy"
        />
        <div class="info">
          <a class="title truncate" href={favoriteUrl(f)} target="_blank" rel="noreferrer"
            >{f.title}</a
          >
          <span class="sub muted">
            {f.kind === 'post' ? t('favorites.posts') : t('favorites.creator')} /
            {siteName(siteOfService(f.service))} / {bareService(f.service)} /
            {t('favorites.addedAt', { date: fmt.date(new Date(f.addedAt).toISOString()) })}
          </span>
          <TextInput
            label={t('favorites.notePlaceholder')}
            placeholder={t('favorites.notePlaceholder')}
            value={f.note}
            onchange={(v) => void saveNote(f, v)}
          />
        </div>
        <Button size="sm" icon="download" onclick={() => download(f)}
          >{t('favorites.download')}</Button
        >
        <IconButton
          size="sm"
          icon="trash"
          label={t('favorites.remove')}
          tipSide="left"
          onclick={() => remove(f)}
        />
      </li>
    {/each}
  </ul>
{/if}

<style>
  .add,
  .filters {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 14px;
  }
  .add > :global(*:first-child),
  .filters > :global(*:last-child) {
    flex: 1;
  }
  .list {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 12px);
    background: var(--bg-elev);
  }
  .avatar {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    object-fit: cover;
    background: var(--bg-elev-2, var(--border));
    flex: none;
  }
  .info {
    display: grid;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }
  .title {
    font-weight: 600;
    color: var(--text);
    text-decoration: none;
  }
  .title:hover {
    color: var(--accent);
  }
  .sub {
    font-size: var(--fs-sm);
  }
</style>
