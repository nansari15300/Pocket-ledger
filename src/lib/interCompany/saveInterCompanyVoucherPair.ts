/**
 * Inter Company — source + target company par linked `inter_company` vouchers save/update.
 */
import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { getNextInterCompanyVoucherNumber } from "@/lib/interCompany/nextInterCompanyVoucherNumber";
import {
  approveVoucherWithHistory,
  patchVoucherFields,
  saveVoucher,
  softDeleteVoucherMoveToRecycleBin,
} from "@/lib/voucherActionsClient";

export type InterCompanyLinkDoc = {
  linkId: string;
  role: "source" | "target";
  peerCompanyId: string;
  peerVoucherId: string;
};

export type SaveInterCompanyPairInput = {
  sourceCompanyId: string;
  targetCompanyId: string;
  userId: string;
  approverName?: string;
  voucherNumber: string;
  date: Date;
  amount: number;
  narration?: string;
  sourceEntityKind: InterCompanyEntityKind;
  sourceEntityId: string;
  targetEntityKind: InterCompanyEntityKind;
  targetEntityId: string;
  /** Edit/detail card — entity naam snapshot */
  sourceEntityLabel?: string;
  targetEntityLabel?: string;
  sourceCompanyName?: string;
  targetCompanyName?: string;
  existingSourceVoucherId?: string | null;
  existingTargetVoucherId?: string | null;
  existingLinkId?: string | null;
  approveSourceAfterSave?: boolean;
  /** Source voucher attachments — dono linked docs par same URLs */
  fileUrls?: string[];
};

function entityPayeeFields(kind: InterCompanyEntityKind, entityId: string): Record<string, string> {
  switch (kind) {
    case "party":
      return { partyId: entityId, payeeType: "party" };
    case "bank":
      return { accountId: entityId };
    case "staff":
      return { staffId: entityId, payeeType: "staff" };
    case "tax":
      return { taxAccountId: entityId };
    case "expense":
      return { expenseAccountId: entityId };
    default:
      return {};
  }
}

function mergeNarration(user: string | undefined, suffix: string): string {
  const base = String(user || "").trim();
  if (!base) return suffix;
  if (base.includes(suffix)) return base;
  return `${base}\n${suffix}`;
}

