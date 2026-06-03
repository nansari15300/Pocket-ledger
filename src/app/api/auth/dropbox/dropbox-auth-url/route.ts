export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { verifyBearerUid } from "@/lib/localCloudSync/server/apiAuth";
import {
  buildDropboxAuthUrl,
  DROPBOX_CALLBACK_PATH,
  dropboxOAuthRedirectUriFromAppOrigin,
  normalizeDropboxOAuthRedirectUri,
  resolveDropboxAppOriginFromClientRedirectUri,
  resolveDropboxOAuthAppOrigin,
  type DropboxOAuthState,
} from "@/lib/localCloudSync/server/dropboxOAuthServer";
import { driveHostedApiJson, driveHostedApiOptions } from "@/lib/server/driveHostedApiCors";

export async function OPTIONS(req: NextRequest) {
  return driveHostedApiOptions(req);
}

export async function POST(req: NextRequest) {
  const auth = await verifyBearerUid(req);
  if ("error" in auth) {
    return driveHostedApiJson(req, { error: auth.error }, auth.status);
  }

  const body = (await req.json()) as DropboxOAuthState & {
    clientOrigin?: string;
    firebaseProjectId?: string;
    oauthRedirectOrigin?: string;
    /** Browser tab callback — must match Dropbox app Redirect URIs exactly. */
    oauthRedirectUri?: string;
  };
  const returnPath = String(body.returnPath || "/company").trim();
  const uid = String(body.uid || auth.uid).trim();
  if (uid !== auth.uid) {
    return driveHostedApiJson(req, { error: "uid mismatch" }, 403);
  }

  const expectedProject = String(process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "").trim();
  const clientProject = String(body.firebaseProjectId || "").trim();
  if (expectedProject && clientProject && clientProject !== expectedProject) {
    return driveHostedApiJson(req, { error: "Firebase project mismatch" }, 403);
  }

  try {
    const clientRedirect = String(body.oauthRedirectUri || "").trim();
    let redirectUri = clientRedirect;
    if (redirectUri) {
      const origin = resolveDropboxAppOriginFromClientRedirectUri(redirectUri);
      if (!origin) {
        return driveHostedApiJson(req, { error: "Invalid oauthRedirectUri for Dropbox" }, 400);
      }
      redirectUri = normalizeDropboxOAuthRedirectUri(redirectUri);
    } else {
      const appOrigin =
        resolveDropboxAppOriginFromClientRedirectUri(
          `${String(body.clientOrigin || "").trim().replace(/\/+$/, "")}${DROPBOX_CALLBACK_PATH}`
        ) ||
        resolveDropboxOAuthAppOrigin(req, body.clientOrigin, body.oauthRedirectOrigin);
      redirectUri = dropboxOAuthRedirectUriFromAppOrigin(appOrigin);
    }
    const url = buildDropboxAuthUrl(
      {
        returnPath,
        uid,
        email: body.email,
        formData: body.formData,
      },
      redirectUri
    );
    return driveHostedApiJson(req, {
      url,
      redirectUri,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return driveHostedApiJson(req, { error: msg }, 500);
  }
}
