import {
  emptyAdWallet,
  pruneExpiredUnlocks,
  rolloverDailyCap,
  type AdWalletState,
} from "@/lib/ads/adWalletTypes";

const DB_NAME = "pocket-ledger-ad-wallet";
const STORE = "wallets";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "uid" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("ad wallet db open failed"));
  });
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("ad wallet request failed"));
  });
}

export async function loadAdWallet(uid: string): Promise<AdWalletState> {
  const id = String(uid || "").trim();
  if (!id) return emptyAdWallet("");
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, "readonly");
      const raw = await requestToPromise(tx.objectStore(STORE).get(id));
      const base = raw && typeof raw === "object" ? (raw as AdWalletState) : emptyAdWallet(id);
      const wallet = pruneExpiredUnlocks(rolloverDailyCap({ ...emptyAdWallet(id), ...base, uid: id }));
      return wallet;
    } finally {
      db.close();
    }
  } catch {
    return emptyAdWallet(id);
  }
}

export async function saveAdWallet(wallet: AdWalletState): Promise<void> {
  const id = String(wallet.uid || "").trim();
  if (!id) return;
  const next = pruneExpiredUnlocks(rolloverDailyCap({ ...wallet, uid: id }));
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, "readwrite");
      await requestToPromise(tx.objectStore(STORE).put(next));
    } finally {
      db.close();
    }
  } catch {
    /* private mode / quota */
  }
}
