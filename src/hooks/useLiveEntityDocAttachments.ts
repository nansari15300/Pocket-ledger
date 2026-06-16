"use client";

import { useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { resolveAuthoritativeFirestoreCompanyId } from "@/lib/resolveAuthoritativeFirestoreCompanyId";
import type { EntityProfileCollection } from "@/lib/entityProfileLocalFiles";

type LiveEntityAttachmentFields = {
  fileUrl?: string | null;
  documentFileUrls?: string[];
  avatarUrl?: string | null;
  fileUrls?: string[];
};

/**
 * Entity edit dialog: Firestore `onSnapshot` se avatar/docs live — save/flush ke baad refresh ki zarurat kam.
 * `attachmentsDirty` true ho to user ke local picks overwrite na karo.
 */
export function useLiveEntityDocAttachments(params: {
  enabled: boolean;
  companyId: string | null | undefined;
  collection: EntityProfileCollection | "items";
  entityId: string | null | undefined;
  attachmentsDirty: boolean;
  onFields: (fields: LiveEntityAttachmentFields) => void;
}): void {
  const { enabled, companyId, collection, entityId, attachmentsDirty, onFields } = params;

  useEffect(() => {
    if (!enabled || !companyId || !entityId || attachmentsDirty) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    void resolveAuthoritativeFirestoreCompanyId(companyId).then((fsCompanyId) => {
      if (cancelled) return;
      const ref = doc(firestore, `companies/${fsCompanyId}/${collection}`, entityId);
      unsub = onSnapshot(ref, (snap) => {
        if (!snap.exists() || attachmentsDirty) return;
        const d = snap.data() as Record<string, unknown>;
        onFields({
          fileUrl: (d.fileUrl as string | null | undefined) ?? null,
          documentFileUrls: Array.isArray(d.documentFileUrls)
            ? d.documentFileUrls.filter((u): u is string => typeof u === "string")
            : [],
          avatarUrl: (d.avatarUrl as string | null | undefined) ?? null,
          fileUrls: Array.isArray(d.fileUrls)
            ? d.fileUrls.filter((u): u is string => typeof u === "string")
            : [],
        });
      });
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [enabled, companyId, collection, entityId, attachmentsDirty, onFields]);
}
