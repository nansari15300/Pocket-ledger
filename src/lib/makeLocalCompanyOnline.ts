"use client";

/**
 * Local company → Firebase online: create root doc, promote registry, upload ledger data, then attachments.
 * Web / EXE / APK — same path.
 */

import { doc, setDoc, serverTimestamp, deleteField } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import {
  getLocalCompanyById,
  promoteLocalCompanyRowToOnline,
  type LocalCompanyDoc,
} from "@/lib/localCompanyStore";
import { canUploadOneMoreOnline } from "@/lib/companyOnlineSlots";
import { forceUploadLocalCompanyToServer } from "@/lib/forceUploadLocalCompanyToServer";
import {
  isFirebaseLedgerDataSyncDisabled,
  setFirebaseLedgerDataSyncEnabled,
} from "@/lib/firebaseLedgerDataSyncDisabled";
import { bumpLocalCompanyRegistry } from "@/lib/applyStripePlanToLocalCompany";
import { removeLocalCompanyDeltaFromFolder } from "@/lib/liveDataFolderMirror";
import { flushBrowserDbToIndexedDB } from "@/lib/localSqlite";
import { isServerGateCompany } from "@/lib/companyStorageKind";
import type { Plan, PlanId } from "@/config/plans";

export type MakeLocalCompanyOnlineProgress = {
  phase: "root" | "data" | "attachments" | "finalize";
  label: string;
  done?: number;
  total?: number;
  detail?: string;
};

export type MakeLocalCompanyOnlineResult = {
  ok: boolean;
  message?: string;
  docsPushed: number;
  filesSynced: number;
  filesFailed: number;
  ledgerSyncWasEnabled: boolean;
  errors: string[];
};

export type MakeLocalCompanyOnlineInput = {
  companyId: string;
  ownerUid: string;
  ownerEmail?: string | null;
  allCompanies: ReadonlyArray<{
    id: string;
    storageOption?: string;
    isDeleted?: boolean;
    isOwned?: boolean;
    ownerId?: string;
  }>;
  planId?: PlanId | string | null;
  livePlan?: Plan | null;
  onProgress?: (p: MakeLocalCompanyOnlineProgress) => void;
};

function isOwnerOfCompany(
  company: LocalCompanyDoc,
  ownerUid: string,
  ownerEmail?: string | null
): boolean {
  if (String(company.ownerId || "").trim() === ownerUid) return true;
  const a = String(company.ownerEmail || "")
    .trim()
    .toLowerCase();
  const b = String(ownerEmail || "")
    .trim()
    .toLowerCase();
  return Boolean(a && b && a === b);
}

function isEligibleLocalCompany(company: LocalCompanyDoc): { ok: true } | { ok: false; message: string } {
  if ((company as { plServerShared?: boolean }).plServerShared === true) {
    return { ok: false, message: "PL Server shared companies stay on the server — they cannot become Firebase online." };
  }
  if (isServerGateCompany(company as Parameters<typeof isServerGateCompany>[0])) {
    return { ok: false, message: "Server-gate companies cannot be converted to Firebase online from here." };
  }
  const so = String(company.storageOption || "local").toLowerCase().trim();
  if (so === "firebase" || so === "drive") {
    return { ok: false, message: "This company is already linked to the cloud." };
  }
  if (String(company.syncPolicy || "").toLowerCase() === "online" && so !== "local") {
    return { ok: false, message: "This company is already online." };
  }
  return { ok: true };
}

/**
 * Strong local → online: Firestore root → registry promote → ledger docs → attachments → URL patch.
 */
