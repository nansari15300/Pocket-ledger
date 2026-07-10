/**
 * PLServer LAN stability — FROZEN boundaries (Jul 2026 → mirror-first staff).
 *
 * Scope: local company + PlServer share (`plServerShared` / server gate) ONLY.
 * Do NOT change online Firebase company write/read paths when editing this area.
 *
 * Invariants (do not regress):
 * 1. LAN client save must NOT await full ledger pull — background refresh only.
 * 2. Thin staff client (`isPlServerThinStaffClient`): user-side SQLite `company_docs` mirror
 *    (online-company style). Server pull dual-writes SQLite; UI reads SQLite; offline save →
 *    local SQLite + pending authoritative replay when Host reachable. Display cache optional warm only.
 * 3. After authoritative HTTP upsert (or pending enqueue): optimistic `local_commit` (same doc in SQLite).
 * 4. Server mirror pull tie-break: incoming wins (`mergePreferNewerTieBreak: "incoming"`).
 * 5. Attachments on LAN: flush upload queue before voucher save; fetch via `/__pl_attachment`.
 *    Host save must mirror bytes to bridge via loopback `POST /__pl_attachment` (main vs bridge storage split).
 * 6. HTTP POST/attachment fetch: bounded timeout (gateHttpPost / gateHttpFetchBlob) — save must not hang forever.
 * 7. PlServer staff live sync: poll + post-pull UI bumps; isPlServerSharedCompanyRow for scheduler.
 * 8. Push + pull same transport: `resolvePlServerMirrorTransport` → active gate `serverUrl`.
 *
 * Touch list (PlServer-only):
 * - plServerThinStaffClient.ts, plServerDisplayCache.ts
 * - plServerClientAuthoritativeWrite.ts
 * - localCompanyDocMirror.ts
 * - plServerClientCompanyMirror.ts
 * - plServerClientMirrorPush.ts
 * - plServerStaffOfflinePolicy.ts, plServerStaffCompanyConnect.ts
 * - plServerAttachmentUploadQueue.ts
 * - voucherActionsClient.ts
 * - ResolvedEntityAvatar.tsx, FilePreview.tsx, gateServerFetch.ts
 */
export const PL_SERVER_LAN_STABILITY_FREEZE_VERSION = 3 as const;
