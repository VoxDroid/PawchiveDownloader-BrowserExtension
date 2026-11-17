<script lang="ts">
  import { browser } from 'wxt/browser';

  let { size = 28 }: { size?: number } = $props();

  // The hand-drawn icon. Loaded through the extension URL so it also works
  // inside the panel on Pawchive pages (icons are web accessible).
  // Small logos use the bolder small-size drawing on standard screens.
  const big = browser.runtime.getURL('/icon/128.png');
  const bold = browser.runtime.getURL('/icon/48.png');
  const src = $derived(size <= 40 ? bold : big);
  const srcset = $derived(size <= 40 ? `${bold} 1x, ${big} 2x` : undefined);
</script>

<img class="logo" {src} {srcset} width={size} height={size} alt="" draggable="false" />

<style>
  .logo {
    flex: none;
    display: block;
    object-fit: contain;
    user-select: none;
    filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.18));
  }
</style>
