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
  buildSourceInterCompanyLegsApproved,
  buildTargetInterCompanyLegsPending,
  interCompanyPairUsesConduitParty,
} from "@/lib/interCompany/interCompanyPostingLegs";
import { getNextInterCompanyVoucherNumber } from "@/lib/interCompany/nextInterCompanyVoucherNumber";
import {
  purgeInterCompanyCounterpartyPartyIfUnused,
  reconcileUnusedInterCompanyCounterpartyParties,
} from "@/lib/interCompany/cleanupInterCompanyCounterpartyParty";
import { linkFirebaseAttachmentRefs } from "@/lib/companyAttachmentRegistry";
import { resolveInterCompanyPeerAttachmentUrls } from "@/lib/interCompany/interCompanySharedAttachments";
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
import { getCompanyDocFromBrowserDb } from "@/lib/localCompanyDocMirror";

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
  /** Source voucher attachments */
  fileUrls?: string[];
  /** Save/upload ke waqt in-memory blobs — peer copy ke liye dubara read na karna pade */
  attachmentBlobByRef?: ReadonlyMap<string, Blob>;
  /** ON = target copy par bhi same fileUrls save */
  shareAttachmentsWithPeer?: boolean;
};

export type SaveInterCompanyPairResult = {
  sourceId: string;
  targetId: string;
  linkId: string;
  /** Voucher save OK; sirf target par apni copy attach nahi hui */
  attachmentReplicationWarning?: string;
};

