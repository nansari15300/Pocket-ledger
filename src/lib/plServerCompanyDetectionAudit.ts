"use client";

import type { Company } from "@/hooks/useCompany";
import { readSelectedCompanyId } from "@/lib/selectedCompanyStorage";
import { getLocalCompanyById, listLocalCompanies, upsertLocalCompany } from "@/lib/localCompanyStore";
import {
  isLocalSelectorCompanyRow,
  isPureLocalLedgerCompany,
  isServerGateCompany,
} from "@/lib/companyStorageKind";
import { isCloudLinkedCompanyStorage } from "@/lib/companyUnlockGate";
import { isLocalCompanyHostShareable } from "@/lib/listShareableLocalCompaniesForHost";
import { normalizeRowForLocalDriveSyncUi } from "@/lib/localCloudSync/companyConfig";

export type PlServerCompanyDetectionAuditRow = {
  source: string;
  companyId: string;
  name: string | null;
  storageOption: string | null;
  syncPolicy: string | null;
  syncedFromCloud: boolean | null;
  authoritativeCompanyId: string | null;
  plServerShared: boolean | null;
  isServerGateCompany: boolean;
  isLocalSelectorCompanyRow: boolean;
  isPureLocalLedgerCompany: boolean;
  isCloudLinkedCompanyStorage: boolean;
  isLocalCompanyHostShareable: boolean | null;
  notes?: string;
};

export type PlServerCompanyDetectionAuditReport = {
  auditedAt: string;
  companyId: string;
  companyName: string;
  selectedCompanyIdFromStorage: string;
  rows: PlServerCompanyDetectionAuditRow[];
  divergences: string[];
  conclusion: {
    wrongObjects: string[];
    likelyWriter: string | null;
    problemKind: ("bad_data" | "bad_classifier" | "bad_ui" | "multiple")[];
    hostShareable: boolean;
  };
};

function pickFields(row: Company | null | undefined) {
  return {
    name: row?.name ? String(row.name) : null,
    storageOption: row?.storageOption != null ? String(row.storageOption) : null,
    syncPolicy: row?.syncPolicy != null ? String(row.syncPolicy) : null,
    syncedFromCloud:
      row?.syncedFromCloud === true ? true : row?.syncedFromCloud === false ? false : null,
    authoritativeCompanyId: row?.authoritativeCompanyId
      ? String(row.authoritativeCompanyId)
      : null,
    plServerShared: row?.plServerShared === true ? true : row?.plServerShared === false ? false : null,
  };
}

/** Mirrors CompanySelector display path — no identity overlay; SQLite values as-is. */
export function buildCompanySelectorDisplayRow(raw: Company): Company {
  if (!isLocalSelectorCompanyRow(raw)) return raw;
  const normalized = normalizeRowForLocalDriveSyncUi({
    ...raw,
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : raw.id,
  });
  return normalized as Company;
}

async function auditRow(
  source: string,
  companyId: string,
  row: Company | null | undefined,
  opts: { hostShareable?: boolean | null; notes?: string }
): Promise<PlServerCompanyDetectionAuditRow> {
  const fields = pickFields(row);
  return {
    source,
    companyId,
    ...fields,
    isServerGateCompany: isServerGateCompany(row),
    isLocalSelectorCompanyRow: row ? isLocalSelectorCompanyRow(row) : false,
    isPureLocalLedgerCompany: row ? isPureLocalLedgerCompany(row) : false,
    isCloudLinkedCompanyStorage: row
      ? isCloudLinkedCompanyStorage(row as { storageOption?: string; syncedFromCloud?: boolean })
      : false,
    isLocalCompanyHostShareable:
      opts.hostShareable === undefined ? null : Boolean(opts.hostShareable),
    notes: row ? opts.notes : [opts.notes, "(row missing)"].filter(Boolean).join(" "),
  };
}

function findDivergences(rows: PlServerCompanyDetectionAuditRow[]): string[] {
  const out: string[] = [];
  const keys = [
    "storageOption",
    "syncPolicy",
    "syncedFromCloud",
    "authoritativeCompanyId",
    "plServerShared",
  ] as const;
  const bySource = Object.fromEntries(rows.map((r) => [r.source, r]));
  for (const key of keys) {
    const values = rows.map((r) => ({ source: r.source, value: r[key] }));
    const uniq = [...new Set(values.map((v) => JSON.stringify(v.value)))];
    if (uniq.length > 1) {
      out.push(
        `${key} diverges: ${values.map((v) => `${v.source}=${JSON.stringify(v.value)}`).join(" | ")}`
      );
    }
  }
  const selectorLocal = bySource["CompanySelector (display row)"]?.isLocalSelectorCompanyRow;
  const sqliteRow = bySource["SQLite (getLocalCompanyById)"];
  const hostOk = sqliteRow?.isLocalCompanyHostShareable;
  if (selectorLocal && hostOk === false) {
    out.push("Selector treats as Local but PlServer host check (SQLite-first) is false");
  }
  if (sqliteRow && bySource["CompanySelector (display row)"]) {
    const sel = bySource["CompanySelector (display row)"];
    if (sel.syncedFromCloud === false && sqliteRow.syncedFromCloud === true) {
      out.push("Selector display syncedFromCloud=false but SQLite syncedFromCloud=true");
    }
  }
  return out;
}

