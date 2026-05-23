"use client";

import { useEffect, useRef } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { resolveEffectiveAccountPlanId } from "@/lib/accountPlanForOwner";
import {
  isAutoBackupDue,
  readAutoBackupPrefs,
  saveAutoBackupPrefs,
  type AutoBackupPrefs,
} from "@/lib/autoBackupPrefs";
import {
  dismissCompanyBackupRunLater,
  isCompanyBackupRunning,
  startCompanyBackupRun,
} from "@/lib/companyBackupRunner";

/** Dashboard layout — device prefs ke hisaab se scheduled backup (same runner, background). */
export function AutoBackupScheduler() {
  const { company, companyId, allCompanies } = useCompany();
  const { user } = useAuth();
  const ticking = useRef(false);

  useEffect(() => {
    // Auto backup — device prefs se scheduled backup (web + static/APK/Electron).
    const tick = async () => {
      if (ticking.current || isCompanyBackupRunning()) return;
      const prefs = readAutoBackupPrefs();
      if (!isAutoBackupDue(prefs)) return;
      if (!user?.uid || !companyId || !company?.password || !company.isOwned) return;

      ticking.current = true;
      try {
        const accountPlanId = resolveEffectiveAccountPlanId(allCompanies, user.uid, company.planId);
        const result = await startCompanyBackupRun({
          company,
          companyId,
          ownerUid: user.uid,
          accountPlanId,
          includeAttachments: prefs.includeAttachments,
        });
        if (result.ok) {
          const next: AutoBackupPrefs = {
            ...prefs,
            lastRunAt: Date.now(),
          };
          saveAutoBackupPrefs(next);
          dismissCompanyBackupRunLater(10000);
        }
      } finally {
        ticking.current = false;
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 60 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [allCompanies, company, companyId, user?.uid]);

  return null;
}
