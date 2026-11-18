<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { app, overallProgress, t } from '../../ui/state/app.svelte';
  import Logo from '../../ui/components/Logo.svelte';
  import { page, selectedCount } from './page.svelte';

  const progress = $derived(overallProgress(app.jobs));
  const corner = $derived(app.settings.buttonCorner);
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const hidden = $derived(page.panelOpen && corner.endsWith(app.settings.panelSide));
  const count = $derived(selectedCount());
</script>

{#if !hidden}
  <button
    type="button"
    class="fab {corner}"
    class:busy={progress.active > 0}
    aria-label={t('fab.label')}
    onclick={() => (page.panelOpen = !page.panelOpen)}
    transition:scale={{ start: 0.6, duration: 220, easing: cubicOut }}
  >
    <svg class="ring" viewBox="0 0 60 60" aria-hidden="true">
      <circle class="track" cx="30" cy="30" r={radius} />
      {#if progress.active > 0}
        <circle
          class="value"
          cx="30"
          cy="30"
          r={radius}
          stroke-dasharray={circumference}
          stroke-dashoffset={circumference * (1 - Math.max(0.04, progress.ratio))}
          transition:fade={{ duration: 200 }}
        />
      {/if}
    </svg>
    <span class="glyph"><Logo size={38} /></span>
    <span class="tip" role="tooltip">{t('fab.tooltip')}</span>
    {#if count > 0 || progress.active > 0}
      <span class="badge mono-num" transition:scale={{ duration: 180 }}
        >{count > 0 ? count : progress.active}</span
      >
    {/if}
  </button>
{/if}

<style>
  .fab {
    position: fixed;
    width: 54px;
    height: 54px;
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border-strong));
    background: radial-gradient(
      circle at 30% 25%,
      color-mix(in srgb, var(--accent) 34%, var(--bg-elev-2)),
      var(--bg-elev)
    );
    color: var(--text);
    box-shadow:
      var(--shadow-lg),
      0 0 0 6px color-mix(in srgb, var(--accent) 8%, transparent);
    display: grid;
    place-items: center;
    padding: 0;
    transition:
      transform var(--dur) var(--ease-spring),
      box-shadow var(--dur) var(--ease);
  }
  .fab:hover {
    transform: translateY(-2px) scale(1.04);
    box-shadow:
      var(--shadow-lg),
      0 0 0 8px color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .fab:active {
    transform: scale(0.94);
  }
  .bottom-right {
    right: 22px;
    bottom: 22px;
  }
  .bottom-left {
    left: 22px;
    bottom: 22px;
  }
  .top-right {
    right: 22px;
    top: 22px;
  }
  .top-left {
    left: 22px;
    top: 22px;
  }
  .ring {
    position: absolute;
    inset: -3px;
    width: calc(100% + 6px);
    height: calc(100% + 6px);
    transform: rotate(-90deg);
    pointer-events: none;
  }
  .track {
    fill: none;
    stroke: transparent;
    stroke-width: 3;
  }
  .value {
    fill: none;
    stroke: var(--accent);
    stroke-width: 3;
    stroke-linecap: round;
    transition: stroke-dashoffset 600ms var(--ease-out);
  }
  .glyph {
    display: grid;
    place-items: center;
    transform-origin: 50% 80%;
    transition: transform var(--dur) var(--ease-spring);
  }
  .fab:hover .glyph {
    transform: rotate(-10deg) scale(1.06);
  }
  /* While downloading, the paw taps like a cat batting at something. */
  .busy .glyph {
    animation: paw-tap 1.4s var(--ease) infinite;
  }
  @keyframes paw-tap {
    0%,
    55%,
    100% {
      transform: translateY(0) rotate(0) scale(1);
    }
    20% {
      transform: translateY(-4px) rotate(-8deg) scale(1.04);
    }
    35% {
      transform: translateY(1px) rotate(2deg) scale(0.96, 1.02);
    }
  }
  /* Opens toward the middle of the screen from whichever corner it sits in. */
  .tip {
    position: absolute;
    padding: 5px 9px;
    border-radius: var(--radius-sm);
    background: var(--bg-elev-3);
    border: 1px solid var(--border-strong);
    color: var(--text);
    font-size: var(--fs-xs);
    font-weight: 500;
    white-space: nowrap;
    box-shadow: var(--shadow-md);
    opacity: 0;
    pointer-events: none;
    transform: translateY(4px);
    transition:
      opacity var(--dur-fast) var(--ease),
      transform var(--dur-fast) var(--ease);
  }
  .fab:hover .tip,
  .fab:focus-visible .tip {
    opacity: 1;
    transform: none;
    transition-delay: 350ms;
  }
  .bottom-right .tip,
  .bottom-left .tip {
    bottom: calc(100% + 12px);
  }
  .top-right .tip,
  .top-left .tip {
    top: calc(100% + 12px);
    transform: translateY(-4px);
  }
  .bottom-right .tip,
  .top-right .tip {
    right: 0;
  }
  .bottom-left .tip,
  .top-left .tip {
    left: 0;
  }
  .badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 99px;
    background: var(--accent);
    color: var(--accent-contrast);
    font-size: 11px;
    font-weight: 700;
    line-height: 20px;
    box-shadow: 0 0 0 2px var(--bg);
  }
</style>
