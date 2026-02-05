import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Screenshot Editor',
    description: 'Capture & edit screenshots with visible page, select area, and full page modes',
    version: '1.0.0',
    permissions: ['activeTab', 'tabs', 'storage', 'downloads', 'scripting'],
    host_permissions: ['<all_urls>'],
  },
});
