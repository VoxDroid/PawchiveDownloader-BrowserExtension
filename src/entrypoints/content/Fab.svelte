<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { app, overallProgress, t } from '../../ui/state/app.svelte';
  import Icon from '../../ui/components/Icon.svelte';
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
    data-tip={t('fab.tooltip')}
    data-tip-side={corner.startsWith('top') ? 'bottom' : undefined}
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
    <span class="glyph"><Icon name={progress.active > 0 ? 'download' : 'paw'} size={22} /></span>
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
    color: var(--accent-strong);
  }
  .busy .glyph {
    animation: pdl-pulse 1.6s var(--ease) infinite;
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
