// Stub for the `server-only` package (which unconditionally throws
// outside Next.js's bundler — it relies on webpack aliasing it away in
// server bundles, a mechanism Vitest doesn't have). Aliased in here via
// vitest.config.ts so Repository/Service modules that import
// `server-only` can be unit-tested directly; Next.js's own build still
// uses the real package and still enforces the boundary.
export {};
