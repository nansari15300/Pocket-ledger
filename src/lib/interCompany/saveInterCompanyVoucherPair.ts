/**
 * Inter Company — source + target company par linked `inter_company` vouchers save/update.
 */
import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import {
  isRecurringAutoUserDisplayLabel,
  resolveHumanActorDisplayLabel,
  type InterCompanyCreateHistoryInput,
} from "@/lib/interCompany/interCompanyVoucherHistory";
import { ensureInterCompanyCounterpartyParty } from "@/lib/interCompany/ensureInterCompanyCounterpartyParty";
import {
  buildSourceInterCompanyLegs,
  buildTargetInterCompanyLegsPending,
} from "@/lib/interCompany/interCompanyPostingLegs";
import { getNextInterCompanyVoucherNumber } from "@/lib/interCompany/nextInterCompanyVoucherNumber";
import {
  assertInterCompanyDeleteAllowed,
  assertInterCompanyPairEditDeleteAllowed,
} from "@/lib/interCompany/interCompanyEditLock";
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
  /** Source company — payment nikalne wala bank/cash */
  sourceCompanyBankAccountId: string;
  /** Target company — receive hone wala bank/cash (approve par ledger) */
  targetCompanyBankAccountId: string;
  /** Edit hydrate — bank account display naam */
  sourceCompanyBankLabel?: string;
  targetCompanyBankLabel?: string;
  /** Edit/detail card — entity naam snapshot */
  sourceEntityLabel?: string;
  targetEntityLabel?: string;
  /** History + voucher snapshot — From / To company rows */
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
  sourceCompanyName?: string;
  targetCompanyName?: string;
  link: InterCompanyLinkDoc;
  entityKind: InterCompanyEntityKind;
  entityId: string;
  fileUrls: string[];
  companyBankAccountId: string;
  interCompanyCounterpartyPartyId: string;
  interCompanyLegs: ReturnType<typeof buildSourceInterCompanyLegs>;
  /** Dono copies par — edit par peer fetch ke bina bank hydrate */
  sourceCompanyBankAccountId?: string;
  targetCompanyBankAccountId?: string;
  sourceCompanyBankLabel?: string;
  targetCompanyBankLabel?: string;
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
    sourceCompanyName: args.sourceCompanyName || "",
    targetCompanyName: args.targetCompanyName || "",
    interCompanyLink: args.link,
    companyBankAccountId: args.companyBankAccountId,
    sourceCompanyBankAccountId: String(args.sourceCompanyBankAccountId || "").trim() || null,
    targetCompanyBankAccountId: String(args.targetCompanyBankAccountId || "").trim() || null,
    sourceCompanyBankLabel: args.sourceCompanyBankLabel || null,
    targetCompanyBankLabel: args.targetCompanyBankLabel || null,
    interCompanyCounterpartyPartyId: args.interCompanyCounterpartyPartyId,
    interCompanyLegs: args.interCompanyLegs,
    ...entityPayeeFields(args.entityKind, args.entityId),
  };
}

/** Dono companies par linked pair create / update. */
async function readCompanyDoc(companyId: string): Promise<Record<string, unknown> | null> {
  const snap = await getDoc(doc(firestore, "companies", companyId));
  return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
}

/** Inter Company save: asli user naam — "Auto" sirf recurring ke liye; Firestore users doc prefer. */
async function resolveInterCompanyActorForSave(
  userId: string,
  candidateName?: string | null
): Promise<{ displayName: string; email: string | null; phone: string | null }> {
  const authUser = auth.currentUser;
  let email = authUser?.email?.trim() || null;
  let firestoreName: string | null = null;
  let phone: string | null = authUser?.phoneNumber?.trim() || null;

  try {
    const q = query(collection(firestore, "users"), where("uid", "==", userId));
    const snap = await getDocs(q);
    const data = snap.docs[0]?.data() as {
      displayName?: string;
      name?: string;
      email?: string;
      phone?: string;
      mobile?: string;
    } | undefined;
    if (data) {
      const dn = String(data.displayName || data.name || "").trim();
      if (dn && !isRecurringAutoUserDisplayLabel(dn)) firestoreName = dn;
      const em = String(data.email || "").trim();
      if (em) email = em;
      const p = String(data.phone || data.mobile || "").trim();
      if (p) phone = p;
    }
  } catch {
    /* offline */
  }

  const displayName = resolveHumanActorDisplayLabel({
    candidate: firestoreName || candidateName || authUser?.displayName,
    email,
    userId,
  });

  return { displayName, email, phone };
}

/** Create history "Phone" row — Firestore user doc ya Firebase Auth phone. */
async function resolveCreatorPhoneForHistory(userId: string): Promise<string | null> {
  const authPhone = auth.currentUser?.phoneNumber?.trim();
  if (authPhone) return authPhone;
  try {
    const q = query(collection(firestore, "users"), where("uid", "==", userId));
    const snap = await getDocs(q);
    const data = snap.docs[0]?.data() as { phone?: string; mobile?: string } | undefined;
    const p = String(data?.phone || data?.mobile || "").trim();
    return p || null;
  } catch {
    return null;
  }
}

function interCompanyCreateHistoryInput(
  input: SaveInterCompanyPairInput,
  actor: { displayName: string; email: string | null; phone: string | null },
  createdAt: Date
): InterCompanyCreateHistoryInput {
  return {
    addedByUserName: actor.displayName,
    userEmail: actor.email,
    userPhone: actor.phone,
    voucherDate: input.date,
    createdAt,
    fromCompanyName: input.sourceCompanyName || "",
    toCompanyName: input.targetCompanyName || "",
  };
}

