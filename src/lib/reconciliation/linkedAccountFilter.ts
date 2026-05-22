import type { ReconciliationEntityType, ReconciliationShare } from "./types";

/** Owned (receiver) side account key — entity + id; same company me duplicate link rokne ke liye. */
export function buildLinkedReceiverAccountKey(
  entityType: ReconciliationEntityType | string | undefined,
  accountId: string | undefined
): string | null {
  const entity = String(entityType || "").trim();
  const id = String(accountId || "").trim();
  if (!entity || !id) return null;
  return `${entity}:${id}`;
}

/**
 * Same company me receiver ke accounts jo pehle se kisi linked share par hain.
 * `excludeShareId` = change mode — is share ka current account selectable rehne do.
 */
export function getLinkedReceiverAccountKeysForCompany(
  shares: ReconciliationShare[],
  userId: string | undefined,
  companyId: string | undefined,
  excludeShareId?: string | null
): Set<string> {
  const keys = new Set<string>();
  const uid = String(userId || "").trim();
  const cid = String(companyId || "").trim();
  if (!uid || !cid) return keys;

  for (const share of shares) {
    if (share.status !== "linked") continue;
    if (excludeShareId && share.id === excludeShareId) continue;
    if (share.receiverCompanyId !== cid) continue;
    const isReceiver = share.receiverUserId === uid || share.targetUserId === uid;
    if (!isReceiver) continue;
    const key = buildLinkedReceiverAccountKey(share.receiverEntityType, share.receiverAccountId);
    if (key) keys.add(key);
  }
  return keys;
}

/** Same company me sender ke accounts jo pehle se linked share par hain. */
export function getLinkedSenderAccountKeysForCompany(
  shares: ReconciliationShare[],
  userId: string | undefined,
  companyId: string | undefined,
  excludeShareId?: string | null
): Set<string> {
  const keys = new Set<string>();
  const uid = String(userId || "").trim();
  const cid = String(companyId || "").trim();
  if (!uid || !cid) return keys;

  for (const share of shares) {
    if (share.status !== "linked") continue;
    if (excludeShareId && share.id === excludeShareId) continue;
    if (share.senderCompanyId !== cid) continue;
    if (share.senderUserId !== uid) continue;
    const key = buildLinkedReceiverAccountKey(share.senderEntityType, share.senderAccountId);
    if (key) keys.add(key);
  }
  return keys;
}

export function isSenderAccountAlreadyLinked(
  shares: ReconciliationShare[],
  userId: string | undefined,
  companyId: string | undefined,
  entityType: ReconciliationEntityType,
  accountId: string,
  excludeShareId?: string | null
): boolean {
  const key = buildLinkedReceiverAccountKey(entityType, accountId);
  if (!key) return false;
  return getLinkedSenderAccountKeysForCompany(shares, userId, companyId, excludeShareId).has(key);
}

/** Link / update se pehle — account doosri linked share par to nahi. */
export function isReceiverAccountAlreadyLinked(
  shares: ReconciliationShare[],
  userId: string | undefined,
  companyId: string | undefined,
  entityType: ReconciliationEntityType,
  accountId: string,
  excludeShareId?: string | null
): boolean {
  const key = buildLinkedReceiverAccountKey(entityType, accountId);
  if (!key) return false;
  return getLinkedReceiverAccountKeysForCompany(shares, userId, companyId, excludeShareId).has(key);
}
