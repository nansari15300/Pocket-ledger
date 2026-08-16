# Agent instructions (any AI)

This file applies to **any** coding agent working in this repo (Cursor, Claude Code, Codex, Copilot Chat, Gemini CLI, Windsurf, etc.). Read it before changing project code.

## Freeze: Backup & Restore

Backup/restore was stabilized for online → local portable `.plbp` with attachments. **Do not edit these areas unless the human explicitly asks to change backup/restore.**

### Frozen paths (do not touch casually)

- `src/components/settings/BackupRestore.tsx`
- `src/components/settings/AutoBackupScheduler.tsx`
- `src/lib/companyBackupCore.ts`
- `src/lib/companyBackupRunner.ts`
- `src/lib/attachmentBackupBundle.ts`
- `src/lib/backupAttachmentPreflight.ts`
- `src/lib/plbpBackupZip.ts`
- `src/lib/incrementalBackupFromLocation.ts`
- `src/lib/localBackupRestoreCompany.ts`
- `src/lib/companyBackupCollections.ts`
- `src/lib/companyRestoreProgress.ts`
- `src/hooks/useCompanyBackupRun.ts`

### Do not

- Refactor, rename, “clean up”, or drive-by edit the frozen paths.
- Change backup source mode, attachment missing-file policy, restore order, or orphan-delete hold without an explicit request.
- Touch frozen files while doing unrelated UI / ledger / sync work.

### If the human explicitly asks to change backup/restore

- Keep the change minimal and scoped to the request.
- Preserve: SQLite-only static backup, download vs continue-local-only prompt, pending `local:` embed, restore attachment hold (no orphan wipe of restored bytes), zip byte sniff on restore.

## Freeze: PDF Portal Preview

PDF attachment portal preview was stabilized so PDF files behave like image previews:

- no blurry low-resolution thumbnail flash in the portal
- full-quality first-page raster is cached separately from the small row thumbnail
- repeated portal opens must not reuse revoked `blob:` URLs or collapse to an empty strip
- fit-window must stay stable on first click and repeat clicks

### Frozen preview paths (do not touch casually)

- `src/components/vouchers/AttachmentHoverPortal.tsx`
- `src/components/vouchers/attachmentHoverPreviewBody.tsx`
- `src/hooks/useAttachmentThumbDisplayUrl.ts`
- `src/lib/attachmentHoverBlobCache.ts`
- `src/lib/pdfToImage.ts`

### Do not

- Revert PDF portal preview back to browser/PDF iframe rendering for this portal.
- Mix the full-quality PDF portal raster cache with the small `::cell-thumb` cache.
- Revoke a cached `blob:` URL without removing that exact cache entry.
- Change PDF preview fit/zoom behavior unless the human explicitly asks.

### If the human explicitly asks to change PDF preview

- Keep row thumbnails small.
- Keep portal preview direct and clear once the PDF raster is cached.
- Preserve repeat-click behavior: first click, close, second click must show the file again.

### Not frozen (backup preview UI OK)

Display/thumb fixes may touch `FilePreview`, `attachmentHoverPreviewBody`, `useAttachmentThumbDisplayUrl`, etc. **without** changing backup pack / restore write logic, unless the human asks to change backup itself. For PDF portal preview, follow the freeze above.

## Freeze: Online Company Sync (hard)

**Online company sync is frozen for every AI.** Do not edit online sync logic unless the human explicitly asks to change **online / Firebase / cloud company sync**.

Stabilized behavior to preserve:
- Firestore live listeners / delta (change-only) sync
- Online company select / mirror / cloud upload
- Write gateway for online companies
- Online attachment HTTPS URL + Storage byte sync

### Frozen online company sync paths (do not touch casually)

- `src/firebase/**`
- `src/app/api/company/**`
- `src/app/api/admin/**`
- `src/lib/writeGateway/**`
- `src/lib/companyOnlineSync.ts`
- `src/hooks/useCompanyOnlineSync.ts`
- `src/lib/onlineCompanySelectorSyncPolicy.ts`
- `src/lib/mirrorOnlineCompaniesFromFirestore.ts`
- `src/lib/firestoreToLocalCompanyPull.ts`
- `src/lib/firebaseLedgerSyncPolicy.ts`
- `src/lib/firebaseLedgerSyncMode.ts`
- `src/lib/firebaseLedgerCompanySyncPrefs.ts`
- `src/lib/firebaseLedgerDataSyncDisabled.ts`
- `src/lib/companyOnlineIntegrity.ts`
- `src/lib/companyOnlineSlots.ts`
- `src/lib/apkOnlineFirestoreWritePolicy.ts`
- `src/lib/companyAttachmentStrategies/onlineCompanyAttachmentStrategy.ts`
- `src/lib/resolveAuthoritativeFirestoreCompanyId.ts`
- `src/lib/resolveVoucherAttachmentRemoteUrl.ts`
- `src/components/FirebaseLedgerDeltaSyncManager.tsx`
- `src/components/company/FirebaseLedgerOnlineCompanySyncList.tsx`
- `src/components/company/UploadCompanyToCloudCard.tsx`
- `src/components/company/ForceUploadLocalDataButton.tsx`
- `src/components/layout/FirebaseLedgerSyncModeSwitch.tsx`
- `src/components/layout/FirebaseLedgerDataSyncSidebarSwitch.tsx`

### Do not (online)

