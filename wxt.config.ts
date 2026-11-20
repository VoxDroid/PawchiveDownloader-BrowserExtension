import { defineConfig } from 'wxt';
import { SITE_MATCHES, SITE_PAGE_MATCHES } from './src/lib/pawchive/sites';

/** Pawchive, Kemono and Coomer, current and old domains, with their media servers. */
const HOSTS = [...SITE_MATCHES];

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  imports: false,
  manifestVersion: 3,
  targetBrowsers: ['chrome', 'firefox', 'edge'],
  zip: {
    artifactTemplate: 'pawchive-downloader-{{version}}-{{browser}}.zip',
    sourcesTemplate: 'pawchive-downloader-{{version}}-sources.zip',
    excludeSources: ['tests/**', 'coverage/**', 'playwright-report/**', 'test-results/**'],
  },
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    short_name: 'PawchiveDL',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    author: 'VoxDroid',
    homepage_url: 'https://github.com/VoxDroid/PawchiveDownloader-BrowserExtension',
    permissions: [
      'downloads',
      'storage',
      'unlimitedStorage',
      'contextMenus',
      'notifications',
      'alarms',
      ...(browser === 'firefox' ? [] : ['offscreen']),
    ],
    host_permissions: HOSTS,
    web_accessible_resources: [
      {
        resources: ['fonts/*.woff2', 'icon/*.png'],
        matches: [...SITE_PAGE_MATCHES],
      },
    ],
    action: {
      default_title: '__MSG_extName__',
    },
    commands: {
      'toggle-panel': {
        suggested_key: { default: 'Alt+Shift+D' },
        description: '__MSG_cmdTogglePanel__',
      },
      'download-page': {
        suggested_key: { default: 'Alt+Shift+A' },
        description: '__MSG_cmdDownloadPage__',
      },
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko_android: { strict_min_version: '142.0' },
            gecko: {
              id: 'pawchive-downloader@voxdroid.github.io',
              strict_min_version: '140.0',
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : { minimum_chrome_version: '116' }),
  }),
});
