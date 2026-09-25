"use client";

import { useCallback, useEffect, useState } from "react";
import { ADMIN_PANEL_COMPANY_LOCAL_ID } from "@/lib/adminPanelCompany/constants";
import { isAdminPanelCompanyLedgerMode } from "@/lib/adminPanelCompany/ledgerMode";

export function isAdminPanelCompanyRow(c: { id?: string; kind?: string }): boolean {
  const id = String(c.id ?? "").trim();
  const kind = String(c.kind ?? "").trim();
  return id === ADMIN_PANEL_COMPANY_LOCAL_ID || kind === "admin-panel-company";
}

/** Admin ledger mode: management company only in the dedicated selector section (not Local/Online tabs). */
export function omitAdminPanelCompanyFromTabLists<T extends { id?: string; kind?: string }>(
  companies: T[],
  adminLedgerMode: boolean
): T[] {
  if (!adminLedgerMode) return companies;
  return companies.filter((c) => !isAdminPanelCompanyRow(c));
}

/** Admin Panel Company mode: selector shows only the app management company. */
export function filterCompaniesForAdminPanelLedgerMode<T extends { id?: string; kind?: string }>(
  companies: T[]
): T[] {
  if (!isAdminPanelCompanyLedgerMode()) return companies;
  const adminRows = companies.filter(isAdminPanelCompanyRow);
  if (adminRows.length > 0) return adminRows;
  return companies.filter((c) => c.id === ADMIN_PANEL_COMPANY_LOCAL_ID);
}

export function useAdminPanelCompanyListFilter() {
  const [adminLedgerMode, setAdminLedgerMode] = useState(false);

  useEffect(() => {
    const sync = () => setAdminLedgerMode(isAdminPanelCompanyLedgerMode());
    sync();
    window.addEventListener("pl-admin-panel-company-mode", sync);
    window.addEventListener("pl-company-switched", sync);
    return () => {
      window.removeEventListener("pl-admin-panel-company-mode", sync);
      window.removeEventListener("pl-company-switched", sync);
    };
  }, []);

  const applyFilter = useCallback(
    <T extends { id?: string; kind?: string }>(list: T[]) => filterCompaniesForAdminPanelLedgerMode(list),
    []
  );

  return {
    adminLedgerMode,
    applyFilter,
  };
}
