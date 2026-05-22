import type { MasterDetailListRouteKey } from "@/lib/masterDetailListPath";

const STORAGE_KEY = "masterDetailSidebarListNav";

/** Sidebar entity menu — list kholo, saved ?selected= / memory detail mat kholo */
export function markMasterDetailSidebarListNav(routeKey: MasterDetailListRouteKey): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, routeKey);
  } catch {
    /* ignore */
  }
}

/** Party/bank page mount: sidebar se aaye to true (ek baar consume) */
export function consumeMasterDetailSidebarListNav(routeKey: MasterDetailListRouteKey): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v !== routeKey) return false;
    sessionStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** `/party` → `party` — sidebar list-only navigation */
export function masterDetailRouteKeyFromPath(pathname: string): MasterDetailListRouteKey | null {
  const p = (pathname || "").replace(/\/+$/, "").toLowerCase();
  if (p === "/party") return "party";
  if (p === "/bank-cash") return "bank-cash";
  if (p === "/staff") return "staff";
  if (p === "/items") return "items";
  if (p === "/tax") return "tax";
  if (p === "/incomes") return "incomes";
  return null;
}
