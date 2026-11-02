import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* مكتبات سيرفر خارجية: بروتوكول أجهزة ZKTeco المحلية (net/dgram) */
  serverExternalPackages: ["node-zklib"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
