import { normalizePartyGroupIdForStorage } from "@/lib/partySystemGroups";
import {
  normalizeBankGroupIdForStorage,
  normalizeStaffGroupIdForStorage,
  normalizeTaxGroupIdForStorage,
} from "@/lib/masterEntitySystemGroups";
import { staffAccountTypeFromRow } from "@/lib/staffSystemGroups";
import { LOAN_LIABILITY_GROUP_ID } from "@/modules/loans/constants/loanConstants";
import { writeEntity, type WriteEntityResult } from "@/lib/writeGateway";
import type { BalanceSheetEntityType } from "@/lib/reports/balanceSheetAccounting";

export function balanceSheetUncategorizedCollection(
  entityType: BalanceSheetEntityType
): string | null {
  switch (entityType) {
    case "party":
    case "opening_balance":
      return "parties";
    case "staff":
      return "staff";
    case "account":
      return "accounts";
    case "tax":
      return "taxes";
    default:
      return null;
  }
}

export function buildBalanceSheetUncategorizedResavePatch(
  entityType: BalanceSheetEntityType,
  entity: Record<string, unknown>
): Record<string, unknown> {
  switch (entityType) {
    case "party":
    case "opening_balance":
      return { groupId: normalizePartyGroupIdForStorage(String(entity.groupId ?? "")) };
    case "staff": {
      const accountType = staffAccountTypeFromRow(entity as { groupId?: string | null; isLoanAccount?: boolean | null });
      return {
        groupId: normalizeStaffGroupIdForStorage(String(entity.groupId ?? ""), accountType),
        isLoanAccount: accountType === LOAN_LIABILITY_GROUP_ID,
      };
    }
    case "account":
      return {
        groupId: normalizeBankGroupIdForStorage(
          String(entity.groupId ?? ""),
          String(entity.accountType ?? "Bank")
        ),
      };
    case "tax":
      return { groupId: normalizeTaxGroupIdForStorage(String(entity.groupId ?? "")) };
    default:
      return {};
  }
}

export async function resaveBalanceSheetUncategorizedAccount(
  companyId: string,
  entityType: BalanceSheetEntityType,
  entity: Record<string, unknown>
): Promise<WriteEntityResult> {
  const collectionName = balanceSheetUncategorizedCollection(entityType);
  const docId = String(entity.id ?? "").trim();
  if (!collectionName || !docId) {
    return { ok: false, error: "Cannot resave this account type." };
  }

  const patch = buildBalanceSheetUncategorizedResavePatch(entityType, entity);
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "Unsupported account type for resave." };
  }

  return writeEntity({
    companyId,
    collectionName,
    docId,
    operation: "update",
    data: patch,
  });
}
