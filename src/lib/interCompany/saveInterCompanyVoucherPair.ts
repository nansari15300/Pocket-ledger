/**
 * Inter Company — source + target company par linked `inter_company` vouchers save/update.
 */
import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";
import { collection, doc, getDoc, getDocs, query, where, Timestamp } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import {
  isRecurringAutoUserDisplayLabel,
  resolveHumanActorDisplayLabel,
  type InterCompanyCreateHistoryInput,
} from "@/lib/interCompany/interCompanyVoucherHistory";
import { ensureInterCompanyCounterpartyParty } from "@/lib/interCompany/ensureInterCompanyCounterpartyParty";
import {
  ensureInterCompanyMirroredEntity,
  isInterCompanyMirroredEntityKindSupported,
} from "@/lib/interCompany/ensureInterCompanyMirroredEntity";
import {
  buildSourceInterCompanyLegs,
  buildSourceInterCompanyLegsApproved,
  buildTargetInterCompanyLegsApproved,
  buildTargetInterCompanyLegsPending,
} from "@/lib/interCompany/interCompanyPostingLegs";
import { getNextInterCompanyVoucherNumber } from "@/lib/interCompany/nextInterCompanyVoucherNumber";
import {
  purgeInterCompanyCounterpartyPartyIfUnused,
  reconcileUnusedInterCompanyCounterpartyParties,
} from "@/lib/interCompany/cleanupInterCompanyCounterpartyParty";
import { reconcileAndPatchInterCompanyAttachmentSharing } from "@/lib/interCompany/interCompanySharedAttachments";
import { readCompanyInterCompanyCode, ensureCompanyInterCompanyCode } from "@/lib/interCompany/interCompanyCompanyCode";
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
import { getCompanyDocFromBrowserDb, upsertCompanyDocInBrowserDb } from "@/lib/localCompanyDocMirror";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { isFirebaseLedgerDataSyncEnabled } from "@/lib/firebaseLedgerDataSyncDisabled";
import { isFirebaseLedgerCompanyDataSyncEnabled } from "@/lib/firebaseLedgerCompanySyncPrefs";
import {
  canSyncCompanyToServer,
  enqueueVoucherOutbox,
  flushVoucherOutbox,
} from "@/lib/localVoucherOutbox";
import { dispatchVoucherLivePatch } from "@/lib/voucherFormAttachmentSave";
import {
  isLocalToLocalInterCompanyPair,
  isPureLocalInterCompanyCompany,
} from "@/lib/interCompany/localInterCompanyPolicy";
import { coerceVoucherDocumentDate, mergeVoucherCalendarDateWithSaveClock } from "@/lib/voucherDateNormalize";

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
  /** Source voucher — apni taraf ki attachments (own; target box alag) */
  sourceFileUrls?: string[];
  /** Target voucher — apni taraf ki attachments (own; source box alag) */
  targetFileUrls?: string[];
  /** Save/upload ke waqt in-memory blobs — peer copy ke liye dubara read na karna pade */
  sourceAttachmentBlobByRef?: ReadonlyMap<string, Blob>;
  targetAttachmentBlobByRef?: ReadonlyMap<string, Blob>;
  /** ON = source ki attachments bhi target copy par dikhengi */
  shareSourceAttachmentsWithPeer?: boolean;
  /** ON = target ki attachments bhi source copy par dikhengi */
  shareTargetAttachmentsWithSource?: boolean;
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
  /** Is doc ki apni attachments (own side) — peer se share hui copies baad me merge hoti hain */
  ownFileUrls: string[];
  companyBankAccountId: string;
  interCompanyCounterpartyPartyId: string;
  interCompanyLegs: ReturnType<typeof buildSourceInterCompanyLegs>;
  /** Dono copies par — edit par peer fetch ke bina bank hydrate */
  sourceCompanyBankAccountId?: string;
  targetCompanyBankAccountId?: string;
  sourceCompanyBankLabel?: string;
  targetCompanyBankLabel?: string;
  shareSourceAttachmentsWithPeer?: boolean;
  shareTargetAttachmentsWithSource?: boolean;
}): Record<string, unknown> {
  return {
    type: "inter_company",
    voucherNumber: args.voucherNumber,
    date: args.dateIso,
    amount: args.amount,
    total: args.amount,
    narration: args.narration,
    fileUrls: args.ownFileUrls,
    interCompanyOwnFileUrls: args.ownFileUrls,
    interCompanyShareAttachmentsWithPeer: args.shareSourceAttachmentsWithPeer === true,
    interCompanySharePeerAttachmentsToSource: args.shareTargetAttachmentsWithSource === true,
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
  const cid = String(companyId || "").trim();
  if (!cid) return null;
  if (await isPureLocalInterCompanyCompany(cid)) {
    const local = await getLocalCompanyById(cid, { includeDeleted: true });
    return local ? (local as unknown as Record<string, unknown>) : null;
  }
  const snap = await getDoc(doc(firestore, "companies", cid));
  return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
}

async function readInterCompanyVoucherRow(
  companyId: string,
  voucherId: string
): Promise<Record<string, unknown> | null> {
  const cid = String(companyId || "").trim();
  const vid = String(voucherId || "").trim();
  if (!cid || !vid) return null;
  const local = await getCompanyDocFromBrowserDb(cid, "vouchers", vid);
  if (local) return local as Record<string, unknown>;
  if (await isPureLocalInterCompanyCompany(cid)) return null;
  try {
    const snap = await getDoc(doc(firestore, `companies/${cid}/vouchers`, vid));
    return snap.exists()
      ? ({ id: snap.id, ...(snap.data() as Record<string, unknown>) } as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
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
  const isCreate = !input.existingSourceVoucherId;
  const dateForSave = isCreate
    ? mergeVoucherCalendarDateWithSaveClock(input.date)
    : input.date;
  const dateIso = dateForSave.toISOString();
  const amount = Number(input.amount) || 0;
  const sourceOwnFileUrls = input.sourceFileUrls ?? [];
  const targetOwnFileUrls = input.targetFileUrls ?? [];
  const shareSourceAttachmentsWithPeer = input.shareSourceAttachmentsWithPeer === true;
  const shareTargetAttachmentsWithSource = input.shareTargetAttachmentsWithSource === true;

  // Har company ka apna inter_company serial — create par alag number; update par purana rakho
  const [sourceCompanyDoc, targetCompanyDoc] = await Promise.all([
    readCompanyDoc(input.sourceCompanyId),
    readCompanyDoc(input.targetCompanyId),
  ]);

  let sourceVoucherNumber = String(input.voucherNumber || "").trim();
  let targetVoucherNumber = sourceVoucherNumber;
  let existingSourceApproved = false;
  let existingTargetApproved = false;

  if (input.existingSourceVoucherId) {
    const existing = await readInterCompanyVoucherRow(
      input.sourceCompanyId,
      input.existingSourceVoucherId
    );
    if (existing) {
      sourceVoucherNumber = String(existing.voucherNumber || sourceVoucherNumber);
      existingSourceApproved = existing.isApproved === true;
    }
    if (input.existingTargetVoucherId) {
      const existingTarget = await readInterCompanyVoucherRow(
        input.targetCompanyId,
        input.existingTargetVoucherId
      );
      if (existingTarget) {
        targetVoucherNumber = String(existingTarget.voucherNumber || targetVoucherNumber);
        existingTargetApproved = existingTarget.isApproved === true;
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
  // Har IC pair — com-to-com balance ke liye IC · Due from/to party (bank-to-bank par bhi).
  const useIcConduit = true;

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

  // Optional entity (party/staff/tax/expense) — jab select ho to peer company me mirror
  // (naam "IC {code} {full name}"), taaki peer bhi apne ledger me isi entity ko track kar sake.
  try {
    const [sourceCode, targetCode] = await Promise.all([
      readCompanyInterCompanyCode(sourceCompanyDoc as { interCompanyCompanyCode?: string } | null) ||
        ensureCompanyInterCompanyCode(input.sourceCompanyId, input.sourceCompanyName),
      readCompanyInterCompanyCode(targetCompanyDoc as { interCompanyCompanyCode?: string } | null) ||
        ensureCompanyInterCompanyCode(input.targetCompanyId, input.targetCompanyName),
    ]);
    await Promise.all([
      isInterCompanyMirroredEntityKindSupported(input.sourceEntityKind) && sourceEntityId
        ? ensureInterCompanyMirroredEntity({
            peerCompanyId: input.targetCompanyId,
            originCompanyId: input.sourceCompanyId,
            originCompanyCode: sourceCode,
            originEntityId: sourceEntityId,
            entityKind: input.sourceEntityKind,
            entityFullName: input.sourceEntityLabel || "",
            ownerId,
          })
        : Promise.resolve(null),
      isInterCompanyMirroredEntityKindSupported(input.targetEntityKind) && targetEntityId
        ? ensureInterCompanyMirroredEntity({
            peerCompanyId: input.sourceCompanyId,
            originCompanyId: input.targetCompanyId,
            originCompanyCode: targetCode,
            originEntityId: targetEntityId,
            entityKind: input.targetEntityKind,
            entityFullName: input.targetEntityLabel || "",
            ownerId,
          })
        : Promise.resolve(null),
    ]);
  } catch (err) {
    console.warn("[IC] optional entity mirror sync:", err);
  }

  const sourceLegs = existingSourceApproved
    ? buildSourceInterCompanyLegsApproved({
        amount,
        entityKind: input.sourceEntityKind,
        entityId: input.sourceEntityId,
        companyBankAccountId: input.sourceCompanyBankAccountId,
        interCompanyCounterpartyPartyId: sourceIcPartyId,
        useIcConduit,
      })
    : buildSourceInterCompanyLegs({
        amount,
        entityKind: input.sourceEntityKind,
        entityId: input.sourceEntityId,
        companyBankAccountId: input.sourceCompanyBankAccountId,
        interCompanyCounterpartyPartyId: sourceIcPartyId,
        useIcConduit,
      });

  const targetLegs = existingTargetApproved
    ? buildTargetInterCompanyLegsApproved({
        amount,
        entityKind: input.targetEntityKind,
        entityId: input.targetEntityId,
        companyBankAccountId: input.targetCompanyBankAccountId,
        interCompanyCounterpartyPartyId: targetIcPartyId,
        useIcConduit,
      })
    : buildTargetInterCompanyLegsPending({
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

  const localPair = await isLocalToLocalInterCompanyPair(
    input.sourceCompanyId,
    input.targetCompanyId
  );
  const historyCreatedAt = new Date();
  // Create history + human userDisplayName — dono companies par (target par alag approval).
  const icHistoryOpts = isCreate
    ? await (async () => {
        const actor = localPair
          ? {
              displayName: resolveHumanActorDisplayLabel({
                candidate: input.approverName || auth.currentUser?.displayName,
                email: auth.currentUser?.email,
                userId: input.userId,
              }),
              email: auth.currentUser?.email?.trim() || null,
              phone: auth.currentUser?.phoneNumber?.trim() || null,
            }
          : await resolveInterCompanyActorForSave(input.userId, input.approverName);
        const phone =
          actor.phone ?? (localPair ? null : await resolveCreatorPhoneForHistory(input.userId));
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
    ownFileUrls: sourceOwnFileUrls,
    companyBankAccountId: input.sourceCompanyBankAccountId,
    sourceCompanyBankAccountId: input.sourceCompanyBankAccountId,
    targetCompanyBankAccountId: input.targetCompanyBankAccountId,
    sourceCompanyBankLabel: input.sourceCompanyBankLabel,
    targetCompanyBankLabel: input.targetCompanyBankLabel,
    interCompanyCounterpartyPartyId: sourceIcPartyId,
    interCompanyLegs: sourceLegs,
    shareSourceAttachmentsWithPeer,
    shareTargetAttachmentsWithSource,
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
      ownFileUrls: targetOwnFileUrls,
      companyBankAccountId: input.targetCompanyBankAccountId,
      sourceCompanyBankAccountId: input.sourceCompanyBankAccountId,
      targetCompanyBankAccountId: input.targetCompanyBankAccountId,
      sourceCompanyBankLabel: input.sourceCompanyBankLabel,
      targetCompanyBankLabel: input.targetCompanyBankLabel,
      interCompanyCounterpartyPartyId: targetIcPartyId,
      interCompanyLegs: targetLegs,
      shareSourceAttachmentsWithPeer,
      shareTargetAttachmentsWithSource,
    }),
    // Target = incoming copy — unapproved unless already approved (edit recalc)
    ...(existingTargetApproved
      ? {}
      : {
          isApproved: false,
          interCompanySourceApproved: existingSourceApproved || false,
        }),
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
  try {
    const shareResult = await reconcileAndPatchInterCompanyAttachmentSharing({
      sourceCompanyId: input.sourceCompanyId,
      sourceVoucherId: sourceSaved.id,
      sourceOwnFileUrls,
      shareSourceToTarget: shareSourceAttachmentsWithPeer,
      targetCompanyId: input.targetCompanyId,
      targetVoucherId: targetSaved.id,
      targetOwnFileUrls,
      shareTargetToSource: shareTargetAttachmentsWithSource,
      sourceAttachmentBlobByRef: input.sourceAttachmentBlobByRef,
      targetAttachmentBlobByRef: input.targetAttachmentBlobByRef,
    });
    attachmentReplicationWarning = shareResult.attachmentReplicationWarning;
  } catch (err) {
    attachmentReplicationWarning =
      err instanceof Error ? err.message : "Could not sync Inter Company attachments.";
    console.warn("[IC] attachment share reconcile:", err);
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

/** Sirf is company ki IC copy recycle bin — peer copy safe (locked / approved IC). */
export async function deleteInterCompanyVoucherLocalCopyOnly(args: {
  companyId: string;
  voucherId: string;
  deletedByUid: string;
}): Promise<void> {
  const cid = String(args.companyId || "").trim();
  const vid = String(args.voucherId || "").trim();
  if (!cid || !vid) {
    throw new Error("Missing company or voucher");
  }

  let row = (await getCompanyDocFromBrowserDb(cid, "vouchers", vid)) as Record<string, unknown> | null;
  if (!row) {
    row = await readInterCompanyVoucherRow(cid, vid);
  }
  if (!row || String(row.type || "") !== "inter_company") {
    throw new Error("Not an Inter Company voucher");
  }

  const deletedAt = Timestamp.now();
  const payload: Record<string, unknown> = {
    ...row,
    id: vid,
    isDeleted: true,
    deletedAt,
    deletedBy: args.deletedByUid || "",
    updatedAt: deletedAt,
    lastEditedAt: deletedAt,
  };
  coerceVoucherDocumentDate(payload);

  // Hamesha pehle SQLite — Firebase ledger sync off ho to bhi local delete.
  const written = await upsertCompanyDocInBrowserDb(cid, "vouchers", vid, payload, { force: true });
  if (!written) {
    throw new Error("Could not delete in local database (SQLite). Retry or reopen the company.");
  }
  dispatchVoucherLivePatch(cid, vid, payload);

  // Firebase sirf jab ledger data sync ON ho — warna sirf SQLite tombstone.
  if (isFirebaseLedgerDataSyncEnabled() && isFirebaseLedgerCompanyDataSyncEnabled(cid) && (await canSyncCompanyToServer(cid))) {
    await enqueueVoucherOutbox(cid, "update", vid, payload);
    void flushVoucherOutbox().catch((err) => {
      console.warn("[IC] local delete outbox flush:", err);
    });
  }

  const partyId = String(row.interCompanyCounterpartyPartyId || "").trim();
  if (partyId) {
    try {
      await purgeInterCompanyCounterpartyPartyIfUnused({ companyId: cid, partyId });
    } catch (err) {
      console.warn("[IC] counterparty party cleanup (local delete):", err);
    }
  }
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

  const sourceRow = await readInterCompanyVoucherRow(args.sourceCompanyId, args.sourceVoucherId);
  const peerCompanyId = String(args.peerCompanyId || "").trim();
  const peerVoucherId = String(args.peerVoucherId || "").trim();
  const targetRow =
    peerCompanyId && peerVoucherId ? await readInterCompanyVoucherRow(peerCompanyId, peerVoucherId) : null;

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
