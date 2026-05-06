import type { Metadata } from "next";

/**
 * Root Layout
 * Configures the base HTML structure, metadata, PWA settings, and global context providers.
 * Includes ThemeProvider, AuthProvider, and OfflineSyncManager.
 */

import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { OfflineSyncManager } from "@/components/OfflineSyncManager";

export const metadata: Metadata = {
  title: "NITPY Hostel System",
  description: "Advanced biometric hostel management system",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NITPY Hostel",
    startupImage: [
      {
        url: "/logo.png",
        media:
          "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)",
      },
    ],
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/logo.png" },
      { url: "/logo.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/logo.png" },
      { url: "/logo.png", sizes: "152x152", type: "image/png" },
      { url: "/logo.png", sizes: "180x180", type: "image/png" },
      { url: "/logo.png", sizes: "167x167", type: "image/png" },
    ],
  },
};

export const viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="bg-background text-foreground min-h-full flex flex-col">
        <ThemeProvider>
          <AuthProvider>
            {children}
            <footer className="w-full py-10 mt-auto text-center opacity-[0.1] pointer-events-none select-none">
              <p className="text-[10px] font-black tracking-[0.5em] uppercase text-primary">
                built by Rameez
              </p>
            </footer>
            <OfflineSyncManager />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
