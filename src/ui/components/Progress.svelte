<script lang="ts">
  interface Props {
    value?: number;
    indeterminate?: boolean;
    tone?: 'accent' | 'success' | 'warning' | 'danger' | 'muted';
    height?: number;
    label?: string;
  }

  let { value = 0, indeterminate = false, tone = 'accent', height = 6, label }: Props = $props();
  const pct = $derived(Math.round(Math.min(1, Math.max(0, value)) * 1000) / 10);
</script>

<div
  class="progress {tone}"
  class:indeterminate
  style="--h:{height}px"
  role="progressbar"
  aria-label={label}
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow={indeterminate ? undefined : pct}
>
  <div class="fill" style="transform:scaleX({indeterminate ? 1 : pct / 100})"></div>
</div>

<style>
  .progress {
    position: relative;
    height: var(--h);
    border-radius: 99px;
    background: var(--bg-elev-3);
    overflow: hidden;
  }
  .fill {
    position: absolute;
    inset: 0;
    transform-origin: left center;
    border-radius: inherit;
    background: var(--tone);
    transition: transform 500ms var(--ease-out);
    overflow: hidden;
  }
  .accent .fill::after {
    content: '';
    position: absolute;
    inset: 0;
    width: 40%;
    background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.22), transparent);
    animation: pdl-shimmer 1.8s var(--ease) infinite;
  }
  .indeterminate .fill {
    width: 35%;
    transform: none !important;
    animation: pdl-shimmer 1.3s var(--ease) infinite;
  }
  .indeterminate .fill::after {
    display: none;
  }
  .accent {
    --tone: var(--accent);
  }
  .success {
    --tone: var(--success);
  }
  .warning {
    --tone: var(--warning);
  }
  .danger {
    --tone: var(--danger);
  }
  .muted {
    --tone: var(--text-faint);
  }
</style>
