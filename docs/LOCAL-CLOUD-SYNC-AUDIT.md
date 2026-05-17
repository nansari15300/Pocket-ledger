# Local company cloud sync — audit & architecture

## Audit summary (pre-implementation)

### Already existed

| Area | Status | Location |
|------|--------|----------|
| Browser SQLite ledger | **Yes** | `src/lib/localSqlite.ts` — `companies`, `company_docs`, `sync_outbox` |
| Firestore sync (cloud companies) | **Yes** | `src/lib/localVoucherOutbox.ts` → `flushVoucherOutbox` |
| Soft delete (`isDeleted`) | **Yes** | `src/lib/ledgerTombstone.ts`, recycle bin |
| Hard delete | **Yes** | Recycle bin permanent delete only (`recycle-bin/page.tsx`) |
| Google Drive OAuth tokens | **Partial** | `user_tokens/{uid}/google/drive` — backup UI only |
| `SyncSettings` UI | **Unwired** | `src/components/settings/SyncSettings.tsx` |
| Incremental sync client | **Stub** | `src/lib/incrementalSyncClient.ts` — external Node server (not in repo) |
| Dropbox | **No** | — |
| Delta op files on Drive | **No** | — |
| `lastSyncedOp` / manifest | **No** | — |

### Design rule

- **Firestore companies** → existing `sync_outbox` + Firestore only.
- **Pure local companies** (`storageOption: local`, no `authoritativeCompanyId`) → optional **Drive/Dropbox** via new `cloud_sync_outbox` (never full SQLite upload).

## New modules

| Path | Role |
|------|------|
| `src/lib/localCloudSync/*` | Queue, engine, conflict, providers |
| `src/lib/localCloudSync/server/driveTransportServer.ts` | Drive folder `accounting-sync/company_{id}/ops/` |
| `src/app/api/local-cloud-sync/drive/*` | Authenticated transport API |
| `src/components/LocalCompanyCloudSyncManager.tsx` | 30s background worker |
| `src/components/company/LocalCompanyCloudSyncSettings.tsx` | Company edit UI |

## Schema migration (v3)

- `cloud_sync_outbox` — pending delta ops
- `cloud_sync_meta` — `last_local_op_seq`, `last_synced_op`, status

## Sync flow

1. Local write → `upsertCompanyDocInBrowserDb` → `enqueueLocalCloudSyncOp` (if enabled).
2. Every 30s (online, not locked): upload pending ops → download ops `> lastSyncedOp` → apply with conflict rules → update manifest.
3. Conflict: latest `updatedAt` wins; **delete beats update**.

## Edge cases

- Offline: enqueue only; worker skips.
- Overlapping sync: per-company lock in engine.
- Remote apply: `skipCloudSyncEnqueue` prevents loops.
- Firestore companies: `canSyncCompanyToServer` gate — no cloud sync queue.

## Migration

- Existing DBs auto-migrate on next `getBrowserDb()` (PRAGMA user_version 3).
- Company fields: `cloudSyncEnabled`, `cloudSyncProvider`, `cloudSyncLastSyncAt`, `cloudSyncStatus`, `cloudSyncLastError`.

## Remaining work

- Dropbox OAuth + transport (provider stub throws).
- Attachment upload dedupe by `sha256Hex` (API stub).
- Wire `CreateCompanyForm` optional cloud sync on create.
- Deprecate or merge unwired `SyncSettings` / `incrementalSyncClient`.
