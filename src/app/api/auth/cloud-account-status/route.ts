export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { verifyBearerUid } from "@/lib/localCloudSync/server/apiAuth";
import { hasGoogleDriveTokensForUser } from "@/lib/localCloudSync/server/driveOAuthServer";
import { hasDropboxTokensForUser } from "@/lib/localCloudSync/server/dropboxOAuthServer";
import { driveHostedApiJson, driveHostedApiOptions } from "@/lib/server/driveHostedApiCors";

export async function OPTIONS(req: NextRequest) {
  return driveHostedApiOptions(req);
}

/** UI: Drive/Dropbox account linked hai ya nahi (per Firebase user). */
export async function POST(req: NextRequest) {
  const auth = await verifyBearerUid(req);
  if ("error" in auth) {
    return driveHostedApiJson(req, { error: auth.error }, auth.status);
  }
  try {
    const [googleDrive, dropbox] = await Promise.all([
      hasGoogleDriveTokensForUser(auth.uid),
      hasDropboxTokensForUser(auth.uid),
    ]);
    return driveHostedApiJson(req, { googleDrive, dropbox });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return driveHostedApiJson(req, { error: msg }, 500);
  }
}
