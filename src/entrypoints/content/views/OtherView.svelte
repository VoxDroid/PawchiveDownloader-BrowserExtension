<script lang="ts">
  import { t } from '../../../ui/state/app.svelte';
  import Button from '../../../ui/components/Button.svelte';
  import Empty from '../../../ui/components/Empty.svelte';
  import type { CardController } from '../cards';
  import { page } from '../page.svelte';
  import { siteFromHost } from '../../../lib/pawchive/sites';
  import { pageUrls } from '../../../lib/pawchive/urls';
  import SelectionBar from './SelectionBar.svelte';

  let { cards }: { cards: CardController | null } = $props();
  const site = siteFromHost(location.hostname) ?? 'pawchive';
</script>

<div class="view">
  {#if page.cards.length > 0}
    <SelectionBar {cards} prominent />
  {/if}
  <Empty icon="paw" title={t('other.title')} body={t('other.body')}>
    <Button icon="search" onclick={() => (location.href = pageUrls.recent(site))}
      >{t('other.browse')}</Button
    >
    <Button variant="ghost" icon="account" onclick={() => (location.href = pageUrls.creators(site))}
      >{t('other.creators')}</Button
    >
  </Empty>
</div>

<style>
  .view {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
  }
</style>
