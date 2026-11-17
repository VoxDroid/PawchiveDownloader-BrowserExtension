<script lang="ts">
  import { TEMPLATE_TOKENS, validateTemplate } from '../../lib/download/template';
  import { t } from '../../ui/state/app.svelte';
  import Chip from '../../ui/components/Chip.svelte';
  import TextInput from '../../ui/components/TextInput.svelte';

  interface Props {
    value: string;
    kind: 'folder' | 'file';
    label: string;
    presets: Record<string, string>;
    onsave: (value: string) => void;
  }

  let { value, kind, label, presets, onsave }: Props = $props();

  // Follows the saved value, but can be edited freely until committed.
  let draft = $derived(value);
  let showTokens = $state(false);
  const error = $derived(validateTemplate(draft, kind));

  function commit(next = draft) {
    draft = next;
    if (validateTemplate(next, kind) === null && next !== value) onsave(next);
  }
</script>

<div class="template">
  <TextInput
    {label}
    mono
    invalid={error !== null}
    bind:value={draft}
    onchange={() => commit()}
    onkeydown={(e) => e.key === 'Enter' && commit()}
  />
  {#if error}<span class="error">{t(`template.${error}`)}</span>{/if}
  <div class="presets">
    {#each Object.entries(presets) as [name, preset] (name)}
      <Chip label={t(`preset.${name}`)} active={value === preset} onclick={() => commit(preset)} />
    {/each}
    <button type="button" class="tokens-toggle" onclick={() => (showTokens = !showTokens)}
      >{showTokens ? t('settings.hideTokens') : t('settings.showTokens')}</button
    >
  </div>
  {#if showTokens}
    <div class="tokens">
      {#each TEMPLATE_TOKENS as token (token)}
        <button
          type="button"
          class="token"
          title={t(`token.${token}`)}
          onclick={() => commit(`${draft}{${token}}`)}
          >{`{${token}}`}<span>{t(`token.${token}`)}</span></button
        >
      {/each}
    </div>
  {/if}
</div>

<style>
  .template {
    display: grid;
    gap: 8px;
  }
  .error {
    font-size: var(--fs-xs);
    color: var(--danger);
  }
  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .tokens-toggle {
    border: 0;
    background: transparent;
    color: var(--accent-strong);
    font-size: var(--fs-xs);
    font-weight: 600;
    margin-left: auto;
  }
  .tokens {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 6px;
    padding: 10px;
    border-radius: var(--radius-md);
    background: var(--bg);
    border: 1px solid var(--border);
  }
  .token {
    display: flex;
    gap: 8px;
    align-items: baseline;
    border: 0;
    background: transparent;
    text-align: left;
    padding: 4px 6px;
    border-radius: var(--radius-sm);
    color: var(--accent-strong);
    font-size: var(--fs-sm);
    font-weight: 600;
  }
  .token:hover {
    background: var(--bg-hover);
  }
  .token span {
    color: var(--text-dim);
    font-weight: 400;
    font-size: var(--fs-xs);
  }
</style>
