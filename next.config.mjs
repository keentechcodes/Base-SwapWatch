/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for @cloudflare/next-on-pages
  // Note: Edge runtime is configured per-route via `export const runtime = 'edge'`

  // Image optimization configuration for Cloudflare
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    // Use default loader for Cloudflare Pages
    loader: 'default',
    formats: ['image/avif', 'image/webp'],
  },

  // Disable server-side features not supported on edge
  typescript: {
    ignoreBuildErrors: false,
  },

  eslint: {
    ignoreDuringBuilds: false,
  },

  // Output configuration for Cloudflare Pages
  output: 'standalone',

  // Skip generating error pages during export
  skipTrailingSlashRedirect: true,
  skipMiddlewareUrlNormalize: true,

  // Webpack configuration for edge compatibility
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Ensure browser builds don't include Node.js modules
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
// Orchids restart: 1758474243997
