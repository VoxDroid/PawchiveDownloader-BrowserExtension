<script lang="ts">
  import { t } from '../../../ui/state/app.svelte';
  import { toast } from '../../../ui/state/toasts.svelte';
  import Button from '../../../ui/components/Button.svelte';
  import Icon from '../../../ui/components/Icon.svelte';
  import IconButton from '../../../ui/components/IconButton.svelte';

  let { links, passwords }: { links: readonly string[]; passwords: readonly string[] } = $props();

  function hostOf(link: string): string {
    try {
      return new URL(link).hostname.replace(/^www\./, '');
    } catch {
      return link;
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast(t('common.copied'), 'success');
  }

  const everything = $derived(
    [...links, ...passwords.map((p) => `${t('post.password')}: ${p}`)].join('\n'),
  );
</script>

<div class="links-view">
  <p class="hint"><Icon name="info" /><span>{t('post.linksHint')}</span></p>
  <div class="tools">
    <Button size="sm" variant="ghost" icon="copy" onclick={() => copy(everything)}
      >{t('post.copyAll')}</Button
    >
  </div>
  <ul class="list">
    {#each links as link (link)}
      <li class="row">
        <Icon name="link" />
        <span class="text">
          <span class="host">{hostOf(link)}</span>
          <span class="url truncate" title={link}>{link}</span>
        </span>
        <IconButton size="sm" icon="copy" label={t('common.copy')} onclick={() => copy(link)} />
        <IconButton
          size="sm"
          icon="external"
          label={hostOf(link)}
          tipSide="left"
          onclick={() => window.open(link, '_blank', 'noopener,noreferrer')}
        />
      </li>
    {/each}
    {#each passwords as password (password)}
      <li class="row">
        <Icon name="shield" />
        <span class="text">
          <span class="host">{t('post.password')}</span>
          <code class="url truncate">{password}</code>
        </span>
        <IconButton
          size="sm"
          icon="copy"
          label={t('common.copy')}
          tipSide="left"
          onclick={() => copy(password)}
        />
      </li>
    {/each}
  </ul>
</div>

<style>
  .links-view {
    display: grid;
    gap: 10px;
  }
  .hint {
    display: flex;
    gap: 8px;
    margin: 0;
    color: var(--text-dim);
    font-size: var(--fs-sm);
    line-height: 1.45;
  }
  .tools {
    display: flex;
    justify-content: flex-end;
  }
  .list {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 10px);
    background: var(--bg-elev);
  }
  .row > :global(.icon) {
    color: var(--accent);
    flex: none;
  }
  .text {
    display: grid;
    min-width: 0;
    flex: 1;
  }
  .host {
    font-size: var(--fs-sm);
    color: var(--text-dim);
  }
  .url {
    font-size: var(--fs-sm);
  }
</style>
