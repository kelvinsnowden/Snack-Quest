import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../vitest.config';

/** Runs only the measurement seed (scripts/perf/seed.ts) against the emulator. */
export default mergeConfig(base, defineConfig({ test: { include: ['scripts/perf/seed.ts'], testTimeout: 600_000 } }));
