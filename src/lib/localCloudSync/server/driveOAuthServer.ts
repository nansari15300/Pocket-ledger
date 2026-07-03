import "server-only";

import { google } from "googleapis";
import { createGoogleOAuth2Client } from "@/lib/server/googleOAuthCredentials";

export type DriveOAuthState = {
  returnPath: string;
  uid: string;
  email?: string;
  formData?: unknown;
};

/** Server-only — `googleapis` browser bundle me nahi aata. */
export function buildGoogleDriveAuthUrl(state: DriveOAuthState): string {
  const oauth2Client = createGoogleOAuth2Client(google);

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

export type GoogleDriveTokenPatch = {
  accessToken: string;
  refreshToken?: string | null;
  expiryDate?: number | null;
  scope?: string | null;
  tokenType?: string | null;
  connectedEmail?: string | null;
};

/** OAuth callback — Admin SDK se token save (client Firestore rules server par nahi chalte). */
export async function saveGoogleDriveTokensForUser(
  uid: string,
  patch: GoogleDriveTokenPatch
): Promise<void> {
  const admin = await import("firebase-admin");
  const { getAdminDb, isFirebaseAdminConfigured } = await import("@/lib/firebaseAdmin");
  if (!isFirebaseAdminConfigured()) {
    throw new Error("Firebase Admin not configured for Drive OAuth callback");
  }
  const id = String(uid || "").trim();
  if (!id) throw new Error("uid required");
  const db = getAdminDb();
  const ref = db.collection("user_tokens").doc(id).collection("google").doc("drive");
  const existingSnap = await ref.get();
  const existing = existingSnap.exists ? (existingSnap.data() as Record<string, unknown>) : {};
  const refreshToken =
    patch.refreshToken ?? (existing.refreshToken ? String(existing.refreshToken) : null);

  await ref.set(
    {
      accessToken: patch.accessToken,
      refreshToken,
      expiryDate: patch.expiryDate ?? null,
      scope: patch.scope ?? null,
      tokenType: patch.tokenType ?? null,
      connectedEmail: patch.connectedEmail ?? null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
