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

## Freeze: PL Server and Online Cloud

PL Server/local sharing and online/cloud company behavior are protected areas. **Do not edit these areas unless the human explicitly asks to change PL Server, local server sharing, or online/cloud behavior.**

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
- `src/lib/plServer*.ts`
- `src/lib/plSharingPortRegistry.ts`
- `src/lib/plMirrorProtocol.ts`
- `src/lib/plServerHttpRelay.ts`
- `scripts/dev-pl-local-server-cli.mjs`
- `scripts/run-plserver-company-detection-audit.mjs`
- `scripts/run-phase1b-runtime-verify.mjs`

### Frozen online/cloud paths (do not touch casually)

- `src/firebase/**`
- `src/app/api/company/**`
- `src/app/api/admin/**`
- `src/lib/writeGateway/**`
- `src/lib/companyOnlineSync.ts`
- `src/hooks/useCompanyOnlineSync.ts`
- `src/lib/onlineCompanySelectorSyncPolicy.ts`
- `src/lib/mirrorOnlineCompaniesFromFirestore.ts`
- `src/lib/resolveAuthoritativeFirestoreCompanyId.ts`
- `src/lib/resolveVoucherAttachmentRemoteUrl.ts`
- `src/components/company/FirebaseLedgerOnlineCompanySyncList.tsx`
- `src/components/company/UploadCompanyToCloudCard.tsx`
- `src/components/company/ForceUploadLocalDataButton.tsx`

### Do not

- Refactor, rename, clean up, or drive-by edit PL Server/local sharing code.
- Change PL Server invite/access-token/auth, host/client delta sync, port registry, LAN relay, or attachment delta behavior.
- Change online Firestore/Firebase company sync, cloud upload, write gateway, or cloud attachment behavior for unrelated work.
- Mix Drive sync changes into PL Server or online/cloud behavior unless the request explicitly says to connect those flows.

### If the human explicitly asks to change PL Server or online/cloud

- Keep the change minimal and scoped to that exact request.
- Preserve local-first PL Server behavior and do not silently route PL Server companies through online/cloud code.
- Preserve online/cloud behavior and do not silently route online companies through PL Server/local server code.

## Cursor note

Cursor rules under `.cursor/rules/` should stay aligned with this `AGENTS.md`.
