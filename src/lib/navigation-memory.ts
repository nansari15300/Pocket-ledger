"use client";

/**
 * LocalStorage keys used to remember last-visited selection / active view across the entire app.
 * Cleared on logout so the next user (or same user after re-login) gets a fresh state.
 * Includes: dashboard, reports, report sub-pages, settings, admin panel, contra, items, gallery, sidebar, etc.
 * Does NOT include: theme, primaryColor, dateSystem, companyId (handled by auth/preferences).
 */
export const NAVIGATION_MEMORY_KEYS = [
  // Main app list/detail pages
  "partyPageState",
  "staffPageState",
  "bankCashPageState",
  "taxPageState",
  "incomeExpensePageState",
  "itemsPageState",
  "reportsPageState",
  // Report sub-pages (last selected entity)
  "reportPartyledgerState",
  "reportGroupStatementState",
  "reportAccountsStatementState",
  "reportStaffStatementState",
  "reportBankStatementState",
  "reportAnusuchi13State",
  "reportSaleRegisterState",
  "reportPurchaseRegisterState",
  "reportPaymentInState",
  "reportPaymentOutState",
  "reportAddSalaryState",
  "reportContraState",
  "reportJournalState",
  "reportNotesState",
  // Settings (last active tab/section)
  "settingsPageState",
  // Dashboard (visible card/section)
  "dashboardVisibleCard",
  // Contra report
  "contraReportDateRange",
  // Items page active tab (items / services / finished_goods / groups)
  "itemActiveView",
  // Gallery
  "galleryPreviewSize",
  // Sidebar open/closed (dashboard app sidebar)
  "sidebar-isOpen",
  // Company ManageShare role selector
  "selectedRoleForPermissions",
  // Admin panel – last selected user
  "selectedAdminUserId",
  // Forced view mode (mobile/desktop)
  "forcedViewMode",
  // Active tab per section (party/staff/tax/bank-cash use these in some flows)
  "partyActiveView",
  "staffActiveView",
  "taxActiveView",
  "bankCashActiveView",
] as const;

/** Keys from useResponsiveListLayout (selectedItemId_${pageKey}) */
const RESPONSIVE_LAYOUT_PREFIX = "selectedItemId_";

export function clearNavigationMemory(): void {
  if (typeof window === "undefined") return;
  NAVIGATION_MEMORY_KEYS.forEach((key) => localStorage.removeItem(key));
  // Clear any selectedItemId_* keys (list selection per view)
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(RESPONSIVE_LAYOUT_PREFIX)) keysToRemove.push(key);
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}
