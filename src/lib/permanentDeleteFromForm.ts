"use client";

import type { Permission } from "@/lib/permissions";
import { PermissionDeniedError } from "@/lib/permissions/enforcePermission";
import { permanentDeleteCompanySubdocFromRecycleBin } from "@/lib/recycleBinEntityLifecycle";

export function canPermanentDeleteFromForm(
  can: (permission: Permission) => boolean,
  role: string
): boolean {
  return role === "owner" || can("permanently_delete_records");
}

export function assertCanPermanentDeleteFromForm(
  can: (permission: Permission) => boolean,
  role: string
): void {
  if (!canPermanentDeleteFromForm(can, role)) {
    throw new PermissionDeniedError("You do not have permission to permanently delete records.");
  }
}

export async function permanentDeleteVoucherFromForm(
  companyId: string,
  voucherId: string
): Promise<void> {
  await permanentDeleteCompanySubdocFromRecycleBin(companyId, "vouchers", voucherId);
}
