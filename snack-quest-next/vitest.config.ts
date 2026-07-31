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
    // Every integration test file shares one Firestore emulator instance
    // and cleans/writes tenant data in global collections (conversations,
    // businesses, packages, ...) scoped by businessId, not by test file.
    // Running files in parallel lets one file's `beforeEach` cleanup race
    // another file's in-flight writes on those same collections — disable
    // file parallelism so the suite is deterministic against the one
    // shared emulator.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
});
