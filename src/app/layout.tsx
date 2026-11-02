import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "ADMS FOR HR MANAGMENT — الموارد البشرية والحضور والرواتب",
  description:
    "ADMS FOR HR MANAGMENT — نظام متكامل لإدارة الموارد البشرية والحضور والرواتب بالدينار الكويتي، متوافق مع أجهزة ZKTeco عبر ADMS: بصمة أون لاين ومحلية، ورديات، إجازات، رواتب وتقارير.",
  icons: { icon: "/logo.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1F8A70",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        {children}
        <Toaster richColors position="bottom-left" />
      </body>
    </html>
  );
}
