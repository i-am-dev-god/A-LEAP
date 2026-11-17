/**
 * Two delivery modes from one codebase:
 *  - default (`next build` / `next start`, e.g. Vercel): server-capable build
 *  - STATIC_EXPORT=1: fully static bundle for GitHub Pages, mounted under
 *    PAGES_BASE_PATH (project sites live at /<repo>/)
 */
const staticExport = process.env.STATIC_EXPORT === '1';
const basePath = process.env.PAGES_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  basePath: basePath || undefined,
  ...(staticExport ? { output: 'export', trailingSlash: true } : {}),
  images: { unoptimized: staticExport },
  webpack(config) {
    // GLSL is compiled at runtime, but authored as real .vert / .frag source files.
    config.module.rules.push({
      test: /\.(vert|frag|glsl)$/i,
      type: 'asset/source',
    });
    // Campus survey geometry is served straight from the bundle (no tile APIs).
    config.module.rules.push({
      test: /\.geojson$/i,
      type: 'json',
    });
    return config;
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
