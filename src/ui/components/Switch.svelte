<script lang="ts">
  interface Props {
    checked?: boolean;
    disabled?: boolean;
    label: string;
    onchange?: (checked: boolean) => void;
  }

  let { checked = $bindable(false), disabled = false, label, onchange }: Props = $props();
</script>

<button
  type="button"
  role="switch"
  class="switch"
  class:on={checked}
  aria-checked={checked}
  aria-label={label}
  {disabled}
  onclick={() => {
    checked = !checked;
    onchange?.(checked);
  }}
>
  <span class="thumb"></span>
</button>

<style>
  .switch {
    position: relative;
    width: 38px;
    height: 22px;
    flex: none;
    border-radius: 99px;
    border: 1px solid var(--border-strong);
    background: var(--bg-elev-3);
    padding: 0;
    transition:
      background-color var(--dur) var(--ease),
      border-color var(--dur) var(--ease);
  }
  .switch:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 99px;
    background: var(--text-dim);
    box-shadow: var(--shadow-sm);
    transition:
      transform var(--dur) var(--ease-spring),
      background-color var(--dur) var(--ease),
      width var(--dur-fast) var(--ease);
  }
  .switch:active:not(:disabled) .thumb {
    width: 20px;
  }
  .on {
    background: var(--accent);
    border-color: var(--accent);
  }
  .on .thumb {
    background: #fff;
    transform: translateX(16px);
  }
  .on:active:not(:disabled) .thumb {
    transform: translateX(12px);
  }
</style>
