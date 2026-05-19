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
