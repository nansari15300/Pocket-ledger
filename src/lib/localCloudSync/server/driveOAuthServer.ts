import "server-only";

import type { NextRequest } from "next/server";
import { google } from "googleapis";
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

/** Static client explicit hosted redirect — Google Console me yahi URI register hona chahiye. */
function resolveHostedDriveOAuthOrigin(): string {
  return String(process.env.NEXT_PUBLIC_APP_URL || "https://pocket-ledger.com")
    .trim()
    .replace(/\/+$/, "");
}

/** OAuth redirect/callback — browser Origin (127.0.0.1 vs localhost) Google Console se match hona chahiye. */
export function resolveDriveOAuthAppOrigin(
  req: NextRequest,
  clientOrigin?: string,
  oauthRedirectOrigin?: string
): string {
  // Static/APK body se bheja hosted origin — loopback clientOrigin par mat chalao (redirect_uri_mismatch).
  const explicitHosted = String(oauthRedirectOrigin || "").trim().replace(/\/+$/, "");
  if (explicitHosted) {
    const allowedHosted = resolveHostedDriveOAuthOrigin();
    if (
      explicitHosted === allowedHosted ||
      explicitHosted.endsWith(".pocket-ledger.com") ||
      explicitHosted === "https://pocket-ledger.com"
    ) {
      return explicitHosted;
    }
  }

  const fromClient = String(clientOrigin || req.headers.get("origin") || "").trim();
  // Static shell localhost par API routes nahi — redirect_uri hamesha pocket-ledger.com (server secrets + Google Console).
  if (fromClient && isEmbeddedLoopbackClientOrigin(fromClient)) {
    const hosted = resolveHostedDriveOAuthOrigin();
    if (hosted) return hosted;
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
