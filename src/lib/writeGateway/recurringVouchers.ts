"use client";

import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from "firebase/firestore";
import { deleteDoc, setDoc, updateDoc, runTransaction } from "@/lib/writeGateway/firestoreMutationsInternal";
import { firestore } from "@/lib/firebase";
import { addBsMonths, adToBs, bsToAd, getBSMonthDays, NEPALI_MONTHS } from "@/lib/bs-date";
import { saveVoucher } from "./voucherActionsClient";
import { sendTransactionAlert } from "@/lib/transactionAlerts";
import type { Company } from "@/hooks/useCompany";
import { formatVoucherNumber, normalizePrefix, parseVoucherNumberPart } from "@/lib/voucherNumberFormat";
import { isRecurringVoucherGenerationEnabled } from "@/lib/recurringVoucherSettings";

export type RecurringNarrationMode = "advance_bs_month";
export type RecurringRunScope = "owner_only" | "all_users" | "selected_users";
/** Manual Generate: pehla gap voucher-date se (default) vs aaj se peechhe sabse naya gap (“sirf is mahina” dialog). */
export type ManualRecurringPickStrategy = "chronological" | "latest";
/** @deprecated Voucher Settings user list — ab Manage Sharing → Recurring Auto Voucher permissions. */
export type RecurringVoucherAutoEditorsScope = "all_configure_users" | "owner_only" | "selected_users";
/** BS calendar day 1–31, or 32 = last day of that BS month */
export type RecurringScheduleBsDay = number;
export type RecurringRateAdjustMode = "none" | "percent" | "fixed";
/** Fixed bump kab lagu: har BS mahine vs ek BS saal me ek baar (anchor month/day). */
export type RecurringRateAdjustCadence = "every_bs_month" | "every_bs_year";

export type RecurringVoucherTemplate = {
  sourceVoucherId: string;
  /** Search / UI: chain key + narration `| Id vou.No.{no}{typeTail}` — ek series ke liye stable */
  recurringChainKey?: string | null;
  /**
   * Ji voucher pe user ne Auto manually ON kiya — us voucher ka **number** (Src tag).
   * Har auto clone narration / `recurringMeta.sourceVoucherNumber` me yahi dikhega (clone body alag ho tab bhi).
   */
  manualOnSourceVoucherNumber?: string | null;
  /** Journal: same Dr/Cr account set → ek hi `recurringSeriesKey`; Firestore doc id = yahi key (legacy: doc id = voucher id). */
  recurringSeriesKey?: string | null;
  /** Clone body is voucher id — har save par update (latest rent amount / lines). */
  cloneSourceVoucherId?: string | null;
  sourceVoucherType: string;
  enabled: boolean;
  /** Legacy: month_end only — maps to scheduleBsDay 32 */
  scheduleType?: "month_end" | "month_day";
  /** Day of BS month to generate (1–31), or 32 = last day */
  scheduleBsDay?: RecurringScheduleBsDay | null;
  narrationMode: RecurringNarrationMode;
  rateAdjustMode?: RecurringRateAdjustMode | null;
  /** Percent (e.g. 10 = +10%) or fixed amount added to base totals */
  rateAdjustValue?: number | null;
  /** AD date ISO — fixed/% bump tabhi jab generated voucher ki due date >= is din (local day); null = hamesha apply */
  rateAdjustEffectiveFrom?: string | null;
  /** % / fixed bump cadence; none par template me null */
  rateAdjustCadence?: RecurringRateAdjustCadence | null;
  /** `every_bs_year` par kaun BS month (1–12) */
  rateAdjustYearlyBsMonth?: number | null;
  /** `every_bs_year` par kaun din (1–31, 32=last) — us din schedule due ho tabhi bump */
  rateAdjustYearlyBsDay?: number | null;
  /** Har kitne BS mahine / kitne BS saal par bump (1 = har baar); % / fixed + cadence ke saath */
  rateAdjustEveryN?: number | null;
  /**
   * Optional: `every_bs_year` + N>1 ke liye kaun se BS saal se `yearsSince % N` ginna hai (e.g. purane hisab ka Baisakh).
   * Null => `rateAdjustEffectiveFrom` ka BS saal anchor; dono null => har eligible saal.
   */
  rateAdjustYearlyBaseAnchorIso?: string | null;
  /** Journal series + rate `none`: voucher date se lock — compulsory anchor (Firestore ISO). */
  seriesBaseAnchorIso?: string | null;
  lastGeneratedPeriodKey?: string | null;
  lastGeneratedVoucherId?: string | null;
  /** BS month periods where auto voucher was deleted — never regenerate for these */
  suppressedPeriodKeys?: string[];
  createdByUserId?: string | null;
  createdByName?: string | null;
  updatedAt?: unknown;
  createdAt?: unknown;
};

const RECURRING_TEMPLATE_COLLECTION = "recurring_voucher_templates";
const RECURRING_LOCK_COLLECTION = "recurring_voucher_generation_locks";
/** Manual Generate lock: crash / tab band hone par bina `finishedAt` — itni der baad dubara try allow (stale). */
const MANUAL_RECURRING_LOCK_STALE_MS = 15 * 60 * 1000;

/** Narration / search: yahi prefix se `Id` block dhundo ya strip karo */
export const RECURRING_NARRATION_ID_TOKEN = " | Id ";

/**
 * Manual Auto ON wale voucher number se Firestore `recurringChainKey` — `vou.No.{…}jrnl` (internal; journal default tail).
 * Narration: `formatRecurringNarrationSearchSuffix` — `Id vou.No.-{no}{TYPE}` (TYPE voucher type se UPPER, jaise JRNL), bina `· Src`.
 */
export function recurringChainKeyFromManualOnVoucherNo(voucherNumber: string | null | undefined): string {
  const raw = String(voucherNumber ?? "").trim();
  if (!raw) return "";
  const compact = raw.replace(/\s+/g, "");
  const safe = compact.replace(/[^A-Za-z0-9\-_.]/g, "").slice(0, 80);
  if (!safe) return "";
  return `vou.No.${safe}jrnl`;
}

