import "server-only";

/** Firebase Google sign-in Web client — google-services.json / Capacitor / EXE jaisa hi. */
export const FIREBASE_WEB_OAUTH_CLIENT_ID =
  "469450068553-h848203thcqi3u8mvl8bvnm7gh8v5icl.apps.googleusercontent.com";

const POCKET_LEDGER_PRODUCTION_APP_URL = "https://pocket-ledger.com";

/**
 * Drive OAuth client ID — pehle active Firebase Web client (login jaisa),
 * phir legacy GOOGLE_CLIENT_ID. Purana alag Drive client delete ho to bhi chale.
 */
export function resolveGoogleOAuthClientId(): string {
  const web = String(process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "").trim();
  const legacy = String(process.env.GOOGLE_CLIENT_ID ?? "").trim();
  const clientId = web || FIREBASE_WEB_OAUTH_CLIENT_ID || legacy;
  if (!clientId) throw new Error("Missing Google OAuth client ID");
  return clientId;
}

export function resolveGoogleOAuthClientSecret(): string {
  const secret = String(process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
  if (!secret) {
    throw new Error(
      "Missing GOOGLE_CLIENT_SECRET — Firebase App Hosting → Environment secrets me is Web client ka secret set karo, phir redeploy."
    );
  }
  return secret;
}

export function resolveGoogleOAuthRedirectUri(): string {
  const appUrl = String(
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? ""
  ).trim();
  const base = appUrl || POCKET_LEDGER_PRODUCTION_APP_URL;
  return `${base.replace(/\/+$/, "")}/api/auth/callback/google`;
}

/** googleapis OAuth2 client — Drive connect + token refresh dono ke liye. */
export function createGoogleOAuth2Client(
  google: typeof import("googleapis").google,
  redirectUriOverride?: string
) {
  const redirectUri = String(redirectUriOverride ?? "").trim() || resolveGoogleOAuthRedirectUri();
  return new google.auth.OAuth2(
    resolveGoogleOAuthClientId(),
    resolveGoogleOAuthClientSecret(),
    redirectUri
  );
}
