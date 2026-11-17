<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, description, actions }: { title: string; description?: string; actions?: Snippet } =
    $props();
</script>

<header>
  <div class="text">
    <h1>{title}</h1>
    {#if description}<p>{description}</p>{/if}
  </div>
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>

<style>
  header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px 24px;
    flex-wrap: wrap;
    margin-bottom: 24px;
  }
  .text {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  h1 {
    font-size: var(--fs-2xl);
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  p {
    color: var(--text-dim);
    max-width: 640px;
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
</style>
