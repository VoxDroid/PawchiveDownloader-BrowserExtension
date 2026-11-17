<script lang="ts">
  let { size = 16 }: { size?: number } = $props();
</script>

<span class="spinner" style="--size:{size}px" aria-hidden="true"></span>

<style>
  .spinner {
    display: inline-block;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, currentColor 22%, transparent);
    border-top-color: currentColor;
    animation: pdl-spin 0.75s linear infinite;
    flex: none;
  }
</style>
