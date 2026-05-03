/// <reference lib="webworker" />
/**
 * Serwist service worker: precache + `defaultCache` (Next RSC/static runtime).
 * Live site / PWA + Capacitor remote-URL WebView: pehli online visit ke baad shell offline available.
 * `STATIC_BUILD=1` export bhi SW bundle karta — `out/` HTTPS host ya Capacitor `webDir` PWA shells precache ho.
 *
 * **`defaultCache`** HTML/document ke liye `NetworkFirst` use karta — airplane mode Android WebView me navigate
 * pehle network try karke `fallbacks → /~offline` jaldi pakad leta hai.
 * **`StaleWhileRevalidate` + navigate** prepend: offline pe **cached shell** turant mile (fresh tab online flush).
 */
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, ExpirationPlugin, StaleWhileRevalidate } from "serwist";
import { defaultCache } from "@serwist/next/worker";

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
  /** `true` kabhi‑kabhi preload response fail hone par offline navigate `~offline` fallback de deta (Capacitor WebView). */
  navigationPreload: false,
  runtimeCaching: [
    {
      matcher: ({ request, sameOrigin }) =>
        Boolean(sameOrigin && request.mode === "navigate"),
      handler: new StaleWhileRevalidate({
        cacheName: "pl-navigate-shell",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 64,
            maxAgeSeconds: 7 * 24 * 60 * 60,
            maxAgeFrom: "last-used",
          }),
        ],
      }),
    },
    ...defaultCache,
  ],
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
