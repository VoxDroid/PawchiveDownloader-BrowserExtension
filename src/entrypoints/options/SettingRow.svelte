<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    description,
    children,
    stacked = false,
  }: { label: string; description?: string; children: Snippet; stacked?: boolean } = $props();
</script>

<div class="row" class:stacked>
  <div class="text">
    <span class="label">{label}</span>
    {#if description}<span class="description">{description}</span>{/if}
  </div>
  <div class="control">{@render children()}</div>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px 24px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
  }
  .row:last-child {
    border-bottom: 0;
  }
  .stacked {
    flex-direction: column;
    align-items: stretch;
  }
  .text {
    display: grid;
    gap: 3px;
    min-width: 0;
    flex: 1;
  }
  .label {
    font-weight: 600;
  }
  .description {
    font-size: var(--fs-sm);
    color: var(--text-dim);
    max-width: 560px;
  }
  .control {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }
  .stacked .control {
    display: grid;
    gap: 10px;
  }
</style>
