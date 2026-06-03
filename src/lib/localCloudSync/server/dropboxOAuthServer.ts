import "server-only";

import type { NextRequest } from "next/server";
import { resolveDriveOAuthAppOrigin, type DriveOAuthState } from "@/lib/localCloudSync/server/driveOAuthServer";

export type DropboxOAuthState = DriveOAuthState;

const DROPBOX_SCOPES = [
  "account_info.read",
  "files.content.read",
  "files.content.write",
  "files.metadata.read",
  "files.metadata.write",
].join(" ");

function dropboxAppKey(): string {
  const key = String(process.env.DROPBOX_APP_KEY || "").trim();
  if (!key) throw new Error("Missing DROPBOX_APP_KEY");
  return key;
}

function dropboxAppSecret(): string {
  const secret = String(process.env.DROPBOX_APP_SECRET || "").trim();
  if (!secret) throw new Error("Missing DROPBOX_APP_SECRET");
  return secret;
}

export function buildDropboxAuthUrl(state: DropboxOAuthState, appOrigin?: string): string {
  const appKey = dropboxAppKey();
  const appUrl = String(appOrigin || process.env.NEXT_PUBLIC_APP_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (!appUrl) throw new Error("Missing NEXT_PUBLIC_APP_URL");

  const redirectUri = `${appUrl}/api/auth/callback/dropbox`;
  const encodedState = Buffer.from(JSON.stringify(state)).toString("base64");
  const params = new URLSearchParams({
    client_id: appKey,
    redirect_uri: redirectUri,
    response_type: "code",
    token_access_type: "offline",
    state: encodedState,
    scope: DROPBOX_SCOPES,
  });
  return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
}

export async function exchangeDropboxAuthCode(
  code: string,
  appOrigin: string
): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  accountId: string | null;
  connectedEmail: string | null;
}> {
  const redirectUri = `${appOrigin.replace(/\/+$/, "")}/api/auth/callback/dropbox`;
  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    client_id: dropboxAppKey(),
    client_secret: dropboxAppSecret(),
  });

  const tokenRes = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const tokenJson = (await tokenRes.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    account_id?: string;
    error_description?: string;
    error?: string;
  };
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(tokenJson.error_description || tokenJson.error || "Dropbox token exchange failed");
  }

  let connectedEmail: string | null = null;
  try {
    const acctRes = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        "Content-Type": "application/json",
      },
      body: "null",
    });
    const acct = (await acctRes.json().catch(() => ({}))) as { email?: string };
    if (typeof acct.email === "string" && acct.email.trim()) {
      connectedEmail = acct.email.trim();
    }
  } catch {
    /* optional */
  }

  const expiresIn = Number(tokenJson.expires_in);
  const expiresAt =
    Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : null;

  return {
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token || null,
    expiresAt,
    accountId: tokenJson.account_id || null,
    connectedEmail,
  };
}

