import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for @cloudflare/next-on-pages
  experimental: {
    // Enable edge runtime for app directory
    runtime: 'edge',
  },

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
