"use client";

import { buildPocketLedgerDriveRelativePath } from "@/lib/localCloudSync/pocketLedgerDrivePaths";
import { postDriveJsonViaClient } from "@/lib/localCloudSync/driveApiClient";
import {
  cloudSyncDataProviderId,
  readCloudSyncConfigFromCompany,
  shouldUseLocalCloudSync,
} from "@/lib/localCloudSync/companyConfig";
import { getLocalCompanyById, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import { ensureInterCompanyCounterpartyParty } from "@/lib/interCompany/ensureInterCompanyCounterpartyParty";
import { buildReconciliationLedgerSnapshot } from "@/lib/reconciliation/ledgerSnapshot";
import type {
  ReconciliationEntityType,
  ReconciliationShare,
  ReconciliationShareScope,
} from "@/lib/reconciliation/types";
import { reconciliationEntityCollection } from "@/lib/reconciliation/types";
import { isPureLocalInterCompanyCompanyFromShape } from "@/lib/interCompany/localInterCompanyPolicy";
import type { Company } from "@/hooks/useCompany";
import { getCompanyDocFromBrowserDb, listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { isLocalOnlyMode } from "@/lib/localMode";

export const DRIVE_RECON_SHARE_ID_PREFIX = "drive-recon-";
export const DRIVE_RECON_CHANGED_EVENT = "pl-drive-recon-changed";
const DRIVE_RECON_STORE_KEY = "pl-drive-recon-links-v1";
const RECON_LINKS_INDEX_PATH = "data/recon_links/index.json";

export function isDriveLocalReconciliationShareId(shareId: string | null | undefined): boolean {
  return String(shareId || "").trim().startsWith(DRIVE_RECON_SHARE_ID_PREFIX);
}

type DriveReconStore = Record<string, ReconciliationShare>;

function readDriveReconStore(): DriveReconStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(DRIVE_RECON_STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DriveReconStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeDriveReconStore(store: DriveReconStore): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DRIVE_RECON_STORE_KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent(DRIVE_RECON_CHANGED_EVENT));
  } catch {
    /* quota */
  }
}

export function saveDriveLocalReconciliationShare(share: ReconciliationShare): void {
  const id = String(share.id || "").trim();
  if (!id || !isDriveLocalReconciliationShareId(id)) return;
  const store = readDriveReconStore();
  store[id] = share;
  writeDriveReconStore(store);
}

export function getDriveLocalReconciliationShare(shareId: string): ReconciliationShare | null {
  const id = String(shareId || "").trim();
  if (!id) return null;
  return readDriveReconStore()[id] ?? null;
}

export function listAllDriveLocalReconciliationShares(): ReconciliationShare[] {
  return Object.values(readDriveReconStore()).sort((a, b) =>
    String(b.updatedAt || b.linkedAt || "").localeCompare(String(a.updatedAt || a.linkedAt || ""))
  );
}

export function listDriveLocalReconciliationSharesForViewer(
  userId: string,
  companyId?: string
): ReconciliationShare[] {
  const uid = String(userId || "").trim();
  const cid = String(companyId || "").trim();
  return listAllDriveLocalReconciliationShares().filter((s) => {
    if (cid && (s.senderCompanyId === cid || s.receiverCompanyId === cid)) return true;
    if (!uid) return false;
    return (
      s.senderUserId === uid ||
      s.receiverUserId === uid ||
      s.targetUserId === uid
    );
  });
}

