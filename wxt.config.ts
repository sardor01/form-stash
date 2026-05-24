import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Form Stash',
    description:
      'Capture filled form state and replay it later. A developer tool for testing forms in modern SPAs.',
    // Pinning the public key locks the extension ID to `cjjbeiebckcjahekijkemcfnplmlgjnp`,
    // which keeps the OAuth redirect URI stable across machines and reinstalls.
    // The matching private key is in `extension-signing.private.pem` (gitignored).
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxZ3PjqG6E2raugOCHhdDyHJHMcK1wnfxTrqYvMtZwpKBT/cEJIGf4JjKO67oCPonkKqXJQa15m+L/IZQ/Dr8VAg8JRylTndbFo7yFG1UJ+g0zq3pUeolj6dAiZ31rcK6IqPSbtoKd1HYH7/vWOttVE1aVLbWvl9kdRNbR+3/s+2n015BqHJZh1IqV0uZeXpjm+6LQAUWZB0uORkz0OoOK9BXBTiqmUbnoM+hBwhlPurqkaa+YPJrC0e9jlcDsY/G+/F1Uldqtv4Bejq5lslth3lOvur9Lozwxo8Ze35SA3f1rf81egkvfU0Qkzl9ZLC4lkvzXzEtHMbL+B79nfY5pwIDAQAB',
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
})
