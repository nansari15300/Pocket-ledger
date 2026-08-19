# Ledger mode architecture — Online / Local·Drive / PL Server

**Purpose:** UI ek hi rahe (Dashboard, Party ledger, voucher forms, masters). **Logic teen alag pipelines** me split ho — ek mode change doosre ko na tode.

**Human intent (Aug 2026):** Online company = SQLite-first local save → instant Firebase sync when online → queue when offline → **timestamp wins, delete wins**. PL Server / pure local = **as-is, alag folder, touch mat karo** jab tak explicitly na bolein.

---

## 1. Three runtime modes (product)

| Mode | Company signals | Data home | Attachment bytes | Cross-device |
|------|-----------------|-----------|------------------|--------------|
| **Online** | `storageOption: firebase`, `syncPolicy: online`, cloud-linked registry | Firestore + Firebase Storage | `https://…` after hydrate | Web ↔ EXE ↔ APK via Firestore delta |
| **Local · Drive** | `storageOption: local` or `drive`, no online sync | SQLite (+ optional Google Drive mirror) | `local:` / `drive:` | Same device + Drive folder; **not** Firebase |
| **PL Server** | `plServerShared`, host/client delta | Host SQLite + LAN relay | `local:` → host `/__pl_attachment` | LAN clients only; **not** Firebase |

**Router entry (target):** `resolveLedgerMode(company)` → `"online" | "localDrive" | "plServer"`.

---

## 2. Target source tree (copy → edit in mode folder, UI shared)

```
src/
├── components/                    # UI ONLY — same screens all modes
│   ├── dashboard/
│   ├── party/
│   ├── vouchers/                  # Forms call mode adapters; no mode if/else deep inside
│   └── ...
│
├── lib/
│   ├── ledgerModes/               # ★ NEW — all mode-specific business logic lives here
│   │   ├── shared/                # Contracts both modes may import (types, normalize, timestamps)
│   │   │   ├── types.ts
│   │   │   ├── documentTimestamps.ts   # updatedAtMs, delete wins, merge rules
│   │   │   ├── attachmentNormalize.ts  # thin re-export → voucherAttachmentNormalize
│   │   │   └── formFinalize.ts         # thin wrapper → finalizeVoucherAttachmentsAfterFormSave
│   │   │
│   │   ├── online/                # ★ Firebase online company ONLY
│   │   │   ├── README.md
│   │   │   ├── write/
│   │   │   │   ├── voucherSave.ts        # Firestore path from saveVoucher online branch
│   │   │   │   ├── voucherPatch.ts
│   │   │   │   ├── masterSave.ts         # party/item/staff/… cloud writes
│   │   │   │   └── outboxFlush.ts        # localVoucherOutbox online flush policy
│   │   │   ├── sync/
│   │   │   │   ├── deltaListener.ts      # adapter over firebase listeners (read-only bridge)
│   │   │   │   ├── mirrorPolicy.ts
│   │   │   │   └── attachmentHydrate.ts  # local: → Storage HTTPS before Firestore
│   │   │   ├── attachments/
│   │   │   │   ├── stageOrUpload.ts      # web direct HTTPS; EXE stage local:
│   │   │   │   ├── pendingQueue.ts       # sync with localPendingFiles online path
│   │   │   │   └── displayStrategy.ts    # onlineCompanyAttachmentStrategy
│   │   │   └── index.ts                  # public API for online mode
│   │   │
│   │   ├── localDrive/            # ★ Device-local + Google Drive (NOT Firebase online)
│   │   │   ├── README.md
│   │   │   ├── write/
│   │   │   │   ├── voucherSave.ts
│   │   │   │   └── masterSave.ts
│   │   │   ├── sync/
│   │   │   │   ├── driveEngine.ts        # adapter → localCloudSync/engine
│   │   │   │   └── driveAttachmentPath.ts
│   │   │   ├── attachments/
│   │   │   │   ├── stageLocal.ts
│   │   │   │   └── displayStrategy.ts    # localCompanyAttachmentStrategy
│   │   │   └── index.ts
│   │   │
│   │   ├── plServer/              # ★ PL Server shared companies — WRAPPERS ONLY at first
│   │   │   ├── README.md          # "Do not duplicate frozen plServer*.ts — import adapters"
│   │   │   ├── write/
│   │   │   │   └── voucherSaveAdapter.ts
│   │   │   ├── attachments/
│   │   │   │   └── hostUploadAdapter.ts
│   │   │   └── index.ts
│   │   │
│   │   └── resolveLedgerMode.ts   # single gate: company → mode folder
│   │
│   ├── writeGateway/              # LEGACY — shrink to thin dispatch → ledgerModes/{mode}
│   ├── firebase/                  # FROZEN online sync (listeners) — bridge only from online/
│   ├── plServer*.ts               # FROZEN — PL Server product code
│   └── localCloudSync/            # FROZEN-ish Drive — localDrive/ adapters call in
│
├── hooks/
│   └── useVouchers.tsx            # UI state; patches via ledgerModes/{mode}
│
└── app/
    └── api/
        ├── company/               # FROZEN online API — online/ adapters may call
        └── ...
```

### Migration rule (every AI)

1. **UI file me mode logic mat badhao.** Form save = `ledgerModes.resolve(mode).voucher.save(...)`.
2. **Pehle copy, phir edit:** shared file me online-only branch dikhe → copy snippet → `ledgerModes/online/`, original ko dispatch-only chhodo.
3. **Kabhi bhi** online fix ke liye `plServer*` ya `localCloudSync` frozen paths mat chhedo.
4. **Kabhi bhi** local/Drive behaviour online folder me mat ghusao (aur vice versa).
5. Naya feature = teen folders me alag implement **ya** `shared/` me neutral helper + teen thin wrappers.

