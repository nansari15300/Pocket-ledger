"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Company as CompanyData } from "@/hooks/useCompany";
import { isServerGateCompany } from "@/lib/companyStorageKind";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import {
  readOfflineUnlockPreferenceDays,
} from "@/lib/offlineCompanyUnlockRemember";
import { readCloudCompanyPasswordUnlockPreferenceDays } from "@/lib/cloudCompanyPasswordUnlockRemember";
import { readRememberedSharedUnlockUsername } from "@/lib/onlineSharedUnlockRememberUsername";
import { activateGate } from "@/lib/gates/gateRuntime";
import { getPlServerContextGateId } from "@/lib/plServerAccessContext";
import { writeActiveGateId } from "@/lib/gates/gateStore";
import type { GateRecord } from "@/lib/gates/gateTypes";
import {
  companyUsesRemotePlServerLogin,
  prefetchCompanyUnlockUsernameHint,
  resolveServerGateForCompany,
} from "@/lib/companySelectorGateLabel";
import { isLocalOnlyMode } from "@/lib/localMode";
import { grantOpenLocalCompanySession, isOnlineSharedCompany, showCompanyUserNameField } from "@/lib/companyUnlockGate";
import { plGateTrace } from "@/lib/plGateTrace";

export function rememberUnlockDaysForCompany(
  company: CompanyData,
  firebaseUid: string | undefined,
  userEmail: string | null | undefined
): number {
  return isOfflineCompanyStorage(company)
    ? readOfflineUnlockPreferenceDays(firebaseUid, company.id, userEmail)
    : readCloudCompanyPasswordUnlockPreferenceDays(firebaseUid, company.id, userEmail);
}

export function activateGateForServerCompanyIfNeeded(company: CompanyData): void {
  if (!isServerGateCompany(company)) return;
  const gate = resolveServerGateForCompany(
    company as CompanyData & { plServerGateId?: string; plServerGateServerUrl?: string }
  );
  if (gate) {
    writeActiveGateId(gate.id);
    activateGate(gate.id);
    return;
  }
  const gateId = getPlServerContextGateId();
  if (gateId) activateGate(gateId);
}

export function canRememberCompanyUsername(company: CompanyData, userEmail?: string | null): boolean {
  if (!showCompanyUserNameField(company, userEmail)) return false;
  return isOnlineSharedCompany(company as CompanyData & { isOwned?: boolean }) || isLocalOnlyMode();
}

/** Credential dialog: sync hint + async server meta when needed. */
export function primeCompanyUnlockDialogFields(
  company: CompanyData,
  appUser: { uid?: string | null; email?: string | null },
  setUsernameInput: Dispatch<SetStateAction<string>>,
  setRememberSharedUsername: (value: boolean) => void,
  options?: { gate?: GateRecord | null }
): void {
  const remembered = canRememberCompanyUsername(company, appUser.email)
    ? readRememberedSharedUnlockUsername(appUser.uid, company.id, appUser.email)
    : null;
  const rowHint = String((company as { usernameHint?: string | null }).usernameHint || "").trim();
  setUsernameInput(remembered ?? rowHint);
  setRememberSharedUsername(!!remembered);
  if (companyUsesRemotePlServerLogin(company) || isServerGateCompany(company)) {
    void prefetchCompanyUnlockUsernameHint(company, appUser, {
      gate: options?.gate,
      allowRememberedUsername: true,
    }).then((hint) => {
      if (hint) setUsernameInput((prev) => prev.trim() || hint);
    });
  }
}

export async function unlockServerGateCompanyWithCredentials(
  company: CompanyData,
  username: string,
  password: string,
  rememberDays: number,
  appUser: { uid?: string | null; email?: string | null },
  options?: { preferredGate?: GateRecord | null; onLedgerPullStart?: () => void }
): Promise<{ ok: boolean; error?: string }> {
  const gate = resolvePreferredGateForUnlock(company, options?.preferredGate);
  plGateTrace("gate_unlock_credentials_start", {
    companyId: company.id,
    gateId: gate?.id ?? null,
    gateUrl: gate?.serverUrl ?? null,
  });
  const { unlockPlServerStaffCompanyWithLedgerPull } = await import("@/lib/plServerStaffCompanyConnect");
  const { isPlHubServerClientMode } = await import("@/lib/plRemoteServerClient");
  const out = await unlockPlServerStaffCompanyWithLedgerPull(company.id, username, password, {
    plServerGate: gate,
    appUser,
    rememberUnlockDays: rememberDays,
    timeoutMs: isPlHubServerClientMode() ? 45_000 : 120_000,
    onLedgerPullStart: options?.onLedgerPullStart,
  });
  plGateTrace(out.ok ? "gate_unlock_credentials_done" : "gate_unlock_credentials_failed", {
    companyId: company.id,
    error: out.error ?? null,
  });
  return out;
}

