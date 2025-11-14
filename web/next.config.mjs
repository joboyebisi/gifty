/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // Ignore optional dependencies that cause issues
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        '@react-native-async-storage/async-storage': false,
        'pino-pretty': false,
      };
    }
    
    // Ignore the private-next-instrumentation-client module (internal Next.js module)
    config.resolve.alias = {
      ...config.resolve.alias,
      'private-next-instrumentation-client': false,
    };
    
    return config;
  },
};

export default nextConfig;
