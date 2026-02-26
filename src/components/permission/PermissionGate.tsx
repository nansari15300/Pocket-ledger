"use client";

import usePermissions from "@/hooks/usePermissions";
import type { Permission } from "@/lib/permissions";

type PermissionGateProps = {
  permission: Permission;
  /** Show item if user has ANY of these permissions (overrides `permission` when set) */
  permissionAny?: Permission[];
  children: React.ReactNode;
};

export function PermissionGate({ permission, permissionAny, children }: PermissionGateProps) {
  const { can } = usePermissions();

  if (permissionAny && permissionAny.length > 0) {
    const allowed = permissionAny.some((p) => can(p));
    if (!allowed) return null;
    return <>{children}</>;
  }

  if (!can(permission)) return null;
  return <>{children}</>;
}
