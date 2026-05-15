"use client";

/**
 * RS256 JWT verify (sync-plan `planEntitlementJws`) — public key sirf env se; private key kabhi client bundle me nahi.
 */

function base64UrlToUint8Array(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** PEM body decode — ignore headers/whitespace. */
function pemPublicKeyToSpkiBytes(pem: string): Uint8Array {
  const lines = pem
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("-----"));
  const b64 = lines.join("");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export type PlanEntitlementClaims = {
  iss?: string;
  sub?: string;
  local_id?: string;
  plan?: string;
  plan_exp?: number;
  off_until?: number;
  device?: string;
  iat?: number;
  exp?: number;
};

export type VerifyPlanEntitlementJwsResult =
  | { ok: true; claims: PlanEntitlementClaims }
  | { ok: false; reason: string };

/**
 * `NEXT_PUBLIC_PLAN_ENTITLEMENT_JWT_PUBLIC_KEY_PEM` set ho to RS256 verify; warna verify skip (dev / legacy).
 */
export async function verifyPlanEntitlementJws(jws: string): Promise<VerifyPlanEntitlementJwsResult> {
  const pem =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_PLAN_ENTITLEMENT_JWT_PUBLIC_KEY_PEM?.trim() : "";
  if (!pem) return { ok: false, reason: "no_public_key_configured" };
  const parts = jws.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed_jwt" };
  const [h, p, s] = parts;
  if (!h || !p || !s) return { ok: false, reason: "malformed_jwt" };
  let payloadJson: string;
  try {
    const pad = p.length % 4 === 0 ? "" : "=".repeat(4 - (p.length % 4));
    payloadJson = atob(p.replace(/-/g, "+").replace(/_/g, "/") + pad);
  } catch {
    return { ok: false, reason: "bad_payload_b64" };
  }
  let claims: PlanEntitlementClaims;
  try {
    claims = JSON.parse(payloadJson) as PlanEntitlementClaims;
  } catch {
    return { ok: false, reason: "bad_payload_json" };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === "number" && claims.exp < nowSec) {
    return { ok: false, reason: "jwt_expired" };
  }
  try {
    const key = await importRsaSpkiPublicKeyFromPem(pem);
    const data = new TextEncoder().encode(`${h}.${p}`);
    const sig = base64UrlToUint8Array(s);
    // TS `BufferSource` + SharedArrayBuffer typing: explicit copy se subtle.verify args stable.
    const sigBytes = new Uint8Array(sig);
    const ok = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, sigBytes, data);
    if (!ok) return { ok: false, reason: "signature_invalid" };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "verify_error" };
  }
  return { ok: true, claims };
}

async function importRsaSpkiPublicKeyFromPem(pem: string): Promise<CryptoKey> {
  const bytes = pemPublicKeyToSpkiBytes(pem);
  const spki = new Uint8Array(bytes);
  return crypto.subtle.importKey("spki", spki, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
}
