<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { fade, slide } from 'svelte/transition';
  import { call } from '../../../lib/messages';
  import type { Creator, Post } from '../../../lib/pawchive/types';
  import { watchKey } from '../../../lib/watch';
  import { app, fmt, t } from '../../../ui/state/app.svelte';
  import { toast } from '../../../ui/state/toasts.svelte';
  import Button from '../../../ui/components/Button.svelte';
  import Checkbox from '../../../ui/components/Checkbox.svelte';
  import Empty from '../../../ui/components/Empty.svelte';
  import Icon from '../../../ui/components/Icon.svelte';
  import IconButton from '../../../ui/components/IconButton.svelte';
  import Progress from '../../../ui/components/Progress.svelte';
  import TextInput from '../../../ui/components/TextInput.svelte';
  import VirtualList from '../../../ui/components/VirtualList.svelte';
  import type { CardController } from '../cards';
  import { cardKey, siteClient } from '../page.svelte';
  import DownloadFooter, { type FooterChoice } from './DownloadFooter.svelte';
  import SelectionBar from './SelectionBar.svelte';
  import { choiceOptions, queueJob } from './jobs';

  let {
    ref,
    cards,
  }: { ref: { service: string; creatorId: string }; cards: CardController | null } = $props();

  let creator = $state<Creator | null>(null);
  let watching = $state(false);
  let watchBusy = $state(false);
  let posts = $state<Post[] | null>(null);
  let scanning = $state(false);
  let scanned = $state({ pages: 0, posts: 0 });
  let scanError = $state<string | null>(null);
  let known = $state(new Set<string>());
  let selected = $state(new Set<string>());
  let query = $state('');
  let from = $state('');
  let to = $state('');
  let onlyFiles = $state(true);
  let hideDownloaded = $state(false);
  let showFilters = $state(false);
  let busy = $state(false);
  let controller: AbortController | null = null;
  let lastClicked: number | null = null;

  const filtered = $derived.by(() => {
    if (!posts) return [];
    const q = query.trim().toLowerCase();
    return posts.filter((p) => {
      if (q && !p.title.toLowerCase().includes(q) && !p.id.includes(q)) return false;
      const day = (p.published ?? '').slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (onlyFiles && p.files.length === 0) return false;
      if (
        hideDownloaded &&
        known.has(cardKey({ service: p.service, creatorId: p.creatorId, postId: p.id }))
      )
        return false;
      return true;
    });
  });
  const selectedPosts = $derived(filtered.filter((p) => selected.has(p.id)));
  const selectedFiles = $derived(selectedPosts.reduce((sum, p) => sum + p.files.length, 0));
  const allSelected = $derived(filtered.length > 0 && filtered.every((p) => selected.has(p.id)));
  const someSelected = $derived(filtered.some((p) => selected.has(p.id)));
  const activeFilters = $derived(
    [query, from, to].filter(Boolean).length + (hideDownloaded ? 1 : 0) + (onlyFiles ? 0 : 1),
  );

  onMount(async () => {
    siteClient
      .getCreator(ref.service, ref.creatorId)
      .then((c) => (creator = c))
      .catch(() => undefined);
    const list = await call('watch:list').catch(() => []);
    watching = list.some((e) => e.key === watchKey(ref.service, ref.creatorId));
  });

  onDestroy(() => controller?.abort());

  async function refreshKnown() {
    const keys = (posts ?? []).map((p) =>
      cardKey({ service: p.service, creatorId: p.creatorId, postId: p.id }),
    );
    if (!keys.length) return;
    known = new Set(await call('history:known-posts', { keys }).catch(() => [] as string[]));
  }

  // Mark posts as saved as soon as a download finishes.
  const finishedJobs = $derived(app.jobs.filter((j) => j.status === 'done').length);
  $effect(() => {
    if (finishedJobs > 0) void refreshKnown();
  });

  async function scan() {
    controller?.abort();
    controller = new AbortController();
    scanning = true;
    scanError = null;
    scanned = { pages: 0, posts: 0 };
    try {
      const all = await siteClient.getAllCreatorPosts(ref.service, ref.creatorId, {
        signal: controller.signal,
        onProgress: (p) => (scanned = { pages: p.pages, posts: p.posts }),
      });
      posts = all;
      selected = new Set(all.filter((p) => p.files.length > 0).map((p) => p.id));
      void refreshKnown();
    } catch (error) {
      if (!controller.signal.aborted)
        scanError = error instanceof Error ? error.message : String(error);
    } finally {
      scanning = false;
    }
  }

  function toggle(post: Post, index: number, event: MouseEvent | KeyboardEvent) {
    const next = new Set(selected);
    if ('shiftKey' in event && event.shiftKey && lastClicked !== null) {
      const [a, b] = lastClicked < index ? [lastClicked, index] : [index, lastClicked];
      const on = !selected.has(post.id);
      for (const p of filtered.slice(a, b + 1)) {
        if (on) next.add(p.id);
        else next.delete(p.id);
      }
    } else if (next.has(post.id)) next.delete(post.id);
    else next.add(post.id);
    lastClicked = index;
    selected = next;
  }

  function selectAll(on: boolean) {
    const next = new Set(selected);
    for (const p of filtered) {
      if (on) next.add(p.id);
      else next.delete(p.id);
    }
    selected = next;
  }

  /** A full file of these posts, to check the media server before downloading. */
  function probeUrl(list: readonly Post[]): string | null {
    for (const post of list) for (const file of post.files) if (file.url) return file.url;
    return null;
  }

  function creatorInfo() {
    return { service: ref.service, id: ref.creatorId, name: creator?.name ?? ref.creatorId };
  }

  async function downloadSelected(choice: FooterChoice) {
    busy = true;
    await queueJob(
      {
        kind: 'posts',
        title: creator?.name ?? ref.creatorId,
        creator: creatorInfo(),
        posts: selectedPosts.map((post) => ({ post })),
        options: choiceOptions(choice),
      },
      t('toast.queuedPosts', { count: selectedPosts.length }),
      probeUrl(selectedPosts),
    );
    busy = false;
  }

  async function downloadEverything(choice: FooterChoice) {
    busy = true;
    await queueJob(
      {
        kind: 'creator',
        service: ref.service,
        creatorId: ref.creatorId,
        options: choiceOptions(choice),
      },
      t('toast.queuedCreator', { name: creator?.name ?? ref.creatorId }),
      probeUrl(posts ?? []),
    );
    busy = false;
  }

  async function toggleWatch() {
    watchBusy = true;
    try {
      if (watching) {
        await call('watch:remove', { key: watchKey(ref.service, ref.creatorId) });
        watching = false;
        toast(t('watch.removed', { name: creatorInfo().name }));
      } else {
        await call('watch:add', {
          service: ref.service,
          creatorId: ref.creatorId,
          name: creatorInfo().name,
        });
        watching = true;
        toast(t('watch.added', { name: creatorInfo().name }), 'success');
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      watchBusy = false;
    }
  }

  function countBy(post: Post) {
    const counts: Partial<Record<'image' | 'video' | 'archive' | 'other', number>> = {};
    for (const f of post.files) {
      const key =
        f.category === 'image' || f.category === 'video' || f.category === 'archive'
          ? f.category
          : 'other';
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }
</script>

<div class="view">
  <div class="profile">
    {#if creator}
      <img class="banner blurrable" src={creator.bannerUrl} alt="" loading="lazy" in:fade />
    {/if}
    <div class="profile-row">
      <img class="avatar blurrable" src={creator?.iconUrl ?? ''} alt="" loading="lazy" />
      <div class="who">
        <h2 class="truncate">{creator?.name ?? ref.creatorId}</h2>
        <span class="muted truncate"
          >{ref.service}{#if creator?.updated}<span class="sep">/</span>{t('creator.updated', {
              date: fmt.date(creator.updated),
            })}{/if}</span
        >
      </div>
      <Button
        size="sm"
        variant={watching ? 'subtle' : 'secondary'}
        icon={watching ? 'bellRing' : 'bell'}
        loading={watchBusy}
        onclick={toggleWatch}
      >
        {watching ? t('creator.watching') : t('creator.watch')}
      </Button>
    </div>
  </div>

  {#if app.settings.cardSelectors}
    <SelectionBar {cards} />
  {/if}

  {#if posts === null}
    <div class="scan-card">
      {#if scanning}
        <div class="scan-progress" in:fade>
          <div class="scan-text">
            <span>{t('creator.scanning')}</span>
            <span class="mono-num muted"
              >{t('creator.scanCount', { pages: scanned.pages, posts: scanned.posts })}</span
            >
          </div>
          <Progress indeterminate label={t('creator.scanning')} />
          <Button size="sm" variant="ghost" icon="stop" onclick={() => controller?.abort()}
            >{t('common.cancel')}</Button
          >
        </div>
      {:else}
        <Empty
          compact
          icon="layers"
          title={t('creator.scanTitle')}
          body={scanError ?? t('creator.scanBody')}
        >
          <Button variant="primary" icon="search" onclick={scan}
            >{scanError ? t('common.retry') : t('creator.scan')}</Button
          >
        </Empty>
      {/if}
    </div>
  {:else}
    <div class="list-tools" in:fade>
      <div class="search-row">
        <TextInput
          label={t('creator.search')}
          placeholder={t('creator.search')}
          icon="search"
          type="search"
          clearable
          bind:value={query}
        />
        <IconButton
          icon="filter"
          label={t('creator.filters')}
          active={showFilters || activeFilters > 0}
          onclick={() => (showFilters = !showFilters)}
        />
        <IconButton icon="sync" label={t('creator.rescan')} tipSide="left" onclick={scan} />
      </div>
      {#if showFilters}
        <div class="filters" transition:slide={{ duration: 200 }}>
          <label class="date"
            ><span>{t('creator.from')}</span><TextInput
              label={t('creator.from')}
              type="date"
              bind:value={from}
            /></label
          >
          <label class="date"
            ><span>{t('creator.to')}</span><TextInput
              label={t('creator.to')}
              type="date"
              bind:value={to}
            /></label
          >
          <Checkbox bind:checked={onlyFiles}>{t('creator.onlyFiles')}</Checkbox>
          <Checkbox bind:checked={hideDownloaded}>{t('creator.hideDownloaded')}</Checkbox>
        </div>
      {/if}
      <div class="summary">
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          label={t('common.selectAll')}
          onchange={(on) => selectAll(on)}
        />
        <span class="mono-num"
          >{t('creator.selectedSummary', {
            count: selectedPosts.length,
            total: filtered.length,
            files: selectedFiles,
          })}</span
        >
      </div>
    </div>
    <div class="list">
      <VirtualList items={filtered} rowHeight={58} key={(p) => p.id}>
        {#snippet row(post, index)}
          {@const counts = countBy(post)}
          {@const isKnown = known.has(
            cardKey({ service: post.service, creatorId: post.creatorId, postId: post.id }),
          )}
          <div
            class="post-row"
            class:selected={selected.has(post.id)}
            role="option"
            aria-selected={selected.has(post.id)}
            tabindex="0"
            onclick={(e) => toggle(post, index, e)}
            onkeydown={(e) =>
              (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), toggle(post, index, e))}
          >
            <Checkbox
              checked={selected.has(post.id)}
              label={post.title}
              onchange={(_, e) => toggle(post, index, e)}
            />
            <div class="post-main">
              <span class="post-title truncate">{post.title || t('common.untitled')}</span>
              <span class="post-meta">
                <span class="mono-num">{fmt.date(post.published)}</span>
                {#if counts.image}<span class="pill"><Icon name="image" />{counts.image}</span>{/if}
                {#if counts.video}<span class="pill"><Icon name="video" />{counts.video}</span>{/if}
                {#if counts.archive}<span class="pill"><Icon name="archive" />{counts.archive}</span
                  >{/if}
                {#if counts.other}<span class="pill"><Icon name="file" />{counts.other}</span>{/if}
                {#if post.files.length === 0}<span class="faint">{t('creator.textOnly')}</span>{/if}
              </span>
            </div>
            {#if isKnown}<span
                class="known"
                data-tip={t('file.downloadedHint')}
                data-tip-side="left"><Icon name="success" /></span
              >{/if}
            <a
              class="open"
              href={post.url}
              aria-label={t('creator.openPost')}
              onclick={(e) => e.stopPropagation()}><Icon name="chevronRight" /></a
            >
          </div>
        {/snippet}
        {#snippet empty()}
          <Empty compact icon="search" title={t('creator.noMatches')} />
        {/snippet}
      </VirtualList>
    </div>
  {/if}
</div>

<DownloadFooter
  label={posts ? t('creator.download', { count: selectedPosts.length }) : t('creator.downloadAll')}
  disabled={posts !== null && selectedPosts.length === 0}
  {busy}
  ondownload={(choice) => (posts ? downloadSelected(choice) : downloadEverything(choice))}
/>

<style>
  .view {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 14px 0;
    overflow: hidden;
  }
  .profile {
    position: relative;
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid var(--border);
    background: var(--bg-elev);
    flex: none;
  }
  .banner {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.18;
    filter: blur(1px) saturate(1.2);
  }
  .profile-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
  }
  .avatar {
    width: 46px;
    height: 46px;
    border-radius: 12px;
    object-fit: cover;
    background: var(--bg-elev-2);
    border: 1px solid var(--border-strong);
    flex: none;
  }
  .who {
    display: grid;
    min-width: 0;
    flex: 1;
  }
  h2 {
    font-size: var(--fs-lg);
    font-weight: 700;
  }
  .who .muted {
    font-size: var(--fs-sm);
  }
  .sep {
    margin: 0 6px;
    color: var(--text-faint);
  }
  .scan-card {
    border-radius: var(--radius-lg);
    border: 1px dashed var(--border-strong);
    background: var(--bg-elev);
    flex: none;
  }
  .scan-progress {
    display: grid;
    gap: 12px;
    padding: 20px;
    justify-items: stretch;
  }
  .scan-progress > :global(button) {
    justify-self: center;
  }
  .scan-text {
    display: flex;
    justify-content: space-between;
    font-weight: 600;
    gap: 12px;
  }
  .list-tools {
    display: grid;
    gap: 10px;
    flex: none;
  }
  .search-row {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .search-row > :global(.field) {
    flex: 1;
  }
  .filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding: 12px;
    border-radius: var(--radius-md);
    background: var(--bg-elev);
    border: 1px solid var(--border);
    font-size: var(--fs-sm);
  }
  .date {
    display: grid;
    gap: 4px;
    color: var(--text-dim);
    font-size: var(--fs-xs);
  }
  .summary {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: var(--fs-sm);
    color: var(--text-dim);
    padding: 0 4px;
  }
  .list {
    flex: 1;
    min-height: 120px;
    margin: 0 -14px;
    border-top: 1px solid var(--border);
  }
  .post-row {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 100%;
    padding: 0 10px 0 18px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    cursor: pointer;
    transition: background-color var(--dur-fast) var(--ease);
    outline: none;
  }
  .post-row:hover {
    background: var(--bg-hover);
  }
  .post-row:focus-visible {
    box-shadow: inset 0 0 0 2px var(--accent);
  }
  .post-row.selected {
    background: var(--accent-softer);
  }
  .post-main {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .post-title {
    font-weight: 600;
  }
  .post-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--fs-xs);
    color: var(--text-dim);
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .known {
    color: var(--success);
    display: inline-flex;
  }
  .open {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: var(--radius-sm);
    color: var(--text-faint);
    text-decoration: none;
  }
  .open:hover {
    background: var(--bg-hover);
    color: var(--text);
    text-decoration: none;
  }
</style>
