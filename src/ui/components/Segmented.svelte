<script lang="ts" generics="T extends string">
  import type { IconName } from '../icons.generated';
  import Icon from './Icon.svelte';

  interface Option {
    value: T;
    label: string;
    icon?: IconName;
  }

  interface Props {
    options: Option[];
    value: T;
    label: string;
    size?: 'sm' | 'md';
    onchange?: (value: T) => void;
  }

  let { options, value = $bindable(), label, size = 'md', onchange }: Props = $props();

  const index = $derived(
    Math.max(
      0,
      options.findIndex((o) => o.value === value),
    ),
  );

  function select(next: T) {
    if (next === value) return;
    value = next;
    onchange?.(next);
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = options[(index + step + options.length) % options.length];
    if (next) select(next.value);
  }
</script>

<div
  class="segmented {size}"
  role="radiogroup"
  aria-label={label}
  style="--count:{options.length};--index:{index}"
  tabindex="0"
  {onkeydown}
>
  <span class="indicator" aria-hidden="true"></span>
  {#each options as option (option.value)}
    <button
      type="button"
      role="radio"
      tabindex="-1"
      aria-checked={option.value === value}
      class:selected={option.value === value}
      onclick={() => select(option.value)}
    >
      {#if option.icon}<Icon name={option.icon} />{/if}
      <span class="truncate">{option.label}</span>
    </button>
  {/each}
</div>

<style>
  .segmented {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--count), minmax(0, 1fr));
    padding: 3px;
    border-radius: var(--radius-md);
    background: var(--bg-elev-2);
    border: 1px solid var(--border);
    isolation: isolate;
  }
  .indicator {
    position: absolute;
    z-index: -1;
    top: 3px;
    bottom: 3px;
    left: 3px;
    width: calc((100% - 6px) / var(--count));
    border-radius: calc(var(--radius-md) - 3px);
    background: var(--bg-elev-3);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-sm);
    transform: translateX(calc(100% * var(--index)));
    transition: transform var(--dur-slow) var(--ease-out);
  }
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border: 0;
    background: transparent;
    color: var(--text-dim);
    font-weight: 600;
    font-size: var(--fs-sm);
    border-radius: calc(var(--radius-md) - 3px);
    transition: color var(--dur) var(--ease);
    min-width: 0;
  }
  .sm button {
    height: 24px;
    font-size: var(--fs-xs);
  }
  button:hover,
  button.selected {
    color: var(--text);
  }
</style>
