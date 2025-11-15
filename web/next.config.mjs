import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Disable source maps to prevent runtime errors
  productionBrowserSourceMaps: false,
  // Fix workspace root detection issue with multiple lockfiles
  // Set to the project root (gifty directory) to avoid reading C:\Users\Deborah\package.json
  outputFileTracingRoot: path.resolve(__dirname, '..'),
  // Disable file tracing for problematic paths (moved from experimental)
  outputFileTracingExcludes: {
    '*': [
      '**/node_modules/**',
      '**/.next/**',
      'C:/Users/Deborah/**',
      '**/next/dist/compiled/source-map/**',
    ],
  },
  webpack: (config, { isServer, webpack }) => {
    // Ignore optional dependencies that cause issues (both server and client)
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
      'pino-pretty': false,
    };
    
    // Ignore the private-next-instrumentation-client module (internal Next.js module)
    config.resolve.alias = {
      ...config.resolve.alias,
      'private-next-instrumentation-client': false,
    };
    
    // Prevent resolving files outside project root
    config.resolve.symlinks = false;
    config.resolve.cacheWithContext = false;
    
    // Ignore problematic package.json files outside project
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^C:\\Users\\Deborah\\package\.json$/,
      })
    );
    
    // Explicitly ignore optional dependencies using IgnorePlugin
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^@react-native-async-storage\/async-storage$/,
      })
    );
    
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^pino-pretty$/,
      })
    );
    
    // CRITICAL FIX: Create a shim for the missing source-map module
    // This prevents Next.js from crashing when it tries to require this module
    if (isServer) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^next\/dist\/compiled\/source-map$/,
          path.resolve(__dirname, 'webpack-source-map-shim.js')
        )
      );
    }
    
    return config;
  },
};

export default nextConfig;
