import "server-only";

import type { NextRequest } from "next/server";
import { google } from "googleapis";
import { isPocketLedgerAppOrigin } from "@/lib/pocketLedgerAppHosts";
import { isAllowedEmbeddedBillingClientOrigin } from "@/lib/server/billingApiCors";

export type DriveOAuthState = {
  returnPath: string;
  uid: string;
  email?: string;
  formData?: unknown;
};

/** Static APK/EXE/Capacitor loopback — OAuth callback hosted site par; clientOrigin sirf returnPath bridge ke liye. */
function isEmbeddedLoopbackClientOrigin(origin: string): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
    if (u.protocol === "capacitor:" || u.protocol === "ionic:") return true;
    if (u.protocol === "file:") return true;
  } catch {
    return false;
  }
  return false;
}

function isLoopbackAppUrl(url: string): boolean {
  try {
    const raw = String(url || "").trim();
    if (!raw) return false;
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const h = new URL(withScheme).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

/** Static/APK OAuth callback — production me baked localhost env ignore; hamesha hosted site. */
function resolveHostedDriveOAuthOrigin(): string {
  const fromEnv = String(process.env.NEXT_PUBLIC_APP_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (fromEnv && !(process.env.NODE_ENV !== "development" && isLoopbackAppUrl(fromEnv))) {
    return fromEnv;
  }
  return "https://pocket-ledger.com";
}

/** OAuth redirect/callback — browser Origin (127.0.0.1 vs localhost) Google Console se match hona chahiye. */
export function resolveDriveOAuthAppOrigin(
  req: NextRequest,
  clientOrigin?: string,
  oauthRedirectOrigin?: string
): string {
  const fromClient = String(clientOrigin || req.headers.get("origin") || "").trim();
  // Dev browser loopback pehle — `.env.local` me STATIC_BUILD=1 ho to bhi oauthRedirectOrigin hosted na ho.
  if (fromClient && isEmbeddedLoopbackClientOrigin(fromClient)) {
    if (process.env.NODE_ENV === "development") {
      return fromClient.replace(/\/+$/, "");
    }
    const hosted = resolveHostedDriveOAuthOrigin();
    if (hosted) return hosted;
  }

  // Static/APK body se bheja hosted origin — loopback clientOrigin par mat chalao (redirect_uri_mismatch).
  const explicitHosted = String(oauthRedirectOrigin || "").trim().replace(/\/+$/, "");
  if (explicitHosted) {
    const allowedHosted = resolveHostedDriveOAuthOrigin();
    if (explicitHosted === allowedHosted || isPocketLedgerAppOrigin(explicitHosted)) {
      return explicitHosted;
    }
  }
  if (fromClient && isAllowedEmbeddedBillingClientOrigin(fromClient)) {
    return fromClient.replace(/\/+$/, "");
  }
  try {
    const fromReq = req.nextUrl?.origin;
    if (fromReq && isAllowedEmbeddedBillingClientOrigin(fromReq)) {
      return fromReq.replace(/\/+$/, "");
    }
  } catch {
    /* fall through */
  }
  const appUrl = String(process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (!appUrl) throw new Error("Missing NEXT_PUBLIC_APP_URL");
  return appUrl.replace(/\/+$/, "");
}

/** Server-only — `googleapis` browser bundle me nahi aata. */
export function buildGoogleDriveAuthUrl(state: DriveOAuthState, appOrigin?: string): string {
  // Runtime me GOOGLE_CLIENT_ID miss ho to Firebase web client id fallback se Drive OAuth URL build karo.
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = String(appOrigin || process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");

  if (!clientId || !clientSecret) throw new Error("Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET");
  if (!appUrl) throw new Error("Missing NEXT_PUBLIC_APP_URL");

  const redirectUri = `${appUrl}/api/auth/callback/google`;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  // drive.file sirf app-created files — sharedWithMe + shared folder read/write ke liye drive scope chahiye.
  const scopes = [
    "https://www.googleapis.com/auth/drive",
    "openid",
    "email",
    "profile",
  ];

  const encodedState = Buffer.from(JSON.stringify(state)).toString("base64");

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
    state: encodedState,
  });
}

export async function hasGoogleDriveTokensForUser(uid: string): Promise<boolean> {
  const { getAdminDb, isFirebaseAdminConfigured } = await import("@/lib/firebaseAdmin");
  if (!isFirebaseAdminConfigured()) return false;
  const id = String(uid || "").trim();
  if (!id) return false;
  const db = getAdminDb();
  const snap = await db.collection("user_tokens").doc(id).collection("google").doc("drive").get();
  return snap.exists && Boolean(snap.data()?.accessToken);
}

/** OAuth token shard hatao — client Firestore delete rules se block hota hai. */
export async function deleteGoogleDriveTokensForUser(uid: string): Promise<void> {
  const { getAdminDb, isFirebaseAdminConfigured } = await import("@/lib/firebaseAdmin");
  if (!isFirebaseAdminConfigured()) {
    throw new Error("Firebase Admin not configured for Drive disconnect");
  }
  const id = String(uid || "").trim();
  if (!id) throw new Error("uid required");
  const db = getAdminDb();
  await db.collection("user_tokens").doc(id).collection("google").doc("drive").delete();
}