function entityPayeeFields(kind: InterCompanyEntityKind, entityId: string): Record<string, string> {
  const id = String(entityId || "").trim();
  if (!id) return {};
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
  shareAttachmentsWithPeer?: boolean;
}): Record<string, unknown> {
  return {
    type: "inter_company",
    voucherNumber: args.voucherNumber,
    date: args.dateIso,
    amount: args.amount,
    total: args.amount,
    narration: args.narration,
    fileUrls: args.fileUrls,
    interCompanyShareAttachmentsWithPeer: args.shareAttachmentsWithPeer === true,
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
    interCompanyCounterpartyPartyId: args.interCompanyCounterpartyPartyId || null,
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
): Promise<SaveInterCompanyPairResult> {
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
  const shareAttachmentsWithPeer = input.shareAttachmentsWithPeer === true;

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

  const sourceEntityId = String(input.sourceEntityId || "").trim();
  const targetEntityId = String(input.targetEntityId || "").trim();
  const useIcConduit = interCompanyPairUsesConduitParty({
    sourceEntityKind: input.sourceEntityKind,
    sourceEntityId: input.sourceEntityId,
    targetEntityKind: input.targetEntityKind,
    targetEntityId: input.targetEntityId,
  });

  const [sourceIcPartyId, targetIcPartyId] = useIcConduit
    ? await Promise.all([
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
      ])
    : ["", ""];

  const sourceLegs = buildSourceInterCompanyLegs({
    amount,
    entityKind: input.sourceEntityKind,
    entityId: input.sourceEntityId,
    companyBankAccountId: input.sourceCompanyBankAccountId,
    interCompanyCounterpartyPartyId: sourceIcPartyId,
    useIcConduit,
  });

  const targetLegs = buildTargetInterCompanyLegsPending({
    amount,
    entityKind: input.targetEntityKind,
    entityId: input.targetEntityId,
    companyBankAccountId: input.targetCompanyBankAccountId,
    interCompanyCounterpartyPartyId: targetIcPartyId,
    useIcConduit,
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
    shareAttachmentsWithPeer: shareAttachmentsWithPeer,
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
      fileUrls: [],
      companyBankAccountId: input.targetCompanyBankAccountId,
      sourceCompanyBankAccountId: input.sourceCompanyBankAccountId,
      targetCompanyBankAccountId: input.targetCompanyBankAccountId,
      sourceCompanyBankLabel: input.sourceCompanyBankLabel,
      targetCompanyBankLabel: input.targetCompanyBankLabel,
      interCompanyCounterpartyPartyId: targetIcPartyId,
      interCompanyLegs: targetLegs,
      shareAttachmentsWithPeer: shareAttachmentsWithPeer,
    }),
    // Target = incoming copy — unapproved; source approve ke baad target par dikhega
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

  let attachmentReplicationWarning: string | undefined;
  if (shareAttachmentsWithPeer && fileUrls.length > 0) {
    try {
      const peerFileUrls = await resolveInterCompanyPeerAttachmentUrls({
        targetCompanyId: input.targetCompanyId,
        sourceFileUrls: fileUrls,
        targetVoucherId: targetSaved.id,
        attachmentBlobByRef: input.attachmentBlobByRef,
      });
      if (peerFileUrls.length > 0) {
        const linkedSameUrls =
          peerFileUrls.length === fileUrls.length &&
          peerFileUrls.every((u, i) => u.trim() === fileUrls[i]!.trim());
        if (linkedSameUrls) {
          await linkFirebaseAttachmentRefs(input.targetCompanyId, peerFileUrls);
        }
        await patchVoucherFields(input.targetCompanyId, targetSaved.id, { fileUrls: peerFileUrls });
      }
    } catch (err) {
      attachmentReplicationWarning =
        err instanceof Error
          ? err.message
          : "Could not copy attachment for the other company's own storage.";
      console.warn("[IC] peer attachment replication:", err);
    }
  } else if (input.existingTargetVoucherId) {
    await patchVoucherFields(input.targetCompanyId, targetSaved.id, { fileUrls: [] });
  }

  await patchVoucherFields(input.sourceCompanyId, sourceSaved.id, {
    interCompanyLink: { ...sourceLink, peerVoucherId: targetSaved.id },
  });

  if (input.approveSourceAfterSave) {
    const approverName = String(input.approverName || input.userId || "").trim() || input.userId;
    await approveVoucherWithHistory(
      input.sourceCompanyId,
      sourceSaved.id,
      input.userId,
      approverName
    );
    const approvedLegs = buildSourceInterCompanyLegsApproved({
      amount,
      entityKind: input.sourceEntityKind,
      entityId: input.sourceEntityId,
      companyBankAccountId: input.sourceCompanyBankAccountId,
      interCompanyCounterpartyPartyId: sourceIcPartyId,
      useIcConduit,
    });
    if (approvedLegs.length > 0) {
      await patchVoucherFields(input.sourceCompanyId, sourceSaved.id, {
        interCompanyLegs: approvedLegs,
      });
    }
    try {
      await patchVoucherFields(input.targetCompanyId, targetSaved.id, {
        interCompanySourceApproved: true,
      });
    } catch (err) {
      console.warn("[IC] target interCompanySourceApproved sync:", err);
    }
  }

  try {
    await reconcileUnusedInterCompanyCounterpartyParties({
      companyId: input.sourceCompanyId,
      deletedByUid: input.userId,
    });
    await reconcileUnusedInterCompanyCounterpartyParties({
      companyId: input.targetCompanyId,
      deletedByUid: input.userId,
    });
  } catch (err) {
    console.warn("[IC] post-save counterparty party reconcile:", err);
  }

  return {
    sourceId: sourceSaved.id,
    targetId: targetSaved.id,
    linkId,
    ...(attachmentReplicationWarning ? { attachmentReplicationWarning } : {}),
  };
}

/** Locked view — sirf share tick update (source side); edit lock bypass. */
export async function patchInterCompanyShareAttachmentsWithPeer(args: {
  sourceCompanyId: string;
  sourceVoucherId: string;
  targetCompanyId: string;
  targetVoucherId: string;
  shareAttachmentsWithPeer: boolean;
  sourceFileUrls: string[];
  attachmentBlobByRef?: ReadonlyMap<string, Blob>;
}): Promise<{ attachmentReplicationWarning?: string }> {
  const sourceCompanyId = String(args.sourceCompanyId || "").trim();
  const sourceVoucherId = String(args.sourceVoucherId || "").trim();
  const targetCompanyId = String(args.targetCompanyId || "").trim();
  const targetVoucherId = String(args.targetVoucherId || "").trim();
  if (!sourceCompanyId || !sourceVoucherId || !targetCompanyId || !targetVoucherId) {
    throw new Error("Linked Inter Company voucher not found.");
  }

  const share = args.shareAttachmentsWithPeer === true;
  const sourceFileUrls = (args.sourceFileUrls || []).filter(
    (u): u is string => typeof u === "string" && u.trim().length > 0
  );

  await patchVoucherFields(sourceCompanyId, sourceVoucherId, {
    interCompanyShareAttachmentsWithPeer: share,
  });

  if (share && sourceFileUrls.length > 0) {
    try {
      const peerFileUrls = await resolveInterCompanyPeerAttachmentUrls({
        targetCompanyId,
        sourceFileUrls,
        targetVoucherId,
        attachmentBlobByRef: args.attachmentBlobByRef,
      });
      await patchVoucherFields(targetCompanyId, targetVoucherId, {
        fileUrls: peerFileUrls.length > 0 ? peerFileUrls : [],
      });
      const linkedSameUrls =
        peerFileUrls.length > 0 &&
        peerFileUrls.length === sourceFileUrls.length &&
        peerFileUrls.every((u, i) => u.trim() === sourceFileUrls[i]!.trim());
      if (linkedSameUrls) {
        await linkFirebaseAttachmentRefs(targetCompanyId, peerFileUrls);
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not copy attachment for the other company's own storage.";
      console.warn("[IC] peer attachment replication (share patch):", err);
      return { attachmentReplicationWarning: message };
    }
  } else {
    await patchVoucherFields(targetCompanyId, targetVoucherId, { fileUrls: [] });
  }
  return {};
}

/** Source + linked target dono recycle bin. */
export async function deleteInterCompanyVoucherPair(args: {
  sourceCompanyId: string;
  sourceVoucherId: string;
  peerCompanyId?: string | null;
  peerVoucherId?: string | null;
  deletedByUid: string;
  /** Delete request accept — source approve ke baad bhi dono side recycle bin */
  mutualConfirmDelete?: boolean;
}): Promise<void> {
  if (!args.mutualConfirmDelete) {
    await assertInterCompanyDeleteAllowed(args.sourceCompanyId, args.sourceVoucherId);
  }

  const readVoucherRow = async (
    companyId: string,
    voucherId: string
  ): Promise<Record<string, unknown> | null> => {
    const cid = String(companyId || "").trim();
    const vid = String(voucherId || "").trim();
    if (!cid || !vid) return null;
    const local = await getCompanyDocFromBrowserDb(cid, "vouchers", vid);
    if (local) return local;
    try {
      const snap = await getDoc(doc(firestore, `companies/${cid}/vouchers`, vid));
      return snap.exists()
        ? ({ id: snap.id, ...(snap.data() as Record<string, unknown>) } as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };

  const sourceRow = await readVoucherRow(args.sourceCompanyId, args.sourceVoucherId);
  const peerCompanyId = String(args.peerCompanyId || "").trim();
  const peerVoucherId = String(args.peerVoucherId || "").trim();
  const targetRow =
    peerCompanyId && peerVoucherId ? await readVoucherRow(peerCompanyId, peerVoucherId) : null;

  await softDeleteVoucherMoveToRecycleBin(args.sourceCompanyId, args.sourceVoucherId, args.deletedByUid);
  if (peerCompanyId && peerVoucherId) {
    await softDeleteVoucherMoveToRecycleBin(peerCompanyId, peerVoucherId, args.deletedByUid);
  }

  const cleanupTargets: Array<{ companyId: string; partyId: string }> = [];
  const sourcePartyId = String(sourceRow?.interCompanyCounterpartyPartyId || "").trim();
  if (sourcePartyId) cleanupTargets.push({ companyId: args.sourceCompanyId, partyId: sourcePartyId });
  const targetPartyId = String(targetRow?.interCompanyCounterpartyPartyId || "").trim();
  if (targetPartyId && peerCompanyId) cleanupTargets.push({ companyId: peerCompanyId, partyId: targetPartyId });

  for (const target of cleanupTargets) {
    try {
      await purgeInterCompanyCounterpartyPartyIfUnused({
        companyId: target.companyId,
        partyId: target.partyId,
      });
    } catch (err) {
      console.warn("[IC] counterparty party cleanup:", err);
    }
  }
}
