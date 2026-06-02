import { format } from "date-fns";
import { formatBsFromAD, adToBs } from "@/lib/bs-date";
import type { BSFormatKey } from "@/lib/dateFormatOptions";
import {
  buildPocketLedgerDriveRelativePath,
  sanitizePocketLedgerDriveFileNamePart,
  POCKET_LEDGER_OPENING_SUB,
  type PocketLedgerDriveCompanyRef,
} from "@/lib/localCloudSync/pocketLedgerDrivePaths";

/** Drive folder BS segment — BSFormatKey (YYYY-MM-DD), date-fns yyyy-MM-dd nahi. */
const BS_FOLDER_FORMAT: BSFormatKey = "YYYY-MM-DD";

/** Valid BS folder: 2082-05-24 — literal yyyy / weekday tokens reject. */
const BS_FOLDER_NAME_RE = /^\d{4}-\d{2}-\d{2}$/;

export type DriveAttachmentDateFolderMode = "ad" | "bs" | "both";

/** Drive attachments branch — collection ke hisaab se folder (type-wise sales/journal nahi). */
const ATTACHMENT_CATEGORY_FOLDER: Record<string, string> = {
  vouchers: "vouchers",
  parties: "parties",
  bank_accounts: "bank",
  staff: "staff",
  company: "company",
  items: "item",
};

/** SQLite collection → Drive folder segment (`attachments/{segment}/{date}/`). */
export function resolveAttachmentCategoryFolder(collection: unknown): string {
  const key = String(collection ?? "")
    .trim()
    .toLowerCase();
  if (ATTACHMENT_CATEGORY_FOLDER[key]) return ATTACHMENT_CATEGORY_FOLDER[key]!;
  const safe = sanitizePocketLedgerDriveFileNamePart(key);
  return safe || "general";
}

function parseVoucherDate(raw: unknown): Date {
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as { toDate?: () => Date; seconds?: number; _seconds?: number };
    // Firestore Timestamp / plain timestamp-object ko AD Date me normalize karo taaki folder date sahi baney.
    if (typeof o.toDate === "function") {
      try {
        const d = o.toDate();
        if (d instanceof Date && !isNaN(d.getTime())) return d;
      } catch {
        /* fallback below */
      }
    }
    const sec = typeof o.seconds === "number" ? o.seconds : o._seconds;
    if (typeof sec === "number" && Number.isFinite(sec)) {
      const d = new Date(sec * 1000);
      if (!isNaN(d.getTime())) return d;
    }
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof raw === "string" && raw.trim()) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

/** Country rule — user change nahi: Nepal → Both, baaki sab countries → AD only. */
export function resolveCountryDriveAttachmentDateFolderMode(
  company: Record<string, unknown> | null | undefined
): DriveAttachmentDateFolderMode {
  const country = String(company?.country ?? "").trim().toUpperCase();
  if (country === "NP" || country === "NEPAL") return "both";
  return "ad";
}

/** @deprecated — `resolveCountryDriveAttachmentDateFolderMode` use karo. */
export function inferDefaultDriveAttachmentDateFolderMode(
  company: Record<string, unknown> | null | undefined
): DriveAttachmentDateFolderMode {
  return resolveCountryDriveAttachmentDateFolderMode(company);
}

/** Upload path — hamesha country rule; purana manifest/local manual choice ignore. */
export function resolveDriveAttachmentDateFolderMode(
  company: Record<string, unknown> | null | undefined
): DriveAttachmentDateFolderMode {
  return resolveCountryDriveAttachmentDateFolderMode(company);
}

