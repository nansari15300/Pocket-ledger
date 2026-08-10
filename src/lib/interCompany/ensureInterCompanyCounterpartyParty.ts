/**
 * IC clearing party:
 * - Company→Company: `IC Company "{peer}"` — `ic_peer_*`
 * - Account→Account: `IC Account "{account}"` — `ic_acct_*` (peer company + peer entity)
 */

import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { interCompanyAcNoForNewEntity } from "@/lib/interCompany/interCompanyAccountNo";
import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";
import {
  formatInterCompanyAccountClearingPartyName,
  formatInterCompanyCounterpartyPartyName,
  isInterCompanyCompanyClearingPartyName,
  isInterCompanyCounterpartyPartyName,
  readInterCompanyClearingMode,
  type InterCompanyClearingMode,
} from "@/lib/interCompany/interCompanyCounterpartyPartyName";
import { restoreCompanySubdocFromRecycleBin } from "@/lib/recycleBinEntityLifecycle";
import {
  getCompanyDocFromBrowserDb,
  listCompanyDocsFromBrowserDb,
} from "@/lib/localCompanyDocMirror";
import { writeEntity } from "@/lib/writeGateway";
import { interCompanyUsesLocalLedgerTransport } from "@/lib/interCompany/localInterCompanyPolicy";

export function interCompanyCounterpartyDocId(peerCompanyId: string): string {
  const safe = String(peerCompanyId || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 48);
  return `ic_peer_${safe}`;
}

export function interCompanyAccountClearingDocId(args: {
  peerCompanyId: string;
  peerEntityKind: string;
  peerEntityId: string;
}): string {
  const peer = String(args.peerCompanyId || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 28);
  const kind = String(args.peerEntityKind || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .slice(0, 12);
  const ent = String(args.peerEntityId || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 40);
  return `ic_acct_${peer}_${kind}_${ent}`.slice(0, 96);
}

function isActiveCounterpartyRow(row: Record<string, unknown> | null | undefined): boolean {
  if (!row || row.isDeleted === true) return false;
  const id = String(row.id || "").trim();
  if (row.isInterCompanyCounterparty === true) return true;
  if (id.startsWith("ic_peer_") || id.startsWith("ic_acct_")) return true;
  return isInterCompanyCounterpartyPartyName(row.name);
}

async function listPartyRows(companyId: string): Promise<Record<string, unknown>[]> {
  try {
    const local = await listCompanyDocsFromBrowserDb(companyId, "parties", {
      includeSoftDeleted: true,
    });
    if (local.length > 0) return local;
  } catch {
    /* fall through */
  }
  try {
    const snap = await getDocs(collection(firestore, `companies/${companyId}/parties`));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
  } catch {
    return [];
  }
}

/**
 * Prefer canonical id; warna pehla matching legacy row (same mode only).
 */
export function pickInterCompanyCounterpartyPartyId(args: {
  peerCompanyId: string;
  displayName: string;
  parties: Array<Record<string, unknown>>;
  clearingMode?: InterCompanyClearingMode;
  peerEntityKind?: string;
  peerEntityId?: string;
}): string | null {
  const peerCompanyId = String(args.peerCompanyId || "").trim();
  const displayName = String(args.displayName || "").trim();
  const clearingMode = args.clearingMode || "company";
  const peerEntityKind = String(args.peerEntityKind || "").trim().toLowerCase();
  const peerEntityId = String(args.peerEntityId || "").trim();
  const canonicalId =
    clearingMode === "account"
      ? interCompanyAccountClearingDocId({
          peerCompanyId,
          peerEntityKind,
          peerEntityId,
        })
      : interCompanyCounterpartyDocId(peerCompanyId);

  const active = args.parties.filter((r) => {
    if (!isActiveCounterpartyRow(r)) return false;
    return readInterCompanyClearingMode(r) === clearingMode;
  });
  if (active.some((r) => String(r.id || "").trim() === canonicalId)) {
    return canonicalId;
  }

  const byPeer = active.filter(
    (r) => String(r.interCompanyPeerCompanyId || "").trim() === peerCompanyId
  );

  if (clearingMode === "account") {
    const byEntity = byPeer.filter(
      (r) =>
        String(r.interCompanyPeerEntityKind || "")
          .trim()
          .toLowerCase() === peerEntityKind &&
        String(r.interCompanyPeerEntityId || "").trim() === peerEntityId
    );
    if (byEntity.length > 0) {
      const preferred =
        byEntity.find((r) => String(r.id || "").startsWith("ic_acct_")) || byEntity[0];
      const id = String(preferred?.id || "").trim();
      return id || null;
    }
    if (displayName) {
      const byName = byPeer.filter((r) => String(r.name || "").trim() === displayName);
      if (byName.length > 0) {
        const preferred =
          byName.find((r) => String(r.id || "").startsWith("ic_acct_")) || byName[0];
        const id = String(preferred?.id || "").trim();
        return id || null;
      }
    }
    return null;
  }

  if (byPeer.length > 0) {
    const preferred =
      byPeer.find((r) => String(r.id || "").startsWith("ic_peer_")) || byPeer[0];
    const id = String(preferred?.id || "").trim();
    return id || null;
  }

  if (displayName) {
    const byName = active.filter(
      (r) =>
        String(r.name || "").trim() === displayName &&
        isInterCompanyCompanyClearingPartyName(r.name)
    );
    if (byName.length > 0) {
      const preferred =
        byName.find((r) => String(r.id || "").startsWith("ic_peer_")) || byName[0];
      const id = String(preferred?.id || "").trim();
      return id || null;
    }
  }

  return null;
}

async function syncCounterpartyPartyMeta(
  companyId: string,
  docId: string,
  patch: Record<string, unknown>,
  existingData: Record<string, unknown>
): Promise<void> {
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (existingData[k] !== v) next[k] = v;
  }
  if (Object.keys(next).length === 0) return;

  if (await interCompanyUsesLocalLedgerTransport(companyId)) {
    const res = await writeEntity({
      companyId,
      collectionName: "parties",
      docId,
      operation: "update",
      data: next,
    });
    if (res.ok === false) {
      console.warn("[IC] counterparty meta sync failed:", res.error);
    }
    return;
  }

  try {
    await updateDoc(doc(firestore, `companies/${companyId}/parties`, docId), next);
  } catch (err) {
    console.warn("[IC] counterparty meta sync failed:", err);
  }
}

