<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { call } from '../../../lib/messages';
  import { FILE_CATEGORIES, htmlToText } from '../../../lib/pawchive/normalize';
  import { findRelay, parseRelayLinks } from '../../../lib/pawchive/relay';
  import type { Creator, FileCategory, Post } from '../../../lib/pawchive/types';
  import { app, fmt, t } from '../../../ui/state/app.svelte';
  import { toast } from '../../../ui/state/toasts.svelte';
  import Button from '../../../ui/components/Button.svelte';
  import Chip from '../../../ui/components/Chip.svelte';
  import Empty from '../../../ui/components/Empty.svelte';
  import Icon from '../../../ui/components/Icon.svelte';
  import IconButton from '../../../ui/components/IconButton.svelte';
  import Segmented from '../../../ui/components/Segmented.svelte';
  import Spinner from '../../../ui/components/Spinner.svelte';
  import { panel } from '../panel';
  import { siteClient } from '../page.svelte';
  import DownloadFooter, { type FooterChoice } from './DownloadFooter.svelte';
  import FileTile from './FileTile.svelte';
  import { choiceOptions, queueJob } from './jobs';

  let { ref }: { ref: { service: string; creatorId: string; postId: string } } = $props();

  let post = $state<Post | null>(null);
  let creator = $state<Creator | null>(null);
  let error = $state<string | null>(null);
  let known = $state(new Set<string>());
  let relayable = $state(new Set<number>());
  let selected = $state(new Set<number>());
  let filter = $state<Set<FileCategory>>(new Set());
  let hideDownloaded = $state(false);
  let tab = $state<'files' | 'text'>('files');
  let busy = $state(false);
  let lastIndex: number | null = null;
  const controller = new AbortController();

  const counts = $derived.by(() => {
    const result = new Map<FileCategory, number>();
    for (const file of post?.files ?? [])
      result.set(file.category, (result.get(file.category) ?? 0) + 1);
    return result;
  });
  const visible = $derived(
    (post?.files ?? []).filter(
      (f) =>
        (filter.size === 0 || filter.has(f.category)) &&
        !(hideDownloaded && f.hash && known.has(f.hash)),
    ),
  );
  const allVisibleSelected = $derived(
    visible.length > 0 && visible.every((f) => selected.has(f.index)),
  );
  const text = $derived(post ? htmlToText(post.contentHtml) : '');
  const previewOnly = $derived((post?.files ?? []).filter((f) => f.previewOnly).length);

  async function refreshKnown() {
    const hashes = (post?.files ?? []).map((f) => f.hash).filter((h): h is string => Boolean(h));
    if (!hashes.length) return;
    known = new Set(await call('history:known-hashes', { hashes }).catch(() => [] as string[]));
  }

  // Mark files as saved as soon as a download finishes.
  const finishedJobs = $derived(app.jobs.filter((j) => j.status === 'done').length);
  $effect(() => {
    if (finishedJobs > 0) void refreshKnown();
  });

  async function load() {
    error = null;
    try {
      const [loaded, profile] = await Promise.all([
        siteClient.getPost(ref.service, ref.creatorId, ref.postId, controller.signal),
        siteClient.getCreator(ref.service, ref.creatorId, controller.signal).catch(() => null),
      ]);
      post = loaded;
      creator = profile;
      selected = new Set(
        loaded.files.filter((f) => app.settings.categories[f.category]).map((f) => f.index),
      );
      void refreshKnown();
      // The open page already carries the temporary links of preview-only files.
      if (loaded.files.some((f) => f.previewOnly)) {
        const index = parseRelayLinks(document.documentElement.outerHTML);
        relayable = new Set(
          loaded.files.filter((f) => f.previewOnly && findRelay(index, f)).map((f) => f.index),
        );
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function toggleFilter(category: FileCategory) {
    const next = new Set(filter);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    filter = next;
  }

  function onselect(index: number, event: MouseEvent) {
    const next = new Set(selected);
    const position = visible.findIndex((f) => f.index === index);
    if (event.shiftKey && lastIndex !== null) {
      const from = visible.findIndex((f) => f.index === lastIndex);
      const [a, b] = from < position ? [from, position] : [position, from];
      const on = !selected.has(index);
      for (const f of visible.slice(a, b + 1)) {
        if (on) next.add(f.index);
        else next.delete(f.index);
      }
    } else if (next.has(index)) next.delete(index);
    else next.add(index);
    lastIndex = index;
    selected = next;
  }

  function selectVisible(on: boolean) {
    const next = new Set(selected);
    for (const f of visible) {
      if (on) next.add(f.index);
      else next.delete(f.index);
    }
    selected = next;
  }

  function invert() {
    const next = new Set<number>();
    for (const f of post?.files ?? []) if (!selected.has(f.index)) next.add(f.index);
    selected = next;
  }

  async function download(choice: FooterChoice, indexes?: number[]) {
    if (!post) return;
    busy = true;
    const fileIndexes = indexes ?? [...selected].sort((a, b) => a - b);
    await queueJob(
      {
        kind: 'posts',
        title: post.title || post.id,
        creator: creator
          ? { service: creator.service, id: creator.id, name: creator.name }
          : { service: post.service, id: post.creatorId, name: post.creatorId },
        posts: [{ post, fileIndexes }],
        options: choiceOptions(choice),
      },
      t('toast.queuedFiles', { count: fileIndexes.length }),
    );
    busy = false;
  }

  async function copyText() {
    await navigator.clipboard.writeText(text);
    toast(t('common.copied'), 'success');
  }

  onMount(() => {
    void load();
    panel.quickDownload = () => {
      if (!post) return;
      void download(
        {
          mode: app.settings.downloadMode,
          saveText: app.settings.saveContent !== 'none',
          skipDownloaded: app.settings.skipDownloaded,
        },
        post.files.filter((f) => app.settings.categories[f.category]).map((f) => f.index),
      );
    };
  });

  onDestroy(() => {
    controller.abort();
    panel.quickDownload = undefined;
  });
</script>

<div class="view">
  {#if error}
    <Empty icon="cloudOff" title={t('post.loadFailed')} body={error}>
      <Button icon="retry" onclick={load}>{t('common.retry')}</Button>
    </Empty>
  {:else if !post}
    <div class="loading"><Spinner size={22} /><span>{t('post.loading')}</span></div>
  {:else}
    <div class="intro" in:fade={{ duration: 200 }}>
      <img class="avatar" src={creator?.iconUrl ?? ''} alt="" loading="lazy" />
      <div class="meta">
        <h2 class="title" title={post.title}>{post.title || t('common.untitled')}</h2>
        <p class="sub truncate">
          {creator?.name ?? post.creatorId}
          <span class="sep">/</span>{post.service}
          {#if post.published}<span class="sep">/</span>{fmt.date(post.published)}{/if}
        </p>
      </div>
    </div>

    <div class="tabs">
      <Segmented
        label={t('post.view')}
        size="sm"
        bind:value={tab}
        options={[
          { value: 'files', label: t('post.files', { count: post.files.length }), icon: 'folder' },
          { value: 'text', label: t('post.text'), icon: 'text' },
        ]}
      />
    </div>

    {#if tab === 'files'}
      {#if post.files.length === 0}
        <Empty
          compact
          icon="folderOpen"
          title={t('post.noFiles')}
          body={text ? t('post.noFilesHint') : undefined}
        />
      {:else}
        <div class="filters">
          {#each FILE_CATEGORIES.filter((c) => counts.has(c)) as category (category)}
            <Chip
              label={t(`category.${category}`)}
              count={counts.get(category)}
              active={filter.has(category)}
              onclick={() => toggleFilter(category)}
            />
          {/each}
        </div>
        <div class="toolbar">
          <span class="muted mono-num"
            >{t('post.selected', { count: selected.size, total: post.files.length })}</span
          >
          <span class="spacer"></span>
          <IconButton
            size="sm"
            icon={allVisibleSelected ? 'selectNone' : 'selectAll'}
            label={allVisibleSelected ? t('common.selectNone') : t('common.selectAll')}
            onclick={() => selectVisible(!allVisibleSelected)}
          />
          <IconButton size="sm" icon="invert" label={t('common.invert')} onclick={invert} />
          <IconButton
            size="sm"
            icon={hideDownloaded ? 'eyeOff' : 'eye'}
            active={hideDownloaded}
            label={t('post.hideDownloaded')}
            tipSide="left"
            onclick={() => (hideDownloaded = !hideDownloaded)}
          />
        </div>
        {#if previewOnly > 0}
          <p class="notice">
            <Icon name="info" />
            <span
              >{app.settings.previewOnly === 'relay'
                ? t('post.previewNoticeRelay', { count: previewOnly })
                : t('post.previewNotice', { count: previewOnly })}</span
            >
          </p>
        {/if}
        <div
          class="grid"
          role="listbox"
          aria-multiselectable="true"
          aria-label={t('post.filesLabel')}
        >
          {#each visible as file (file.index)}
            <FileTile
              {file}
              selected={selected.has(file.index)}
              downloaded={Boolean(file.hash && known.has(file.hash))}
              relay={file.previewOnly ? relayable.has(file.index) : null}
              onselect={(e) => onselect(file.index, e)}
            />
          {/each}
        </div>
      {/if}
    {:else}
      <div class="text-view">
        {#if text}
          <div class="text-tools">
            <Button size="sm" variant="ghost" icon="copy" onclick={copyText}
              >{t('common.copy')}</Button
            >
          </div>
          <pre>{text}</pre>
        {:else}
          <Empty compact icon="text" title={t('post.noText')} />
        {/if}
        {#if post.tags.length}
          <div class="tags">
            {#each post.tags as tag (tag)}<span class="tag"><Icon name="tag" />{tag}</span>{/each}
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>
{#if post}
  <DownloadFooter
    label={selected.size ? t('post.download', { count: selected.size }) : t('post.downloadNothing')}
    disabled={selected.size === 0 && !text}
    {busy}
    showText={Boolean(text)}
    ondownload={(choice) => download(choice)}
  />
{/if}

<style>
  .view {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 14px 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--text-dim);
    padding: 60px 0;
  }
  .intro {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .avatar {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    object-fit: cover;
    background: var(--bg-elev-2);
    border: 1px solid var(--border);
    flex: none;
  }
  .meta {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .title {
    font-size: var(--fs-lg);
    font-weight: 700;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .sub {
    font-size: var(--fs-sm);
    color: var(--text-dim);
  }
  .sep {
    margin: 0 6px;
    color: var(--text-faint);
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: var(--fs-sm);
  }
  .spacer {
    flex: 1;
  }
  .notice {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    padding: 9px 11px;
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--info) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--info) 22%, transparent);
    color: var(--text-dim);
    font-size: var(--fs-sm);
  }
  .notice :global(.icon) {
    color: var(--info);
    margin-top: 1px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
    gap: 8px;
  }
  .text-view {
    display: grid;
    gap: 10px;
  }
  .text-tools {
    display: flex;
    justify-content: flex-end;
  }
  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font: inherit;
    font-size: var(--fs-md);
    line-height: 1.6;
    padding: 14px;
    border-radius: var(--radius-md);
    background: var(--bg-elev);
    border: 1px solid var(--border);
    color: var(--text);
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px 2px 5px;
    border-radius: 99px;
    background: var(--bg-elev-2);
    color: var(--text-dim);
    font-size: var(--fs-xs);
  }
</style>
