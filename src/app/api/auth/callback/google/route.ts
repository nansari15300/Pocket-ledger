export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createGoogleOAuth2Client } from "@/lib/server/googleOAuthCredentials";
import { saveGoogleDriveTokensForUser } from "@/lib/localCloudSync/server/driveOAuthServer";

type DecodedState = {
  returnPath?: string;
  formData?: unknown;
  uid?: string;
  email?: string;
};

function safeBase64JsonDecode<T = unknown>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf-8")) as T;
  } catch {
    return null;
  }
}

function redirectToReturnPath(returnPath: string, baseUrl: string, params: Record<string, string>, encodedState: string) {
  const target = new URL(returnPath, baseUrl);
  for (const [key, val] of Object.entries(params)) {
    target.searchParams.set(key, val);
  }
  if (encodedState) target.searchParams.set("state", encodedState);
  return NextResponse.redirect(target);
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const protocol = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("host");
  const baseUrl = `${protocol}://${host}`;

  let returnPath = "/company";
  const encodedState = state || "";
  const decoded: DecodedState | null = state ? safeBase64JsonDecode(state) : null;

  if (decoded?.returnPath) returnPath = decoded.returnPath;

  if (oauthError) {
    return redirectToReturnPath(returnPath, baseUrl, { error: oauthError }, encodedState);
  }

  if (!code) {
    return redirectToReturnPath(returnPath, baseUrl, { error: "oauth_failed_no_code" }, encodedState);
  }

  const uid = decoded?.uid;
  if (!uid) {
    return redirectToReturnPath(returnPath, baseUrl, { error: "missing_uid_in_state" }, encodedState);
  }

  try {
    const oauth2Client = createGoogleOAuth2Client(
      google,
      `${baseUrl}/api/auth/callback/google`
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      throw new Error("No access_token received from Google.");
    }

    await saveGoogleDriveTokensForUser(uid, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiryDate: tokens.expiry_date ?? null,
      scope: tokens.scope ?? null,
      tokenType: tokens.token_type ?? null,
      connectedEmail: decoded?.email ?? null,
    });

    return redirectToReturnPath(returnPath, baseUrl, { success: "drive_connected" }, encodedState);
  } catch (error: unknown) {
    console.error("OAuth exchange failed FULL:", error);
    const err = error as { response?: { data?: unknown } };
    console.error("OAuth exchange failed RESPONSE:", err?.response?.data || "no response data");

    return redirectToReturnPath(returnPath, baseUrl, { error: "oauth_exchange_failed" }, encodedState);
  }
}
