/**
 * Sirf `writeGateway/**` + `localVoucherOutbox` yahan se Firestore mutation APIs import karein —
 * ESLint `no-restricted-imports` baaki `src/lib` (aur baad mein UI) me direct `firebase/firestore` mutation import rokta hai.
 */

import {
  addDoc as firestoreAddDoc,
  collection,
  deleteDoc as firestoreDeleteDoc,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc as firestoreSetDoc,
  updateDoc as firestoreUpdateDoc,
  writeBatch,
  type CollectionReference,
  type DocumentReference,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";

export { collection, doc, runTransaction, serverTimestamp, writeBatch };

type LedgerDocPath = {
  fsCompanyId: string;
  collectionName: string;
  docId: string;
};

function parseLedgerDocPath(ref: unknown): LedgerDocPath | null {
  const path = String((ref as { path?: unknown } | null)?.path || "").trim();
  if (!path) return null;
  const parts = path.split("/").filter(Boolean);
  if (parts.length !== 4) return null;
  if (parts[0] !== "companies") return null;
  const [, fsCompanyId, collectionName, docId] = parts;
  if (!fsCompanyId || !collectionName || !docId || collectionName.startsWith("_")) return null;
  return { fsCompanyId, collectionName, docId };
}

function parseLedgerCollectionPath(ref: unknown): { fsCompanyId: string; collectionName: string } | null {
  const path = String((ref as { path?: unknown } | null)?.path || "").trim();
  if (!path) return null;
  const parts = path.split("/").filter(Boolean);
  if (parts.length !== 3) return null;
  if (parts[0] !== "companies") return null;
  const [, fsCompanyId, collectionName] = parts;
  if (!fsCompanyId || !collectionName || collectionName.startsWith("_")) return null;
  return { fsCompanyId, collectionName };
}

function scheduleLedgerChangeLog(ref: unknown, op: "create" | "update" | "delete"): void {
  const parsed = parseLedgerDocPath(ref);
  if (!parsed) return;
  const safe = `${Date.now()}_${parsed.collectionName}_${parsed.docId}_${Math.random()
    .toString(36)
    .slice(2, 8)}`
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 180);
  const changeRef = doc(firestore, `companies/${parsed.fsCompanyId}/_pl_change_log`, safe);
  void firestoreSetDoc(changeRef, {
    collectionName: parsed.collectionName,
    docId: parsed.docId,
    op,
    at: serverTimestamp(),
    source: "firestoreMutationsInternal",
  }).catch(() => {
    /* change feed is best-effort; target write already succeeded */
  });
}

export const setDoc: typeof firestoreSetDoc = (async (...args: unknown[]) => {
  const result = await (firestoreSetDoc as (...inner: unknown[]) => Promise<void>)(...args);
  scheduleLedgerChangeLog(args[0], "update");
  return result;
}) as typeof firestoreSetDoc;

export const updateDoc: typeof firestoreUpdateDoc = (async (...args: unknown[]) => {
  const result = await (firestoreUpdateDoc as (...inner: unknown[]) => Promise<void>)(...args);
  scheduleLedgerChangeLog(args[0], "update");
  return result;
}) as typeof firestoreUpdateDoc;

export const deleteDoc: typeof firestoreDeleteDoc = (async (...args: unknown[]) => {
  const result = await (firestoreDeleteDoc as (...inner: unknown[]) => Promise<void>)(...args);
  scheduleLedgerChangeLog(args[0], "delete");
  return result;
}) as typeof firestoreDeleteDoc;

export const addDoc: typeof firestoreAddDoc = (async (...args: unknown[]) => {
  const result = await (firestoreAddDoc as (...inner: unknown[]) => Promise<DocumentReference>)(...args);
  const parsed = parseLedgerCollectionPath(args[0]);
  if (parsed && result?.id) {
    scheduleLedgerChangeLog(doc(firestore, `companies/${parsed.fsCompanyId}/${parsed.collectionName}`, result.id), "create");
  }
  return result;
}) as typeof firestoreAddDoc;

export type { CollectionReference, DocumentReference };
