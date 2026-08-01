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

## Cursor note

Cursor rules under `.cursor/rules/` should stay aligned with this `AGENTS.md`.
