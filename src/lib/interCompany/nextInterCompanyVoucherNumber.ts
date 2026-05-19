/**
 * Inter Company — har company ka apna `inter_company` prefix + next serial (save par).
 */
import { collection, getDocs, query, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { apkEntityWriteUsesLocalSqliteMirror } from "@/lib/apkOnlineFirestoreWritePolicy";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { formatVoucherNumber, normalizePrefix, parseVoucherNumberPart } from "@/lib/voucherNumberFormat";

const DEFAULT_INTER_COMPANY_PREFIX = "IC-";

/** Company doc se inter_company prefix — settings ya default IC- */
export function readInterCompanyVoucherPrefix(companyDoc: Record<string, unknown> | null | undefined): string {
  const configured = companyDoc?.voucherPrefixes as Record<string, string[] | undefined> | undefined;
  const prefixes = configured?.inter_company;
  if (Array.isArray(prefixes) && prefixes[0]) return prefixes[0];
  return DEFAULT_INTER_COMPANY_PREFIX;
}

/** Ek company ke existing inter_company vouchers se agla number */
export async function getNextInterCompanyVoucherNumber(
  companyId: string,
  companyDoc: Record<string, unknown> | null | undefined
): Promise<string> {
  const prefix = readInterCompanyVoucherPrefix(companyDoc);
  const vouchersPath = collection(firestore, `companies/${companyId}/vouchers`);
  const typeQuery = query(vouchersPath, where("type", "==", "inter_company"));
  const fsRows = (await getDocs(typeQuery)).docs.map((d) => d.data() as Record<string, unknown>);
  const localRows = apkEntityWriteUsesLocalSqliteMirror(companyDoc)
    ? await listCompanyDocsFromBrowserDb(companyId, "vouchers")
    : [];
  const mergedRows = [...fsRows, ...localRows].filter((r) => String(r.type || "") === "inter_company");

  let maxNo = 0;
  for (const row of mergedRows) {
    const voucherNo = String(row.voucherNumber || "");
    if (!voucherNo) continue;
    if (!voucherNo.startsWith(prefix) && !voucherNo.startsWith(normalizePrefix(prefix))) continue;
    const parsed = parseVoucherNumberPart(voucherNo, prefix);
    if (Number.isFinite(parsed) && parsed > maxNo) maxNo = parsed;
  }
  return formatVoucherNumber(prefix, maxNo + 1);
}
