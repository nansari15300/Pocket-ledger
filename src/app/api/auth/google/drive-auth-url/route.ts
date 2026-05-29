export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { verifyBearerUid } from "@/lib/localCloudSync/server/apiAuth";
import {
  buildGoogleDriveAuthUrl,
  resolveDriveOAuthAppOrigin,
  type DriveOAuthState,
} from "@/lib/localCloudSync/server/driveOAuthServer";
import { driveHostedApiJson, driveHostedApiOptions } from "@/lib/server/driveHostedApiCors";

/** APK/static localhost — CORS preflight (production middleware deploy se pehle bhi chale). */
export async function OPTIONS(req: NextRequest) {
  return driveHostedApiOptions(req);
}

/** Client-safe Drive connect — OAuth URL sirf server par `googleapis` se. */
export async function POST(req: NextRequest) {
  const auth = await verifyBearerUid(req);
  if ("error" in auth) {
    return driveHostedApiJson(req, { error: auth.error }, auth.status);
  }

  const body = (await req.json()) as DriveOAuthState & {
    clientOrigin?: string;
    firebaseProjectId?: string;
    /** Static/APK: OAuth callback hosted site par — `https://pocket-ledger.com/api/auth/callback/google`. */
    oauthRedirectOrigin?: string;
  };
  const returnPath = String(body.returnPath || "/company").trim();
  const uid = String(body.uid || auth.uid).trim();
  if (uid !== auth.uid) {
    return driveHostedApiJson(req, { error: "uid mismatch" }, 403);
  }

  // Static bundle project key — hosted secrets sirf matching Firebase project ke liye (plans-seed pattern).
  const expectedProject = String(process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "").trim();
  const clientProject = String(body.firebaseProjectId || "").trim();
  if (expectedProject && clientProject && clientProject !== expectedProject) {
    return driveHostedApiJson(req, { error: "Firebase project mismatch" }, 403);
  }

  try {
    // Browser ka actual origin — localhost IPv6/static clash par bhi sahi redirect_uri.
    const appOrigin = resolveDriveOAuthAppOrigin(req, body.clientOrigin, body.oauthRedirectOrigin);
    const url = buildGoogleDriveAuthUrl(
      {
        returnPath,
        uid,
        email: body.email,
        formData: body.formData,
      },
      appOrigin
    );
    return driveHostedApiJson(req, { url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return driveHostedApiJson(req, { error: msg }, 500);
  }
}
