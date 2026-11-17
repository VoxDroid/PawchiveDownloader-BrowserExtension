<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { IconName } from '../icons.generated';
  import Icon from './Icon.svelte';

  let {
    icon = 'paw',
    title,
    body,
    children,
    compact = false,
  }: {
    icon?: IconName;
    title: string;
    body?: string;
    children?: Snippet;
    compact?: boolean;
  } = $props();
</script>

<div class="empty" class:compact>
  <div class="badge"><Icon name={icon} size={compact ? 20 : 26} /></div>
  <h3>{title}</h3>
  {#if body}<p>{body}</p>{/if}
  {#if children}<div class="actions">{@render children()}</div>{/if}
</div>

<style>
  .empty {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 8px;
    padding: 48px 24px;
    animation: pdl-rise var(--dur-slow) var(--ease-out);
  }
  .compact {
    padding: 28px 16px;
  }
  .badge {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 18px;
    background: var(--accent-softer);
    border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
    color: var(--accent-strong);
    margin-bottom: 6px;
  }
  .compact .badge {
    width: 44px;
    height: 44px;
    border-radius: 14px;
  }
  h3 {
    font-size: var(--fs-lg);
    font-weight: 700;
  }
  p {
    color: var(--text-dim);
    max-width: 380px;
    font-size: var(--fs-md);
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
</style>
