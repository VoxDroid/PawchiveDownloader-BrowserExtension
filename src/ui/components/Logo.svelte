<script lang="ts">
  let { size = 28 }: { size?: number } = $props();
</script>

<svg class="logo" width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
  <rect x="16" y="16" width="480" height="480" rx="112" fill="var(--accent)" />
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#pdl-logo-shine)" />
  <defs>
    <linearGradient id="pdl-logo-shine" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.22" />
      <stop offset="1" stop-color="#000" stop-opacity="0.18" />
    </linearGradient>
  </defs>
  <g fill="#fff">
    <ellipse cx="148" cy="214" rx="38" ry="48" transform="rotate(-24 148 214)" />
    <ellipse cx="214" cy="140" rx="38" ry="50" transform="rotate(-8 214 140)" />
    <ellipse cx="298" cy="140" rx="38" ry="50" transform="rotate(8 298 140)" />
    <ellipse cx="364" cy="214" rx="38" ry="48" transform="rotate(24 364 214)" />
    <path
      d="M256 236c-62 0-128 66-128 128 0 38 28 60 62 60 26 0 42-12 66-12s40 12 66 12c34 0 62-22 62-60 0-62-66-128-128-128z"
    />
  </g>
  <g
    fill="none"
    stroke="var(--accent)"
    stroke-width="26"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M256 284v84" />
    <path d="M218 334l38 38 38-38" />
  </g>
</svg>

<style>
  .logo {
    flex: none;
    display: block;
  }
</style>
