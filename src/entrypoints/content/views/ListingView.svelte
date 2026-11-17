<script lang="ts">
  import { t } from '../../../ui/state/app.svelte';
  import Icon from '../../../ui/components/Icon.svelte';
  import type { CardController } from '../cards';
  import SelectionBar from './SelectionBar.svelte';

  let { cards }: { cards: CardController | null } = $props();
</script>

<div class="view">
  <SelectionBar {cards} prominent />
  <ul class="tips">
    <li><Icon name="cursor" /><span>{t('listing.tipClick')}</span></li>
    <li><Icon name="keyboard" /><span>{t('listing.tipShift')}</span></li>
    <li><Icon name="link" /><span>{t('listing.tipContext')}</span></li>
  </ul>
</div>

<style>
  .view {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
  }
  .tips {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 10px;
    color: var(--text-dim);
    font-size: var(--fs-sm);
  }
  li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  li :global(.icon) {
    color: var(--text-faint);
    margin-top: 1px;
  }
</style>
