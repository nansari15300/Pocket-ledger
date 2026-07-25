/**
 * Client for local API (Node + SQLite). Used when data source = Local.
 * Base URL e.g. http://127.0.0.1:3000 (LOCAL_API_PORT).
 */

/** 3001 by default so local API doesn't conflict with Next.js on 3000. */
const defaultBase = typeof window !== "undefined" ? "http://127.0.0.1:3001" : "";

/** True if error is network/unreachable (e.g. local server not running). */
function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError && e.message === "Failed to fetch") return true;
  if (e instanceof Error && (e.message?.includes("fetch") || e.message?.includes("network"))) return true;
  return false;
}

async function fetchJson<T>(
  baseUrl: string,
  path: string,
  options?: RequestInit,
  token?: string | null
): Promise<T> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(options?.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (e) {
    if (isNetworkError(e)) throw new Error("LOCAL_API_UNREACHABLE");
    throw e;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type LocalApiClient = {
  getCompanies: (params?: { ownerId?: string; sharedWithEmails?: string }) => Promise<Record<string, unknown>[]>;
  getCompany: (id: string) => Promise<Record<string, unknown> | null>;
  /** Create a new company. POST /api/companies. No auth required. */
  createCompany: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
  getCollection: (companyId: string, collection: string, params?: Record<string, string>) => Promise<Record<string, unknown>[]>;
  getDoc: (companyId: string, collection: string, docId: string) => Promise<Record<string, unknown> | null>;
  createDoc: (companyId: string, collection: string, data: Record<string, unknown>) => Promise<Record<string, unknown>>;
  updateDoc: (companyId: string, collection: string, docId: string, data: Record<string, unknown>) => Promise<Record<string, unknown>>;
  deleteDoc: (companyId: string, collection: string, docId: string) => Promise<void>;
  updateCompany: (id: string, data: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

export function createLocalApiClient(
  baseUrl: string = defaultBase,
  getToken?: (companyId?: string) => string | null
): LocalApiClient {
  const token = (companyId?: string) => (getToken ? getToken(companyId) : null);
  return {
    async getCompanies(params?: { ownerId?: string; sharedWithEmails?: string }) {
      try {
        const q = new URLSearchParams();
        if (params?.ownerId) q.set("ownerId", params.ownerId);
        if (params?.sharedWithEmails) q.set("sharedWithEmails", params.sharedWithEmails);
        const query = q.toString();
        return await fetchJson<Record<string, unknown>[]>(baseUrl, `/api/companies${query ? `?${query}` : ""}`, undefined, token());
      } catch (e) {
        if (e instanceof Error && e.message === "LOCAL_API_UNREACHABLE") return [];
        throw e;
      }
    },

    async getCompany(id: string) {
      try {
        return await fetchJson<Record<string, unknown>>(baseUrl, `/api/companies/${id}`, undefined, token(id));
      } catch {
        return null;
      }
    },

    async createCompany(data: Record<string, unknown>) {
      return fetchJson<Record<string, unknown>>(baseUrl, "/api/companies", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    async getCollection(companyId: string, collection: string, params?: Record<string, string>) {
      const q = params ? `?${new URLSearchParams(params)}` : "";
      return fetchJson<Record<string, unknown>[]>(baseUrl, `/api/companies/${companyId}/${collection}${q}`, undefined, token(companyId));
    },

    async getDoc(companyId: string, collection: string, docId: string) {
      try {
        return await fetchJson<Record<string, unknown>>(baseUrl, `/api/companies/${companyId}/${collection}/${docId}`, undefined, token(companyId));
      } catch {
        return null;
      }
    },

    async createDoc(companyId: string, collection: string, data: Record<string, unknown>) {
      return fetchJson<Record<string, unknown>>(baseUrl, `/api/companies/${companyId}/${collection}`, {
        method: "POST",
        body: JSON.stringify(data),
      }, token(companyId));
    },

    async updateDoc(companyId: string, collection: string, docId: string, data: Record<string, unknown>) {
      return fetchJson<Record<string, unknown>>(baseUrl, `/api/companies/${companyId}/${collection}/${docId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }, token(companyId));
    },

    async deleteDoc(companyId: string, collection: string, docId: string) {
      await fetchJson<void>(baseUrl, `/api/companies/${companyId}/${collection}/${docId}`, { method: "DELETE" }, token(companyId));
    },

    /** Update company document (PUT /api/companies/:id). Merges body into existing company data on server. */
    async updateCompany(id: string, data: Record<string, unknown>) {
      return fetchJson<Record<string, unknown>>(baseUrl, `/api/companies/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }, token(id));
    },
  };
}

/** Default client using base URL from argument or localStorage (client-side). */
export function getLocalApiBaseUrl(): string {
  if (typeof window === "undefined") return defaultBase;
  return localStorage.getItem("localApiBaseUrl") || defaultBase;
}

/**
 * Browser `fetch` fail (ERR_CONNECTION_REFUSED) → clear message; Edit Company / Add User toasts.
 * `baseUrlHint` optional — caller pass kare (avoid extra getLocalApiBaseUrl jab zaroorat ho).
 */
export function describeLocalApiFetchError(e: unknown, baseUrlHint?: string): string {
  if (isNetworkError(e)) {
    const url = baseUrlHint ?? (typeof window !== "undefined" ? getLocalApiBaseUrl() : "");
    return `Local API server not running or wrong URL (${url}). Start the Node server from the project (e.g. port 3001), or open Settings → Company Profile and edit the Data source card.`;
  }
  if (e instanceof Error && e.message && e.message !== "Failed to fetch") return e.message;
  return "Request failed. Check the local API server and Settings → Company Profile → Data source.";
}

const STORAGE_MODE = "dataSourceMode";

/** Serialize for local API: Date/Timestamp → ms number; Firestore serverTimestamp() → now. */
export function toLocalPayload(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj.getTime();
  if (typeof obj === "object" && obj !== null && "toDate" in obj && typeof (obj as { toDate: () => Date }).toDate === "function")
    return (obj as { toDate: () => Date }).toDate().getTime();
  if (typeof obj === "object" && obj !== null && !Array.isArray(obj) && ((obj as { _methodName?: string })._methodName === "ServerTimestamp" || (obj as { method?: string }).method === "serverTimestamp"))
    return Date.now();
  if (Array.isArray(obj)) return obj.map(toLocalPayload);
  if (typeof obj === "object" && obj !== null) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) out[k] = toLocalPayload((obj as Record<string, unknown>)[k]);
    return out;
  }
  return obj;
}

/** True when data source is Local (writes should go to local API). */
export function isLocalDataSource(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_MODE) === "local";
}

/** True when company ID is from local API (not in Firestore). Avoid Firestore updateDoc on companies/{id}. */
export function isLocalCompanyId(companyId: string | undefined): boolean {
  return typeof companyId === "string" && companyId.startsWith("local_");
}

/** Local API client for writes when data source is Local; null otherwise. */
export function getLocalApiClientForWrite(): LocalApiClient | null {
  if (!isLocalDataSource()) return null;
  const baseUrl = getLocalApiBaseUrl();
  return createLocalApiClient(baseUrl, (companyId) => (companyId ? getLocalAuthToken(companyId) : null));
}

const LOCAL_AUTH_TOKEN_KEY = "localAuthToken_";
const LOCAL_AUTH_USER_KEY = "localAuthUser_";
const LOCAL_AUTH_ACCOUNT_KEY = "localAuthAccount_";

/** Offline company unlock same-tab me — React hooks (permissions / voucher load) dubara chalane ke liye. */
export const LOCAL_AUTH_CHANGED_EVENT = "pocketledgerLocalAuthChanged";

function notifyLocalAuthChanged(companyId: string) {
  if (typeof window === "undefined" || !companyId) return;
  try {
    window.dispatchEvent(new CustomEvent(LOCAL_AUTH_CHANGED_EVENT, { detail: { companyId } }));
  } catch {
    /* ignore */
  }
}

export function getLocalAuthToken(companyId: string): string | null {
  if (typeof window === "undefined" || !companyId) return null;
  const currentAccount = localStorage.getItem("pl_app_account_identity_v1") || "";
  const tokenAccount = localStorage.getItem(LOCAL_AUTH_ACCOUNT_KEY + companyId) || "";
  if (!currentAccount || tokenAccount !== currentAccount) return null;
  return localStorage.getItem(LOCAL_AUTH_TOKEN_KEY + companyId);
}

export function setLocalAuthToken(companyId: string, token: string, user?: { id: string; username: string; displayName?: string; role?: string }): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_AUTH_TOKEN_KEY + companyId, token);
  localStorage.setItem(
    LOCAL_AUTH_ACCOUNT_KEY + companyId,
    localStorage.getItem("pl_app_account_identity_v1") || ""
  );
  if (user) localStorage.setItem(LOCAL_AUTH_USER_KEY + companyId, JSON.stringify(user));
  notifyLocalAuthChanged(companyId);
}

