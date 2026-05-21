/**
 * Saved inter_company voucher se form entity kind/id nikaalo (edit reopen).
 */
import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";

const VALID_ENTITY_KINDS = new Set<InterCompanyEntityKind>([
  "party",
  "bank",
  "staff",
  "tax",
  "expense",
]);

function normalizeEntityKind(raw: unknown): InterCompanyEntityKind | null {
  const k = String(raw || "")
    .toLowerCase()
    .trim() as InterCompanyEntityKind;
  return VALID_ENTITY_KINDS.has(k) ? k : null;
}

export function readInterCompanyLink(voucher: Record<string, unknown> | null | undefined) {
  const link = voucher?.interCompanyLink as
    | { linkId?: string; peerCompanyId?: string; peerVoucherId?: string; role?: string }
    | undefined;
  if (!link?.peerCompanyId || !link?.peerVoucherId) return null;
  return {
    linkId: String(link.linkId || ""),
    peerCompanyId: String(link.peerCompanyId),
    peerVoucherId: String(link.peerVoucherId),
    role: link.role,
  };
}

/** Is voucher copy par logged-in company source (sent) ya target (received) — Payment Out / In label ke liye */
export function interCompanyVoucherViewerSide(
  voucher: Record<string, unknown> | null | undefined
): "source" | "target" | null {
  const role = readInterCompanyLink(voucher)?.role;
  return role === "source" || role === "target" ? role : null;
}

/**
 * IC edit/delete global lock — ledger menu, dialog, save/delete guard.
 * Unapproved: sirf source copy par edit/delete; target copy hamesha band.
 * Source approve (`isApproved`) ke baad source + target dono par band.
 */
export function isInterCompanyVoucherEditDeleteBlocked(
  voucher: Record<string, unknown> | null | undefined
): boolean {
  if (!voucher || String(voucher.type || "") !== "inter_company") return false;
  const side = interCompanyVoucherViewerSide(voucher);
  if (side === "target") return true;
  if (side === "source") return voucher.isApproved === true;
  return true;
}

/** Payee fields se entity — is doc ka primary account (role ke hisaab se source ya target) */
function inferFromPayeeFields(voucher: Record<string, unknown>): { kind: InterCompanyEntityKind; id: string } | null {
  if (voucher.partyId) return { kind: "party", id: String(voucher.partyId) };
  if (voucher.accountId) return { kind: "bank", id: String(voucher.accountId) };
  if (voucher.staffId) return { kind: "staff", id: String(voucher.staffId) };
  if (voucher.taxAccountId) return { kind: "tax", id: String(voucher.taxAccountId) };
  if (voucher.expenseAccountId) return { kind: "expense", id: String(voucher.expenseAccountId) };
  return null;
}

export function inferInterCompanyEntity(
  voucher: Record<string, unknown>,
  side: "source" | "target"
): { kind: InterCompanyEntityKind; id: string } | null {
  const kindKey = side === "source" ? "sourceEntityKind" : "targetEntityKind";
  const idKey = side === "source" ? "sourceEntityId" : "targetEntityId";
  const kind = normalizeEntityKind(voucher[kindKey]);
  const id = String(voucher[idKey] || "").trim();
  if (kind && id) return { kind, id };

  const link = readInterCompanyLink(voucher);
  const payee = inferFromPayeeFields(voucher);
  if (!link?.role) return payee;

  // Linked doc: payee fields = is company ka apna account (source copy → source, target copy → target)
  if (link.role === "source" && side === "source") return payee;
  if (link.role === "target" && side === "target") return payee;

  return null;
}

/**
 * Edit par entity lists — source/target masters kis company se load hon.
 * Target company voucher kholne par source accounts peer company se aate hain.
 */
export function resolveInterCompanyEditCompanyIds(
  voucher: Record<string, unknown> | null | undefined,
  currentCompanyId: string
): {
  sourceEntitiesCompanyId: string;
  targetEntitiesCompanyId: string;
  targetCompanyFieldId: string;
} {
  const row = voucher || {};
  const link = readInterCompanyLink(row);
  const storedTarget = String(row.targetCompanyId || "").trim();

  if (link?.role === "target") {
    return {
      sourceEntitiesCompanyId: link.peerCompanyId,
      targetEntitiesCompanyId: currentCompanyId,
      targetCompanyFieldId: currentCompanyId,
    };
  }

  return {
    sourceEntitiesCompanyId: currentCompanyId,
    targetEntitiesCompanyId: storedTarget || currentCompanyId,
    targetCompanyFieldId: storedTarget,
  };
}

/** Save par detail card ke liye label snapshot (edit par list miss ho to bhi naam dikhe) */
export function readInterCompanyEntityLabelSnapshot(
  voucher: Record<string, unknown> | null | undefined,
  side: "source" | "target"
): string {
  const key = side === "source" ? "sourceEntityLabel" : "targetEntityLabel";
  return String(voucher?.[key] || "").trim();
}

