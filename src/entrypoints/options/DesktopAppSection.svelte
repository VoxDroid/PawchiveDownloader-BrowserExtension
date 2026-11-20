<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import type { BridgeStatus } from '../../lib/bridge';
  import { call } from '../../lib/messages';
  import { app, t, updateSettings } from '../../ui/state/app.svelte';
  import { toast } from '../../ui/state/toasts.svelte';
  import Button from '../../ui/components/Button.svelte';
  import Icon from '../../ui/components/Icon.svelte';
  import Switch from '../../ui/components/Switch.svelte';
  import TextInput from '../../ui/components/TextInput.svelte';
  import SettingRow from './SettingRow.svelte';
  import SettingSection from './SettingSection.svelte';

  const APP_URL = 'https://github.com/VoxDroid/PawchiveDownloader';

  let status = $state<(BridgeStatus & { pairedAt: number | null }) | null>(null);
  let code = $state('');
  let busy = $state(false);
  let checking = $state(false);

  async function refresh() {
    checking = true;
    status = await call('bridge:status').catch(() => null);
    checking = false;
  }

  async function pair() {
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) {
      toast(t('bridge.badCode'), 'error');
      return;
    }
    busy = true;
    // Asked for during the click: access to the app's port on this computer.
    await browser.permissions.request({ origins: ['http://127.0.0.1/*'] }).catch(() => false);
    const result = await call('bridge:pair', { code: digits }).catch(() => null);
    busy = false;
    if (result?.ok) {
      code = '';
      toast(t('bridge.paired'), 'success');
    } else if (result?.code === 'bad-code') toast(t('bridge.badCode'), 'error');
    else toast(t('bridge.notRunning'), 'error');
    await refresh();
  }

  async function unpair() {
    await call('bridge:unpair');
    if (app.settings.sendToApp) await updateSettings({ sendToApp: false });
    await refresh();
  }

  onMount(() => void refresh());
</script>

<SettingSection id="s-app" icon="link" title={t('settings.app')} description={t('bridge.hint')}>
  <div class="status" class:ok={status?.paired} aria-live="polite">
    <Icon name={status?.paired ? 'check' : status?.running ? 'link' : 'close'} />
    <span>
      {#if !status}
        {t('bridge.checking')}
      {:else if status.paired}
        {t('bridge.statusPaired', { version: status.version ?? '' })}
      {:else if status.running}
        {t('bridge.statusRunning', { version: status.version ?? '' })}
      {:else}
        {t('bridge.statusOff')}
      {/if}
    </span>
    <Button size="sm" variant="ghost" icon="retry" loading={checking} onclick={refresh}
      >{t('bridge.refresh')}</Button
    >
  </div>

  {#if status?.paired}
    <SettingRow label={t('bridge.sendToApp')} description={t('bridge.sendToAppHint')}>
      <Switch
        label={t('bridge.sendToApp')}
        checked={app.settings.sendToApp}
        onchange={(v) => void updateSettings({ sendToApp: v })}
      />
    </SettingRow>
    <SettingRow label={t('bridge.unpair')} description={t('bridge.unpairHint')}>
      <Button variant="ghost" icon="close" onclick={unpair}>{t('bridge.unpair')}</Button>
    </SettingRow>
  {:else}
    <SettingRow label={t('bridge.code')} description={t('bridge.pairSteps')} stacked>
      <div class="pair">
        <TextInput
          label={t('bridge.code')}
          placeholder="123456"
          mono
          value={code}
          oninput={(v) => (code = v)}
          onkeydown={(e) => e.key === 'Enter' && void pair()}
        />
        <Button variant="primary" icon="link" loading={busy} onclick={pair}
          >{t('bridge.pair')}</Button
        >
      </div>
    </SettingRow>
    {#if status && !status.running}
      <p class="get">
        <a href={APP_URL} target="_blank" rel="noreferrer">{t('bridge.getApp')}</a>
      </p>
    {/if}
  {/if}
</SettingSection>

<style>
  .status {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    margin-bottom: 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 10px);
    background: var(--bg-elev);
    color: var(--text-dim);
  }
  .status > span {
    flex: 1;
  }
  .status.ok {
    color: var(--text);
    border-color: color-mix(in srgb, var(--success, #3ccf91) 50%, var(--border));
  }
  .status.ok > :global(.icon) {
    color: var(--success, #3ccf91);
  }
  .pair {
    display: flex;
    gap: 8px;
    align-items: center;
    max-width: 360px;
  }
  .pair > :global(*:first-child) {
    flex: 1;
  }
  .get {
    margin: 4px 0 0;
    font-size: var(--fs-sm);
  }
</style>
