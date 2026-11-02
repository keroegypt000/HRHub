import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "HRHub — إدارة الموارد البشرية والحضور والرواتب",
  description:
    "نظام متكامل لإدارة الموارد البشرية والحضور والرواتب بالدينار الكويتي — بديل عربي لـ BioTime مع دعم أجهزة ZKTeco عبر ADMS",
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
