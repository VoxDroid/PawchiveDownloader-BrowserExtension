<script lang="ts">
  import type { PostFile } from '../../../lib/pawchive/types';
  import type { IconName } from '../../../ui/icons.generated';
  import Icon from '../../../ui/components/Icon.svelte';
  import { t } from '../../../ui/state/app.svelte';

  interface Props {
    file: PostFile;
    selected: boolean;
    downloaded: boolean;
    relay: boolean | null;
    onselect: (event: MouseEvent) => void;
  }

  let { file, selected, downloaded, relay, onselect }: Props = $props();

  const CATEGORY_ICON: Record<PostFile['category'], IconName> = {
    image: 'image',
    video: 'video',
    audio: 'audio',
    archive: 'archive',
    document: 'document',
    text: 'text',
    other: 'file',
  };

  let loaded = $state(false);
  let failed = $state(false);
  const link = $derived(file.url ?? file.thumbnailUrl);
</script>

<div
  class="tile"
  class:selected
  role="option"
  aria-selected={selected}
  tabindex="0"
  title={file.name}
  onclick={onselect}
  onkeydown={(e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onselect(e as unknown as MouseEvent);
    }
  }}
>
  <div class="thumb">
    {#if file.thumbnailUrl && !failed}
      <img
        src={file.thumbnailUrl}
        alt=""
        loading="lazy"
        decoding="async"
        class:loaded
        onload={() => (loaded = true)}
        onerror={() => (failed = true)}
      />
    {/if}
    {#if !file.thumbnailUrl || failed || !loaded}
      <span class="placeholder"><Icon name={CATEGORY_ICON[file.category]} size={26} /></span>
    {/if}
    <span class="check" aria-hidden="true">
      <svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" /></svg>
    </span>
    {#if file.ext}<span class="ext">{file.ext}</span>{/if}
    {#if link}
      <a
        class="open"
        href={link}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={t('file.open')}
        onclick={(e) => e.stopPropagation()}><Icon name="external" /></a
      >
    {/if}
  </div>
  <div class="name">{file.name}</div>
  <div class="tags">
    {#if downloaded}
      <span class="tag ok" data-tip={t('file.downloadedHint')}
        ><Icon name="check" />{t('file.downloaded')}</span
      >
    {/if}
    {#if file.previewOnly}
      {#if relay}
        <span class="tag relay" data-tip={t('file.relayHint')}
          ><Icon name="timer" />{t('file.relay')}</span
        >
      {:else}
        <span class="tag warn" data-tip={t('file.previewHint')}
          ><Icon name="eyeOff" />{t('file.preview')}</span
        >
      {/if}
    {/if}
  </div>
</div>

<style>
  .tile {
    display: grid;
    gap: 6px;
    padding: 6px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg-elev);
    cursor: pointer;
    user-select: none;
    transition:
      border-color var(--dur-fast) var(--ease),
      background-color var(--dur-fast) var(--ease),
      transform var(--dur) var(--ease-spring),
      box-shadow var(--dur) var(--ease);
    min-width: 0;
    outline: none;
  }
  .tile:hover {
    border-color: var(--border-strong);
    transform: translateY(-1px);
  }
  .tile:active {
    transform: scale(0.98);
  }
  .tile:focus-visible {
    box-shadow: var(--focus-ring);
  }
  .selected {
    border-color: var(--accent);
    background: var(--accent-softer);
    box-shadow: 0 0 0 1px var(--accent) inset;
  }
  .thumb {
    position: relative;
    aspect-ratio: 1;
    border-radius: calc(var(--radius-md) - 4px);
    overflow: hidden;
    background: var(--bg-elev-2);
  }
  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transform: scale(1.04);
    transition:
      opacity var(--dur-slow) var(--ease),
      transform 600ms var(--ease-out);
  }
  img.loaded {
    opacity: 1;
    transform: none;
  }
  .placeholder {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--text-faint);
  }
  .check {
    position: absolute;
    top: 6px;
    left: 6px;
    width: 20px;
    height: 20px;
    border-radius: 6px;
    display: grid;
    place-items: center;
    background: rgb(10 12 18 / 0.55);
    border: 1.5px solid rgb(255 255 255 / 0.7);
    backdrop-filter: blur(4px);
    transition:
      background-color var(--dur-fast) var(--ease),
      border-color var(--dur-fast) var(--ease),
      transform var(--dur) var(--ease-spring);
  }
  .selected .check {
    background: var(--accent);
    border-color: var(--accent);
    transform: scale(1.06);
  }
  .check svg {
    width: 12px;
    height: 12px;
    fill: none;
    stroke: #fff;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 16;
    stroke-dashoffset: 16;
    transition: stroke-dashoffset var(--dur) var(--ease-out);
  }
  .selected .check svg {
    stroke-dashoffset: 0;
  }
  .ext {
    position: absolute;
    bottom: 6px;
    left: 6px;
    padding: 0 6px;
    border-radius: 5px;
    background: rgb(10 12 18 / 0.7);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    line-height: 17px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .open {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    display: grid;
    place-items: center;
    background: rgb(10 12 18 / 0.6);
    color: #fff;
    opacity: 0;
    transition: opacity var(--dur-fast) var(--ease);
    text-decoration: none;
  }
  .tile:hover .open,
  .open:focus-visible {
    opacity: 1;
  }
  .name {
    font-size: var(--fs-xs);
    line-height: 1.35;
    color: var(--text);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-all;
    min-height: 2.7em;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .tags:empty {
    display: none;
  }
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 0 6px 0 3px;
    border-radius: 99px;
    font-size: 10px;
    font-weight: 600;
    line-height: 18px;
  }
  .ok {
    background: color-mix(in srgb, var(--success) 16%, transparent);
    color: var(--success);
  }
  .warn {
    background: color-mix(in srgb, var(--warning) 16%, transparent);
    color: var(--warning);
  }
  .relay {
    background: color-mix(in srgb, var(--info) 16%, transparent);
    color: var(--info);
  }
</style>
