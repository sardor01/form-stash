import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Form Stash',
    description:
      'Capture filled form state and replay it later. A developer tool for testing forms in modern SPAs.',
    permissions: [
      'storage',
      'scripting',
      'activeTab',
      'unlimitedStorage',
      'alarms',
      'identity',
    ],
    host_permissions: ['<all_urls>'],
    action: { default_title: 'Form Stash' },
    web_accessible_resources: [
      {
        resources: ['icon/*.png'],
        matches: ['<all_urls>'],
      },
    ],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
