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
