
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { Providers } from './providers';
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { PocketSerwistProvider } from "@/components/serwist/PocketSerwistProvider";
import { Phase1bRuntimeVerifyShim } from "@/components/Phase1bRuntimeVerifyShim";

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
      <body className="font-body antialiased theme-pro primary-pro">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var R="pl-theme-default-rev",V="2",TK="theme",PK="primaryColor";var rev=localStorage.getItem(R),t=localStorage.getItem(TK),p=localStorage.getItem(PK);if(!rev||rev!==V){if(!t||t==="theme-pure-white"){t="theme-pro";p="primary-pro";}localStorage.setItem(R,V);localStorage.setItem(TK,t);localStorage.setItem(PK,p||"primary-pro");}if(!t){t="theme-pro";p="primary-pro";}document.body.className="font-body antialiased "+t+" "+(p||"primary-pro");}catch(e){}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var C=window.Capacitor,native=C&&((C.isNativePlatform&&C.isNativePlatform())||(C.getPlatform&&/android|ios/i.test(String(C.getPlatform()))));if(!native)return;var raw=localStorage.getItem("pl_app_ui_zoom_v1"),z=raw?parseFloat(raw):1;if(!isFinite(z))z=1;z=Math.min(1.75,Math.max(0.75,Math.round(z*100)/100));var root=document.documentElement;root.dataset.plAppUiZoom=String(z);root.style.setProperty("--pl-app-ui-zoom",String(z));var ua=navigator.userAgent||"",ios=/iPhone|iPad|iPod/i.test(ua)||(/Macintosh/i.test(ua)&&navigator.maxTouchPoints>1);if(ios){if(z!==1)root.style.fontSize=(16*z)+"px";return;}if(z===1)return;root.style.zoom=String(z);root.dataset.plAppUiZoomShell="android-zoom";root.style.setProperty("--pl-screen-h","calc(100dvh / "+z+")");root.style.setProperty("--pl-screen-w","calc(100vw / "+z+")");root.style.minHeight="calc(100dvh / "+z+")";root.style.height="calc(100dvh / "+z+")";root.style.minWidth="calc(100vw / "+z+")";root.style.overflow="hidden";document.body.style.minHeight="100%";document.body.style.height="100%";document.body.style.overflow="hidden";}catch(e){}})();`,
          }}
        />
        {/* localhost static test (serve out): purana SW Firestore Listen/Write tod deta — React se pehle hatao */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var h=location.hostname;if(h!=="localhost"&&h!=="127.0.0.1")return;if(!("serviceWorker"in navigator))return;navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(x){x.unregister();});});}catch(e){}})();`,
          }}
        />
        <PocketSerwistProvider>
          <Providers>
            {children}
          </Providers>
        </PocketSerwistProvider>
        <Phase1bRuntimeVerifyShim />
        <Toaster />
        <SonnerToaster />
      </body>
    </html>
  );
}
