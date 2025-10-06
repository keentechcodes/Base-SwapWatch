/**
 * Configuration for the application
 * Compatible with both local development and Cloudflare Pages edge runtime
 */

// Helper to get environment variables that work in edge runtime
function getEnvVar(key: string, defaultValue?: string): string {
  // In Cloudflare Pages, env vars are available as globals
  if (typeof globalThis !== 'undefined' && key in globalThis) {
    return (globalThis as any)[key];
  }

  // In development/Node.js environments
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || defaultValue || '';
  }

  // Fallback to default
  return defaultValue || '';
}

export const config = {
  // API Configuration
  api: {
    url: getEnvVar('NEXT_PUBLIC_API_URL', 'https://api.swapwatch.app'),
    wsUrl: getEnvVar('NEXT_PUBLIC_WS_URL', 'wss://api.swapwatch.app'),
  },

  // App Configuration
  app: {
    name: getEnvVar('NEXT_PUBLIC_APP_NAME', 'SwapWatch'),
    environment: getEnvVar('NODE_ENV', 'production'),
  },

  // Feature flags
  features: {
    isDevelopment: getEnvVar('NODE_ENV', 'production') === 'development',
    isProduction: getEnvVar('NODE_ENV', 'production') === 'production',
  },
};

// Export individual config values for convenience
export const API_URL = config.api.url;
export const WS_URL = config.api.wsUrl;
export const APP_NAME = config.app.name;
export const IS_DEVELOPMENT = config.features.isDevelopment;
export const IS_PRODUCTION = config.features.isProduction;