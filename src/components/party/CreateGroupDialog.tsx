
"use client";

import { Loader2 } from "lucide-react";
import { useState, useEffect, useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";
import {
  MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS,
  MASTER_DIALOG_FOOTER_ROW_CLASS,
} from "@/lib/masterDialogFooterStyles";
import { BTN_SAVE_NEW_CLASS } from "@/components/vouchers/voucherButtonStyles";
import type { Group } from "@/components/party/types";
import { MasterEntityNestedGroupFields } from "@/components/entity/MasterEntityNestedGroupFields";
import { isSystemGroupName } from "@/lib/system-group-names";
import { resolveRecycleBinDuplicate } from "@/lib/recycleBinDuplicate";
import {
  apkCloudCompanyOfflineViewOnly,
} from "@/lib/apkOnlineFirestoreWritePolicy";
import { useNavigatorOnline } from "@/hooks/useNavigatorOnline";
import {
  masterEntityGroupCreateChainPendingNames,
  trimTrailingEmptyCreateChainSlots,
  type MasterEntityGroupCreateChainSlot,
} from "@/lib/masterEntityGroupTreeForm";
import { PARTY_ENTITY_GROUP_PRESET } from "@/lib/masterEntityGroupFormPresets";
import { createOnePartyGroup } from "@/lib/partyGroupWrite";

export function CreateGroupDialog({ onGroupCreated, children, groups = [], isOpen: parentIsOpen, onOpenChange: parentOnOpenChange, confirmLabel = "Create Group", initialSystemBranch }: { 
    onGroupCreated: (groupId: string) => void, 
    children?: React.ReactNode, 
    groups: Group[],
    isOpen?: boolean, 
    onOpenChange?: (open: boolean) => void,
    /** Party form se — "Done" par create + select + dropdown band. */
    confirmLabel?: string,
    initialSystemBranch?: string,
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [systemBranch, setSystemBranch] = useState(PARTY_ENTITY_GROUP_PRESET.defaultBranch);
  const [chainSlots, setChainSlots] = useState<MasterEntityGroupCreateChainSlot[]>([{}]);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, company } = useCompany();
  const isLocalGuestUser = user?.uid === "local_guest_user";
  const backupSyncEnabled = process.env.NEXT_PUBLIC_ENABLE_AUTO_BACKUP_SYNC === "1";
  const navigatorOnline = useNavigatorOnline();
  const apkOfflineViewOnly = useMemo(() => apkCloudCompanyOfflineViewOnly(company, navigatorOnline), [company, navigatorOnline]);

  const isOpen = parentIsOpen !== undefined ? parentIsOpen : internalIsOpen;
  const setOpen = parentOnOpenChange !== undefined ? parentOnOpenChange : setInternalIsOpen;
  const isDialogControlled = parentIsOpen !== undefined;
  const closeDialog = () => setOpen(false);

  const resetForm = () => {
    setChainSlots([{}]);
    setSystemBranch(PARTY_ENTITY_GROUP_PRESET.defaultBranch);
  };

  useEffect(() => {
    if (!isOpen) return;
    if (initialSystemBranch) setSystemBranch(initialSystemBranch);
  }, [isOpen, initialSystemBranch]);

  useEffect(() => {
    const handlePrefill = (event: CustomEvent) => {
      const name = String(event.detail || "").trim();
      setChainSlots(name ? [{ pendingName: name }] : [{}]);
    };
    document.addEventListener("prefill-create-group-name", handlePrefill as EventListener);
    return () => {
      document.removeEventListener("prefill-create-group-name", handlePrefill as EventListener);
    };
  }, []);

  async function handleSubmit(saveAndNew: boolean = false) {
    if (!user) {
        toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in." });
        return;
    }
     if (!companyId) {
        toast({ variant: "destructive", title: "Company Not Selected", description: "Please select a company first." });
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
    const pendingNames = masterEntityGroupCreateChainPendingNames(chainSlots);

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
      if (isSystemGroupName("party", name)) {
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
          collectionName: PARTY_ENTITY_GROUP_PRESET.collection,
          name: nameTrimmed,
          entityLabel: PARTY_ENTITY_GROUP_PRESET.entityLabel,
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
          continue;
        }

        lastCreatedId = await createOnePartyGroup({
          company,
          companyId,
          userId: user.uid,
          name: nameTrimmed,
          parentId: createParentId,
        });
        parentId = lastCreatedId;
      }

      if (!lastCreatedId) {
        toast({
          variant: "destructive",
          title: "Error Creating Group",
          description: "Group could not be created.",
        });
        setIsLoading(false);
        return;
      }

      const leafPending = pendingNames[pendingNames.length - 1];
      const showSyncHint = backupSyncEnabled && !isLocalGuestUser;
      toast({
        title: showSyncHint ? "Saved. Will sync when online." : "Group Created!",
        description: showSyncHint
          ? `"${leafPending}" was saved locally and will sync when online.`
          : `"${leafPending}" has been successfully created.`,
      });
      onGroupCreated(lastCreatedId);
      if (saveAndNew) resetForm();
      else closeDialog();
    } catch (error) {
      console.error("Error creating group:", error);
      toast({ variant: "destructive", title: "Error Creating Group", description: "Group details could not be saved." });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      {isDialogControlled && children}
      <Dialog open={isOpen} onOpenChange={setOpen}>
      {!isDialogControlled && children && (
        <DialogTrigger asChild>{children}</DialogTrigger>
      )}
      <DialogContent
        className="max-h-[85vh] w-[98vw] max-w-[98vw] flex flex-col rounded-xl px-0.5 py-4 sm:max-h-none sm:w-full sm:max-w-md sm:grid sm:flex-none sm:px-6"
        onPointerDownOutside={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("[data-radix-popper-content-wrapper]")) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Create a New Group</DialogTitle>
          <DialogDescription>
            System group → Users Parent group → Child group tree. Save par poori chain banti hai.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto min-h-0 flex-1 sm:flex-none sm:overflow-visible space-y-4 py-4">
          <MasterEntityNestedGroupFields
            allGroups={groups}
            config={PARTY_ENTITY_GROUP_PRESET.config}
            topParentOptions={PARTY_ENTITY_GROUP_PRESET.topParentOptions}
            legacyParentIds={PARTY_ENTITY_GROUP_PRESET.legacyParentIds}
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
                    onClick={() => void handleSubmit(true)}
                    disabled={isLoading || apkOfflineViewOnly}
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save & New
                  </Button>
                </div>
                <Button
                  type="button"
                  onClick={() => void handleSubmit(false)}
                  disabled={isLoading || !companyId || apkOfflineViewOnly}
                  className="shrink-0"
                >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {confirmLabel}
                </Button>
            </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
