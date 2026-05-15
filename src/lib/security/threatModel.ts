/**
 * Accounting-grade security — explicit threat model (architecture base layer).
 *
 * - **Goal:** tamper *resistance* + audit-friendly controls — **not** bank-grade tamper *proof*.
 * - **Browser:** secrets / SQLite fully client-side — sophisticated attacker DB edit kar sakta hai;
 *   isliye **plan/premium** = sirf **server-signed entitlement (JWS)** + short TTL; SQLite/localStorage = cache.
 * - **Electron / native:** `safeStorage` / OS keystore se key material behtar protect ho sakta hai — abhi app hybrid.
 * - **Outbox replay:** client `client_write_id` + `nonce` + `payload_hash`; server future me duplicate reject.
 * - **Attachments:** `sha256` store + open-time verify (native paths) — swap detect.
 */

export const ACCOUNTING_SECURITY_THREAT_MODEL =
  "Pocket Ledger: offline-first security = signed entitlements + integrity checks + server authority for billing; " +
  "client storage is untrusted; resistance not absolute proof.";
