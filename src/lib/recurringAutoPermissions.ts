import type { Permission } from "@/lib/permissions";

/** Dashboard “Auto recurring” card — sirf is permission par. */
export function canViewRecurringAutoSummaryCard(can: (p: Permission) => boolean): boolean {
  return can("view_recurring_auto_summary");
}

/** Manage Sharing → Recurring Auto Voucher: journal strip dikhane ke liye. */
export function canViewRecurringVoucherControls(can: (p: Permission) => boolean): boolean {
  return can("view_recurring_voucher_controls");
}

/** Company master ON/OFF + run scope (dashboard switch / Voucher Settings). */
export function canConfigureRecurringAutoCompany(can: (p: Permission) => boolean): boolean {
  return can("configure_recurring_auto_company");
}

/** Switch ON — `add`; OFF / schedule change — `edit`. */
export function canChangeRecurringAutoMonthlyOnVoucher(can: (p: Permission) => boolean): boolean {
  return can("add_recurring_auto_monthly") || can("edit_recurring_auto_monthly");
}

/** Voucher Save par template ON karna — sirf add (ya edit jab pehle se ON ho). */
export function canTurnOnRecurringAutoMonthlyOnSave(
  can: (p: Permission) => boolean,
  alreadyCommittedOn: boolean,
): boolean {
  if (alreadyCommittedOn) return can("edit_recurring_auto_monthly");
  return can("add_recurring_auto_monthly");
}

/** Nested settings dialog + schedule save. */
export function canEditRecurringAutoMonthly(can: (p: Permission) => boolean): boolean {
  return can("edit_recurring_auto_monthly");
}

/** Generate now, missed-period Create, batch picker. */
export function canGenerateRecurringVoucherNow(can: (p: Permission) => boolean): boolean {
  return can("generate_recurring_voucher_now");
}
