
"use client";

import { Loader2 } from "lucide-react";
import { useState, useEffect, useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";
import {
  MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS,
  MASTER_DIALOG_FOOTER_ROW_CLASS,
} from "@/lib/masterDialogFooterStyles";
import { BTN_SAVE_NEW_CLASS } from "@/components/vouchers/voucherButtonStyles";
import type { ExpenseGroup } from "./types";
import { NestedExpenseGroupFields } from "./NestedExpenseGroupFields";
import { isSystemGroupName } from "@/lib/system-group-names";
import { resolveRecycleBinDuplicate } from "@/lib/recycleBinDuplicate";
import {
  apkCloudCompanyOfflineViewOnly,
} from "@/lib/apkOnlineFirestoreWritePolicy";
import { useNavigatorOnline } from "@/hooks/useNavigatorOnline";
import {
  expenseGroupCreateChainPendingNames,
  trimTrailingEmptyCreateChainSlots,
  type ExpenseGroupCreateChainSlot,
  type ExpenseGroupListBranch,
} from "@/lib/expenseGroupTree";
import { createOneExpenseGroup } from "@/lib/expenseGroupWrite";

export type ExpenseGroupCreatedPayload = {
  id: string;
  name: string;
  parentId: string;
};

export function CreateExpenseGroupDialog({ onGroupCreated, children, isOpen, onOpenChange, groups = [] }: { 
    onGroupCreated: (groupId: string, created?: ExpenseGroupCreatedPayload) => void, 
    children?: React.ReactNode, 
    groups: ExpenseGroup[],
    isOpen?: boolean, 
    onOpenChange?: (open: boolean) => void 
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [systemBranch, setSystemBranch] = useState<ExpenseGroupListBranch>("expenses");
  const [chainSlots, setChainSlots] = useState<ExpenseGroupCreateChainSlot[]>([{}]);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, company } = useCompany();
  const navigatorOnline = useNavigatorOnline();
  const apkOfflineViewOnly = useMemo(
    () => apkCloudCompanyOfflineViewOnly(company, navigatorOnline),
    [company, navigatorOnline]
  );

  const resetForm = () => {
    setChainSlots([{}]);
    setSystemBranch("expenses");
  };

  useEffect(() => {
    const handlePrefill = (event: CustomEvent) => {
      const name = String(event.detail || "").trim();
      setChainSlots(name ? [{ pendingName: name }] : [{}]);
    };
    document.addEventListener("prefill-create-expense-group-name", handlePrefill as EventListener);
    return () => {
      document.removeEventListener("prefill-create-expense-group-name", handlePrefill as EventListener);
    };
  }, []);

  async function handleSubmit(saveAndNew: boolean = false) {
    if (!user || !companyId) {
        toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in." });
        return;
    }
    if (apkOfflineViewOnly) {
      toast({
        variant: "destructive",
        title: "Offline — view only",
        description: "Connect to the internet to create a group.",
      });
      return;
    }

    const trimmedChain = trimTrailingEmptyCreateChainSlots(chainSlots);
    const pendingNames = expenseGroupCreateChainPendingNames(chainSlots);

    if (pendingNames.length === 0) {
      toast({
        variant: "destructive",
        title: "Invalid name",
        description: "Group name must be at least 2 characters.",
      });
      return;
    }

    for (const name of pendingNames) {
      if (name.length < 2) {
        toast({
          variant: "destructive",
          title: "Invalid name",
          description: "Group name must be at least 2 characters.",
        });
        return;
      }
      if (isSystemGroupName("expense", name)) {
        toast({
          variant: "destructive",
          title: "System Group Name",
          description: `"${name}" is a system group name. Please use another name.`,
        });
        return;
      }
    }

    setIsLoading(true);
    
    try {
      let parentId: string = systemBranch;
      let lastCreatedId = "";
      let lastCreatedGroup: ExpenseGroupCreatedPayload | null = null;

      for (const slot of trimmedChain) {
        if (slot.groupId) {
          parentId = slot.groupId;
          lastCreatedId = slot.groupId;
          continue;
        }

        const nameTrimmed = String(slot.pendingName || "").trim();
        if (!nameTrimmed) continue;

        const duplicateDecision = await resolveRecycleBinDuplicate({
          companyId,
          collectionName: "expense_groups",
          name: nameTrimmed,
          entityLabel: "Expense Group",
        });
        if (duplicateDecision.decision === "active_exists") {
          toast({
            variant: "destructive",
            title: "Duplicate Group Name",
            description: `A group named "${nameTrimmed}" already exists.`,
          });
          setIsLoading(false);
          return;
        }

        const createParentId = parentId;

        if (duplicateDecision.decision === "restored" && duplicateDecision.restoredId) {
          lastCreatedId = duplicateDecision.restoredId;
          parentId = lastCreatedId;
          lastCreatedGroup = {
            id: lastCreatedId,
            name: nameTrimmed,
            parentId: createParentId,
          };
          continue;
        }

        lastCreatedId = await createOneExpenseGroup({
          company,
          companyId,
          userId: user.uid,
          name: nameTrimmed,
          parentId: createParentId,
        });
        parentId = lastCreatedId;
        lastCreatedGroup = {
          id: lastCreatedId,
          name: nameTrimmed,
          parentId: createParentId,
        };
      }

      if (!lastCreatedId || !lastCreatedGroup) {
        toast({
          variant: "destructive",
          title: "Error Creating Group",
          description: "Group could not be created.",
        });
        setIsLoading(false);
        return;
      }

      const leafPending = pendingNames[pendingNames.length - 1];
      toast({
        title: "Group Created!",
        description: `"${leafPending}" has been successfully created.`,
      });
      onGroupCreated(lastCreatedId, lastCreatedGroup);
      if (saveAndNew) resetForm();
      else if (onOpenChange) onOpenChange(false);
    } catch (error) {
      console.error("Error creating group:", error);
      toast({ variant: "destructive", title: "Error Creating Group", description: "Group details could not be saved." });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
        <DialogPortal>
        <DialogOverlay />
        <DialogContent 
          className="sm:max-w-md z-[60]"
          onPointerDownOutside={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-radix-popper-content-wrapper]')) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Create Income / Expense Groups</DialogTitle>
            <DialogDescription>
              System group → Users Parent group → Child group tree. Parent change par pending naam child me shift hoga. Save par poori chain banti hai.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <NestedExpenseGroupFields
              allGroups={groups}
              systemBranch={systemBranch}
              onSystemBranchChange={setSystemBranch}
              parentPathIds={[]}
              onParentPathIdsChange={() => {}}
              chainSlots={chainSlots}
              onChainSlotsChange={setChainSlots}
              groupName=""
              onGroupNameChange={() => {}}
              mode="create"
              disabled={isLoading || apkOfflineViewOnly}
              formResetKey={isOpen ? "create-open" : "create-closed"}
            />
            <DialogFooter className={MASTER_DIALOG_FOOTER_ROW_CLASS}>
                <DialogClose asChild>
                  <Button type="button" variant="ghost" className={MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS}>Cancel</Button>
                </DialogClose>
                <div className="flex min-w-0 flex-1 justify-center px-1">
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(BTN_SAVE_NEW_CLASS, "shrink-0 px-4")}
                    onClick={() => handleSubmit(true)}
                    disabled={isLoading || apkOfflineViewOnly}
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save & New
                  </Button>
                </div>
                <Button
                  type="button"
                  onClick={() => handleSubmit(false)}
                  disabled={isLoading || !companyId || apkOfflineViewOnly}
                  className="shrink-0"
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Group
                </Button>
            </DialogFooter>
          </div>
        </DialogContent>
        </DialogPortal>
    </Dialog>
  );
}
