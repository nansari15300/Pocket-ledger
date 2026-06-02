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
import { useEmbeddedAttachmentPrefetch } from "@/contexts/EmbeddedAttachmentPrefetchContext";
import {
  shouldPrefetchAttachmentsForCompany,
  runEmbeddedAttachmentPrefetchPhase,
} from "@/lib/offlineFullWarmSync";

const DEBOUNCE_AFTER_COMPANY_MS = 2_800;

export function CompanyAttachmentOfflineBackfillManager() {
  const { user } = useAuth();
  const { companyId, company, loading } = useCompany();
  const { gateActive } = useFirstLoginWarmGate();
  const { setHeaderAttachmentPercent } = useEmbeddedAttachmentPrefetch();
  const runAbortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** `setTimeout` closure me fresh gate/offline check — stale `gateActive` se duplicate prefetch na chale. */
  const gateActiveRef = useRef(gateActive);
  gateActiveRef.current = gateActive;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    runAbortRef.current?.abort();
    runAbortRef.current = null;

    if (!user || loading || !companyId?.trim() || !company) return;
    if (!shouldPrefetchAttachmentsForCompany(company as Company)) return;
    if (gateActive) return;

    const c = company as Company;
    const cid = companyId.trim();

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
            // Ye phase poora page reload nahi karti — sirf cache + header %; phir bhi correlate karne ke liye tag.
            console.log("[ATTACHMENT_SYNC]", "CompanyAttachmentOfflineBackfillManager:start", { companyId: cid });
          }
          setHeaderAttachmentPercent(1);
          await runEmbeddedAttachmentPrefetchPhase({
            company: c,
            localCompanyId: cid,
            signal: ac.signal,
            onProgressPercent: (p) => setHeaderAttachmentPercent(p),
            prefetchOverrides: {
              maxUrls: 55_000,
              maxTotalBytesApprox: 4_200 * 1024 * 1024,
              concurrency: 7,
            },
          });
        } catch {
          /* abort / offline */
        } finally {
          if (process.env.NODE_ENV !== "production" && !ac.signal.aborted) {
            console.log("[ATTACHMENT_SYNC]", "CompanyAttachmentOfflineBackfillManager:done", { companyId: cid });
          }
          if (!ac.signal.aborted) setHeaderAttachmentPercent(null);
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
    };
  }, [user, loading, companyId, company, gateActive, setHeaderAttachmentPercent]);

  return null;
}
