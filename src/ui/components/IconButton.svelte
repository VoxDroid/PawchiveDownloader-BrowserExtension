<script lang="ts">
  import type { IconName } from '../icons.generated';
  import Icon from './Icon.svelte';

  interface Props {
    icon: IconName;
    label: string;
    size?: 'sm' | 'md';
    active?: boolean;
    disabled?: boolean;
    tipSide?: 'top' | 'bottom' | 'left';
    variant?: 'ghost' | 'solid';
    onclick?: (event: MouseEvent) => void;
  }

  let {
    icon,
    label,
    size = 'md',
    active = false,
    disabled = false,
    tipSide = 'top',
    variant = 'ghost',
    onclick,
  }: Props = $props();
</script>

<button
  type="button"
  class="icon-btn {size} {variant}"
  class:active
  {disabled}
  aria-label={label}
  aria-pressed={active || undefined}
  data-tip={label}
  data-tip-side={tipSide === 'top' ? undefined : tipSide}
  {onclick}
>
  <Icon name={icon} />
</button>

<style>
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-dim);
    transition:
      background-color var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease),
      transform var(--dur-fast) var(--ease);
    flex: none;
  }
  .sm {
    width: 26px;
    height: 26px;
    font-size: var(--fs-sm);
  }
  .solid {
    background: var(--bg-elev-2);
    border-color: var(--border);
  }
  .icon-btn:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text);
  }
  .icon-btn:active:not(:disabled) {
    transform: scale(0.92);
  }
  .icon-btn.active {
    color: var(--accent-strong);
    background: var(--accent-softer);
  }
  .icon-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
