import { isLocalFileRef } from "@/lib/localPendingFiles";
import { normalizeFileUrlsField } from "@/lib/voucherAttachmentNormalize";

export type OnlineOutboxVoucherFileUrlsResolution = {
  /** Preserve remote HTTPS — pending `local:` hydrate failed or not ready yet. */
  omitFileUrlsFromFirestoreWrite: boolean;
  fileUrls?: string[];
};

/**
 * Online outbox flush: never write `fileUrls: []` when payload still had pending `local:` refs
 * but hydrate did not produce cloud-safe HTTPS yet (EXE → web empty attachment regression).
 */
export function resolveOnlineOutboxVoucherFileUrlsAfterHydrate(params: {
  payloadFileUrls: unknown;
  hydratedFileUrls: unknown;
  cloudSafe: (urls: readonly string[]) => string[];
}): OnlineOutboxVoucherFileUrlsResolution {
  const rawIntended = normalizeFileUrlsField(params.payloadFileUrls);
  const hydrated = normalizeFileUrlsField(params.hydratedFileUrls);
  const safeUrls = params.cloudSafe(hydrated);

  const explicitEmptySave =
    Array.isArray(params.payloadFileUrls) && rawIntended.length === 0;
  const hadLocalRefs = rawIntended.some((u) => isLocalFileRef(u));

  if (explicitEmptySave) {
    return { omitFileUrlsFromFirestoreWrite: false, fileUrls: [] };
  }
  if (hadLocalRefs && safeUrls.length === 0) {
    return { omitFileUrlsFromFirestoreWrite: true };
  }
  return { omitFileUrlsFromFirestoreWrite: false, fileUrls: safeUrls };
}
