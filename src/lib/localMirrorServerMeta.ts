"use client";

/**
 * Browser SQLite `company_docs` mirror ke liye: kaunsi row pehle Firestore snapshot / server confirm se aayi
 * (extras merge me "ghost" restore na ban sake jab server pe doc hard-delete ho chuka ho).
 * KEY sirf local JSON me rakho — Firestore paths par kabhi persist mat karna.
 */
export const LOCAL_MIRROR_META_SERVER_CONFIRMED_KEY = "__mirrorBackedByFirestore" as const;

/** Firestore se aaya hua row SQLite mirror me — server orphan purge ke liye pehchan. */
export function stampLocalMirrorBackedByFirestore<T extends Record<string, unknown>>(row: T): T {
  return { ...row, [LOCAL_MIRROR_META_SERVER_CONFIRMED_KEY]: true } as T;
}

export function isLocalMirrorMarkedServerBacked(doc: Record<string, unknown> | undefined | null): boolean {
  return doc?.[LOCAL_MIRROR_META_SERVER_CONFIRMED_KEY] === true;
}

/** React state / forms — internal mirror meta user payload me mat dikhao. */
export function stripLocalMirrorMetaForUiRow<T extends Record<string, unknown>>(row: T): T {
  if (!row || typeof row !== "object") return row;
  if (!(LOCAL_MIRROR_META_SERVER_CONFIRMED_KEY in row)) return row;
  // Computed delete: mirror meta UI / save payloads se hatao — Firestore kabhi na bhejo.
  const { [LOCAL_MIRROR_META_SERVER_CONFIRMED_KEY]: _drop, ...rest } = row as T & Record<string, unknown>;
  return rest as T;
}
