"use client";

import { useEffect, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { resolveAuthoritativeFirestoreCompanyId } from "@/lib/resolveAuthoritativeFirestoreCompanyId";
import {
  BROWSER_DB_COLLECTION_BUMP,
  getCompanyDocFromBrowserDb,
  type BrowserDbCollectionBumpDetail,
} from "@/lib/localCompanyDocMirror";
import type { EntityProfileCollection } from "@/lib/entityProfileLocalFiles";

type LiveEntityAttachmentFields = {
  fileUrl?: string | null;
  documentFileUrls?: string[];
  avatarUrl?: string | null;
  fileUrls?: string[];
};

function readAttachmentFieldsFromRow(d: Record<string, unknown>): LiveEntityAttachmentFields {
  return {
    fileUrl: (d.fileUrl as string | null | undefined) ?? null,
    documentFileUrls: Array.isArray(d.documentFileUrls)
      ? d.documentFileUrls.filter((u): u is string => typeof u === "string")
      : [],
    avatarUrl: (d.avatarUrl as string | null | undefined) ?? null,
    fileUrls: Array.isArray(d.fileUrls)
      ? d.fileUrls.filter((u): u is string => typeof u === "string")
      : [],
  };
}

/**
 * Entity edit dialog: Firestore / SQLite se avatar/docs live — save ke baad refresh ki zarurat kam.
 * `attachmentsDirty` true ho to user ke local picks overwrite na karo (ref se — listener band nahi).
 */
export function useLiveEntityDocAttachments(params: {
  enabled: boolean;
  companyId: string | null | undefined;
  collection: EntityProfileCollection | "items";
  entityId: string | null | undefined;
  attachmentsDirty: boolean;
  /** APK/SQLite mirror: Firestore ki jagah browser DB bump se fields apply */
  preferSqliteMirror?: boolean;
  onFields: (fields: LiveEntityAttachmentFields) => void;
}): void {
  const { enabled, companyId, collection, entityId, attachmentsDirty, preferSqliteMirror, onFields } = params;

  const attachmentsDirtyRef = useRef(attachmentsDirty);
  attachmentsDirtyRef.current = attachmentsDirty;
  const onFieldsRef = useRef(onFields);
  onFieldsRef.current = onFields;

  const applyFields = (fields: LiveEntityAttachmentFields) => {
    if (attachmentsDirtyRef.current) return;
    onFieldsRef.current(fields);
  };

  useEffect(() => {
    if (!enabled || !companyId || !entityId || preferSqliteMirror) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    void resolveAuthoritativeFirestoreCompanyId(companyId).then((fsCompanyId) => {
      if (cancelled) return;
      const ref = doc(firestore, `companies/${fsCompanyId}/${collection}`, entityId);
      unsub = onSnapshot(ref, (snap) => {
        if (!snap.exists()) return;
        applyFields(readAttachmentFieldsFromRow(snap.data() as Record<string, unknown>));
      });
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [enabled, companyId, collection, entityId, preferSqliteMirror]);

  useEffect(() => {
    if (!enabled || !companyId || !entityId) return;

    const loadFromSqlite = async () => {
      if (attachmentsDirtyRef.current) return;
      try {
        const row = await getCompanyDocFromBrowserDb(companyId, collection, entityId);
        if (!row || attachmentsDirtyRef.current) return;
        applyFields(readAttachmentFieldsFromRow(row as Record<string, unknown>));
      } catch {
        /* mirror optional */
      }
    };

    if (preferSqliteMirror) void loadFromSqlite();

    const onBump = (event: Event) => {
      const detail = (event as CustomEvent<BrowserDbCollectionBumpDetail>).detail;
      if (!detail || detail.companyId !== companyId || detail.collection !== collection) return;
      void loadFromSqlite();
    };

    window.addEventListener(BROWSER_DB_COLLECTION_BUMP, onBump);
    return () => window.removeEventListener(BROWSER_DB_COLLECTION_BUMP, onBump);
  }, [enabled, companyId, collection, entityId, preferSqliteMirror]);
}
