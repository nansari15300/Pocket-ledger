/**
 * Local-first security architecture — implementation status (tamper resistance / accounting-grade, not bank-grade).
 * UI me debug/settings se dikhane ke liye export; har milestone par `done` update karo.
 */
export type SecurityArchitectureChecklistItem = {
  id: string;
  done: boolean;
  note?: string;
};

export const SECURITY_ARCHITECTURE_CHECKLIST: SecurityArchitectureChecklistItem[] = [
  {
    id: "entitlement-jws-server",
    done: true,
    note: "`/api/company/sync-plan` RS256 `planEntitlementJws` (env `PLAN_ENTITLEMENT_JWT_PRIVATE_KEY_PEM`).",
  },
  {
    id: "entitlement-jws-client-verify",
    done: true,
    note: "`verifyPlanEntitlementJws` + `NEXT_PUBLIC_PLAN_ENTITLEMENT_JWT_PUBLIC_KEY_PEM`; cache me trust flags.",
  },
  {
    id: "sqlite-plan-cache-only",
    done: true,
    note: "Plan tier/expiry UI + quotas ab JWT claim se align jab verify OK; warna min(sqlite,cache) expiry gate.",
  },
  {
    id: "outbox-client-write-id-nonce-hash",
    done: true,
    note: "`sync_outbox` columns + SHA-256; flush `runTransaction` + `companies/{fs}/_pl_ledger_idem/{client_write_id}` duplicate-skip (rules me is path allow).",
  },
  {
    id: "outbox-server-replay-reject",
    done: false,
    note: "Client atomic idem doc partial; pura server-trust dedupe = Admin SDK / Cloud Function (TODO).",
  },
  {
    id: "attachment-sha256-native",
    done: true,
    note: "Capacitor `attachment_file_refs.sha256_hex` + write-time hash + read-time verify in pending path.",
  },
  {
    id: "attachment-sha256-web-indexeddb",
    done: false,
    note: "Web `local:` pending blobs abhi IDB — optional hash column jab web bhi SQLite ref use kare.",
  },
  {
    id: "device-id-in-jwt",
    done: true,
    note: "`getOrCreateClientDeviceId` POST body + JWT `device` claim; mismatch par strict mode throw.",
  },
  {
    id: "multi-device-clone-server-detect",
    done: false,
    note: "Server-side device registry + anomaly (same sub, many device) — future billing API.",
  },
  {
    id: "offline-grace-expired-read-only",
    done: true,
    note: "`assertCompanyAllowsLedgerMutations` — paid `plan_exp` past → mutations blocked; grace `off_until` banner alag (`recomputePlanSyncBannerState`).",
  },
  {
    id: "browser-vs-native-security-note",
    done: true,
    note: "`ACCOUNTING_SECURITY_THREAT_MODEL` + checklist; PEM public client par — private key sirf server.",
  },
  {
    id: "threat-model-doc",
    done: true,
    note: "`src/lib/security/threatModel.ts` — goal tamper resistance, not tamper proof.",
  },
];
