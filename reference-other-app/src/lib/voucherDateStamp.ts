/**
 * Safe date parsing for voucher save / file path logic — Invalid Date must not reach toISOString() (RangeError).
 */

export function coerceVoucherDateForStamp(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && value !== null && typeof (value as { toDate?: () => Date }).toDate === "function") {
    const d = (value as { toDate: () => Date }).toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? d : null;
  }
  const d = new Date(value as string | number);
  return isNaN(d.getTime()) ? null : d;
}

export function toIsoDateStamp(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}