export async function makeLocalCompanyOnline(
  input: MakeLocalCompanyOnlineInput
): Promise<MakeLocalCompanyOnlineResult> {
  const empty: MakeLocalCompanyOnlineResult = {
    ok: false,
    docsPushed: 0,
    filesSynced: 0,
    filesFailed: 0,
    ledgerSyncWasEnabled: !isFirebaseLedgerDataSyncDisabled(),
    errors: [],
  };
  const companyId = String(input.companyId || "").trim();
  const ownerUid = String(input.ownerUid || "").trim();
  if (!companyId || !ownerUid) {
    return { ...empty, message: "Sign in and select a local company first." };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ...empty, message: "You are offline. Connect to the internet and try again." };
  }

  const local = await getLocalCompanyById(companyId, { includeDeleted: true });
  if (!local || local.isDeleted === true) {
    return { ...empty, message: "Local company not found on this device." };
  }
  if (!isOwnerOfCompany(local, ownerUid, input.ownerEmail)) {
    return { ...empty, message: "Only the company owner can make it online." };
  }
  const eligible = isEligibleLocalCompany(local);
  if (eligible.ok === false) {
    return { ...empty, message: eligible.message };
  }

  const slots = canUploadOneMoreOnline(
    input.allCompanies,
    input.planId,
    companyId,
    ownerUid,
    input.livePlan
  );
  if (slots.max === 0) {
    return {
      ...empty,
      message: "Your plan does not include online (Firebase) companies. Upgrade your plan first.",
    };
  }
  if (!slots.ok) {
    return {
      ...empty,
      message: `Online slots full (${slots.current}/${slots.max}). Upgrade or demote another company first.`,
    };
  }

  const report = (p: MakeLocalCompanyOnlineProgress) => {
    try {
      input.onProgress?.(p);
    } catch {
      /* ignore */
    }
  };
  const errors: string[] = [];
  let docsPushed = 0;
  let filesSynced = 0;
  let filesFailed = 0;
  const ledgerSyncWasEnabled = !isFirebaseLedgerDataSyncDisabled();

  try {
    report({ phase: "root", label: "Creating Firebase company…" });

    await setDoc(
      doc(firestore, "companies", companyId),
      {
        id: companyId,
        name: String(local.name || "").trim() || "Company",
        address: (local as { address?: string }).address ?? "",
        phone: (local as { phone?: string }).phone ?? "",
        email: (local as { email?: string }).email ?? "",
        pan: (local as { pan?: string }).pan ?? "",
        country: (local as { country?: string }).country ?? "",
        logoUrl: (local as { logoUrl?: string | null }).logoUrl ?? null,
        ownerId: ownerUid,
        ownerEmail: input.ownerEmail ?? (local as { ownerEmail?: string }).ownerEmail ?? "",
        storageOption: "firebase",
        syncPolicy: "online",
        syncedFromCloud: false,
        authoritativeCompanyId: companyId,
        demotedFromOnlineAt: deleteField(),
        demoteReason: deleteField(),
        planId: (local as { planId?: string }).planId ?? "basic",
        sharedWith: (local as { sharedWith?: string[] }).sharedWith ?? [],
        sharedWithEmails:
          (local as { sharedWithEmails?: string[] }).sharedWithEmails ??
          (input.ownerEmail ? [input.ownerEmail] : []),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const promoted = await promoteLocalCompanyRowToOnline(companyId, {
      ownerId: ownerUid,
      ownerEmail: input.ownerEmail ?? (local as { ownerEmail?: string | null }).ownerEmail ?? null,
      syncedFromCloud: false,
    });
    if (!promoted) {
      return { ...empty, message: "Could not update local company registry for online mode." };
    }
    try {
      bumpLocalCompanyRegistry();
    } catch {
      /* ignore */
    }

    // Attachments + ongoing online writes need ledger sync on.
    if (isFirebaseLedgerDataSyncDisabled()) {
      setFirebaseLedgerDataSyncEnabled(true);
    }

    report({ phase: "data", label: "Uploading company data…", done: 0, total: 1 });
    const dataResult = await forceUploadLocalCompanyToServer(companyId, {
      mode: "docsOnly",
      onProgress: (p) => {
        report({
          phase: "data",
          label: p.phase || "Uploading company data…",
          done: p.done,
          total: p.total,
          detail: p.detail,
        });
      },
    });
    docsPushed += dataResult.docsPushed;
    if (dataResult.errors.length) errors.push(...dataResult.errors.slice(0, 4));
    if (!dataResult.ok && dataResult.docsPushed === 0 && dataResult.errors.length > 0) {
      return {
        ...empty,
        docsPushed,
        ledgerSyncWasEnabled,
        errors,
        message: dataResult.message || dataResult.errors[0] || "Company data upload failed.",
      };
    }

    report({ phase: "attachments", label: "Uploading attachments…", done: 0, total: 1 });
    const filesResult = await forceUploadLocalCompanyToServer(companyId, {
      mode: "filesOnly",
      onProgress: (p) => {
        report({
          phase: "attachments",
          label: p.phase || "Uploading attachments…",
          done: p.done,
          total: p.total,
          detail: p.detail,
        });
      },
    });
    filesSynced += filesResult.filesSynced;
    filesFailed += filesResult.filesFailed;
    if (filesResult.errors.length) errors.push(...filesResult.errors.slice(0, 4));
    if (filesResult.message && !filesResult.ok && filesResult.filesSynced === 0 && filesResult.filesFailed > 0) {
      errors.push(filesResult.message);
    }

    // After Storage URLs land in SQLite, push docs again so Firestore gets https refs.
    report({ phase: "finalize", label: "Linking attachment URLs…" });
    const patchResult = await forceUploadLocalCompanyToServer(companyId, {
      mode: "docsOnly",
      onProgress: (p) => {
        report({
          phase: "finalize",
          label: p.phase || "Linking attachment URLs…",
          done: p.done,
          total: p.total,
          detail: p.detail,
        });
      },
    });
    docsPushed += patchResult.docsPushed;
    if (patchResult.errors.length) errors.push(...patchResult.errors.slice(0, 2));

    await promoteLocalCompanyRowToOnline(companyId, { syncedFromCloud: true });
    try {
      bumpLocalCompanyRegistry();
    } catch {
      /* ignore */
    }
    try {
      await flushBrowserDbToIndexedDB();
    } catch {
      /* ignore */
    }
    void removeLocalCompanyDeltaFromFolder(companyId).catch(() => undefined);

    const warn =
      filesFailed > 0
        ? ` ${filesFailed} attachment(s) failed — retry Force upload from Company Profile if needed.`
        : errors.length
          ? ` Some batches had issues: ${errors.slice(0, 2).join(" · ")}`
          : "";

    return {
      ok: true,
      docsPushed,
      filesSynced,
      filesFailed,
      ledgerSyncWasEnabled,
      errors,
      message:
        `Company is now online. Uploaded ${docsPushed} record(s)` +
        (filesSynced > 0 ? ` and ${filesSynced} file(s)` : "") +
        "." +
        (!ledgerSyncWasEnabled ? " Firebase company data sync was turned on for this device." : "") +
        warn,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ...empty,
      docsPushed,
      filesSynced,
      filesFailed,
      ledgerSyncWasEnabled,
      errors: [...errors, msg],
      message: msg,
    };
  }
}
