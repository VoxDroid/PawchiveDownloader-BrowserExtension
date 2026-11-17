<script lang="ts">
  import type { IconName } from '../icons.generated';
  import Icon from './Icon.svelte';

  interface Props {
    value?: string;
    placeholder?: string;
    label: string;
    icon?: IconName;
    type?: 'text' | 'search' | 'date' | 'url' | 'number';
    invalid?: boolean;
    mono?: boolean;
    clearable?: boolean;
    min?: string;
    max?: string;
    oninput?: (value: string) => void;
    onchange?: (value: string) => void;
    onkeydown?: (event: KeyboardEvent) => void;
  }

  let {
    value = $bindable(''),
    placeholder,
    label,
    icon,
    type = 'text',
    invalid = false,
    mono = false,
    clearable = false,
    min,
    max,
    oninput,
    onchange,
    onkeydown,
  }: Props = $props();
</script>

<label class="field" class:invalid class:mono class:has-icon={!!icon}>
  {#if icon}<Icon name={icon} class="lead" />{/if}
  <input
    {type}
    {placeholder}
    {min}
    {max}
    aria-label={label}
    aria-invalid={invalid}
    spellcheck="false"
    autocomplete="off"
    bind:value
    oninput={() => oninput?.(value)}
    onchange={() => onchange?.(value)}
    {onkeydown}
  />
  {#if clearable && value}
    <button
      type="button"
      class="clear"
      aria-label="Clear"
      onclick={() => {
        value = '';
        oninput?.('');
        onchange?.('');
      }}><Icon name="close" /></button
    >
  {/if}
</label>

<style>
  .field {
    position: relative;
    display: flex;
    align-items: center;
    height: 34px;
    border-radius: var(--radius-md);
    background: var(--bg-elev-2);
    border: 1px solid var(--border);
    transition:
      border-color var(--dur-fast) var(--ease),
      box-shadow var(--dur-fast) var(--ease),
      background-color var(--dur-fast) var(--ease);
    min-width: 0;
  }
  .field:hover {
    border-color: var(--border-strong);
  }
  .field:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-softer);
    background: var(--bg-elev);
  }
  .invalid,
  .invalid:focus-within {
    border-color: var(--danger);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 14%, transparent);
  }
  .field :global(.lead) {
    position: absolute;
    left: 10px;
    color: var(--text-faint);
    pointer-events: none;
  }
  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: none;
    background: transparent;
    padding: 0 12px;
    font-size: var(--fs-md);
    color: var(--text);
  }
  input::placeholder {
    color: var(--text-faint);
  }
  input::-webkit-search-cancel-button {
    display: none;
  }
  input[type='date']::-webkit-calendar-picker-indicator {
    filter: invert(0.6);
    cursor: pointer;
  }
  .has-icon input {
    padding-left: 34px;
  }
  .mono input {
    font-variant-ligatures: none;
    letter-spacing: 0;
  }
  .clear {
    border: 0;
    background: transparent;
    color: var(--text-faint);
    display: inline-flex;
    padding: 4px;
    margin-right: 4px;
    border-radius: var(--radius-sm);
  }
  .clear:hover {
    color: var(--text);
    background: var(--bg-hover);
  }
</style>
