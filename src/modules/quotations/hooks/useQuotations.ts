"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BROWSER_DB_COLLECTION_BUMP } from "@/lib/localCompanyDocMirror";
import { QUOTATION_COLLECTION, quotationAccountListId } from "../constants";
import { listQuotations } from "../db/quotationRepository";
import type { QuotationAccountRow, QuotationDoc } from "../types";

export function useQuotations(companyId: string | null | undefined) {
  const [quotations, setQuotations] = useState<QuotationDoc[]>([]);
  const [loading, setLoading] = useState(() => Boolean(String(companyId || "").trim()));
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const cid = String(companyId || "").trim();
    if (!cid) {
      setQuotations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setQuotations(await listQuotations(cid));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load quotations");
      setQuotations([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  useEffect(() => {
    const cid = String(companyId || "").trim();
    if (!cid || typeof window === "undefined") return;
    const onBump = (ev: Event) => {
      const detail = (ev as CustomEvent<{ companyId?: string; collection?: string }>).detail;
      if (detail?.companyId && detail.companyId !== cid) return;
      if (detail?.collection && detail.collection !== QUOTATION_COLLECTION) return;
      void reload();
    };
    window.addEventListener(BROWSER_DB_COLLECTION_BUMP, onBump as EventListener);
    return () => window.removeEventListener(BROWSER_DB_COLLECTION_BUMP, onBump as EventListener);
  }, [companyId, reload]);

  const accountRows = useMemo<QuotationAccountRow[]>(() => {
    const map = new Map<string, QuotationAccountRow>();
    for (const row of quotations) {
      const id = quotationAccountListId(row.accountKind, row.accountId);
      const prev = map.get(id);
      if (prev) {
        prev.quotationCount += 1;
        continue;
      }
      map.set(id, {
        id,
        accountId: row.accountId,
        kind: row.accountKind,
        name: row.accountName,
        quotationCount: 1,
      });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [quotations]);

  return { quotations, accountRows, loading, error, reload };
}
