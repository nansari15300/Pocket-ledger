"use client";

import { addDoc, collection, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { RECON_PAGE_TITLE, RECON_SHARE_HEADER_LABEL } from "@/lib/reconciliation/labels";

/** Chat message me reconciling page ka path — user copy/open kar sake. */
export function reconciliationPagePath(shareId: string): string {
  return `/reconciliation/${shareId}`;
}

/** 1:1 chat — reconciliation events (request / accept / unlink / request again). */
export async function sendReconciliationChatMessage(params: {
  fromUserId: string;
  toUserId: string;
  text: string;
  companyName?: string;
  shareId?: string;
  kind?:
    | "reconciliation_request"
    | "reconciliation_accepted"
    | "reconciliation_unlinked"
    | "reconciliation_request_again";
}): Promise<void> {
  const toUid = String(params.toUserId || "").trim();
  const fromUid = String(params.fromUserId || "").trim();
  if (!toUid || !fromUid || toUid === fromUid) return;

  const conversationId = [fromUid, toUid].sort().join("_");
  const conversationDocRef = doc(firestore, "conversations", conversationId);
  const messagesCol = collection(firestore, "conversations", conversationId, "messages");

  await setDoc(
    conversationDocRef,
    { participants: [fromUid, toUid], lastMessageTimestamp: serverTimestamp() },
    { merge: true },
  );
  await addDoc(messagesCol, {
    text: params.text.trim(),
    senderId: fromUid,
    receiverId: toUid,
    timestamp: serverTimestamp(),
    company: params.companyName || "Reconciliation",
    status: "sent",
    kind: params.kind || "reconciliation_request",
    shareId: params.shareId || null,
  });
  await updateDoc(conversationDocRef, { lastMessageTimestamp: serverTimestamp() });
}

/** Display name — email se pehle part; UID kabhi UI me mat dikhao. */
export function reconciliationUserLabel(email?: string, _userId?: string): string {
  const em = String(email || "").trim();
  if (em) {
    const local = em.split("@")[0]?.trim();
    return local || em;
  }
  return "A user";
}
