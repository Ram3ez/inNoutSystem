import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [
      {
        urlPattern: /\.(?:task|tflite|wasm|onnx|json|shard.*|bin)$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "ai-models-cache",
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  output: "standalone",
  // Configuration for Turbopack (used in development by default in Next.js 15+)
  // Setting this explicitly silences the webpack mismatch error
  turbopack: {
    resolveAlias: {
      // Handle the same encoding issue as the webpack config
      encoding: "false",
    },
  },
  // Allow cross-origin requests for HMR/dev resources when using a custom domain
  allowedDevOrigins: ["system.ram3ez.dev"],


  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        net: false,
        tls: false,
        child_process: false,
        readline: false,
        encoding: false,
      };
      config.resolve.alias = {
        ...config.resolve.alias,
        encoding: false,
      };
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^encoding$/,
          contextRegExp: /node-fetch/,
        }),
      );
    }
    return config;
  },
};


export default withPWA(nextConfig);
