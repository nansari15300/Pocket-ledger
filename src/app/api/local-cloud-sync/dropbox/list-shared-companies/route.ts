export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { verifyBearerUid } from "@/lib/localCloudSync/server/apiAuth";
import { hasDropboxTokensForUser } from "@/lib/localCloudSync/server/dropboxOAuthServer";
import { dropboxListPocketLedgerCompaniesForJoin } from "@/lib/localCloudSync/server/dropboxTransportServer";
import { driveHostedApiJson, driveHostedApiOptions } from "@/lib/server/driveHostedApiCors";

export async function OPTIONS(req: NextRequest) {
  return driveHostedApiOptions(req);
}

/** Join UI — Pocket Ledger company folders on Dropbox (owned + shared). */
export async function POST(req: NextRequest) {
  const auth = await verifyBearerUid(req);
  if ("error" in auth) {
    return driveHostedApiJson(req, { error: auth.error }, auth.status);
  }
  try {
    if (!(await hasDropboxTokensForUser(auth.uid))) {
      return driveHostedApiJson(req, { companies: [], dropboxConnected: false });
    }
    const companies = await dropboxListPocketLedgerCompaniesForJoin(auth.uid, auth.email);
    return driveHostedApiJson(req, { companies, dropboxConnected: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const normalizedMsg = /invalid_grant|expired|not connected/i.test(msg)
      ? "Dropbox session expired. Tap Connect, sign in again, then Refresh list."
      : /bad request/i.test(msg)
        ? "Dropbox not linked yet, or redirect URI is not registered in the Dropbox app. Tap Connect first."
        : msg;
    return driveHostedApiJson(req, { error: normalizedMsg }, 500);
  }
}
