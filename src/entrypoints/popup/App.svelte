<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { browser } from 'wxt/browser';
  import { call } from '../../lib/messages';
  import type { PageRef } from '../../lib/pawchive/types';
  import { parsePageUrl, SITE_ORIGIN } from '../../lib/pawchive/urls';
  import { watchKey } from '../../lib/watch';
  import { app, overallProgress, t, themeDocument, fmt } from '../../ui/state/app.svelte';
  import { toast } from '../../ui/state/toasts.svelte';
  import Button from '../../ui/components/Button.svelte';
  import Empty from '../../ui/components/Empty.svelte';
  import Icon from '../../ui/components/Icon.svelte';
  import IconButton from '../../ui/components/IconButton.svelte';
  import JobCard from '../../ui/components/JobCard.svelte';
  import Logo from '../../ui/components/Logo.svelte';
  import Toaster from '../../ui/components/Toaster.svelte';

  themeDocument();

  let tab = $state<{ id?: number; url: string; title: string } | null>(null);
  let ref = $state<PageRef>({ kind: 'other' });
  let onSite = $state(false);
  let watching = $state(false);
  let busy = $state<string | null>(null);

  const version = browser.runtime.getManifest().version;
  const jobs = $derived(
    [...app.jobs]
      .sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || b.createdAt - a.createdAt)
      .slice(0, 4),
  );
  const totals = $derived(overallProgress(app.jobs));

  function isLive(job: { status: string }) {
    return (
      job.status === 'running' ||
      job.status === 'queued' ||
      job.status === 'resolving' ||
      job.status === 'paused'
    );
  }

  onMount(async () => {
    const [active] = await browser.tabs.query({ active: true, currentWindow: true });
    tab = { id: active?.id, url: active?.url ?? '', title: active?.title ?? '' };
    ref = parsePageUrl(tab.url);
    onSite = tab.url.startsWith(SITE_ORIGIN);
    if (ref.kind === 'creator' || ref.kind === 'post') {
      const key = watchKey(ref.service, ref.creatorId);
      watching = (await call('watch:list').catch(() => [])).some((e) => e.key === key);
    }
  });

  async function run(id: string, action: () => Promise<unknown>, message?: string) {
    busy = id;
    try {
      await action();
      if (message) toast(message, 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      busy = null;
    }
  }

  async function openPanel() {
    if (tab?.id === undefined) return;
    await browser.tabs.sendMessage(tab.id, { type: 'panel:open' }).catch(() => undefined);
    window.close();
  }

  function cleanTitle(title: string) {
    return title.replace(/\s*\|\s*Pawchive\s*$/i, '');
  }

  function dashboard(target = 'downloads') {
    void call('app:open-dashboard', { tab: target });
    window.close();
  }
</script>

<div class="popup">
  <header>
    <Logo size={30} />
    <div class="brand">
      <strong>{t('app.name')}</strong>
      <span class="faint mono-num">v{version}</span>
    </div>
    <IconButton
      icon="queue"
      label={t('nav.downloads')}
      tipSide="bottom"
      onclick={() => dashboard('downloads')}
    />
    <IconButton
      icon="settings"
      label={t('nav.settings')}
      tipSide="left"
      onclick={() => dashboard('settings')}
    />
  </header>

  <section class="context">
    {#if !tab}
      <div class="ctx-skeleton"></div>
    {:else if !onSite}
      <Empty compact icon="web" title={t('popup.offSite')} body={t('popup.offSiteBody')}>
        <Button
          variant="primary"
          icon="external"
          onclick={() => browser.tabs.create({ url: `${SITE_ORIGIN}/posts` })}
          >{t('popup.openSite')}</Button
        >
      </Empty>
    {:else}
      <div class="ctx" in:fade={{ duration: 160 }}>
        <div class="ctx-head">
          <span class="ctx-icon"
            ><Icon
              name={ref.kind === 'post' ? 'file' : ref.kind === 'creator' ? 'account' : 'web'}
            /></span
          >
          <div class="ctx-text">
            <span class="eyebrow">{t(`popup.kind.${ref.kind}`)}</span>
            <span class="ctx-title truncate" title={tab.title}>{cleanTitle(tab.title)}</span>
          </div>
        </div>
        <div class="ctx-actions">
          {#if ref.kind === 'post'}
            {@const r = ref}
            <Button
              variant="primary"
              icon="download"
              block
              loading={busy === 'post'}
              onclick={() =>
                run(
                  'post',
                  () =>
                    call('jobs:create', {
                      request: {
                        kind: 'refs',
                        refs: [{ service: r.service, creatorId: r.creatorId, postId: r.postId }],
                      },
                    }),
                  t('toast.queuedPost'),
                )}
            >
              {t('popup.downloadPost')}
            </Button>
          {:else if ref.kind === 'creator'}
            {@const r = ref}
            <Button
              variant="primary"
              icon="downloadMultiple"
              block
              loading={busy === 'creator'}
              onclick={() =>
                run(
                  'creator',
                  () =>
                    call('jobs:create', {
                      request: { kind: 'creator', service: r.service, creatorId: r.creatorId },
                    }),
                  t('toast.queuedCreator', { name: cleanTitle(tab?.title ?? '') }),
                )}
            >
              {t('popup.downloadCreator')}
            </Button>
          {/if}
          <div class="row">
            <Button icon="dock" block onclick={openPanel}>{t('popup.openPanel')}</Button>
            {#if ref.kind === 'creator' || ref.kind === 'post'}
              {@const r = ref}
              <Button
                icon={watching ? 'bellRing' : 'bell'}
                variant={watching ? 'subtle' : 'secondary'}
                block
                loading={busy === 'watch'}
                onclick={() =>
                  run('watch', async () => {
                    if (watching)
                      await call('watch:remove', { key: watchKey(r.service, r.creatorId) });
                    else
                      await call('watch:add', {
                        service: r.service,
                        creatorId: r.creatorId,
                        name:
                          ref.kind === 'creator'
                            ? cleanTitle(tab?.title ?? '')
                                .replace(/^Posts of\s+/i, '')
                                .replace(/\s+from\s+\w+$/i, '')
                            : r.creatorId,
                      });
                    watching = !watching;
                  })}
              >
                {watching ? t('creator.watching') : t('creator.watch')}
              </Button>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </section>

  {#if app.watchNew > 0}
    <button type="button" class="news" onclick={() => dashboard('watchlist')} in:fade>
      <Icon name="bellRing" />
      <span>{t('popup.newPosts', { count: app.watchNew })}</span>
      <Icon name="chevronRight" class="chev" />
    </button>
  {/if}

  <section class="jobs">
    <div class="jobs-head">
      <h2>{t('nav.downloads')}</h2>
      {#if totals.active > 0}
        <span class="mono-num muted"
          >{t('popup.active', { count: totals.active })}{#if totals.speed > 0}
            / {fmt.bytes(totals.speed)}/s{/if}</span
        >
      {/if}
    </div>
    {#if jobs.length === 0}
      <p class="empty muted">{t('popup.noJobs')}</p>
    {:else}
      <div class="job-list">
        {#each jobs as job (job.id)}
          <JobCard {job} compact />
        {/each}
      </div>
    {/if}
  </section>

  <footer>
    <Button variant="ghost" size="sm" icon="history" onclick={() => dashboard('history')}
      >{t('nav.history')}</Button
    >
    <Button variant="ghost" size="sm" icon="eye" onclick={() => dashboard('watchlist')}
      >{t('nav.watchlist')}</Button
    >
    <Button
      variant="ghost"
      size="sm"
      icon="folderOpen"
      onclick={() => call('app:open-downloads-folder')}>{t('popup.folder')}</Button
    >
  </footer>
</div>
<Toaster position="top" />

<style>
  .popup {
    width: 380px;
    max-height: 600px;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 12px 12px 14px;
    background: linear-gradient(180deg, var(--accent-softer), transparent);
    border-bottom: 1px solid var(--border);
  }
  .brand {
    flex: 1;
    display: grid;
    line-height: 1.25;
    min-width: 0;
  }
  .brand strong {
    font-size: var(--fs-md);
  }
  .brand span {
    font-size: var(--fs-xs);
  }
  .context {
    padding: 12px;
  }
  .ctx-skeleton {
    height: 132px;
    border-radius: var(--radius-lg);
    background: var(--bg-elev);
    animation: pdl-pulse 1.4s var(--ease) infinite;
  }
  .ctx {
    display: grid;
    gap: 12px;
    padding: 14px;
    border-radius: var(--radius-lg);
    background: var(--bg-elev);
    border: 1px solid var(--border);
  }
  .ctx-head {
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
  }
  .ctx-icon {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: var(--accent-soft);
    color: var(--accent-strong);
    flex: none;
  }
  .ctx-text {
    display: grid;
    min-width: 0;
  }
  .eyebrow {
    font-size: var(--fs-xs);
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
  }
  .ctx-title {
    font-weight: 700;
  }
  .ctx-actions {
    display: grid;
    gap: 8px;
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .news {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 12px 12px;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
    background: color-mix(in srgb, var(--success) 10%, transparent);
    color: var(--text);
    font-weight: 600;
    text-align: left;
    transition: background-color var(--dur-fast) var(--ease);
  }
  .news:hover {
    background: color-mix(in srgb, var(--success) 16%, transparent);
  }
  .news :global(.icon:first-child) {
    color: var(--success);
  }
  .news span {
    flex: 1;
  }
  .jobs {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 0 12px 8px;
  }
  .jobs-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 4px 2px 8px;
    font-size: var(--fs-xs);
  }
  h2 {
    font-size: var(--fs-sm);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-dim);
  }
  .job-list {
    display: grid;
    gap: 6px;
    overflow-y: auto;
    max-height: 260px;
  }
  .empty {
    padding: 18px 4px;
    font-size: var(--fs-sm);
    text-align: center;
    border: 1px dashed var(--border);
    border-radius: var(--radius-md);
  }
  footer {
    display: flex;
    justify-content: space-around;
    padding: 8px;
    border-top: 1px solid var(--border);
    background: var(--bg-elev);
  }
</style>
