<script lang="ts">
  import { onMount } from 'svelte';
  import { app, t, themed } from '../../ui/state/app.svelte';
  import Toaster from '../../ui/components/Toaster.svelte';
  import { createCardController, type CardController } from './cards';
  import { page } from './page.svelte';
  import Fab from './Fab.svelte';
  import Panel from './Panel.svelte';

  let cards: CardController | null = $state(null);
  let finishedJobs = $derived(app.jobs.filter((j) => j.status === 'done').length);

  onMount(() => {
    const controller = createCardController(t('select.card'));
    cards = controller;
    controller.scan();
    let pending = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => controller.scan());
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && page.selecting) controller.setSelecting(false);
      else if (event.key === 'Escape' && page.panelOpen) page.panelOpen = false;
    };
    window.addEventListener('keydown', onKey);
    return () => {
      observer.disconnect();
      window.removeEventListener('keydown', onKey);
      controller.destroy();
    };
  });

  $effect(() => {
    document.documentElement.style.setProperty('--pdl-accent', app.settings.accent);
  });

  // Re-mark downloaded posts when the cards, the setting or finished jobs change.
  $effect(() => {
    void page.cards.length;
    void finishedJobs;
    void cards?.markDownloaded(
      app.settings.markDownloaded && app.settings.cardSelectors,
      t('cards.downloaded'),
    );
  });

  $effect(() => {
    void Object.keys(page.selected).length;
    cards?.sync();
  });

  $effect(() => {
    if (!app.settings.cardSelectors && page.selecting) cards?.setSelecting(false);
  });
</script>

<div class="shell" use:themed>
  {#if app.settings.showFloatingButton || page.selecting}
    <Fab />
  {/if}
  {#if page.panelOpen}
    <Panel {cards} />
  {/if}
  <Toaster />
</div>

<style>
  .shell {
    position: relative;
    z-index: 2147483646;
    font-family: var(--font);
    color: var(--text);
  }
</style>
