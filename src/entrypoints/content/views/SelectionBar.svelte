<script lang="ts">
  import { slide } from 'svelte/transition';
  import { app, t } from '../../../ui/state/app.svelte';
  import Button from '../../../ui/components/Button.svelte';
  import Icon from '../../../ui/components/Icon.svelte';
  import Switch from '../../../ui/components/Switch.svelte';
  import type { CardController } from '../cards';
  import { page, selectAllCards, selectedCount } from '../page.svelte';
  import { queueJob } from './jobs';

  let { cards, prominent = false }: { cards: CardController | null; prominent?: boolean } =
    $props();

  let busy = $state(false);
  const count = $derived(selectedCount());

  async function download() {
    const refs = Object.values(page.selected).map(({ service, creatorId, postId }) => ({
      service,
      creatorId,
      postId,
    }));
    if (refs.length === 0) return;
    busy = true;
    const ok = await queueJob(
      {
        kind: 'refs',
        title:
          refs.length === 1
            ? (Object.values(page.selected)[0]?.title ?? '')
            : t('selection.jobTitle', { count: refs.length }),
        refs,
        options: { mode: app.settings.downloadMode },
      },
      t('toast.queuedPosts', { count: refs.length }),
    );
    busy = false;
    if (ok) {
      selectAllCards(false);
      cards?.setSelecting(false);
    }
  }
</script>

<section class="selection" class:prominent class:on={page.selecting}>
  <div class="head">
    <span class="icon-wrap"><Icon name="cursor" /></span>
    <div class="text">
      <span class="title">{t('selection.title')}</span>
      <span class="hint"
        >{page.cards.length
          ? t('selection.hint', { count: page.cards.length })
          : t('selection.noCards')}</span
      >
    </div>
    <Switch
      label={t('selection.title')}
      checked={page.selecting}
      disabled={page.cards.length === 0}
      onchange={(on) => cards?.setSelecting(on)}
    />
  </div>
  {#if page.selecting}
    <div class="body" transition:slide={{ duration: 200 }}>
      <div class="row">
        <span class="mono-num count">{t('selection.count', { count })}</span>
        <Button size="sm" variant="ghost" onclick={() => selectAllCards(true)}
          >{t('selection.all')}</Button
        >
        <Button
          size="sm"
          variant="ghost"
          disabled={count === 0}
          onclick={() => selectAllCards(false)}>{t('common.clear')}</Button
        >
      </div>
      <Button
        variant="primary"
        icon="downloadMultiple"
        block
        disabled={count === 0}
        loading={busy}
        onclick={download}
      >
        {t('selection.download', { count })}
      </Button>
    </div>
  {/if}
</section>

<style>
  .selection {
    flex: none;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    background: var(--bg-elev);
    transition:
      border-color var(--dur) var(--ease),
      background-color var(--dur) var(--ease);
  }
  .on {
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
    background: var(--accent-softer);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
  }
  .icon-wrap {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 9px;
    background: var(--bg-elev-3);
    color: var(--accent-strong);
    flex: none;
  }
  .text {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .title {
    font-weight: 700;
  }
  .hint {
    font-size: var(--fs-xs);
    color: var(--text-dim);
  }
  .body {
    display: grid;
    gap: 10px;
    padding: 0 12px 12px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .count {
    flex: 1;
    font-weight: 600;
  }
</style>
