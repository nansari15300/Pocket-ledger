"use client";

import { useEffect, useRef } from "react";
import { useCompany } from "@/hooks/useCompany";
import {
  FyVoucherScopeProvider,
  hydrateOpeningFromSnapshot,
  useFyVoucherScope,
} from "@/contexts/FyVoucherScopeContext";
import {
  buildFiscalMergeFullVoucherScope,
  companyUsesFiscalMergeDividers,
  hasFullLocalLedgerVoucherMirror,
} from "@/lib/fyPagination/fiscalMergeFullVoucherScope";
import { readyOpeningHydrateResult } from "@/lib/fyPagination/openingSnapshotStatus";
import { getFiscalMergePartitionsFromCompany } from "@/lib/fiscalPartitionRows";
import { buildScopeWithMinTxnsInFy } from "@/lib/fyPagination/minTxnScope";
import { bootstrapArchivePriorFyKeys } from "@/lib/fyPagination/archiveBootstrap";
import { readLocalFyOpeningBalances } from "@/lib/fyPagination/openingSnapshotHydrate";
import {
  applyFyScopeFromSqlite,
  scheduleBackgroundOnlineFyRangeHydrate,
  scheduleOnlineFullVoucherMirrorPull,
} from "@/lib/fyPagination/sqliteFirstFyLoad";
import {
  FIREBASE_LEDGER_COMPANY_SYNC_PREFS_CHANGED_EVENT,
  isFirebaseLedgerCompanyDataSyncEnabled,
} from "@/lib/firebaseLedgerCompanySyncPrefs";
import { isCloudLinkedCompanyStorage } from "@/lib/companyUnlockGate";
import {
  ensureVoucherLoadSettingsHydrated,
  isVoucherLoadModeAll,
  readCachedVoucherLoadSettings,
  shouldPullFullVoucherMirrorForAllMode,
} from "@/lib/voucherLoadModeSettings";
import { ensureGlobalSyncModeSettingsHydrated } from "@/lib/globalSyncModeSettings";
import { subscribeVoucherLivePatch } from "@/lib/voucherFormAttachmentSave";

function FyHydratedVoucherLivePatchSync() {
  const { companyId } = useCompany();
  const fy = useFyVoucherScope();

  useEffect(() => {
    const cid = String(companyId || "").trim();
    if (!cid || !fy.enabled) return;
    return subscribeVoucherLivePatch((detail) => {
      if (detail.companyId !== cid) return;
      const ids =
        Array.isArray(detail.voucherIds) && detail.voucherIds.length > 0
          ? detail.voucherIds
          : detail.voucherId
            ? [detail.voucherId]
            : [];
      if (!ids.length) return;
      fy.patchHydratedVouchers(ids, detail.patch);
    });
  }, [companyId, fy.enabled, fy.patchHydratedVouchers]);

  return null;
}

