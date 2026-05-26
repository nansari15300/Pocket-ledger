/**
 * Browser-only SQLite (sql.js + IndexedDB persist).
 * Use when data source = "browser" (no Node server). See docs/BROWSER-SQLITE-NO-SERVER.md.
 */

import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";

const BASE_IDB_NAME = "pocket-ledger-browser-db";
const LEGACY_IDB_NAME = BASE_IDB_NAME;
const IDB_STORE = "store";
const IDB_KEY = "sqlite-db";

export type SqlJsDatabase = import("sql.js").Database;

/**
 * Pending-IDB (`offlineDb`) + browser-sqlite-IDB dono isi suffix se naam banate hain — drift se write/read alag DB na ho.
 * `127.0.0.1` → `localhost` normalize: warna same dev machine par do IndexedDB namespaces (cache MISS / FILE fallback).
 */
export function getBrowserIndexedDbHostScope(): string {
  if (typeof window === "undefined") return "default";
  // Embedded/native: WebView localhost port app restart par badal sakta hai; fixed scope se SQLite persistence stable rakho.
  if (isCapacitorNativeApp()) return "capacitor_native_embedded";
  // Electron packaged localhost: runtime port drift se DB split avoid.
  const ua = (typeof navigator !== "undefined" ? navigator.userAgent : "").toLowerCase();
  if (ua.includes("electron") && window.location.hostname === "localhost") return "electron_embedded";
  // Host-based DB scope: localhost vs production domain ko अलग rakhkar data conflict avoid kare.
  const rawHost = window.location.hostname || "unknown";
  const hostForScope = rawHost === "127.0.0.1" ? "localhost" : rawHost;
  const host = `${hostForScope}${window.location.port ? `-${window.location.port}` : ""}`;
  return host.replace(/[^a-zA-Z0-9_.-]/g, "_").toLowerCase();
}

function getScopedIdbName(): string {
  return `${BASE_IDB_NAME}__${getBrowserIndexedDbHostScope()}`;
}

function getHostPortScopeForLegacyFallback(): string {
  if (typeof window === "undefined") return "default";
  const rawHost = window.location.hostname || "unknown";
  const hostForScope = rawHost === "127.0.0.1" ? "localhost" : rawHost;
  const host = `${hostForScope}${window.location.port ? `-${window.location.port}` : ""}`;
  return host.replace(/[^a-zA-Z0-9_.-]/g, "_").toLowerCase();
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
    // Scope migration safety: embedded/native fixed-scope par switch ke baad current host-port DB se one-time import.
    const legacyHostScopedName = `${BASE_IDB_NAME}__${getHostPortScopeForLegacyFallback()}`;
    if (legacyHostScopedName !== scopedName) {
      const hostScoped = await readByName(legacyHostScopedName);
      if (hostScoped) {
        await saveDbToIndexedDB(new Uint8Array(hostScoped));
        return hostScoped;
      }
    }
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
  // Capacitor attachment migration: bytes DataDirectory me, SQLite me stable refs (path/meta) only.
  db.run(`
    CREATE TABLE IF NOT EXISTS attachment_file_refs (
      scope TEXT NOT NULL,
      id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      content_type TEXT,
      size INTEGER NOT NULL DEFAULT 0,
      meta_json TEXT,
      updatedAt INTEGER,
      PRIMARY KEY (scope, id)
    )
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_attachment_file_refs_scope_updated
    ON attachment_file_refs(scope, updatedAt)
  `);
  // Dashboard-friendly voucher projection: full JSON parse se pehle amount/date/type columns quick read.
  db.run(`
    CREATE TABLE IF NOT EXISTS company_docs_projection (
      company_id TEXT NOT NULL,
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      doc_type TEXT,
      doc_date_ms INTEGER,
      amount_value REAL,
      updatedAt INTEGER,
      PRIMARY KEY (company_id, collection, id)
    )
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_company_docs_projection_company_collection_date
    ON company_docs_projection(company_id, collection, doc_date_ms)
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
  migrateBrowserSqliteSchema(db);
}

/** Purane DB files: naye columns ALTER se — outbox anti-spoof + attachment sha256 integrity. */
function migrateBrowserSqliteSchema(db: SqlJsDatabase): void {
  const vRow = db.exec("PRAGMA user_version");
  let v = 0;
  if (vRow.length > 0 && vRow[0].values.length > 0) {
    const cell = vRow[0].values[0]![0];
    v = typeof cell === "number" ? cell : Number(cell) || 0;
  }
  const setUserVersion = (n: number) => db.run(`PRAGMA user_version = ${n}`);
  if (v < 1) {
    try {
      db.run("ALTER TABLE sync_outbox ADD COLUMN client_write_id TEXT");
    } catch {
      /* column already exists */
    }
    try {
      db.run("ALTER TABLE sync_outbox ADD COLUMN nonce TEXT");
    } catch {
      /* ignore */
    }
    try {
      db.run("ALTER TABLE sync_outbox ADD COLUMN payload_hash TEXT");
    } catch {
      /* ignore */
    }
    setUserVersion(1);
    v = 1;
  }
  if (v < 2) {
    try {
      db.run("ALTER TABLE attachment_file_refs ADD COLUMN sha256_hex TEXT");
    } catch {
      /* ignore */
    }
    setUserVersion(2);
    v = 2;
  }
  // Local-company Drive/Dropbox delta sync — `sync_outbox` (Firestore) se alag queue
  if (v < 3) {
    db.run(`
      CREATE TABLE IF NOT EXISTS cloud_sync_outbox (
        op_id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        table_name TEXT NOT NULL,
        action TEXT NOT NULL,
        row_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        op_seq INTEGER NOT NULL,
        payload TEXT NOT NULL,
        synced_at INTEGER
      )
    `);
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_cloud_sync_outbox_company_pending
      ON cloud_sync_outbox(company_id, synced_at, op_seq)
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS cloud_sync_meta (
        company_id TEXT PRIMARY KEY,
        last_local_op_seq INTEGER NOT NULL DEFAULT 0,
        last_synced_op INTEGER NOT NULL DEFAULT 0,
        last_sync_at INTEGER,
        sync_status TEXT NOT NULL DEFAULT 'idle',
        last_error TEXT
      )
    `);
    setUserVersion(3);
  }
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
/** Parallel `getBrowserDb()` refresh par do alag DB instances na banen — IndexedDB overwrite / company gayab. */
let openBrowserDbPromise: Promise<BrowserDbWrapper | null> | null = null;
let pendingSaveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSaveFn: (() => Promise<void>) | null = null;

