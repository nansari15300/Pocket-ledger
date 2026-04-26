"use client";

const GLOBAL_COMPANY_ID_KEY = "companyId";
const TAB_COMPANY_ID_KEY = "pl_tab_companyId_v1";

function cleanCompanyId(value: string | null | undefined): string {
  return String(value || "").trim();
}

/** Multi-tab: tab-specific company wins on refresh; global company remains the last-login fallback for new tabs/app boot. */
export function readSelectedCompanyId(): string {
  if (typeof window === "undefined") return "";
  try {
    const tabCompanyId = cleanCompanyId(window.sessionStorage.getItem(TAB_COMPANY_ID_KEY));
    if (tabCompanyId) return tabCompanyId;
  } catch {
    /* sessionStorage can be blocked; fallback below keeps old startup behaviour. */
  }
  try {
    return cleanCompanyId(window.localStorage.getItem(GLOBAL_COMPANY_ID_KEY));
  } catch {
    return "";
  }
}

/** Save both: current tab stays isolated after refresh, while new tabs/APK startup still know the last opened company. */
export function writeSelectedCompanyId(companyId: string): void {
  if (typeof window === "undefined") return;
  const clean = cleanCompanyId(companyId);
  try {
    if (clean) window.sessionStorage.setItem(TAB_COMPANY_ID_KEY, clean);
    else window.sessionStorage.removeItem(TAB_COMPANY_ID_KEY);
  } catch {
    /* ignore */
  }
  try {
    if (clean) window.localStorage.setItem(GLOBAL_COMPANY_ID_KEY, clean);
    else window.localStorage.removeItem(GLOBAL_COMPANY_ID_KEY);
  } catch {
    /* ignore */
  }
}

/** Logout/delete current company: clear tab override and global fallback together. */
export function clearSelectedCompanyId(): void {
  writeSelectedCompanyId("");
}

/** Auto-select first company only when neither this tab nor global last-login has a saved company. */
export function hasAnySelectedCompanyId(): boolean {
  return Boolean(readSelectedCompanyId());
}
