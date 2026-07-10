"use client";

import { useEffect, useRef } from "react";
import { writeSelectedCompanyId, readSelectedCompanyId } from "@/lib/selectedCompanyStorage";
import {
  runPlServerCompanyDetectionAudit,
  seedLocalExePlanSyncPoisonForAudit,
  type PlServerCompanyDetectionAuditReport,
} from "@/lib/plServerCompanyDetectionAudit";

declare global {
  interface Window {
    __PL_COMPANY_DETECTION_AUDIT_REPORT__?: PlServerCompanyDetectionAuditReport;
  }
}

function readAuditParams() {
  if (typeof window === "undefined") return null;
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("pl_company_detection_audit") !== "1") return null;
    return {
      seed: sp.get("pl_audit_seed") === "1",
      companyName: sp.get("pl_audit_company_name") || "Local Exe",
      companyId: sp.get("pl_audit_company_id") || "pl-audit-local-exe",
    };
  } catch {
    return null;
  }
}

/** Dev/EXE audit only — ?pl_company_detection_audit=1 (no auth / CompanyProvider required). */
export function PlServerCompanyDetectionAuditRunner() {
  const ranRef = useRef(false);

  useEffect(() => {
    const params = readAuditParams();
    if (!params || ranRef.current) return;
    ranRef.current = true;

    void (async () => {
      try {
        await import("@/lib/localSqlite").then((m) => m.getBrowserDb());

        const companyId = params.companyId;
        if (params.seed) {
          await seedLocalExePlanSyncPoisonForAudit(companyId, params.companyName);
          writeSelectedCompanyId(companyId);
        }

        await new Promise((r) => setTimeout(r, 400));

        const report = await runPlServerCompanyDetectionAudit({
          companyId: readSelectedCompanyId() || companyId,
          companyNameHint: params.companyName,
          useCompanyRow: null,
          allCompaniesRegistry: [],
        });

        window.__PL_COMPANY_DETECTION_AUDIT_REPORT__ = report;
        console.log("__PL_COMPANY_DETECTION_AUDIT_REPORT__", JSON.stringify(report, null, 2));
      } catch (e) {
        const err = {
          error: e instanceof Error ? e.message : String(e),
          auditedAt: new Date().toISOString(),
        };
        window.__PL_COMPANY_DETECTION_AUDIT_REPORT__ = err as unknown as PlServerCompanyDetectionAuditReport;
        console.log("__PL_COMPANY_DETECTION_AUDIT_REPORT__", JSON.stringify(err, null, 2));
      }
    })();
  }, []);

  return null;
}