/** Saved voucher par company bank — `companyBankAccountId` ya compound leg se */
export function readInterCompanyCompanyBankId(voucher: Record<string, unknown> | null | undefined): string {
  if (!voucher) return "";
  const direct = String(voucher.companyBankAccountId || "").trim();
  if (direct) return direct;
  const legs = voucher.interCompanyLegs;
  if (!Array.isArray(legs)) return "";
  for (const raw of legs) {
    if (!raw || typeof raw !== "object") continue;
    const leg = raw as { kind?: string; accountId?: string };
    if (String(leg.kind || "").toLowerCase() === "bank") {
      const id = String(leg.accountId || "").trim();
      if (id) return id;
    }
  }
  return "";
}

/** Edit form: dono companies ke bank ids — denormalized fields ya legacy `companyBankAccountId` */
export function resolveInterCompanyBankIdsForEdit(
  voucher: Record<string, unknown> | null | undefined
): { sourceCompanyBankAccountId: string; targetCompanyBankAccountId: string } {
  if (!voucher) return { sourceCompanyBankAccountId: "", targetCompanyBankAccountId: "" };
  const src = String(voucher.sourceCompanyBankAccountId || "").trim();
  const tgt = String(voucher.targetCompanyBankAccountId || "").trim();
  if (src || tgt) {
    return { sourceCompanyBankAccountId: src, targetCompanyBankAccountId: tgt };
  }
  const own = readInterCompanyCompanyBankId(voucher);
  const side = interCompanyVoucherViewerSide(voucher);
  if (side === "target") {
    return { sourceCompanyBankAccountId: "", targetCompanyBankAccountId: own };
  }
  return { sourceCompanyBankAccountId: own, targetCompanyBankAccountId: "" };
}

export function readInterCompanyBankLabelSnapshot(
  voucher: Record<string, unknown> | null | undefined,
  side: "source" | "target"
): string {
  const key = side === "source" ? "sourceCompanyBankLabel" : "targetCompanyBankLabel";
  return String(voucher?.[key] || "").trim();
}

/**
 * Target: source company ne IC approve kar diya — bank + Recent/Daybook me dikhe.
 * Source copy / non-IC vouchers par hamesha true.
 */
export function isInterCompanyVisibleOnTargetBank(
  voucher: Record<string, unknown> | null | undefined
): boolean {
  if (!voucher || String(voucher.type || "") !== "inter_company") return true;
  if (interCompanyVoucherViewerSide(voucher) !== "target") return true;
  return voucher.interCompanySourceApproved === true;
}

/** @deprecated — use isInterCompanyVisibleOnTargetBank */
export const isInterCompanyVisibleOnTargetCompany = isInterCompanyVisibleOnTargetBank;

/**
 * Target: entity ledger (party/staff/tax/expense) — source approve + target copy approve dono.
 */
export function isInterCompanyVisibleOnTargetEntity(
  voucher: Record<string, unknown> | null | undefined
): boolean {
  if (!voucher || String(voucher.type || "") !== "inter_company") return true;
  if (interCompanyVoucherViewerSide(voucher) !== "target") return true;
  if (!isInterCompanyVisibleOnTargetBank(voucher)) return false;
  return voucher.isApproved === true;
}

/** Recent / Daybook — target par source-unapproved IC bilkul hide */
export function shouldShowInterCompanyInDaybookOrRecent(
  voucher: Record<string, unknown> | null | undefined
): boolean {
  return isInterCompanyVisibleOnTargetBank(voucher);
}

/**
 * Unapproved pending badge — sirf jahan IC row ledger me dikhti hai (bank vs entity alag).
 */
export function collectInterCompanyIdsForPendingApproval(
  v: Record<string, unknown> | null | undefined,
  idSet: Set<string>,
  kind: InterCompanyEntityKind
): Set<string> {
  const out = new Set<string>();
  if (!v || String(v.type || "") !== "inter_company" || v.isApproved === true) return out;

  const add = (id: unknown) => {
    const s = String(id ?? "").trim();
    if (s && idSet.has(s)) out.add(s);
  };

  if (kind === "bank") {
    if (!isInterCompanyVisibleOnTargetBank(v)) return out;
    add(v.companyBankAccountId);
    return out;
  }

  if (!isInterCompanyVisibleOnTargetEntity(v)) return out;

  const sk = String(v.sourceEntityKind || "").toLowerCase();
  const tk = String(v.targetEntityKind || "").toLowerCase();
  if (sk === kind) add(v.sourceEntityId);
  if (tk === kind) add(v.targetEntityId);

  if (kind === "party") {
    add(v.partyId);
    add(v.interCompanyCounterpartyPartyId);
  } else if (kind === "staff") {
    add(v.staffId);
  } else if (kind === "tax") {
    add(v.taxAccountId);
  } else if (kind === "expense") {
    add(v.expenseAccountId);
  } else if (kind === "bank") {
    add(v.accountId);
    add(v.companyBankAccountId);
  }

  return out;
}
