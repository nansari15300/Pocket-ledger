/**
 * Accepted inter-company joins — permanent (disconnect block; txn sync break na ho).
 */
import { toast } from "sonner";
import {
  readInterCompanyLocalSettings,
  writeInterCompanyLocalSettings,
} from "@/lib/interCompany/interCompanyLocalStore";

export const IC_CANNOT_DISCONNECT_MESSAGE =
  "Cannot disconnect — inter-company transactions may exist. Change search/view settings on the Join tab.";

/** Accept / Firestore accepted sync — partner id permanent list me add */
export function addPermanentInterCompanyJoin(companyId: string, partnerCompanyId: string): void {
  const pid = partnerCompanyId.trim();
  if (!companyId || !pid) return;
  const settings = readInterCompanyLocalSettings(companyId);
  if (settings.permanentJoinedCompanyIds.includes(pid)) return;
  writeInterCompanyLocalSettings(companyId, {
    ...settings,
    permanentJoinedCompanyIds: [...settings.permanentJoinedCompanyIds, pid],
  });
}

/** Join tab checkbox — permanent partner ko uncheck block */
export function isPermanentInterCompanyJoin(companyId: string, partnerCompanyId: string): boolean {
  const pid = partnerCompanyId.trim();
  if (!companyId || !pid) return false;
  return readInterCompanyLocalSettings(companyId).permanentJoinedCompanyIds.includes(pid);
}

export function toastInterCompanyCannotDisconnect(): void {
  toast.error("Cannot disconnect partner", { description: IC_CANNOT_DISCONNECT_MESSAGE });
}
