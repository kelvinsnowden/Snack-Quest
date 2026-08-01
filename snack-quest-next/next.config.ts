import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The parent Snack-Quest repo also has a package-lock.json, which makes
  // Next.js misdetect the workspace root. Pin it explicitly to this
  // project's own directory.
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
