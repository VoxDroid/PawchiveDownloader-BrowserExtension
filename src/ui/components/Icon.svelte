<script lang="ts">
  /**
   * An icon from the Nerd Font, drawn as SVG from the font's own outline
   * (scripts/icon-paths.py). As font text the glyphs sat off center in badges:
   * they are wider than their cell, placed differently each and snapped to
   * pixel rows. Each outline is centered on its own ink instead, at the same
   * size the font drew it (one em).
   */
  import { ICON_PATHS } from '../icon-paths.generated';
  import type { IconName } from '../icons.generated';

  let {
    name,
    size,
    class: className = '',
    spin = false,
  }: { name: IconName; size?: number; class?: string; spin?: boolean } = $props();
</script>

<span
  class="icon {className}"
  class:spin
  aria-hidden="true"
  style:font-size={size ? `${size}px` : undefined}
>
  <svg viewBox="0 0 24 24" width="1em" height="1em" focusable="false">
    <path d={ICON_PATHS[name]} />
  </svg>
</span>

<style>
  svg {
    display: block;
    flex: none;
    fill: currentColor;
  }
  .spin {
    animation: pdl-spin 0.9s linear infinite;
  }
</style>
