"use client";

import { useEffect, useState } from "react";
import type { InterCompanyEntityDetail } from "@/lib/interCompany/interCompanyEntityTypes";
import { fetchInterCompanyEntitiesForCompany } from "@/lib/interCompany/fetchInterCompanyEntities";

export type { InterCompanyEntityDetail };

/** Firestore se ek company ke masters — target column (phone, avatar, …). */
export function useInterCompanyEntities(companyId: string | null | undefined) {
  const [entities, setEntities] = useState<InterCompanyEntityDetail[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setEntities([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const rows = await fetchInterCompanyEntitiesForCompany(companyId);
        if (!cancelled) setEntities(rows);
      } catch {
        if (!cancelled) setEntities([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { entities, loading };
}

/** Current company — `useVouchers` lists ko detail rows me. */
export function buildSourceEntitiesFromVouchers(lists: {
  processedAccounts?: {
    id: string;
    accountName?: string;
    bankName?: string;
    accountNumber?: string;
    interCompanyAccountNo?: string;
    balance?: number;
  }[];
  processedParties?: {
    id: string;
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    pan?: string;
    fileUrl?: string | null;
    openingBalance?: number;
    interCompanyAccountNo?: string;
    balance?: number;
  }[];
  processedStaff?: {
    id: string;
    name?: string;
    phone?: string;
    email?: string;
    interCompanyAccountNo?: string;
    balance?: number;
  }[];
  processedTaxes?: { id: string; name?: string; interCompanyAccountNo?: string; balance?: number }[];
  expenseAccounts?: { id: string; name?: string; interCompanyAccountNo?: string; balance?: number }[];
}): InterCompanyEntityDetail[] {
  const rows: InterCompanyEntityDetail[] = [];
  (lists.processedAccounts || []).forEach((a) =>
    rows.push({
      id: a.id,
      kind: "bank",
      label: a.accountName || a.id,
      bankName: a.bankName,
      accountNumber: a.accountNumber,
      interCompanyAccountNo: a.interCompanyAccountNo,
      closingBalance: a.balance,
    })
  );
  (lists.processedParties || []).forEach((p) =>
    rows.push({
      id: p.id,
      kind: "party",
      label: p.name || p.id,
      phone: p.phone,
      email: p.email,
      address: p.address,
      pan: p.pan,
      fileUrl: p.fileUrl,
      openingBalance: p.openingBalance,
      interCompanyAccountNo: p.interCompanyAccountNo,
      closingBalance: p.balance,
    })
  );
  (lists.processedStaff || []).forEach((s) =>
    rows.push({
      id: s.id,
      kind: "staff",
      label: s.name || s.id,
      phone: s.phone,
      email: s.email,
      interCompanyAccountNo: s.interCompanyAccountNo,
      closingBalance: s.balance,
    })
  );
  (lists.processedTaxes || []).forEach((t) =>
    rows.push({
      id: t.id,
      kind: "tax",
      label: t.name || t.id,
      interCompanyAccountNo: t.interCompanyAccountNo,
      closingBalance: t.balance,
    })
  );
  (lists.expenseAccounts || []).forEach((e) =>
    rows.push({
      id: e.id,
      kind: "expense",
      label: e.name || e.id,
      interCompanyAccountNo: e.interCompanyAccountNo,
      closingBalance: e.balance,
    })
  );
  return rows;
}

export { filterInterCompanyEntitiesByPhone } from "@/lib/interCompany/interCompanyEntityLookup";
