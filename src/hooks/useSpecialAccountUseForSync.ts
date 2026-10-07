"use client";

import { useCallback, useRef } from "react";
import type { Company } from "@/hooks/useCompany";
import { normalizeSpecialAccountUseFor, type SpecialAccountUseFor } from "@/lib/specialAccountUsage";
import { persistSpecialAccountUsagePermissionConfig } from "@/lib/persistSpecialAccountUsagePermissionConfig";

/** Form ↔ Manage Sharing: debounced permissionConfig + usage defaults sync. */
export function useSpecialAccountUseForSync(companyId: string | null | undefined, company: Company | null | undefined) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncUsageToCompanyPermissions = useCallback(
    (raw: SpecialAccountUseFor) => {
      const cid = String(companyId || "").trim();
      if (!cid || !company) return;
      const useFor = normalizeSpecialAccountUseFor(raw);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void persistSpecialAccountUsagePermissionConfig(cid, company, useFor).catch(() => undefined);
      }, 450);
    },
    [company, companyId]
  );

  return { syncUsageToCompanyPermissions };
}
