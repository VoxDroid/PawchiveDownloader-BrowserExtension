<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';

  /**
   * Renders only the rows in view (plus a small overscan), so lists with
   * thousands of posts scroll as smoothly as short ones. Rows have a fixed
   * height.
   */
  interface Props {
    items: T[];
    rowHeight: number;
    overscan?: number;
    key: (item: T) => string;
    row: Snippet<[T, number]>;
    empty?: Snippet;
  }

  let { items, rowHeight, overscan = 6, key, row, empty }: Props = $props();

  let viewport = $state<HTMLDivElement>();
  let scrollTop = $state(0);
  let height = $state(400);

  const start = $derived(Math.max(0, Math.floor(scrollTop / rowHeight) - overscan));
  const end = $derived(
    Math.min(items.length, Math.ceil((scrollTop + height) / rowHeight) + overscan),
  );
  const visible = $derived(items.slice(start, end).map((item, i) => ({ item, index: start + i })));

  $effect(() => {
    if (!viewport) return;
    const observer = new ResizeObserver(() => (height = viewport?.clientHeight ?? height));
    observer.observe(viewport);
    return () => observer.disconnect();
  });

  // Keep the scroll position valid when the list shrinks (e.g. filtering).
  $effect(() => {
    const max = Math.max(0, items.length * rowHeight - height);
    if (viewport && scrollTop > max) viewport.scrollTop = max;
  });

  export function scrollToIndex(index: number) {
    viewport?.scrollTo({ top: index * rowHeight, behavior: 'smooth' });
  }
</script>

<div class="viewport" bind:this={viewport} onscroll={() => (scrollTop = viewport?.scrollTop ?? 0)}>
  {#if items.length === 0 && empty}
    {@render empty()}
  {:else}
    <div class="spacer" style="height:{items.length * rowHeight}px">
      {#each visible as entry (key(entry.item))}
        <div
          class="row"
          style="transform:translateY({entry.index * rowHeight}px);height:{rowHeight}px"
        >
          {@render row(entry.item, entry.index)}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .viewport {
    position: relative;
    overflow-y: auto;
    overscroll-behavior: contain;
    height: 100%;
    min-height: 0;
  }
  .spacer {
    position: relative;
    width: 100%;
  }
  .row {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    will-change: transform;
  }
</style>
