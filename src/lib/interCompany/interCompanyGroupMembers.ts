/**
 * Inter Company system — group memberUsers snapshot (shared users with IC read).
 */
import type { Company } from "@/hooks/useCompany";
import type { InterCompanyGroupMemberUser } from "@/lib/interCompany/interCompanyGroups";
import { initialPermissionConfig } from "@/hooks/usePermissions";
import type { PermissionConfig, UserRole } from "@/hooks/usePermissions";
import { PermissionGroups } from "@/lib/permissions";

const flattenedPermissions = PermissionGroups.flatMap((g) => g.permissions.map((p) => p.key));

function userHasInterCompanyRead(
  permissionConfig: PermissionConfig | undefined,
  role: UserRole
): boolean {
  const config = permissionConfig || initialPermissionConfig;
  const idx = flattenedPermissions.indexOf("inter_company_read");
  if (idx < 0) return role === "owner";
  if (role === "owner") return true;
  const arr = config.roles[role];
  return !!arr?.[idx];
}

/** Group ki companies par shared users jinke paas IC read hai */
export function collectInterCompanyMemberUsers(
  companies: Pick<Company, "sharedWith" | "permissionConfig">[]
): InterCompanyGroupMemberUser[] {
  const map = new Map<string, InterCompanyGroupMemberUser>();
  for (const c of companies) {
    const cfg = c.permissionConfig as PermissionConfig | undefined;
    for (const u of c.sharedWith || []) {
      const email = String(u?.email || "")
        .trim()
        .toLowerCase();
      if (!email) continue;
      const role = String(u?.role || "viewer")
        .toLowerCase()
        .trim()
        .replace(/_/g, "-") as UserRole;
      if (!userHasInterCompanyRead(cfg, role)) continue;
      if (!map.has(email)) {
        map.set(email, {
          email,
          name: String(u?.name || u?.email || "").trim() || email,
          uid: u?.uid ? String(u.uid) : undefined,
          role: String(u?.role || ""),
        });
      }
    }
  }
  return Array.from(map.values());
}
