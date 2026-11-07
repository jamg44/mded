import { defineConfig } from 'vitest/config';

// TAURI_DEV_HOST is only used for mobile development
const host = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
  .TAURI_DEV_HOST;

export default defineConfig({
  // Don't hide Rust errors in the terminal
  clearScreen: false,
  server: {
    // Tauri expects a fixed port
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
