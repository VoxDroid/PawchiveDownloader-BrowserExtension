<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { browser } from 'wxt/browser';
  import {
    buildArchivePath,
    buildFilePath,
    FILE_TEMPLATE_PRESETS,
    FOLDER_TEMPLATE_PRESETS,
    type NameContext,
  } from '../../../lib/download/template';
  import { LANGUAGE_NAMES } from '../../../lib/i18n';
  import { FILE_CATEGORIES } from '../../../lib/pawchive/normalize';
  import {
    ACCENTS,
    DEFAULT_SETTINGS,
    LOCALES,
    THEMES,
    WATCH_INTERVALS,
    type Settings,
  } from '../../../lib/settings';
  import {
    exportSettings,
    parseSettingsFile,
    resetSettings,
    saveSettings,
  } from '../../../lib/storage/settings-store';
  import { app, t, updateSettings } from '../../../ui/state/app.svelte';
  import { toast } from '../../../ui/state/toasts.svelte';
  import Button from '../../../ui/components/Button.svelte';
  import Chip from '../../../ui/components/Chip.svelte';
  import Dialog from '../../../ui/components/Dialog.svelte';
  import Icon from '../../../ui/components/Icon.svelte';
  import Segmented from '../../../ui/components/Segmented.svelte';
  import Select from '../../../ui/components/Select.svelte';
  import Switch from '../../../ui/components/Switch.svelte';
  import PageHeader from '../PageHeader.svelte';
  import SettingRow from '../SettingRow.svelte';
  import SettingSection from '../SettingSection.svelte';
  import TemplateField from '../TemplateField.svelte';
  import { pickTextFile, saveTextFile, stamp } from '../download';

  const s = $derived(app.settings);
  let resetOpen = $state(false);
  let commands = $state<Array<{ name?: string; shortcut?: string; description?: string }>>([]);
  let hasAccess = $state(true);

  const SAMPLE: NameContext = {
    service: 'patreon',
    creatorId: '2581747',
    creatorName: 'Histy',
    postId: '175580645',
    postTitle: 'Early access: new outfit pack',
    published: '2026-11-17T08:59:08',
    added: '2026-11-17T10:00:00',
    index: 3,
    count: 12,
    fileName: 'Screenshot (1790).png',
    ext: 'png',
    hash: '64bb473acd217b4e30e4c4a65a78b5dd1d0e649f32e8b9c704912165d3625336',
    role: 'attachment',
  };
  const example = $derived(buildFilePath(s.folderTemplate, s.fileTemplate, SAMPLE));
  const archiveExample = $derived(buildArchivePath(s.folderTemplate, s.archiveTemplate, SAMPLE));

  const MB = (n: number) => (n >= 1024 ? `${(n / 1024).toLocaleString()} GB` : `${n} MB`);
  const HOSTS = ['https://pawchive.pw/*', 'https://*.pawchive.pw/*'];

  onMount(async () => {
    commands = (await browser.commands.getAll().catch(() => [])) as typeof commands;
    hasAccess = await browser.permissions.contains({ origins: HOSTS }).catch(() => true);
  });

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    void updateSettings({ [key]: value } as Partial<Settings>).then(() =>
      toast(t('settings.saved'), 'success', { duration: 1400 }),
    );
  }

  async function grant() {
    hasAccess = await browser.permissions.request({ origins: HOSTS }).catch(() => false);
  }

  async function importFile() {
    const text = await pickTextFile('.json,application/json');
    if (!text) return;
    try {
      await saveSettings(parseSettingsFile(text));
      toast(t('settings.imported'), 'success');
    } catch {
      toast(t('settings.importFailed'), 'error');
    }
  }

  async function reset() {
    await resetSettings();
    resetOpen = false;
    toast(t('settings.resetDone'), 'success');
  }

  function openShortcuts() {
    const url =
      import.meta.env.BROWSER === 'firefox' ? 'about:addons' : 'chrome://extensions/shortcuts';
    void browser.tabs.create({ url }).catch(() => toast(t('settings.shortcutsManual'), 'info'));
  }

  const sections = [
    ['appearance', 'palette'],
    ['downloads', 'download'],
    ['naming', 'rename'],
    ['zip', 'folderZip'],
    ['page', 'web'],
    ['background', 'bell'],
    ['shortcuts', 'keyboard'],
    ['data', 'database'],
  ] as const;
</script>

<PageHeader title={t('nav.settings')} description={t('settings.description')} />

