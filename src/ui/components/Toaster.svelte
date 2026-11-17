<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { dismissToast, toasts, type ToastKind } from '../state/toasts.svelte';
  import type { IconName } from '../icons.generated';
  import Icon from './Icon.svelte';
  import { t } from '../state/app.svelte';

  let { position = 'bottom' }: { position?: 'bottom' | 'top' } = $props();

  const ICON: Record<ToastKind, IconName> = {
    info: 'info',
    success: 'success',
    warning: 'warning',
    error: 'error',
  };
</script>

<div class="toaster {position}" role="region" aria-live="polite" aria-label="Notifications">
  {#each toasts as item (item.id)}
    <div
      class="toast {item.kind}"
      role={item.kind === 'error' ? 'alert' : 'status'}
      animate:flip={{ duration: 220, easing: cubicOut }}
      transition:fly={{ y: position === 'bottom' ? 16 : -16, duration: 220, easing: cubicOut }}
    >
      <Icon name={item.icon ?? ICON[item.kind]} class="toast-icon" />
      <span class="message">{item.message}</span>
      {#if item.action}
        <button
          type="button"
          class="action"
          onclick={() => {
            item.action?.run();
            dismissToast(item.id);
          }}>{item.action.label}</button
        >
      {/if}
      <button
        type="button"
        class="close"
        aria-label={t('common.close')}
        onclick={() => dismissToast(item.id)}
      >
        <Icon name="close" />
      </button>
    </div>
  {/each}
</div>

<style>
  .toaster {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(420px, calc(100vw - 32px));
    pointer-events: none;
  }
  .bottom {
    bottom: 20px;
    flex-direction: column-reverse;
  }
  .top {
    top: 16px;
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 10px 10px 14px;
    border-radius: var(--radius-md);
    background: var(--bg-elev-3);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-lg);
    color: var(--text);
    font-size: var(--fs-md);
  }
  .toast :global(.toast-icon) {
    color: var(--tone, var(--info));
  }
  .success {
    --tone: var(--success);
  }
  .warning {
    --tone: var(--warning);
  }
  .error {
    --tone: var(--danger);
  }
  .message {
    flex: 1;
    min-width: 0;
  }
  .action {
    border: 0;
    background: var(--accent-soft);
    color: var(--text);
    font-weight: 600;
    font-size: var(--fs-sm);
    padding: 4px 10px;
    border-radius: var(--radius-sm);
  }
  .close {
    border: 0;
    background: transparent;
    color: var(--text-faint);
    padding: 4px;
    border-radius: var(--radius-sm);
    display: inline-flex;
  }
  .close:hover {
    color: var(--text);
    background: var(--bg-hover);
  }
</style>
