<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { IconName } from '../icons.generated';
  import Icon from './Icon.svelte';
  import Spinner from './Spinner.svelte';

  interface Props {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
    size?: 'sm' | 'md' | 'lg';
    icon?: IconName;
    iconRight?: IconName;
    loading?: boolean;
    disabled?: boolean;
    block?: boolean;
    type?: 'button' | 'submit';
    title?: string;
    onclick?: (event: MouseEvent) => void;
    children?: Snippet;
  }

  let {
    variant = 'secondary',
    size = 'md',
    icon,
    iconRight,
    loading = false,
    disabled = false,
    block = false,
    type = 'button',
    title,
    onclick,
    children,
  }: Props = $props();
</script>

<button
  {type}
  class="btn {variant} {size}"
  class:block
  class:loading
  disabled={disabled || loading}
  aria-busy={loading}
  data-tip={title}
  {onclick}
>
  {#if loading}
    <Spinner size={size === 'sm' ? 12 : 14} />
  {:else if icon}
    <Icon name={icon} />
  {/if}
  {#if children}<span class="label">{@render children()}</span>{/if}
  {#if iconRight}<Icon name={iconRight} />{/if}
</button>

<style>
  .btn {
    --h: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: var(--h);
    padding: 0 14px;
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    font-size: var(--fs-md);
    font-weight: 600;
    letter-spacing: 0.01em;
    white-space: nowrap;
    user-select: none;
    transition:
      background-color var(--dur-fast) var(--ease),
      border-color var(--dur-fast) var(--ease),
      color var(--dur-fast) var(--ease),
      box-shadow var(--dur-fast) var(--ease),
      transform var(--dur-fast) var(--ease),
      opacity var(--dur-fast) var(--ease);
  }
  .btn:active:not(:disabled) {
    transform: scale(0.97);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn.loading {
    opacity: 0.85;
    cursor: progress;
  }
  .sm {
    --h: 28px;
    padding: 0 10px;
    font-size: var(--fs-sm);
    gap: 6px;
    border-radius: var(--radius-sm);
  }
  .lg {
    --h: 42px;
    padding: 0 18px;
    font-size: var(--fs-lg);
  }
  .block {
    width: 100%;
  }
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .primary {
    background: var(--accent);
    color: var(--accent-contrast);
    box-shadow:
      0 1px 0 rgb(255 255 255 / 0.18) inset,
      0 6px 18px -8px var(--accent);
  }
  .primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 88%, white);
    box-shadow:
      0 1px 0 rgb(255 255 255 / 0.18) inset,
      0 10px 24px -10px var(--accent);
  }
  .secondary {
    background: var(--bg-elev-2);
    border-color: var(--border);
    color: var(--text);
  }
  .secondary:hover:not(:disabled) {
    background: var(--bg-elev-3);
    border-color: var(--border-strong);
  }
  .subtle {
    background: var(--accent-softer);
    color: var(--accent-strong);
  }
  .subtle:hover:not(:disabled) {
    background: var(--accent-soft);
  }
  .ghost {
    background: transparent;
    color: var(--text-dim);
  }
  .ghost:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text);
  }
  .danger {
    background: color-mix(in srgb, var(--danger) 14%, transparent);
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 28%, transparent);
  }
  .danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--danger) 22%, transparent);
  }
</style>
