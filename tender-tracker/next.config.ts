import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // Pin workspace root to silence multi-lockfile warning
  // (a parent package-lock.json exists at ~/codes/).
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
