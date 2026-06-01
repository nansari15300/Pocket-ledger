"use client";

import { format } from "date-fns";
import { Timestamp } from "firebase/firestore";

/**
 * Firestore Timestamp / JSON `{ seconds, nanoseconds }` / ISO / `Date` → JS `Date` (form default + sale edit)
 * — `new Date(plainObject)` Invalid Date deta tha; online list/cache se aaya hua `date` kabhi plain object hota hai.
 */
export function parseFirestoreDateFieldToJsDate(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (raw instanceof Timestamp) {
    try {
      const d = raw.toDate();
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  if (typeof raw === "string" && raw.trim()) {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === "object" && raw !== null) {
    const o = raw as Record<string, unknown> & {
      __fsTs?: boolean;
      seconds?: unknown;
      _seconds?: unknown;
      nanoseconds?: unknown;
      _nanoseconds?: unknown;
      toDate?: () => Date;
    };
    const sec =
      typeof o.seconds === "number" && Number.isFinite(o.seconds)
        ? o.seconds
        : typeof o._seconds === "number" && Number.isFinite(o._seconds)
          ? o._seconds
          : null;
    const nsRaw =
      typeof o.nanoseconds === "number" && Number.isFinite(o.nanoseconds)
        ? o.nanoseconds
        : typeof o._nanoseconds === "number" && Number.isFinite(o._nanoseconds)
          ? o._nanoseconds
          : 0;
    if (o.__fsTs === true && sec !== null) {
      // Legacy mirror timestamps may use underscored keys; normalize both to stable Date.
      const d = new Timestamp(sec, nsRaw as number).toDate();
      return isNaN(d.getTime()) ? null : d;
    }
    if (sec !== null) {
      // Plain JSON timestamp objects without `toDate` should still parse correctly.
      const d = new Timestamp(sec, nsRaw as number).toDate();
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof o.toDate === "function") {
      try {
        const d = o.toDate();
        return d instanceof Date && !isNaN(d.getTime()) ? d : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Master opening "As on" (party/bank/tax/staff): SQLite/cache se kabhi sirf `{ seconds, nanoseconds }` aata hai —
 * `new Date(obj)` Invalid hota; `parseFirestoreDateFieldToJsDate` se sahi `Date`.
 * Local din par noon (12:00) — BsDatePicker / `nepali-date-converter` ke saath UTC-midnight drift se BS display khali/AD fallback na ho.
 */
export function parseOpeningBalanceDateToLocalNoon(raw: unknown): Date | null {
  const d = parseFirestoreDateFieldToJsDate(raw);
  if (!d) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

/**
 * List / mobile card ke "• time" line ke liye: pehle `createdAt`, phir `lastEditedAt` / `updatedAt`, ant mein voucher `date`.
 * `Date` + `date-fns/format` device ki **local** timezone mein dikhte hain.
 */
export function getVoucherEntryTimeSourceDate(transaction: Record<string, unknown> | null | undefined): Date | null {
  if (transaction == null || typeof transaction !== "object") return null;
  const fromCreated = parseFirestoreDateFieldToJsDate(transaction["createdAt"]);
  if (fromCreated) return fromCreated;
  const fromEdited = parseFirestoreDateFieldToJsDate(transaction["lastEditedAt"]);
  if (fromEdited) return fromEdited;
  const fromUpdated = parseFirestoreDateFieldToJsDate(transaction["updatedAt"]);
  if (fromUpdated) return fromUpdated;
  return parseFirestoreDateFieldToJsDate(transaction["date"]);
}

export function formatVoucherEntryTimeLocal(
  transaction: Record<string, unknown> | null | undefined,
  timePattern = "h:mm a"
): string {
  const dt = getVoucherEntryTimeSourceDate(transaction);
  if (!dt) return "";
  return format(dt, timePattern);
}

/**
 * Voucher `date` ko hamesha Firestore-compatible `Timestamp` banata hai.
 * Local outbox JSON + SQLite round-trip mein `Date` / plain `__fsTs` / string mix se "date gayab" (statement khali) avoid.
 */
export function coerceVoucherDocumentDate(data: Record<string, unknown> | null | undefined): void {
  if (data == null || typeof data !== "object") return;
  const raw = data["date"];

  if (raw === undefined || raw === null || raw === "") {
    data["date"] = Timestamp.now();
    return;
  }
  if (raw instanceof Timestamp) return;

  if (raw instanceof Date) {
    data["date"] = isNaN(raw.getTime()) ? Timestamp.now() : Timestamp.fromDate(raw);
    return;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const d = new Date(raw);
    data["date"] = isNaN(d.getTime()) ? Timestamp.now() : Timestamp.fromDate(d);
    return;
  }
  if (typeof raw === "object" && raw !== null) {
    const o = raw as Record<string, unknown> & {
      __fsTs?: boolean;
      seconds?: unknown;
      _seconds?: unknown;
      nanoseconds?: unknown;
      _nanoseconds?: unknown;
      toDate?: () => Date;
    };
    const sec =
      typeof o.seconds === "number" && Number.isFinite(o.seconds)
        ? o.seconds
        : typeof o._seconds === "number" && Number.isFinite(o._seconds)
          ? o._seconds
          : null;
    const nsRaw =
      typeof o.nanoseconds === "number" && Number.isFinite(o.nanoseconds)
        ? o.nanoseconds
        : typeof o._nanoseconds === "number" && Number.isFinite(o._nanoseconds)
          ? o._nanoseconds
          : 0;
    if (o.__fsTs === true && sec !== null) {
      // Accept both canonical and underscored timestamp keys while coercing voucher date.
      data["date"] = new Timestamp(sec, nsRaw as number);
      return;
    }
    // JSON / cache se sirf `{ seconds, nanoseconds }` — `toDate` nahi; pehle yahan gir kar `Timestamp.now()` ho jata tha
    if (sec !== null) {
      // Underscored keys (`_seconds`) from serialized snapshots should not become "today" by mistake.
      data["date"] = new Timestamp(sec, nsRaw as number);
      return;
    }
    if (typeof o.toDate === "function") {
      try {
        const d = o.toDate();
        data["date"] = d instanceof Date && !isNaN(d.getTime()) ? Timestamp.fromDate(d) : Timestamp.now();
      } catch {
        data["date"] = Timestamp.now();
      }
      return;
    }
  }
  data["date"] = Timestamp.now();
}
