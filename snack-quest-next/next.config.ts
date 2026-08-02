import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The parent Snack-Quest repo also has a package-lock.json, which makes
  // Next.js misdetect the workspace root. Pin it explicitly to this
  // project's own directory.
  //
  // Deliberately NOT also setting `outputFileTracingRoot` here to match:
  // Vercel injects its own value (`/vercel/path0`) via its post-build
  // "Deploying outputs" step, which needs that exact value to locate
  // `.next/package.json` when assembling serverless functions — an
  // explicit override here works fine for `next build` itself (which
  // silences the "must have the same value" warning) but breaks that
  // later Vercel-only step with `ENOENT: .next/package.json`, since the
  // two roots then genuinely disagree on Vercel's own infrastructure.
  // The warning is cosmetic; a broken deploy is not — leave this unset
  // and let Vercel's own value win, same as it already does today.
  turbopack: {
    root: path.join(__dirname),
  },
  // firebase-admin/auth statically imports jwks-rsa, which depends on
  // jose@6 (pure ESM — "type": "module"). firebase-admin is already on
  // Next's default serverExternalPackages list, but that alone doesn't
  // stop Turbopack's production Lambda bundle from also trying to
  // statically bundle jwks-rsa/jose, which fails at runtime with
  // `ERR_REQUIRE_ESM` the moment any route imports firebase-admin/auth
  // (i.e. nearly every route, via lib/firebase/admin.ts) — confirmed
  // live in production via Vercel's runtime error reporting. Explicitly
  // externalizing the whole chain forces real Node.js require()/import()
  // at runtime instead, where ESM/CJS interop actually works correctly.
  serverExternalPackages: ['firebase-admin', 'jwks-rsa', 'jose'],
  images: {
    // Every uploaded image (snack/box photos, storage browser) lives in
    // Vercel Blob (services/storageService.ts) at
    // https://<store-id>.public.blob.vercel-storage.com/... — the store
    // id is fixed per deployment but not known at config time, hence the
    // wildcard. This lets next/image actually optimize marketing-site box
    // images instead of the `unoptimized` escape hatch other surfaces use.
    remotePatterns: [{ protocol: 'https', hostname: '*.public.blob.vercel-storage.com' }],
  },
};

export default nextConfig;
