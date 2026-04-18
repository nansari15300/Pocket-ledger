"use client";

export function isSuperAdminSyncEnabled(): boolean {
  // Default ON: unless explicitly disabled, super-admin settings/plans sync attempt allow karo.
  return process.env.NEXT_PUBLIC_SUPER_ADMIN_SYNC !== "0";
}

