/**
 * Inter Company — peer edit pending apply (source save pe target freeze; Change Detected se selective apply).
 */
import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";
import type { InterCompanyTargetPostMode } from "@/lib/interCompany/interCompanyPostingLegs";

export type InterCompanyPeerPendingFieldKey =
  | "amount"
  | "date"
  | "narration"
  | "sourceEntity"
  | "targetEntity"
  | "sourceBank"
  | "targetBank"
  | "targetPostMode";

export type InterCompanyPeerPendingProposed = {
  amount?: number;
  dateIso?: string;
  /** Peer-side user narration base (suffix-free preferred; display can show full) */
  narration?: string;
  sourceEntityKind?: InterCompanyEntityKind;
  sourceEntityId?: string;
  sourceEntityLabel?: string;
  targetEntityKind?: InterCompanyEntityKind;
  targetEntityId?: string;
  targetEntityLabel?: string;
  sourceCompanyBankAccountId?: string;
  sourceCompanyBankLabel?: string;
  targetCompanyBankAccountId?: string;
  targetCompanyBankLabel?: string;
  targetPostMode?: InterCompanyTargetPostMode;
};

export type InterCompanyPeerPendingDoc = {
  fromPeerCompanyId: string;
  fromPeerVoucherId: string;
  updatedAt: string;
  proposed: InterCompanyPeerPendingProposed;
};

export function readInterCompanyPeerPending(
  row: Record<string, unknown> | null | undefined
): InterCompanyPeerPendingDoc | null {
  if (!row) return null;
  const raw = row.interCompanyPeerPending;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const proposed = o.proposed;
  if (!proposed || typeof proposed !== "object") return null;
  const fromPeerCompanyId = String(o.fromPeerCompanyId || "").trim();
  const fromPeerVoucherId = String(o.fromPeerVoucherId || "").trim();
  if (!fromPeerCompanyId || !fromPeerVoucherId) return null;
  return {
    fromPeerCompanyId,
    fromPeerVoucherId,
    updatedAt: String(o.updatedAt || "").trim() || new Date().toISOString(),
    proposed: proposed as InterCompanyPeerPendingProposed,
  };
}

/** Ledger / list: peer ne fields change kiye, is company ne apply nahi kiya */
export function isInterCompanyPeerPendingChange(
  tx: { type?: string; interCompanyPeerPending?: unknown } | null | undefined
): boolean {
  if (!tx || String(tx.type || "") !== "inter_company") return false;
  return readInterCompanyPeerPending(tx as Record<string, unknown>) != null;
}

function idsEqual(a: unknown, b: unknown): boolean {
  return String(a ?? "").trim() === String(b ?? "").trim();
}

function amountEqual(a: unknown, b: unknown): boolean {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) && !Number.isFinite(nb)) return true;
  return Math.abs((Number.isFinite(na) ? na : 0) - (Number.isFinite(nb) ? nb : 0)) < 0.000_001;
}

function dateIsoFromVoucher(row: Record<string, unknown>): string {
  const d = row.date as { toDate?: () => Date } | string | Date | undefined;
  if (d && typeof d === "object" && typeof (d as { toDate?: () => Date }).toDate === "function") {
    return (d as { toDate: () => Date }).toDate().toISOString();
  }
  if (d instanceof Date) return d.toISOString();
  if (typeof d === "string" && d.trim()) {
    const parsed = new Date(d);
    return Number.isNaN(parsed.getTime()) ? d.trim() : parsed.toISOString();
  }
  return "";
}

function dateDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso || "").slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Existing peer voucher vs incoming save — sirf changed fields proposed me. */
export function buildInterCompanyPeerPendingProposed(args: {
  existingPeer: Record<string, unknown>;
  amount: number;
  dateIso: string;
  narration: string;
  sourceEntityKind: InterCompanyEntityKind;
  sourceEntityId: string;
  sourceEntityLabel?: string;
  targetEntityKind: InterCompanyEntityKind;
  targetEntityId: string;
  targetEntityLabel?: string;
  sourceCompanyBankAccountId: string;
  sourceCompanyBankLabel?: string;
  targetCompanyBankAccountId: string;
  targetCompanyBankLabel?: string;
  targetPostMode: InterCompanyTargetPostMode;
}): InterCompanyPeerPendingProposed | null {
  const ex = args.existingPeer;
  const proposed: InterCompanyPeerPendingProposed = {};

  if (!amountEqual(ex.amount ?? ex.total, args.amount)) {
    proposed.amount = args.amount;
  }

  const existingDateIso = dateIsoFromVoucher(ex);
  if (dateDayKey(existingDateIso) !== dateDayKey(args.dateIso)) {
    proposed.dateIso = args.dateIso;
  }

  const existingNarr = String(ex.narration || "").trim();
  if (existingNarr !== String(args.narration || "").trim()) {
    proposed.narration = String(args.narration || "").trim();
  }

  if (
    !idsEqual(ex.sourceEntityId, args.sourceEntityId) ||
    !idsEqual(ex.sourceEntityKind, args.sourceEntityKind)
  ) {
    proposed.sourceEntityKind = args.sourceEntityKind;
    proposed.sourceEntityId = args.sourceEntityId;
    proposed.sourceEntityLabel = args.sourceEntityLabel;
  }

  if (
    !idsEqual(ex.targetEntityId, args.targetEntityId) ||
    !idsEqual(ex.targetEntityKind, args.targetEntityKind)
  ) {
    proposed.targetEntityKind = args.targetEntityKind;
    proposed.targetEntityId = args.targetEntityId;
    proposed.targetEntityLabel = args.targetEntityLabel;
  }

  const existingSourceBank = String(
    ex.sourceCompanyBankAccountId || ex.companyBankAccountId || ""
  ).trim();
  if (!idsEqual(existingSourceBank, args.sourceCompanyBankAccountId)) {
    proposed.sourceCompanyBankAccountId = args.sourceCompanyBankAccountId;
    proposed.sourceCompanyBankLabel = args.sourceCompanyBankLabel;
  }

  const existingTargetBank = String(ex.targetCompanyBankAccountId || "").trim();
  // Target role docs often store receive bank as companyBankAccountId
  const existingTargetBankLoose =
    existingTargetBank ||
    (String((ex.interCompanyLink as { role?: string } | undefined)?.role || "") === "target"
      ? String(ex.companyBankAccountId || "").trim()
      : "");
  if (!idsEqual(existingTargetBankLoose, args.targetCompanyBankAccountId)) {
    proposed.targetCompanyBankAccountId = args.targetCompanyBankAccountId;
    proposed.targetCompanyBankLabel = args.targetCompanyBankLabel;
  }

  const existingMode = String(ex.interCompanyTargetPostMode || "payment_in").trim() || "payment_in";
  const nextMode = String(args.targetPostMode || "payment_in").trim() || "payment_in";
  if (existingMode !== nextMode) {
    proposed.targetPostMode = args.targetPostMode;
  }

  return Object.keys(proposed).length > 0 ? proposed : null;
}

export function peerPendingProposedFieldKeys(
  proposed: InterCompanyPeerPendingProposed | null | undefined
): InterCompanyPeerPendingFieldKey[] {
  if (!proposed) return [];
  const keys: InterCompanyPeerPendingFieldKey[] = [];
  if (proposed.amount != null) keys.push("amount");
  if (proposed.dateIso) keys.push("date");
  if (proposed.narration != null) keys.push("narration");
  if (proposed.sourceEntityId || proposed.sourceEntityKind) keys.push("sourceEntity");
  if (proposed.targetEntityId || proposed.targetEntityKind) keys.push("targetEntity");
  if (proposed.sourceCompanyBankAccountId) keys.push("sourceBank");
  if (proposed.targetCompanyBankAccountId) keys.push("targetBank");
  if (proposed.targetPostMode) keys.push("targetPostMode");
  return keys;
}

