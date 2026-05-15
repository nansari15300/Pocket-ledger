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
import { Serwist, ExpirationPlugin, StaleWhileRevalidate, NetworkOnly } from "serwist";
import { defaultCache } from "@serwist/next/worker";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * `defaultCache` (Serwist/Next) antima `!sameOrigin` + `NetworkFirst` + cache plugins rakhta —
 * Firebase Storage / Firestore jasta cross-origin requests yahi intercept hokar noisy `no-response` / CORS
 * console flood karta. In hosts ko **pehle** plain `NetworkOnly` se handle karo (cache mat chipka).
 */
function isFirebaseOrGoogleCloudSdkHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "firebasestorage.googleapis.com" ||
    h === "storage.googleapis.com" ||
    h.endsWith(".firebasestorage.app") ||
    h === "firestore.googleapis.com" ||
    h === "identitytoolkit.googleapis.com" ||
    h === "securetoken.googleapis.com" ||
    h === "firebaseinstallations.googleapis.com" ||
    h === "oauth2.googleapis.com" ||
    h === "play.googleapis.com"
  );
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // `skipWaiting: true` naya SW activate hote hi purane tab control le leta — APK/Capacitor me online aane par navigate/shell mismatch se “restart” feel aata tha.
  skipWaiting: false,
  // Reconnect/update par open clients turant claim karne se app "refresh/restart" feel de sakta hai; manual next navigation par takeover hone do.
  clientsClaim: false,
  /** `true` kabhi‑kabhi preload response fail hone par offline navigate `~offline` fallback de deta (Capacitor WebView). */
  navigationPreload: false,
  runtimeCaching: [
    {
      matcher: ({ url }) => isFirebaseOrGoogleCloudSdkHost(url.hostname),
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ url, sameOrigin }) =>
        Boolean(sameOrigin && url.pathname.endsWith("/pdf.worker.min.mjs")),
      handler: new NetworkOnly(),
    },
    {
      // Next.js App Router Flight / `_rsc` — `defaultCache` intercept se `GET …/__next.….txt?_rsc=…` 404; hamesha network
      matcher: ({ url, request, sameOrigin }) =>
        Boolean(
          sameOrigin &&
            (url.searchParams.has("_rsc") ||
              url.pathname.includes("__next.") ||
              String(request.headers.get("RSC") || "").trim() === "1")
        ),
      handler: new NetworkOnly(),
    },
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
