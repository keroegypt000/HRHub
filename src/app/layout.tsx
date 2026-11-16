import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { I18nBoot } from "@/components/hrhub/language";

// يضبط الاتجاه قبل الرسم لو المستخدم اختار الإنجليزية (بدون وميض للنص العربي)
const LANG_BOOT = `try{if(localStorage.getItem('hrhub-lang')==='en'){var h=document.documentElement;h.lang='en';h.dir='ltr';h.setAttribute('data-i18n','pending');setTimeout(function(){h.removeAttribute('data-i18n')},1500)}}catch(e){}`;

export const metadata: Metadata = {
  title: "HRHub",
  description: "نظام إدارة الموارد البشرية والحضور بالبصمة والرواتب",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "بوابة الموظف", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#059669",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LANG_BOOT }} />
      </head>
      <body className="antialiased bg-background text-foreground">
        <I18nBoot />
        {children}
        <Toaster richColors position="bottom-left" />
      </body>
    </html>
  );
}
