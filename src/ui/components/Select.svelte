<script lang="ts" generics="T extends string | number">
  import Icon from './Icon.svelte';

  interface Props {
    value: T;
    options: Array<{ value: T; label: string }>;
    label: string;
    onchange?: (value: T) => void;
  }

  let { value = $bindable(), options, label, onchange }: Props = $props();
</script>

<span class="select">
  <select
    aria-label={label}
    value={String(value)}
    onchange={(e) => {
      const raw = (e.currentTarget as HTMLSelectElement).value;
      const match = options.find((o) => String(o.value) === raw);
      if (!match) return;
      value = match.value;
      onchange?.(match.value);
    }}
  >
    {#each options as option (option.value)}
      <option value={String(option.value)}>{option.label}</option>
    {/each}
  </select>
  <Icon name="chevronDown" class="chevron" />
</span>

<style>
  .select {
    position: relative;
    display: inline-flex;
    min-width: 0;
  }
  select {
    appearance: none;
    height: 34px;
    min-width: 180px;
    max-width: 100%;
    padding: 0 34px 0 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg-elev-2);
    color: var(--text);
    font-size: var(--fs-md);
    cursor: pointer;
    transition:
      border-color var(--dur-fast) var(--ease),
      box-shadow var(--dur-fast) var(--ease);
  }
  select:hover {
    border-color: var(--border-strong);
  }
  select:focus-visible {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-softer);
  }
  option {
    background: var(--bg-elev);
    color: var(--text);
  }
  .select :global(.chevron) {
    position: absolute;
    right: 9px;
    top: 50%;
    translate: 0 -50%;
    pointer-events: none;
    color: var(--text-faint);
  }
</style>
