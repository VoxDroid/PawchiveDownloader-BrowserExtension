<script lang="ts">
  import { fly, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { call } from '../../lib/messages';
  import { app, t } from '../../ui/state/app.svelte';
  import IconButton from '../../ui/components/IconButton.svelte';
  import Icon from '../../ui/components/Icon.svelte';
  import JobCard from '../../ui/components/JobCard.svelte';
  import Logo from '../../ui/components/Logo.svelte';
  import type { CardController } from './cards';
  import { page } from './page.svelte';
  import PostView from './views/PostView.svelte';
  import CreatorView from './views/CreatorView.svelte';
  import ListingView from './views/ListingView.svelte';
  import OtherView from './views/OtherView.svelte';

  let { cards }: { cards: CardController | null } = $props();

  const side = $derived(app.settings.panelSide);
  const live = $derived(
    app.jobs.filter(
      (j) => j.status !== 'done' && j.status !== 'failed' && j.status !== 'cancelled',
    ),
  );
  const recent = $derived(
    app.jobs
      .filter((j) => j.finishedAt && Date.now() - j.finishedAt < 120_000)
      .slice(-2)
      .reverse(),
  );
  const shown = $derived([...live, ...recent].slice(0, 3));
  let jobsOpen = $state(true);

  const heading = $derived(
    page.ref.kind === 'post'
      ? t('panel.post')
      : page.ref.kind === 'creator'
        ? t('panel.creator')
        : page.ref.kind === 'listing'
          ? t('panel.listing')
          : t('app.name'),
  );
</script>

<aside
  class="panel {side}"
  aria-label={t('app.name')}
  transition:fly={{ x: side === 'right' ? 460 : -460, duration: 320, easing: cubicOut, opacity: 1 }}
>
  <header>
    <Logo size={30} />
    <div class="titles">
      <span class="eyebrow">{t('app.name')}</span>
      <h1 class="truncate">{heading}</h1>
    </div>
    <IconButton
      icon="queue"
      label={t('nav.downloads')}
      tipSide="bottom"
      onclick={() => call('app:open-dashboard', { tab: 'downloads' })}
    />
    <IconButton
      icon="settings"
      label={t('nav.settings')}
      tipSide="bottom"
      onclick={() => call('app:open-dashboard', { tab: 'settings' })}
    />
    <IconButton
      icon="close"
      label={t('common.close')}
      tipSide="left"
      onclick={() => (page.panelOpen = false)}
    />
  </header>

  <div class="body">
    {#key page.url}
      {#if page.ref.kind === 'post'}
        <PostView ref={page.ref} />
      {:else if page.ref.kind === 'creator'}
        <CreatorView ref={page.ref} {cards} />
      {:else if page.ref.kind === 'listing'}
        <ListingView {cards} />
      {:else}
        <OtherView {cards} />
      {/if}
    {/key}
  </div>

  {#if shown.length}
    <section class="jobs" transition:slide={{ duration: 220 }}>
      <button
        type="button"
        class="jobs-toggle"
        onclick={() => (jobsOpen = !jobsOpen)}
        aria-expanded={jobsOpen}
      >
        <Icon name="queue" />
        <span>{t('panel.activity')}</span>
        {#if live.length}<span class="count mono-num">{live.length}</span>{/if}
        <Icon name={jobsOpen ? 'chevronDown' : 'chevronUp'} class="chev" />
      </button>
      {#if jobsOpen}
        <div class="job-list" transition:slide={{ duration: 200 }}>
          {#each shown as job (job.id)}
            <JobCard {job} compact />
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</aside>

<style>
  .panel {
    position: fixed;
    top: 12px;
    bottom: 12px;
    width: min(460px, calc(100vw - 24px));
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    font-size: var(--fs-md);
  }
  .right {
    right: 12px;
  }
  .left {
    left: 12px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 12px 12px 16px;
    border-bottom: 1px solid var(--border);
    background: linear-gradient(180deg, var(--accent-softer), transparent);
  }
  .titles {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .eyebrow {
    font-size: var(--fs-xs);
    color: var(--text-faint);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-weight: 600;
  }
  h1 {
    font-size: var(--fs-lg);
    font-weight: 700;
    line-height: 1.25;
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .body > :global(.view) {
    flex: 1;
    min-height: 0;
  }
  .jobs {
    border-top: 1px solid var(--border);
    background: var(--bg-elev);
    padding: 6px 10px 10px;
  }
  .jobs-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    border: 0;
    background: transparent;
    color: var(--text-dim);
    font-weight: 600;
    font-size: var(--fs-sm);
    padding: 6px 4px;
    border-radius: var(--radius-sm);
  }
  .jobs-toggle:hover {
    color: var(--text);
  }
  .jobs-toggle :global(.chev) {
    margin-left: auto;
  }
  .count {
    padding: 0 7px;
    border-radius: 99px;
    background: var(--accent-soft);
    color: var(--text);
    font-size: var(--fs-xs);
  }
  .job-list {
    display: grid;
    gap: 6px;
    max-height: 220px;
    overflow-y: auto;
  }
</style>