/** Gate / selector: unlock ke baad gate activate + registry refresh + open session + UI bump. */
export async function refreshPlServerStaffCompanyUiAfterOpen(companyId: string): Promise<void> {
  if (typeof window === "undefined") return;
  const id = String(companyId || "").trim();
  if (!id) return;
  try {
    const { clearPlServerLivePullPause } = await import("@/lib/plServerClientDeltaSync");
    clearPlServerLivePullPause(id);
  } catch {
    /* optional */
  }
  try {
    const { notifyBrowserDbCollectionUpdated } = await import("@/lib/localCompanyDocMirror");
    for (const col of [
      "companies",
      "vouchers",
      "parties",
      "bank_accounts",
      "expense_accounts",
      "taxes",
    ] as const) {
      notifyBrowserDbCollectionUpdated(id, col, { immediate: true, source: "pl_server_company_open" });
    }
  } catch {
    /* optional */
  }
  try {
    const { BUMP_LOCAL_COMPANY_REGISTRY_EVENT } = await import("@/lib/applyStripePlanToLocalCompany");
    window.dispatchEvent(new Event(BUMP_LOCAL_COMPANY_REGISTRY_EVENT));
  } catch {
    /* optional */
  }
  try {
    window.dispatchEvent(new CustomEvent("pl-company-switched", { detail: { companyId: id } }));
  } catch {
    /* optional */
  }
}

/** Gate / selector: unlock ke baad gate activate + registry refresh + open session. */
export async function finalizePlServerGateCompanyOpen(
  companyId: string,
  company: CompanyData,
  options?: {
    preferredGate?: GateRecord | null;
    reloadLocalCompanyRegistry?: () => void | Promise<void>;
  }
): Promise<void> {
  const id = String(companyId || "").trim();
  if (!id) return;
  if (options?.preferredGate?.type === "local_server") {
    const { isAppUiOrigin } = await import("@/lib/plGatePageOrigin");
    if (typeof window !== "undefined" && isAppUiOrigin()) {
      const { activateLocalServerGateOnWebClient } = await import("@/lib/gates/gateRuntime");
      await activateLocalServerGateOnWebClient(options.preferredGate).catch(() => undefined);
    } else {
      writeActiveGateId(options.preferredGate.id);
      activateGate(options.preferredGate.id);
    }
  } else {
    activateGateForServerCompanyIfNeeded(company);
  }
  try {
    await options?.reloadLocalCompanyRegistry?.();
  } catch {
    /* optional */
  }
  grantOpenLocalCompanySession(id, { role: "manager" });
  await refreshPlServerStaffCompanyUiAfterOpen(id);
  plGateTrace("gate_company_open_finalized", { companyId: id });
}

/** Gate page preview row — server gate metadata stamp karo taaki unlock resolve sahi gate use kare. */
export function stampCompanyRowForServerGateUnlock(
  company: CompanyData,
  gate: GateRecord
): CompanyData {
  return {
    ...company,
    storageOption: company.storageOption ?? "local",
    plServerShared: true,
    plServerGateId: gate.id,
    plServerGateServerUrl: gate.serverUrl,
    isOwned: company.isOwned ?? false,
  } as CompanyData;
}

export function resolvePreferredGateForUnlock(
  company: CompanyData,
  preferredGate?: GateRecord | null
): GateRecord | null {
  if (preferredGate?.type === "local_server") return preferredGate;
  return resolveServerGateForCompany(
    company as CompanyData & { plServerGateId?: string; plServerGateServerUrl?: string }
  );
}
