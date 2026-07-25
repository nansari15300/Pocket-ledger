"use client";

import { useEffect, useRef } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { resolveEffectiveAccountPlanId } from "@/lib/accountPlanForOwner";
import {
  isAutoBackupDueForCompany,
  readAutoBackupPrefs,
} from "@/lib/autoBackupPrefs";
import { runAutoBackupQueue } from "@/lib/autoBackupRunner";
import { isCompanyBackupRunning } from "@/lib/companyBackupRunner";

/** Dashboard layout — scheduled auto backup for ticked companies at chosen time. */
export function AutoBackupScheduler() {
  const { allCompanies } = useCompany();
  const { user } = useAuth();
  const ticking = useRef(false);

  useEffect(() => {
    const tick = async () => {
      if (ticking.current || isCompanyBackupRunning()) return;
      const prefs = readAutoBackupPrefs();
      if (!prefs.enabled || prefs.frequency === "off") return;
      if (!user?.uid) return;
      if (prefs.companyIds.length === 0) return;

      const dueIds = prefs.companyIds.filter((id) => isAutoBackupDueForCompany(prefs, id));
      if (dueIds.length === 0) return;

      ticking.current = true;
      try {
        await runAutoBackupQueue({
          companyIds: dueIds,
          allCompanies,
          ownerUid: user.uid,
          ownerEmail: user.email ?? null,
          resolveAccountPlanId: (c) =>
            resolveEffectiveAccountPlanId(allCompanies, user.uid, c.planId),
          markRunsInPrefs: true,
        });
      } finally {
        ticking.current = false;
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 60 * 1000);
    return () => window.clearInterval(id);
  }, [allCompanies, user?.uid]);

  return null;
}
