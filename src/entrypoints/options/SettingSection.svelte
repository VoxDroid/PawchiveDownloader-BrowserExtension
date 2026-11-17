<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { IconName } from '../../ui/icons.generated';
  import Icon from '../../ui/components/Icon.svelte';

  let {
    id,
    icon,
    title,
    description,
    children,
  }: { id: string; icon: IconName; title: string; description?: string; children: Snippet } =
    $props();
</script>

<section {id}>
  <header>
    <span class="icon-box"><Icon name={icon} /></span>
    <div>
      <h2>{title}</h2>
      {#if description}<p>{description}</p>{/if}
    </div>
  </header>
  <div class="card">{@render children()}</div>
</section>

<style>
  section {
    scroll-margin-top: 24px;
    margin-bottom: 28px;
  }
  header {
    display: flex;
    gap: 12px;
    align-items: center;
    margin: 0 4px 12px;
  }
  .icon-box {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 9px;
    background: var(--accent-softer);
    color: var(--accent-strong);
    flex: none;
  }
  h2 {
    font-size: var(--fs-lg);
    font-weight: 700;
  }
  p {
    font-size: var(--fs-sm);
    color: var(--text-dim);
  }
  .card {
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    background: var(--bg-elev);
    overflow: hidden;
  }
</style>
