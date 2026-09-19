# FY pagination & archive architecture



## Goal



Load **only what the screen needs**, with **dated opening** from the prior period closing.



| Company | Default active load | Opening |

|---------|---------------------|---------|

| **Online + Local** | Current **calendar month** vouchers | Prior month **closing snapshot** as opening |

| **Min 10 txns** | Current month &lt; 10 → backfill earlier months **within running FY** | Opening = month before visible range (or prior FY at FY start) |

| **FY boundary** | Never shows prior-FY vouchers without date filter | Prior FY archived |

| **Date range** | Ledger date button → `useFyLoadOnDateRangeChange` hydrates SQLite + online for that range | Snapshot at range start; clear filter → default month scope |



Prior FY/month data stays in SQLite/Firestore but is **not in active memory** until user expands date range or confirms link-load prompt.



## Layers



1. **`fy_balance_snapshots`** (SQLite) — month/FY closing per party/bank (JSON blob).

2. **`fy_loaded_ranges`** (SQLite) — which date ranges are hydrated in session.

3. **`fy_archive_meta`** (SQLite) — FY keys marked archived (cold).

4. **`FyVoucherScopeContext`** — active scope + `requestLoadRange()` / `requestLoadFyKey()`.

5. **Online** — `ledgerModes/online/fyMonthQueries.ts` + `fyMonthHydrate.ts` — Firestore monthly pages + snapshot docs under `companies/{id}/fySnapshots/{periodKey}`.



## Bill-wise linking



When link dialog finds targets in unloaded FY:



> There are **N** vouchers not loaded from FY **2081–2082**. Load them? **Yes / No**



Yes → `requestLoadFyKey(fyKey)` → merge into active vouchers (`FyLinkLoadMissingPrompt` in `LinkPaymentToTxnsDialog`).



## Back-date save



After save with date in archived FY/month:



1. Rebuild snapshots for affected FY/month (`rebuildFySnapshotsAfterVoucherSave`).

2. Online: write snapshot doc via `fySnapshotSync.ts`.

3. Other devices: delta applies snapshot + vouchers → opening matches.



## Phases



- [x] Phase 1 — SQLite tables + date-range voucher queries + period bounds

- [x] Phase 2 — `FyVoucherScopeProvider` + bootstrap on company open (online month / local FY)

- [x] Phase 3 — Archive meta + on-demand FY hydrate (`archiveBootstrap`, `requestLoadFyKey`)

- [x] Phase 4 — Firebase monthly pagination (`fyMonthHydrate`, `fyMonthQueries`)

- [x] Phase 5 — Back-date rebuild + cloud snapshot sync (`FySnapshotSaveBootstrap`, `voucherSaveHooks`)

- [x] Phase 6 — Dashboard uses `useFyScopedVouchers` (extend to other reports as needed)

- [x] Phase 7 — Bill-wise link missing-FY prompt (`FyLinkLoadMissingPrompt`)



## Key files



| Area | Path |

|------|------|

| Types / bounds | `src/lib/fyPagination/types.ts`, `periodBounds.ts` |

| SQLite | `snapshotStore.ts`, `voucherQueries.ts`, `archiveStore.ts` |

| Scope | `scopeResolver.ts`, `scopeFilter.ts`, `FyVoucherScopeContext.tsx` |

| Bootstrap | `FyVoucherScopeBootstrap.tsx`, `FySnapshotSaveBootstrap.tsx` |

| Hook | `useFyScopedVouchers.ts`, `useFyLinkMissingHints.ts` |

| Link UI | `FyLinkLoadMissingPrompt.tsx`, `linkScopePrompt.ts` |

| Online | `ledgerModes/online/fyMonthQueries.ts`, `fyMonthHydrate.ts`, `fySnapshotSync.ts` |