function FyScopeLoaderInner() {
  const { company } = useCompany();
  const fy = useFyVoucherScope();
  const bootedCompanyRef = useRef<string | null>(null);
  const bootedMergeKeyRef = useRef<string>("");
  const bootingRef = useRef(false);
  const fiscalMergeBootKey = companyUsesFiscalMergeDividers(company)
    ? `merge:${getFiscalMergePartitionsFromCompany(company)
        .map((d) => d.getTime())
        .join(",")}`
    : "default";

  useEffect(() => {
    const companyId = String(company?.id || "").trim();
    if (!companyId || !fy.enabled) return;

    const bootKey = `${companyId}:${fiscalMergeBootKey}`;
    if (bootedCompanyRef.current && bootedCompanyRef.current !== companyId) {
      bootedCompanyRef.current = null;
      bootedMergeKeyRef.current = "";
      bootingRef.current = false;
      fy.resetScopeState();
    }

    if (bootedMergeKeyRef.current === bootKey || bootingRef.current) return;

    bootingRef.current = true;
    let cancelled = false;

    void (async () => {
      try {
        void ensureGlobalSyncModeSettingsHydrated();
        const voucherLoadSettings = await ensureVoucherLoadSettingsHydrated();
        const adminAllMode = isVoucherLoadModeAll(voucherLoadSettings);
        const dataTickEnabled =
          isCloudLinkedCompanyStorage(company) &&
          isFirebaseLedgerCompanyDataSyncEnabled(companyId, company);
        const adminAllNeedsPull =
          isCloudLinkedCompanyStorage(company) &&
          adminAllMode &&
          shouldPullFullVoucherMirrorForAllMode(companyId, voucherLoadSettings);
        const onlineDataSyncFullScope =
          companyUsesFiscalMergeDividers(company) ||
          (adminAllMode && (dataTickEnabled || adminAllNeedsPull));

        const scope = onlineDataSyncFullScope
          ? buildFiscalMergeFullVoucherScope(company?.country)
          : await buildScopeWithMinTxnsInFy({
              companyId,
              country: company?.country,
              minTxn: 10,
            });

        await applyFyScopeFromSqlite({ companyId, fy, scope });
        if (onlineDataSyncFullScope) {
          if (dataTickEnabled) {
            scheduleOnlineFullVoucherMirrorPull({ company, companyId, reason: "data_tick" });
          } else if (adminAllNeedsPull) {
            scheduleOnlineFullVoucherMirrorPull({ company, companyId, reason: "admin_all_mode" });
          }
        }
        if (cancelled) return;

        if (cancelled) return;
        if (hasFullLocalLedgerVoucherMirror(company, scope)) {
          fy.applyOpeningHydrateResult(readyOpeningHydrateResult({}));
        } else {
          const localOpening = await readLocalFyOpeningBalances(companyId, scope);
          if (cancelled) return;
          if (localOpening) fy.applyOpeningHydrateResult(localOpening);
          else fy.setOpeningBalancesLoading();
        }

        bootedCompanyRef.current = companyId;
        bootedMergeKeyRef.current = bootKey;

        scheduleBackgroundOnlineFyRangeHydrate({
          company,
          companyId,
          range: scope.range,
          fy,
        });

        // Very late: archive meta only. Never on dashboard first paint (EXE freeze).
        window.setTimeout(() => {
          if (cancelled) return;
          void bootstrapArchivePriorFyKeys({ companyId, country: company?.country }).catch(() => {});
        }, 60_000);

        if (!hasFullLocalLedgerVoucherMirror(company, scope)) {
          void hydrateOpeningFromSnapshot(companyId, scope, company)
            .then((opening) => {
              if (!cancelled) fy.applyOpeningHydrateResult(opening);
            })
            .catch((err) => {
              console.warn("[FyVoucherScopeBootstrap] opening hydrate", err);
            });
        }
      } catch (err) {
        console.warn("[FyVoucherScopeBootstrap] boot failed", err);
      } finally {
        bootingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      bootingRef.current = false;
    };
    // fy.* setters are stable; boot guarded by bootingRef / bootedCompanyRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: avoid re-boot on scope/voucher churn
  }, [
    company?.id,
    company?.country,
    company?.authoritativeCompanyId,
    company?.fiscalSplitMode,
    company?.fiscalMergePartitionAtIsos,
    company?.fiscalMergePartitionAt,
    fiscalMergeBootKey,
    fy.enabled,
  ]);

  return null;
}

/** Online tab Save (Data tick): widen scope + full voucher pull without full page reload. */
function FyOnlineDataSyncPrefsListener() {
  const { company } = useCompany();
  const fy = useFyVoucherScope();

  useEffect(() => {
    const companyId = String(company?.id || "").trim();
    if (!companyId || !fy.enabled) return;

    const onPrefs = () => {
      if (!isCloudLinkedCompanyStorage(company)) return;
      if (!isFirebaseLedgerCompanyDataSyncEnabled(companyId, company)) return;
      const voucherLoadSettings = readCachedVoucherLoadSettings();
      if (!isVoucherLoadModeAll(voucherLoadSettings)) return;
      const scope = buildFiscalMergeFullVoucherScope(company?.country);
      fy.setActiveScope(scope);
      void applyFyScopeFromSqlite({ companyId, fy, scope });
      scheduleOnlineFullVoucherMirrorPull({ company, companyId });
    };

    window.addEventListener(FIREBASE_LEDGER_COMPANY_SYNC_PREFS_CHANGED_EVENT, onPrefs);
    return () => window.removeEventListener(FIREBASE_LEDGER_COMPANY_SYNC_PREFS_CHANGED_EVENT, onPrefs);
  }, [company, fy]);

  return null;
}

export function FyVoucherScopeBootstrap({ children }: { children: React.ReactNode }) {
  const { company } = useCompany();
  const companyId = String(company?.id || "").trim() || null;

  return (
    <FyVoucherScopeProvider companyId={companyId} enabled={Boolean(companyId)}>
      <FyScopeLoaderInner />
      <FyOnlineDataSyncPrefsListener />
      <FyHydratedVoucherLivePatchSync />
      {children}
    </FyVoucherScopeProvider>
  );
}
