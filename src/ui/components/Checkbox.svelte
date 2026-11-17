<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    checked?: boolean;
    indeterminate?: boolean;
    disabled?: boolean;
    label?: string;
    onchange?: (checked: boolean, event: MouseEvent | KeyboardEvent) => void;
    children?: Snippet;
  }

  let {
    checked = $bindable(false),
    indeterminate = false,
    disabled = false,
    label,
    onchange,
    children,
  }: Props = $props();

  function toggle(event: MouseEvent | KeyboardEvent) {
    if (disabled) return;
    checked = !checked;
    onchange?.(checked, event);
  }
</script>

<span
  class="checkbox"
  class:checked
  class:indeterminate={indeterminate && !checked}
  class:disabled
  role="checkbox"
  tabindex={disabled ? -1 : 0}
  aria-checked={indeterminate && !checked ? 'mixed' : checked}
  aria-disabled={disabled}
  aria-label={label}
  onclick={(e) => {
    e.stopPropagation();
    toggle(e);
  }}
  onkeydown={(e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggle(e);
    }
  }}
>
  <span class="box">
    <svg viewBox="0 0 16 16" aria-hidden="true">
      {#if indeterminate && !checked}
        <path d="M4 8h8" />
      {:else}
        <path d="M3.5 8.5l3 3 6-7" />
      {/if}
    </svg>
  </span>
  {#if children}<span class="text">{@render children()}</span>{/if}
</span>

<style>
  .checkbox {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    cursor: pointer;
    user-select: none;
    border-radius: var(--radius-xs);
    color: var(--text);
    font-size: var(--fs-md);
  }
  .disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .box {
    width: 17px;
    height: 17px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 5px;
    border: 1.5px solid var(--border-strong);
    background: var(--bg-elev);
    transition:
      background-color var(--dur-fast) var(--ease),
      border-color var(--dur-fast) var(--ease),
      transform var(--dur-fast) var(--ease-spring);
  }
  .checkbox:hover:not(.disabled) .box {
    border-color: var(--accent);
  }
  .checkbox:active:not(.disabled) .box {
    transform: scale(0.88);
  }
  .checked .box,
  .indeterminate .box {
    background: var(--accent);
    border-color: var(--accent);
  }
  svg {
    width: 12px;
    height: 12px;
    fill: none;
    stroke: var(--accent-contrast);
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 16;
    stroke-dashoffset: 16;
    transition: stroke-dashoffset var(--dur) var(--ease-out);
  }
  .checked svg,
  .indeterminate svg {
    stroke-dashoffset: 0;
  }
  .text {
    min-width: 0;
  }
</style>
