export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { verifyBearerUid } from "@/lib/localCloudSync/server/apiAuth";
import { driveHostedApiJson, driveHostedApiOptions } from "@/lib/server/driveHostedApiCors";

export async function OPTIONS(req: NextRequest) {
  return driveHostedApiOptions(req);
}

/** Public-safe payload builder: sirf true/false + callback preview (koi secret value expose nahi). */
function buildSafeEnvDiagnostics() {
  // Sirf boolean/safe fields return karo taaki production me env injection quickly verify ho jaaye.
  const appUrl = String(process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  const hasClientId = Boolean(String(process.env.GOOGLE_CLIENT_ID || "").trim());
  const hasClientSecret = Boolean(String(process.env.GOOGLE_CLIENT_SECRET || "").trim());
  const hasFirebaseProjectId = Boolean(String(process.env.FIREBASE_PROJECT_ID || "").trim());

  return {
    ok: true,
    env_present: {
      GOOGLE_CLIENT_ID: hasClientId,
      GOOGLE_CLIENT_SECRET: hasClientSecret,
      FIREBASE_PROJECT_ID: hasFirebaseProjectId,
      NEXT_PUBLIC_APP_URL: Boolean(appUrl),
    },
    // Callback preview se Google Console redirect URI match turant compare ho sake.
    oauth_callback_preview: appUrl ? `${appUrl}/api/auth/callback/google` : null,
  };
}

/** Browser-open quick check: deploy ke baad URL hit karke runtime env presence turant verify karo. */
export async function GET(req: NextRequest) {
  return driveHostedApiJson(req, buildSafeEnvDiagnostics());
}

/** Authenticated check: app ke andar se same diagnostics payload consume karne ke liye. */
export async function POST(req: NextRequest) {
  const auth = await verifyBearerUid(req);
  if ("error" in auth) {
    return driveHostedApiJson(req, { error: auth.error }, auth.status);
  }
  return driveHostedApiJson(req, buildSafeEnvDiagnostics());
}
