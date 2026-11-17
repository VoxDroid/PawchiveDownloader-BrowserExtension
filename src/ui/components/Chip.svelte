<script lang="ts">
  import type { IconName } from '../icons.generated';
  import Icon from './Icon.svelte';

  interface Props {
    label: string;
    count?: number;
    icon?: IconName;
    active?: boolean;
    disabled?: boolean;
    onclick?: () => void;
  }

  let { label, count, icon, active = false, disabled = false, onclick }: Props = $props();
</script>

<button type="button" class="chip" class:active {disabled} aria-pressed={active} {onclick}>
  {#if icon}<Icon name={icon} />{/if}
  <span>{label}</span>
  {#if count !== undefined}<span class="count mono-num">{count}</span>{/if}
</button>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border-radius: 99px;
    border: 1px solid var(--border);
    background: var(--bg-elev-2);
    color: var(--text-dim);
    font-size: var(--fs-sm);
    font-weight: 600;
    white-space: nowrap;
    transition:
      background-color var(--dur-fast) var(--ease),
      border-color var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease),
      transform var(--dur-fast) var(--ease);
  }
  .chip:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--border-strong);
  }
  .chip:active:not(:disabled) {
    transform: scale(0.96);
  }
  .chip:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .active {
    background: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
    color: var(--text);
  }
  .count {
    padding: 0 6px;
    border-radius: 99px;
    background: var(--bg-elev-3);
    color: var(--text-dim);
    font-size: var(--fs-xs);
    line-height: 18px;
  }
  .active .count {
    background: color-mix(in srgb, var(--accent) 30%, transparent);
    color: var(--text);
  }
</style>
