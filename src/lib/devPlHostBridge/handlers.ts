"use client";

import { listLocalCompanies, localCompanyRowIsDeleted, getLocalCompanyById } from "@/lib/localCompanyStore";
import {
  normalizeLocalCompanyRowForHost,
} from "@/lib/listShareableLocalCompaniesForHost";
import {
  isLocalServerShareableCompany,
} from "@/lib/localServerShareableCompanies";
import { localAuthLoginClientOnly } from "@/lib/localCompanyUsers";
import { COLLECTIONS_TO_BACKUP } from "@/lib/companyBackupCollections";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { plServerVoucherFlowLog } from "@/lib/plServerLivePullDevLog";

export async function devHostBridgeValidateLogin(payload: Record<string, unknown>) {
  const companyId = String(payload.companyId || "").trim();
  const username = String(payload.username || "").trim();
  const password = String(payload.password || "").trim();
  try {
    const { token, user } = await localAuthLoginClientOnly(companyId, username, password, undefined, {
      remoteGate: true,
    });
    return { ok: true as const, token, user };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Invalid username or password",
    };
  }
}

export async function devHostBridgeReadAttachment(payload: Record<string, unknown>) {
  const companyId = String(payload.companyId || "").trim();
  const ref = String(payload.ref || payload.localId || "").trim();
  if (!companyId || !ref) return null;
  if (
    typeof window !== "undefined" &&
    typeof (window as unknown as { __plReadAttachmentBlob?: unknown }).__plReadAttachmentBlob === "function"
  ) {
    return await (window as unknown as {
      __plReadAttachmentBlob: (companyId: string, localId: string) => Promise<unknown>;
    }).__plReadAttachmentBlob(companyId, ref);
  }
  return null;
}

export async function devHostBridgeWriteAttachment(payload: Record<string, unknown>) {
  const companyId = String(payload.companyId || "").trim();
  const body = payload.body && typeof payload.body === "object" ? (payload.body as Record<string, unknown>) : {};
  if (!companyId || !body.id || !body.base64) return { ok: false, error: "missing_fields" };
  if (
    typeof window !== "undefined" &&
    typeof (window as unknown as { __plPutPendingAttachmentFromRemote?: unknown })
      .__plPutPendingAttachmentFromRemote === "function"
  ) {
    return await (window as unknown as {
      __plPutPendingAttachmentFromRemote: (
        companyId: string,
        body: Record<string, unknown>
      ) => Promise<unknown>;
    }).__plPutPendingAttachmentFromRemote(companyId, body);
  }
  return { ok: false, error: "bridge_missing" };
}

export async function devHostBridgeDeltaPush(payload: Record<string, unknown>) {
  const companyId = String(payload.companyId || "").trim();
  const collection = String(payload.collection || "").trim();
  const docs = Array.isArray(payload.docs) ? payload.docs : [];
  if (!companyId || !collection || docs.length === 0) return { ok: false, error: "missing_fields" };
  if (
    typeof window !== "undefined" &&
    typeof (window as unknown as { __plUpsertCompanyDeltaDocs?: unknown })
      .__plUpsertCompanyDeltaDocs === "function"
  ) {
    return await (window as unknown as {
      __plUpsertCompanyDeltaDocs: (
        companyId: string,
        collection: string,
        docs: unknown[]
      ) => Promise<unknown>;
    }).__plUpsertCompanyDeltaDocs(companyId, collection, docs);
  }
  return { ok: false, error: "bridge_missing" };
}

export async function devHostBridgeAuthoritativeUpsert(payload: Record<string, unknown>) {
  if (
    typeof window !== "undefined" &&
    typeof (window as unknown as { __plHostBridgeCompanyDocUpsert?: unknown })
      .__plHostBridgeCompanyDocUpsert === "function"
  ) {
    return await (window as unknown as {
      __plHostBridgeCompanyDocUpsert: (payload: Record<string, unknown>) => Promise<unknown>;
    }).__plHostBridgeCompanyDocUpsert(payload);
  }
  return { ok: false, error: "bridge_missing" };
}

export async function devHostBridgeListShareableCompanies() {
  if (
    typeof window !== "undefined" &&
    typeof (window as unknown as { __plListShareableLocalCompanies?: unknown })
      .__plListShareableLocalCompanies === "function"
  ) {
    const rows = await (window as unknown as {
      __plListShareableLocalCompanies: () => Promise<unknown>;
    }).__plListShareableLocalCompanies();
    if (Array.isArray(rows)) return rows;
  }
  const { toPlServerSharedCompanySummaryAsync } = await import("@/lib/localServerShareableCompanies");
  const rows = await listLocalCompanies();
  const shareable = rows
    .filter((row) => !localCompanyRowIsDeleted(row))
    .map(normalizeLocalCompanyRowForHost)
    .filter(isLocalServerShareableCompany);
  const out = [];
  for (const row of shareable) {
    out.push(await toPlServerSharedCompanySummaryAsync(row));
  }
  return out;
}

async function warmBrowserDbForExport() {
  const { flushPendingBrowserDbSave, getBrowserDb } = await import("@/lib/localSqlite");
  // Flush in-memory SQLite to IndexedDB, but keep cachedDb — clearBrowserDbCache() here
  // reloaded stale IDB and made client pulls lag minutes behind host saves.
  await flushPendingBrowserDbSave();
  await getBrowserDb();
}

