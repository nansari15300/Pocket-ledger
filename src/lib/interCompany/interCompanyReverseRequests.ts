/**
 * Inter Company reverse requests — local inbox/outbox (invite flow jaisa; cross-company same browser).
 */
import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";

export type InterCompanyReverseRequestStatus = "pending" | "accepted" | "rejected";

export type InterCompanyReverseRequest = {
  id: string;
  createdAt: number;
  status: InterCompanyReverseRequestStatus;
  reason: string;
  attachmentUrls: string[];
  amount: number;
  linkId: string;
  sourceCompanyId: string;
  sourceCompanyName: string;
  sourceVoucherId: string;
  sourceVoucherNumber: string;
  sourceEntityKind: InterCompanyEntityKind;
  sourceEntityId: string;
  sourceEntityLabel: string;
  sourceEntityAcNo?: string;
  targetCompanyId: string;
  targetCompanyName: string;
  targetVoucherId: string;
  targetVoucherNumber: string;
  targetEntityKind: InterCompanyEntityKind;
  targetEntityId: string;
  targetEntityLabel: string;
  targetEntityAcNo?: string;
  requestedByUid: string;
  requestedByName?: string;
  acceptedAt?: number;
  acceptedByUid?: string;
  acceptedByName?: string;
};

export const IC_REVERSE_REQUESTS_CHANGED = "pl-ic-reverse-requests-changed";

function inboxKey(targetCompanyId: string) {
  return `pl-ic-reverse-inbox::${targetCompanyId}`;
}

function outboxKey(sourceCompanyId: string) {
  return `pl-ic-reverse-outbox::${sourceCompanyId}`;
}

function notifyChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(IC_REVERSE_REQUESTS_CHANGED));
}

function readList(key: string): InterCompanyReverseRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const list = JSON.parse(raw) as InterCompanyReverseRequest[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: InterCompanyReverseRequest[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(list.slice(0, 200)));
  notifyChanged();
}

export function readInterCompanyReverseInbox(targetCompanyId: string): InterCompanyReverseRequest[] {
  if (!targetCompanyId) return [];
  return readList(inboxKey(targetCompanyId)).sort((a, b) => b.createdAt - a.createdAt);
}

export function readInterCompanyReverseOutbox(sourceCompanyId: string): InterCompanyReverseRequest[] {
  if (!sourceCompanyId) return [];
  return readList(outboxKey(sourceCompanyId)).sort((a, b) => b.createdAt - a.createdAt);
}

export function countPendingReverseInbox(targetCompanyId: string): number {
  return readInterCompanyReverseInbox(targetCompanyId).filter((r) => r.status === "pending").length;
}

export function findPendingReverseForSourceVoucher(
  sourceCompanyId: string,
  sourceVoucherId: string
): InterCompanyReverseRequest | null {
  const hit = readInterCompanyReverseOutbox(sourceCompanyId).find(
    (r) => r.sourceVoucherId === sourceVoucherId && r.status === "pending"
  );
  return hit ?? null;
}

export function isSourceVoucherReversePendingOrDone(
  sourceCompanyId: string,
  sourceVoucherId: string
): { pending: boolean; accepted: boolean } {
  const rows = readInterCompanyReverseOutbox(sourceCompanyId).filter(
    (r) => r.sourceVoucherId === sourceVoucherId
  );
  return {
    pending: rows.some((r) => r.status === "pending"),
    accepted: rows.some((r) => r.status === "accepted"),
  };
}

/** Source company — target inbox + source outbox dono update */
export function appendInterCompanyReverseRequest(req: InterCompanyReverseRequest): void {
  const inbox = readInterCompanyReverseInbox(req.targetCompanyId);
  writeList(inboxKey(req.targetCompanyId), [req, ...inbox]);

  const outbox = readInterCompanyReverseOutbox(req.sourceCompanyId);
  writeList(outboxKey(req.sourceCompanyId), [req, ...outbox]);
}

export function updateInterCompanyReverseRequestStatus(
  requestId: string,
  targetCompanyId: string,
  sourceCompanyId: string,
  patch: Partial<InterCompanyReverseRequest>
): InterCompanyReverseRequest | null {
  let updated: InterCompanyReverseRequest | null = null;

  const inbox = readInterCompanyReverseInbox(targetCompanyId).map((r) => {
    if (r.id !== requestId) return r;
    updated = { ...r, ...patch };
    return updated;
  });
  writeList(inboxKey(targetCompanyId), inbox);

  const outbox = readInterCompanyReverseOutbox(sourceCompanyId).map((r) => {
    if (r.id !== requestId) return r;
    const next = { ...r, ...patch };
    updated = updated ?? next;
    return next;
  });
  writeList(outboxKey(sourceCompanyId), outbox);

  return updated;
}

export function newReverseRequestId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `ic-rev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