<nav class="jump">
  {#each sections as [id, icon] (id)}
    <a
      href="#settings"
      onclick={(e) => {
        e.preventDefault();
        document.getElementById(`s-${id}`)?.scrollIntoView({ behavior: 'smooth' });
      }}
    >
      <Icon name={icon} />{t(`settings.${id}`)}
    </a>
  {/each}
</nav>

{#if !hasAccess}
  <div class="access" in:fade>
    <Icon name="shield" />
    <span>{t('settings.accessMissing')}</span>
    <Button variant="primary" size="sm" onclick={grant}>{t('settings.grant')}</Button>
  </div>
{/if}

<SettingSection id="s-appearance" icon="palette" title={t('settings.appearance')}>
  <SettingRow label={t('settings.language')} description={t('settings.languageHint')}>
    <Select
      label={t('settings.language')}
      value={s.language}
      options={[
        { value: 'auto', label: t('settings.languageAuto') },
        ...LOCALES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] })),
      ]}
      onchange={(v) => set('language', v)}
    />
  </SettingRow>
  <SettingRow label={t('settings.theme')} stacked>
    <div class="themes">
      {#each [...THEMES, 'system'] as theme (theme)}
        <button
          type="button"
          class="theme-swatch"
          data-preview={theme}
          class:active={s.theme === theme}
          onclick={() => set('theme', theme as Settings['theme'])}
        >
          <span class="preview"><span></span><span></span><span></span></span>
          <span>{t(`theme.${theme}`)}</span>
        </button>
      {/each}
    </div>
  </SettingRow>
  <SettingRow label={t('settings.accent')}>
    <div class="accents">
      {#each ACCENTS as color (color)}
        <button
          type="button"
          class="accent"
          class:active={s.accent === color}
          style="--c:{color}"
          aria-label={color}
          onclick={() => set('accent', color)}
        ></button>
      {/each}
      <label class="accent custom" style="--c:{s.accent}" data-tip={t('settings.customColor')}>
        <input
          type="color"
          value={s.accent}
          onchange={(e) => set('accent', (e.currentTarget as HTMLInputElement).value)}
        />
        <Icon name="plus" />
      </label>
    </div>
  </SettingRow>
  <SettingRow label={t('settings.motion')} description={t('settings.motionHint')}>
    <Segmented
      label={t('settings.motion')}
      size="sm"
      value={s.reduceMotion}
      onchange={(v) => set('reduceMotion', v)}
      options={[
        { value: 'auto', label: t('motion.auto') },
        { value: 'off', label: t('motion.off') },
        { value: 'on', label: t('motion.on') },
      ]}
    />
  </SettingRow>
</SettingSection>

<SettingSection
  id="s-downloads"
  icon="download"
  title={t('settings.downloads')}
  description={t('settings.downloadsHint')}
>
  <SettingRow label={t('settings.mode')} description={t('settings.modeHint')}>
    <Segmented
      label={t('settings.mode')}
      size="sm"
      value={s.downloadMode}
      onchange={(v) => set('downloadMode', v)}
      options={[
        { value: 'individual', label: t('options.individual'), icon: 'layers' },
        { value: 'zip', label: t('options.zip'), icon: 'folderZip' },
      ]}
    />
  </SettingRow>
  <SettingRow label={t('settings.concurrency')} description={t('settings.concurrencyHint')}>
    <Segmented
      label={t('settings.concurrency')}
      size="sm"
      value={String(s.concurrency)}
      onchange={(v) => set('concurrency', Number(v))}
      options={['1', '2', '3', '4', '5'].map((n) => ({ value: n, label: n }))}
    />
  </SettingRow>
  <SettingRow label={t('settings.interval')} description={t('settings.intervalHint')}>
    <Select
      label={t('settings.interval')}
      value={s.requestIntervalMs}
      onchange={(v) => set('requestIntervalMs', v)}
      options={[1000, 1500, 2000, 3000, 5000].map((ms) => ({
        value: ms,
        label: t('settings.seconds', { count: ms / 1000 }),
      }))}
    />
  </SettingRow>
  <SettingRow label={t('settings.retries')} description={t('settings.retriesHint')}>
    <Select
      label={t('settings.retries')}
      value={s.maxRetries}
      onchange={(v) => set('maxRetries', v)}
      options={[0, 1, 2, 3, 5, 8, 10, 15, 20].map((n) => ({ value: n, label: String(n) }))}
    />
  </SettingRow>
  <SettingRow label={t('settings.conflict')}>
    <Select
      label={t('settings.conflict')}
      value={s.conflictAction}
      onchange={(v) => set('conflictAction', v)}
      options={[
        { value: 'uniquify', label: t('conflict.uniquify') },
        { value: 'overwrite', label: t('conflict.overwrite') },
        { value: 'prompt', label: t('conflict.prompt') },
      ]}
    />
  </SettingRow>
  <SettingRow label={t('settings.skipDownloaded')} description={t('settings.skipDownloadedHint')}>
    <Switch
      label={t('settings.skipDownloaded')}
      checked={s.skipDownloaded}
      onchange={(v) => set('skipDownloaded', v)}
    />
  </SettingRow>
  <SettingRow label={t('settings.previewOnly')} description={t('settings.previewOnlyHint')}>
    <Select
      label={t('settings.previewOnly')}
      value={s.previewOnly}
      onchange={(v) => set('previewOnly', v)}
      options={[
        { value: 'relay', label: t('preview.relay') },
        { value: 'thumbnail', label: t('preview.thumbnail') },
        { value: 'skip', label: t('preview.skip') },
      ]}
    />
  </SettingRow>
  <SettingRow label={t('settings.content')} description={t('settings.contentHint')}>
    <Select
      label={t('settings.content')}
      value={s.saveContent}
      onchange={(v) => set('saveContent', v)}
      options={[
        { value: 'none', label: t('content.none') },
        { value: 'txt', label: t('content.txt') },
        { value: 'html', label: t('content.html') },
        { value: 'both', label: t('content.both') },
      ]}
    />
  </SettingRow>
  <SettingRow label={t('settings.metadata')} description={t('settings.metadataHint')}>
    <Switch
      label={t('settings.metadata')}
      checked={s.saveMetadata}
      onchange={(v) => set('saveMetadata', v)}
    />
  </SettingRow>
  <SettingRow label={t('settings.categories')} description={t('settings.categoriesHint')} stacked>
    <div class="chips">
      {#each FILE_CATEGORIES as category (category)}
        <Chip
          label={t(`category.${category}`)}
          active={s.categories[category]}
          onclick={() =>
            set('categories', { ...s.categories, [category]: !s.categories[category] })}
        />
      {/each}
    </div>
  </SettingRow>
</SettingSection>

<SettingSection
  id="s-naming"
  icon="rename"
  title={t('settings.naming')}
  description={t('settings.namingHint')}
>
  <SettingRow label={t('settings.folderTemplate')} stacked>
    <TemplateField
      kind="folder"
      label={t('settings.folderTemplate')}
      value={s.folderTemplate}
      presets={FOLDER_TEMPLATE_PRESETS}
      onsave={(v) => set('folderTemplate', v)}
    />
  </SettingRow>
  <SettingRow label={t('settings.fileTemplate')} stacked>
    <TemplateField
      kind="file"
      label={t('settings.fileTemplate')}
      value={s.fileTemplate}
      presets={FILE_TEMPLATE_PRESETS}
      onsave={(v) => set('fileTemplate', v)}
    />
  </SettingRow>
  <SettingRow label={t('settings.archiveTemplate')} stacked>
    <TemplateField
      kind="file"
      label={t('settings.archiveTemplate')}
      value={s.archiveTemplate}
      presets={{ default: DEFAULT_SETTINGS.archiveTemplate, short: '{post_id}' }}
      onsave={(v) => set('archiveTemplate', v)}
    />
  </SettingRow>
  <div class="example">
    <span class="faint">{t('settings.example')}</span>
    <code>{example}</code>
    <code>{archiveExample}</code>
  </div>
</SettingSection>

<SettingSection
  id="s-zip"
  icon="folderZip"
  title={t('settings.zip')}
  description={t('settings.zipHint')}
>
  <SettingRow label={t('settings.zipMax')} description={t('settings.zipMaxHint')}>
    <Select
      label={t('settings.zipMax')}
      value={s.zipMaxSizeMb}
      onchange={(v) => set('zipMaxSizeMb', v)}
      options={[500, 1024, 2048, 3900].map((n) => ({ value: n, label: MB(n) }))}
    />
  </SettingRow>
  <SettingRow label={t('settings.zipVideos')} description={t('settings.zipVideosHint')}>
    <Switch
      label={t('settings.zipVideos')}
      checked={s.zipVideosSeparately}
      onchange={(v) => set('zipVideosSeparately', v)}
    />
  </SettingRow>
  <SettingRow label={t('settings.zipSeparate')} description={t('settings.zipSeparateHint')}>
    <Select
      label={t('settings.zipSeparate')}
      value={s.zipSeparateOverMb}
      onchange={(v) => set('zipSeparateOverMb', v)}
      options={[100, 300, 500, 1024, 2048].map((n) => ({ value: n, label: MB(n) }))}
    />
  </SettingRow>
</SettingSection>

<SettingSection id="s-page" icon="web" title={t('settings.page')}>
  <SettingRow label={t('settings.floatingButton')} description={t('settings.floatingButtonHint')}>
    <Switch
      label={t('settings.floatingButton')}
      checked={s.showFloatingButton}
      onchange={(v) => set('showFloatingButton', v)}
    />
  </SettingRow>
  <SettingRow label={t('settings.corner')}>
    <Select
      label={t('settings.corner')}
      value={s.buttonCorner}
      onchange={(v) => set('buttonCorner', v)}
      options={(['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const).map((c) => ({
        value: c,
        label: t(`corner.${c}`),
      }))}
    />
  </SettingRow>
  <SettingRow label={t('settings.panelSide')}>
    <Segmented
      label={t('settings.panelSide')}
      size="sm"
      value={s.panelSide}
      onchange={(v) => set('panelSide', v)}
      options={[
        { value: 'left', label: t('side.left') },
        { value: 'right', label: t('side.right') },
      ]}
    />
  </SettingRow>
  <SettingRow label={t('settings.cardSelectors')} description={t('settings.cardSelectorsHint')}>
    <Switch
      label={t('settings.cardSelectors')}
      checked={s.cardSelectors}
      onchange={(v) => set('cardSelectors', v)}
    />
  </SettingRow>
  <SettingRow label={t('settings.markDownloaded')} description={t('settings.markDownloadedHint')}>
    <Switch
      label={t('settings.markDownloaded')}
      checked={s.markDownloaded}
      onchange={(v) => set('markDownloaded', v)}
    />
  </SettingRow>
</SettingSection>

<SettingSection id="s-background" icon="bell" title={t('settings.background')}>
  <SettingRow label={t('settings.notifications')}>
    <Select
      label={t('settings.notifications')}
      value={s.notifications}
      onchange={(v) => set('notifications', v)}
      options={[
        { value: 'all', label: t('notify.all') },
        { value: 'errors', label: t('notify.errors') },
        { value: 'none', label: t('notify.none') },
      ]}
    />
  </SettingRow>
  <SettingRow label={t('settings.watchInterval')} description={t('settings.watchIntervalHint')}>
    <Select
      label={t('settings.watchInterval')}
      value={s.watchIntervalMinutes}
      onchange={(v) => set('watchIntervalMinutes', v)}
      options={WATCH_INTERVALS.map((n) => ({ value: n, label: t(`interval.${n}`) }))}
    />
  </SettingRow>
  <SettingRow label={t('settings.recordHistory')} description={t('settings.recordHistoryHint')}>
    <Switch
      label={t('settings.recordHistory')}
      checked={s.recordHistory}
      onchange={(v) => set('recordHistory', v)}
    />
  </SettingRow>
</SettingSection>

<SettingSection
  id="s-shortcuts"
  icon="keyboard"
  title={t('settings.shortcuts')}
  description={t('settings.shortcutsHint')}
>
  {#each commands.filter((c) => c.name && !c.name.startsWith('_')) as command (command.name)}
    <SettingRow label={t(`shortcut.${command.name}`)}>
      {#if command.shortcut}
        <span class="keys"
          >{#each command.shortcut.split('+') as key, i (i)}<kbd>{key}</kbd>{/each}</span
        >
      {:else}
        <span class="faint">{t('settings.noShortcut')}</span>
      {/if}
    </SettingRow>
  {/each}
  <SettingRow label={t('settings.changeShortcuts')}>
    <Button size="sm" icon="external" onclick={openShortcuts}>{t('settings.openShortcuts')}</Button>
  </SettingRow>
</SettingSection>

<SettingSection id="s-data" icon="database" title={t('settings.data')}>
  <SettingRow label={t('settings.exportSettings')} description={t('settings.exportHint')}>
    <Button
      size="sm"
      icon="export"
      onclick={() =>
        saveTextFile(
          `pawchive-downloader-settings-${stamp()}.json`,
          exportSettings(s),
          'application/json',
        )}>{t('common.export')}</Button
    >
    <Button size="sm" icon="import" onclick={importFile}>{t('common.import')}</Button>
  </SettingRow>
  <SettingRow label={t('settings.reset')} description={t('settings.resetHint')}>
    <Button size="sm" variant="danger" icon="restore" onclick={() => (resetOpen = true)}
      >{t('settings.reset')}</Button
    >
  </SettingRow>
</SettingSection>

<Dialog
  open={resetOpen}
  title={t('settings.resetTitle')}
  confirmLabel={t('settings.reset')}
  danger
  onconfirm={reset}
  oncancel={() => (resetOpen = false)}
>
  <p>{t('settings.resetBody')}</p>
</Dialog>

<style>
  .jump {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 8px 0 14px;
    margin-bottom: 8px;
    background: linear-gradient(var(--bg) 80%, transparent);
  }
  .jump a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 99px;
    color: var(--text-dim);
    font-size: var(--fs-sm);
    font-weight: 600;
    border: 1px solid var(--border);
    background: var(--bg-elev);
    text-decoration: none;
    transition:
      color var(--dur-fast) var(--ease),
      border-color var(--dur-fast) var(--ease);
  }
  .jump a:hover {
    color: var(--text);
    border-color: var(--border-strong);
  }
  .access {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    margin-bottom: 20px;
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--warning) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--warning) 26%, transparent);
  }
  .access span {
    flex: 1;
  }
  .themes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
    gap: 10px;
  }
  .theme-swatch {
    display: grid;
    gap: 8px;
    padding: 8px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg-elev-2);
    color: var(--text-dim);
    font-size: var(--fs-sm);
    font-weight: 600;
    text-align: left;
    transition:
      border-color var(--dur-fast) var(--ease),
      transform var(--dur) var(--ease-spring);
  }
  .theme-swatch:hover {
    border-color: var(--border-strong);
    transform: translateY(-1px);
  }
  .theme-swatch.active {
    border-color: var(--accent);
    color: var(--text);
    box-shadow: 0 0 0 1px var(--accent) inset;
  }
  .preview {
    display: grid;
    grid-template-columns: 1fr 2fr;
    grid-template-rows: 1fr 1fr;
    gap: 4px;
    height: 48px;
    padding: 5px;
    border-radius: 7px;
    background: var(--p-bg);
    border: 1px solid var(--p-border);
  }
  .preview span {
    border-radius: 4px;
    background: var(--p-elev);
  }
  .preview span:first-child {
    grid-row: span 2;
  }
  .preview span:last-child {
    background: var(--accent);
    opacity: 0.85;
  }
  [data-preview='midnight'] {
    --p-bg: #0c0e13;
    --p-elev: #1f2430;
    --p-border: #232937;
  }
  [data-preview='graphite'] {
    --p-bg: #111;
    --p-elev: #262626;
    --p-border: #2b2b2b;
  }
  [data-preview='plum'] {
    --p-bg: #120d18;
    --p-elev: #282033;
    --p-border: #2e2439;
  }
  [data-preview='forest'] {
    --p-bg: #0b110e;
    --p-elev: #1c2a23;
    --p-border: #22302a;
  }
  [data-preview='ember'] {
    --p-bg: #130e0c;
    --p-elev: #2b201a;
    --p-border: #33261f;
  }
  [data-preview='light'] {
    --p-bg: #f6f7fb;
    --p-elev: #e8ebf2;
    --p-border: #e1e5ee;
  }
  [data-preview='system'] {
    --p-bg: linear-gradient(135deg, #0c0e13 50%, #f6f7fb 50%);
    --p-elev: #8888;
    --p-border: #303849;
  }
  .accents {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .accent {
    position: relative;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 0;
    background: var(--c);
    padding: 0;
    box-shadow: 0 0 0 2px var(--bg-elev);
    transition:
      transform var(--dur) var(--ease-spring),
      box-shadow var(--dur-fast) var(--ease);
  }
  .accent:hover {
    transform: scale(1.12);
  }
  .accent.active {
    box-shadow:
      0 0 0 2px var(--bg-elev),
      0 0 0 4px var(--c);
  }
  .custom {
    display: grid;
    place-items: center;
    background: var(--bg-elev-3);
    color: var(--text-dim);
    cursor: pointer;
    border: 1px dashed var(--border-strong);
  }
  .custom input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .example {
    display: grid;
    gap: 6px;
    padding: 14px 18px;
    background: var(--bg);
    font-size: var(--fs-sm);
  }
  code {
    font-family: var(--font);
    color: var(--accent-strong);
    word-break: break-all;
  }
  .keys {
    display: inline-flex;
    gap: 4px;
  }
  kbd {
    font-family: var(--font);
    font-size: var(--fs-xs);
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 6px;
    background: var(--bg-elev-3);
    border: 1px solid var(--border-strong);
    border-bottom-width: 2px;
  }
</style>
