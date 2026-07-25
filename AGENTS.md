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

### Not frozen (preview UI OK)

Display/thumb fixes may touch `FilePreview`, `attachmentHoverPreviewBody`, `useAttachmentThumbDisplayUrl`, etc. **without** changing backup pack / restore write logic, unless the human asks to change backup itself.

## Cursor note

Cursor also has `.cursor/rules/freeze-backup-restore.mdc` for the same freeze. Prefer keeping both aligned with this `AGENTS.md`.