/** Apply selected keys from pending onto a base snapshot (current voucher values). */
export function mergeInterCompanyPeerPendingIntoValues(args: {
  base: {
    amount: number;
    dateIso: string;
    narration: string;
    sourceEntityKind: InterCompanyEntityKind;
    sourceEntityId: string;
    sourceEntityLabel?: string;
    targetEntityKind: InterCompanyEntityKind;
    targetEntityId: string;
    targetEntityLabel?: string;
    sourceCompanyBankAccountId: string;
    sourceCompanyBankLabel?: string;
    targetCompanyBankAccountId: string;
    targetCompanyBankLabel?: string;
    targetPostMode: InterCompanyTargetPostMode;
  };
  pending: InterCompanyPeerPendingDoc;
  applyKeys: InterCompanyPeerPendingFieldKey[];
}): typeof args.base {
  const p = args.pending.proposed;
  const set = new Set(args.applyKeys);
  const next = { ...args.base };
  if (set.has("amount") && p.amount != null) next.amount = Number(p.amount) || 0;
  if (set.has("date") && p.dateIso) next.dateIso = p.dateIso;
  if (set.has("narration") && p.narration != null) next.narration = String(p.narration);
  if (set.has("sourceEntity")) {
    if (p.sourceEntityKind) next.sourceEntityKind = p.sourceEntityKind;
    if (p.sourceEntityId) next.sourceEntityId = p.sourceEntityId;
    if (p.sourceEntityLabel != null) next.sourceEntityLabel = p.sourceEntityLabel;
  }
  if (set.has("targetEntity")) {
    if (p.targetEntityKind) next.targetEntityKind = p.targetEntityKind;
    if (p.targetEntityId) next.targetEntityId = p.targetEntityId;
    if (p.targetEntityLabel != null) next.targetEntityLabel = p.targetEntityLabel;
  }
  if (set.has("sourceBank") && p.sourceCompanyBankAccountId) {
    next.sourceCompanyBankAccountId = p.sourceCompanyBankAccountId;
    if (p.sourceCompanyBankLabel != null) next.sourceCompanyBankLabel = p.sourceCompanyBankLabel;
  }
  if (set.has("targetBank") && p.targetCompanyBankAccountId) {
    next.targetCompanyBankAccountId = p.targetCompanyBankAccountId;
    if (p.targetCompanyBankLabel != null) next.targetCompanyBankLabel = p.targetCompanyBankLabel;
  }
  if (set.has("targetPostMode") && p.targetPostMode) {
    next.targetPostMode = p.targetPostMode;
  }
  return next;
}

/** Remaining pending after partial apply (unticked fields stay pending). */
export function remainingInterCompanyPeerPendingProposed(
  proposed: InterCompanyPeerPendingProposed,
  appliedKeys: InterCompanyPeerPendingFieldKey[]
): InterCompanyPeerPendingProposed | null {
  const set = new Set(appliedKeys);
  const next: InterCompanyPeerPendingProposed = { ...proposed };
  if (set.has("amount")) delete next.amount;
  if (set.has("date")) delete next.dateIso;
  if (set.has("narration")) delete next.narration;
  if (set.has("sourceEntity")) {
    delete next.sourceEntityKind;
    delete next.sourceEntityId;
    delete next.sourceEntityLabel;
  }
  if (set.has("targetEntity")) {
    delete next.targetEntityKind;
    delete next.targetEntityId;
    delete next.targetEntityLabel;
  }
  if (set.has("sourceBank")) {
    delete next.sourceCompanyBankAccountId;
    delete next.sourceCompanyBankLabel;
  }
  if (set.has("targetBank")) {
    delete next.targetCompanyBankAccountId;
    delete next.targetCompanyBankLabel;
  }
  if (set.has("targetPostMode")) delete next.targetPostMode;
  return Object.keys(next).length > 0 ? next : null;
}
