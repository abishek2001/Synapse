import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack config (Next.js 16 default bundler)
  turbopack: {
    resolveAlias: {
      // Prevent the Node.js ONNX binding from being bundled in the browser.
      // kokoro-js uses onnxruntime-web (WASM) on the client.
      "onnxruntime-node": "@/lib/voice/empty-module",
      "sharp": "@/lib/voice/empty-module",
    },
  },
  // Webpack fallback (next build --webpack / CI)
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "onnxruntime-node$": false,
      "sharp$": false,
    };
    return config;
  },
};

export default nextConfig;
