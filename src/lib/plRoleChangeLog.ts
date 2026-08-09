"use client";

/**
 * Host Manage Sharing → PL Server role change diagnostics (EXE DevTools).
 *
 * Console filter LABEL (type exactly):
 *   PL-ROLE
 *
 * Also appears as tag: `[PL-ROLE]`
 *
 * Useful steps:
 *   panel_boot_read      — Manage Sharing list load / F5 pe SQLite se kya padha
 *   select / write_*     — host role save
 *   sibling_reload_emit  — host IDB flush ke baad hidden bridge tabs ko signal
 *   sibling_reload_recv  — bridge/sibling ne stale memory drop ki (bina purana IDB overwrite)
 *   lifecycle_flush_skip_bridge — bridge auto-flush blocked (stale clobber guard)
 *   done                 — host save complete
 */
export const PL_ROLE_LOG_FILTER_LABEL = "PL-ROLE";
const TAG = "[PL-ROLE]";

export function plRoleLog(step: string, detail?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  try {
    if (detail && Object.keys(detail).length > 0) {
      console.info(TAG, step, detail);
    } else {
      console.info(TAG, step);
    }
  } catch {
    /* ignore */
  }
}

export function plRoleUsersSummary(
  users: Array<{ id?: string; username?: string; role?: string }> | null | undefined
): Array<{ id: string; username: string; role: string }> {
  if (!Array.isArray(users)) return [];
  return users.slice(0, 24).map((u) => ({
    id: String(u.id || "").slice(0, 24),
    username: String(u.username || "").slice(0, 40),
    role: String(u.role || ""),
  }));
}
