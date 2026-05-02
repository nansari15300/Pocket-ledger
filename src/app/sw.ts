/// <reference lib="webworker" />
/**
 * Serwist service worker: precache + `defaultCache` (Next RSC/static runtime).
 * Live site / PWA + Capacitor remote-URL WebView: pehli online visit ke baad shell offline available.
 * `STATIC_BUILD=1` (bundled APK export) par `next.config` se Serwist disable — yahan build include nahi hota.
 */
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
