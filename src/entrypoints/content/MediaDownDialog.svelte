<script lang="ts">
  import { t } from '../../ui/state/app.svelte';
  import Dialog from '../../ui/components/Dialog.svelte';
  import Icon from '../../ui/components/Icon.svelte';
  import { answerMediaDown, mediaPrompt } from './prompts.svelte';
</script>

<Dialog
  open={mediaPrompt.open}
  title={t('mediaDown.title', { site: mediaPrompt.site })}
  oncancel={() => answerMediaDown('cancel')}
>
  <p class="body">{t('mediaDown.body', { host: mediaPrompt.host })}</p>
  <div class="choices">
    <button type="button" class="choice" onclick={() => answerMediaDown('thumbnails')}>
      <Icon name="image" />
      <span>
        <strong>{t('mediaDown.thumbnails')}</strong>
        <span class="hint">{t('mediaDown.thumbnailsHint')}</span>
      </span>
    </button>
    <button type="button" class="choice" onclick={() => answerMediaDown('continue')}>
      <Icon name="queue" />
      <span>
        <strong>{t('mediaDown.continue')}</strong>
        <span class="hint">{t('mediaDown.continueHint')}</span>
      </span>
    </button>
  </div>
</Dialog>

<style>
  .body {
    margin: 0 0 12px;
    color: var(--text-dim);
    line-height: 1.5;
  }
  .choices {
    display: grid;
    gap: 8px;
  }
  .choice {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    width: 100%;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 10px);
    background: var(--bg-elev-2, var(--bg-elev));
    color: var(--text);
    text-align: left;
    font: inherit;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease;
  }
  .choice:hover,
  .choice:focus-visible {
    border-color: var(--accent);
    background: var(--accent-softer, var(--bg-elev));
    outline: none;
  }
  .choice > :global(.icon) {
    margin-top: 2px;
    color: var(--accent);
  }
  .choice > span {
    display: grid;
    gap: 2px;
  }
  .hint {
    color: var(--text-dim);
    font-size: var(--fs-sm);
  }
</style>