function formatAdDateFolder(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function formatBsDateFolder(date: Date): string {
  const bs = formatBsFromAD(date, BS_FOLDER_FORMAT);
  if (bs && BS_FOLDER_NAME_RE.test(bs)) return bs;
  // NepaliDate/format fail par direct BS y-m-d — folder me literal yyyy na aaye.
  try {
    const { y, m, d } = adToBs(date);
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  } catch {
    return formatAdDateFolder(date);
  }
}

/** Nepal: BS / AD / Both — attachments date folder name. */
export function buildDriveAttachmentDateFolderName(
  voucherDate: unknown,
  mode: DriveAttachmentDateFolderMode
): string {
  const d = parseVoucherDate(voucherDate);
  const ad = formatAdDateFolder(d);
  if (mode === "bs") return formatBsDateFolder(d);
  if (mode === "both") return `${formatBsDateFolder(d)}__${ad}`;
  return ad;
}

/** `{VoucherNo}_{fileName}` — date folder ke andar file naam. */
export function buildDriveAttachmentFileName(voucherNumber: unknown, originalFileName: unknown): string {
  const vno = sanitizePocketLedgerDriveFileNamePart(String(voucherNumber ?? "V"));
  const base = sanitizePocketLedgerDriveFileNamePart(String(originalFileName ?? "file"));
  return `${vno}_${base}`;
}

/** Full remote path: Pocket Ledger/Co/attachments/{vouchers|parties|…}/{date}/{VNo_file}. */
export function buildVoucherAttachmentDriveRemotePath(input: {
  ref: PocketLedgerDriveCompanyRef;
  /** SQLite collection — vouchers, parties, bank_accounts, … */
  categoryFolder?: unknown;
  voucherType?: unknown;
  voucherNumber?: unknown;
  voucherDate?: unknown;
  originalFileName?: unknown;
  company?: Record<string, unknown> | null;
}): string {
  const mode = resolveDriveAttachmentDateFolderMode(input.company);
  const typeFolder = resolveAttachmentCategoryFolder(
    input.categoryFolder ?? (input.voucherType != null ? "vouchers" : "general")
  );
  const dateFolder = buildDriveAttachmentDateFolderName(input.voucherDate, mode);
  const fileName = buildDriveAttachmentFileName(input.voucherNumber, input.originalFileName);
  return buildPocketLedgerDriveRelativePath(input.ref, "attachments", typeFolder, dateFolder, fileName);
}

/** Stock / item files — `attachments/item/{date}/{itemCode_file}`. */
export function buildItemAttachmentDriveRemotePath(input: {
  ref: PocketLedgerDriveCompanyRef;
  itemCode?: unknown;
  itemId?: unknown;
  itemDate?: unknown;
  originalFileName?: unknown;
  company?: Record<string, unknown> | null;
}): string {
  const mode = resolveDriveAttachmentDateFolderMode(input.company);
  const dateFolder = buildDriveAttachmentDateFolderName(input.itemDate, mode);
  const code = sanitizePocketLedgerDriveFileNamePart(
    String(input.itemCode ?? input.itemId ?? "item")
  );
  const base = sanitizePocketLedgerDriveFileNamePart(String(input.originalFileName ?? "file"));
  const fileName = `${code}_${base}`;
  return buildPocketLedgerDriveRelativePath(input.ref, "attachments", "item", dateFolder, fileName);
}

const ENTITY_AVATAR_COLLECTION_FOLDER: Record<string, string> = {
  parties: "parties",
  bank_accounts: "bank",
  staff: "staff",
  company: "company",
};

/** Profile photo / logo — `opening/avatars/{parties|staff|bank|company}/{id}_{file}`. */
export function buildOpeningAvatarDriveRemotePath(input: {
  ref: PocketLedgerDriveCompanyRef;
  collection: string;
  entityId: unknown;
  originalFileName?: unknown;
}): string {
  const seg =
    ENTITY_AVATAR_COLLECTION_FOLDER[input.collection] ||
    sanitizePocketLedgerDriveFileNamePart(input.collection);
  const entityPart = sanitizePocketLedgerDriveFileNamePart(String(input.entityId ?? "entity"));
  const base = sanitizePocketLedgerDriveFileNamePart(String(input.originalFileName ?? "avatar"));
  return buildPocketLedgerDriveRelativePath(
    input.ref,
    "opening",
    POCKET_LEDGER_OPENING_SUB.avatars,
    seg,
    `${entityPart}_${base}`
  );
}
