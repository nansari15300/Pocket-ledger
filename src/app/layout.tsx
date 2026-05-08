
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { Providers } from './providers';
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { PocketSerwistProvider } from "@/components/serwist/PocketSerwistProvider";

export const metadata: Metadata = {
  applicationName: 'Pocket Ledger',
  title: 'Pocket Ledger',
  description: 'Modern Accounting Software',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Pocket Ledger',
  },
  // Browser tab / bookmark / PWA: same asset as Electron `public/app-icon.png` (EXE icon)
  icons: {
    icon: [{ url: '/app-icon.png', type: 'image/png' }],
    apple: '/app-icon.png',
    shortcut: '/app-icon.png',
  },
};

/** WebView/APK: light-only declare + `theme-color` dark (#0f172a) kabhi document ko "dark" hint de kar Samsung WebView tint alag kar deta tha */
export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f1f5f9',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
        <meta name="color-scheme" content="light only" />
        <meta name="theme-color" content="#f1f5f9" />
      </head>
      <body className="font-body antialiased">
        <PocketSerwistProvider>
          <Providers>
            {children}
          </Providers>
        </PocketSerwistProvider>
        <Toaster />
        <SonnerToaster />
      </body>
    </html>
  );
}