function registerBrowserDbLifecycleFlushOnce(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __plBrowserDbFlushRegistered?: boolean };
  if (w.__plBrowserDbFlushRegistered) return;
  w.__plBrowserDbFlushRegistered = true;
  const flush = () => {
    void flushPendingBrowserDbSave();
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}
registerBrowserDbLifecycleFlushOnce();

// SQLite bind ke liye unsupported JS values ko deterministic scalar me normalize karo.
function normalizeSqlParam(value: unknown): unknown {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") return null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.getTime();
  return value;
}

function wrapDb(db: SqlJsDatabase, onSave: () => Promise<void>): BrowserDbWrapper {
  pendingSaveFn = onSave;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSave = () => {
    // Burst writes (mirror batches) ke waqt har row export avoid karke one-shot debounced flush rakho.
    if (saveTimer) return;
    pendingSaveTimer = saveTimer = setTimeout(() => {
      saveTimer = null;
      pendingSaveTimer = null;
      onSave().catch(() => {});
    }, 250);
  };
  return {
    raw: db,
    prepare(sql: string) {
      const stmt = db.prepare(sql);
      return {
        get(...params: unknown[]) {
          try {
            if (params.length) stmt.bind(params.map((p) => normalizeSqlParam(p)) as unknown[]);
            const ok = stmt.step();
            return ok ? (stmt.getAsObject() as unknown) : undefined;
          } finally {
            stmt.free();
          }
        },
        all(...params: unknown[]) {
          try {
            if (params.length) stmt.bind(params.map((p) => normalizeSqlParam(p)) as unknown[]);
            const rows: unknown[] = [];
            while (stmt.step()) rows.push(stmt.getAsObject());
            return rows;
          } finally {
            stmt.free();
          }
        },
        run(...params: unknown[]) {
          try {
            if (params.length) stmt.bind(params.map((p) => normalizeSqlParam(p)) as unknown[]);
            stmt.step();
          } finally {
            stmt.free();
          }
          // changes() query ki extra prepare/exec cost hata kar direct sqlite counter read karo.
          const changes = Number(db.getRowsModified?.() ?? 0);
          scheduleSave();
          return { changes };
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
  if (openBrowserDbPromise) return openBrowserDbPromise;

  openBrowserDbPromise = (async () => {
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
  })();

  try {
    return await openBrowserDbPromise;
  } finally {
    openBrowserDbPromise = null;
  }
}

/** Cache clear karo (e.g. logout / switch data source). */
export function clearBrowserDbCache(): void {
  cachedDb = null;
}

/** Debounced save pending ho to turant IndexedDB flush — refresh/tab close se company SQLite na ude. */
export async function flushPendingBrowserDbSave(): Promise<void> {
  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }
  if (pendingSaveFn) {
    await pendingSaveFn();
    return;
  }
  await flushBrowserDbToIndexedDB();
}

/** Restore / bulk write ke baad `reload` se pehle — `scheduleSave` async hai warna IndexedDB pura flush nahi hota */
export async function flushBrowserDbToIndexedDB(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!cachedDb) return;
  await saveDbToIndexedDB(cachedDb.db.export());
}
