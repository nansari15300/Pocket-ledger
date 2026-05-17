"use client";

import { useEffect, useRef } from "react";
import { useCompany } from "@/hooks/useCompany";
import { listLocalCompanies } from "@/lib/localCompanyStore";
import { shouldUseLocalCloudSync } from "@/lib/localCloudSync/companyConfig";
import { runLocalCloudSyncCycle } from "@/lib/localCloudSync/engine";
import { logLocalCloudSync } from "@/lib/localCloudSync/logger";

const INTERVAL_MS = 30_000;

/** Har 30s: sirf enabled local companies — offline / overlap skip. */
export function LocalCompanyCloudSyncManager() {
  const { company } = useCompany();
  const runningRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const tick = async () => {
      if (runningRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      runningRef.current = true;
      try {
        const companies = await listLocalCompanies();
        for (const c of companies) {
          if (!(await shouldUseLocalCloudSync(c.id))) continue;
          await runLocalCloudSyncCycle(c.id);
        }
      } catch (e) {
        logLocalCloudSync("background tick error", e);
      } finally {
        runningRef.current = false;
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [company?.id]);

  return null;
}
