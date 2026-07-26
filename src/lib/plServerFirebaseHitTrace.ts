"use client";

/**
 * PL server / local_server isolation:
 * - Online gate: Firebase Storage/Firestore URLs normal.
 * - PL thin staff / remote client: Storage URL hit → console + block (PC→PC only).
 * - Host on local_server / :3001: Storage/Firestore URL hit → console warn (detect kaunsa pull/push).
 *
 * Add-user on PL Manage Sharing already writes SQLite `localCompanyUsers` only —
 * ye module accidental Firebase Storage / companies-registry side-channel dikhane ke liye hai.
 */

import { getActiveGate } from "@/lib/gates/gateStore";
import { isPlServerThinStaffClient } from "@/lib/plServerThinStaffClient";
import { isPlHubServerClientMode, isPlRemoteServerClientMode, isPlSharingServerPortOrigin } from "@/lib/plRemoteServerClient";

export type PlFirebaseHitKind =
  | "storage_https"
  | "storage_object_path"
  | "storage_getDownloadURL"
  | "firestore_companies"
  | "firestore_other"
  | "network_fetch";

/** Staff / remote client — Firebase Storage bytes mat lao; PL `/__pl_attachment` use karo. */
export function shouldBlockFirebaseStorageOnPlServer(): boolean {
  if (typeof window === "undefined") return false;
  if (isPlServerThinStaffClient()) return true;
  if (isPlRemoteServerClientMode() || isPlHubServerClientMode()) return true;
  return false;
}

/** Host ya staff — Firebase URL/path dikhe to console me trace. */
export function shouldLogFirebaseHitsOnPlServerGate(): boolean {
  if (typeof window === "undefined") return false;
  if (shouldBlockFirebaseStorageOnPlServer()) return true;
  if (isPlSharingServerPortOrigin()) return true;
  try {
    return getActiveGate().type === "local_server";
  } catch {
    return false;
  }
}

export function looksLikeFirebaseStorageUrlOrPath(raw: string): boolean {
  const s = String(raw || "").trim();
  if (!s) return false;
  const l = s.toLowerCase();
  if (
    l.includes("firebasestorage.googleapis.com") ||
    l.includes("firebasestorage.app") ||
    (l.includes("googleapis.com") && l.includes("/o/")) ||
    l.includes("storage.googleapis.com")
  ) {
    return true;
  }
  // Object path style (no https) — voucher-files / company attachments.
  if (!/^https?:\/\//i.test(s) && (l.includes("voucher-files/") || l.includes("%2f"))) {
    return /(?:^|\/)(?:voucher-files|company-files|attachments)\//i.test(s) || /%2f/i.test(s);
  }
  return false;
}

export function tracePlServerFirebaseHit(
  kind: PlFirebaseHitKind,
  detail: {
    source: string;
    url?: string;
    path?: string;
    action?: "blocked" | "logged" | "allowed_sidechannel";
  }
): void {
  if (!shouldLogFirebaseHitsOnPlServerGate()) return;
  const action = detail.action ?? "logged";
  const tag = action === "blocked" ? "[PL_BLOCK_FIREBASE]" : "[PL_FIREBASE_HIT]";
  let gateType = "?";
  try {
    gateType = getActiveGate().type;
  } catch {
    /* ignore */
  }
  console.warn(tag, {
    kind,
    source: detail.source,
    action,
    url: detail.url ? String(detail.url).slice(0, 220) : undefined,
    path: detail.path ? String(detail.path).slice(0, 220) : undefined,
    gate: gateType,
    thinStaff: isPlServerThinStaffClient(),
    href: typeof window !== "undefined" ? window.location.href : "",
  });
}

/**
 * @returns true → caller must skip Firebase Storage SDK/fetch (PL isolation).
 */
export function blockFirebaseStorageHitOnPlServer(
  source: string,
  urlOrPath: string
): boolean {
  const raw = String(urlOrPath || "").trim();
  if (!raw) return false;
  const isHttps = /^https?:\/\//i.test(raw);
  if (!looksLikeFirebaseStorageUrlOrPath(raw) && isHttps) return false;

  if (shouldBlockFirebaseStorageOnPlServer()) {
    tracePlServerFirebaseHit(isHttps ? "storage_https" : "storage_object_path", {
      source,
      url: isHttps ? raw : undefined,
      path: !isHttps ? raw : undefined,
      action: "blocked",
    });
    return true;
  }

  if (shouldLogFirebaseHitsOnPlServerGate() && looksLikeFirebaseStorageUrlOrPath(raw)) {
    tracePlServerFirebaseHit(isHttps ? "storage_https" : "storage_object_path", {
      source,
      url: isHttps ? raw : undefined,
      path: !isHttps ? raw : undefined,
      action: "logged",
    });
  }
  return false;
}

/** Thin staff: company list PL share + SQLite se — Firestore `companies` onSnapshot mat chalao. */
export function shouldSkipFirestoreCompanyRegistryOnPlStaff(): boolean {
  return shouldBlockFirebaseStorageOnPlServer();
}

let fetchTraceInstalled = false;

/** Boot: `window.fetch` se Firebase Storage / Firestore hosts dikhen to console. Storage thin-staff pe block. */
export function installPlServerFirebaseNetworkTrace(): void {
  if (typeof window === "undefined" || fetchTraceInstalled) return;
  fetchTraceInstalled = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const raw =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : typeof Request !== "undefined" && input instanceof Request
              ? input.url
              : String(input);
      const lower = String(raw || "").toLowerCase();
      if (shouldLogFirebaseHitsOnPlServerGate()) {
        const isStorage =
          lower.includes("firebasestorage.googleapis.com") ||
          lower.includes("firebasestorage.app") ||
          (lower.includes("storage.googleapis.com") && lower.includes("/o/"));
        const isFirestore = lower.includes("firestore.googleapis.com");
        if (isStorage || isFirestore) {
          if (isStorage && shouldBlockFirebaseStorageOnPlServer()) {
            tracePlServerFirebaseHit("network_fetch", {
              source: "window.fetch",
              url: String(raw),
              action: "blocked",
            });
            return new Response(JSON.stringify({ error: "pl_server_blocks_firebase_storage" }), {
              status: 499,
              headers: { "Content-Type": "application/json" },
            });
          }
          tracePlServerFirebaseHit(isFirestore ? "firestore_other" : "network_fetch", {
            source: "window.fetch",
            url: String(raw),
            action: "logged",
          });
        }
      }
    } catch {
      /* never break fetch */
    }
    return orig(input as RequestInfo, init);
  };
}
