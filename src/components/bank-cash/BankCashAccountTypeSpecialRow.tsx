"use client";

import type { Control, UseFormReturn } from "react-hook-form";
import type { AccountGroup } from "@/components/bank-cash/types";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { BANK_ENTITY_GROUP_PRESET } from "@/lib/masterEntityGroupFormPresets";
import {
  BANK_SYSTEM_BANK_BRANCH_ID,
  BANK_SYSTEM_CASH_BRANCH_ID,
  getDefaultSystemGroupId,
} from "@/lib/masterEntitySystemGroups";
import { resolveMasterGroupTreeBranchIdForGroup } from "@/lib/masterGroupTreeCombobox";
import { cn } from "@/lib/utils";

type AccountTypeForm = {
  accountType: "Bank" | "Cash";
  groupId?: string;
  isSpecial?: boolean;
};

/** Bank/Cash add/edit — Bank | Cash | Special switch ek hi row (Cash ke right). */
export function BankCashAccountTypeSpecialRow<T extends AccountTypeForm>({
  control,
  form,
  processedAccountGroups,
  showSpecialSwitch,
  className,
}: {
  control: Control<T>;
  form: UseFormReturn<T>;
  processedAccountGroups: AccountGroup[];
  showSpecialSwitch: boolean;
  className?: string;
}) {
  return (
    <FormField
      control={control}
      name={"accountType" as any}
      render={({ field }) => (
        <FormItem className={cn("space-y-2", className)}>
          <FormLabel>Account Type</FormLabel>
          <div className="flex flex-row flex-nowrap items-center gap-x-3 gap-y-0 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch]">
            <FormControl>
              <RadioGroup
                className="flex shrink-0 flex-row flex-nowrap items-center gap-x-3"
                value={field.value}
                onValueChange={(next: "Bank" | "Cash") => {
                  field.onChange(next);
                  const currentBranch = resolveMasterGroupTreeBranchIdForGroup(
                    form.getValues("groupId" as any),
                    processedAccountGroups,
                    BANK_ENTITY_GROUP_PRESET
                  );
                  const expectedBranch =
                    next === "Cash" ? BANK_SYSTEM_CASH_BRANCH_ID : BANK_SYSTEM_BANK_BRANCH_ID;
                  if (currentBranch !== expectedBranch) {
                    form.setValue(
                      "groupId" as any,
                      getDefaultSystemGroupId("bank", { accountType: next }),
                      { shouldDirty: true }
                    );
                  }
                }}
              >
                <FormItem className="flex items-center space-x-2 space-y-0">
                  <FormControl>
                    <RadioGroupItem value="Bank" />
                  </FormControl>
                  <FormLabel className="cursor-pointer whitespace-nowrap text-sm font-normal">
                    Bank Account
                  </FormLabel>
                </FormItem>
                <FormItem className="flex items-center space-x-2 space-y-0">
                  <FormControl>
                    <RadioGroupItem value="Cash" />
                  </FormControl>
                  <FormLabel className="cursor-pointer whitespace-nowrap text-sm font-normal">
                    Cash in Hand
                  </FormLabel>
                </FormItem>
              </RadioGroup>
            </FormControl>
            {showSpecialSwitch ? (
              <FormField
                control={control}
                name={"isSpecial" as any}
                render={({ field: specialField }) => (
                  <FormItem className="flex shrink-0 items-center gap-2 space-y-0 border-l border-border/60 pl-3">
                    <FormLabel className="cursor-pointer whitespace-nowrap text-sm font-normal">
                      Special Account
                    </FormLabel>
                    <FormControl>
                      <Switch
                        checked={specialField.value === true}
                        onCheckedChange={specialField.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            ) : null}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
