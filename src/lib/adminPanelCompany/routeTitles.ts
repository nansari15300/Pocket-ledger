/** Admin Panel Company nav + header titles (isolated from dashboardDocumentTitle). */
export const ADMIN_PANEL_COMPANY_ROUTES = [
  { href: "/admin/company", label: "Dashboard" },
  { href: "/admin/company/parties", label: "Subscribers" },
  { href: "/admin/company/vouchers", label: "Vouchers" },
  { href: "/admin/company/bank_accounts", label: "Bank/Cash" },
  { href: "/admin/company/staff", label: "Staff" },
  { href: "/admin/company/taxes", label: "Tax" },
  { href: "/admin/company/expense_accounts", label: "Income & Expense" },
  { href: "/admin/company/reports", label: "Reports" },
] as const;

export function adminPanelCompanyRouteLabel(pathname: string | null | undefined): string {
  const path = String(pathname || "");
  const exact = ADMIN_PANEL_COMPANY_ROUTES.find((route) => route.href === path);
  if (exact) return exact.label;
  const prefix = [...ADMIN_PANEL_COMPANY_ROUTES]
    .sort((a, b) => b.href.length - a.href.length)
    .find((route) => path === route.href || path.startsWith(`${route.href}/`));
  return prefix?.label || "Admin Panel Company";
}
