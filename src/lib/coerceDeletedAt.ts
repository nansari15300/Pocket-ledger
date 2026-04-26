/**
 * Recycle bin / deleted rows: `deletedAt` Firestore Timestamp, epoch ms, ISO string,
 * ya JSON `{ seconds, nanoseconds }` (SQLite mirror) — sab ko safe `Date` me.
 */
export function coerceDeletedAtToDate(value: unknown): Date | null {
    if (value == null || value === "") return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value === "number" && Number.isFinite(value)) {
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === "string") {
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === "object" && value !== null) {
        const o = value as Record<string, unknown>;
        if (typeof o.toDate === "function") {
            try {
                const d = (o.toDate as () => Date)();
                if (d instanceof Date && !isNaN(d.getTime())) return d;
            } catch {
                return null;
            }
        }
        const sec = o.seconds ?? o._seconds;
        if (typeof sec === "number" && Number.isFinite(sec)) {
            const nanosRaw = o.nanoseconds ?? o._nanoseconds;
            const nanos = typeof nanosRaw === "number" && Number.isFinite(nanosRaw) ? nanosRaw : 0;
            const d = new Date(sec * 1000 + Math.floor(nanos / 1e6));
            return isNaN(d.getTime()) ? null : d;
        }
    }
    return null;
}
