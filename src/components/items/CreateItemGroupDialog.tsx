
"use client";

import { Loader2 } from "lucide-react";
import { useState, useEffect, useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useIsMobile } from "@/hooks/use-mobile";
import { cnStaticMobileFullscreenDialog } from "@/lib/staticMobileFullscreenDialog";
import { cn } from "@/lib/utils";
import {
  MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS,
  MASTER_DIALOG_FOOTER_ROW_CLASS,
} from "@/lib/masterDialogFooterStyles";
import { BTN_SAVE_NEW_CLASS } from "@/components/vouchers/voucherButtonStyles";
import type { ItemGroup } from "@/components/items/types";
import { MasterEntityNestedGroupFields } from "@/components/entity/MasterEntityNestedGroupFields";
import { isSystemGroupName } from "@/lib/system-group-names";
import { apkCloudCompanyOfflineViewOnly } from "@/lib/apkOnlineFirestoreWritePolicy";
import { useNavigatorOnline } from "@/hooks/useNavigatorOnline";
import { ITEM_ENTITY_GROUP_PRESET } from "@/lib/masterEntityGroupFormPresets";
import { masterEntityGroupCreateChainPendingNames } from "@/lib/masterEntityGroupTreeForm";
import type { MasterEntityGroupCreateChainSlot } from "@/lib/masterEntityGroupTreeForm";
import { saveMasterEntityGroupCreateChain } from "@/lib/masterEntityGroupChainSave";

export function CreateItemGroupDialog({
  onGroupCreated,
  children,
  isOpen,
  onOpenChange,
  groups = [],
}: {
  onGroupCreated: (groupId: string) => void;
  children?: React.ReactNode;
  groups: ItemGroup[];
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [systemBranch, setSystemBranch] = useState(ITEM_ENTITY_GROUP_PRESET.defaultBranch);
  const [chainSlots, setChainSlots] = useState<MasterEntityGroupCreateChainSlot[]>([{}]);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, company } = useCompany();
  const isMobile = useIsMobile();
  const navigatorOnline = useNavigatorOnline();
  const apkOfflineViewOnly = useMemo(
    () => apkCloudCompanyOfflineViewOnly(company, navigatorOnline),
    [company, navigatorOnline]
  );

  const resetForm = () => {
    setChainSlots([{}]);
    setSystemBranch(ITEM_ENTITY_GROUP_PRESET.defaultBranch);
  };

  useEffect(() => {
    const handlePrefill = (event: CustomEvent) => {
      const name = String(event.detail || "").trim();
      setChainSlots(name ? [{ pendingName: name }] : [{}]);
    };
    document.addEventListener(
      ITEM_ENTITY_GROUP_PRESET.prefillEventName,
      handlePrefill as EventListener
    );
    return () => {
      document.removeEventListener(
        ITEM_ENTITY_GROUP_PRESET.prefillEventName,
        handlePrefill as EventListener
      );
    };
  }, []);

  async function handleSubmit(saveAndNew: boolean = false) {
    if (!user || !companyId) {
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: "You must be logged in and have a company selected.",
      });
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

    for (const name of masterEntityGroupCreateChainPendingNames(chainSlots)) {
      if (isSystemGroupName("item", name)) {
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
      const result = await saveMasterEntityGroupCreateChain({
        company,
        companyId,
        userId: user.uid,
        preset: ITEM_ENTITY_GROUP_PRESET,
        systemBranch,
        chainSlots,
      });

      if (result.ok === false) {
        toast({
          variant: "destructive",
          title: result.reason === "duplicate" ? "Duplicate Group Name" : "Error Creating Group",
          description: result.message,
        });
        return;
      }

      const showSyncHint =
        process.env.NEXT_PUBLIC_ENABLE_AUTO_BACKUP_SYNC === "1" &&
        user.uid !== "local_guest_user";
      toast({
        title: showSyncHint ? "Saved. Will sync when online." : "Group Created!",
        description: showSyncHint
          ? `"${result.leafName}" was saved locally and will sync when online.`
          : `"${result.leafName}" has been successfully created.`,
      });
      onGroupCreated(result.lastCreatedId);
      if (saveAndNew) resetForm();
      else onOpenChange?.(false);
    } catch (error) {
      console.error("Error creating group:", error);
      toast({
        variant: "destructive",
        title: "Error Creating Group",
        description: "Group details could not be saved. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent
        className={cnStaticMobileFullscreenDialog(isMobile, "flex flex-col sm:max-w-md")}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("[data-radix-popper-content-wrapper]")) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Create a New Item Group</DialogTitle>
          <DialogDescription>
            System group → Users Parent group → Child group tree. Save par poori chain banti hai.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto min-h-0 flex-1 sm:flex-none sm:overflow-visible space-y-4 py-4">
          <MasterEntityNestedGroupFields
            allGroups={groups}
            config={ITEM_ENTITY_GROUP_PRESET.config}
            topParentOptions={ITEM_ENTITY_GROUP_PRESET.topParentOptions}
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
              <Button type="button" variant="ghost" className={MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS}>
                Cancel
              </Button>
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
              Create Group
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

