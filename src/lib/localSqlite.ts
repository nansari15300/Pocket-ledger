/**
 * Browser-only SQLite (sql.js + IndexedDB persist).
 * Use when data source = "browser" (no Node server). See docs/BROWSER-SQLITE-NO-SERVER.md.
 */

const BASE_IDB_NAME = "pocket-ledger-browser-db";
const LEGACY_IDB_NAME = BASE_IDB_NAME;
const IDB_STORE = "store";
const IDB_KEY = "sqlite-db";

export type SqlJsDatabase = import("sql.js").Database;

function getRuntimeDbScope(): string {
  if (typeof window === "undefined") return "default";
  // Host-based DB scope: localhost vs production domain ko अलग rakhkar data conflict avoid kare.
  const host = `${window.location.hostname || "unknown"}${window.location.port ? `-${window.location.port}` : ""}`;
  return host.replace(/[^a-zA-Z0-9_.-]/g, "_").toLowerCase();
}

function getScopedIdbName(): string {
  return `${BASE_IDB_NAME}__${getRuntimeDbScope()}`;
}

function openIndexedDB(idbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(idbName, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
  });
}

/** IndexedDB se DB binary read karo. Nahi mile to null (nayi DB banayenge). */
export function loadDbFromIndexedDB(): Promise<ArrayBuffer | null> {
  const readByName = (idbName: string): Promise<ArrayBuffer | null> =>
    openIndexedDB(idbName).then(
      (idb) =>
        new Promise<ArrayBuffer | null>((resolve, reject) => {
          const tx = idb.transaction(IDB_STORE, "readonly");
          const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
          req.onsuccess = () => {
            idb.close();
            const v = req.result;
            if (v == null) {
              resolve(null);
              return;
            }
            const buf = v instanceof ArrayBuffer ? v : (v as Uint8Array).buffer;
            resolve(buf instanceof ArrayBuffer ? buf : new Uint8Array(buf as ArrayBufferLike).slice().buffer);
          };
          req.onerror = () => {
            idb.close();
            reject(req.error);
          };
        })
    );
  return (async () => {
    const scopedName = getScopedIdbName();
    const scoped = await readByName(scopedName);
    if (scoped) return scoped;
    // First run after DB scoping change: legacy DB se one-time fallback read so offline companies immediately visible rahein.
    const legacy = await readByName(LEGACY_IDB_NAME);
    if (!legacy) return null;
    await saveDbToIndexedDB(new Uint8Array(legacy));
    return legacy;
  })();
}

/** DB binary IndexedDB me save karo (refresh/close ke baad bhi rahega). */
export function saveDbToIndexedDB(data: Uint8Array): Promise<void> {
  return openIndexedDB(getScopedIdbName()).then(
    (idb) =>
      new Promise<void>((resolve, reject) => {
        const tx = idb.transaction(IDB_STORE, "readwrite");
        const store = tx.objectStore(IDB_STORE);
        store.put(data, IDB_KEY);
        tx.oncomplete = () => {
          idb.close();
          resolve();
        };
        tx.onerror = () => {
          idb.close();
          reject(tx.error);
        };
      })
  );
}

/** Server jaisa schema – companies, company_docs, company_users. */
function initSchema(db: SqlJsDatabase): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      updatedAt INTEGER
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS company_docs (
      company_id TEXT NOT NULL,
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      updatedAt INTEGER,
      PRIMARY KEY (company_id, collection, id)
    )
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_company_docs_company_collection
    ON company_docs(company_id, collection)
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS company_users (
      company_id TEXT NOT NULL,
      id TEXT NOT NULL,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      role TEXT DEFAULT 'user',
      created_at INTEGER,
      PRIMARY KEY (company_id, id),
      UNIQUE(company_id, username)
    )
  `);
  // Firestore sync queue (static/offline voucher create/update — demo slice)
  db.run(`
    CREATE TABLE IF NOT EXISTS sync_outbox (
      outbox_id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      collection_name TEXT NOT NULL,
      doc_id TEXT NOT NULL,
      op TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_sync_outbox_company_created
    ON sync_outbox(company_id, created_at)
  `);
}

/** Server-style prepare().get/run/all wrapper; har write ke baad IndexedDB me save. */
export interface BrowserDbWrapper {
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): { changes: number };
  };
  exec(sql: string): void;
  /** Raw sql.js Database – export() / close() ke liye. */
  raw: SqlJsDatabase;
}

let cachedDb: { wrapper: BrowserDbWrapper; db: SqlJsDatabase } | null = null;

function wrapDb(db: SqlJsDatabase, onSave: () => Promise<void>): BrowserDbWrapper {
  const scheduleSave = () => {
    onSave().catch(() => {});
  };
  return {
    raw: db,
    prepare(sql: string) {
      const stmt = db.prepare(sql);
      return {
        get(...params: unknown[]) {
          if (params.length) stmt.bind(params as number[]);
          const ok = stmt.step();
          const row = ok ? (stmt.getAsObject() as unknown) : undefined;
          stmt.free();
          return row;
        },
        all(...params: unknown[]) {
          if (params.length) stmt.bind(params as number[]);
          const rows: unknown[] = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          stmt.free();
          return rows;
        },
        run(...params: unknown[]) {
          if (params.length) stmt.bind(params as number[]);
          stmt.step();
          stmt.free();
          const r = db.exec("SELECT changes()");
          const changes = r[0]?.values?.[0]?.[0] ?? 0;
          scheduleSave();
          return { changes: changes as number };
        },
      };
    },
    exec(sql: string) {
      db.run(sql);
      scheduleSave();
    },
  };
}

/**
 * Browser me SQLite DB open karo (IndexedDB se load ya nayi).
 * Client-only; server pe null return karo ya is helper ko mat call karo.
 */
export async function getBrowserDb(): Promise<BrowserDbWrapper | null> {
  if (typeof window === "undefined") return null;
  if (cachedDb) return cachedDb.wrapper;

  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs({
    locateFile: (file: string) =>
      // Offline EXE/APK: wasm ko app ke local public asset se load karo (CDN dependency avoid).
      file.endsWith(".wasm") ? "/sql-wasm.wasm" : file,
  });

  const data = await loadDbFromIndexedDB();
  const db = data ? new SQL.Database(new Uint8Array(data)) : new SQL.Database();
  initSchema(db);

  const save = () =>
    saveDbToIndexedDB(db.export()).then(() => {
      void import("@/lib/liveDataFolderMirror")
        .then((m) => m.scheduleLiveDataFolderMirrorAfterFlush())
        .catch(() => undefined);
    });
  const wrapper = wrapDb(db, save);
  if (!data) await save();
  cachedDb = { wrapper, db };
  return wrapper;
}

/** Cache clear karo (e.g. logout / switch data source). */
export function clearBrowserDbCache(): void {
  cachedDb = null;
}

/** Restore / bulk write ke baad `reload` se pehle — `scheduleSave` async hai warna IndexedDB pura flush nahi hota */
export async function flushBrowserDbToIndexedDB(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!cachedDb) return;
  await saveDbToIndexedDB(cachedDb.db.export());
}
