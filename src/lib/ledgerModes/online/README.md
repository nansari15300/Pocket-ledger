# Online mode (`ledgerModes/online`)

Firebase-backed companies: SQLite-first writes, `sync_outbox` → Firestore, attachments `local:` → Storage HTTPS.

**Do not put PL Server or pure Drive logic here.**

Implementation migrates here from:
- `writeGateway/voucherActionsClient.ts` (online branches)
- `localVoucherOutbox.ts` (hydrate + cloudSafe)
- `hydrateVoucherLocalAttachmentsForServer.ts`
- `companyAttachmentStrategies/onlineCompanyAttachmentStrategy.ts`

See `docs/LEDGER_MODE_ARCHITECTURE.md` Phase 1–2.
