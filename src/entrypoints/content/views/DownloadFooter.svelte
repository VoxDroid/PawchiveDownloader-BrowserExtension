<script lang="ts" module>
  import type { JobOptions } from '../../../lib/jobs/types';

  export interface FooterChoice {
    mode: JobOptions['mode'];
    saveText: boolean;
    skipDownloaded: boolean;
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { app, t } from '../../../ui/state/app.svelte';
  import Button from '../../../ui/components/Button.svelte';
  import Checkbox from '../../../ui/components/Checkbox.svelte';
  import Segmented from '../../../ui/components/Segmented.svelte';

  interface Props {
    label: string;
    disabled?: boolean;
    busy?: boolean;
    showText?: boolean;
    ondownload: (choice: FooterChoice) => void;
    extra?: Snippet;
  }

  let {
    label,
    disabled = false,
    busy = false,
    showText = true,
    ondownload,
    extra,
  }: Props = $props();

  let mode = $state<JobOptions['mode']>(app.settings.downloadMode);
  let saveText = $state(app.settings.saveContent !== 'none');
  let skipDownloaded = $state(app.settings.skipDownloaded);
</script>

<footer>
  <div class="row">
    <Segmented
      label={t('options.mode')}
      size="sm"
      bind:value={mode}
      options={[
        { value: 'individual', label: t('options.individual'), icon: 'layers' },
        { value: 'zip', label: t('options.zip'), icon: 'folderZip' },
      ]}
    />
  </div>
  <div class="row checks">
    {#if showText}
      <Checkbox bind:checked={saveText}>{t('options.saveText')}</Checkbox>
    {/if}
    <Checkbox bind:checked={skipDownloaded}>{t('options.skipDownloaded')}</Checkbox>
  </div>
  <div class="row actions">
    {#if extra}{@render extra()}{/if}
    <Button
      variant="primary"
      size="lg"
      icon="download"
      block
      {disabled}
      loading={busy}
      onclick={() => ondownload({ mode, saveText, skipDownloaded })}
    >
      {label}
    </Button>
  </div>
</footer>

<style>
  footer {
    display: grid;
    gap: 10px;
    padding: 12px 14px 14px;
    border-top: 1px solid var(--border);
    background: var(--bg-elev);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .row > :global(.segmented) {
    flex: 1;
  }
  .checks {
    flex-wrap: wrap;
    gap: 6px 18px;
    font-size: var(--fs-sm);
  }
  .actions {
    gap: 8px;
  }
</style>
