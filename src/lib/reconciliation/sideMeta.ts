import type { ReconciliationEntityType, ReconciliationShare } from "./types";
import { RECON_ENTITY_OPTIONS } from "./types";

/** Company / Entity / Account — share list aur reconcile page dono me reuse. */
export type ReconSideMeta = {
  companyName: string;
  entityName: string;
  accountName: string;
};

export function reconciliationEntityLabel(entityType?: ReconciliationEntityType): string {
  return RECON_ENTITY_OPTIONS.find((o) => o.value === entityType)?.label ?? "—";
}

/** Share doc se sender ya receiver side ka meta. */
export function buildReconSideMeta(
  share: ReconciliationShare,
  side: "sender" | "receiver",
): ReconSideMeta {
  if (side === "sender") {
    return {
      companyName: share.senderCompanyName || "—",
      entityName: reconciliationEntityLabel(share.senderEntityType),
      accountName: share.senderAccountName || "—",
    };
  }
  return {
    companyName: share.receiverCompanyName || "—",
    entityName: reconciliationEntityLabel(share.receiverEntityType),
    accountName: share.receiverAccountName || "—",
  };
}

/**
 * Shared list / popup: left = viewer ki owned side, right = dusri party.
 * Pending share par missing receiver fields placeholder se bharte hain.
 */
export function getReconShareSidesForViewer(
  share: ReconciliationShare,
  userId: string | undefined,
): { owned: ReconSideMeta; other: ReconSideMeta } {
  const iAmSender = !!userId && share.senderUserId === userId;
  const ownedSide: "sender" | "receiver" = iAmSender ? "sender" : "receiver";
  const otherSide: "sender" | "receiver" = iAmSender ? "receiver" : "sender";

  let owned = buildReconSideMeta(share, ownedSide);
  let other = buildReconSideMeta(share, otherSide);

  if (share.status === "pending" && !iAmSender) {
    owned = { companyName: "Not linked", entityName: "—", accountName: "—" };
  }
  if (share.status === "pending" && iAmSender) {
    other = {
      companyName: share.targetUserEmail || "Invited user",
      entityName: "—",
      accountName: "—",
    };
  }
  // Revoked — dono side ka last linked meta dikhao (receiver fields doc me rehte hain)
  if (share.status === "revoked" && !share.receiverCompanyId && !iAmSender) {
    owned = { companyName: "Was linked", entityName: "—", accountName: "—" };
  }

  return { owned, other };
}

/** Shared list Owned column — viewer sender hai ya receiver. */
export function getReconShareRoleLabelForViewer(
  share: ReconciliationShare,
  userId: string | undefined,
): "Sender" | "Receiver" {
  return !!userId && share.senderUserId === userId ? "Sender" : "Receiver";
}

/** Shared list — sirf selected company se judi shares (sender/receiver id match). */
export function reconciliationShareInvolvesCompany(
  share: ReconciliationShare,
  companyId: string | undefined,
  userId?: string,
): boolean {
  const cid = String(companyId || "").trim();
  if (!cid) return false;
  if (share.senderCompanyId === cid) return true;
  if (share.receiverCompanyId === cid) return true;
  // Pending incoming — receiver company abhi nahi; user selected company se link karega
  if (
    userId &&
    share.targetUserId === userId &&
    share.status === "pending" &&
    !share.receiverCompanyId
  ) {
    return true;
  }
  return false;
}
