<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { browser } from 'wxt/browser';
  import { app, overallProgress, t, themeDocument } from '../../ui/state/app.svelte';
  import type { IconName } from '../../ui/icons.generated';
  import Icon from '../../ui/components/Icon.svelte';
  import Logo from '../../ui/components/Logo.svelte';
  import Toaster from '../../ui/components/Toaster.svelte';
  import DownloadsPage from './pages/DownloadsPage.svelte';
  import HistoryPage from './pages/HistoryPage.svelte';
  import WatchlistPage from './pages/WatchlistPage.svelte';
  import LogsPage from './pages/LogsPage.svelte';
  import SettingsPage from './pages/SettingsPage.svelte';
  import AboutPage from './pages/AboutPage.svelte';

  themeDocument();

  type Route = 'downloads' | 'history' | 'watchlist' | 'logs' | 'settings' | 'about';
  const ROUTES: Array<{ id: Route; icon: IconName }> = [
    { id: 'downloads', icon: 'queue' },
    { id: 'history', icon: 'history' },
    { id: 'watchlist', icon: 'eye' },
    { id: 'logs', icon: 'logs' },
    { id: 'settings', icon: 'settings' },
    { id: 'about', icon: 'info' },
  ];

  function fromHash(): Route {
    const id = location.hash.replace('#', '') as Route;
    return ROUTES.some((r) => r.id === id) ? id : 'downloads';
  }

  let route = $state<Route>(fromHash());
  const progress = $derived(overallProgress(app.jobs));
  const version = browser.runtime.getManifest().version;

  onMount(() => {
    const onHash = () => (route = fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  });

  $effect(() => {
    document.title = `${t(`nav.${route}`)} - ${t('app.name')}`;
  });

  function go(id: Route) {
    if (location.hash !== `#${id}`) history.pushState(null, '', `#${id}`);
    route = id;
  }
</script>

<div class="layout">
  <nav aria-label={t('app.name')}>
    <div class="brand">
      <Logo size={34} />
      <div>
        <strong>{t('app.name')}</strong>
        <span class="faint mono-num">v{version}</span>
      </div>
    </div>
    <ul>
      {#each ROUTES as item (item.id)}
        <li>
          <a
            href="#{item.id}"
            class:active={route === item.id}
            aria-current={route === item.id ? 'page' : undefined}
            onclick={(e) => {
              e.preventDefault();
              go(item.id);
            }}
          >
            <Icon name={item.icon} />
            <span>{t(`nav.${item.id}`)}</span>
            {#if item.id === 'downloads' && progress.active > 0}
              <span class="badge mono-num">{progress.active}</span>
            {:else if item.id === 'watchlist' && app.watchNew > 0}
              <span class="badge ok mono-num">{app.watchNew}</span>
            {/if}
          </a>
        </li>
      {/each}
    </ul>
    <div class="nav-foot">
      {#if progress.active > 0}
        <div class="mini-progress" style="--p:{progress.ratio}">
          <span>{t('nav.activeJobs', { count: progress.active })}</span>
          <div class="bar"><div></div></div>
        </div>
      {/if}
      <span class="conn" class:off={!app.connected}>
        <span class="dot"></span>{app.connected ? t('nav.connected') : t('nav.reconnecting')}
      </span>
    </div>
  </nav>

  <main>
    {#key route}
      <div class="page" in:fly={{ y: 10, duration: 260, easing: cubicOut }}>
        {#if route === 'downloads'}
          <DownloadsPage />
        {:else if route === 'history'}
          <HistoryPage />
        {:else if route === 'watchlist'}
          <WatchlistPage />
        {:else if route === 'logs'}
          <LogsPage />
        {:else if route === 'settings'}
          <SettingsPage />
        {:else}
          <AboutPage />
        {/if}
      </div>
    {/key}
  </main>
</div>
<Toaster />

<style>
  .layout {
    display: grid;
    grid-template-columns: 248px minmax(0, 1fr);
    min-height: 100vh;
  }
  nav {
    position: sticky;
    top: 0;
    height: 100vh;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 20px 14px;
    border-right: 1px solid var(--border);
    background: var(--bg-elev);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 6px 6px;
  }
  .brand div {
    display: grid;
    line-height: 1.3;
  }
  .brand strong {
    font-size: var(--fs-md);
  }
  .brand span {
    font-size: var(--fs-xs);
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 2px;
  }
  a {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 12px;
    border-radius: var(--radius-md);
    color: var(--text-dim);
    font-weight: 600;
    text-decoration: none;
    position: relative;
    transition:
      background-color var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease);
  }
  a:hover {
    color: var(--text);
    background: var(--bg-hover);
    text-decoration: none;
  }
  a.active {
    color: var(--text);
    background: var(--accent-soft);
  }
  a.active::before {
    content: '';
    position: absolute;
    left: -14px;
    top: 8px;
    bottom: 8px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--accent);
  }
  a.active :global(.icon) {
    color: var(--accent-strong);
  }
  .badge {
    margin-left: auto;
    min-width: 22px;
    padding: 0 7px;
    border-radius: 99px;
    background: var(--accent);
    color: var(--accent-contrast);
    font-size: var(--fs-xs);
    line-height: 20px;
    text-align: center;
  }
  .badge.ok {
    background: var(--success);
    color: #062b1b;
  }
  .nav-foot {
    margin-top: auto;
    display: grid;
    gap: 12px;
    padding: 0 6px;
    font-size: var(--fs-xs);
    color: var(--text-faint);
  }
  .mini-progress {
    display: grid;
    gap: 6px;
    color: var(--text-dim);
  }
  .bar {
    height: 4px;
    border-radius: 99px;
    background: var(--bg-elev-3);
    overflow: hidden;
  }
  .bar div {
    height: 100%;
    width: 100%;
    background: var(--accent);
    transform-origin: left;
    transform: scaleX(var(--p));
    transition: transform 500ms var(--ease-out);
  }
  .conn {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--success);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 20%, transparent);
  }
  .off .dot {
    background: var(--warning);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--warning) 20%, transparent);
    animation: pdl-pulse 1.2s var(--ease) infinite;
  }
  main {
    min-width: 0;
    padding: 32px clamp(20px, 4vw, 56px) 64px;
  }
  .page {
    max-width: 1040px;
    margin: 0 auto;
  }
  @media (max-width: 760px) {
    .layout {
      grid-template-columns: 1fr;
    }
    nav {
      position: static;
      height: auto;
      border-right: 0;
      border-bottom: 1px solid var(--border);
    }
    ul {
      grid-auto-flow: column;
      overflow-x: auto;
    }
    .nav-foot {
      display: none;
    }
    a.active::before {
      display: none;
    }
  }
</style>
