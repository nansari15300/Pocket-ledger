
import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { Providers } from './providers';
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

/** CDN fonts hata kar bundle + `swap` — pehla load par 20s+ jaisi block kam (slow Google Fonts / dns) */
const fontInter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});
const fontSpaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Pocket Ledger',
  description: 'Modern Accounting Software',
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
    <html lang="en" className={`${fontInter.variable} ${fontSpaceGrotesk.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
        <meta name="color-scheme" content="light only" />
        <meta name="theme-color" content="#f1f5f9" />
      </head>
      <body className="font-body antialiased">
        <Providers>
          {children}
        </Providers>
        <Toaster />
        <SonnerToaster />
      </body>
    </html>
  );
}