export async function saveInterCompanyVoucherPair(
  input: SaveInterCompanyPairInput
): Promise<{ sourceId: string; targetId: string; linkId: string }> {
  // Source approve ke baad / target copy se update — server par band (UI bypass guard)
  if (input.existingSourceVoucherId) {
    await assertInterCompanyPairEditDeleteAllowed(
      input.sourceCompanyId,
      input.existingSourceVoucherId
    );
  }

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

  const ownerId =
    String(sourceCompanyDoc?.ownerId || targetCompanyDoc?.ownerId || input.userId || "").trim() ||
    input.userId;

  const [sourceIcPartyId, targetIcPartyId] = await Promise.all([
    ensureInterCompanyCounterpartyParty({
      companyId: input.sourceCompanyId,
      peerCompanyId: input.targetCompanyId,
      peerCompanyName: input.targetCompanyName || "Company",
      side: "source",
      ownerId,
    }),
    ensureInterCompanyCounterpartyParty({
      companyId: input.targetCompanyId,
      peerCompanyId: input.sourceCompanyId,
      peerCompanyName: input.sourceCompanyName || "Company",
      side: "target",
      ownerId,
    }),
  ]);

  const sourceLegs = buildSourceInterCompanyLegs({
    amount,
    entityKind: input.sourceEntityKind,
    entityId: input.sourceEntityId,
    companyBankAccountId: input.sourceCompanyBankAccountId,
    interCompanyCounterpartyPartyId: sourceIcPartyId,
  });

  const targetLegs = buildTargetInterCompanyLegsPending({
    amount,
    interCompanyCounterpartyPartyId: targetIcPartyId,
  });

  const sourceLink: InterCompanyLinkDoc = {
    linkId,
    role: "source",
    peerCompanyId: input.targetCompanyId,
    peerVoucherId: input.existingTargetVoucherId || "",
  };

  const isCreate = !input.existingSourceVoucherId;
  const historyCreatedAt = new Date();
  // Create history + human userDisplayName — dono companies par (target par alag approval).
  const icHistoryOpts = isCreate
    ? await (async () => {
        const actor = await resolveInterCompanyActorForSave(input.userId, input.approverName);
        const phone = actor.phone ?? (await resolveCreatorPhoneForHistory(input.userId));
        return {
          interCompanyCreateHistory: interCompanyCreateHistoryInput(
            input,
            { ...actor, phone },
            historyCreatedAt
          ),
          // Voucher doc + ledger User column: "Auto" mat — sirf recurring auto-create me
          userDisplayNameOverride: actor.displayName,
          // IC: owner auto-approve band — source Save = unapproved; Save & Approve = baad mein approve
          forceUnapprovedCreate: true,
        };
      })()
    : undefined;

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
    sourceCompanyName: input.sourceCompanyName,
    targetCompanyName: input.targetCompanyName,
    link: sourceLink,
    entityKind: input.sourceEntityKind,
    entityId: input.sourceEntityId,
    fileUrls,
    companyBankAccountId: input.sourceCompanyBankAccountId,
    sourceCompanyBankAccountId: input.sourceCompanyBankAccountId,
    targetCompanyBankAccountId: input.targetCompanyBankAccountId,
    sourceCompanyBankLabel: input.sourceCompanyBankLabel,
    targetCompanyBankLabel: input.targetCompanyBankLabel,
    interCompanyCounterpartyPartyId: sourceIcPartyId,
    interCompanyLegs: sourceLegs,
  });

  const sourceSaved = await saveVoucher(
    input.sourceCompanyId,
    input.userId,
    sourcePayload,
    input.existingSourceVoucherId || null,
    undefined,
    icHistoryOpts
  );

  const targetLink: InterCompanyLinkDoc = {
    linkId,
    role: "target",
    peerCompanyId: input.sourceCompanyId,
    peerVoucherId: sourceSaved.id,
  };

  const targetPayload = {
    ...buildVoucherPayload({
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
      sourceCompanyName: input.sourceCompanyName,
      targetCompanyName: input.targetCompanyName,
      link: targetLink,
      entityKind: input.targetEntityKind,
      entityId: input.targetEntityId,
      fileUrls,
      companyBankAccountId: input.targetCompanyBankAccountId,
      sourceCompanyBankAccountId: input.sourceCompanyBankAccountId,
      targetCompanyBankAccountId: input.targetCompanyBankAccountId,
      sourceCompanyBankLabel: input.sourceCompanyBankLabel,
      targetCompanyBankLabel: input.targetCompanyBankLabel,
      interCompanyCounterpartyPartyId: targetIcPartyId,
      interCompanyLegs: targetLegs,
    }),
    // Target = doosri company ne bheja — hamesha unapproved; source approve tak target ledger me hide
    isApproved: false,
    interCompanySourceApproved: false,
  };

  const targetSaved = await saveVoucher(
    input.targetCompanyId,
    input.userId,
    targetPayload,
    input.existingTargetVoucherId || null,
    undefined,
    isCreate ? icHistoryOpts : undefined
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
  await assertInterCompanyDeleteAllowed(args.sourceCompanyId, args.sourceVoucherId);
  await softDeleteVoucherMoveToRecycleBin(args.sourceCompanyId, args.sourceVoucherId, args.deletedByUid);
  if (args.peerCompanyId && args.peerVoucherId) {
    await softDeleteVoucherMoveToRecycleBin(args.peerCompanyId, args.peerVoucherId, args.deletedByUid);
  }
}
