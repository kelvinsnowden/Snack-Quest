import { defineConfig } from 'vitest/config';
import base from '../../vitest.config';

/**
 * Runs only the measurement seed (scripts/perf/seed.ts) against the emulator.
 * Built by hand rather than with mergeConfig, which would append to the
 * base `include` and run the whole test suite (and its clean-ups) too.
 */
export default defineConfig({ ...base, test: { ...base.test, include: ['scripts/perf/seed.ts'], testTimeout: 600_000 } });
