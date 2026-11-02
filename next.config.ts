import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone للتشغيل المحلي فقط — على Vercel نستخدم مخرجات Next القياسية
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  /* مكتبات سيرفر خارجية: بروتوكول أجهزة ZKTeco المحلية (net/dgram) + Prisma */
  serverExternalPackages: ["node-zklib", "@prisma/client", "@prisma/extension-accelerate"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
