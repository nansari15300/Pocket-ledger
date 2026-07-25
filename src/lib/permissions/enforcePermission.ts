/**
 * Permission enforcement helper for mutation operations
 * Throws error if permission is denied, which should be caught and shown as toast
 */

import { format, startOfDay, differenceInCalendarDays } from "date-fns";
import type { Permission } from "@/lib/permissions";
import { normalizeVoucherDateForBackdateCheck } from "@/lib/voucherDateNormalize";
import { companyShareRoleLabel } from "@/lib/localCompanyAppRoles";

export class PermissionDeniedError extends Error {
  constructor(message: string = "No permission") {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

export type BackdatePermissionAction = "entry" | "edit" | "delete";

export type BackdatePermissionLimits = {
  entryDays: number;
  editDays: number;
  deleteDays: number;
};

export type BackdatePermissionEvaluation = {
  allowed: boolean;
  action: BackdatePermissionAction;
  ageInDays: number;
  limit: number;
  recordDateLabel: string;
  todayLabel: string;
  /** Raw year before BS→AD normalize (debug: 2082 AD misread). */
  rawRecordYear: number | null;
  normalizedFromLikelyBs: boolean;
};

const BACKDATE_ACTION_LABEL: Record<BackdatePermissionAction, string> = {
  entry: "entry",
  edit: "edit",
  delete: "delete",
};

/** Same rules as `usePermissions` backdate check — shared for toast detail text. */
export function evaluateBackdatePermission(
  action: BackdatePermissionAction,
  recordDate: Date | undefined,
  dateLimits: BackdatePermissionLimits,
  role: string
): BackdatePermissionEvaluation {
  const today = startOfDay(new Date());
  const todayLabel = format(today, "yyyy-MM-dd");
  const limit = dateLimits[`${action}Days`] ?? 0;

  if (role === "owner" || !recordDate) {
    return {
      allowed: true,
      action,
      ageInDays: 0,
      limit: limit >= 9999 ? 9999 : limit,
      recordDateLabel: todayLabel,
      todayLabel,
      rawRecordYear: null,
      normalizedFromLikelyBs: false,
    };
  }

  const rawDate =
    recordDate instanceof Date && !isNaN(recordDate.getTime())
      ? recordDate
      : new Date(recordDate as unknown as string | number);
  const rawRecordYear = !isNaN(rawDate.getTime()) ? rawDate.getFullYear() : null;
  const normalized = normalizeVoucherDateForBackdateCheck(rawDate);
  const normalizedFromLikelyBs =
    rawRecordYear != null &&
    rawRecordYear >= 2070 &&
    rawRecordYear <= 2200 &&
    normalized.getFullYear() !== rawRecordYear;
  const recordDay = startOfDay(normalized);
  const recordDateLabel = format(recordDay, "yyyy-MM-dd");
  const ageInDays = differenceInCalendarDays(today, recordDay);

  if (limit >= 9999) {
    return {
      allowed: true,
      action,
      ageInDays,
      limit: 9999,
      recordDateLabel,
      todayLabel,
      rawRecordYear,
      normalizedFromLikelyBs,
    };
  }

  let allowed: boolean;
  if (limit === 0) {
    allowed = ageInDays === 0;
  } else {
    allowed = ageInDays >= 0 && ageInDays <= limit;
  }

  return {
    allowed,
    action,
    ageInDays,
    limit,
    recordDateLabel,
    todayLabel,
    rawRecordYear,
    normalizedFromLikelyBs,
  };
}

export function formatBackdatePermissionDeniedMessage(
  evaluation: BackdatePermissionEvaluation,
  verb: "create" | "edit" | "delete",
  role?: string
): string {
  const { ageInDays, limit, recordDateLabel, todayLabel, normalizedFromLikelyBs, rawRecordYear } =
    evaluation;
  const actionWord = BACKDATE_ACTION_LABEL[evaluation.action];
  const roleLabel = role ? companyShareRoleLabel(role) : "your role";

  if (ageInDays < 0) {
    const ahead = Math.abs(ageInDays);
    const bsHint =
      normalizedFromLikelyBs && rawRecordYear != null
        ? ` Voucher year ${rawRecordYear} was treated as Bikram Sambat and converted to AD ${recordDateLabel}.`
        : rawRecordYear != null && rawRecordYear >= 2070
          ? ` Voucher year ${rawRecordYear} looks like BS stored as AD — check the voucher date.`
          : "";
    return `${verb === "create" ? "Creating" : verb === "edit" ? "Editing" : "Deleting"} blocked: voucher date ${recordDateLabel} is ${ahead} day(s) in the future (today ${todayLabel}). ${roleLabel} backdate ${actionWord} allows only past dates up to ${limit === 0 ? "today only" : `${limit} day(s)`}.${bsHint}`;
  }

  if (limit === 0) {
    return `${verb === "create" ? "Creating" : verb === "edit" ? "Editing" : "Deleting"} blocked: backdate ${actionWord} is disabled (0 days). Voucher date ${recordDateLabel} is ${ageInDays} day(s) before today ${todayLabel} — only today is allowed (${roleLabel}).`;
  }

  const limitLabel = limit >= 9999 ? "unlimited" : `${limit} day(s)`;
  if (ageInDays > limit) {
    return `${verb === "create" ? "Creating" : verb === "edit" ? "Editing" : "Deleting"} blocked: voucher is ${ageInDays} day(s) backdated (${recordDateLabel}; today ${todayLabel}). ${roleLabel} allows backdate ${actionWord} for up to ${limitLabel} — exceeded by ${ageInDays - limit} day(s).`;
  }

  return `${verb === "create" ? "Creating" : verb === "edit" ? "Editing" : "Deleting"} blocked: voucher is ${ageInDays} day(s) backdated on ${recordDateLabel} (today ${todayLabel}). ${roleLabel} backdate ${actionWord} limit: ${limitLabel}.`;
}

export type CanPerformBackdatedFn = ((
  action: BackdatePermissionAction,
  recordDate?: Date
) => boolean) & {
  explain?: (action: BackdatePermissionAction, recordDate?: Date) => string;
};

/**
 * Asserts that the user has the required permission
 * @param canFn - Function that checks permission (from usePermissions hook)
 * @param permissionKey - Permission to check
 * @param customMessage - Optional custom error message
 * @throws PermissionDeniedError if permission is denied
 */
export function assertCan(
  canFn: (permission: Permission) => boolean,
  permissionKey: Permission,
  customMessage?: string
): void {
  if (!canFn(permissionKey)) {
    throw new PermissionDeniedError(customMessage || "No permission");
  }
}

/**
 * Asserts that the user can perform a backdated action
 * @param canPerformFn - Function that checks backdate limits (from usePermissions hook)
 * @param action - Action type: "create" | "edit" | "delete"
 * @param recordDate - Date of the record being acted upon
 * @param customMessage - Optional custom error message
 * @throws PermissionDeniedError if action is not allowed
 */
export function assertCanPerformBackdated(
  canPerformFn: CanPerformBackdatedFn | ((action: BackdatePermissionAction, recordDate?: Date) => boolean),
  action: "create" | "edit" | "delete",
  recordDate?: Date,
  customMessage?: string
): void {
  const actionMap: Record<"create" | "edit" | "delete", BackdatePermissionAction> = {
    create: "entry",
    edit: "edit",
    delete: "delete",
  };
  const mapped = actionMap[action];

  if (!canPerformFn(mapped, recordDate)) {
    const explain = (canPerformFn as CanPerformBackdatedFn).explain;
    const defaultMessage =
      customMessage ||
      explain?.(mapped, recordDate) ||
      `${action === "create" ? "Creating" : action === "edit" ? "Editing" : "Deleting"} vouchers with this date is not allowed based on your role's date limits.`;
    throw new PermissionDeniedError(defaultMessage);
  }
}

/**
 * Helper to determine if a voucher belongs to the current user
 * Checks voucher prop, vouchers array, and optionally fetches from Firestore
 * @param voucher - Voucher object from props (may have userId)
 * @param savedVoucherId - ID of saved voucher (if editing)
 * @param vouchers - Array of vouchers from useVouchers hook
 * @param userId - Current user's UID
 * @param companyId - Company ID for Firestore fetch
 * @param fetchVoucher - Optional function to fetch voucher from Firestore (to avoid circular deps)
 */
export async function determineVoucherOwnership(
  voucher: any,
  savedVoucherId: string | null | undefined,
  vouchers: any[],
  userId: string,
  companyId?: string,
  fetchVoucher?: (companyId: string, voucherId: string) => Promise<any>
): Promise<boolean> {
  // Check voucher prop first
  if (voucher?.userId) {
    return voucher.userId === userId;
  }
  
  // Check vouchers array from useVouchers
  const voucherIdToCheck = savedVoucherId || voucher?.id;
  if (voucherIdToCheck) {
    const existingVoucher = vouchers.find(v => v.id === voucherIdToCheck);
    if (existingVoucher?.userId !== undefined) {
      return existingVoucher.userId === userId;
    }
  }
  
  // If still not found and we have voucherId and companyId, fetch from Firestore
  if (voucherIdToCheck && companyId) {
    if (fetchVoucher) {
      const voucherData = await fetchVoucher(companyId, voucherIdToCheck);
      if (voucherData?.userId !== undefined) {
        return voucherData.userId === userId;
      }
    }
  }
  
  // Default to false if we can't determine ownership (safer - requires edit_all permission)
  return false;
}

/**
 * Asserts that the user can edit a record (own or all).
 * When voucher is approved, also requires edit_approved_voucher permission.
 * @param canEditFn - Function that checks edit permission (from usePermissions hook): (isOwnRecord, voucher?) => boolean
 * @param isOwnRecord - Whether the record belongs to the current user
 * @param voucher - Optional voucher (used to check isApproved and require edit_approved_voucher)
 * @param customMessage - Optional custom error message
 */
export function assertCanEdit(
  canEditFn: (isOwnRecord: boolean, voucher?: { isApproved?: boolean } | null) => boolean,
  isOwnRecord: boolean,
  voucher?: { isApproved?: boolean } | null,
  customMessage?: string
): void {
  if (!canEditFn(isOwnRecord, voucher)) {
    const defaultMessage =
      customMessage ||
      (voucher?.isApproved
        ? "You do not have permission to edit approved vouchers."
        : isOwnRecord
          ? "You do not have permission to edit your own records."
          : "You do not have permission to edit all records.");
    throw new PermissionDeniedError(defaultMessage);
  }
}
