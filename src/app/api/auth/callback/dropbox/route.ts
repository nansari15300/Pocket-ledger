export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import {
  DROPBOX_CALLBACK_PATH,
  exchangeDropboxAuthCode,
  saveDropboxTokensForUser,
} from "@/lib/localCloudSync/server/dropboxOAuthServer";

function redirectBaseForReturnPath(returnPath: string, callbackOrigin: string): string {
  const rp = String(returnPath || "").trim();
  if (/^https?:\/\//i.test(rp)) {
    try {
      return new URL(rp).origin.replace(/\/+$/, "");
    } catch {
      /* fall through */
    }
  }
  return callbackOrigin.replace(/\/+$/, "");
}

type OAuthState = {
  returnPath?: string;
  uid?: string;
  email?: string;
};

function decodeState(stateB64: string | null): OAuthState | null {
  if (!stateB64) return null;
  try {
    const json = Buffer.from(stateB64, "base64").toString("utf-8");
    return JSON.parse(json) as OAuthState;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const stateB64 = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");

  const callbackOrigin = req.nextUrl.origin.replace(/\/+$/, "");
  const oauthRedirectUri = `${callbackOrigin}${DROPBOX_CALLBACK_PATH}`;
  const decoded = decodeState(stateB64);
  const returnPath = decoded?.returnPath || "/company";
  const returnBase = redirectBaseForReturnPath(returnPath, callbackOrigin);

  if (oauthError) {
    const u = new URL(returnPath, returnBase);
    u.searchParams.set("error", "oauth_failed");
    if (stateB64) u.searchParams.set("state", stateB64);
    return NextResponse.redirect(u);
  }

  if (!code) {
    const u = new URL(returnPath, returnBase);
    u.searchParams.set("error", "oauth_failed_no_code");
    if (stateB64) u.searchParams.set("state", stateB64);
    return NextResponse.redirect(u);
  }

  if (!decoded?.uid) {
    const u = new URL(returnPath, returnBase);
    u.searchParams.set("error", "missing_uid_in_state");
    if (stateB64) u.searchParams.set("state", stateB64);
    return NextResponse.redirect(u);
  }

  try {
    const tokens = await exchangeDropboxAuthCode(code, oauthRedirectUri);
    await saveDropboxTokensForUser(decoded.uid, {
      ...tokens,
      connectedEmail: tokens.connectedEmail || decoded.email || null,
    });

    const successUrl = new URL(returnPath, returnBase);
    successUrl.searchParams.set("success", "dropbox_connected");
    if (stateB64) successUrl.searchParams.set("state", stateB64);
    return NextResponse.redirect(successUrl);
  } catch (error) {
    console.error("[Dropbox OAuth] exchange failed:", error);
    const u = new URL(returnPath, returnBase);
    u.searchParams.set("error", "oauth_exchange_failed");
    if (stateB64) u.searchParams.set("state", stateB64);
    return NextResponse.redirect(u);
  }
}
