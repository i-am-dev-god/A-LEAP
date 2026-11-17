/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