- Refactor, rename, “clean up”, or drive-by edit online sync paths.
- Change Firestore listeners, delta watermarking, cloud upload, write gateway, or Storage attachment linking for unrelated work.
- While fixing **PL Server**, do **not** edit online sync files — read them only as a behavior reference and implement fixes under PL Server paths.
- Do not “share” helpers if that forces online sync files to change; duplicate minimally on the PL side instead.

### If the human explicitly asks to change online sync

- Keep the change minimal and scoped to that exact request.
- Do not silently route online companies through PL Server/local server code.

## Freeze: PL Server / local sharing

PL Server/local sharing is protected. **Do not edit these areas unless the human explicitly asks to change PL Server or local server sharing.**

When the human asks for PL Server fixes (including “make PL like online”):
- Change **only** PL Server paths below.
- Leave **Online Company Sync** frozen (section above).
- Match online *behavior* by reimplementing on the PL side; do not modify online sync code to drive PL.

### Frozen PL Server paths (do not touch casually)

- `localAppServer.js`
- `staticAppServer.js`
- `electron/localAppServer.js`
- `electron/staticAppServer.js`
- `electron/plServerCompanyDetectionAudit.js`
- `electron/plMirrorProtocol.cjs`
- `electron/localAppServerAccessTokens.js`
- `src/components/settings/PlServerLiveSyncManager.tsx`
- `src/components/settings/PlServerHostAttachmentDeltaBootstrap.tsx`
- `src/components/settings/PlServerGateRefreshBootstrap.tsx`
- `src/components/settings/PlServerGateLedgerBootstrap.tsx`
- `src/components/settings/PlServerGateLandingBootstrap.tsx`
- `src/components/settings/PlServerClientDeltaManager.tsx`
- `src/components/settings/PlServerAccessCompanyBanner.tsx`
- `src/components/settings/PlServerAccessBootstrap.tsx`
- `src/components/settings/PlRemoteClientLandingBootstrap.tsx`
- `src/components/settings/PlFirebaseAuthHandoffBootstrap.tsx`
- `src/components/settings/LocalServerShareAutoConnectManager.tsx`
- `src/components/settings/LocalPlServerSharePanel.tsx`
- `src/components/settings/LocalPlServerSharedCompaniesPicker.tsx`
- `src/components/company/PlServerShareUserDialog.tsx`
- `src/components/company/PlServerSharedCompanyUrlDialog.tsx`
- `src/components/ServerShareableCompaniesBridge.tsx`
- `src/components/PlServerAttachmentPreloadManager.tsx`
- `src/lib/plServer*.ts`
- `src/lib/plSharingPortRegistry.ts`
- `src/lib/plMirrorProtocol.ts`
- `src/lib/plServerHttpRelay.ts`
- `scripts/dev-pl-local-server-cli.mjs`
- `scripts/run-plserver-company-detection-audit.mjs`
- `scripts/run-phase1b-runtime-verify.mjs`

### Do not (PL Server)

- Refactor, rename, clean up, or drive-by edit PL Server/local sharing code when not requested.
- Change PL Server invite/access-token/auth, host/client delta sync, port registry, LAN relay, or attachment delta behavior for unrelated work.
- Mix Drive sync or online/cloud edits into PL Server work unless the request explicitly says to connect those flows.
- Silently route PL Server companies through online/cloud sync code.

### If the human explicitly asks to change PL Server

- Keep the change minimal and scoped to that exact request.
- Preserve local-first PL Server behavior.
- Do not edit frozen Online Company Sync paths while doing PL work.

## Admin Panel Company (hard — every AI)

**Any agent working on Admin Panel Company / Admin “Company” menu / admin subscription ledger / future PL Server Gold admin accounting must read this section (and `docs/ADMIN_PANEL_COMPANY_AGENT_RULES.md`, plus `.cursor/rules/admin-panel-company.mdc` when present) before editing.**

### Product intent

- One **Admin Panel Company** ledger for Pocket Ledger’s own books (subscribers as parties, subscription payments as sales, agents/commission, bank/staff/tax/expense).
- **Zero edits** to normal company product code: copy UI into an isolated folder, then edit only the copy.
- Data root: Firestore/Storage **`admin_panel_companies/{tenantId}/…`**, never normal `companies/{id}/…`.
- Future **PL Server Gold**: local host gets its own Admin Panel + Admin Panel Company; platform SuperAdmin email remains the cloud owner. Reserve `tenantId`/`licenseId` shape; do not build Gold install/license unless asked.

### Allowed paths (create / edit here)

- `src/adminPanelCompany/**`
- `src/lib/adminPanelCompany/**`
- `src/lib/adminPanelAccounting/**`
- `src/app/(admin)/admin/company/**` (and Agents→Company entry wiring in admin shell **only as needed**)
- `src/app/api/admin/company/**`
- `.cursor/rules/admin-panel-company.mdc` (this rule)

### Do not

- Edit normal company ledger UI, `useCompany` company flows, or normal `companies/` write paths to “support” Admin Panel Company — **copy instead**.
- Put Admin Panel Company documents under `companies/`.
- Touch frozen Backup / PDF portal / Online sync / PL Server paths for this feature unless the human explicitly asks for that area.
- Weaken this rule by “sharing” helpers that force changes to normal company modules.

### If the human explicitly asks to change normal company code for Admin Panel Company

- Prefer copy-isolate first; only edit normal company paths if that same message clearly overrides this rule.

## Cursor note

Cursor rules under `.cursor/rules/` should stay aligned with this `AGENTS.md`.
