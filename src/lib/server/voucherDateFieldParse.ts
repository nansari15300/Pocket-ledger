/**
 * Server-safe voucher / master date parsing (no "use client").
 * Mirrors client `parseFirestoreDateFieldToJsDate` + BS calendar strings.
 */
import { BSToAD } from "datex-bs";
import { differenceInCalendarDays, startOfDay } from "date-fns";

function parseBsCalendarString(raw: string): Date | null {
  const match = raw.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (y < 2070 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 32) return null;
  try {
    const adStr = BSToAD(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    const parsed = new Date(adStr);
    return parsed instanceof Date && !isNaN(parsed.getTime()) ? parsed : null;
  } catch {
    return null;
  }
}

/** AD Date whose calendar components were mis-read as BS year (e.g. year 2082 AD). */
function normalizeBsMisreadAdDate(recordDate: Date): Date {
  if (!(recordDate instanceof Date) || isNaN(recordDate.getTime())) return recordDate;
  const today = startOfDay(new Date());
  const day = startOfDay(recordDate);
  if (differenceInCalendarDays(today, day) >= 0) return recordDate;

  const y = recordDate.getFullYear();
  if (y >= 2070 && y <= 2200) {
    try {
      const adStr = BSToAD(
        `${y}-${String(recordDate.getMonth() + 1).padStart(2, "0")}-${String(recordDate.getDate()).padStart(2, "0")}`
      );
      const fixed = new Date(adStr);
      if (fixed instanceof Date && !isNaN(fixed.getTime())) {
        const fixedAge = differenceInCalendarDays(today, startOfDay(fixed));
        if (fixedAge >= 0) return fixed;
      }
    } catch {
      /* keep original */
    }
  }
  return recordDate;
}

/** Firestore Timestamp / ISO / BS string / `{ seconds }` → JS Date for server ledger math. */
export function parseServerVoucherDateField(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) {
    const d = isNaN(raw.getTime()) ? null : raw;
    return d ? normalizeBsMisreadAdDate(d) : null;
  }

  if (typeof raw === "string" && raw.trim()) {
    const bs = parseBsCalendarString(raw);
    if (bs) return bs;
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return normalizeBsMisreadAdDate(d);
    return null;
  }

  if (typeof raw === "number" && Number.isFinite(raw)) {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : normalizeBsMisreadAdDate(d);
  }

  if (typeof raw === "object" && raw !== null) {
    const o = raw as {
      __fsTs?: boolean;
      toDate?: () => Date;
      seconds?: unknown;
      _seconds?: unknown;
      nanoseconds?: unknown;
      _nanoseconds?: unknown;
    };
    if (typeof o.toDate === "function") {
      try {
        const d = o.toDate();
        return d instanceof Date && !isNaN(d.getTime()) ? normalizeBsMisreadAdDate(d) : null;
      } catch {
        return null;
      }
    }
    const sec =
      typeof o.seconds === "number" && Number.isFinite(o.seconds)
        ? o.seconds
        : typeof o._seconds === "number" && Number.isFinite(o._seconds)
          ? o._seconds
          : null;
    if (sec !== null) {
      const ns =
        typeof o.nanoseconds === "number" && Number.isFinite(o.nanoseconds)
          ? o.nanoseconds
          : typeof o._nanoseconds === "number" && Number.isFinite(o._nanoseconds)
            ? o._nanoseconds
            : 0;
      const d = new Date(sec * 1000 + ns / 1e6);
      return isNaN(d.getTime()) ? null : normalizeBsMisreadAdDate(d);
    }
  }

  return null;
}
