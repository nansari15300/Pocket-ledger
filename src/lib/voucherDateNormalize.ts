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
    const o = raw as Record<string, unknown> & { __fsTs?: boolean; seconds?: unknown; nanoseconds?: unknown; toDate?: () => Date };
    if (o.__fsTs === true && typeof o.seconds === "number" && Number.isFinite(o.seconds)) {
      const ns = typeof o.nanoseconds === "number" && Number.isFinite(o.nanoseconds) ? o.nanoseconds : 0;
      const d = new Timestamp(o.seconds, ns as number).toDate();
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof o.seconds === "number" && Number.isFinite(o.seconds)) {
      const ns = typeof o.nanoseconds === "number" && Number.isFinite(o.nanoseconds) ? o.nanoseconds : 0;
      const d = new Timestamp(o.seconds, ns as number).toDate();
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
    const o = raw as Record<string, unknown> & { __fsTs?: boolean; seconds?: unknown; nanoseconds?: unknown; toDate?: () => Date };
    if (o.__fsTs === true && typeof o.seconds === "number" && Number.isFinite(o.seconds)) {
      const ns = typeof o.nanoseconds === "number" && Number.isFinite(o.nanoseconds) ? o.nanoseconds : 0;
      data["date"] = new Timestamp(o.seconds, ns as number);
      return;
    }
    // JSON / cache se sirf `{ seconds, nanoseconds }` — `toDate` nahi; pehle yahan gir kar `Timestamp.now()` ho jata tha
    if (typeof o.seconds === "number" && Number.isFinite(o.seconds)) {
      const ns = typeof o.nanoseconds === "number" && Number.isFinite(o.nanoseconds) ? o.nanoseconds : 0;
      data["date"] = new Timestamp(o.seconds, ns as number);
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
