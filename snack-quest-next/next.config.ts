import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The parent Snack-Quest repo also has a package-lock.json, which makes
  // Next.js misdetect the workspace root. Pin it explicitly to this
  // project's own directory.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
