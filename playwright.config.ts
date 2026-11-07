import { defineConfig } from '@playwright/test';

// Editor tests in browser mode (web platform, in-memory files).
// Native features (menus, dialogs, Finder) cannot be tested here.
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:1430',
    viewport: { width: 1100, height: 900 },
  },
  webServer: {
    command: 'pnpm web',
    url: 'http://localhost:1430',
    reuseExistingServer: true,
  },
});
