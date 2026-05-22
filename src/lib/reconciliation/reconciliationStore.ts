"use client";

import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { getCompanyDocFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { preferLocalLedgerReads } from "@/lib/apkOnlineFirestoreWritePolicy";
import { buildReconciliationLedgerSnapshot } from "@/lib/reconciliation/ledgerSnapshot";
import type {
  ReconciliationEntityType,
  ReconciliationShare,
  ReconciliationShareScope,
  ReconciliationAccountOption,
} from "@/lib/reconciliation/types";
import { reconciliationEntityCollection, RECON_ENTITY_OPTIONS_UI } from "@/lib/reconciliation/types";
import {
  sendReconciliationShareAlert,
  sendReconciliationAcceptedAlert,
  sendReconciliationRequestAgainAlert,
  sendReconciliationUnlinkedAlert,
} from "@/lib/reconciliation/notifications";

const SHARES = () => collection(firestore, "reconciliation_shares");

/** Company ke saare ledger accounts — share/link dropdown. */
export async function loadReconciliationAccountsForCompany(companyId: string): Promise<ReconciliationAccountOption[]> {
  if (!companyId) return [];
  // Abhi sirf Party accounts load — bank/staff/tax/expense baad me enable karenge
  const all = await Promise.all(
    RECON_ENTITY_OPTIONS_UI.map(async ({ value, collection: col }) => {
      const snap = await getDocs(collection(firestore, `companies/${companyId}/${col}`));
      return snap.docs
        .map((d) => {
          const data = d.data() as { name?: string; accountName?: string; isDeleted?: boolean };
          if (data.isDeleted === true) return null;
          const displayName = (data.name || data.accountName || d.id).trim() || d.id;
          return { id: d.id, name: displayName, entityType: value, collection: col };
        })
        .filter(Boolean) as ReconciliationAccountOption[];
    })
  );
  return all.flat().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export async function resolveUserByIdOrEmail(input: string): Promise<{ uid: string; email?: string } | null> {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const byId = await getDoc(doc(firestore, "users", raw));
  if (byId.exists()) {
    const d = byId.data() as { uid?: string; email?: string };
    return { uid: d.uid || byId.id, email: d.email };
  }
  const q = query(collection(firestore, "users"), where("uid", "==", raw));
  const snap = await getDocs(q);
  if (!snap.empty) {
    const d = snap.docs[0].data() as { uid?: string; email?: string };
    return { uid: d.uid || snap.docs[0].id, email: d.email };
  }
  const qEmail = query(collection(firestore, "users"), where("email", "==", raw));
  const snapEmail = await getDocs(qEmail);
  if (!snapEmail.empty) {
    const d = snapEmail.docs[0].data() as { uid?: string; email?: string };
    return { uid: d.uid || snapEmail.docs[0].id, email: d.email };
  }
  return null;
}

export async function createReconciliationShare(params: {
  senderUserId: string;
  senderUserEmail?: string;
  senderCompanyId: string;
  senderCompanyName: string;
  senderEntityType: ReconciliationEntityType;
  senderAccountId: string;
  senderAccountName: string;
  shareScope: ReconciliationShareScope;
  dateFrom?: string | null;
  dateTo?: string | null;
  targetUserId: string;
  targetUserEmail?: string;
}): Promise<string> {
  const senderCollection = reconciliationEntityCollection(params.senderEntityType);
  const snapshot = await buildReconciliationLedgerSnapshot({
    companyId: params.senderCompanyId,
    accountId: params.senderAccountId,
    collection: senderCollection,
    shareScope: params.shareScope,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
  const ref = await addDoc(SHARES(), {
    ...params,
    senderCollection,
    status: "pending",
    senderLedgerSnapshot: snapshot.rows,
    senderOpeningBalance: snapshot.openingBalance,
    senderSnapshotAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await sendReconciliationShareAlert({
    shareId: ref.id,
    recipientUserId: params.targetUserId,
    senderUserId: params.senderUserId,
    senderCompanyId: params.senderCompanyId,
    senderCompanyName: params.senderCompanyName,
    senderAccountName: params.senderAccountName,
    senderUserEmail: params.senderUserEmail,
  });
  return ref.id;
}

export async function linkReconciliationShare(params: {
  shareId: string;
  receiverUserId: string;
  receiverUserEmail?: string;
  receiverCompanyId: string;
  receiverCompanyName: string;
  receiverEntityType: ReconciliationEntityType;
  receiverAccountId: string;
  receiverAccountName: string;
}): Promise<void> {
  const shareRef = doc(firestore, "reconciliation_shares", params.shareId);
  const shareSnap = await getDoc(shareRef);
  if (!shareSnap.exists()) throw new Error("Share not found");
  const share = shareSnap.data() as ReconciliationShare;
  const receiverCollection = reconciliationEntityCollection(params.receiverEntityType);
  const snapshot = await buildReconciliationLedgerSnapshot({
    companyId: params.receiverCompanyId,
    accountId: params.receiverAccountId,
    collection: receiverCollection,
    shareScope: share.shareScope,
    dateFrom: share.dateFrom,
    dateTo: share.dateTo,
  });
  await updateDoc(shareRef, {
    status: "linked",
    receiverUserId: params.receiverUserId,
    receiverCompanyId: params.receiverCompanyId,
    receiverCompanyName: params.receiverCompanyName,
    receiverEntityType: params.receiverEntityType,
    receiverAccountId: params.receiverAccountId,
    receiverAccountName: params.receiverAccountName,
    receiverCollection,
    receiverLedgerSnapshot: snapshot.rows,
    receiverOpeningBalance: snapshot.openingBalance,
    receiverSnapshotAt: serverTimestamp(),
    linkedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await sendReconciliationAcceptedAlert({
    shareId: params.shareId,
    senderUserId: share.senderUserId,
    receiverUserId: params.receiverUserId,
    receiverUserEmail: params.receiverUserEmail,
    receiverCompanyId: params.receiverCompanyId,
    receiverCompanyName: params.receiverCompanyName,
    receiverAccountName: params.receiverAccountName,
  });
}

/** Linked share par galat company/account — receiver apni side dubara link kare */
export async function changeLinkedReconciliationShare(params: {
  shareId: string;
  receiverUserId: string;
  receiverCompanyId: string;
  receiverCompanyName: string;
  receiverEntityType: ReconciliationEntityType;
  receiverAccountId: string;
  receiverAccountName: string;
}): Promise<void> {
  const shareRef = doc(firestore, "reconciliation_shares", params.shareId);
  const shareSnap = await getDoc(shareRef);
  if (!shareSnap.exists()) throw new Error("Share not found");
  const share = shareSnap.data() as ReconciliationShare;
  if (share.status !== "linked") throw new Error("Share is not linked yet");
  const isReceiver =
    share.receiverUserId === params.receiverUserId || share.targetUserId === params.receiverUserId;
  if (!isReceiver) throw new Error("Only the linked user can change company");

  const receiverCollection = reconciliationEntityCollection(params.receiverEntityType);
  const sameAsBefore =
    share.receiverCompanyId === params.receiverCompanyId &&
    share.receiverAccountId === params.receiverAccountId &&
    share.receiverEntityType === params.receiverEntityType;
  if (sameAsBefore) throw new Error("Select a different company or account");

  const snapshot = await buildReconciliationLedgerSnapshot({
    companyId: params.receiverCompanyId,
    accountId: params.receiverAccountId,
    collection: receiverCollection,
    shareScope: share.shareScope,
    dateFrom: share.dateFrom,
    dateTo: share.dateTo,
  });

  await updateDoc(shareRef, {
    receiverUserId: params.receiverUserId,
    receiverCompanyId: params.receiverCompanyId,
    receiverCompanyName: params.receiverCompanyName,
    receiverEntityType: params.receiverEntityType,
    receiverAccountId: params.receiverAccountId,
    receiverAccountName: params.receiverAccountName,
    receiverCollection,
    receiverLedgerSnapshot: snapshot.rows,
    receiverOpeningBalance: snapshot.openingBalance,
    receiverSnapshotAt: serverTimestamp(),
    rowComments: deleteField(), // naya ledger — purane row id comments invalid
    updatedAt: serverTimestamp(),
  });
}

/** Linked share par sender apni company/account badle — receiver side same rehti hai. */
export async function changeSenderLinkedReconciliationShare(params: {
  shareId: string;
  senderUserId: string;
  senderCompanyId: string;
  senderCompanyName: string;
  senderEntityType: ReconciliationEntityType;
  senderAccountId: string;
  senderAccountName: string;
}): Promise<void> {
  const shareRef = doc(firestore, "reconciliation_shares", params.shareId);
  const shareSnap = await getDoc(shareRef);
  if (!shareSnap.exists()) throw new Error("Share not found");
  const share = shareSnap.data() as ReconciliationShare;
  if (share.status !== "linked") throw new Error("Share is not linked yet");
  if (share.senderUserId !== params.senderUserId) throw new Error("Only the sender can change their side");

  const senderCollection = reconciliationEntityCollection(params.senderEntityType);
  const sameAsBefore =
    share.senderCompanyId === params.senderCompanyId &&
    share.senderAccountId === params.senderAccountId &&
    share.senderEntityType === params.senderEntityType;
  if (sameAsBefore) throw new Error("Select a different company or account");

  const snapshot = await buildReconciliationLedgerSnapshot({
    companyId: params.senderCompanyId,
    accountId: params.senderAccountId,
    collection: senderCollection,
    shareScope: share.shareScope,
    dateFrom: share.dateFrom,
    dateTo: share.dateTo,
  });

  await updateDoc(shareRef, {
    senderCompanyId: params.senderCompanyId,
    senderCompanyName: params.senderCompanyName,
    senderEntityType: params.senderEntityType,
    senderAccountId: params.senderAccountId,
    senderAccountName: params.senderAccountName,
    senderCollection,
    senderLedgerSnapshot: snapshot.rows,
    senderOpeningBalance: snapshot.openingBalance,
    senderSnapshotAt: serverTimestamp(),
    rowComments: deleteField(),
    updatedAt: serverTimestamp(),
  });
}

/** Koi bhi participant apni linked side hata de — share revoked, history fields rehti hain. */
export async function unlinkReconciliationShare(params: {
  shareId: string;
  userId: string;
  userEmail?: string;
}): Promise<void> {
  const shareRef = doc(firestore, "reconciliation_shares", params.shareId);
  const shareSnap = await getDoc(shareRef);
  if (!shareSnap.exists()) throw new Error("Share not found");
  const share = { id: shareSnap.id, ...shareSnap.data() } as ReconciliationShare;
  if (share.status !== "linked") throw new Error("Share is not linked");
  const isParticipant =
    share.senderUserId === params.userId ||
    share.receiverUserId === params.userId ||
    share.targetUserId === params.userId;
  if (!isParticipant) throw new Error("Only a linked participant can unlink");

  const iAmSender = share.senderUserId === params.userId;
  const actorCompanyName = iAmSender ? share.senderCompanyName : share.receiverCompanyName || "—";
  const actorAccountName = iAmSender ? share.senderAccountName : share.receiverAccountName || "—";
  const otherCompanyName = iAmSender ? share.receiverCompanyName || "—" : share.senderCompanyName;
  const otherAccountName = iAmSender ? share.receiverAccountName || "—" : share.senderAccountName;
  const otherUserId = iAmSender
    ? share.receiverUserId || share.targetUserId
    : share.senderUserId;

  await updateDoc(shareRef, {
    status: "revoked",
    unlinkedByUserId: params.userId,
    unlinkedByUserEmail: params.userEmail || deleteField(),
    unlinkedAt: serverTimestamp(),
    rowComments: deleteField(),
    updatedAt: serverTimestamp(),
  });

  if (otherUserId && otherUserId !== params.userId) {
    await sendReconciliationUnlinkedAlert({
      shareId: params.shareId,
      recipientUserId: otherUserId,
      actorUserId: params.userId,
      actorUserEmail: params.userEmail,
      actorCompanyName: actorCompanyName || "—",
      actorAccountName: actorAccountName || "—",
      otherCompanyName: otherCompanyName || "—",
      otherAccountName: otherAccountName || "—",
      companyIdForAlert: iAmSender ? share.senderCompanyId : share.receiverCompanyId || share.senderCompanyId,
    });
  }
}

/** Revoked share dubara pending — receiver fields clear, target ko request again alert/chat. */
export async function requestReconciliationShareAgain(params: {
  shareId: string;
  userId: string;
  userEmail?: string;
}): Promise<void> {
  const shareRef = doc(firestore, "reconciliation_shares", params.shareId);
  const shareSnap = await getDoc(shareRef);
  if (!shareSnap.exists()) throw new Error("Share not found");
  const share = { id: shareSnap.id, ...shareSnap.data() } as ReconciliationShare;
  if (share.status !== "revoked") throw new Error("Share is not unlinked");
  const isParticipant =
    share.senderUserId === params.userId ||
    share.receiverUserId === params.userId ||
    share.targetUserId === params.userId;
  if (!isParticipant) throw new Error("Only a participant can request again");

  const iAmSender = share.senderUserId === params.userId;
  // Sender hi apni company ka ledger refresh kar sakta hai — receiver ke paas permission nahi hoti
  const updatePayload: Record<string, unknown> = {
    status: "pending",
    receiverUserId: deleteField(),
    receiverCompanyId: deleteField(),
    receiverCompanyName: deleteField(),
    receiverEntityType: deleteField(),
    receiverAccountId: deleteField(),
    receiverAccountName: deleteField(),
    receiverCollection: deleteField(),
    receiverLedgerSnapshot: deleteField(),
    receiverOpeningBalance: deleteField(),
    receiverSnapshotAt: deleteField(),
    linkedAt: deleteField(),
    unlinkedByUserId: deleteField(),
    unlinkedByUserEmail: deleteField(),
    unlinkedAt: deleteField(),
    rowComments: deleteField(),
    updatedAt: serverTimestamp(),
  };

  if (iAmSender) {
    const snapshot = await buildReconciliationLedgerSnapshot({
      companyId: share.senderCompanyId,
      accountId: share.senderAccountId,
      collection: share.senderCollection,
      shareScope: share.shareScope,
      dateFrom: share.dateFrom,
      dateTo: share.dateTo,
    });
    updatePayload.senderLedgerSnapshot = snapshot.rows;
    updatePayload.senderOpeningBalance = snapshot.openingBalance;
    updatePayload.senderSnapshotAt = serverTimestamp();
  }

  await updateDoc(shareRef, updatePayload);

  const recipientUserId =
    params.userId === share.senderUserId
      ? share.targetUserId
      : share.senderUserId;

  await sendReconciliationRequestAgainAlert({
    shareId: params.shareId,
    recipientUserId,
    actorUserId: params.userId,
    actorUserEmail: params.userEmail,
    senderCompanyId: share.senderCompanyId,
    senderCompanyName: share.senderCompanyName,
    senderAccountName: share.senderAccountName,
  });
}

export async function refreshReconciliationSideSnapshot(params: {
  shareId: string;
  side: "sender" | "receiver";
}): Promise<void> {
  const shareRef = doc(firestore, "reconciliation_shares", params.shareId);
  const shareSnap = await getDoc(shareRef);
  if (!shareSnap.exists()) throw new Error("Share not found");
  const share = { id: shareSnap.id, ...shareSnap.data() } as ReconciliationShare;
  if (params.side === "sender") {
    const snapshot = await buildReconciliationLedgerSnapshot({
      companyId: share.senderCompanyId,
      accountId: share.senderAccountId,
      collection: share.senderCollection,
      shareScope: share.shareScope,
      dateFrom: share.dateFrom,
      dateTo: share.dateTo,
    });
    await updateDoc(shareRef, {
      senderLedgerSnapshot: snapshot.rows,
      senderOpeningBalance: snapshot.openingBalance,
      senderSnapshotAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    if (!share.receiverCompanyId || !share.receiverAccountId) throw new Error("Receiver not linked");
    const snapshot = await buildReconciliationLedgerSnapshot({
      companyId: share.receiverCompanyId,
      accountId: share.receiverAccountId,
      collection: share.receiverCollection || reconciliationEntityCollection(share.receiverEntityType || "party"),
      shareScope: share.shareScope,
      dateFrom: share.dateFrom,
      dateTo: share.dateTo,
    });
    await updateDoc(shareRef, {
      receiverLedgerSnapshot: snapshot.rows,
      receiverOpeningBalance: snapshot.openingBalance,
      receiverSnapshotAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function getReconciliationShare(shareId: string): Promise<ReconciliationShare | null> {
  const snap = await getDoc(doc(firestore, "reconciliation_shares", shareId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as ReconciliationShare;
}

export function subscribeReconciliationSharesForUser(
  userId: string,
  onData: (shares: ReconciliationShare[]) => void
): Unsubscribe {
  if (!userId) {
    onData([]);
    return () => {};
  }
  const sentQ = query(SHARES(), where("senderUserId", "==", userId));
  const recvQ = query(SHARES(), where("targetUserId", "==", userId));
  const linkedRecvQ = query(SHARES(), where("receiverUserId", "==", userId));
  let sent: ReconciliationShare[] = [];
  let recv: ReconciliationShare[] = [];
  let linkedRecv: ReconciliationShare[] = [];
  const emit = () => {
    const map = new Map<string, ReconciliationShare>();
    [...sent, ...recv, ...linkedRecv].forEach((s) => map.set(s.id, s));
    onData(Array.from(map.values()).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
  };
  const onListenError = (label: string) => (err: unknown) => {
    console.warn(`[reconciliation_shares] ${label} listener:`, err);
    if (label === "sent") sent = [];
    if (label === "target") recv = [];
    if (label === "receiver") linkedRecv = [];
    emit();
  };
  const u1 = onSnapshot(
    sentQ,
    (snap) => {
      sent = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ReconciliationShare);
      emit();
    },
    onListenError("sent")
  );
  const u2 = onSnapshot(
    recvQ,
    (snap) => {
      recv = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ReconciliationShare);
      emit();
    },
    onListenError("target")
  );
  const u3 = onSnapshot(
    linkedRecvQ,
    (snap) => {
      linkedRecv = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ReconciliationShare);
      emit();
    },
    onListenError("receiver")
  );
  return () => {
    u1();
    u2();
    u3();
  };
}

/** Linked share jahan current company + account involved ho — user-scoped listen (broad status query rules todti hai). */
export function subscribeLinkedSharesForAccount(
  companyId: string,
  accountId: string,
  userId: string,
  onData: (shares: ReconciliationShare[]) => void
): Unsubscribe {
  if (!companyId || !accountId || !userId) {
    onData([]);
    return () => {};
  }
  return subscribeReconciliationSharesForUser(userId, (all) => {
    onData(
      all.filter(
        (s) =>
          s.status === "linked" &&
          ((s.senderCompanyId === companyId && s.senderAccountId === accountId) ||
            (s.receiverCompanyId === companyId && s.receiverAccountId === accountId))
      )
    );
  });
}

/** Right table (remote snapshot) ke comments kis map me — viewer ke hisaab se. */
export function remoteReconciliationCommentSide(share: ReconciliationShare, userId: string): "sender" | "receiver" {
  if (share.senderUserId === userId) return "receiver";
  return "sender";
}

/** Left (You) table: dusre user ne meri row par jo comment likha — us map ka side. */
export function otherPartyCommentsOnMyRowsSide(share: ReconciliationShare, userId: string): "sender" | "receiver" {
  if (share.senderUserId === userId) return "sender";
  return "receiver";
}

/** Reconciling remote row comment save — Firestore share doc `rowComments`. */
export async function saveReconciliationRowComment(params: {
  shareId: string;
  side: "sender" | "receiver";
  rowId: string;
  comment: string;
}): Promise<void> {
  const trimmed = String(params.comment || "").trim();
  const shareRef = doc(firestore, "reconciliation_shares", params.shareId);
  await updateDoc(shareRef, {
    [`rowComments.${params.side}.${params.rowId}`]: trimmed ? trimmed : deleteField(),
    updatedAt: serverTimestamp(),
  });
}

/** You-side double-click edit — Firestore + SQLite mirror (APK/local) dono try karo */
export async function fetchVoucherForReconciliationEdit(
  companyId: string,
  voucherId: string
): Promise<Record<string, unknown> | null> {
  if (!companyId || !voucherId) return null;

  // Offline / SQLite-first companies — pehle local mirror
  if (preferLocalLedgerReads()) {
    const localFirst = await getCompanyDocFromBrowserDb(companyId, "vouchers", voucherId);
    if (localFirst) return { ...localFirst, id: voucherId } as Record<string, unknown>;
  }

  try {
    const snap = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, voucherId));
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as Record<string, unknown>;
    }
  } catch {
    /* offline / permission — local fallback niche */
  }

  // Firestore miss → SQLite / browser DB (APK par aksar yahi hota hai)
  const local = await getCompanyDocFromBrowserDb(companyId, "vouchers", voucherId);
  if (local) return { ...local, id: voucherId } as Record<string, unknown>;

  return null;
}
