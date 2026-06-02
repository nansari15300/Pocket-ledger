"use client";

import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

/** Firestore `where('…','in', …)` discrete values cap. */
export const FIRESTORE_UID_IN_CHUNK = 30;

/** User doc snapshot → voucher “User column” text; email prefix heuristic raw-uid avoidance. */
export function displayNameFromUserFirestoreDoc(
  data: Record<string, unknown> | undefined,
  docId: string
): string | null {
  if (!data) return null;
  const uid = (data.uid as string) || docId;
  if (!uid) return null;
  const email = typeof data.email === "string" ? data.email : "";
  const emailPrefix = email.includes("@") ? email.split("@")[0] : "";
  const raw = (data.displayName || data.name || emailPrefix || null) as string | null;
  if (!raw || raw === "Unknown" || raw === "N/A") return null;
  const isUIDPattern =
    raw.length > 15 && /^[a-zA-Z0-9_-]+$/.test(raw) && !raw.includes("@") && !raw.includes(" ");
  const name = isUIDPattern && emailPrefix ? emailPrefix : raw;
  return name || null;
}

/**
 * Bulk uid → display name WITHOUT `getDocs(collection(users))` (poor scalability + freezes UI).
 */
export async function batchFetchUserDisplayNamesFromFirestore(
  uidList: string[],
  shouldAbort: () => boolean = () => false
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const uniq = [...new Set(uidList.map((u) => String(u || "").trim()).filter(Boolean))];
  if (!uniq.length) return out;
  for (let i = 0; i < uniq.length; i += FIRESTORE_UID_IN_CHUNK) {
    if (shouldAbort()) return out;
    const chunk = uniq.slice(i, i + FIRESTORE_UID_IN_CHUNK);
    try {
      const q = query(collection(firestore, "users"), where("uid", "in", chunk));
      const snap = await getDocs(q);
      snap.docs.forEach((docSnap) => {
        const nm = displayNameFromUserFirestoreDoc(docSnap.data() as Record<string, unknown>, docSnap.id);
        if (!nm) return;
        const data = docSnap.data() as { uid?: string };
        const u = typeof data.uid === "string" && data.uid.trim() ? data.uid : docSnap.id;
        if ((out[u] || "") !== nm) out[u] = nm;
      });
    } catch {
      /* rights / offline — per-uid fallback below */
    }
  }
  const stale = uniq.filter((u) => !out[u]);
  const USER_UID_FETCH_PARALLEL = 12;
  for (let j = 0; j < stale.length; j += USER_UID_FETCH_PARALLEL) {
    if (shouldAbort()) return out;
    const slice = stale.slice(j, j + USER_UID_FETCH_PARALLEL);
    await Promise.all(
      slice.map(async (uid) => {
        try {
          const dq = query(collection(firestore, "users"), where("uid", "==", uid));
          const ds = await getDocs(dq);
          let data = ds.docs[0]?.data() as Record<string, unknown> | undefined;
          if (!data) {
            const legacy = await getDoc(doc(firestore, "users", uid));
            if (legacy.exists()) data = legacy.data() as Record<string, unknown>;
          }
          const nm = displayNameFromUserFirestoreDoc(data, uid);
          if (nm && (out[uid] || "") !== nm) out[uid] = nm;
        } catch {
          /* skip */
        }
      })
    );
  }
  return out;
}
