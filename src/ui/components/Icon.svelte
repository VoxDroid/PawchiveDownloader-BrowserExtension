<script lang="ts">
  import { ICONS, type IconName } from '../icons.generated';

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
  style={size ? `font-size:${size}px` : undefined}>{ICONS[name]}</span
>

<style>
  .spin {
    animation: pdl-spin 0.9s linear infinite;
  }
</style>
