"use client";

/**
 * pocket-ledger.com `/api/company/sync-plan` kill-switch.
 * Filhal ON rakho taaki local demo plan restart / periodic sync se basic na ho.
 *
 * Ledger Firestore sync alag hai: `firebaseLedgerDataSyncDisabled.ts`
 */

/** `true` = hosted plan sync band, `false` = chalu, `null` = default (chalu). */
export const HOSTED_PLAN_SYNC_DISABLED_FORCE: boolean | null = true;

export const HOSTED_PLAN_SYNC_DISABLED_MESSAGE =
  "Hosted plan sync is temporarily disabled — local demo plan on this device is kept.";

export function isHostedPlanSyncDisabled(): boolean {
  return HOSTED_PLAN_SYNC_DISABLED_FORCE === true;
}
