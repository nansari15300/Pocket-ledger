"use client";

import { useMemo, useState } from "react";
import { Combobox } from "@/components/ui/combobox";
import { CreateAccountGroupDialog } from "@/components/bank-cash/CreateAccountGroupDialog";
import { CreateExpenseGroupDialog } from "@/components/expenses/CreateExpenseGroupDialog";
import { CreateStaffGroupDialog } from "@/components/staff/CreateStaffGroupDialog";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useVouchers } from "@/hooks/useVouchers";
import { apkEntityWriteUsesLocalSqliteMirror } from "@/lib/apkOnlineFirestoreWritePolicy";
import {
  buildBankAccountGroupComboboxOptions,
  buildExpenseGroupComboboxOptions,
  buildStaffGroupComboboxOptions,
  normalizeMasterEntityGroupComboboxValue,
} from "@/lib/masterEntityGroupComboboxOptions";
import { saveMasterEntityGroupId } from "@/lib/masterEntityGroupInlineSave";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { LoanAccountingEditKind } from "./LoanAccountingAccountEdit";
import { LOAN_ACCOUNTING_COMBO_TRIGGER_CLASS } from "./LoanAccountingAccountTile";

const PREFILL_EVENT_BY_KIND: Record<LoanAccountingEditKind, string> = {
  bank: "prefill-create-account-group-name",
  staff: "prefill-create-staff-group-name",
  expense: "prefill-create-expense-group-name",
};

const COLLECTION_BY_KIND: Record<LoanAccountingEditKind, "bank_accounts" | "staff" | "expense_accounts"> = {
  bank: "bank_accounts",
  staff: "staff",
  expense: "expense_accounts",
};

const UNGROUPED_ENTITY_BY_KIND: Record<LoanAccountingEditKind, "bank" | "staff" | "expense"> = {
  bank: "bank",
  staff: "staff",
  expense: "expense",
};

export function LoanAccountingGroupPicker({
  kind,
  accountId,
  groupId,
  disabled = false,
  fallbackLabel = "—",
  draftGroupId,
  onDraftGroupChange,
}: {
  kind: LoanAccountingEditKind;
  accountId?: string;
  groupId?: string | null;
  disabled?: boolean;
  fallbackLabel?: string;
  /** When creating a new account, persist group choice on the form until save. */
  draftGroupId?: string | null;
  onDraftGroupChange?: (groupId: string | null) => void;
}) {
  const { user } = useAuth();
  const { companyId, company } = useCompany();
  const {
    processedAccountGroups,
    processedStaffGroups,
    processedExpenseGroups,
    patchMasterEntity,
  } = useVouchers();
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const localSqlMirror = useMemo(() => apkEntityWriteUsesLocalSqliteMirror(company), [company]);

  const groupOptions = useMemo(() => {
    if (kind === "bank") return buildBankAccountGroupComboboxOptions(processedAccountGroups || []);
    if (kind === "staff") return buildStaffGroupComboboxOptions(processedStaffGroups || []);
    return buildExpenseGroupComboboxOptions(processedExpenseGroups || []);
  }, [kind, processedAccountGroups, processedStaffGroups, processedExpenseGroups]);

  const comboboxValue = normalizeMasterEntityGroupComboboxValue(
    UNGROUPED_ENTITY_BY_KIND[kind],
    accountId ? groupId : draftGroupId ?? groupId
  );
  const draftMode = Boolean(onDraftGroupChange && !String(accountId || "").trim());
  const pickerDisabled = disabled || saving || (!draftMode && !accountId);

  const persistGroup = async (nextGroupId: string) => {
    const id = String(accountId || "").trim();
    if (!companyId || !user || !id) {
      if (process.env.NODE_ENV !== "production" && id === "" && !draftMode) {
        console.warn("[LoanAccountingGroupPicker] skip group save — no account id yet (create-new draft uses onDraftGroupChange).");
      }
      return;
    }
    const collection = COLLECTION_BY_KIND[kind];
    const ungrouped = normalizeMasterEntityGroupComboboxValue(UNGROUPED_ENTITY_BY_KIND[kind], null);
    const normalized = nextGroupId === ungrouped ? null : nextGroupId;
    setSaving(true);
    try {
      await saveMasterEntityGroupId({
        companyId,
        collection,
        entityId: id,
        groupId: normalized,
        localSqlMirror,
      });
      patchMasterEntity(collection, id, { groupId: normalized });
    } catch (error) {
      console.error("[LoanAccountingGroupPicker] group save failed", error);
      toast.error("Could not update group");
    } finally {
      setSaving(false);
    }
  };

  const handleChange = async (val: string, newName?: string) => {
    if (val === "add-new") {
      setIsCreateGroupOpen(true);
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent(PREFILL_EVENT_BY_KIND[kind], { detail: newName }));
      }, 100);
      return;
    }
    const ungrouped = normalizeMasterEntityGroupComboboxValue(UNGROUPED_ENTITY_BY_KIND[kind], null);
    const nextGroupId = val === "none" ? ungrouped : val;
    const normalized = nextGroupId === ungrouped ? null : nextGroupId;
    if (draftMode && onDraftGroupChange) {
      onDraftGroupChange(normalized);
      return;
    }
    await persistGroup(nextGroupId);
  };

  const handleGroupCreated = async (newGroupId: string) => {
    setIsCreateGroupOpen(false);
    if (draftMode && onDraftGroupChange) {
      onDraftGroupChange(newGroupId);
      return;
    }
    await persistGroup(newGroupId);
  };

  const triggerClassName = LOAN_ACCOUNTING_COMBO_TRIGGER_CLASS;

  if (pickerDisabled) {
    return (
      <div
        className={cn(triggerClassName, "flex items-center opacity-80")}
        title={fallbackLabel}
      >
        <span className="min-w-0 truncate">{fallbackLabel}</span>
      </div>
    );
  }

  return (
    <>
      <Combobox
        options={groupOptions}
        value={comboboxValue}
        onChange={handleChange}
        placeholder="Select group"
        searchPlaceholder="Search groups..."
        addNewLabel="+ Add New Group"
        disabled={pickerDisabled}
        triggerClassName={triggerClassName}
        popoverModal={false}
      />

      {kind === "bank" ? (
        <CreateAccountGroupDialog
          onGroupCreated={handleGroupCreated}
          isOpen={isCreateGroupOpen}
          onOpenChange={setIsCreateGroupOpen}
          groups={processedAccountGroups || []}
        />
      ) : null}
      {kind === "staff" ? (
        <CreateStaffGroupDialog
          onGroupCreated={handleGroupCreated}
          isOpen={isCreateGroupOpen}
          onOpenChange={setIsCreateGroupOpen}
          groups={processedStaffGroups || []}
        />
      ) : null}
      {kind === "expense" ? (
        <CreateExpenseGroupDialog
          onGroupCreated={handleGroupCreated}
          isOpen={isCreateGroupOpen}
          onOpenChange={setIsCreateGroupOpen}
          groups={processedExpenseGroups || []}
        />
      ) : null}
    </>
  );
}
