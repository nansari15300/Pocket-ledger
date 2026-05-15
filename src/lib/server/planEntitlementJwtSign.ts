import { createSign } from "crypto";

export type PlanEntitlementSignInput = {
  companyId: string;
  localCompanyId: string;
  planId: string;
  planExpiryMs: number | null;
  offlineLicenseValidUntilMs: number;
  deviceId: string;
};

function toBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

/**
 * RS256 JWT — sirf server (`sync-plan` API). Private key env: `PLAN_ENTITLEMENT_JWT_PRIVATE_KEY_PEM` (newline `\n` ya `\\n`).
 * Client `NEXT_PUBLIC_PLAN_ENTITLEMENT_JWT_PUBLIC_KEY_PEM` se verify — premium tamper SQLite se bypass nahi.
 */
export function signPlanEntitlementJwt(input: PlanEntitlementSignInput): string | null {
  const pem = process.env.PLAN_ENTITLEMENT_JWT_PRIVATE_KEY_PEM?.replace(/\\n/g, "\n")?.trim();
  if (!pem) return null;

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 72 * 3600;
  const payload = {
    iss: "pocket-ledger-sync-plan",
    sub: input.companyId,
    local_id: input.localCompanyId,
    plan: input.planId,
    plan_exp: input.planExpiryMs,
    off_until: input.offlineLicenseValidUntilMs,
    device: input.deviceId,
    iat: now,
    exp,
  };
  const header = { alg: "RS256", typ: "JWT" };
  const enc = (o: object) => toBase64Url(Buffer.from(JSON.stringify(o), "utf8"));
  const unsigned = `${enc(header)}.${enc(payload)}`;
  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  const sigBuf = sign.sign(pem);
  const sig = toBase64Url(sigBuf);
  return `${unsigned}.${sig}`;
}
