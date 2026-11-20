import { mount, unmount } from 'svelte';
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import type { TabMessage } from '../../lib/messages';
import { installFonts } from '../../ui/styles/fonts';
import { startApp } from '../../ui/state/app.svelte';
import { page, setUrl } from './page.svelte';
import { panel } from './panel';
import App from './App.svelte';
import '../../ui/styles/theme.css';
import '../../ui/styles/base.css';

export default defineContentScript({
  // Every page domain of Pawchive, Kemono and Coomer (kept in step with
  // SITE_PAGE_MATCHES in lib/pawchive/sites.ts; a test checks they agree).
  matches: [
    'https://pawchive.pw/*',
    'https://www.pawchive.pw/*',
    'https://kemono.cr/*',
    'https://www.kemono.cr/*',
    'https://kemono.su/*',
    'https://www.kemono.su/*',
    'https://kemono.party/*',
    'https://www.kemono.party/*',
    'https://coomer.st/*',
    'https://www.coomer.st/*',
    'https://coomer.su/*',
    'https://www.coomer.su/*',
    'https://coomer.party/*',
    'https://www.coomer.party/*',
  ],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    installFonts(document, (path) => browser.runtime.getURL(path as '/'));
    await startApp();

    const ui = await createShadowRootUi(ctx, {
      name: 'pawchive-downloader',
      position: 'inline',
      anchor: 'body',
      append: 'last',
      isolateEvents: ['keydown', 'keyup', 'keypress', 'wheel'],
      onMount(container) {
        container.classList.add('pdl-root');
        return mount(App, { target: container });
      },
      onRemove(app) {
        if (app) void unmount(app);
      },
    });
    ui.mount();

    // The site is mostly server rendered, but follow history changes too.
    ctx.addEventListener(window, 'wxt:locationchange', ({ newUrl }) => setUrl(newUrl.href));

    browser.runtime.onMessage.addListener((message: unknown) => {
      const msg = message as TabMessage;
      if (msg.type === 'panel:toggle') page.panelOpen = !page.panelOpen;
      else if (msg.type === 'panel:open') page.panelOpen = true;
      else if (msg.type === 'panel:quick-download') {
        page.panelOpen = true;
        panel.quickDownload?.();
      }
      return undefined;
    });
  },
});
