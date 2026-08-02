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
