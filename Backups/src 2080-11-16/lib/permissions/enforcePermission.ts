/**
 * Permission enforcement helper for mutation operations
 * Throws error if permission is denied, which should be caught and shown as toast
 */

import type { Permission } from "@/lib/permissions";

export class PermissionDeniedError extends Error {
  constructor(message: string = "No permission") {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

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
  canPerformFn: (action: "entry" | "edit" | "delete", recordDate?: Date) => boolean,
  action: "create" | "edit" | "delete",
  recordDate?: Date,
  customMessage?: string
): void {
  const actionMap: Record<"create" | "edit" | "delete", "entry" | "edit" | "delete"> = {
    create: "entry",
    edit: "edit",
    delete: "delete",
  };

  if (!canPerformFn(actionMap[action], recordDate)) {
    const actionLabel = action === "create" ? "Creating" : action === "edit" ? "Editing" : "Deleting";
    const defaultMessage = customMessage || `${actionLabel} vouchers with this date is not allowed based on your role's date limits.`;
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
