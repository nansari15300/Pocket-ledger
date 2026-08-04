/**
 * Agla voucher number: local company par SQLite (`company_docs`) se serial —
 * Firestore-only query par hamesha 001 reh jata tha.
 */
import { collection, getDocs, query, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { apkEntityWriteUsesLocalSqliteMirror } from "@/lib/apkOnlineFirestoreWritePolicy";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { formatVoucherNumber, normalizePrefix, parseVoucherNumberPart } from "@/lib/voucherNumberFormat";

export const DEFAULT_VOUCHER_PREFIX_LABELS: Record<string, string> = {
  sale: "Sale Inv",
  sale_service: "SS-",
  purchase: "PUR-",
  purchase_service: "PS-",
  payment_in: "RCPT-",
  payment_out: "PYMT-",
  direct_income: "DINC-",
  direct_expense: "DEXP-",
  contra: "CNTR-",
  journal: "JRNL-",
  adjustment: "ADJ-",
  note: "NOTE-",
  add_salary: "ADD-SAL-",
  pay_salary: "PAY-SAL-",
  production: "PROD-",
  inter_company: "IC-",
};

export function getVoucherPrefixKeyFromLike(v: {
  type?: string;
  subType?: string;
  lineItems?: Array<{ type?: string }>;
}): string {
  if (v.type === "journal" && v.subType === "add_salary") return "add_salary";
  if (v.type === "payment_out" && v.subType === "pay_salary") return "pay_salary";
  if (v.type === "sale") return v.lineItems?.[0]?.type === "service" ? "sale_service" : "sale";
  if (v.type === "purchase") return v.lineItems?.[0]?.type === "service" ? "purchase_service" : "purchase";
  return String(v.type || "sale");
}

function filterVoucherRowsForSerial(
  rows: Array<Record<string, unknown>>,
  voucherLike: { type?: string; subType?: string; lineItems?: Array<{ type?: string }> }
): Array<Record<string, unknown>> {
  return rows.filter((r) => {
    if (voucherLike.type === "sale" || voucherLike.type === "purchase") {
      const srcLineType = voucherLike?.lineItems?.[0]?.type || "item";
      const rowLineType = (r as { lineItems?: Array<{ type?: string }> })?.lineItems?.[0]?.type || "item";
      return srcLineType === rowLineType;
    }
    if (voucherLike.type === "journal" && voucherLike.subType === "add_salary") return r.subType === "add_salary";
    if (voucherLike.type === "payment_out" && voucherLike.subType === "pay_salary") return r.subType === "pay_salary";
    if (voucherLike.type === "journal") return r.subType !== "add_salary";
    if (voucherLike.type === "payment_out") return r.subType !== "pay_salary";
    return String(r.type || "") === String(voucherLike.type || "");
  });
}

function parseContraVoucherSerial(voucherNo: string, prefix: string): number {
  const trimmed = (voucherNo || "").trim();
  if (!trimmed) return NaN;
  const base = normalizePrefix(prefix);
  const tryPrefixes = [`${base} Out`, `${base} In`, prefix, base];
  for (const p of tryPrefixes) {
    const parsed = parseVoucherNumberPart(trimmed, p);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return NaN;
}

function maxSerialForPrefix(
  rows: Array<Record<string, unknown>>,
  prefix: string,
  voucherType: string | undefined
): number {
  let maxNo = 0;
  for (const row of rows) {
    const voucherCandidates =
      voucherType === "contra"
        ? [
            String((row as { voucherNumberOut?: string }).voucherNumberOut || ""),
            String((row as { voucherNumberIn?: string }).voucherNumberIn || ""),
            String(row.voucherNumber || ""),
          ]
        : voucherType === "production"
          ? [String((row as { productionNumber?: string }).productionNumber || ""), String(row.voucherNumber || "")]
          : [String(row.voucherNumber || "")];
    for (const voucherNo of voucherCandidates) {
      if (!voucherNo) continue;
      const parsed =
        voucherType === "contra"
          ? parseContraVoucherSerial(voucherNo, prefix)
          : (() => {
              if (!voucherNo.startsWith(prefix) && !voucherNo.startsWith(normalizePrefix(prefix))) return NaN;
              return parseVoucherNumberPart(voucherNo, prefix);
            })();
      if (Number.isFinite(parsed) && parsed > maxNo) maxNo = parsed;
    }
  }
  return maxNo;
}

function dedupeVoucherRowsById(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const id = String((row as { id?: string }).id || "").trim();
    if (id) map.set(id, row);
  }
  return map.size > 0 ? [...map.values()] : rows;
}

export type GetNextVoucherNumberParams = {
  companyId: string;
  companyDoc: Record<string, unknown> | null | undefined;
  voucherLike: {
    type: string;
    subType?: string;
    lineItems?: Array<{ type?: string }>;
  };
  /** Form prefix dropdown se override */
  selectedPrefix?: string;
};

/** Local SQLite + cloud merge se agla formatted voucher number (e.g. `JRNL - 002`). */
export async function getNextVoucherNumberForCompany(params: GetNextVoucherNumberParams): Promise<string> {
  const { companyId, companyDoc, voucherLike, selectedPrefix } = params;
  const prefixKey = getVoucherPrefixKeyFromLike(voucherLike);
  const configured = (companyDoc?.voucherPrefixes as Record<string, string[] | undefined> | undefined)?.[prefixKey];
  const prefix =
    selectedPrefix?.trim() ||
    (Array.isArray(configured) && configured[0] ? configured[0] : DEFAULT_VOUCHER_PREFIX_LABELS[prefixKey] || "V-");

  const readSqlite =
    apkEntityWriteUsesLocalSqliteMirror(companyDoc as { storageOption?: string }) ||
    (companyDoc != null && isOfflineCompanyStorage(companyDoc as { storageOption?: string }));
  const pureLocal =
    companyDoc != null && isOfflineCompanyStorage(companyDoc as { storageOption?: string });

  const fsCompanyId = String(
    (companyDoc as { authoritativeCompanyId?: string } | null | undefined)?.authoritativeCompanyId || companyId
  ).trim();

  let fsRows: Array<Record<string, unknown>> = [];
  if (!pureLocal) {
    try {
      const vouchersPath = collection(firestore, `companies/${fsCompanyId}/vouchers`);
      const typeQuery = query(vouchersPath, where("type", "==", String(voucherLike.type || "sale")));
      fsRows = (await getDocs(typeQuery)).docs.map((d) => ({ ...d.data(), id: d.id }) as Record<string, unknown>);
    } catch {
      fsRows = [];
    }
  }

  const localRows = readSqlite
    ? await listCompanyDocsFromBrowserDb(companyId, "vouchers", { forBackupMerge: true })
    : [];

  const mergedRows = filterVoucherRowsForSerial(
    dedupeVoucherRowsById([...fsRows, ...localRows]),
    voucherLike
  );
  const maxNo = maxSerialForPrefix(mergedRows, prefix, voucherLike.type);
  return formatVoucherNumber(prefix, maxNo + 1);
}
