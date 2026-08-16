"use client";

import type { AdminPanelVoucherTab } from "@/adminPanelCompany/components/forms/AdminPanelAddVoucherDialog";

export type AdminPanelQuickAction =
  | { kind: "voucher"; tab: AdminPanelVoucherTab }
  | { kind: "party" }
  | { kind: "bank" }
  | { kind: "staff" };

export const ADMIN_PANEL_COMPANY_QUICK_ACTION_EVENT = "admin-panel-company-quick-action";
export const ADMIN_PANEL_COMPANY_ENTITY_CHANGED_EVENT = "admin-panel-company-entity-changed";

export function dispatchAdminPanelQuickAction(action: AdminPanelQuickAction) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ADMIN_PANEL_COMPANY_QUICK_ACTION_EVENT, { detail: action }));
}

export function dispatchAdminPanelEntityChanged(kind?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ADMIN_PANEL_COMPANY_ENTITY_CHANGED_EVENT, { detail: { kind } }));
}
