/**
 * Inter Company approve — target ya source copy ke hisaab se leg patch merge.
 */
import { buildInterCompanySourceApprovalPatch } from "@/lib/interCompany/interCompanySourceApproval";
import { buildInterCompanyTargetApprovalPatch } from "@/lib/interCompany/interCompanyTargetApproval";

/** Approve par compound legs — viewer side se target ya source builder. */
export function buildInterCompanyApprovalPatch(
  voucher: Record<string, unknown>
): Record<string, unknown> {
  return (
    buildInterCompanyTargetApprovalPatch(voucher) ||
    buildInterCompanySourceApprovalPatch(voucher) ||
    {}
  );
}
