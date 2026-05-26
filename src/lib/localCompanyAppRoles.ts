/** Local company app roles — permissions (`usePermissions`) me yahi use hote hain. */
export const LOCAL_COMPANY_APP_ROLES = [
  { value: "manager", label: "Admin" },
  { value: "editor", label: "Editor" },
  { value: "accountant", label: "Accountant" },
  { value: "data-entry", label: "Data Entry" },
  { value: "viewer", label: "Viewer" },
] as const;

export type LocalCompanyAppRole = (typeof LOCAL_COMPANY_APP_ROLES)[number]["value"];

const VALID = new Set<string>(LOCAL_COMPANY_APP_ROLES.map((r) => r.value));

export function normalizeLocalCompanyAppRole(raw: unknown): LocalCompanyAppRole {
  const r = String(raw ?? "manager")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
  if (r === "admin") return "manager";
  if (VALID.has(r)) return r as LocalCompanyAppRole;
  return "viewer";
}

export function localCompanyAppRoleLabel(role: string): string {
  const n = normalizeLocalCompanyAppRole(role);
  return LOCAL_COMPANY_APP_ROLES.find((r) => r.value === n)?.label ?? n;
}
