# Local · Drive mode (`ledgerModes/localDrive`)

Device-local SQLite and optional Google Drive mirror. Refs: `local:`, `drive:`.

**Do not call Firebase Storage hydrate from this folder.**

Wraps existing:
- `localCloudSync/**`
- `companyAttachmentStrategies/localCompanyAttachmentStrategy.ts`

See `docs/LEDGER_MODE_ARCHITECTURE.md`.
