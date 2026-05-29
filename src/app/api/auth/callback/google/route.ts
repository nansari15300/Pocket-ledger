export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { resolveDriveOAuthAppOrigin } from "@/lib/localCloudSync/server/driveOAuthServer";

type OAuthState = {
  returnPath?: string;
  uid?: string;
  email?: string;
  formData?: any;
};

function decodeState(stateB64: string | null): OAuthState | null {
  if (!stateB64) return null;
  try {
    const json = Buffer.from(stateB64, "base64").toString("utf-8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const stateB64 = url.searchParams.get("state");

  const appUrl = resolveDriveOAuthAppOrigin(req);
  const decoded = decodeState(stateB64);
  const returnPath = decoded?.returnPath || "/company";

  if (!code) {
    const u = new URL(returnPath, appUrl);
    u.searchParams.set("error", "oauth_failed_no_code");
    if (stateB64) u.searchParams.set("state", stateB64);
    return NextResponse.redirect(u);
  }

  if (!decoded?.uid) {
    const u = new URL(returnPath, appUrl);
    u.searchParams.set("error", "missing_uid_in_state");
    if (stateB64) u.searchParams.set("state", stateB64);
    return NextResponse.redirect(u);
  }

  try {
    const redirectUri = `${appUrl}/api/auth/callback/google`;

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      throw new Error("No access token received from Google");
    }

    // ✅ Save tokens to Firestore using Admin SDK
    const db = getAdminDb();
    await db
      .collection("user_tokens")
      .doc(decoded.uid)
      .collection("google")
      .doc("drive")
      .set(
        {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || null,
          expiryDate: tokens.expiry_date || null,
          scope: tokens.scope || null,
          tokenType: tokens.token_type || null,
          updatedAt: adminTimestamp(),
          connectedEmail: decoded.email || null,
        },
        { merge: true }
      );

    const successUrl = new URL(returnPath, appUrl);
    successUrl.searchParams.set("success", "drive_connected");
    if (stateB64) successUrl.searchParams.set("state", stateB64);

    return NextResponse.redirect(successUrl);
  } catch (error: any) {
    console.error("OAuth exchange failed FULL:", error);
    console.error("OAuth exchange failed RESPONSE:", error?.response?.data || "no response data");

    const u = new URL(returnPath, appUrl);
    u.searchParams.set("error", "oauth_exchange_failed");
    if (stateB64) u.searchParams.set("state", stateB64);
    return NextResponse.redirect(u);
  }
}

// Firestore Admin Timestamp helper
function adminTimestamp() {
  // lazy import to avoid edge/runtime issues
  const admin = require("firebase-admin");
  return admin.firestore.FieldValue.serverTimestamp();
}
