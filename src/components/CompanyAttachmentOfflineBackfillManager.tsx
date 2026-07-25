"use client";

/**
 * Online par selected cloud company ke SQLite mirror se **saari** attachment URLs scrape karke
 * (HTTPS signed + raw Storage object-path) IndexedDB/native cache me bharo — offline par hover/tick/open zyada tar cache-hit rahein.
 * `gateActive` (pehli-login overlay) ke dauran band — wahan already attachment phase chal sakta hai.
 */

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import type { Company } from "@/hooks/useCompany";
import { useFirstLoginWarmGate } from "@/contexts/FirstLoginWarmGateContext";
import {
  clearHeaderAttachmentPrefetchForCompany,
  reportHeaderAttachmentPrefetchProgress,
} from "@/contexts/EmbeddedAttachmentPrefetchContext";
import { shouldPrefetchAttachmentsForCompany } from "@/lib/offlineFullWarmSync";
import {
  EMBEDDED_FIRST_LOGIN_ATTACHMENT_PREFETCH,
  runEmbeddedCompanyFullPreload,
} from "@/lib/embeddedAccountOfflineWarm";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { isFirebaseLedgerLocalDeltaMode } from "@/lib/firebaseLedgerSyncMode";
import { isFirebaseLedgerDataSyncDisabled } from "@/lib/firebaseLedgerDataSyncDisabled";
import { isFirebaseLedgerCompanyAttachmentSyncEnabled } from "@/lib/firebaseLedgerCompanySyncPrefs";
const DEBOUNCE_AFTER_COMPANY_MS = 2_800;

export function CompanyAttachmentOfflineBackfillManager() {
  const { user } = useAuth();
  const { companyId, company, loading } = useCompany();
  const { gateActive } = useFirstLoginWarmGate();
  const runAbortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const companyRef = useRef(company);
  companyRef.current = company;
  /** `setTimeout` closure me fresh gate/offline check — stale `gateActive` se duplicate prefetch na chale. */
  const gateActiveRef = useRef(gateActive);
  gateActiveRef.current = gateActive;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isFirebaseLedgerLocalDeltaMode()) return;
    if (isFirebaseLedgerDataSyncDisabled()) return;
    // EXE: `OfflineWarmSyncManager` already serial warm chalata hai — duplicate prefetch + header % flicker avoid.
    if (isElectronDesktopApp()) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    runAbortRef.current?.abort();
    runAbortRef.current = null;

    const c = companyRef.current;
    if (!user || loading || !companyId?.trim() || !c) return;
    if (!shouldPrefetchAttachmentsForCompany(c as Company)) return;
    if (gateActive) return;
    const cid = companyId.trim();
    if (!isFirebaseLedgerCompanyAttachmentSyncEnabled(cid)) return;

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (gateActiveRef.current) return;

      runAbortRef.current?.abort();
      const ac = new AbortController();
      runAbortRef.current = ac;

      void (async () => {
        try {
          if (process.env.NODE_ENV !== "production") {
            console.log("[ATTACHMENT_SYNC]", "CompanyAttachmentOfflineBackfillManager:start", { companyId: cid });
          }
          await runEmbeddedCompanyFullPreload({
            company: c,
            localCompanyId: cid,
            signal: ac.signal,
            prefetchOverrides: EMBEDDED_FIRST_LOGIN_ATTACHMENT_PREFETCH,
            onAttachmentProgressPercent: (pct) => reportHeaderAttachmentPrefetchProgress(cid, pct),
          });
        } catch {
          /* abort / offline */
        } finally {
          if (process.env.NODE_ENV !== "production" && !ac.signal.aborted) {
            console.log("[ATTACHMENT_SYNC]", "CompanyAttachmentOfflineBackfillManager:done", { companyId: cid });
          }
          if (ac.signal.aborted) clearHeaderAttachmentPrefetchForCompany(cid);
        }
      })();
    }, DEBOUNCE_AFTER_COMPANY_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      runAbortRef.current?.abort();
      runAbortRef.current = null;
      clearHeaderAttachmentPrefetchForCompany(companyId);
    };
  }, [user, loading, companyId, gateActive]);

  return null;
}
