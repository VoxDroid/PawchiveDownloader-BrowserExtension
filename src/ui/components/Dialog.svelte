<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import Button from './Button.svelte';
  import { t } from '../state/app.svelte';

  interface Props {
    open: boolean;
    title: string;
    confirmLabel?: string;
    danger?: boolean;
    busy?: boolean;
    onconfirm?: () => void;
    oncancel: () => void;
    children?: Snippet;
  }

  let {
    open,
    title,
    confirmLabel,
    danger = false,
    busy = false,
    onconfirm,
    oncancel,
    children,
  }: Props = $props();

  let dialog = $state<HTMLDivElement>();

  $effect(() => {
    if (open) dialog?.querySelector<HTMLElement>('button.primary, button.danger, button')?.focus();
  });
</script>

{#if open}
  <div
    class="scrim"
    transition:fade={{ duration: 160 }}
    onclick={oncancel}
    role="presentation"
  ></div>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    bind:this={dialog}
    transition:scale={{ start: 0.96, duration: 200, easing: cubicOut }}
    onkeydown={(e) => e.key === 'Escape' && oncancel()}
    tabindex="-1"
  >
    <h2>{title}</h2>
    {#if children}<div class="body">{@render children()}</div>{/if}
    <div class="actions">
      <Button variant="ghost" onclick={oncancel}>{t('common.cancel')}</Button>
      {#if onconfirm}
        <Button variant={danger ? 'danger' : 'primary'} loading={busy} onclick={onconfirm}
          >{confirmLabel ?? t('common.confirm')}</Button
        >
      {/if}
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: var(--scrim);
    backdrop-filter: blur(2px);
    z-index: 1000;
  }
  .dialog {
    position: fixed;
    left: 50%;
    top: 50%;
    translate: -50% -50%;
    z-index: 1001;
    width: min(440px, calc(100vw - 32px));
    padding: 20px;
    border-radius: var(--radius-lg);
    background: var(--bg-elev);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-lg);
    outline: none;
  }
  h2 {
    font-size: var(--fs-lg);
    font-weight: 700;
    margin-bottom: 8px;
  }
  .body {
    color: var(--text-dim);
    font-size: var(--fs-md);
    display: grid;
    gap: 12px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
  }
</style>
