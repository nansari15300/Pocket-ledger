"use client";

/**
 * App start / company switch: device-local SQLite company ke saare mirror collections
 * background me read karo (vouchers included) + attachment bytes turant warm queue.
 * Web + static dono — `CompanyAttachmentOfflineBackfillManager` debounce se pehle SQLite primed rahe.
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
import { COMPANY_LOCAL_MIRROR_SUBCOLLECTIONS } from "@/lib/firestoreToLocalCompanyPull";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { shouldReadLedgerFromSqliteOnly, isDeviceLocalCompany } from "@/lib/companyStorageKind";
import {
  runEmbeddedAttachmentPrefetchPhase,
  scrapeLocalMirrorAttachmentUrls,
  shouldPrefetchAttachmentsForCompany,
} from "@/lib/offlineFullWarmSync";
import { queueAttachmentUrlsWarm } from "@/lib/attachmentLoadReady";
import { isEmbeddedOfflinePreloadClient } from "@/lib/isEmbeddedOfflinePreloadClient";
import { shouldSkipCompanyWideAttachmentPrefetchOnWeb } from "@/lib/webAttachmentLazyLoadPolicy";

function isLocalSqliteLedgerCompany(c: Company | null | undefined): boolean {
  if (!c) return false;
  return shouldReadLedgerFromSqliteOnly(c) || isDeviceLocalCompany(c);
}

export function LocalCompanySqliteWarmBootstrap() {
  const { user } = useAuth();
  const { companyId, company, loading } = useCompany();
  const { gateActive } = useFirstLoginWarmGate();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    abortRef.current?.abort();
    abortRef.current = null;

    const c = company;
    const cid = companyId?.trim();
    if (!user || loading || !cid || !c) return;
    if (!isLocalSqliteLedgerCompany(c) && !shouldPrefetchAttachmentsForCompany(c)) return;
    if (gateActive) return;

    const ac = new AbortController();
    abortRef.current = ac;

    void (async () => {
      if (ac.signal.aborted) return;
      // Poori company SQLite mirror — masters + vouchers (app start par lazy chunk se pehle).
      const paths = COMPANY_LOCAL_MIRROR_SUBCOLLECTIONS as unknown as readonly string[];
      await Promise.all(
        paths.map((collection) =>
          listCompanyDocsFromBrowserDb(cid, collection, { forBackupMerge: true }).catch(() => [])
        )
      );
      if (ac.signal.aborted) return;
      // EXE/APK: attachment warm offlineWarmSyncManager / first-login overlay karte hain — duplicate CPU avoid.
      if (isEmbeddedOfflinePreloadClient()) return;
      // Web Chrome: billing — company-wide Firebase full prefetch mat chalao (visible thumb / hover only).
      if (shouldSkipCompanyWideAttachmentPrefetchOnWeb()) return;

      const urls = [...(await scrapeLocalMirrorAttachmentUrls(cid))];
      if (urls.length > 0) {
        queueAttachmentUrlsWarm(urls.slice(0, 400), cid);
      }
      if (ac.signal.aborted) return;

      if (shouldPrefetchAttachmentsForCompany(c)) {
        await runEmbeddedAttachmentPrefetchPhase({
          company: c,
          localCompanyId: cid,
          signal: ac.signal,
          onProgressPercent: (pct) => reportHeaderAttachmentPrefetchProgress(cid, pct),
        });
      }
    })();

    return () => {
      ac.abort();
      clearHeaderAttachmentPrefetchForCompany(cid);
    };
  }, [user, loading, companyId, company, gateActive]);

  return null;
}
