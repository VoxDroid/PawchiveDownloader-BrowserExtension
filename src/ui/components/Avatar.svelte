<script lang="ts">
  /**
   * A creator's picture. Until it loads, and when it cannot (offline, a
   * removed picture, a site that is down), the creator's initials show on a
   * color made from their name, instead of a broken-image symbol.
   */
  let {
    src,
    name,
    size = 40,
    radius = '10px',
  }: {
    src?: string | null;
    name: string;
    /** Width and height in pixels. */
    size?: number;
    radius?: string;
  } = $props();

  let loaded = $state(false);
  let failed = $state(false);
  $effect(() => {
    void src;
    loaded = false;
    failed = false;
  });

  const initials = $derived(
    name
      .split(/\s+/)
      .map((w) => w.match(/[\p{L}\p{N}]/u)?.[0] ?? '')
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?',
  );
  const hue = $derived([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7));
</script>

<span
  class="avatar"
  style:--size="{size}px"
  style:--radius={radius}
  style:--h={hue}
  aria-hidden="true"
>
  {#if !loaded}<span class="initials">{initials}</span>{/if}
  {#if src && !failed}
    <img
      class="avatar blurrable"
      class:loaded
      {src}
      alt=""
      loading="lazy"
      decoding="async"
      onload={() => (loaded = true)}
      onerror={() => (failed = true)}
    />
  {/if}
</span>

<style>
  span.avatar {
    position: relative;
    flex: none;
    display: inline-grid;
    place-items: center;
    width: var(--size);
    height: var(--size);
    border-radius: var(--radius);
    overflow: hidden;
    background: hsl(var(--h) 38% 32%);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06);
    color: #fff;
    user-select: none;
  }
  .initials {
    font-size: calc(var(--size) * 0.36);
    font-weight: 700;
    letter-spacing: 0.02em;
    line-height: 1;
  }
  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transition: opacity var(--dur-fast) var(--ease);
  }
  img.loaded {
    opacity: 1;
  }
</style>
