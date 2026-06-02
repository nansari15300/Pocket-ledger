/**
 * Inter Company delete requests — local inbox/outbox (reverse flow jaisa).
 */
import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";

export type InterCompanyDeleteRequestStatus = "pending" | "accepted" | "rejected";

export type InterCompanyDeleteRequest = {
  id: string;
  createdAt: number;
  status: InterCompanyDeleteRequestStatus;
  reason: string;
  amount: number;
  linkId: string;
  requestedBySide: "source" | "target";
  sourceCompanyId: string;
  sourceCompanyName: string;
  sourceVoucherId: string;
  sourceVoucherNumber: string;
  sourceEntityKind: InterCompanyEntityKind;
  sourceEntityId: string;
  sourceEntityLabel: string;
  targetCompanyId: string;
  targetCompanyName: string;
  targetVoucherId: string;
  targetVoucherNumber: string;
  targetEntityKind: InterCompanyEntityKind;
  targetEntityId: string;
  targetEntityLabel: string;
  requestedByUid: string;
  requestedByName?: string;
  acceptedAt?: number;
  acceptedByUid?: string;
  acceptedByName?: string;
};

export const IC_DELETE_REQUESTS_CHANGED = "pl-ic-delete-requests-changed";

function inboxKey(companyId: string) {
  return `pl-ic-delete-inbox::${companyId}`;
}

function outboxKey(companyId: string) {
  return `pl-ic-delete-outbox::${companyId}`;
}

function notifyChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(IC_DELETE_REQUESTS_CHANGED));
}

function readList(key: string): InterCompanyDeleteRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const list = JSON.parse(raw) as InterCompanyDeleteRequest[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: InterCompanyDeleteRequest[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(list.slice(0, 200)));
  notifyChanged();
}

export function readInterCompanyDeleteInbox(companyId: string): InterCompanyDeleteRequest[] {
  if (!companyId) return [];
  return readList(inboxKey(companyId)).sort((a, b) => b.createdAt - a.createdAt);
}

export function readInterCompanyDeleteOutbox(companyId: string): InterCompanyDeleteRequest[] {
  if (!companyId) return [];
  return readList(outboxKey(companyId)).sort((a, b) => b.createdAt - a.createdAt);
}

export function countPendingDeleteInbox(companyId: string): number {
  return readInterCompanyDeleteInbox(companyId).filter((r) => r.status === "pending").length;
}

export function findPendingDeleteForLinkedVoucher(args: {
  companyId: string;
  side: "source" | "target";
  voucherId: string;
}): InterCompanyDeleteRequest | null {
  const vid = String(args.voucherId || "").trim();
  if (!vid) return null;
  const hit = readInterCompanyDeleteOutbox(args.companyId).find((r) => {
    if (r.status !== "pending") return false;
    return args.side === "source" ? r.sourceVoucherId === vid : r.targetVoucherId === vid;
  });
  return hit ?? null;
}

/** Responder inbox — is voucher par Confirm delete dikhana hai */
export function findPendingDeleteInboxForVoucher(args: {
  companyId: string;
  voucherId: string;
  linkId?: string | null;
  sourceVoucherId?: string | null;
  targetVoucherId?: string | null;
}): InterCompanyDeleteRequest | null {
  const cid = String(args.companyId || "").trim();
  if (!cid) return null;
  const vid = String(args.voucherId || "").trim();
  const linkId = String(args.linkId || "").trim();
  const sourceVid = String(args.sourceVoucherId || "").trim();
  const targetVid = String(args.targetVoucherId || "").trim();

  const pending = readInterCompanyDeleteInbox(cid).filter((r) => r.status === "pending");

  return (
    pending.find((r) => {
      if (linkId && r.linkId && r.linkId === linkId) return true;
      if (r.requestedBySide === "source") {
        if (r.targetCompanyId !== cid) return false;
        return (
          (!!vid && r.targetVoucherId === vid) ||
          (!!targetVid && r.targetVoucherId === targetVid)
        );
      }
      if (r.sourceCompanyId !== cid) return false;
      return (
        (!!vid && r.sourceVoucherId === vid) ||
        (!!sourceVid && r.sourceVoucherId === sourceVid)
      );
    }) ?? null
  );
}

