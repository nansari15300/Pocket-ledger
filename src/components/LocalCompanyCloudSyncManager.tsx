"use client";

import { useEffect, useRef } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { listLocalCompanies, getLocalCompanyById, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import { readCloudSyncConfigFromCompany, shouldUseLocalCloudSync } from "@/lib/localCloudSync/companyConfig";
import { purgeAllLocalCompaniesMissingOnDrive } from "@/lib/localCloudSync/driveCompanyFolderLifecycle";
import { isLocalCloudSyncCycleRunning, runLocalCloudSyncCycle } from "@/lib/localCloudSync/engine";
import { logLocalCloudSync } from "@/lib/localCloudSync/logger";
import { MIN_CLOUD_SYNC_TICK_MS } from "@/lib/localCloudSync/types";
import { hasRealFirebaseAuthSession, waitForFirebaseAuthReady } from "@/lib/firebaseAuthForApi";

function isCompanySyncDue(row: LocalCompanyDoc, now: number): boolean {
  const cfg = readCloudSyncConfigFromCompany(row);
  const intervalMs = cfg.cloudSyncIntervalSec * 1000;
  const lastSyncAt = cfg.cloudSyncLastSyncAt ?? 0;
  return now - lastSyncAt >= intervalMs;
}

async function runScheduledDriveSyncForCompany(
  row: LocalCompanyDoc,
  options?: { force?: boolean }
): Promise<void> {
  const cid = String(row.id || "").trim();
  if (!cid) return;
  if (!(await shouldUseLocalCloudSync(cid))) return;
  const cfg = readCloudSyncConfigFromCompany(row);
  if (!cfg.cloudSyncEnabled) return;

  const now = Date.now();
  const force = options?.force === true;
  if (!force && !isCompanySyncDue(row, now)) return;
  if (isLocalCloudSyncCycleRunning(cid)) return;

  await runLocalCloudSyncCycle(cid, { force: true });
}

/** Har MIN tick: enabled Drive companies — interval due par force sync (manual Force sync jaisa). */
export function LocalCompanyCloudSyncManager() {
  const { company, clearCompanyId, reloadLocalCompanyRegistry } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const runningRef = useRef(false);
  const lastDrivePurgeAtRef = useRef(0);
  const activeCompanyIdRef = useRef<string | null>(null);
  activeCompanyIdRef.current = company?.id ?? null;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const tick = async (options?: { forceActive?: boolean }) => {
      if (runningRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      await waitForFirebaseAuthReady();
      if (!hasRealFirebaseAuthSession()) return;

      runningRef.current = true;
      try {
        const now = Date.now();
        if (now - lastDrivePurgeAtRef.current >= 60_000) {
          lastDrivePurgeAtRef.current = now;
          const purged = await purgeAllLocalCompaniesMissingOnDrive(user?.uid ?? null);
          if (purged.length > 0) {
            reloadLocalCompanyRegistry();
            if (company?.id && purged.some((p) => p.companyId === company.id)) {
              clearCompanyId();
            }
            for (const row of purged) {
              toast({
                title: "Company removed",
                description: `"${row.companyName}" Google Drive par nahi mili (sync ON) — is device se hata di.`,
              });
            }
          }
        }

        const companies = await listLocalCompanies();
        const activeId = activeCompanyIdRef.current;
        const ordered = activeId
          ? [
              ...companies.filter((c) => c.id === activeId),
              ...companies.filter((c) => c.id !== activeId),
            ]
          : companies;

        for (const c of ordered) {
          const isActive = c.id === activeId;
          await runScheduledDriveSyncForCompany(c, {
            force: options?.forceActive === true && isActive,
          });
        }
      } catch (e) {
        logLocalCloudSync("background tick error", e);
      } finally {
        runningRef.current = false;
      }
    };

    void tick();
    const intervalId = window.setInterval(() => void tick(), MIN_CLOUD_SYNC_TICK_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void tick({ forceActive: true });
    };
    const onFocus = () => void tick({ forceActive: true });
    const onOnline = () => void tick({ forceActive: true });

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [company?.id, clearCompanyId, reloadLocalCompanyRegistry, toast, user?.uid]);

  /** Company switch — turant force sync taaki dusre device ka data jaldi aaye. */
  useEffect(() => {
    const cid = String(company?.id || "").trim();
    if (!cid) return;
    void (async () => {
      const reg = await getLocalCompanyById(cid, { includeDeleted: true });
      if (!reg) return;
      await runScheduledDriveSyncForCompany(reg, { force: true });
    })();
  }, [company?.id]);

  return null;
}
