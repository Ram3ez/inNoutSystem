import type { Metadata } from "next";

/**
 * Root Layout
 * Configures the base HTML structure, metadata, PWA settings, and global context providers.
 * Includes ThemeProvider, AuthProvider, and OfflineSyncManager.
 */

import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { LoadingProvider } from "@/context/LoadingContext";
import { OfflineSyncManager } from "@/components/OfflineSyncManager";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "NITPY Hostel System",
  description: "Advanced biometric hostel management system",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NITPY Hostel",
    startupImage: [
      {
        url: "/logo.webp",
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
      { url: "/logo.webp" },
      { url: "/logo.webp", sizes: "32x32", type: "image/webp" },
    ],
    apple: [
      { url: "/logo.webp" },
      { url: "/logo.webp", sizes: "152x152", type: "image/webp" },
      { url: "/logo.webp", sizes: "180x180", type: "image/webp" },
      { url: "/logo.webp", sizes: "167x167", type: "image/webp" },
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
          {/* 
              LoadingProvider must be outside of AuthProvider because 
              AuthProvider now triggers global progress indicators during pre-loading.
          */}
          <Suspense fallback={null}>
            <LoadingProvider>
              <AuthProvider>
                {children}
                {/* 
                    Subtle brand signature footer.
                    Visible only after scrolling and designed to be non-obtrusive.
                */}
                <footer className="w-full py-10 mt-auto text-center opacity-[0.35] md:opacity-[0.3] transition-opacity hover:opacity-100 select-none px-6">
                  <div className="flex flex-col md:flex-row items-center justify-center gap-1 md:gap-0 text-[9px] font-black tracking-[0.2em] uppercase text-primary/80">
                    <a
                      href="https://www.github.com/Ram3ez"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-secondary transition-colors"
                    >
                      Rameez Mohammad
                    </a>
                    <span className="hidden md:inline mx-3 text-primary/30">
                      |
                    </span>
                    <a
                      href="https://www.nitpy.ac.in"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-secondary transition-colors underline decoration-primary/20 underline-offset-4 md:no-underline"
                    >
                      National Institute of Technology, Puducherry
                    </a>
                  </div>
                </footer>
                <OfflineSyncManager />
              </AuthProvider>
            </LoadingProvider>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
