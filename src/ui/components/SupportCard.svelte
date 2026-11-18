<script lang="ts">
  import { fade } from 'svelte/transition';
  import { LINKS } from '../../lib/links';
  import { t } from '../state/app.svelte';
  import Icon from './Icon.svelte';
  import IconButton from './IconButton.svelte';
  import Logo from './Logo.svelte';

  interface Props {
    /** compact: a single link row, for sidebars and footers. */
    variant?: 'full' | 'compact';
    ondismiss?: () => void;
  }

  let { variant = 'full', ondismiss }: Props = $props();
</script>

{#if variant === 'compact'}
  <a class="compact" href={LINKS.kofi} target="_blank" rel="noopener noreferrer">
    <Icon name="coffee" />
    <span>{t('support.kofi')}</span>
    <Icon name="external" class="ext" />
  </a>
{:else}
  <section class="card" aria-label={t('support.title')} out:fade={{ duration: 180 }}>
    <div class="art" aria-hidden="true">
      <Logo size={64} />
      <Icon name="heart" class="heart" />
    </div>
    <div class="text">
      <h2>{t('support.title')}</h2>
      <p>{t('support.body')}</p>
      <div class="actions">
        <a class="btn primary" href={LINKS.kofi} target="_blank" rel="noopener noreferrer">
          <Icon name="coffee" />
          <span>{t('support.kofi')}</span>
        </a>
        <a class="btn" href={LINKS.repo} target="_blank" rel="noopener noreferrer">
          <Icon name="starOutline" />
          <span>{t('support.star')}</span>
        </a>
      </div>
    </div>
    {#if ondismiss}
      <div class="close">
        <IconButton
          icon="close"
          label={t('support.dismiss')}
          size="sm"
          tipSide="left"
          onclick={ondismiss}
        />
      </div>
    {/if}
  </section>
{/if}

<style>
  .card {
    position: relative;
    display: flex;
    gap: 20px;
    align-items: center;
    padding: 20px 22px;
    border-radius: var(--radius-xl);
    border: 1.5px dashed color-mix(in srgb, var(--accent) 55%, var(--border-strong));
    background:
      radial-gradient(420px 160px at 0% 0%, var(--accent-soft), transparent), var(--bg-elev);
  }
  .art {
    position: relative;
    flex: none;
    transform: rotate(-8deg);
    transition: transform var(--dur-slow) var(--ease-spring);
  }
  .card:hover .art {
    transform: rotate(4deg) scale(1.04);
  }
  .art :global(.heart) {
    position: absolute;
    right: -8px;
    top: -6px;
    color: var(--accent-strong);
    font-size: 18px;
    animation: beat 1.8s var(--ease) infinite;
  }
  @keyframes beat {
    0%,
    60%,
    100% {
      transform: scale(1);
    }
    20% {
      transform: scale(1.25);
    }
    35% {
      transform: scale(0.95);
    }
  }
  .text {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  h2 {
    font-size: var(--fs-lg);
    font-weight: 700;
  }
  p {
    color: var(--text-dim);
    font-size: var(--fs-sm);
    max-width: 560px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 14px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg-elev-2);
    color: var(--text);
    font-weight: 600;
    font-size: var(--fs-md);
    text-decoration: none;
    transition:
      background-color var(--dur-fast) var(--ease),
      border-color var(--dur-fast) var(--ease),
      transform var(--dur-fast) var(--ease);
  }
  .btn:hover {
    text-decoration: none;
    background: var(--bg-elev-3);
    border-color: var(--border-strong);
  }
  .btn:active {
    transform: scale(0.97);
  }
  .btn.primary {
    background: var(--accent);
    border-color: transparent;
    color: var(--accent-contrast);
    box-shadow: 0 6px 18px -8px var(--accent);
  }
  .btn.primary:hover {
    background: color-mix(in srgb, var(--accent) 88%, white);
  }
  .close {
    position: absolute;
    top: 10px;
    right: 10px;
  }
  .compact {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: var(--radius-md);
    border: 1px dashed color-mix(in srgb, var(--accent) 45%, var(--border-strong));
    color: var(--text-dim);
    font-size: var(--fs-sm);
    font-weight: 600;
    text-decoration: none;
    transition:
      color var(--dur-fast) var(--ease),
      background-color var(--dur-fast) var(--ease);
  }
  .compact:hover {
    color: var(--text);
    background: var(--accent-softer);
    text-decoration: none;
  }
  .compact :global(.icon:first-child) {
    color: var(--accent-strong);
  }
  .compact :global(.ext) {
    margin-left: auto;
    opacity: 0.6;
  }
  @media (max-width: 560px) {
    .card {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
