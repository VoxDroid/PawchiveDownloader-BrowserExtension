<script lang="ts">
  /**
   * One tooltip for a whole page (popup, options, or the panel on the site).
   * Any element with `data-tip="..."` gets it (and `data-tip-side="bottom" |
   * "left"` as a preferred side). It floats above every container, so nothing
   * clips it, wraps long text and stays inside the window, like the desktop
   * app's. On the site it lives in the extension's shadow root, so it listens
   * there: events inside a shadow root do not reach the page's document.
   */
  import { onMount, tick } from 'svelte';

  const DELAY_MS = 350;
  const GAP = 8;
  const MARGIN = 8;

  let text = $state('');
  let visible = $state(false);
  let x = $state(0);
  let y = $state(0);
  let below = $state(false);
  let tip = $state<HTMLDivElement>();
  let target: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function anchorOf(node: EventTarget | null): HTMLElement | null {
    return node instanceof Element ? (node.closest('[data-tip]') as HTMLElement | null) : null;
  }

  /** Places the tip above the element (or below), clamped to the window. */
  function place() {
    if (!target || !tip) return;
    const r = target.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const side = target.dataset.tipSide;
    const roomAbove = r.top - GAP - MARGIN;
    below =
      side === 'bottom' ? r.bottom + GAP + t.height <= innerHeight - MARGIN : t.height > roomAbove;
    const left = side === 'left' ? r.right - t.width : r.left + r.width / 2 - t.width / 2;
    x = Math.round(Math.min(Math.max(MARGIN, left), innerWidth - t.width - MARGIN));
    y = Math.round(below ? r.bottom + GAP : r.top - GAP - t.height);
  }

  function show(el: HTMLElement) {
    const label = el.dataset.tip?.trim();
    if (!label) return;
    target = el;
    clearTimeout(timer);
    timer = setTimeout(() => {
      text = label;
      visible = false;
      // Measure with the new text in place, then show it.
      void tick().then(() => {
        if (target !== el) return;
        place();
        visible = true;
      });
    }, DELAY_MS);
  }

  function hide() {
    clearTimeout(timer);
    target = null;
    if (visible) visible = false;
  }

  onMount(() => {
    const root = (tip?.getRootNode() ?? document) as Document | ShadowRoot;
    const over = (e: Event) => {
      const el = anchorOf(e.target);
      if (el && el !== target) show(el);
      else if (!el && target) hide();
    };
    const out = (e: Event) => {
      const next = anchorOf((e as PointerEvent).relatedTarget);
      if (next !== target) hide();
    };
    const focus = (e: Event) => {
      const el = anchorOf(e.target);
      if (el && (e.target as HTMLElement).matches(':focus-visible')) show(el);
    };
    const away = () => hide();
    // Removing a focused element fires focusout while Svelte is still taking
    // the page apart, where state must not change: hide right after instead.
    const blurred = () => queueMicrotask(hide);
    root.addEventListener('pointerover', over);
    root.addEventListener('pointerout', out);
    root.addEventListener('focusin', focus);
    root.addEventListener('focusout', blurred);
    root.addEventListener('pointerdown', away, true);
    root.addEventListener('scroll', away, true);
    window.addEventListener('scroll', away, true);
    window.addEventListener('blur', away);
    window.addEventListener('resize', away);
    return () => {
      clearTimeout(timer);
      root.removeEventListener('pointerover', over);
      root.removeEventListener('pointerout', out);
      root.removeEventListener('focusin', focus);
      root.removeEventListener('focusout', blurred);
      root.removeEventListener('pointerdown', away, true);
      root.removeEventListener('scroll', away, true);
      window.removeEventListener('scroll', away, true);
      window.removeEventListener('blur', away);
      window.removeEventListener('resize', away);
    };
  });
</script>

<div
  bind:this={tip}
  class="tooltip"
  class:visible
  class:below
  role="tooltip"
  aria-hidden={!visible}
  style:left="{x}px"
  style:top="{y}px"
>
  {text}
</div>

<style>
  .tooltip {
    position: fixed;
    z-index: 2147483647;
    max-width: min(320px, calc(100vw - 16px));
    padding: 5px 8px;
    border-radius: var(--radius-sm);
    background: var(--bg-elev-3);
    border: 1px solid var(--border-strong);
    color: var(--text);
    font-family: var(--font);
    font-size: var(--fs-xs);
    font-weight: 500;
    line-height: 1.35;
    white-space: normal;
    overflow-wrap: anywhere;
    box-shadow: var(--shadow-md);
    pointer-events: none;
    opacity: 0;
    transform: translateY(4px);
    transition:
      opacity var(--dur-fast) var(--ease),
      transform var(--dur-fast) var(--ease);
  }
  .tooltip.below {
    transform: translateY(-4px);
  }
  .tooltip.visible {
    opacity: 1;
    transform: none;
  }
</style>
