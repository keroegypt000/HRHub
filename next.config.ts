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
  // أجهزة ZKTeco القديمة تطلب نفس المسارات بامتداد .aspx
  async rewrites() {
    return [
      { source: '/iclock/cdata.aspx', destination: '/iclock/cdata' },
      { source: '/iclock/getrequest.aspx', destination: '/iclock/getrequest' },
      { source: '/iclock/devicecmd.aspx', destination: '/iclock/devicecmd' },
      { source: '/iclock/fdata.aspx', destination: '/iclock/fdata' },
    ];
  },
};

export default nextConfig;
