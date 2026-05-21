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
  isValidInterCompanyCompanyCode,
  normalizeInterCompanyCompanyCode,
  readCompanyInterCompanyCode,
} from "@/lib/interCompany/interCompanyCompanyCode";
import {
  interCompanyPhonesMatch,
  normalizeInterCompanyPhone,
} from "@/lib/interCompany/interCompanyPhone";
import type { InterCompanyPartnerDisplayMode } from "@/lib/interCompany/interCompanyLocalStore";

export type InterCompanyPartnerRow = {
  id: string;
  name: string;
  acNo: string;
  /** SWIFT-style company code — voucher company row */
  companyCode: string;
  pan: string;
  mobile: string;
  isShared: boolean;
  /** Target dropdown — system card name(s) bracket me */
  systemNames?: string[];
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

export function mapCompanyToPartnerRow(c: Company): InterCompanyPartnerRow {
  return {
    id: c.id!,
    name: String(c.name || c.id || "").trim(),
    acNo: readCompanyInterCompanyAcNo(c),
    companyCode: readCompanyInterCompanyCode(c),
    pan: String(c.pan || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, ""),
    mobile: normalizeInterCompanyPhone(c.phone),
    isShared: c.isOwned === false,
  };
}

/** Joined target list / edit extras — rows se directory helpers (public profile rows bhi) */
export function buildInterCompanyPartnerDirectoryFromRows(
  allCompanyRows: InterCompanyPartnerRow[],
  partners: InterCompanyPartnerRow[] = allCompanyRows
) {
  const byAcNo = new Map<string, string>();
  const byCompanyCode = new Map<string, string>();
  for (const p of partners) {
    if (p.acNo) byAcNo.set(p.acNo, p.id);
    if (p.companyCode) byCompanyCode.set(p.companyCode, p.id);
  }

  // Target dropdown — sirf company name (system name bracket me nahi)
  const optionLabel = (p: InterCompanyPartnerRow) => p.name;

  const comboboxOptions = partners.map((p) => ({
    value: p.id,
    label: optionLabel(p),
  }));

  /** Edit: saved target id list me missing ho to merged rows se option add */
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

  const resolveCompanyIdByCompanyCode = (typed: string): string | null => {
    const norm = normalizeInterCompanyCompanyCode(typed);
    if (!isValidInterCompanyCompanyCode(norm)) return null;
    return byCompanyCode.get(norm) ?? null;
  };

  const resolveCompaniesByMobile = (typed: string): InterCompanyPartnerRow[] => {
    const digits = normalizeInterCompanyPhone(typed);
    if (digits.length < 7) return [];
    return partners.filter((p) => p.mobile && interCompanyPhonesMatch(p.mobile, digits));
  };

  const resolveCompaniesByPan = (typed: string): InterCompanyPartnerRow[] => {
    const pan = String(typed || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (pan.length < 4) return [];
    return partners.filter((p) => p.pan && (p.pan === pan || p.pan.includes(pan)));
  };

  const acNoForCompanyId = (id: string): string =>
    partners.find((p) => p.id === id)?.acNo ?? "";

  const panForCompanyId = (id: string): string =>
    partners.find((p) => p.id === id)?.pan ?? "";

  const mobileForCompanyId = (id: string): string =>
    partners.find((p) => p.id === id)?.mobile ?? "";

  const acNoForAnyCompanyId = (id: string): string =>
    allCompanyRows.find((p) => p.id === id)?.acNo ?? "";

  const companyCodeForCompanyId = (id: string): string =>
    partners.find((p) => p.id === id)?.companyCode ?? "";

  const companyCodeForAnyCompanyId = (id: string): string =>
    allCompanyRows.find((p) => p.id === id)?.companyCode ?? "";

  const mobileForAnyCompanyId = (id: string): string =>
    allCompanyRows.find((p) => p.id === id)?.mobile ?? "";

  const panForAnyCompanyId = (id: string): string =>
    allCompanyRows.find((p) => p.id === id)?.pan ?? "";

  return {
    partners,
    allCompanyRows,
    comboboxOptions,
    comboboxOptionsIncluding,
    resolveCompanyIdByAcNo,
    resolveCompanyIdByCompanyCode,
    resolveCompaniesByMobile,
    resolveCompaniesByPan,
    acNoForCompanyId,
    panForCompanyId,
    companyCodeForCompanyId,
    mobileForCompanyId,
    acNoForAnyCompanyId,
    companyCodeForAnyCompanyId,
    mobileForAnyCompanyId,
    panForAnyCompanyId,
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

    return buildInterCompanyPartnerDirectoryFromRows(allCompanyRows, partners);
  }, [allCompanies, excludeCompanyId]);
}
