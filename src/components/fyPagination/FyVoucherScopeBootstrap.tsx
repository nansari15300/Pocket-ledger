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
} from "@/lib/fyPagination/sqliteFirstFyLoad";

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
        const scope = companyUsesFiscalMergeDividers(company)
          ? buildFiscalMergeFullVoucherScope(company?.country)
          : await buildScopeWithMinTxnsInFy({
              companyId,
              country: company?.country,
            });

        await applyFyScopeFromSqlite({ companyId, fy, scope });
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

        void bootstrapArchivePriorFyKeys({ companyId, country: company?.country }).catch(() => {});

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

export function FyVoucherScopeBootstrap({ children }: { children: React.ReactNode }) {
  const { company } = useCompany();
  const companyId = String(company?.id || "").trim() || null;

  return (
    <FyVoucherScopeProvider companyId={companyId} enabled={Boolean(companyId)}>
      <FyScopeLoaderInner />
      {children}
    </FyVoucherScopeProvider>
  );
}