/** Sirf tab jab voucher number se key na bane (draft / edge) — pehle RG… fallback tha */
function generateRecurringChainKeyFallback(): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const a = new Uint8Array(4);
    crypto.getRandomValues(a);
    return `RG${Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  }
  return `RG${fnv1a32Hex(`${Date.now()}-${Math.random()}`)}`.toUpperCase();
}

/** Dubara append se pehle line ke end par purana `| Id …` hatao (purana lamba `· Src` wala bhi). */
export function stripRecurringNarrationSearchSuffix(narration: string): string {
  return String(narration || "")
    .replace(/\s*\|\s*Id\s+.+$/i, "")
    .trim();
}

/** Narration Id tail: voucher `type` → UPPERCASE (journal = JRNL, sale = SALE, …). */
function recurringNarrationIdTypeSuffixCaps(voucherType: string | null | undefined): string {
  const t = String(voucherType || "journal")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
  const map: Record<string, string> = {
    journal: "JRNL",
    sale: "SALE",
    purchase: "PUR",
    payment_in: "PIN",
    payment_out: "POUT",
    contra: "CONTRA",
    note: "NOTE",
    salary: "SAL",
    production: "PRD",
  };
  if (map[t]) return map[t];
  const slug = t.replace(/[^a-z0-9_]/g, "").toUpperCase();
  return (slug.slice(0, 6) || "JRNL").toUpperCase();
}

/** Purane `…jrnl` / chhote type slug narration number se hata kar digit group sahi nikaalne ke liye. */
function stripLegacyNarrationTypeSlugsFromCompact(safe: string): string {
  let out = safe;
  const slugs = ["jrnl", "sale", "pur", "pin", "pout", "cnt", "contra", "note", "sal", "prd"];
  for (let g = 0; g < 6; g++) {
    let changed = false;
    for (const slug of slugs) {
      const sl = slug.toLowerCase();
      if (out.length >= sl.length && out.slice(-sl.length).toLowerCase() === sl) {
        out = out.slice(0, -sl.length);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out.trim() || safe;
}

/** `JRNL-094` / `JRNL094` → last digit run `094` (narration `vou.No.-094JRNL`). */
function extractVoucherNarrationNumericPart(raw: string): string {
  const trimmed = String(raw || "").trim();
  const trailing = trimmed.match(/(\d+)$/);
  if (trailing) return trailing[1];
  const all = trimmed.match(/\d+/g);
  if (all?.length) return all[all.length - 1];
  return "";
}

/**
 * Narration tail: ` | Id vou.No.-094JRNL` — `-` + number + voucher-type UPPER tail; Firestore `recurringChainKey` alag rehta hai.
 * `sourceVoucherNumber` khali ho to `chainKey` se number + type jahan mumkin, warna purana `k` fallback.
 */
export function formatRecurringNarrationSearchSuffix(
  chainKey: string,
  sourceVoucherNumber: string,
  voucherType?: string | null,
): string {
  const caps = recurringNarrationIdTypeSuffixCaps(voucherType);
  const s = String(sourceVoucherNumber || "").trim();
  if (s) {
    const compact = s.replace(/\s+/g, "");
    const safe = compact.replace(/[^A-Za-z0-9\-_.]/g, "").slice(0, 80);
    if (safe) {
      const forDigits = stripLegacyNarrationTypeSlugsFromCompact(safe);
      let num = extractVoucherNarrationNumericPart(forDigits);
      if (!num) num = (forDigits.match(/\d/g) || []).join("").slice(-12) || "0";
      const idBody = `-${num}${caps}`;
      return `${RECURRING_NARRATION_ID_TOKEN}vou.No.${idBody}`;
    }
  }
  const k = String(chainKey || "").trim();
  if (!k) return "";
  const stripped = stripLegacyNarrationTypeSlugsFromCompact(k.replace(/^vou\.No\./i, ""));
  const numK = extractVoucherNarrationNumericPart(stripped);
  if (numK) {
    return `${RECURRING_NARRATION_ID_TOKEN}vou.No.-${numK}${caps}`;
  }
  return `${RECURRING_NARRATION_ID_TOKEN}${k}`;
}

/** FNV-1a 32-bit — browser-safe series id (no crypto.subtle). */
function fnv1a32Hex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Journal vouchers: Dr/Cr `accountId` + side fingerprint — same deal (e.g. rent party + expense) = same template doc.
 * Non-journal / <2 legs → null (per-voucher template doc id = source voucher id).
 */
export function computeRecurringSeriesKeyFromVoucher(v: Record<string, unknown> | null | undefined): string | null {
  if (!v) return null;
  const type = String(v.type || "").trim();
  if (type !== "journal") return null;
  const entries = v.entries;
  if (!Array.isArray(entries) || entries.length < 2) return null;
  const sigs: string[] = [];
  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const acc = String(e.accountId ?? "").trim();
    if (!acc) continue;
    const dr = Number(e.debit) > 0;
    const cr = Number(e.credit) > 0;
    const t = String(e.type || "").toLowerCase();
    const amt = Number(e.amount);
    // Saved journal: debit/credit columns; draft lines: type + amount
    let side: string;
    if (dr || cr) side = dr ? "D" : "C";
    else if (t === "debit" && amt > 0) side = "D";
    else if (t === "credit" && amt > 0) side = "C";
    else continue;
    sigs.push(`${acc}:${side}`);
  }
  if (sigs.length < 2) return null;
  sigs.sort();
  const payload = `journal|${sigs.join("|")}`;
  return `rsj_${fnv1a32Hex(payload)}_${fnv1a32Hex(payload.split("").reverse().join(""))}`;
}

/** Voucher `date` field → ISO (Firestore Timestamp / string / ms). */
function voucherDateFieldToIso(raw: unknown): string | null {
  if (raw == null) return null;
  if (raw instanceof Timestamp) {
    const d = raw.toDate();
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof raw === "string" && raw.trim()) {
    const d = new Date(raw.trim());
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/** Firestore `recurring_voucher_templates` document id — series journal vs legacy per-voucher. */
export async function getRecurringTemplateDocIdForVoucher(companyId: string, voucherId: string): Promise<string> {
  if (!companyId?.trim() || !voucherId?.trim()) return voucherId;
  const vSnap = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, voucherId));
  if (!vSnap.exists()) return voucherId;
  const sk = computeRecurringSeriesKeyFromVoucher(vSnap.data() as Record<string, unknown>);
  return sk || voucherId;
}
const AUTO_MONTH_ALIAS_ROWS: string[][] = [
  ["baisakh", "baishakh"],
  ["jestha", "jeth", "jyeshtha"],
  ["asar", "ashadh", "asadh"],
  ["shrawan", "sawan", "shravan"],
  ["bhadra", "bhadau", "bhadra"],
  ["aswin", "ashwin", "asoj", "asoj"],
  ["kartik", "kartik"],
  ["mangsir", "margshir", "margashir"],
  ["poush", "paush", "pous"],
  ["magh", "magh"],
  ["falgun", "phalgun", "falgun"],
  ["chaitra", "chait", "chaitra"],
];

export function toPeriodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** `toPeriodKey` inverse — invalid => null */
function parsePeriodKey(pk: string): { y: number; m: number } | null {
  const t = String(pk || "").trim();
  const parts = t.split("-");
  if (parts.length !== 2) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return { y, m };
}

/** Ek missing BS mahina — Generate picker + batch create dono. */
export type RecurringPeriodSlot = { periodKey: string; bsY: number; bsM: number };

/** BS period key `YYYY-MM` lexicographic compare (same calendar order). */
function comparePeriodKeysAsc(pkA: string, pkB: string): number {
  const a = parsePeriodKey(pkA);
  const b = parsePeriodKey(pkB);
  if (!a || !b) return 0;
  if (a.y !== b.y) return a.y < b.y ? -1 : 1;
  if (a.m !== b.m) return a.m < b.m ? -1 : 1;
  return 0;
}

/**
 * Is mahine ke liye zinda (non–recycle-bin) auto voucher hai? — manual gap scan ke liye.
 * Recycler (`isDeleted`) = slot khali maan kar dubara Generate allow.
 */
async function fetchActiveRecurringPeriodKeysForTemplate(companyId: string, templateDocId: string): Promise<Set<string>> {
  const out = new Set<string>();
  if (!companyId?.trim() || !templateDocId?.trim()) return out;
  const snap = await getDocs(
    query(
      collection(firestore, `companies/${companyId}/vouchers`),
      where("recurringMeta.templateId", "==", templateDocId),
      limit(400),
    ),
  );
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    if (data.isDeleted === true) continue;
    const meta = data.recurringMeta;
    if (!meta || typeof meta !== "object") continue;
    const pk = String((meta as Record<string, unknown>).periodKey || "").trim();
    if (pk) out.add(pk);
  }
  return out;
}

/**
 * “Generate now” / gap target: (1) last period recycle jab due **source voucher date** ke peechhe na ho;
 * (2) default `chronological`: source voucher ke BS mahine se aaj tak **pehla** khali slot (purana skip nahi);
 * (3) `latest`: aaj se peechhe sabse naya khali (purana behaviour);
 * (4) fallback aaj. — Auto voucher ki date kabhi manual source se purani nahi.
 */
async function pickManualRecurringGenerateTarget(
  companyId: string,
  templateDocId: string,
  template: RecurringVoucherTemplate,
  now: Date,
  strategy: ManualRecurringPickStrategy = "chronological",
): Promise<{ periodKey: string; bsY: number; bsM: number }> {
  const bsToday = adToBs(now);
  const todayPk = toPeriodKey(bsToday.y, bsToday.m);
  const sourceMinDay = await loadSourceMinLocalDayForTemplate(companyId, template);

  const lastPk =
    template.lastGeneratedPeriodKey != null && String(template.lastGeneratedPeriodKey).trim()
      ? String(template.lastGeneratedPeriodKey).trim()
      : null;
  const lastVid = String(template.lastGeneratedVoucherId || "").trim();

  let lastVoucherSnap: Awaited<ReturnType<typeof getDoc>> | null = null;
  if (lastVid) {
    lastVoucherSnap = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, lastVid));
  }
  // Template abhi bhi Chaitra id point kare + voucher recycle → dubara sirf jab scheduled due source se peechhe na ho.
  if (lastPk && lastVid) {
    const goneOrRecycle =
      lastVoucherSnap?.exists() !== true || (lastVoucherSnap.data() as Record<string, unknown>)?.isDeleted === true;
    if (goneOrRecycle && comparePeriodKeysAsc(lastPk, todayPk) <= 0) {
      const pm = parsePeriodKey(lastPk);
      if (pm && periodScheduleDueNotBeforeSourceVoucher(template, pm.y, pm.m, sourceMinDay)) {
        return { periodKey: lastPk, bsY: pm.y, bsM: pm.m };
      }
    }
  }

  const activePks = await fetchActiveRecurringPeriodKeysForTemplate(companyId, templateDocId);
  const suppressed = new Set(
    Array.isArray(template.suppressedPeriodKeys)
      ? template.suppressedPeriodKeys.map((k) => String(k).trim()).filter(Boolean)
      : [],
  );
  const minPk = effectiveMinPeriodKeyForRecurringScan(template, sourceMinDay);
  const sourceOccupiedPk = sourceVoucherBsPeriodKey(sourceMinDay);
  if (sourceOccupiedPk) activePks.add(sourceOccupiedPk);

  const tryPick = (y: number, m: number): { periodKey: string; bsY: number; bsM: number } | null => {
    const pk = toPeriodKey(y, m);
    if (minPk && comparePeriodKeysAsc(pk, minPk) < 0) return null;
    if (comparePeriodKeysAsc(pk, todayPk) > 0) return null;
    if (activePks.has(pk) || suppressed.has(pk)) return null;
    if (!periodScheduleDueNotBeforeSourceVoucher(template, y, m, sourceMinDay)) return null;
    if (!periodScheduleDueHasArrived(template, y, m, now)) return null;
    return { periodKey: pk, bsY: y, bsM: m };
  };

  // Chronological: voucher date (clone source) ke BS mahine se aaj tak pehla khali — 4 mahina skip nahi.
  if (strategy === "chronological" && sourceMinDay) {
    const srcBs = adToBs(
      new Date(sourceMinDay.getFullYear(), sourceMinDay.getMonth(), sourceMinDay.getDate(), 12, 0, 0, 0),
    );
    for (let j = 0; j < 120; j++) {
      const cur = addBsMonths(srcBs.y, srcBs.m, j);
      const pk = toPeriodKey(cur.y, cur.m);
      if (comparePeriodKeysAsc(pk, todayPk) > 0) break;
      const hit = tryPick(cur.y, cur.m);
      if (hit) return hit;
    }
  }

  // Latest gap (aaj → peechhe) ya chronological me koi slot na mila / strategy === "latest".
  for (let i = 0; i < 36; i++) {
    const cur = addBsMonths(bsToday.y, bsToday.m, -i);
    const hit = tryPick(cur.y, cur.m);
    if (hit) return hit;
  }

  return { periodKey: todayPk, bsY: bsToday.y, bsM: bsToday.m };
}

/** Auto Monthly save dialog: kitne khali BS mahine (chronological) bache — batch “sab banao” ke liye. */
export async function listMissingRecurringPeriodSlotsAscending(
  companyId: string,
  templateDocId: string,
  template: RecurringVoucherTemplate,
  now: Date = new Date(),
): Promise<RecurringPeriodSlot[]> {
  const bsToday = adToBs(now);
  const todayPk = toPeriodKey(bsToday.y, bsToday.m);
  const sourceMinDay = await loadSourceMinLocalDayForTemplate(companyId, template);
  if (!sourceMinDay) return [];

  const activePks = await fetchActiveRecurringPeriodKeysForTemplate(companyId, templateDocId);
  const suppressed = new Set(
    Array.isArray(template.suppressedPeriodKeys)
      ? template.suppressedPeriodKeys.map((k) => String(k).trim()).filter(Boolean)
      : [],
  );
  const minPk = effectiveMinPeriodKeyForRecurringScan(template, sourceMinDay);
  const sourceOccupiedPk = sourceVoucherBsPeriodKey(sourceMinDay);
  if (sourceOccupiedPk) activePks.add(sourceOccupiedPk);

  const tryPick = (y: number, m: number): { periodKey: string; bsY: number; bsM: number } | null => {
    const pk = toPeriodKey(y, m);
    if (minPk && comparePeriodKeysAsc(pk, minPk) < 0) return null;
    if (comparePeriodKeysAsc(pk, todayPk) > 0) return null;
    if (activePks.has(pk) || suppressed.has(pk)) return null;
    if (!periodScheduleDueNotBeforeSourceVoucher(template, y, m, sourceMinDay)) return null;
    if (!periodScheduleDueHasArrived(template, y, m, now)) return null;
    return { periodKey: pk, bsY: y, bsM: m };
  };

  const out: RecurringPeriodSlot[] = [];
  const srcBs = adToBs(
    new Date(sourceMinDay.getFullYear(), sourceMinDay.getMonth(), sourceMinDay.getDate(), 12, 0, 0, 0),
  );
  for (let j = 0; j < 120; j++) {
    const cur = addBsMonths(srcBs.y, srcBs.m, j);
    const pk = toPeriodKey(cur.y, cur.m);
    if (comparePeriodKeysAsc(pk, todayPk) > 0) break;
    const hit = tryPick(cur.y, cur.m);
    if (hit) out.push(hit);
  }
  return out;
}

/**
 * Voucher dialog: pehla gap jisme “Generate now” bhi jata hai — agar us period ka schedule due **aaj se pehle** guzar chuka
 * aur abhi tak zinda auto voucher nahi, to user ko Create / Skip dikhane ke liye (OFF→ON / app miss / runner miss).
 * Target `pickManualRecurringGenerateTarget(..., "chronological")` — oldest missing month; Create dabane par wahi period (latest strategy alag).
 */
/** Template `createdAt` → pehla BS mahina — naya ON (purana doc delete) par purane saal ka false “missed” na dikhe. */
function inferTemplateEarliestBsPeriodFromCreatedAt(template: RecurringVoucherTemplate): { y: number; m: number } | null {
  const raw = template.createdAt as unknown;
  if (raw == null) return null;
  let d: Date | null = null;
  if (raw instanceof Timestamp) d = raw.toDate();
  else if (typeof raw === "number" && Number.isFinite(raw)) d = new Date(raw);
  else if (typeof raw === "string" && String(raw).trim()) d = new Date(String(raw).trim());
  if (!d || Number.isNaN(d.getTime())) return null;
  const bs = adToBs(d);
  return { y: bs.y, m: bs.m };
}

/**
 * Missing-slot / pick floor: `createdAt` kabhi **aaj** hota hai jab purane date wale voucher par Auto ON karte ho —
 * sirf `createdAt` floor se beechna mahine kaat jate the (tick-popup nahi, sirf 1 “latest” generate).
 * Isliye floor = chronological **pehla** mahina dono me se: template birth ya source voucher BS month.
 */
function effectiveMinPeriodKeyForRecurringScan(
  template: RecurringVoucherTemplate,
  sourceMinDay: Date | null,
): string | null {
  const fromCreated = inferTemplateEarliestBsPeriodFromCreatedAt(template);
  if (!sourceMinDay) {
    return fromCreated ? toPeriodKey(fromCreated.y, fromCreated.m) : null;
  }
  const bs = adToBs(
    new Date(sourceMinDay.getFullYear(), sourceMinDay.getMonth(), sourceMinDay.getDate(), 12, 0, 0, 0),
  );
  const sourcePk = toPeriodKey(bs.y, bs.m);
  if (!fromCreated) return sourcePk;
  const createdPk = toPeriodKey(fromCreated.y, fromCreated.m);
  return comparePeriodKeysAsc(createdPk, sourcePk) < 0 ? createdPk : sourcePk;
}

export async function getPastDueRecurringGapIfAny(
  companyId: string,
  templateDocId: string,
  template: RecurringVoucherTemplate,
  now: Date = new Date(),
): Promise<{ periodKey: string; bsY: number; bsM: number } | null> {
  if (!companyId?.trim() || !templateDocId?.trim()) return null;
  const sourceMinDay = await loadSourceMinLocalDayForTemplate(companyId, template);
  const target = await pickManualRecurringGenerateTarget(companyId, templateDocId, template, now, "chronological");
  const minPk = effectiveMinPeriodKeyForRecurringScan(template, sourceMinDay);
  if (minPk && comparePeriodKeysAsc(target.periodKey, minPk) < 0) return null;
  const activePks = await fetchActiveRecurringPeriodKeysForTemplate(companyId, templateDocId);
  if (activePks.has(target.periodKey)) return null;
  const suppressed = new Set(
    Array.isArray(template.suppressedPeriodKeys) ? template.suppressedPeriodKeys.map((k) => String(k)) : [],
  );
  if (suppressed.has(target.periodKey)) return null;
  const dueStart = scheduleDueLocalStartForPeriod(template, target.bsY, target.bsM);
  const todayStart = startOfLocalDay(now);
  if (!dueStart || dueStart.getTime() >= todayStart.getTime()) return null;
  return { periodKey: target.periodKey, bsY: target.bsY, bsM: target.bsM };
}

/** Skip (dialog): period ko `suppressedPeriodKeys` me — auto ab is mahine dubara nahi; sirf aage wale schedule. */
export async function suppressRecurringPeriodForTemplate(
  companyId: string,
  sourceVoucherId: string,
  periodKey: string,
): Promise<void> {
  const pk = String(periodKey || "").trim();
  if (!companyId?.trim() || !sourceVoucherId?.trim() || !pk) return;
  const templateDocId = await getRecurringTemplateDocIdForVoucher(companyId, sourceVoucherId);
  const ref = doc(firestore, `companies/${companyId}/${RECURRING_TEMPLATE_COLLECTION}`, templateDocId);
  await updateDoc(ref, {
    suppressedPeriodKeys: arrayUnion(pk),
    updatedAt: serverTimestamp(),
  });
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Manual-ON / clone source voucher ki date — auto voucher kabhi is din (local) se pehle schedule na ho. */
function sourceVoucherMinLocalDayStartFromData(v: Record<string, unknown>): Date | null {
  const iso = voucherDateFieldToIso(v.date);
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return startOfLocalDay(d);
}

/** Is BS period ka scheduled due din source voucher ki date se peechhe to nahi (pick / recycle filter). */
function periodScheduleDueNotBeforeSourceVoucher(
  template: RecurringVoucherTemplate,
  bsY: number,
  bsM: number,
  sourceMin: Date | null,
): boolean {
  if (!sourceMin) return true;
  const dueStart = scheduleDueLocalStartForPeriod(template, bsY, bsM);
  if (!dueStart) return true;
  return dueStart.getTime() >= sourceMin.getTime();
}

/** Template se clone voucher utha kar minimum AD din (Firestore). */
async function loadSourceMinLocalDayForTemplate(companyId: string, template: RecurringVoucherTemplate): Promise<Date | null> {
  const vid = String(template.cloneSourceVoucherId || template.sourceVoucherId || "").trim();
  if (!companyId.trim() || !vid) return null;
  const snap = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, vid));
  if (!snap.exists()) return null;
  return sourceVoucherMinLocalDayStartFromData(snap.data() as Record<string, unknown>);
}

/** Source voucher ki BS mahina — manual voucher pehle se hai; ask / batch list me dubara mat dikhao. */
function sourceVoucherBsPeriodKey(sourceMinDay: Date | null): string | null {
  if (!sourceMinDay) return null;
  const bs = adToBs(
    new Date(sourceMinDay.getFullYear(), sourceMinDay.getMonth(), sourceMinDay.getDate(), 12, 0, 0, 0),
  );
  return toPeriodKey(bs.y, bs.m);
}

/**
 * Schedule due din aaj ya pehle — current mahine ka “last day” abhi nahi aaya to ask list / generate me mat lao.
 * (`getPastDueRecurringGapIfAny` jaisa rule — batch list me pehle missing tha.)
 */
function periodScheduleDueHasArrived(
  template: RecurringVoucherTemplate,
  bsY: number,
  bsM: number,
  now: Date,
): boolean {
  const dueStart = scheduleDueLocalStartForPeriod(template, bsY, bsM);
  if (!dueStart) return false;
  return dueStart.getTime() <= startOfLocalDay(now).getTime();
}

/** Us BS mahine me template ka scheduled due (local calendar day start) — delete-before-due vs suppress decide karne ke liye. */
function scheduleDueLocalStartForPeriod(template: RecurringVoucherTemplate, bsY: number, bsM: number): Date | null {
  try {
    const monthDays = getBSMonthDays(bsY);
    const dim = monthDays[bsM - 1] || 30;
    const dayNum = effectiveScheduleBsDay(template);
    const dueD = dayNum >= 32 ? dim : Math.min(dayNum, dim);
    const dueAd = bsToAd({ y: bsY, m: bsM, d: dueD });
    return startOfLocalDay(dueAd);
  } catch {
    return null;
  }
}

/** Schedule BS day — UI + accrual; export taaki dashboard card same rule use kare */
export function effectiveScheduleBsDay(template: RecurringVoucherTemplate): number {
  if (typeof template.scheduleBsDay === "number" && Number.isFinite(template.scheduleBsDay)) {
    return Math.max(1, Math.min(32, Math.floor(template.scheduleBsDay)));
  }
  if (template.scheduleType === "month_end") return 32;
  return 32;
}

/** True when today’s BS date matches template schedule day (app-open trigger). */
export function isBsScheduleDueToday(template: RecurringVoucherTemplate, bsNow: { y: number; m: number; d: number }): boolean {
  const monthDays = getBSMonthDays(bsNow.y);
  const dim = monthDays[bsNow.m - 1] || 30;
  const day = effectiveScheduleBsDay(template);
  const targetD = day >= 32 ? dim : Math.min(day, dim);
  return bsNow.d === targetD;
}

function toPrimaryMonthName(month: number): string {
  const idx = Math.max(1, Math.min(12, Number(month) || 1)) - 1;
  return NEPALI_MONTHS[idx] || "Baisakh";
}

function maybeAdvanceNarrationMonth(rawNarration: unknown, targetMonth: number): string {
  const base = String(rawNarration ?? "").trim();
  if (!base) return "";
  const replacement = toPrimaryMonthName(targetMonth);
  let out = base;
  let replaced = false;

  for (const aliases of AUTO_MONTH_ALIAS_ROWS) {
    for (const alias of aliases) {
      const rx = new RegExp(`\\b${alias}\\b`, "gi");
      if (rx.test(out)) {
        out = out.replace(rx, replacement);
        replaced = true;
      }
    }
  }

  return replaced ? out : base;
}

/** Template se effective-from parse; invalid => null (bump hamesha). */
function parseRateAdjustEffectiveFrom(iso: unknown): Date | null {
  if (iso == null || typeof iso !== "string" || !String(iso).trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** Local calendar day compare — voucher due vs “increase starts from” date. */
function localDayStartMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** AD → BS conversion par timezone drift kam — calendar noon local */
function atNoonLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

function bsMonthIndex(y: number, m: number): number {
  return y * 12 + (m - 1);
}

function effectiveRateAdjustEveryN(template: RecurringVoucherTemplate): number {
  const n = template.rateAdjustEveryN;
  if (typeof n !== "number" || !Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(24, Math.floor(n)));
}

/** N>1: monthly = har N BS mahine (effective-from anchor); yearly = har N BS saal (anchor year se). */
function rateEveryNAllowsBump(template: RecurringVoucherTemplate, bsY: number, bsM: number): boolean {
  const cadence = template.rateAdjustCadence ?? "every_bs_month";
  const n = effectiveRateAdjustEveryN(template);
  if (n <= 1) return true;
  const eff = parseRateAdjustEffectiveFrom(template.rateAdjustEffectiveFrom);

  if (cadence === "every_bs_month") {
    const cur = bsMonthIndex(bsY, bsM);
    if (eff) {
      const bs = adToBs(atNoonLocal(eff));
      const anchor = bsMonthIndex(bs.y, bs.m);
      const delta = cur - anchor;
      return delta >= 0 && delta % n === 0;
    }
    return cur % n === 0;
  }

  // every_bs_year — month/day pehle hi match ho chuka; saal-count: pehle dedicated base, warna effective-from
  const yearlyBase = parseRateAdjustEffectiveFrom(template.rateAdjustYearlyBaseAnchorIso);
  const anchorForYearPhase = yearlyBase ?? eff;
  if (anchorForYearPhase) {
    const bs = adToBs(atNoonLocal(anchorForYearPhase));
    const yearsSince = bsY - bs.y;
    return yearsSince >= 0 && yearsSince % n === 0;
  }
  return true;
}

/** Yearly bump: sirf jab is generation ka BS month/day anchor se mile; monthly => hamesha true. */
function rateCadenceAllowsBump(
  template: RecurringVoucherTemplate,
  bsY: number,
  bsM: number,
  dueD: number,
): boolean {
  const cadence = template.rateAdjustCadence ?? "every_bs_month";
  if (cadence !== "every_bs_year") return true;
  const am = template.rateAdjustYearlyBsMonth;
  const ad = template.rateAdjustYearlyBsDay;
  if (typeof am !== "number" || typeof ad !== "number" || !Number.isFinite(am) || !Number.isFinite(ad)) return false;
  const month = Math.max(1, Math.min(12, Math.floor(am)));
  const dayNum = Math.max(1, Math.min(32, Math.floor(ad)));
  if (bsM !== month) return false;
  const dim = getBSMonthDays(bsY)[bsM - 1] || 30;
  const targetD = dayNum >= 32 ? dim : Math.min(dayNum, dim);
  return dueD === targetD;
}

/** Journal / sale row par lagi file refs — Generate now clone par template wali slip dubara na chipke. */
function stripRowAttachmentFields(row: Record<string, unknown>): Record<string, unknown> {
  const r = { ...row };
  delete r.fileUrls;
  delete r.files;
  delete r.fileUrl;
  return r;
}

function stripRecurringUnsafeFields(source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...source };
  delete out.id;
  delete out.history;
  delete out.createdAt;
  delete out.updatedAt;
  delete out.lastEditedAt;
  delete out.lastEditedBy;
  delete out.lastEditedByUserName;
  delete out.approvedAt;
  delete out.approvedByUserId;
  delete out.approvedByUserName;
  delete out.deletedAt;
  delete out.isDeleted;
  delete out.convertedToType;
  delete out.convertedToVoucherNumber;
  delete out.fileUrls;
  delete out.files;
  delete out.unassignedFile;
  delete out.linkedVoucherIds;
  delete out.linkedPaymentInIds;
  delete out.linkedPaymentInAmounts;
  delete out.linkedFromVoucherNos;
  delete out.linkedToVoucherNos;
  delete out.linkedOpeningBalanceAmount;
  delete out.linkedOpeningBalanceAccountId;
  delete out.openingBalanceAllocated;
  delete out.crossCopySourceRef;
  delete out.pendingLinkAllocations;
  delete out.recurringMeta;
  // Header-level files upar hata diye; `entries` / `lineItems` ke andar bhi URLs ho sakti hain (journal Dr/Cr row).
  for (const key of ["entries", "lineItems"] as const) {
    const arr = out[key];
    if (!Array.isArray(arr)) continue;
    (out as Record<string, unknown>)[key] = arr.map((item: unknown) =>
      item && typeof item === "object" ? stripRowAttachmentFields(item as Record<string, unknown>) : item,
    );
  }
  return out;
}

/** Apply % or fixed increase to voucher totals / lines (recurring clone). */
export function applyRecurringRateAdjustment(
  voucher: Record<string, unknown>,
  mode: RecurringRateAdjustMode | undefined | null,
  rawValue: number | null | undefined,
): Record<string, unknown> {
  const m = mode || "none";
  const v = typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : 0;
  if (m === "none" || v === 0) return { ...voucher };

  const adj = (n: number) => {
    if (!Number.isFinite(n)) return n;
    if (m === "percent") return Math.round(n * (1 + v / 100) * 100) / 100;
    return Math.round((n + v) * 100) / 100;
  };

  const out = { ...voucher };
  const numKeys = ["total", "amount", "subTotal", "tax", "discount", "credit", "debit"] as const;
  for (const k of numKeys) {
    const x = out[k];
    if (typeof x === "number" && Number.isFinite(x)) (out as any)[k] = adj(x);
  }

  const entries = out.entries;
  if (Array.isArray(entries)) {
    (out as any).entries = entries.map((e: Record<string, unknown>) => {
      const d = typeof e.debit === "number" ? adj(e.debit as number) : e.debit;
      const c = typeof e.credit === "number" ? adj(e.credit as number) : e.credit;
      return { ...e, debit: d, credit: c };
    });
  }

  const lineItems = out.lineItems;
  if (Array.isArray(lineItems)) {
    (out as any).lineItems = lineItems.map((li: Record<string, unknown>) => {
      const next = { ...li };
      for (const lk of ["amount", "rate", "quantity", "tax", "discount"]) {
        const val = next[lk];
        if (typeof val === "number" && Number.isFinite(val)) (next as any)[lk] = adj(val);
      }
      return next;
    });
  }

  return out;
}

/** Journal lines se Dr jod — saved (`debit`) + draft (`type`+`amount`); accrual / projected amount yahi. */
function journalDebitTotalFromEntries(entries: unknown): number {
  if (!Array.isArray(entries)) return 0;
  let debitSum = 0;
  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const dr = Number(e.debit);
    if (Number.isFinite(dr) && dr > 0) {
      debitSum += dr;
      continue;
    }
    const t = String(e.type || "").toLowerCase();
    const amt = Number(e.amount);
    if (t === "debit" && Number.isFinite(amt) && amt > 0) debitSum += amt;
  }
  return debitSum;
}

/**
 * UI accrual strip: voucher se “main” rashi — total / amount / journal Dr jod / lineItems.
 * `createOne` ke baad wala projected body isi shape par rate adjust hota hai.
 */
export function primaryMonetaryTotalFromVoucher(v: Record<string, unknown>): number {
  const typ = String(v.type || "").toLowerCase();
  // Journal: pehle entries — header `total` purana/chhota reh sakta hai (10,000 lines par accrued ~31 aata tha)
  if (typ === "journal") {
    const fromEntries = journalDebitTotalFromEntries(v.entries);
    if (fromEntries > 0) return fromEntries;
  }
  const total = v.total;
  if (typeof total === "number" && Number.isFinite(total) && total !== 0) return Math.abs(total);
  const amount = v.amount;
  if (typeof amount === "number" && Number.isFinite(amount) && amount !== 0) return Math.abs(amount);
  const entries = v.entries;
  if (typ === "journal" && Array.isArray(entries)) {
    const debitSum = journalDebitTotalFromEntries(entries);
    if (debitSum > 0) return debitSum;
  }
  const lineItems = v.lineItems;
  if (Array.isArray(lineItems)) {
    let liSum = 0;
    for (const raw of lineItems) {
      if (!raw || typeof raw !== "object") continue;
      const li = raw as Record<string, unknown>;
      const a = Number(li.amount);
      if (Number.isFinite(a)) liSum += Math.abs(a);
    }
    if (liSum > 0) return liSum;
  }
  return 0;
}

/**
 * Agla auto-clone kitna “bada” hoga — `createOneRecurringVoucherFromTemplate` jaisa bump decision (due month + cadence).
 */
export function projectNextRecurringMonetaryTotal(
  template: RecurringVoucherTemplate,
  sourceVoucher: Record<string, unknown>,
  bsPeriod: { y: number; m: number },
): number {
  const monthDays = getBSMonthDays(bsPeriod.y);
  const dim = monthDays[bsPeriod.m - 1] || 30;
  const dayNum = effectiveScheduleBsDay(template);
  const dueD = dayNum >= 32 ? dim : Math.min(dayNum, dim);
  const dueAdDate = bsToAd({ y: bsPeriod.y, m: bsPeriod.m, d: dueD });
  let base: Record<string, unknown> = { ...sourceVoucher };
  const mode = (template.rateAdjustMode || "none") as RecurringRateAdjustMode;
  const rawVal = template.rateAdjustValue;
  const eff = parseRateAdjustEffectiveFrom(template.rateAdjustEffectiveFrom);
  const dueStart = localDayStartMs(dueAdDate);
  const effStart = eff ? localDayStartMs(eff) : null;
  const cadenceOk =
    rateCadenceAllowsBump(template, bsPeriod.y, bsPeriod.m, dueD) && rateEveryNAllowsBump(template, bsPeriod.y, bsPeriod.m);
  const applyBump = mode !== "none" && (effStart === null || dueStart >= effStart) && cadenceOk;
  base = applyRecurringRateAdjustment(
    base,
    applyBump ? mode : "none",
    applyBump && typeof rawVal === "number" ? rawVal : null,
  ) as Record<string, unknown>;
  return primaryMonetaryTotalFromVoucher(base);
}

/**
 * Linear accrual start: agle due wale BS mahine ka window — pichhle mahine ke schedule due se.
 * `lastGeneratedAtMs` sirf jab last auto **usi** mahine (next due period) ka ho; warna timestamp se 5 din ≈ Rs 5 dikhta.
 */
export function computeRecurringAccrualPeriodStartMs(
  template: RecurringVoucherTemplate,
  nextDueAd: Date,
  lastGeneratedAtMs: number | null | undefined,
  effectiveLastPeriodKey?: string | null,
): number {
  const bsDue = adToBs(atNoonLocal(nextDueAd));
  const prev = addBsMonths(bsDue.y, bsDue.m, -1);
  const prevDueStart = scheduleDueLocalStartForPeriod(template, prev.y, prev.m);
  const prevStartMs = prevDueStart?.getTime() ?? null;
  const accrualPeriodKey = toPeriodKey(bsDue.y, bsDue.m);

  const lastPk =
    effectiveLastPeriodKey !== undefined
      ? effectiveLastPeriodKey != null && String(effectiveLastPeriodKey).trim()
        ? String(effectiveLastPeriodKey).trim()
        : null
      : template.lastGeneratedPeriodKey != null && String(template.lastGeneratedPeriodKey).trim()
        ? String(template.lastGeneratedPeriodKey).trim()
        : null;

  if (lastGeneratedAtMs != null && Number.isFinite(lastGeneratedAtMs) && lastPk === accrualPeriodKey) {
    if (prevStartMs != null) return Math.max(lastGeneratedAtMs, prevStartMs);
    return lastGeneratedAtMs;
  }
  if (prevStartMs != null) return prevStartMs;
  if (lastGeneratedAtMs != null && Number.isFinite(lastGeneratedAtMs)) return lastGeneratedAtMs;
  return startOfLocalDay(nextDueAd).getTime() - 35 * 86400000;
}

async function getNextVoucherNumberForType(
  companyId: string,
  sourceVoucher: Record<string, unknown>,
): Promise<string> {
  const sourceVoucherNo = String(sourceVoucher.voucherNumber || "").trim();
  const match = sourceVoucherNo.match(/^([^0-9]*)(\d+)$/);
  const rawPrefix = match?.[1] ?? "V-";
  const prefix = rawPrefix || "V-";
  const type = String(sourceVoucher.type || "sale");
  const rows = (await getDocs(query(collection(firestore, `companies/${companyId}/vouchers`), where("type", "==", type)))).docs;
  let maxNo = 0;
  for (const row of rows) {
    const candidate = String((row.data() as Record<string, unknown>)?.voucherNumber || "");
    if (!candidate) continue;
    if (!candidate.startsWith(prefix) && !candidate.startsWith(normalizePrefix(prefix))) continue;
    const parsed = parseVoucherNumberPart(candidate, prefix);
    if (Number.isFinite(parsed) && parsed > maxNo) maxNo = parsed;
  }
  return formatVoucherNumber(prefix, maxNo + 1);
}

export async function getRecurringTemplateForVoucher(
  companyId: string,
  sourceVoucherId: string,
): Promise<RecurringVoucherTemplate | null> {
  if (!companyId?.trim() || !sourceVoucherId?.trim()) return null;
  const docId = await getRecurringTemplateDocIdForVoucher(companyId, sourceVoucherId);
  const snap = await getDoc(doc(firestore, `companies/${companyId}/${RECURRING_TEMPLATE_COLLECTION}`, docId));
  if (!snap.exists()) return null;
  return snap.data() as RecurringVoucherTemplate;
}

export async function setRecurringTemplateForVoucher(
  companyId: string,
  payload: {
    sourceVoucherId: string;
    sourceVoucherType: string;
    enabled: boolean;
    narrationMode?: RecurringNarrationMode;
    actorUserId?: string;
    actorName?: string;
    scheduleBsDay?: number;
    rateAdjustMode?: RecurringRateAdjustMode;
    rateAdjustValue?: number | null;
    /** ISO string ya null — fixed/% bump schedule ke hisaab se */
    rateAdjustEffectiveFrom?: string | null;
    rateAdjustCadence?: RecurringRateAdjustCadence | null;
    rateAdjustYearlyBsMonth?: number | null;
    rateAdjustYearlyBsDay?: number | null;
    rateAdjustEveryN?: number | null;
    rateAdjustYearlyBaseAnchorIso?: string | null;
    /** Optional override; journal series + rate none par voucher date se bhi derive hota hai. */
    seriesBaseAnchorIso?: string | null;
  },
): Promise<void> {
  if (!companyId?.trim() || !payload.sourceVoucherId?.trim()) return;
  // OFF = poori template doc hatao (journal series me ek hi doc — kisi bhi line se clear = sab band).
  if (payload.enabled !== true) {
    await clearRecurringTemplateForVoucher(companyId, payload.sourceVoucherId);
    return;
  }

  const vRef = doc(firestore, `companies/${companyId}/vouchers`, payload.sourceVoucherId);
  const vSnap = await getDoc(vRef);
  if (!vSnap.exists()) return;
  const vData = vSnap.data() as Record<string, unknown>;
  const seriesKey = computeRecurringSeriesKeyFromVoucher(vData);
  const templateDocId = seriesKey || payload.sourceVoucherId;

  // Pehle per-voucher doc tha, ab journal series id — purana duplicate hatao taaki ON/OFF ek hi jagah se ho.
  if (seriesKey && templateDocId !== payload.sourceVoucherId) {
    const legacyRef = doc(firestore, `companies/${companyId}/${RECURRING_TEMPLATE_COLLECTION}`, payload.sourceVoucherId);
    const leg = await getDoc(legacyRef);
    if (leg.exists()) await deleteDoc(legacyRef);
  }

  const ref = doc(firestore, `companies/${companyId}/${RECURRING_TEMPLATE_COLLECTION}`, templateDocId);
  const existing = await getDoc(ref);
  const existingData = existing.exists() ? (existing.data() as Partial<RecurringVoucherTemplate>) : {};

  const resolvedMode = (payload.rateAdjustMode ?? existingData.rateAdjustMode ?? "none") as RecurringRateAdjustMode;
  const effectiveFromMerged =
    payload.rateAdjustEffectiveFrom !== undefined
      ? payload.rateAdjustEffectiveFrom
      : existingData.rateAdjustEffectiveFrom ?? null;

  let seriesBaseMerged: string | null =
    payload.seriesBaseAnchorIso !== undefined
      ? payload.seriesBaseAnchorIso
      : (existingData.seriesBaseAnchorIso ?? null);

  // Journal series + ON: %/fixed ke liye "apply from" zaroor; none ke liye voucher date (ya saved anchor).
  if (seriesKey) {
    if (resolvedMode === "fixed" || resolvedMode === "percent") {
      if (effectiveFromMerged == null || (typeof effectiveFromMerged === "string" && !effectiveFromMerged.trim())) {
        throw new Error(
          "Journal auto series needs an “apply from” date under rate settings. Open Auto Monthly → Settings and pick the start date.",
        );
      }
      seriesBaseMerged = null;
    } else {
      const fromVoucher = voucherDateFieldToIso(vData.date);
      if (typeof seriesBaseMerged === "string" && seriesBaseMerged.trim()) {
        seriesBaseMerged = seriesBaseMerged.trim();
      } else if (fromVoucher) {
        seriesBaseMerged = fromVoucher;
      } else {
        throw new Error(
          "Journal auto series needs a voucher date (base anchor). Set the voucher date on this entry, then save again.",
        );
      }
    }
  }

  const scheduleBsDay =
    typeof payload.scheduleBsDay === "number" && Number.isFinite(payload.scheduleBsDay)
      ? Math.max(1, Math.min(32, Math.floor(payload.scheduleBsDay)))
      : existingData.scheduleBsDay ?? (existingData.scheduleType === "month_end" ? 32 : 32);
  // Pehla jis voucher par user ne Auto ON kiya — narration Src/Id yahi; naya auto-save isko overwrite na kare jab tak series clear na ho.
  const existingManualOn = String(existingData.manualOnSourceVoucherNumber || "").trim() || null;
  const manualOnSourceVoucherNumber =
    existingManualOn || String(vData.voucherNumber || "").trim() || null;
  const keyFromManualOnNo = recurringChainKeyFromManualOnVoucherNo(manualOnSourceVoucherNumber || undefined);
  const existingKey =
    typeof existingData.recurringChainKey === "string" && String(existingData.recurringChainKey).trim()
      ? String(existingData.recurringChainKey).trim()
      : "";
  // Stable: `vou.No.…jrnl` ek baar save ke baad; purana `RG…` template save par voucher-no style me migrate.
  let chainKey = existingKey;
  if (!chainKey) {
    chainKey = keyFromManualOnNo || generateRecurringChainKeyFallback();
  } else if (existingKey.toUpperCase().startsWith("RG") && keyFromManualOnNo) {
    chainKey = keyFromManualOnNo;
  }

  // Recycle / clone move: stale `lastGenerated*` mat rakho — dashboard accrual + next-due skip galat rehte hain.
  const progressResolved = await resolveLastGeneratedForTemplateSave(
    companyId,
    existingData,
    payload.sourceVoucherId,
  );

  const next: RecurringVoucherTemplate = {
    sourceVoucherId: payload.sourceVoucherId,
    recurringSeriesKey: seriesKey ?? null,
    recurringChainKey: chainKey,
    manualOnSourceVoucherNumber,
    cloneSourceVoucherId: payload.sourceVoucherId,
    sourceVoucherType: payload.sourceVoucherType || "journal",
    enabled: true,
    scheduleType: scheduleBsDay >= 32 ? "month_end" : "month_day",
    scheduleBsDay,
    narrationMode: payload.narrationMode || "advance_bs_month",
    rateAdjustMode: resolvedMode,
    rateAdjustValue:
      payload.rateAdjustValue !== undefined ? payload.rateAdjustValue : existingData.rateAdjustValue ?? null,
    rateAdjustEffectiveFrom: effectiveFromMerged,
    rateAdjustCadence:
      payload.rateAdjustCadence !== undefined ? payload.rateAdjustCadence : existingData.rateAdjustCadence ?? null,
    rateAdjustYearlyBsMonth:
      payload.rateAdjustYearlyBsMonth !== undefined
        ? payload.rateAdjustYearlyBsMonth
        : existingData.rateAdjustYearlyBsMonth ?? null,
    rateAdjustYearlyBsDay:
      payload.rateAdjustYearlyBsDay !== undefined ? payload.rateAdjustYearlyBsDay : existingData.rateAdjustYearlyBsDay ?? null,
    rateAdjustEveryN:
      payload.rateAdjustEveryN !== undefined ? payload.rateAdjustEveryN : existingData.rateAdjustEveryN ?? null,
    rateAdjustYearlyBaseAnchorIso:
      payload.rateAdjustYearlyBaseAnchorIso !== undefined
        ? payload.rateAdjustYearlyBaseAnchorIso
        : existingData.rateAdjustYearlyBaseAnchorIso ?? null,
    seriesBaseAnchorIso: seriesKey ? seriesBaseMerged : null,
    createdByUserId: existing.exists() ? existingData.createdByUserId ?? payload.actorUserId ?? null : payload.actorUserId ?? null,
    createdByName: existing.exists() ? existingData.createdByName ?? payload.actorName ?? null : payload.actorName ?? null,
    lastGeneratedPeriodKey: progressResolved.lastGeneratedPeriodKey,
    lastGeneratedVoucherId: progressResolved.lastGeneratedVoucherId,
    suppressedPeriodKeys: Array.isArray(existingData.suppressedPeriodKeys) ? existingData.suppressedPeriodKeys : [],
    createdAt: existing.exists() ? existingData.createdAt ?? serverTimestamp() : serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, next, { merge: true });
}

export async function clearRecurringTemplateForVoucher(companyId: string, sourceVoucherId: string): Promise<void> {
  if (!companyId?.trim() || !sourceVoucherId?.trim()) return;
  const docId = await getRecurringTemplateDocIdForVoucher(companyId, sourceVoucherId);
  await deleteDoc(doc(firestore, `companies/${companyId}/${RECURRING_TEMPLATE_COLLECTION}`, docId));
}

/**
 * App-open month-end runner: company `runScope` + Manage Sharing `trigger_recurring_auto_on_app_open`.
 * Legacy `selected_users` + `allowedUserIds` ab bhi chalenge jab tak purani company doc me hon.
 */
export function canRunRecurringAutoOnAppOpen(
  company: Company | null,
  currentUserId: string,
  currentUserEmail?: string | null,
  hasTriggerPermission = false,
): boolean {
  const settings = (company as any)?.recurringVoucherSettings || {};
  const scope = String(settings.runScope || "owner_only") as RecurringRunScope;
  const ownerId = String(company?.ownerId || "").trim();
  const ownerEmail = String(company?.ownerEmail || "").trim().toLowerCase();
  const email = String(currentUserEmail || "").trim().toLowerCase();
  if (scope === "all_users") return hasTriggerPermission;
  if (scope === "selected_users") {
    const allowedIds = Array.isArray(settings.allowedUserIds)
      ? settings.allowedUserIds.map((x: unknown) => String(x).trim()).filter(Boolean)
      : [];
    return allowedIds.includes(currentUserId) || hasTriggerPermission;
  }
  if (ownerId && currentUserId === ownerId) return true;
  return !!ownerEmail && !!email && ownerEmail === email;
}

/**
 * Auto voucher delete detect: lastGen pointer clear hamesha.
 * Return `true` = is period ab `suppressed` — Generate now / app-open is mahine dubara nahi (due date ke baad wala delete).
 * Return `false` = sirf early test delete (due se pehle) ya kuch nahi — scheduled din par phir generate ho sakta hai.
 */
/**
 * Template save / UI: deleted ya missing last auto → period skip + accrual start dono reset.
 * Zinda last auto ho to Firestore `lastGeneratedPeriodKey` + voucher timestamp wapas.
 */
export function resolveRecurringTemplateProgress(
  template: RecurringVoucherTemplate,
  lastGeneratedVoucher: Record<string, unknown> | null | undefined,
): {
  lastGeneratedPeriodKey: string | null;
  lastGeneratedVoucherId: string | null;
  lastGeneratedAtMs: number | null;
} {
  const lastVid = String(template.lastGeneratedVoucherId || "").trim();
  const rawPk =
    template.lastGeneratedPeriodKey != null && String(template.lastGeneratedPeriodKey).trim()
      ? String(template.lastGeneratedPeriodKey).trim()
      : null;
  if (!lastVid) {
    return { lastGeneratedPeriodKey: rawPk, lastGeneratedVoucherId: null, lastGeneratedAtMs: null };
  }
  const stale =
    !lastGeneratedVoucher || lastGeneratedVoucher.isDeleted === true;
  if (stale) {
    return { lastGeneratedPeriodKey: null, lastGeneratedVoucherId: null, lastGeneratedAtMs: null };
  }
  let lastMs: number | null = null;
  const meta = lastGeneratedVoucher.recurringMeta;
  if (meta && typeof meta === "object") {
    const g = (meta as Record<string, unknown>).generatedAtMs;
    if (typeof g === "number" && Number.isFinite(g)) lastMs = g;
  }
  if (lastMs == null) {
    const ca = lastGeneratedVoucher.createdAt as { toDate?: () => Date } | undefined;
    if (ca && typeof ca.toDate === "function") {
      const d = ca.toDate();
      if (!Number.isNaN(d.getTime())) lastMs = d.getTime();
    }
  }
  return {
    lastGeneratedPeriodKey: rawPk,
    lastGeneratedVoucherId: lastVid,
    lastGeneratedAtMs: lastMs,
  };
}

/** Firestore template save: recycle-bin last auto ya recurring source voucher badal gaya ho to pointers clear. */
async function resolveLastGeneratedForTemplateSave(
  companyId: string,
  existingData: Partial<RecurringVoucherTemplate>,
  newCloneSourceVoucherId: string,
): Promise<{ lastGeneratedPeriodKey: string | null; lastGeneratedVoucherId: string | null }> {
  const prevClone = String(existingData.cloneSourceVoucherId || existingData.sourceVoucherId || "").trim();
  if (prevClone && newCloneSourceVoucherId && prevClone !== newCloneSourceVoucherId) {
    return { lastGeneratedPeriodKey: null, lastGeneratedVoucherId: null };
  }
  const lastVid = String(existingData.lastGeneratedVoucherId || "").trim();
  const lastPk =
    existingData.lastGeneratedPeriodKey != null && String(existingData.lastGeneratedPeriodKey).trim()
      ? String(existingData.lastGeneratedPeriodKey).trim()
      : null;
  if (!lastVid) {
    return { lastGeneratedPeriodKey: lastPk, lastGeneratedVoucherId: null };
  }
  const vSnap = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, lastVid));
  if (!vSnap.exists() || (vSnap.data() as Record<string, unknown>)?.isDeleted === true) {
    return { lastGeneratedPeriodKey: null, lastGeneratedVoucherId: null };
  }
  return { lastGeneratedPeriodKey: lastPk, lastGeneratedVoucherId: lastVid };
}

/**
 * Recycler: jab last auto voucher delete ho — template pointers clear (due se pehle/baad suppress rule same).
 */
export async function reconcileRecurringTemplateAfterAutoVoucherRecycle(
  companyId: string,
  recycledVoucherId: string,
): Promise<void> {
  if (!companyId?.trim() || !recycledVoucherId?.trim()) return;
  const vSnap = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, recycledVoucherId));
  if (!vSnap.exists()) return;
  const v = vSnap.data() as Record<string, unknown>;
  const meta = v.recurringMeta;
  if (!meta || typeof meta !== "object") return;
  const templateId = String((meta as Record<string, unknown>).templateId || "").trim();
  if (!templateId) return;
  const tplRef = doc(firestore, `companies/${companyId}/${RECURRING_TEMPLATE_COLLECTION}`, templateId);
  const tplSnap = await getDoc(tplRef);
  if (!tplSnap.exists()) return;
  const tpl = tplSnap.data() as RecurringVoucherTemplate;
  if (String(tpl.lastGeneratedVoucherId || "").trim() !== recycledVoucherId) return;
  const periodKey = String(tpl.lastGeneratedPeriodKey || "").trim();
  if (!periodKey) {
    await updateDoc(tplRef, {
      lastGeneratedPeriodKey: null,
      lastGeneratedVoucherId: null,
      updatedAt: serverTimestamp(),
    });
    return;
  }
  await maybeMarkDeletedAutoVoucherSuppressed(companyId, templateId, tpl, periodKey);
}

async function maybeMarkDeletedAutoVoucherSuppressed(
  companyId: string,
  templateId: string,
  template: RecurringVoucherTemplate,
  periodKey: string,
): Promise<boolean> {
  const vid = String(template.lastGeneratedVoucherId || "").trim();
  if (template.lastGeneratedPeriodKey !== periodKey || !vid) return false;
  const vSnap = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, vid));
  const deleted = !vSnap.exists() || (vSnap.data() as any)?.isDeleted === true;
  if (!deleted) return false;

  const pm = parsePeriodKey(periodKey);
  const dueStart = pm ? scheduleDueLocalStartForPeriod(template, pm.y, pm.m) : null;
  const todayStart = startOfLocalDay(new Date());
  // Due se pehle delete: bar‑bar Generate now test — suppress mat karo; asli schedule din / dubara manual OK.
  const beforeScheduledDue = dueStart != null && todayStart.getTime() < dueStart.getTime();

  const ref = doc(firestore, `companies/${companyId}/${RECURRING_TEMPLATE_COLLECTION}`, templateId);
  if (beforeScheduledDue) {
    await updateDoc(ref, {
      lastGeneratedPeriodKey: null,
      lastGeneratedVoucherId: null,
      updatedAt: serverTimestamp(),
    });
    return false;
  }

  await updateDoc(ref, {
    suppressedPeriodKeys: arrayUnion(periodKey),
    lastGeneratedPeriodKey: null,
    lastGeneratedVoucherId: null,
    updatedAt: serverTimestamp(),
  });
  return true;
}

type GenerateActor = { uid: string; email?: string | null; displayName?: string | null };

async function createOneRecurringVoucherFromTemplate(
  companyId: string,
  company: Company | null,
  templateId: string,
  template: RecurringVoucherTemplate,
  periodKey: string,
  bsNow: { y: number; m: number; d: number },
  actor: GenerateActor,
  /** Manual “Generate now”: suppressed month dubara + recycler ko gap maano — scheduler me undefined. */
  opts?: { ignoreSuppressed?: boolean },
): Promise<{ id: string; voucherNumber: string } | null> {
  const cloneVid = String(template.cloneSourceVoucherId || template.sourceVoucherId || "").trim();
  const sourceSnap = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, cloneVid));
  if (!sourceSnap.exists()) {
    await updateDoc(doc(firestore, `companies/${companyId}/${RECURRING_TEMPLATE_COLLECTION}`, templateId), {
      enabled: false,
      updatedAt: serverTimestamp(),
    });
    return null;
  }

  const suppressed = Array.isArray(template.suppressedPeriodKeys) ? template.suppressedPeriodKeys : [];
  if (!opts?.ignoreSuppressed && suppressed.includes(periodKey)) return null;

  if (template.lastGeneratedPeriodKey === periodKey && template.lastGeneratedVoucherId) {
    const vSnap = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, template.lastGeneratedVoucherId));
    if (vSnap.exists() && (vSnap.data() as any)?.isDeleted !== true) {
      return null;
    }
  }

  const sourceVoucher = sourceSnap.data() as Record<string, unknown>;
  const nextVoucherNumber = await getNextVoucherNumberForType(companyId, sourceVoucher);
  const monthDays = getBSMonthDays(bsNow.y);
  const dim = monthDays[bsNow.m - 1] || bsNow.d;
  const dayNum = effectiveScheduleBsDay(template);
  const dueD = dayNum >= 32 ? dim : Math.min(dayNum, dim);
  const dueAdDate = bsToAd({ y: bsNow.y, m: bsNow.m, d: dueD });
  // Source (manual ON) voucher ki date se pehle kabhi save na ho — pick ke baad bhi safety clamp.
  const sourceMinDay = sourceVoucherMinLocalDayStartFromData(sourceVoucher);
  let voucherAdDate = dueAdDate;
  if (sourceMinDay && startOfLocalDay(dueAdDate).getTime() < sourceMinDay.getTime()) {
    const iso = voucherDateFieldToIso(sourceVoucher.date);
    if (iso) {
      const sd = new Date(iso);
      if (!Number.isNaN(sd.getTime())) voucherAdDate = sd;
      else
        voucherAdDate = new Date(sourceMinDay.getFullYear(), sourceMinDay.getMonth(), sourceMinDay.getDate(), 12, 0, 0, 0);
    } else {
      voucherAdDate = new Date(sourceMinDay.getFullYear(), sourceMinDay.getMonth(), sourceMinDay.getDate(), 12, 0, 0, 0);
    }
  }
  const dueMonthName = toPrimaryMonthName(bsNow.m);

  let base = stripRecurringUnsafeFields(sourceVoucher);
  const mode = (template.rateAdjustMode || "none") as RecurringRateAdjustMode;
  const rawVal = template.rateAdjustValue;
  const eff = parseRateAdjustEffectiveFrom(template.rateAdjustEffectiveFrom);
  const dueStart = localDayStartMs(voucherAdDate);
  // Bump sirf jab due date >= effective-from (ya effective-from set hi nahi)
  const effStart = eff ? localDayStartMs(eff) : null;
  const cadenceOk =
    rateCadenceAllowsBump(template, bsNow.y, bsNow.m, dueD) && rateEveryNAllowsBump(template, bsNow.y, bsNow.m);
  const applyBump = mode !== "none" && (effStart === null || dueStart >= effStart) && cadenceOk;
  base = applyRecurringRateAdjustment(
    base,
    applyBump ? mode : "none",
    applyBump && typeof rawVal === "number" ? rawVal : null,
  );

  const cleanedNarration =
    template.narrationMode === "advance_bs_month"
      ? maybeAdvanceNarrationMonth(base.narration, bsNow.m)
      : String(base.narration || "");

  const tplRefForKey = doc(firestore, `companies/${companyId}/${RECURRING_TEMPLATE_COLLECTION}`, templateId);
  const cloneBodyVoucherNo = String(sourceVoucher.voucherNumber || "").trim() || cloneVid.slice(0, 12);
  // Src tag: template pe save manual-ON voucher number (user ne jis pe switch ON kiya); purane template ke liye clone number fallback.
  const srcTagVoucherNo =
    String(template.manualOnSourceVoucherNumber || "").trim() || cloneBodyVoucherNo;
  let chainKey = String(template.recurringChainKey || "").trim();
  const keyFromSrc = recurringChainKeyFromManualOnVoucherNo(srcTagVoucherNo);
  // Purana `RG…` key: generate (auto / manual) pe `vou.No.…jrnl` me upgrade + template sync.
  if (chainKey.toUpperCase().startsWith("RG") && keyFromSrc) {
    chainKey = keyFromSrc;
    await updateDoc(tplRefForKey, { recurringChainKey: chainKey, updatedAt: serverTimestamp() }).catch(() => {});
  } else if (!chainKey) {
    chainKey = keyFromSrc || generateRecurringChainKeyFallback();
    await updateDoc(tplRefForKey, { recurringChainKey: chainKey, updatedAt: serverTimestamp() }).catch(() => {});
  }
  // Legacy template: ek baar generate par number Firestore me likh do taaki Src stable rahe.
  if (!String(template.manualOnSourceVoucherNumber || "").trim() && cloneBodyVoucherNo) {
    await updateDoc(tplRefForKey, {
      manualOnSourceVoucherNumber: cloneBodyVoucherNo,
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }
  const narrCore = stripRecurringNarrationSearchSuffix(cleanedNarration || `Auto voucher for ${dueMonthName}`);
  // Type tail narration me (jrnl / sale …); clone body + template dono se type fallback.
  const narrType = String(sourceVoucher.type || template.sourceVoucherType || "journal").trim();
  const narrSuffix = formatRecurringNarrationSearchSuffix(chainKey, srcTagVoucherNo, narrType);
  const narrationFinal = narrCore + (narrSuffix || "");

  const payload = {
    ...base,
    voucherNumber: nextVoucherNumber,
    narration: narrationFinal,
    date: voucherAdDate.toISOString(),
    isApproved: false,
    recurringMeta: {
      templateId,
      sourceVoucherId: cloneVid,
      periodKey,
      generatedAtMs: Date.now(),
      generatedBy: actor.uid,
      generationKind: "recurring_bs_monthly",
      chainKey,
      sourceVoucherNumber: srcTagVoucherNo,
    },
  };

  const saved = await saveVoucher(companyId, actor.uid, payload, null, undefined, {
    forceUnapprovedCreate: true,
    userDisplayNameOverride: "Auto",
    actorDisplayNameOverride: "Auto",
  });

  const tplRef = doc(firestore, `companies/${companyId}/${RECURRING_TEMPLATE_COLLECTION}`, templateId);
  const tplPatch: Record<string, unknown> = {
    lastGeneratedPeriodKey: periodKey,
    lastGeneratedVoucherId: saved.id,
    updatedAt: serverTimestamp(),
    // Naya auto voucher ab series ka “body” source — UI switch isi par ON; purane voucher par OFF (`ownsRecurringTemplate`).
    // `manualOnSourceVoucherNumber` / `recurringChainKey` yahan mat chhedo — narration / Src jab tak user OFF+save na kare purane manual-ON wale se.
    sourceVoucherId: saved.id,
    cloneSourceVoucherId: saved.id,
  };
  // User ne Generate dabaya + pehle “skip” flag tha → dubara allow (auto scheduler dubara block na kare).
  if (opts?.ignoreSuppressed && suppressed.includes(periodKey)) {
    tplPatch.suppressedPeriodKeys = arrayRemove(periodKey);
  }
  await updateDoc(tplRef, tplPatch);

  await sendTransactionAlert(companyId, company, {
    kind: "auto_created",
    voucherId: saved.id,
    voucherNumber: nextVoucherNumber,
    voucherType: String(sourceVoucher.type || "journal"),
    performedByUserId: actor.uid,
    performedByName: "Auto",
    performedByEmail: actor.email ?? undefined,
    changes: ["Auto created voucher", "Recurring schedule"],
  });

  return { id: saved.id, voucherNumber: nextVoucherNumber };
}

/** Manual “Generate now” from voucher dialog — creates voucher for current BS period if allowed. */
export async function generateRecurringVoucherNow(
  companyId: string,
  company: Company | null,
  sourceVoucherId: string,
  actor: GenerateActor,
  options?: { pickStrategy?: ManualRecurringPickStrategy },
): Promise<{ ok: boolean; message: string; voucherId?: string }> {
  if (!companyId?.trim() || !sourceVoucherId?.trim() || !actor?.uid) {
    return { ok: false, message: "Missing company or voucher." };
  }
  const templateDocId = await getRecurringTemplateDocIdForVoucher(companyId, sourceVoucherId);
  const tplSnap = await getDoc(doc(firestore, `companies/${companyId}/${RECURRING_TEMPLATE_COLLECTION}`, templateDocId));
  if (!tplSnap.exists()) return { ok: false, message: "Enable Auto Monthly and save the voucher first." };
  const template = tplSnap.data() as RecurringVoucherTemplate;
  if (!template.enabled) return { ok: false, message: "Auto Monthly is off for this voucher." };
  const tplActiveSource = String(template.cloneSourceVoucherId || template.sourceVoucherId || "").trim();
  if (tplActiveSource && tplActiveSource !== sourceVoucherId.trim()) {
    return {
      ok: false,
      message: "Auto Monthly is active on another line in this journal series. Open that voucher to generate, or turn Auto on here.",
    };
  }
  const co = company as Record<string, unknown> | null | undefined;
  if (!isRecurringVoucherGenerationEnabled(co as Company | null)) {
    return { ok: false, message: "Company auto recurring is off. Turn it on in Company Settings or the dashboard recurring card." };
  }

  const now = new Date();
  const pickStrategy = options?.pickStrategy ?? "chronological";
  // Recycle + gap: default chronological (purana mahina pehle); `latest` = purana “sirf is mahina” dialog.
  const target = await pickManualRecurringGenerateTarget(companyId, templateDocId, template, now, pickStrategy);
  const periodKey = target.periodKey;
  const bsNow = { y: target.bsY, m: target.bsM, d: 1 };

  const refreshed = (await getDoc(doc(firestore, `companies/${companyId}/${RECURRING_TEMPLATE_COLLECTION}`, templateDocId))).data() as RecurringVoucherTemplate;

  if (refreshed.lastGeneratedPeriodKey === periodKey && refreshed.lastGeneratedVoucherId) {
    const vSnap = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, refreshed.lastGeneratedVoucherId));
    if (vSnap.exists() && (vSnap.data() as any)?.isDeleted !== true) {
      return { ok: false, message: "An auto voucher for this period already exists." };
    }
  }

  const lockRef = doc(firestore, `companies/${companyId}/${RECURRING_LOCK_COLLECTION}`, `${templateDocId}_${periodKey}_manual`);
  // Purana lock (success ke baad bhi doc reh sakta tha / beech me error) → dubara "LOCK_EXISTS" + koi txn nahi dikhna.
  const preLock = await getDoc(lockRef);
  if (preLock.exists()) {
    const ld = preLock.data() as Record<string, unknown>;
    const hasFinished = ld.finishedAt != null;
    const createdRaw = ld.createdAt;
    let createdMs = 0;
    if (createdRaw instanceof Timestamp) createdMs = createdRaw.toMillis();
    else if (typeof createdRaw === "number" && Number.isFinite(createdRaw)) createdMs = createdRaw;
    const staleIncomplete = !hasFinished && createdMs > 0 && Date.now() - createdMs > MANUAL_RECURRING_LOCK_STALE_MS;
    if (hasFinished || staleIncomplete) {
      await deleteDoc(lockRef).catch(() => {});
    }
  }
  try {
    await runTransaction(firestore, async (tx) => {
      const lockSnap = await tx.get(lockRef);
      if (lockSnap.exists()) throw new Error("LOCK_EXISTS");
      tx.set(lockRef, { templateId: templateDocId, periodKey, manual: true, createdAt: serverTimestamp(), createdBy: actor.uid });
    });
  } catch {
    return {
      ok: false,
      message:
        "Another Generate is running for this month, or a lock is stuck. Wait a minute and try again, or retry after 15 minutes if the last run crashed.",
    };
  }

  try {
    const result = await createOneRecurringVoucherFromTemplate(
      companyId,
      company,
      templateDocId,
      refreshed,
      periodKey,
      bsNow,
      actor,
      { ignoreSuppressed: true },
    );
    if (!result) {
      await deleteDoc(lockRef).catch(() => {});
      return { ok: false, message: "Could not generate (source missing or period blocked)." };
    }
    const monthLabel = toPrimaryMonthName(target.bsM);
    await deleteDoc(lockRef).catch(() => {});
    return {
      ok: true,
      message: `Created ${result.voucherNumber} (${monthLabel} · ${periodKey})`,
      voucherId: result.id,
    };
  } catch (e) {
    await deleteDoc(lockRef).catch(() => {});
    return { ok: false, message: e instanceof Error ? e.message : "Generation failed." };
  }
}

/** Manual lock doc: purana / crash — Generate now jaisa cleanup taaki batch agla period chal sake. */
async function clearStaleManualRecurringLockIfNeeded(lockRef: ReturnType<typeof doc>): Promise<void> {
  const preLock = await getDoc(lockRef);
  if (!preLock.exists()) return;
  const ld = preLock.data() as Record<string, unknown>;
  const hasFinished = ld.finishedAt != null;
  const createdRaw = ld.createdAt;
  let createdMs = 0;
  if (createdRaw instanceof Timestamp) createdMs = createdRaw.toMillis();
  else if (typeof createdRaw === "number" && Number.isFinite(createdRaw)) createdMs = createdRaw;
  const staleIncomplete = !hasFinished && createdMs > 0 && Date.now() - createdMs > MANUAL_RECURRING_LOCK_STALE_MS;
  if (hasFinished || staleIncomplete) {
    await deleteDoc(lockRef).catch(() => {});
  }
}

/**
 * Chune hue BS periods ke liye auto voucher — chronological order; har success par template clone last voucher pe.
 * `slots` khali na ho; caller sort / filter de.
 */
export async function generateRecurringVouchersForPeriodSlots(
  companyId: string,
  company: Company | null,
  initialSourceVoucherId: string,
  actor: GenerateActor,
  slots: RecurringPeriodSlot[],
): Promise<{ ok: boolean; message: string; created: number; lastVoucherId?: string }> {
  if (!companyId?.trim() || !initialSourceVoucherId?.trim() || !actor?.uid) {
    return { ok: false, message: "Missing company or voucher.", created: 0 };
  }
  if (!Array.isArray(slots) || slots.length === 0) {
    return { ok: false, message: "No periods selected.", created: 0 };
  }
  const co = company as Record<string, unknown> | null | undefined;
  if (!isRecurringVoucherGenerationEnabled(co as Company | null)) {
    return { ok: false, message: "Company auto recurring is off.", created: 0 };
  }

  const templateDocId = await getRecurringTemplateDocIdForVoucher(companyId, initialSourceVoucherId);
  const tplSnap = await getDoc(doc(firestore, `companies/${companyId}/${RECURRING_TEMPLATE_COLLECTION}`, templateDocId));
  if (!tplSnap.exists()) return { ok: false, message: "No Auto Monthly template for this voucher.", created: 0 };
  const template0 = tplSnap.data() as RecurringVoucherTemplate;
  if (!template0.enabled) return { ok: false, message: "Auto Monthly is off.", created: 0 };

  const ordered = [...slots].sort((a, b) => comparePeriodKeysAsc(a.periodKey, b.periodKey));

  let created = 0;
  const labels: string[] = [];
  let lastVoucherId: string | undefined;

  for (const slot of ordered) {
    const refreshed = (await getDoc(doc(firestore, `companies/${companyId}/${RECURRING_TEMPLATE_COLLECTION}`, templateDocId))).data() as
      | RecurringVoucherTemplate
      | undefined;
    if (!refreshed?.enabled) break;

    if (refreshed.lastGeneratedPeriodKey === slot.periodKey && refreshed.lastGeneratedVoucherId) {
      const vSnap = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, refreshed.lastGeneratedVoucherId));
      if (vSnap.exists() && (vSnap.data() as Record<string, unknown>)?.isDeleted !== true) {
        continue;
      }
    }

    const lockRef = doc(firestore, `companies/${companyId}/${RECURRING_LOCK_COLLECTION}`, `${templateDocId}_${slot.periodKey}_manual`);
    await clearStaleManualRecurringLockIfNeeded(lockRef);

    try {
      await runTransaction(firestore, async (tx) => {
        const lockSnap = await tx.get(lockRef);
        if (lockSnap.exists()) throw new Error("LOCK_EXISTS");
        tx.set(lockRef, {
          templateId: templateDocId,
          periodKey: slot.periodKey,
          manual: true,
          batchBackfill: true,
          createdAt: serverTimestamp(),
          createdBy: actor.uid,
        });
      });
    } catch {
      continue;
    }

    try {
      const freshTpl = (await getDoc(doc(firestore, `companies/${companyId}/${RECURRING_TEMPLATE_COLLECTION}`, templateDocId))).data() as RecurringVoucherTemplate;
      const result = await createOneRecurringVoucherFromTemplate(
        companyId,
        company,
        templateDocId,
        freshTpl,
        slot.periodKey,
        { y: slot.bsY, m: slot.bsM, d: 1 },
        actor,
        { ignoreSuppressed: true },
      );
      await deleteDoc(lockRef).catch(() => {});
      if (result) {
        created += 1;
        lastVoucherId = result.id;
        labels.push(`${result.voucherNumber} (${slot.periodKey})`);
      }
    } catch (e) {
      await deleteDoc(lockRef).catch(() => {});
      return {
        ok: created > 0,
        created,
        lastVoucherId,
        message:
          created > 0
            ? `Partial: ${created} created, then stopped (${e instanceof Error ? e.message : "error"}).`
            : (e instanceof Error ? e.message : "Backfill failed."),
      };
    }
  }

  return {
    ok: created > 0,
    created,
    lastVoucherId,
    message:
      created > 0
        ? `Created ${created} voucher(s): ${labels.slice(0, 6).join(", ")}${labels.length > 6 ? "…" : ""}`
        : "No new vouchers (periods may already exist or locks blocked).",
  };
}

/**
 * Auto Monthly settings ke “sab missing banao” — poori chronological list (Generate picker me sab tick = yahi).
 */
export async function generateRecurringBackfillAllMissingForVoucher(
  companyId: string,
  company: Company | null,
  initialSourceVoucherId: string,
  actor: GenerateActor,
): Promise<{ ok: boolean; message: string; created: number; lastVoucherId?: string }> {
  if (!companyId?.trim() || !initialSourceVoucherId?.trim() || !actor?.uid) {
    return { ok: false, message: "Missing company or voucher.", created: 0 };
  }
  const templateDocId = await getRecurringTemplateDocIdForVoucher(companyId, initialSourceVoucherId);
  const tplSnap = await getDoc(doc(firestore, `companies/${companyId}/${RECURRING_TEMPLATE_COLLECTION}`, templateDocId));
  if (!tplSnap.exists()) return { ok: false, message: "No Auto Monthly template for this voucher.", created: 0 };
  const template0 = tplSnap.data() as RecurringVoucherTemplate;
  if (!template0.enabled) return { ok: false, message: "Auto Monthly is off.", created: 0 };

  const now = new Date();
  const slots = await listMissingRecurringPeriodSlotsAscending(companyId, templateDocId, template0, now);
  if (slots.length === 0) {
    return { ok: false, message: "No missing months in this range.", created: 0 };
  }
  return generateRecurringVouchersForPeriodSlots(companyId, company, initialSourceVoucherId, actor, slots);
}

export async function generateDueRecurringVouchersOnAppOpen(
  companyId: string,
  company: Company | null,
  actor: GenerateActor,
  options?: { hasTriggerPermission?: boolean },
): Promise<void> {
  if (!companyId?.trim() || !actor?.uid) return;
  if (!isRecurringVoucherGenerationEnabled(company)) return;
  if (!canRunRecurringAutoOnAppOpen(company, actor.uid, actor.email, options?.hasTriggerPermission === true)) return;

  const now = new Date();
  const bsNow = adToBs(now);
  const periodKey = toPeriodKey(bsNow.y, bsNow.m);
  const templatesSnap = await getDocs(
    query(collection(firestore, `companies/${companyId}/${RECURRING_TEMPLATE_COLLECTION}`), where("enabled", "==", true)),
  );
  if (templatesSnap.empty) return;

  for (const templateDoc of templatesSnap.docs) {
    const template = templateDoc.data() as RecurringVoucherTemplate;
    const templateId = templateDoc.id;
    if (!template.sourceVoucherId) continue;

    if (!isBsScheduleDueToday(template, bsNow)) continue;

    await maybeMarkDeletedAutoVoucherSuppressed(companyId, templateId, template, periodKey);
    const tplAfter = (await getDoc(doc(firestore, `companies/${companyId}/${RECURRING_TEMPLATE_COLLECTION}`, templateId))).data() as RecurringVoucherTemplate;
    const suppressed = Array.isArray(tplAfter.suppressedPeriodKeys) ? tplAfter.suppressedPeriodKeys : [];
    if (suppressed.includes(periodKey)) continue;

    if (tplAfter.lastGeneratedPeriodKey === periodKey && tplAfter.lastGeneratedVoucherId) {
      const vSnap = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, tplAfter.lastGeneratedVoucherId));
      if (vSnap.exists() && (vSnap.data() as any)?.isDeleted !== true) continue;
    }

    const lockRef = doc(firestore, `companies/${companyId}/${RECURRING_LOCK_COLLECTION}`, `${templateId}_${periodKey}`);
    let lockAcquired = false;
    try {
      await runTransaction(firestore, async (tx) => {
        const lockSnap = await tx.get(lockRef);
        if (lockSnap.exists()) throw new Error("LOCK_EXISTS");
        tx.set(lockRef, {
          templateId,
          periodKey,
          createdAt: serverTimestamp(),
          createdBy: actor.uid,
        });
      });
      lockAcquired = true;
    } catch (error) {
      if (String((error as Error)?.message || "").includes("LOCK_EXISTS")) continue;
      continue;
    }

    try {
      const refreshed = (await getDoc(doc(firestore, `companies/${companyId}/${RECURRING_TEMPLATE_COLLECTION}`, templateId))).data() as RecurringVoucherTemplate;
      const result = await createOneRecurringVoucherFromTemplate(
        companyId,
        company,
        templateId,
        refreshed,
        periodKey,
        bsNow,
        actor,
      );
      await updateDoc(lockRef, {
        voucherId: result?.id ?? null,
        finishedAt: serverTimestamp(),
      }).catch(() => {});
    } catch (error) {
      if (lockAcquired) {
        await deleteDoc(lockRef).catch(() => {});
      }
      console.error("[recurringVouchers] generation failed", templateId, error);
    }
  }
}

export function getNextBsPeriodFromCurrent(y: number, m: number): { y: number; m: number } {
  return addBsMonths(y, m, 1);
}

/**
 * Next AD calendar day when the scheduler would try to create an auto voucher (BS schedule day in a period).
 * Skips periods already generated (`lastGeneratedPeriodKey`) or suppressed (deleted auto voucher).
 * Caller: `resolveRecurringTemplateProgress` se effective period key lo — recycle-bin last auto ko mat skip karo.
 */
export function getNextRecurringDueAd(
  scheduleBsDay: number,
  now: Date = new Date(),
  lastGeneratedPeriodKey?: string | null,
  suppressedPeriodKeys?: string[] | null,
): Date | null {
  const dayNum = Math.max(1, Math.min(32, Math.floor(scheduleBsDay)));
  const suppressed = new Set(
    Array.isArray(suppressedPeriodKeys) ? suppressedPeriodKeys.map((k) => String(k)) : [],
  );
  const lastPk = lastGeneratedPeriodKey != null && String(lastGeneratedPeriodKey).trim() ? String(lastGeneratedPeriodKey) : null;
  const startBs = adToBs(now);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (let i = 0; i < 24; i++) {
    const { y, m } = addBsMonths(startBs.y, startBs.m, i);
    const pk = toPeriodKey(y, m);
    if (suppressed.has(pk)) continue;
    if (lastPk !== null && lastPk === pk) continue;

    const dim = getBSMonthDays(y)[m - 1] || 30;
    const d = dayNum >= 32 ? dim : Math.min(dayNum, dim);
    let dueAd: Date;
    try {
      dueAd = bsToAd({ y, m, d });
    } catch {
      continue;
    }
    const dueStart = new Date(dueAd.getFullYear(), dueAd.getMonth(), dueAd.getDate());
    if (dueStart < todayStart) continue;
    return dueAd;
  }
  return null;
}
