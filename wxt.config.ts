import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Screenshot Editor Pro',
    description: 'Capture & edit screenshots with visible page, select area, and full page modes',
    version: '1.1.0',
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      96: 'icon/96.png',
      128: 'icon/128.png',
    },
    permissions: ['activeTab', 'tabs', 'storage', 'downloads', 'scripting', 'unlimitedStorage'],
    host_permissions: ['<all_urls>'],
  },
});
