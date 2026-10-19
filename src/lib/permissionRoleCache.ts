"use client";

/**
 * Last server-confirmed role per (uid + companyId). Read synchronously on startup so the role is never
 * transiently "viewer" while user / company / shared-users data is still loading (EXE / APK / web).
 *
 * - Only a role actually derived from live data while ONLINE refreshes `lastVerifiedAt`.
 * - Cached role is valid PERMISSION_CACHE_MAX_AGE_MS (10 days) after the last verification, then the user
 *   must go online again (role falls back to viewer + `reverifyRequired`).
 * - Device clock moving backwards vs `lastSeenAt` => treated as unverified (needs online).
 * - Offline never upgrades a role; a cached viewer / revoked access is never upgraded.
 * - Keyed by uid+companyId; cleared on logout / account switch.
 */

export const PERMISSION_CACHE_MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;
const TOUCH_THROTTLE_MS = 60 * 1000;
const KEY_PREFIX = "pl-perm-role-cache:v1:";

type Entry = { role: string; lastVerifiedAt: number; lastSeenAt: number };

export type PermissionRoleResolution = {
  role: string;
  /** false only while no cache exists and the role is still unknown (first login). */
  resolved: boolean;
  /** cache older than 10 days / clock tampering and not yet re-verified online. */
  reverifyRequired: boolean;
};

function keyFor(uid: string, companyId: string): string {
  return `${KEY_PREFIX}${uid}:${companyId}`;
}

function readEntry(key: string): Entry | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<Entry>;
    if (typeof o.role !== "string" || !Number.isFinite(o.lastVerifiedAt) || !Number.isFinite(o.lastSeenAt)) return null;
    return { role: o.role, lastVerifiedAt: Number(o.lastVerifiedAt), lastSeenAt: Number(o.lastSeenAt) };
  } catch {
    return null;
  }
}

function writeEntry(key: string, e: Entry): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(e));
  } catch {
    /* storage unavailable */
  }
}

export function clearPermissionRoleCache(): void {
  if (typeof window === "undefined") return;
  try {
    const drop: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(KEY_PREFIX)) drop.push(k);
    }
    drop.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/**
 * @param derivedRole role computed from live data (viewer is the default when nothing resolved yet)
 * @param evidenceLoaded true when live data is present and authoritative about this user (viewer then is a real answer)
 */
export function resolvePermissionRoleWithCache(args: {
  uid: string;
  companyId: string;
  derivedRole: string;
  evidenceLoaded: boolean;
}): PermissionRoleResolution {
  const { uid, companyId, derivedRole, evidenceLoaded } = args;
  const live: PermissionRoleResolution = {
    role: derivedRole,
    resolved: derivedRole !== "viewer" || evidenceLoaded,
    reverifyRequired: false,
  };
  if (typeof window === "undefined" || !uid || !companyId) return live;

  const key = keyFor(uid, companyId);
  const entry = readEntry(key);
  const now = Date.now();
  const online = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  const clockBad = !!entry && now < entry.lastSeenAt - CLOCK_SKEW_TOLERANCE_MS;
  const expired = !!entry && now - entry.lastVerifiedAt > PERMISSION_CACHE_MAX_AGE_MS;
  const cacheUsable = !!entry && !clockBad && !expired;
  const touch = () => {
    if (entry && now - entry.lastSeenAt > TOUCH_THROTTLE_MS) writeEntry(key, { ...entry, lastSeenAt: Math.max(now, entry.lastSeenAt) });
  };

  if (derivedRole !== "viewer") {
    // Positive role from live data.
    if (online && !clockBad) {
      if (!entry || entry.role !== derivedRole || now - entry.lastSeenAt > TOUCH_THROTTLE_MS || expired) {
        writeEntry(key, { role: derivedRole, lastVerifiedAt: now, lastSeenAt: now });
      }
      return live;
    }
    // Offline (or clock moved back): never upgrade beyond what was last confirmed.
    if (!entry) return live; // first run offline: nothing to compare with
    if (!cacheUsable) return { role: "viewer", resolved: true, reverifyRequired: true };
    touch();
    return { role: entry.role, resolved: true, reverifyRequired: false };
  }

  // derivedRole === viewer
  if (evidenceLoaded) {
    // Live data says viewer / no access: authoritative, also covers revocation. Never upgrade from cache.
    if (online && !clockBad) writeEntry(key, { role: "viewer", lastVerifiedAt: now, lastSeenAt: now });
    return { role: "viewer", resolved: true, reverifyRequired: false };
  }
  // Still loading / nothing resolved: use cache so the UI is not transiently viewer.
  if (!entry) return live;
  if (!cacheUsable) return { role: "viewer", resolved: true, reverifyRequired: true };
  touch();
  return { role: entry.role, resolved: true, reverifyRequired: false };
}