function newLinkId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `ic-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildVoucherPayload(args: {
  voucherNumber: string;
  dateIso: string;
  amount: number;
  narration: string;
  targetCompanyId: string;
  sourceEntityKind: InterCompanyEntityKind;
  sourceEntityId: string;
  targetEntityKind: InterCompanyEntityKind;
  targetEntityId: string;
  sourceEntityLabel?: string;
  targetEntityLabel?: string;
  link: InterCompanyLinkDoc;
  entityKind: InterCompanyEntityKind;
  entityId: string;
  fileUrls: string[];
}): Record<string, unknown> {
  return {
    type: "inter_company",
    voucherNumber: args.voucherNumber,
    date: args.dateIso,
    amount: args.amount,
    total: args.amount,
    narration: args.narration,
    fileUrls: args.fileUrls,
    allocations: [],
    linkedPaymentInIds: [],
    targetCompanyId: args.targetCompanyId,
    sourceEntityKind: args.sourceEntityKind,
    sourceEntityId: args.sourceEntityId,
    targetEntityKind: args.targetEntityKind,
    targetEntityId: args.targetEntityId,
    sourceEntityLabel: args.sourceEntityLabel || "",
    targetEntityLabel: args.targetEntityLabel || "",
    interCompanyLink: args.link,
    ...entityPayeeFields(args.entityKind, args.entityId),
  };
}

/** Dono companies par linked pair create / update. */
async function readCompanyDoc(companyId: string): Promise<Record<string, unknown> | null> {
  const snap = await getDoc(doc(firestore, "companies", companyId));
  return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
}

export async function saveInterCompanyVoucherPair(
  input: SaveInterCompanyPairInput
): Promise<{ sourceId: string; targetId: string; linkId: string }> {
  const linkId = input.existingLinkId || newLinkId();
  const dateIso = input.date.toISOString();
  const amount = Number(input.amount) || 0;
  const fileUrls = input.fileUrls ?? [];

  // Har company ka apna inter_company serial — create par alag number; update par purana rakho
  const [sourceCompanyDoc, targetCompanyDoc] = await Promise.all([
    readCompanyDoc(input.sourceCompanyId),
    readCompanyDoc(input.targetCompanyId),
  ]);

  let sourceVoucherNumber = String(input.voucherNumber || "").trim();
  let targetVoucherNumber = sourceVoucherNumber;

  if (input.existingSourceVoucherId) {
    const existing = await getDoc(
      doc(firestore, `companies/${input.sourceCompanyId}/vouchers`, input.existingSourceVoucherId)
    );
    if (existing.exists()) {
      sourceVoucherNumber = String(existing.data()?.voucherNumber || sourceVoucherNumber);
    }
    if (input.existingTargetVoucherId) {
      const existingTarget = await getDoc(
        doc(firestore, `companies/${input.targetCompanyId}/vouchers`, input.existingTargetVoucherId)
      );
      if (existingTarget.exists()) {
        targetVoucherNumber = String(existingTarget.data()?.voucherNumber || targetVoucherNumber);
      }
    }
  } else {
    sourceVoucherNumber = await getNextInterCompanyVoucherNumber(input.sourceCompanyId, sourceCompanyDoc);
    targetVoucherNumber = await getNextInterCompanyVoucherNumber(input.targetCompanyId, targetCompanyDoc);
  }

  const sourceSuffix = `[Inter-company to ${input.targetCompanyName || "company"} · Ref ${targetVoucherNumber}]`;
  const targetSuffix = `[Inter-company from ${input.sourceCompanyName || "company"} · Ref ${sourceVoucherNumber}]`;

  const sourceLink: InterCompanyLinkDoc = {
    linkId,
    role: "source",
    peerCompanyId: input.targetCompanyId,
    peerVoucherId: input.existingTargetVoucherId || "",
  };

  const sourcePayload = buildVoucherPayload({
    voucherNumber: sourceVoucherNumber,
    dateIso,
    amount,
    narration: mergeNarration(input.narration, sourceSuffix),
    targetCompanyId: input.targetCompanyId,
    sourceEntityKind: input.sourceEntityKind,
    sourceEntityId: input.sourceEntityId,
    targetEntityKind: input.targetEntityKind,
    targetEntityId: input.targetEntityId,
    sourceEntityLabel: input.sourceEntityLabel,
    targetEntityLabel: input.targetEntityLabel,
    link: sourceLink,
    entityKind: input.sourceEntityKind,
    entityId: input.sourceEntityId,
    fileUrls,
  });

  const sourceSaved = await saveVoucher(
    input.sourceCompanyId,
    input.userId,
    sourcePayload,
    input.existingSourceVoucherId || null
  );

  const targetLink: InterCompanyLinkDoc = {
    linkId,
    role: "target",
    peerCompanyId: input.sourceCompanyId,
    peerVoucherId: sourceSaved.id,
  };

  const targetPayload = buildVoucherPayload({
    voucherNumber: targetVoucherNumber,
    dateIso,
    amount,
    narration: mergeNarration(input.narration, targetSuffix),
    targetCompanyId: input.targetCompanyId,
    sourceEntityKind: input.sourceEntityKind,
    sourceEntityId: input.sourceEntityId,
    targetEntityKind: input.targetEntityKind,
    targetEntityId: input.targetEntityId,
    sourceEntityLabel: input.sourceEntityLabel,
    targetEntityLabel: input.targetEntityLabel,
    link: targetLink,
    entityKind: input.targetEntityKind,
    entityId: input.targetEntityId,
    fileUrls,
  });

  const targetSaved = await saveVoucher(
    input.targetCompanyId,
    input.userId,
    targetPayload,
    input.existingTargetVoucherId || null
  );

  await patchVoucherFields(input.sourceCompanyId, sourceSaved.id, {
    interCompanyLink: { ...sourceLink, peerVoucherId: targetSaved.id },
  });

  if (input.approveSourceAfterSave && input.approverName) {
    await approveVoucherWithHistory(
      input.sourceCompanyId,
      sourceSaved.id,
      input.userId,
      input.approverName
    );
  }

  return { sourceId: sourceSaved.id, targetId: targetSaved.id, linkId };
}

/** Source + linked target dono recycle bin. */
export async function deleteInterCompanyVoucherPair(args: {
  sourceCompanyId: string;
  sourceVoucherId: string;
  peerCompanyId?: string | null;
  peerVoucherId?: string | null;
  deletedByUid: string;
}): Promise<void> {
  await softDeleteVoucherMoveToRecycleBin(args.sourceCompanyId, args.sourceVoucherId, args.deletedByUid);
  if (args.peerCompanyId && args.peerVoucherId) {
    await softDeleteVoucherMoveToRecycleBin(args.peerCompanyId, args.peerVoucherId, args.deletedByUid);
  }
}