export async function saveDropboxTokensForUser(
  uid: string,
  tokens: {
    accessToken: string;
    refreshToken: string | null;
    expiresAt: number | null;
    accountId: string | null;
    connectedEmail: string | null;
  },
  options?: { preserveRefreshToken?: boolean }
): Promise<void> {
  const { getAdminDb, isFirebaseAdminConfigured } = await import("@/lib/firebaseAdmin");
  if (!isFirebaseAdminConfigured()) {
    throw new Error("Firebase Admin not configured for Dropbox connect");
  }
  const id = String(uid || "").trim();
  if (!id) throw new Error("uid required");

  const db = getAdminDb();
  const ref = db.collection("user_tokens").doc(id).collection("dropbox").doc("sync");
  const existing = await ref.get();
  const existingRefresh =
    existing.exists && existing.data()?.refreshToken
      ? String(existing.data()?.refreshToken)
      : null;

  const refreshToken =
    tokens.refreshToken ||
    (options?.preserveRefreshToken !== false ? existingRefresh : null) ||
    null;

  const admin = await import("firebase-admin");
  await ref.set(
    {
      accessToken: tokens.accessToken,
      refreshToken,
      expiresAt: tokens.expiresAt,
      accountId: tokens.accountId,
      connectedEmail: tokens.connectedEmail,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteDropboxTokensForUser(uid: string): Promise<void> {
  const { getAdminDb, isFirebaseAdminConfigured } = await import("@/lib/firebaseAdmin");
  if (!isFirebaseAdminConfigured()) {
    throw new Error("Firebase Admin not configured for Dropbox disconnect");
  }
  const id = String(uid || "").trim();
  if (!id) throw new Error("uid required");
  const db = getAdminDb();
  await db.collection("user_tokens").doc(id).collection("dropbox").doc("sync").delete();
}

type DropboxStoredTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
};

async function loadDropboxTokensRaw(uid: string): Promise<DropboxStoredTokens> {
  const { getAdminDb, isFirebaseAdminConfigured } = await import("@/lib/firebaseAdmin");
  if (!isFirebaseAdminConfigured()) {
    throw new Error("Firebase Admin not configured for Dropbox sync");
  }
  const id = String(uid || "").trim();
  if (!id) throw new Error("uid required");
  const db = getAdminDb();
  const snap = await db.collection("user_tokens").doc(id).collection("dropbox").doc("sync").get();
  if (!snap.exists) throw new Error("Dropbox not connected");
  const d = snap.data() as Record<string, unknown>;
  const accessToken = String(d.accessToken || "");
  if (!accessToken) throw new Error("Dropbox access token missing");
  return {
    accessToken,
    refreshToken: d.refreshToken ? String(d.refreshToken) : null,
    expiresAt: typeof d.expiresAt === "number" ? d.expiresAt : null,
  };
}

async function refreshDropboxAccessToken(uid: string, refreshToken: string): Promise<DropboxStoredTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: dropboxAppKey(),
    client_secret: dropboxAppSecret(),
  });
  const tokenRes = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const tokenJson = (await tokenRes.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  };
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(tokenJson.error_description || tokenJson.error || "Dropbox token refresh failed");
  }
  const expiresIn = Number(tokenJson.expires_in);
  const expiresAt =
    Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : null;
  const next: DropboxStoredTokens = {
    accessToken: tokenJson.access_token,
    refreshToken,
    expiresAt,
  };
  await saveDropboxTokensForUser(
    uid,
    {
      accessToken: next.accessToken,
      refreshToken: next.refreshToken,
      expiresAt: next.expiresAt,
      accountId: null,
      connectedEmail: null,
    },
    { preserveRefreshToken: true }
  );
  return next;
}

/** Server Dropbox API calls — refresh before expiry when refresh_token available. */
export async function getDropboxAccessTokenForUid(uid: string): Promise<string> {
  const tokens = await loadDropboxTokensRaw(uid);
  const skewMs = 60_000;
  if (tokens.expiresAt != null && tokens.expiresAt > Date.now() + skewMs) {
    return tokens.accessToken;
  }
  if (tokens.refreshToken) {
    const refreshed = await refreshDropboxAccessToken(uid, tokens.refreshToken);
    return refreshed.accessToken;
  }
  return tokens.accessToken;
}

export async function hasDropboxTokensForUser(uid: string): Promise<boolean> {
  const { getAdminDb, isFirebaseAdminConfigured } = await import("@/lib/firebaseAdmin");
  if (!isFirebaseAdminConfigured()) return false;
  const id = String(uid || "").trim();
  if (!id) return false;
  const db = getAdminDb();
  const snap = await db.collection("user_tokens").doc(id).collection("dropbox").doc("sync").get();
  return snap.exists && Boolean(snap.data()?.accessToken);
}

export function resolveDropboxOAuthAppOrigin(
  req: NextRequest,
  clientOrigin?: string,
  oauthRedirectOrigin?: string
): string {
  return resolveDriveOAuthAppOrigin(req, clientOrigin, oauthRedirectOrigin);
}
