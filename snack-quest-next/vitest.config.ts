import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The whole suite only ever runs via `firebase emulators:exec` (see
    // package.json `test` script) — safe to default every test to
    // emulator mode so Admin SDK-backed repository tests don't each
    // need their own env setup.
    env: { NEXT_PUBLIC_USE_FIREBASE_EMULATOR: 'true' },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
});