export function clearLocalAuth(companyId: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LOCAL_AUTH_TOKEN_KEY + companyId);
  localStorage.removeItem(LOCAL_AUTH_USER_KEY + companyId);
  localStorage.removeItem(LOCAL_AUTH_ACCOUNT_KEY + companyId);
  if (companyId && typeof window !== "undefined") {
    void import("@/lib/serverBackupEncryption").then((m) => m.clearBackupEncryptionSession(companyId)).catch(() => {});
  }
  notifyLocalAuthChanged(companyId);
}

export function clearAllLocalAuthSessions(): void {
  if (typeof window === "undefined") return;
  const companyIds = new Set<string>();
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index) || "";
    for (const prefix of [LOCAL_AUTH_TOKEN_KEY, LOCAL_AUTH_USER_KEY, LOCAL_AUTH_ACCOUNT_KEY]) {
      if (!key.startsWith(prefix)) continue;
      companyIds.add(key.slice(prefix.length));
      localStorage.removeItem(key);
      break;
    }
  }
  companyIds.forEach(notifyLocalAuthChanged);
}

export function getLocalAuthUser(companyId: string): { id: string; username: string; displayName?: string; role?: string } | null {
  if (typeof window === "undefined" || !companyId) return null;
  const raw = localStorage.getItem(LOCAL_AUTH_USER_KEY + companyId);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Login with company username/password. Returns { token, user } or throws. */
export async function localAuthLogin(
  baseUrl: string,
  companyId: string,
  username: string,
  password: string
): Promise<{ token: string; user: { id: string; username: string; displayName?: string; role?: string } }> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId, username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || "Login failed");
  }
  return res.json();
}
