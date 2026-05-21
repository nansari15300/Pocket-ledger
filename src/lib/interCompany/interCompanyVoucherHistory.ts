/**
 * Inter Company — pehli (create) voucher history rows: user, email, phone, date, time, from/to company.
 * Keys `ic*` — HistoryDialog FIELD_ORDER / labels yahi map karte hain.
 */

/** History `changes` object keys — create entry par alag table rows. */
export const IC_HISTORY_KEYS = {
  addedByUser: "icAddedByUser",
  userEmail: "icUserEmail",
  userPhone: "icUserPhone",
  voucherDate: "icVoucherDate",
  voucherTime: "icVoucherTime",
  fromCompany: "icFromCompany",
  toCompany: "icToCompany",
} as const;

export type InterCompanyCreateHistoryInput = {
  addedByUserName: string;
  userEmail?: string | null;
  userPhone?: string | null;
  /** Voucher date (form) — history me alag "Date" row */
  voucherDate: Date;
  /** Save/created moment — history me alag "Time" row */
  createdAt: Date;
  fromCompanyName: string;
  toCompanyName: string;
};

const NA = "N/A";

/** Recurring scheduler label — human IC / manual voucher history me mat use karo. */
export const RECURRING_AUTO_USER_LABEL = "Auto";

/** `userDisplayName` / history me "Auto" sirf recurring auto-create ke liye valid. */
export function isRecurringAutoUserDisplayLabel(value: unknown): boolean {
  return String(value ?? "").trim().toLowerCase() === RECURRING_AUTO_USER_LABEL.toLowerCase();
}

/**
 * Human actor: Firestore / form candidate se naam — "Auto" ko ignore karke email / uid fallback.
 */
export function resolveHumanActorDisplayLabel(args: {
  candidate?: string | null;
  email?: string | null;
  userId?: string | null;
}): string {
  const c = String(args.candidate ?? "").trim();
  if (c && !isRecurringAutoUserDisplayLabel(c)) return c;
  const em = String(args.email ?? "").trim();
  if (em.includes("@")) {
    const prefix = em.split("@")[0]?.trim();
    if (prefix) return prefix;
    return em;
  }
  const uid = String(args.userId ?? "").trim();
  return uid || c || NA;
}

/** Naya inter_company voucher save — generic `created` / lastEdited rows ki jagah yeh fields. */
export function buildInterCompanyCreateHistoryChanges(
  input: InterCompanyCreateHistoryInput
): Record<string, { from: unknown; to: unknown }> {
  return {
    [IC_HISTORY_KEYS.addedByUser]: { from: NA, to: input.addedByUserName || NA },
    [IC_HISTORY_KEYS.userEmail]: { from: NA, to: input.userEmail?.trim() || NA },
    [IC_HISTORY_KEYS.userPhone]: { from: NA, to: input.userPhone?.trim() || NA },
    [IC_HISTORY_KEYS.voucherDate]: { from: NA, to: input.voucherDate },
    [IC_HISTORY_KEYS.voucherTime]: { from: NA, to: input.createdAt },
    [IC_HISTORY_KEYS.fromCompany]: { from: NA, to: input.fromCompanyName?.trim() || NA },
    [IC_HISTORY_KEYS.toCompany]: { from: NA, to: input.toCompanyName?.trim() || NA },
  };
}

export function isInterCompanyHistoryFieldKey(field: string): boolean {
  return field.startsWith("ic") && field.length > 2;
}

/** Purane IC entries jahan sirf `created` + lastEdited tha — UI par rows synthesize. */
export function voucherHasInterCompanyCreateHistoryFields(changes: Record<string, unknown> | undefined): boolean {
  if (!changes) return false;
  return Object.values(IC_HISTORY_KEYS).some((k) => k in changes);
}

export function isInterCompanyCreateHistoryEntry(changes: Record<string, unknown> | undefined): boolean {
  if (!changes) return false;
  if (voucherHasInterCompanyCreateHistoryFields(changes)) return true;
  return "created" in changes;
}

/** Display-only: voucher doc + user meta se create rows (legacy history). */
export function synthesizeInterCompanyCreateHistoryChanges(args: {
  voucher: Record<string, unknown>;
  changedByName: string;
  userEmail?: string | null;
  userPhone?: string | null;
  changedAt: Date;
}): Record<string, { from: unknown; to: unknown }> {
  const v = args.voucher;
  const rawDate = v.date;
  let voucherDate = args.changedAt;
  if (rawDate instanceof Date) voucherDate = rawDate;
  else if (typeof rawDate === "string" && rawDate.trim()) {
    const p = new Date(rawDate);
    if (!Number.isNaN(p.getTime())) voucherDate = p;
  } else if (rawDate && typeof rawDate === "object" && typeof (rawDate as { toDate?: () => Date }).toDate === "function") {
    const d = (rawDate as { toDate: () => Date }).toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) voucherDate = d;
  }

  const fromCo = String(v.sourceCompanyName || "").trim();
  const toCo = String(v.targetCompanyName || "").trim();

  const email = args.userEmail ?? (typeof v.userEmail === "string" ? v.userEmail : null);
  const uid = typeof v.userId === "string" ? v.userId : null;
  return buildInterCompanyCreateHistoryChanges({
    addedByUserName: resolveHumanActorDisplayLabel({
      candidate: args.changedByName,
      email,
      userId: uid,
    }),
    userEmail: email,
    userPhone: args.userPhone,
    voucherDate,
    createdAt: args.changedAt,
    fromCompanyName: fromCo,
    toCompanyName: toCo,
  });
}