/** Same device — doosri local company jisme Drive data sync ON ho. */
export async function listDriveReconciliationPeerCompanies(
  currentCompanyId: string,
  allCompanies: Company[]
): Promise<Company[]> {
  const cid = String(currentCompanyId || "").trim();
  if (!cid) return [];
  if (!(await isLocalCompanyDriveDataSyncEnabled(cid))) return [];

  const out: Company[] = [];
  for (const c of allCompanies) {
    const id = String(c.id || "").trim();
    if (!id || id === cid) continue;
    if (!isPureLocalInterCompanyCompanyFromShape(c)) continue;
    if (!(await isLocalCompanyDriveDataSyncEnabled(id))) continue;
    out.push(c);
  }
  return out.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

export async function isLocalCompanyDriveDataSyncEnabled(companyId: string): Promise<boolean> {
  if (!(await shouldUseLocalCloudSync(companyId))) return false;
  const reg = await getLocalCompanyById(companyId, { includeDeleted: true });
  if (!reg || reg.isDeleted === true) return false;
  return cloudSyncDataProviderId(reg) === "google_drive";
}

function cloudRefFromRegistry(reg: LocalCompanyDoc): {
  companyId: string;
  companyName?: string;
  driveSharedFolderId?: string;
} {
  return {
    companyId: String(reg.id || "").trim(),
    companyName: String(reg.name || "").trim() || undefined,
    driveSharedFolderId: String(reg.cloudSyncDriveFolderId ?? "").trim() || undefined,
  };
}

function reconLinkBranchPath(linkId: string): string {
  return `data/recon_links/${linkId}.json`;
}

async function downloadCompanyBranchJson(
  reg: LocalCompanyDoc,
  branchRelativePath: string
): Promise<string | null> {
  const ref = cloudRefFromRegistry(reg);
  try {
    const res = await postDriveJsonViaClient<{ base64?: string | null }>(
      "/api/local-cloud-sync/drive/download-file",
      {
        companyId: ref.companyId,
        companyName: ref.companyName,
        driveSharedFolderId: ref.driveSharedFolderId,
        branchRelativePath,
      }
    );
    if (!res.base64) return null;
    const binary = atob(res.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

async function uploadCompanyBranchJson(reg: LocalCompanyDoc, branchRelativePath: string, body: string): Promise<void> {
  const ref = cloudRefFromRegistry(reg);
  const remotePath = buildPocketLedgerDriveRelativePath(ref, "data", ...branchRelativePath.replace(/^data\//, "").split("/"));
  await postDriveJsonViaClient("/api/local-cloud-sync/drive/upload-json", {
    relativePath: remotePath,
    body,
    driveSharedFolderId: ref.driveSharedFolderId,
  });
}

async function readReconLinkIndex(reg: LocalCompanyDoc): Promise<string[]> {
  const raw = await downloadCompanyBranchJson(reg, RECON_LINKS_INDEX_PATH);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { linkIds?: unknown };
    if (!Array.isArray(parsed.linkIds)) return [];
    return parsed.linkIds.map((x) => String(x || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function writeReconLinkIndex(reg: LocalCompanyDoc, linkIds: string[]): Promise<void> {
  const unique = [...new Set(linkIds.map((x) => String(x || "").trim()).filter(Boolean))];
  await uploadCompanyBranchJson(
    reg,
    RECON_LINKS_INDEX_PATH,
    JSON.stringify({ v: 1, linkIds: unique, updatedAt: Date.now() })
  );
}

async function uploadDriveReconciliationShareToCompany(
  reg: LocalCompanyDoc,
  share: ReconciliationShare
): Promise<void> {
  const linkId = String(share.id || "").trim();
  if (!linkId) return;
  await uploadCompanyBranchJson(reg, reconLinkBranchPath(linkId), JSON.stringify(share));
  const existing = await readReconLinkIndex(reg);
  if (!existing.includes(linkId)) {
    await writeReconLinkIndex(reg, [...existing, linkId]);
  }
}

export async function pushDriveLocalReconciliationShareToCloud(share: ReconciliationShare): Promise<void> {
  const senderId = String(share.senderCompanyId || "").trim();
  const receiverId = String(share.receiverCompanyId || "").trim();
  const uploads: Promise<void>[] = [];

  if (senderId && (await isLocalCompanyDriveDataSyncEnabled(senderId))) {
    const reg = await getLocalCompanyById(senderId, { includeDeleted: true });
    if (reg && reg.isDeleted !== true) {
      uploads.push(uploadDriveReconciliationShareToCompany(reg, share));
    }
  }
  if (receiverId && receiverId !== senderId && (await isLocalCompanyDriveDataSyncEnabled(receiverId))) {
    const reg = await getLocalCompanyById(receiverId, { includeDeleted: true });
    if (reg && reg.isDeleted !== true) {
      uploads.push(uploadDriveReconciliationShareToCompany(reg, share));
    }
  }
  await Promise.all(uploads);
}

async function resolveReceiverAccountName(companyId: string, accountId: string): Promise<string> {
  const local = await getCompanyDocFromBrowserDb(companyId, "parties", accountId);
  const name = String((local as { name?: string } | null)?.name || "").trim();
  return name || accountId;
}

async function materializeReceiverSideIfNeeded(share: ReconciliationShare, ownerId: string): Promise<ReconciliationShare> {
  const receiverCompanyId = String(share.receiverCompanyId || "").trim();
  const receiverAccountId = String(share.receiverAccountId || "").trim();
  if (!receiverCompanyId || !receiverAccountId) return share;

  const existing = await getCompanyDocFromBrowserDb(receiverCompanyId, "parties", receiverAccountId);
  if (existing && (existing as { isDeleted?: boolean }).isDeleted !== true) {
    return share;
  }

  const peerCompanyId = String(share.senderCompanyId || "").trim();
  const peerCompanyName = String(share.senderCompanyName || "Company").trim();
  if (!peerCompanyId) return share;

  const partyId = await ensureInterCompanyCounterpartyParty({
    companyId: receiverCompanyId,
    peerCompanyId,
    peerCompanyName,
    side: "target",
    ownerId,
  });
  const accountName = await resolveReceiverAccountName(receiverCompanyId, partyId);
  return {
    ...share,
    receiverAccountId: partyId,
    receiverAccountName: accountName,
    receiverEntityType: "party",
    receiverCollection: reconciliationEntityCollection("party"),
  };
}

/** Local + Drive: do companies jod kar linked recon share — doosri side par sirf ek IC counterparty auto. */
export async function createDriveLocalReconciliationLink(params: {
  ownerUserId: string;
  ownerUserEmail?: string;
  senderCompanyId: string;
  senderCompanyName: string;
  senderAccountId: string;
  senderAccountName: string;
  peerCompanyId: string;
  peerCompanyName: string;
  shareScope: ReconciliationShareScope;
  dateFrom?: string | null;
  dateTo?: string | null;
}): Promise<string> {
  const senderCompanyId = String(params.senderCompanyId || "").trim();
  const peerCompanyId = String(params.peerCompanyId || "").trim();
  if (!senderCompanyId || !peerCompanyId || senderCompanyId === peerCompanyId) {
    throw new Error("Select a different company.");
  }
  if (!(await isLocalCompanyDriveDataSyncEnabled(senderCompanyId))) {
    throw new Error("Turn on Google Drive sync for this company first.");
  }
  if (!(await isLocalCompanyDriveDataSyncEnabled(peerCompanyId))) {
    throw new Error("The other company must also use Google Drive sync.");
  }

  const senderCollection = reconciliationEntityCollection("party");
  const senderSnapshot = await buildReconciliationLedgerSnapshot({
    companyId: senderCompanyId,
    accountId: params.senderAccountId,
    collection: senderCollection,
    shareScope: params.shareScope,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });

  const receiverPartyId = await ensureInterCompanyCounterpartyParty({
    companyId: peerCompanyId,
    peerCompanyId: senderCompanyId,
    peerCompanyName: params.senderCompanyName || "Company",
    side: "target",
    ownerId: params.ownerUserId,
  });
  const receiverAccountName = await resolveReceiverAccountName(peerCompanyId, receiverPartyId);

  const receiverSnapshot = await buildReconciliationLedgerSnapshot({
    companyId: peerCompanyId,
    accountId: receiverPartyId,
    collection: reconciliationEntityCollection("party"),
    shareScope: params.shareScope,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });

  const linkId = `${DRIVE_RECON_SHARE_ID_PREFIX}${
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  }`;
  const now = Date.now();

  const share: ReconciliationShare = {
    id: linkId,
    senderUserId: params.ownerUserId,
    senderUserEmail: params.ownerUserEmail,
    senderCompanyId,
    senderCompanyName: params.senderCompanyName,
    senderEntityType: "party",
    senderAccountId: params.senderAccountId,
    senderAccountName: params.senderAccountName,
    senderCollection,
    shareScope: params.shareScope,
    dateFrom: params.shareScope === "date_range" ? params.dateFrom ?? null : null,
    dateTo: params.shareScope === "date_range" ? params.dateTo ?? null : null,
    targetUserId: params.ownerUserId,
    targetUserEmail: params.ownerUserEmail,
    status: "linked",
    senderLedgerSnapshot: senderSnapshot.rows,
    senderOpeningBalance: senderSnapshot.openingBalance,
    receiverUserId: params.ownerUserId,
    receiverCompanyId: peerCompanyId,
    receiverCompanyName: params.peerCompanyName,
    receiverEntityType: "party",
    receiverAccountId: receiverPartyId,
    receiverAccountName,
    receiverCollection: reconciliationEntityCollection("party"),
    receiverLedgerSnapshot: receiverSnapshot.rows,
    receiverOpeningBalance: receiverSnapshot.openingBalance,
    linkedAt: now,
    updatedAt: now,
  };

  saveDriveLocalReconciliationShare(share);
  await pushDriveLocalReconciliationShareToCloud(share);
  return linkId;
}

export async function refreshDriveLocalReconciliationSideSnapshot(params: {
  shareId: string;
  side: "sender" | "receiver";
}): Promise<void> {
  const share = getDriveLocalReconciliationShare(params.shareId);
  if (!share || share.status !== "linked") throw new Error("Share not found");

  if (params.side === "sender") {
    const snapshot = await buildReconciliationLedgerSnapshot({
      companyId: share.senderCompanyId,
      accountId: share.senderAccountId,
      collection: share.senderCollection,
      shareScope: share.shareScope,
      dateFrom: share.dateFrom,
      dateTo: share.dateTo,
    });
    saveDriveLocalReconciliationShare({
      ...share,
      senderLedgerSnapshot: snapshot.rows,
      senderOpeningBalance: snapshot.openingBalance,
      updatedAt: Date.now(),
    });
  } else {
    if (!share.receiverCompanyId || !share.receiverAccountId) throw new Error("Receiver not linked");
    const snapshot = await buildReconciliationLedgerSnapshot({
      companyId: share.receiverCompanyId,
      accountId: share.receiverAccountId,
      collection: share.receiverCollection || reconciliationEntityCollection(share.receiverEntityType || "party"),
      shareScope: share.shareScope,
      dateFrom: share.dateFrom,
      dateTo: share.dateTo,
    });
    const next = {
      ...share,
      receiverLedgerSnapshot: snapshot.rows,
      receiverOpeningBalance: snapshot.openingBalance,
      updatedAt: Date.now(),
    };
    saveDriveLocalReconciliationShare(next);
    await pushDriveLocalReconciliationShareToCloud(next);
    return;
  }

  const updated = getDriveLocalReconciliationShare(params.shareId);
  if (updated) await pushDriveLocalReconciliationShareToCloud(updated);
}

export async function unlinkDriveLocalReconciliationShare(params: {
  shareId: string;
  userId: string;
  userEmail?: string;
}): Promise<void> {
  const share = getDriveLocalReconciliationShare(params.shareId);
  if (!share || share.status !== "linked") throw new Error("Share not found");
  const isParticipant =
    share.senderUserId === params.userId ||
    share.receiverUserId === params.userId ||
    share.targetUserId === params.userId;
  if (!isParticipant) throw new Error("Only a linked participant can unlink");

  const revoked: ReconciliationShare = {
    ...share,
    status: "revoked",
    unlinkedByUserId: params.userId,
    unlinkedByUserEmail: params.userEmail,
    unlinkedAt: Date.now(),
    updatedAt: Date.now(),
  };
  saveDriveLocalReconciliationShare(revoked);
  await pushDriveLocalReconciliationShareToCloud(revoked);
}

export async function saveDriveLocalReconciliationRowComment(params: {
  shareId: string;
  side: "sender" | "receiver";
  rowId: string;
  comment: string;
}): Promise<void> {
  const share = getDriveLocalReconciliationShare(params.shareId);
  if (!share) throw new Error("Share not found");
  const trimmed = String(params.comment || "").trim();
  const rowComments = { ...(share.rowComments || {}) };
  const sideMap = { ...(rowComments[params.side] || {}) };
  if (trimmed) sideMap[params.rowId] = trimmed;
  else delete sideMap[params.rowId];
  rowComments[params.side] = sideMap;
  const next = { ...share, rowComments, updatedAt: Date.now() };
  saveDriveLocalReconciliationShare(next);
  await pushDriveLocalReconciliationShareToCloud(next);
}

function mergeRemoteDriveShare(local: ReconciliationShare | undefined, remote: ReconciliationShare): ReconciliationShare {
  if (!local) return remote;
  const localTs = Number(local.updatedAt || local.linkedAt || 0);
  const remoteTs = Number(remote.updatedAt || remote.linkedAt || 0);
  return remoteTs >= localTs ? remote : local;
}

/** Cloud sync ke baad — Drive `data/recon_links/` se links import. */
export async function pullDriveLocalReconciliationLinksForCompany(companyId: string): Promise<number> {
  const cid = String(companyId || "").trim();
  if (!cid || !(await isLocalCompanyDriveDataSyncEnabled(cid))) return 0;

  const reg = await getLocalCompanyById(cid, { includeDeleted: true });
  if (!reg || reg.isDeleted === true) return 0;

  const linkIds = await readReconLinkIndex(reg);
  if (!linkIds.length) return 0;

  let imported = 0;
  const ownerId = String(reg.ownerId || "").trim();

  for (const linkId of linkIds) {
    if (!isDriveLocalReconciliationShareId(linkId)) continue;
    const raw = await downloadCompanyBranchJson(reg, reconLinkBranchPath(linkId));
    if (!raw) continue;
    try {
      let remote = JSON.parse(raw) as ReconciliationShare;
      if (!remote?.id) remote = { ...remote, id: linkId };
      if (remote.status === "linked" && ownerId) {
        remote = await materializeReceiverSideIfNeeded(remote, ownerId);
      }
      const merged = mergeRemoteDriveShare(getDriveLocalReconciliationShare(linkId), remote);
      saveDriveLocalReconciliationShare(merged);
      imported++;
    } catch {
      /* skip bad file */
    }
  }
  return imported;
}

/** Party accounts — local SQLite companies ke liye (Firestore-only path fail hota tha). */
export async function loadReconciliationPartyAccountsFromLocalMirror(
  companyId: string
): Promise<Array<{ id: string; name: string }>> {
  if (!companyId) return [];
  if (!isLocalOnlyMode() && !(await shouldUseLocalCloudSync(companyId))) {
    return [];
  }
  const rows = (await listCompanyDocsFromBrowserDb(companyId, "parties")) as Array<Record<string, unknown>>;
  return rows
    .filter((d) => d.isDeleted !== true)
    .map((d) => {
      const id = String(d.id || "").trim();
      const name = String(d.name || d.accountName || id).trim() || id;
      return { id, name };
    })
    .filter((r) => r.id)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