export function findPendingDeleteOutboxForLinkedVoucher(args: {
  companyId: string;
  side: "source" | "target";
  voucherId: string;
  linkId?: string | null;
  sourceVoucherId?: string | null;
  targetVoucherId?: string | null;
}): InterCompanyDeleteRequest | null {
  const cid = String(args.companyId || "").trim();
  if (!cid) return null;
  const vid = String(args.voucherId || "").trim();
  const linkId = String(args.linkId || "").trim();
  const sourceVid = String(args.sourceVoucherId || "").trim();
  const targetVid = String(args.targetVoucherId || "").trim();

  return (
    readInterCompanyDeleteOutbox(cid).find((r) => {
      if (r.status !== "pending") return false;
      if (linkId && r.linkId && r.linkId === linkId) return true;
      if (args.side === "source") {
        return (
          (!!vid && r.sourceVoucherId === vid) ||
          (!!sourceVid && r.sourceVoucherId === sourceVid)
        );
      }
      return (
        (!!vid && r.targetVoucherId === vid) ||
        (!!targetVid && r.targetVoucherId === targetVid)
      );
    }) ?? null
  );
}

export function findAnyPendingDeleteForLink(args: {
  companyId: string;
  linkId?: string | null;
  sourceVoucherId?: string | null;
  targetVoucherId?: string | null;
}): InterCompanyDeleteRequest | null {
  const cid = String(args.companyId || "").trim();
  const linkId = String(args.linkId || "").trim();
  if (!cid) return null;
  const all = [
    ...readInterCompanyDeleteInbox(cid),
    ...readInterCompanyDeleteOutbox(cid),
  ].filter((r) => r.status === "pending");
  return (
    all.find((r) => {
      if (linkId && r.linkId && r.linkId === linkId) return true;
      const src = String(args.sourceVoucherId || "").trim();
      const tgt = String(args.targetVoucherId || "").trim();
      if (src && tgt && r.sourceVoucherId === src && r.targetVoucherId === tgt) return true;
      return false;
    }) ?? null
  );
}

/** Requester apni pending request cancel — dono side se hatao */
export function cancelInterCompanyDeleteRequest(args: {
  requestId: string;
  requesterCompanyId: string;
  responderCompanyId: string;
}): InterCompanyDeleteRequest | null {
  return updateInterCompanyDeleteRequestStatus(
    args.requestId,
    args.responderCompanyId,
    args.requesterCompanyId,
    { status: "rejected" }
  );
}

export function isLinkedVoucherDeletePendingOrDone(args: {
  companyId: string;
  side: "source" | "target";
  voucherId: string;
  linkId?: string | null;
  sourceVoucherId?: string | null;
  targetVoucherId?: string | null;
}): { pending: boolean; accepted: boolean } {
  const rows = readInterCompanyDeleteOutbox(args.companyId).filter((r) => {
    if (args.side === "source") {
      const vid = String(args.voucherId || args.sourceVoucherId || "").trim();
      const linkId = String(args.linkId || "").trim();
      if (linkId && r.linkId === linkId) return true;
      return r.sourceVoucherId === vid;
    }
    const vid = String(args.voucherId || args.targetVoucherId || "").trim();
    const linkId = String(args.linkId || "").trim();
    if (linkId && r.linkId === linkId) return true;
    return r.targetVoucherId === vid;
  });
  return {
    pending: rows.some((r) => r.status === "pending"),
    accepted: rows.some((r) => r.status === "accepted"),
  };
}

/** Requester outbox + responder inbox dono update */
export function appendInterCompanyDeleteRequest(req: InterCompanyDeleteRequest): void {
  const responderCompanyId =
    req.requestedBySide === "source" ? req.targetCompanyId : req.sourceCompanyId;

  const inbox = readInterCompanyDeleteInbox(responderCompanyId);
  writeList(inboxKey(responderCompanyId), [req, ...inbox]);

  const requesterCompanyId =
    req.requestedBySide === "source" ? req.sourceCompanyId : req.targetCompanyId;
  const outbox = readInterCompanyDeleteOutbox(requesterCompanyId);
  writeList(outboxKey(requesterCompanyId), [req, ...outbox]);
}

export function updateInterCompanyDeleteRequestStatus(
  requestId: string,
  responderCompanyId: string,
  requesterCompanyId: string,
  patch: Partial<InterCompanyDeleteRequest>
): InterCompanyDeleteRequest | null {
  let updated: InterCompanyDeleteRequest | null = null;

  const inbox = readInterCompanyDeleteInbox(responderCompanyId).map((r) => {
    if (r.id !== requestId) return r;
    updated = { ...r, ...patch };
    return updated;
  });
  writeList(inboxKey(responderCompanyId), inbox);

  const outbox = readInterCompanyDeleteOutbox(requesterCompanyId).map((r) => {
    if (r.id !== requestId) return r;
    const next = { ...r, ...patch };
    updated = updated ?? next;
    return next;
  });
  writeList(outboxKey(requesterCompanyId), outbox);

  return updated;
}

export function newDeleteRequestId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `ic-del-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
