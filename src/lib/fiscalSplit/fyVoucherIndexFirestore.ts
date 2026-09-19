"use client";

import { doc, getDoc, setDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import {
  normalizeFyVoucherIndex,
  type FyVoucherIndex,
} from "@/lib/fiscalSplit/fyVoucherIndexTypes";

export function fyVoucherIndexDocPath(fsCompanyId: string): string {
  return `companies/${fsCompanyId}/meta/fyVoucherIndex`;
}

/** Single Firestore doc — fiscal split page = 1 read (not N voucher reads). */
export async function readFyVoucherIndexFromFirestore(
  fsCompanyId: string
): Promise<FyVoucherIndex | null> {
  if (!fsCompanyId || typeof window === "undefined") return null;
  try {
    const ref = doc(firestore, fyVoucherIndexDocPath(fsCompanyId));
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return normalizeFyVoucherIndex(snap.data());
  } catch (err) {
    console.warn("[readFyVoucherIndexFromFirestore]", err);
    return null;
  }
}

export async function writeFyVoucherIndexToFirestore(
  fsCompanyId: string,
  index: FyVoucherIndex
): Promise<void> {
  if (!fsCompanyId || typeof window === "undefined") return;
  const ref = doc(firestore, fyVoucherIndexDocPath(fsCompanyId));
  await setDoc(
    ref,
    {
      schemaVersion: index.schemaVersion,
      fyKeys: index.fyKeys,
      minDateMs: index.minDateMs,
      maxDateMs: index.maxDateMs,
      updatedAtMs: index.updatedAtMs,
    },
    { merge: true }
  );
}