export type EnsureInterCompanyCounterpartyArgs = {
  companyId: string;
  peerCompanyId: string;
  peerCompanyName: string;
  side: "source" | "target";
  ownerId: string;
  /** Default company — Company→Company clearing. */
  clearingMode?: InterCompanyClearingMode;
  /** Account→Account — peer company ka selected entity. */
  peerEntityKind?: InterCompanyEntityKind | string;
  peerEntityId?: string;
  peerEntityLabel?: string;
};

/** Source / target clearing — mode ke hisaab se IC Company ya IC Account. */
export async function ensureInterCompanyCounterpartyParty(
  args: EnsureInterCompanyCounterpartyArgs
): Promise<string> {
  const companyId = String(args.companyId || "").trim();
  const peerCompanyId = String(args.peerCompanyId || "").trim();
  const peerCompanyName = String(args.peerCompanyName || "Company").trim() || "Company";
  let clearingMode: InterCompanyClearingMode = args.clearingMode === "account" ? "account" : "company";
  const peerEntityKind = String(args.peerEntityKind || "").trim().toLowerCase();
  const peerEntityId = String(args.peerEntityId || "").trim();
  const peerEntityLabel = String(args.peerEntityLabel || "").trim();

  // Account mode bina entity ke — company clearing pe fallback (save block na ho)
  if (clearingMode === "account" && (!peerEntityKind || !peerEntityId)) {
    clearingMode = "company";
  }

  const displayName =
    clearingMode === "account"
      ? formatInterCompanyAccountClearingPartyName(peerEntityLabel || peerEntityId)
      : formatInterCompanyCounterpartyPartyName(peerCompanyName);

  const canonicalId =
    clearingMode === "account"
      ? interCompanyAccountClearingDocId({
          peerCompanyId,
          peerEntityKind,
          peerEntityId,
        })
      : interCompanyCounterpartyDocId(peerCompanyId);

  const metaPatch: Record<string, unknown> = {
    name: displayName,
    isInterCompanyCounterparty: true,
    interCompanyClearingMode: clearingMode,
    interCompanyPeerCompanyId: peerCompanyId,
    interCompanyPeerCompanyName: peerCompanyName,
  };
  if (clearingMode === "account") {
    metaPatch.interCompanyPeerEntityKind = peerEntityKind;
    metaPatch.interCompanyPeerEntityId = peerEntityId;
    metaPatch.interCompanyPeerEntityLabel = peerEntityLabel || peerEntityId;
  }

  const partyRef = doc(firestore, `companies/${companyId}/parties`, canonicalId);
  const localCanonical = await getCompanyDocFromBrowserDb(companyId, "parties", canonicalId);
  let firestoreCanonical: Record<string, unknown> | null = null;
  try {
    const snap = await getDoc(partyRef);
    if (snap.exists()) firestoreCanonical = snap.data() as Record<string, unknown>;
  } catch {
    /* local-only / offline */
  }

  const canonicalData = (localCanonical || firestoreCanonical) as Record<string, unknown> | null;
  if (canonicalData) {
    if (canonicalData.isDeleted === true) {
      await restoreCompanySubdocFromRecycleBin(companyId, "parties", canonicalId);
    }
    await syncCounterpartyPartyMeta(companyId, canonicalId, metaPatch, canonicalData);
    return canonicalId;
  }

  const parties = await listPartyRows(companyId);
  const reusedId = pickInterCompanyCounterpartyPartyId({
    peerCompanyId,
    displayName,
    parties,
    clearingMode,
    peerEntityKind,
    peerEntityId,
  });
  if (reusedId) {
    const row =
      parties.find((r) => String(r.id || "").trim() === reusedId) ||
      (await getCompanyDocFromBrowserDb(companyId, "parties", reusedId)) ||
      {};
    if ((row as Record<string, unknown>).isDeleted === true) {
      await restoreCompanySubdocFromRecycleBin(companyId, "parties", reusedId);
    }
    await syncCounterpartyPartyMeta(
      companyId,
      reusedId,
      metaPatch,
      row as Record<string, unknown>
    );
    return reusedId;
  }

  const groupId = args.side === "source" ? "sundry_debtors" : "sundry_creditors";
  const interCompanyAccountNo = await interCompanyAcNoForNewEntity("party");
  const body = {
    name: displayName,
    companyId,
    ownerId: args.ownerId || "",
    groupId,
    openingBalance: 0,
    balance: 0,
    debit: 0,
    credit: 0,
    isDeleted: false,
    isInterCompanyCounterparty: true,
    interCompanyClearingMode: clearingMode,
    interCompanyPeerCompanyId: peerCompanyId,
    interCompanyPeerCompanyName: peerCompanyName,
    interCompanyCounterpartySide: args.side,
    interCompanyAccountNo,
    ...(clearingMode === "account"
      ? {
          interCompanyPeerEntityKind: peerEntityKind,
          interCompanyPeerEntityId: peerEntityId,
          interCompanyPeerEntityLabel: peerEntityLabel || peerEntityId,
        }
      : {}),
  };

  if (await interCompanyUsesLocalLedgerTransport(companyId)) {
    const res = await writeEntity({
      companyId,
      collectionName: "parties",
      docId: canonicalId,
      operation: "create",
      data: body,
    });
    if (res.ok === false) throw new Error(res.error || "Failed to create IC counterparty party");
    return canonicalId;
  }

  await setDoc(partyRef, { ...body, createdAt: new Date() });
  return canonicalId;
}
