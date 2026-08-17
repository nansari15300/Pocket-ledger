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
  const legacy = String(
    process.env.GOOGLE_CLIENT_ID ??
      (process.env as Record<string, string | undefined>)["GOOGLE_CLIENT_ID  "] ??
      ""
  ).trim();
  const clientId = web || FIREBASE_WEB_OAUTH_CLIENT_ID || legacy;
  if (!clientId) throw new Error("Missing Google OAuth client ID");
  return clientId;
}

export function resolveGoogleOAuthClientSecret(): string {
  const secret = String(process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
  if (!secret) {
    throw new Error(
      "Missing GOOGLE_CLIENT_SECRET. Set this Web client secret in Firebase App Hosting → Environment secrets, then redeploy."
    );
  }
  return secret;
}

export function resolveGoogleOAuthRedirectUri(): string {
  const appUrl = String(
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? ""
  ).trim();
  const base = (appUrl || POCKET_LEDGER_PRODUCTION_APP_URL).replace(/\/+$/, "");
  // Hosted Next is under `/app`; avoid `/app/app` if env already includes it.
  if (/\/app$/i.test(base)) {
    return `${base}/api/auth/callback/google`;
  }
  try {
    const host = new URL(/^https?:\/\//i.test(base) ? base : `https://${base}`).hostname;
    if (
      host === "pocket-ledger.com" ||
      host === "www.pocket-ledger.com" ||
      host === "pocketledger.com" ||
      host === "www.pocketledger.com" ||
      host.endsWith(".pocket-ledger.com") ||
      host.endsWith(".pocketledger.com")
    ) {
      return `${base}/app/api/auth/callback/google`;
    }
  } catch {
    /* fall through */
  }
  const envBase = String(process.env.NEXT_PUBLIC_WEB_APP_BASE_PATH || "").trim();
  if (envBase === "/app") {
    return `${base}/app/api/auth/callback/google`;
  }
  return `${base}/api/auth/callback/google`;
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