async function resolveDeltaExportCompanyId(requestedCompanyId: string): Promise<string> {
  const requested = String(requestedCompanyId || "").trim();
  if (!requested) return "";
  const direct = await getLocalCompanyById(requested, { includeDeleted: true });
  if (direct) return requested;

  const rows = await listLocalCompanies({ includeDeleted: true });
  const slug = requested.includes("_") ? requested.slice(0, requested.lastIndexOf("_")) : requested;
  const hit = rows.find((row) => {
    const id = String((row as { id?: unknown }).id || "").trim();
    const hostId = String((row as { plServerHostCompanyId?: unknown }).plServerHostCompanyId || "").trim();
    const name = String((row as { name?: unknown }).name || "").trim();
    return (
      id === requested ||
      hostId === requested ||
      (slug && (id === slug || id.startsWith(`${slug}_`) || name === slug || name === requested))
    );
  });
  return String((hit as { id?: unknown } | undefined)?.id || requested).trim();
}

export async function devHostBridgeExportDeltaCollection(payload: Record<string, unknown>) {
  const companyId = String(payload.companyId || "").trim();
  const collection = String(payload.collection || "").trim();
  if (!companyId || !collection) return null;
  if (!(COLLECTIONS_TO_BACKUP as readonly string[]).includes(collection)) return null;
  await warmBrowserDbForExport();
  const resolvedCompanyId = await resolveDeltaExportCompanyId(companyId);
  const company = await getLocalCompanyById(resolvedCompanyId);
  if (!company) return null;
  const rows = await listCompanyDocsFromBrowserDb(resolvedCompanyId, collection, { forBackupMerge: true });
  if (collection === "vouchers") {
    const aliveCount = rows.filter(
      (row) =>
        (row as { isDeleted?: unknown; deleted?: unknown; movedToAdminRecycleAt?: unknown }).isDeleted !== true &&
        (row as { isDeleted?: unknown; deleted?: unknown; movedToAdminRecycleAt?: unknown }).deleted !== true &&
        (row as { isDeleted?: unknown; deleted?: unknown; movedToAdminRecycleAt?: unknown }).movedToAdminRecycleAt == null
    ).length;
    plServerVoucherFlowLog("host_export_result", {
      companyId: resolvedCompanyId,
      requestedCompanyId: companyId,
      count: rows.length,
      aliveCount,
      source: "dev_host_bridge",
      firstIds: rows.slice(0, 3).map((row) => String((row as { id?: unknown }).id || "")),
      lastIds: rows.slice(-3).map((row) => String((row as { id?: unknown }).id || "")),
    });
  }
  return rows as Array<Record<string, unknown>>;
}

export async function devHostBridgeExportDeltaBundle(payload: Record<string, unknown>) {
  const companyId = String(payload.companyId || "").trim();
  if (!companyId) return null;
  await warmBrowserDbForExport();
  const resolvedCompanyId = await resolveDeltaExportCompanyId(companyId);
  const company = await getLocalCompanyById(resolvedCompanyId);
  if (!company) return null;
  const { withHostPlanFieldsOnCompanyExport } = await import("@/lib/plServerHostPlanSync");
  const companyWithPlan = await withHostPlanFieldsOnCompanyExport(
    company as unknown as Record<string, unknown>
  );
  const collections: Record<string, unknown[]> = {};
  for (const col of COLLECTIONS_TO_BACKUP) {
    const rows = await listCompanyDocsFromBrowserDb(resolvedCompanyId, col, { forBackupMerge: true });
    collections[col] = rows as unknown[];
  }
  return { company: companyWithPlan, collections };
}

export async function devHostBridgeDeltaHealth(payload: Record<string, unknown>) {
  const companyId = String(payload.companyId || "").trim();
  if (!companyId) return { ok: false, error: "missing_company_id" };
  const docs = await devHostBridgeExportDeltaCollection({ companyId, collection: "vouchers" });
  if (!Array.isArray(docs)) {
    return { ok: false, error: "export_unavailable", companyId };
  }
  return {
    ok: true,
    companyId,
    renderer: "dev_host_bridge",
    voucherCount: docs.length,
    cacheReload: true,
  };
}

export async function runDevHostBridgeJob(
  type: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  switch (type) {
    case "validate_login":
      return devHostBridgeValidateLogin(payload);
    case "read_attachment":
      return devHostBridgeReadAttachment(payload);
    case "write_attachment":
      return devHostBridgeWriteAttachment(payload);
    case "delta_push":
      return devHostBridgeDeltaPush(payload);
    case "authoritative_upsert":
      return devHostBridgeAuthoritativeUpsert(payload);
    case "list_shareable_companies":
      return devHostBridgeListShareableCompanies();
    case "export_delta_collection":
      return devHostBridgeExportDeltaCollection(payload);
    case "export_delta_bundle":
      return devHostBridgeExportDeltaBundle(payload);
    case "delta_health":
      return devHostBridgeDeltaHealth(payload);
    default:
      throw new Error(`unknown_dev_host_bridge_job:${type}`);
  }
}