---

## 3. Online mode — data contract (target behaviour)

### Save / edit / delete (vouchers + masters)

```
User action (any client: web, EXE, APK)
    │
    ▼
① LOCAL FIRST — SQLite company_docs (+ IndexedDB bytes if attachment)
    │   updatedAtMs / clientSequence on every write
    ▼
② OUTBOX ROW — sync_outbox (idempotent doc id)
    │
    ├── ONLINE NOW ──► flush immediately
    │       hydrate attachments (local: → HTTPS)
    │       Firestore set/merge with cloudSafe fileUrls
    │       mirror readback → SQLite
    │
    └── OFFLINE ──► queue; VoucherOutboxFlushManager / reconnect flush
            same path when network returns
    ▼
③ OTHER DEVICES — Firestore listener / delta watermark
    apply if remote.updatedAtMs > local OR delete tombstone wins
```

### Attachment-specific (online)

| Step | EXE / APK | Hosted web |
|------|-----------|------------|
| New file on save | Stage `local:` + IndexedDB → outbox hydrate → HTTPS | Direct Storage upload → HTTPS in payload |
| Edit add file | Same | Same |
| Delete file | `fileUrls: []` or explicit list **must** flush; delete wins on merge | Same |
| Cross-device display | Firestore `fileUrls` HTTPS only | Hide unresolvable `local:` |
| Failed hydrate | **Never** write `fileUrls: []` over existing HTTPS | N/A |

### Conflict rules

- **Timestamp:** Higher `updatedAtMs` (or server `updatedAt` if tied) wins field-level merge for masters/vouchers.
- **Delete wins:** Tombstone / explicit delete marker beats stale attachment list from lagging client.
- **Attachments:** Empty `fileUrls` in outbox only applies when user explicitly cleared files in that save (not “hydrate failed”).

---

## 4. Known gaps (Aug 2026 — why EXE ↔ dev web attachment broken)

| Gap | Symptom | Fix lane |
|-----|---------|----------|
| Note / some forms missing journal post-save snapshot | EXE save OK locally; web never gets URLs | `shared/formAttachmentPostSave.ts` hook → all voucher forms |
| `cloudSafeVoucherFileUrls` on failed hydrate | Firestore `[]`; web empty; EXE still shows local | `online/attachments/` + outbox flush guard |
| `dispatchSavedVoucherAttachmentUrls` skipped while `local:` | Cache stale until flush | online flush must complete before UI considers save done |
| Dual path: outbox hydrate vs `syncPendingFiles` | Partial file list | Single owner in `online/attachments/pendingQueue.ts` |
| Dev delete → EXE generic icon | Stale HTTPS / local blob cache | online delete must patch Firestore + live patch with `previousUrls` |

**PL Server:** Not in scope for above fixes unless human explicitly asks.

---

## 5. Phased rollout (do not big-bang)

| Phase | Work | Touches |
|-------|------|---------|
| **0** | This doc + `.cursor/rules/ledger-mode-isolation.mdc` | docs only |
| **1** | Online attachment contract fixes (hydrate guard, form parity hook, delete sync) | `ledgerModes/online/attachments/*`, forms, outbox |
| **2** | `resolveLedgerMode` + move online voucher save behind adapter | `writeGateway` dispatch only |
| **3** | Local/Drive adapters (copy existing local paths) | `ledgerModes/localDrive/` |
| **4** | PL Server adapters (import frozen modules) | `ledgerModes/plServer/` wrappers |
| **5** | Masters (party/item/staff) same pattern | per-mode `masterSave.ts` |

---

## 6. UI map (unchanged — examples)

```
Dashboard          → components/dashboard/*     → data: ledgerModes.resolve(mode)
Party ledger       → components/party/*         → same
Voucher forms      → components/vouchers/*    → save: mode.voucher.save(...)
Masters dialogs    → components/party|staff|… → save: mode.master.save(...)
Settings/Backup    → FROZEN own paths (AGENTS.md)
Admin Panel Co.    → FROZEN admin_panel_companies/*
```

---

## 7. Files still shared (allowed)

- `src/components/**` — presentation
- `src/lib/ledgerModes/shared/**` — neutral helpers
- `src/lib/voucherAttachmentNormalize.ts` — until fully re-exported from shared
- Types in `src/components/party/types.ts`, etc.

## 8. Files that must NOT absorb cross-mode logic

- `src/lib/plServer*.ts` — PL only (frozen)
- `src/firebase/**` — online listener infra (frozen)
- `src/lib/companyOnlineSync.ts` — online (frozen); new code → `ledgerModes/online/sync/`
- `src/lib/localCloudSync/**` — Drive (touch only for Drive features)

---

## 9. AI checklist before any sync/attachment PR

- [ ] Which mode? (`online` / `localDrive` / `plServer`)
- [ ] Change only under that mode folder (+ shared if neutral)
- [ ] UI untouched except wiring to adapter
- [ ] PL Server / online frozen paths untouched unless ticket says so
- [ ] Delete wins + timestamp documented in commit message
- [ ] Cross-device test: EXE add → web; web add → EXE; web delete → EXE

---

*Last updated: 2026-08-19 — attachment EXE↔web desync + mode isolation initiative.*
