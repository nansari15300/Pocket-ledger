import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";
import {
  inferInterCompanyEntity,
  interCompanyVoucherViewerSide,
  readInterCompanyBankLabelSnapshot,
  readInterCompanyEntityLabelSnapshot,
  readInterCompanyLink,
  readInterCompanyOwnFileUrls,
  resolveInterCompanyBankIdsForEdit,
  resolveInterCompanyEditCompanyIds,
} from "@/lib/interCompany/interCompanyVoucherHydrate";
import { normalizeInterCompanyTargetPostMode } from "@/lib/interCompany/interCompanyPostingLegs";
import {
  saveInterCompanyVoucherPair,
  type SaveInterCompanyPairInput,
} from "@/lib/interCompany/saveInterCompanyVoucherPair";
import type { InterCompanyPeerPendingFieldKey } from "@/lib/interCompany/interCompanyPeerPending";
import { parseFirestoreDateFieldToJsDate } from "@/lib/voucherDateNormalize";

function requireEntity(
  voucher: Record<string, unknown>,
  side: "source" | "target"
): { kind: InterCompanyEntityKind; id: string } {
  const hit = inferInterCompanyEntity(voucher, side);
  if (!hit?.id) {
    throw new Error(`Inter-company ${side} account is missing on this voucher`);
  }
  return hit;
}

export type InterCompanyLedgerSavePairInput = Omit<
  SaveInterCompanyPairInput,
  "userId" | "applyPeerPendingFieldKeys" | "approverName"
>;

export function buildSavePairInputFromInterCompanyLedgerRow(
  voucher: Record<string, unknown>,
  currentCompanyId: string,
  resolveCompanyName: (companyId: string) => string | undefined
): InterCompanyLedgerSavePairInput | null {
  const vid = String(voucher.id || "").trim();
  if (!vid) return null;
  const link = readInterCompanyLink(voucher);
  if (!link?.peerCompanyId || !link.peerVoucherId) return null;

  const viewerSide = interCompanyVoucherViewerSide(voucher) ?? (link.role === "target" ? "target" : "source");
  const editIds = resolveInterCompanyEditCompanyIds(voucher, currentCompanyId);
  const sourceCompanyId = String(editIds.sourceEntitiesCompanyId || currentCompanyId).trim();
  const targetCompanyId = String(editIds.targetCompanyFieldId || editIds.targetEntitiesCompanyId || "").trim();
  if (!sourceCompanyId || !targetCompanyId) return null;

  const sourceEntity = requireEntity(voucher, "source");
  const targetEntity = requireEntity(voucher, "target");
  const banks = resolveInterCompanyBankIdsForEdit(voucher);
  const parsedDate = parseFirestoreDateFieldToJsDate(voucher.date) ?? new Date();
  const targetPostMode = normalizeInterCompanyTargetPostMode(
    String(voucher.interCompanyTargetPostMode || "payment_in")
  );

  let existingSourceVoucherId: string | null = null;
  let existingTargetVoucherId: string | null = null;
  if (viewerSide === "target") {
    existingSourceVoucherId = String(link.peerVoucherId || "").trim() || null;
    existingTargetVoucherId = vid;
  } else {
    existingSourceVoucherId = vid;
    existingTargetVoucherId = String(link.peerVoucherId || "").trim() || null;
  }

  const ownFiles = readInterCompanyOwnFileUrls(voucher);
  const shareSource = voucher.interCompanyShareAttachmentsWithPeer === true;
  const shareTarget = voucher.interCompanySharePeerAttachmentsToSource === true;

  const base: InterCompanyLedgerSavePairInput = {
    sourceCompanyId,
    targetCompanyId,
    voucherNumber: String(voucher.voucherNumber || ""),
    date: parsedDate,
    amount: Number(voucher.amount || voucher.total || 0) || 0,
    narration: String(voucher.narration || ""),
    otherChargeAccountId: String(voucher.otherChargeAccountId || "").trim() || undefined,
    otherChargeAmount: Number(voucher.otherChargeAmount || 0) || undefined,
    otherChargeKind: (() => {
      const k = String(voucher.otherChargeKind || "").trim();
      return k === "party" || k === "staff" || k === "expense" ? k : null;
    })(),
    sourceEntityKind: sourceEntity.kind,
    sourceEntityId: sourceEntity.id,
    targetEntityKind: targetEntity.kind,
    targetEntityId: targetEntity.id,
    sourceCompanyBankAccountId: banks.sourceCompanyBankAccountId,
    targetCompanyBankAccountId: banks.targetCompanyBankAccountId,
    sourceCompanyBankLabel: readInterCompanyBankLabelSnapshot(voucher, "source"),
    targetCompanyBankLabel: readInterCompanyBankLabelSnapshot(voucher, "target"),
    sourceEntityLabel: readInterCompanyEntityLabelSnapshot(voucher, "source"),
    targetEntityLabel: readInterCompanyEntityLabelSnapshot(voucher, "target"),
    sourceCompanyName: resolveCompanyName(sourceCompanyId),
    targetCompanyName: resolveCompanyName(targetCompanyId),
    existingSourceVoucherId,
    existingTargetVoucherId,
    existingLinkId: link.linkId || null,
    targetPostMode,
    editingSide: viewerSide,
    interCompanySuggestedSourceAccountLabel: String(voucher.interCompanySuggestedSourceAccountLabel || "").trim() || undefined,
    interCompanySourceAccountRestricted: voucher.interCompanySourceAccountRestricted === true || undefined,
    shareSourceAttachmentsWithPeer: shareSource,
    shareTargetAttachmentsWithSource: shareTarget,
    sourceFileUrls: viewerSide === "source" ? ownFiles : undefined,
    targetFileUrls: viewerSide === "target" ? ownFiles : undefined,
  };

  return base;
}

export async function applyInterCompanyPeerPendingFromLedgerVoucher(args: {
  voucher: Record<string, unknown>;
  currentCompanyId: string;
  userId: string;
  approverName?: string;
  applyKeys: InterCompanyPeerPendingFieldKey[];
  resolveCompanyName: (companyId: string) => string | undefined;
}) {
  const built = buildSavePairInputFromInterCompanyLedgerRow(
    args.voucher,
    args.currentCompanyId,
    args.resolveCompanyName
  );
  if (!built) throw new Error("Could not load inter-company voucher for apply");
  return saveInterCompanyVoucherPair({
    ...built,
    userId: args.userId,
    approverName: args.approverName,
    applyPeerPendingFieldKeys: args.applyKeys,
  });
}
