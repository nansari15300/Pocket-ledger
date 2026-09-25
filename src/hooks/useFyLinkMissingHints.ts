"use client";

import { useCallback, useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useFyVoucherScope } from "@/contexts/FyVoucherScopeContext";
import { listColdFyKeysForLinkScan } from "@/lib/fyPagination/archiveBootstrap";
import { buildLinkCandidateScanRanges } from "@/lib/fyPagination/linkScanRanges";
import { detectUnloadedBillWiseLinkTargets } from "@/lib/fyPagination/linkScopePrompt";
import { listPartyLinkCandidateStubsInRange } from "@/lib/fyPagination/partyLinkCandidates";
import type { FyUnloadedLinkHint } from "@/lib/fyPagination/types";

export function useFyLinkMissingHints() {
  const { company } = useCompany();
  const fy = useFyVoucherScope();
  const [hints, setHints] = useState<FyUnloadedLinkHint[]>([]);
  const [loading, setLoading] = useState(false);

  const scanForParty = useCallback(
    async (partyId: string | null | undefined, inMemoryVoucherIds: Set<string>) => {
      const pid = String(partyId || "").trim();
      const companyId = String(company?.id || "").trim();
      if (!pid || !companyId || !fy.enabled || !fy.activeScope) {
        setHints([]);
        return [];
      }

      setLoading(true);
      try {
        const archived = await listColdFyKeysForLinkScan(companyId, company?.country);
        const ranges = buildLinkCandidateScanRanges({
          country: company?.country,
          activeScope: fy.activeScope,
          archivedFyKeys: archived,
        });

        const candidates: Array<{ id: string; date: unknown }> = [];
        for (const range of ranges) {
          const stubs = await listPartyLinkCandidateStubsInRange(companyId, pid, range);
          candidates.push(...stubs);
        }

        const found = detectUnloadedBillWiseLinkTargets({
          country: company?.country,
          candidateVouchers: candidates,
          inMemoryVoucherIds,
        });
        setHints(found);
        return found;
      } finally {
        setLoading(false);
      }
    },
    [company, fy.activeScope, fy.enabled]
  );

  const loadHintFy = useCallback(
    async (hint: FyUnloadedLinkHint) => {
      if (!hint.fyKey) return;
      await fy.requestLoadFyKey(hint.fyKey, company?.country);
      setHints((prev) => prev.filter((h) => h.fyKey !== hint.fyKey));
    },
    [company?.country, fy]
  );

  const clearHints = useCallback(() => {
    setHints((prev) => (prev.length === 0 ? prev : []));
  }, []);

  return { hints, loading, scanForParty, loadHintFy, clearHints };
}
