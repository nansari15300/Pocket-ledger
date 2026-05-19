"use client";

import { useMemo } from "react";
import type { Company } from "@/hooks/useCompany";
import {
  interCompanyAcNoPrefix,
  isValidInterCompanyAcNo,
  normalizeInterCompanyAcNo,
  readCompanyInterCompanyAcNo,
} from "@/lib/interCompany/interCompanyAccountNo";
import {
  interCompanyPhonesMatch,
  normalizeInterCompanyPhone,
} from "@/lib/interCompany/interCompanyPhone";
import type { InterCompanyPartnerDisplayMode } from "@/lib/interCompany/interCompanyLocalStore";

export type InterCompanyPartnerRow = {
  id: string;
  name: string;
  acNo: string;
  mobile: string;
  isShared: boolean;
};

/** Partner label — join settings display mode ke hisaab se. */
export function formatInterCompanyPartnerLabel(
  row: InterCompanyPartnerRow,
  mode: InterCompanyPartnerDisplayMode
): string {
  if (mode === "ac_only" && row.acNo) return row.acNo;
  const mob = row.mobile ? ` · ${row.mobile}` : "";
  if (row.acNo) return `${row.name} · ${row.acNo}${mob}`;
  return row.mobile ? `${row.name} · ${row.mobile}` : row.name;
}

function mapCompanyToPartnerRow(c: Company): InterCompanyPartnerRow {
  return {
    id: c.id!,
    name: String(c.name || c.id || "").trim(),
    acNo: readCompanyInterCompanyAcNo(c),
    mobile: normalizeInterCompanyPhone(c.phone),
    isShared: c.isOwned === false,
  };
}

/** Edit / display — kisi bhi accessible company id se naam, A/c, mobile (current company bhi). */
export function interCompanyPartnerRowFromCompanies(
  allCompanies: Company[] | undefined,
  companyId: string
): InterCompanyPartnerRow | null {
  const c = (allCompanies || []).find((x) => x?.id === companyId);
  if (!c?.id) return null;
  return mapCompanyToPartnerRow(c);
}

/** Target company dropdown + A/c No / mobile sync. */
export function useInterCompanyPartnerDirectory(
  allCompanies: Company[] | undefined,
  excludeCompanyId: string | null | undefined
) {
  return useMemo(() => {
    const allCompanyRows: InterCompanyPartnerRow[] = (allCompanies || [])
      .filter((c) => c?.id)
      .map((c) => mapCompanyToPartnerRow(c));

    const partners: InterCompanyPartnerRow[] = allCompanyRows.filter((c) => c.id !== excludeCompanyId);

    const byAcNo = new Map<string, string>();
    for (const p of partners) {
      if (p.acNo) byAcNo.set(p.acNo, p.id);
    }

    const optionLabel = (p: InterCompanyPartnerRow) =>
      p.isShared ? `${p.name} (shared)` : p.name;

    // Dropdown: sirf company name — A/c No / mobile alag fields me
    const comboboxOptions = partners.map((p) => ({
      value: p.id,
      label: optionLabel(p),
    }));

    /** Edit mode: current/target company partners list me nahi hoti — real row se option add karo */
    const comboboxOptionsIncluding = (extraCompanyIds: string[]) => {
      const opts = [...comboboxOptions];
      const seen = new Set(opts.map((o) => o.value));
      for (const id of extraCompanyIds) {
        if (!id || seen.has(id)) continue;
        const row = allCompanyRows.find((p) => p.id === id);
        if (!row) continue;
        opts.unshift({ value: row.id, label: optionLabel(row) });
        seen.add(id);
      }
      return opts;
    };

    const resolveCompanyIdByAcNo = (typed: string): string | null => {
      const norm = normalizeInterCompanyAcNo(typed);
      if (!isValidInterCompanyAcNo(norm)) return null;
      const p = interCompanyAcNoPrefix(norm);
      if (p && p !== "C") return null;
      return byAcNo.get(norm) ?? null;
    };

    const resolveCompaniesByMobile = (typed: string): InterCompanyPartnerRow[] => {
      const digits = normalizeInterCompanyPhone(typed);
      if (digits.length < 7) return [];
      return partners.filter((p) => p.mobile && interCompanyPhonesMatch(p.mobile, digits));
    };

    const acNoForCompanyId = (id: string): string =>
      partners.find((p) => p.id === id)?.acNo ?? "";

    const mobileForCompanyId = (id: string): string =>
      partners.find((p) => p.id === id)?.mobile ?? "";

    /** Display / edit — logged-in company ko bhi resolve kare */
    const acNoForAnyCompanyId = (id: string): string =>
      allCompanyRows.find((p) => p.id === id)?.acNo ?? "";

    const mobileForAnyCompanyId = (id: string): string =>
      allCompanyRows.find((p) => p.id === id)?.mobile ?? "";

    return {
      partners,
      allCompanyRows,
      comboboxOptions,
      comboboxOptionsIncluding,
      resolveCompanyIdByAcNo,
      resolveCompaniesByMobile,
      acNoForCompanyId,
      mobileForCompanyId,
      acNoForAnyCompanyId,
      mobileForAnyCompanyId,
    };
  }, [allCompanies, excludeCompanyId]);
}
