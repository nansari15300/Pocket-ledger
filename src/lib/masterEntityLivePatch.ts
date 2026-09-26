import type { MasterEntityPatchCollection } from "@/lib/masterEntityLiveUpdate";

export const MASTER_LIVE_PATCH_EVENT = "pl-master-live-patch";
const MASTER_LIVE_PATCH_BROADCAST = "pl-master-live-patch-bc";
const MASTER_LIVE_PATCH_STORAGE_KEY = "pl-master-live-patch";

const MASTER_LIVE_PATCH_COLLECTIONS = new Set<string>([
  "parties",
  "staff",
  "bank_accounts",
  "taxes",
  "expense_accounts",
  "items",
  "expense_groups",
]);

export function isMasterLivePatchCollection(
  collectionName: string
): collectionName is MasterEntityPatchCollection {
  return MASTER_LIVE_PATCH_COLLECTIONS.has(String(collectionName || "").trim());
}

export type MasterLivePatchDetail = {
  companyId: string;
  collection: MasterEntityPatchCollection;
  docId: string;
  patch: Record<string, unknown>;
  /** Naya master — list me row add jab id abhi nahi hai. */
  insertIfMissing?: boolean;
};

export function dispatchMasterLivePatch(
  companyId: string,
  collection: MasterEntityPatchCollection,
  docId: string,
  patch: Record<string, unknown>,
  options?: { insertIfMissing?: boolean }
): void {
  const cid = String(companyId || "").trim();
  const id = String(docId || "").trim();
  if (typeof window === "undefined" || !cid || !id) return;
  const detail: MasterLivePatchDetail = {
    companyId: cid,
    collection,
    docId: id,
    patch: { ...patch, id },
    insertIfMissing: options?.insertIfMissing === true,
  };
  window.dispatchEvent(new CustomEvent(MASTER_LIVE_PATCH_EVENT, { detail }));
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(MASTER_LIVE_PATCH_BROADCAST);
      channel.postMessage(detail);
      channel.close();
    }
  } catch {
    /* optional */
  }
  try {
    window.localStorage.setItem(
      MASTER_LIVE_PATCH_STORAGE_KEY,
      JSON.stringify({ ...detail, at: Date.now() })
    );
    window.localStorage.removeItem(MASTER_LIVE_PATCH_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

export function subscribeMasterLivePatch(
  listener: (detail: MasterLivePatchDetail) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<MasterLivePatchDetail>).detail;
    if (detail?.companyId && detail?.docId && detail?.collection) listener(detail);
  };
  window.addEventListener(MASTER_LIVE_PATCH_EVENT, onCustom);

  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(MASTER_LIVE_PATCH_BROADCAST);
      channel.addEventListener("message", (event: MessageEvent<MasterLivePatchDetail>) => {
        const detail = event.data;
        if (detail?.companyId && detail?.docId && detail?.collection) listener(detail);
      });
    }
  } catch {
    channel = null;
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== MASTER_LIVE_PATCH_STORAGE_KEY || !event.newValue) return;
    try {
      const detail = JSON.parse(event.newValue) as MasterLivePatchDetail;
      if (detail?.companyId && detail?.docId && detail?.collection) listener(detail);
    } catch {
      /* ignore */
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(MASTER_LIVE_PATCH_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
    channel?.close();
  };
}
