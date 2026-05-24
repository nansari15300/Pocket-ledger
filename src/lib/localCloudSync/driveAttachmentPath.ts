import { format } from "date-fns";
import { formatBsFromAD } from "@/lib/bs-date";
import type { BSFormatKey } from "@/lib/dateFormatOptions";
import {
  buildPocketLedgerDriveRelativePath,
  sanitizePocketLedgerDriveFileNamePart,
  type PocketLedgerDriveCompanyRef,
} from "@/lib/localCloudSync/pocketLedgerDrivePaths";

const BS_FOLDER_FORMAT = "yyyy-MM-dd" as BSFormatKey;

export type DriveAttachmentDateFolderMode = "ad" | "bs" | "both";

const VOUCHER_TYPE_FOLDER: Record<string, string> = {
  sale: "sales",
  sales: "sales",
  purchase: "purchase",
  payment: "payment",
  payment_out: "payment",
  payment_in: "receipt",
  receipt: "receipt",
  journal: "journal",
  contra: "journal",
  expense: "journal",
  income: "journal",
};

function parseVoucherDate(raw: unknown): Date {
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
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

/** Company country NP ho to user mode; warna hamesha AD folder. */
export function resolveDriveAttachmentDateFolderMode(
  company: Record<string, unknown> | null | undefined
): DriveAttachmentDateFolderMode {
  const country = String(company?.country ?? company?.countryCode ?? "").trim().toUpperCase();
  const stored = String(company?.cloudSyncDriveDateFolderMode ?? "").trim().toLowerCase();
  if (country === "NP" || country === "NEPAL") {
    if (stored === "bs" || stored === "both") return stored;
    if (stored === "ad") return "ad";
    return "ad";
  }
  return "ad";
}

function formatAdDateFolder(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function formatBsDateFolder(date: Date): string {
  const bs = formatBsFromAD(date, BS_FOLDER_FORMAT);
  return bs || formatAdDateFolder(date);
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

function voucherTypeFolder(voucherType: unknown): string {
  const key = String(voucherType ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return VOUCHER_TYPE_FOLDER[key] || "general";
}

/** `{VoucherNo}_{fileName}` — voucher folder nahi, filename prefix. */
export function buildDriveAttachmentFileName(voucherNumber: unknown, originalFileName: unknown): string {
  const vno = sanitizePocketLedgerDriveFileNamePart(String(voucherNumber ?? "V"));
  const base = sanitizePocketLedgerDriveFileNamePart(String(originalFileName ?? "file"));
  return `${vno}_${base}`;
}

/** Full remote path: Pocket Ledger/Co/attachments/{type}/{date}/{VNo_file}. */
export function buildVoucherAttachmentDriveRemotePath(input: {
  ref: PocketLedgerDriveCompanyRef;
  voucherType?: unknown;
  voucherNumber?: unknown;
  voucherDate?: unknown;
  originalFileName?: unknown;
  company?: Record<string, unknown> | null;
}): string {
  const mode = resolveDriveAttachmentDateFolderMode(input.company);
  const typeFolder = voucherTypeFolder(input.voucherType);
  const dateFolder = buildDriveAttachmentDateFolderName(input.voucherDate, mode);
  const fileName = buildDriveAttachmentFileName(input.voucherNumber, input.originalFileName);
  return buildPocketLedgerDriveRelativePath(input.ref, "attachments", typeFolder, dateFolder, fileName);
}