export async function runPlServerCompanyDetectionAudit(input: {
  companyId?: string;
  companyNameHint?: string;
  useCompanyRow?: Company | null;
  allCompaniesRegistry?: Company[];
}): Promise<PlServerCompanyDetectionAuditReport> {
  const registry = input.allCompaniesRegistry ?? [];
  let companyId = String(input.companyId || readSelectedCompanyId() || "").trim();

  if (!companyId && input.companyNameHint) {
    const hint = input.companyNameHint.trim().toLowerCase();
    const fromReg = registry.find((c) => String(c.name || "").trim().toLowerCase() === hint);
    if (fromReg?.id) companyId = fromReg.id;
    if (!companyId) {
      const locals = await listLocalCompanies();
      const fromSql = locals.find((c) => String(c.name || "").trim().toLowerCase() === hint);
      if (fromSql?.id) companyId = fromSql.id;
    }
  }

  if (!companyId) {
    throw new Error("No companyId — select a company or pass pl_audit_company_name");
  }

  const sqliteRaw = await getLocalCompanyById(companyId);
  const registryRow = registry.find((c) => c.id === companyId) ?? null;
  const useCompanyRow =
    input.useCompanyRow?.id === companyId
      ? input.useCompanyRow
      : registryRow ?? (sqliteRaw as Company | null);

  const selectorBase = registryRow ?? useCompanyRow ?? (sqliteRaw as Company | null);
  const selectorDisplay = selectorBase ? buildCompanySelectorDisplayRow(selectorBase as Company) : null;

  const registryRowForHost = useCompanyRow ?? registryRow ?? (sqliteRaw as Company | null);
  const hostShareable = await isLocalCompanyHostShareable(
    companyId,
    registry,
    registryRowForHost
  );

  const rows: PlServerCompanyDetectionAuditRow[] = [];
  rows.push(
    await auditRow("CompanySelector (display row)", companyId, selectorDisplay, {
      hostShareable: null,
      notes: "CompanySelector display mirrors SQLite (no identity overlay)",
    })
  );
  rows.push(
    await auditRow("useCompany().company", companyId, useCompanyRow, {
      hostShareable: null,
      notes: useCompanyRow
        ? undefined
        : "null in audit harness — on live EXE this is useCompany().company after login",
    })
  );
  rows.push(
    await auditRow("allCompaniesRegistry entry", companyId, registryRow, {
      hostShareable: null,
      notes: registryRow
        ? undefined
        : "null in audit harness — on live EXE compare allCompaniesRegistry.find(id)",
    })
  );
  rows.push(
    await auditRow("SQLite (getLocalCompanyById)", companyId, sqliteRaw as Company | null, {
      hostShareable,
      notes: "PlServer isLocalCompanyHostShareable reads this first",
    })
  );

  const divergences = findDivergences(rows);

  const wrongObjects: string[] = [];
  const sqlite = rows.find((r) => r.source.startsWith("SQLite"));
  const selector = rows.find((r) => r.source.startsWith("CompanySelector"));
  if (sqlite && selector) {
    if (
      sqlite.storageOption !== selector.storageOption ||
      sqlite.syncedFromCloud !== selector.syncedFromCloud
    ) {
      wrongObjects.push("SQLite");
    }
    if (selector.syncedFromCloud === false && sqlite.syncedFromCloud === true) {
      wrongObjects.push("CompanySelector (display lies vs SQLite)");
    }
  }

  const problemKind: PlServerCompanyDetectionAuditReport["conclusion"]["problemKind"] = [];
  if (sqlite?.syncedFromCloud === true && sqlite.storageOption === "local") problemKind.push("bad_data");
  if (selector && sqlite && selector.isLocalSelectorCompanyRow !== sqlite.isPureLocalLedgerCompany) {
    problemKind.push("bad_classifier");
  }
  if (selector?.syncedFromCloud === false && sqlite?.syncedFromCloud === true) problemKind.push("bad_ui");
  if (problemKind.length > 1 || (problemKind.length && wrongObjects.length > 1)) problemKind.push("multiple");

  let likelyWriter: string | null = null;
  if (sqlite?.syncedFromCloud === true && sqlite.storageOption === "local") {
    likelyWriter =
      "applyAuthoritativePlanPayloadToLocal (companyPlanServerSync.ts) — legacy: syncedFromCloud:true + authoritativeCompanyId on local rows";
  }
  if (hostShareable && sqlite?.storageOption === "local" && sqlite.syncedFromCloud === false) {
    likelyWriter = null;
  }

  const companyName =
    String(useCompanyRow?.name || registryRow?.name || sqliteRaw?.name || companyId);

  return {
    auditedAt: new Date().toISOString(),
    companyId,
    companyName,
    selectedCompanyIdFromStorage: readSelectedCompanyId(),
    rows,
    divergences,
    conclusion: {
      wrongObjects: [...new Set(wrongObjects)],
      likelyWriter,
      problemKind: problemKind.length ? [...new Set(problemKind)] : ["bad_data"],
      hostShareable,
    },
  };
}

/** Runtime proof seed — simulates plan sync apply (post-fix identity must stay local). */
export async function seedLocalExePlanSyncPoisonForAudit(companyId: string, companyName: string) {
  const id = companyId.trim();
  await upsertLocalCompany({
    id,
    name: companyName,
    ownerId: "audit-owner",
    ownerEmail: "audit@local.test",
    storageOption: "local",
    syncPolicy: "offline",
    syncedFromCloud: false,
    planId: "basic",
    createdAt: Date.now(),
    sharedWith: [],
  } as Parameters<typeof upsertLocalCompany>[0]);
  const { applyAuthoritativePlanPayloadToLocalForAudit } = await import(
    "@/lib/companyPlanServerSync"
  );
  await applyAuthoritativePlanPayloadToLocalForAudit({
    firebaseCompanyId: `${id}-firebase-shadow`,
    localCompanyId: id,
    data: {
      companyId: `${id}-firebase-shadow`,
      planId: "pro",
      planExpiryMs: Date.now() + 86400000 * 30,
    },
  });
}
