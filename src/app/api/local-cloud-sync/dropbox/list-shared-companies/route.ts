export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { verifyBearerUid } from "@/lib/localCloudSync/server/apiAuth";
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
    const companies = await dropboxListPocketLedgerCompaniesForJoin(auth.uid, auth.email);
    return driveHostedApiJson(req, { companies });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const normalizedMsg = /invalid_grant|expired|not connected/i.test(msg)
      ? "Dropbox session expired. Please use Connect Dropbox again."
      : msg;
    return driveHostedApiJson(req, { error: normalizedMsg }, 500);
  }
}
