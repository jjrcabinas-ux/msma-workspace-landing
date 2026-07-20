import type { NextConfig } from 'next';

// Static export served by Firebase Hosting at msma.work/app — same URL and
// hosting as the old single-file app.html, no server needed.
const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/app',
  images: { unoptimized: true },
};

export default nextConfig;
