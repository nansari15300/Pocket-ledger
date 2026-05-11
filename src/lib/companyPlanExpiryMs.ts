/**
 * Billing + profile: company doc se plan expiry ms — `planExpiry`, legacy keys, `planExpiryMs`.
 * Billing page `expiryDate` useMemo ke saath align (Firestore Timestamp / millis).
 */

function toSafeDate(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === "number") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === "object" && raw != null && typeof (raw as { toDate?: () => Date }).toDate === "function") {
    const d = (raw as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** `null` jab expiry field hi na ho — billing `expiryMs` jaisa. */
export function getCompanyPlanExpiryMsFromDoc(company: unknown): number | null {
  const c = company as Record<string, unknown> | undefined;
  if (!c) return null;
  const fromTs =
    toSafeDate(c.planExpiry) ??
    toSafeDate(c.expiryDate) ??
    toSafeDate(c.planExpiresAt) ??
    null;
  if (fromTs) {
    const t = fromTs.getTime();
    return Number.isNaN(t) ? null : t;
  }
  const ms = c.planExpiryMs;
  if (typeof ms === "number" && Number.isFinite(ms)) return ms;
  return null;
}
