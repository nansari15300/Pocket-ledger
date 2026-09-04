
"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { doc, updateDoc } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { firestore } from "@/lib/firebase";
import type { Group } from "@/components/party/types";
import { useCompany } from "@/hooks/useCompany";
import { useNavigatorOnline } from "@/hooks/useNavigatorOnline";
import {
  apkCloudCompanyOfflineViewOnly,
  apkEntityWriteUsesLocalSqliteMirror,
} from "@/lib/apkOnlineFirestoreWritePolicy";
import { getCompanyDocFromBrowserDb, upsertCompanyDocInBrowserDb } from "@/lib/localCompanyDocMirror";
import { enqueueCompanyDocOutbox } from "@/lib/localVoucherOutbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  MASTER_ALERT_DIALOG_CANCEL_GRAY_CLASS,
  MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS,
  MASTER_DIALOG_FOOTER_ROW_CLASS,
} from "@/lib/masterDialogFooterStyles";
import { useAuth } from "@/hooks/useAuth";
import { toast as sonnerToast } from "sonner";
import { cn } from "@/lib/utils";
import { MasterEntityNestedGroupFields } from "@/components/entity/MasterEntityNestedGroupFields";
import {
  decodeMasterEntityGroupParentPath,
  resolveMasterEntityGroupParentIdFromPath,
} from "@/lib/masterEntityGroupTreeForm";
import { PARTY_ENTITY_GROUP_PRESET } from "@/lib/masterEntityGroupFormPresets";
import { createOnePartyGroup } from "@/lib/partyGroupWrite";
import { isSystemGroupName } from "@/lib/system-group-names";
import {
  permanentDeleteCompanySubdocFromRecycleBin,
  softDeleteCompanySubdocToRecycleBin,
} from "@/lib/recycleBinEntityLifecycle";

const systemGroupIds = new Set(["sundry_debtors", "sundry_creditors"]);

export function EditGroupDialog({ group, allGroups, onGroupUpdated, onGroupDeleted, children, hasAccounts }: {
  group: Group;
  allGroups: Group[];
  onGroupUpdated: () => void;
  onGroupDeleted: () => void;
  children: React.ReactNode;
  hasAccounts?: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [systemBranch, setSystemBranch] = useState(PARTY_ENTITY_GROUP_PRESET.defaultBranch);
  const [parentPathIds, setParentPathIds] = useState<string[]>([]);
  const [childPathIds, setChildPathIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const formResetKey = isOpen ? `edit-${group.id}` : "edit-closed";
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, company } = useCompany();
  const navigatorOnline = useNavigatorOnline();
  const localSqlMirror = useMemo(() => apkEntityWriteUsesLocalSqliteMirror(company), [company]);
  const apkOfflineViewOnly = useMemo(() => apkCloudCompanyOfflineViewOnly(company, navigatorOnline), [company, navigatorOnline]);
  const liveGroup = useMemo(
    () => allGroups.find((g) => g.id === group.id) || group,
    [allGroups, group]
  );
  const isSystemGroup = systemGroupIds.has(group.id);
  const hasDirectChildGroups = useMemo(
    () => allGroups.some((g) => g?.id && g.id !== group.id && String(g.parentId || "").trim() === group.id),
    [allGroups, group.id]
  );
  const canDeleteGroup =
    !isSystemGroup && !hasAccounts && !hasDirectChildGroups && !apkOfflineViewOnly;

  useEffect(() => {
    if (isOpen) {
      const decoded = decodeMasterEntityGroupParentPath(
        liveGroup,
        allGroups,
        PARTY_ENTITY_GROUP_PRESET.config,
        { legacyParentIds: PARTY_ENTITY_GROUP_PRESET.legacyParentIds }
      );
      setGroupName(liveGroup.name || "");
      setSystemBranch(decoded.systemBranch);
      setParentPathIds(decoded.parentPathIds);
      setChildPathIds([]);
    }
  }, [isOpen, liveGroup, allGroups]);

  const handleAddNewParentAtLevel = useCallback(
    async (levelIndex: number, name: string) => {
      if (!user || !companyId || !name.trim()) return;
      if (isSystemGroupName("party", name.trim())) {
        toast({
          variant: "destructive",
          title: "System Group Name",
          description: `"${name}" is a system group name.`,
        });
        return;
      }
      const parentId =
        levelIndex <= 1
          ? group.id
          : childPathIds[levelIndex - 2] || group.id;
      try {
        const newId = await createOnePartyGroup({
          company,
          companyId,
          userId: user.uid,
          name: name.trim(),
          parentId,
        });
        const next = [...childPathIds];
        next[levelIndex - 1] = newId;
        setChildPathIds(next.slice(0, levelIndex));
        toast({ title: "Group added", description: `"${name.trim()}" parent list me add ho gaya.` });
      } catch (error) {
        console.error("Error creating parent group:", error);
        toast({ variant: "destructive", title: "Error", description: "Parent group create nahi ho saka." });
      }
    },
    [user, companyId, company, group.id, childPathIds, toast]
  );

  function handleSubmit(): void {
    if (!companyId || !user) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    if (apkOfflineViewOnly) {
      sonnerToast.error("Offline — view only.");
      return;
    }
    if (isSystemGroup) return;

    const editedName = groupName.trim();
    if (editedName.length < 2) {
      toast({
        variant: "destructive",
        title: "Invalid name",
        description: "Group name must be at least 2 characters.",
      });
      return;
    }
    if (isSystemGroupName("party", editedName)) {
      toast({
        variant: "destructive",
        title: "System Group Name",
        description: "This is a system group name. Please use another name.",
      });
      return;
    }

    const resolvedParentId = resolveMasterEntityGroupParentIdFromPath(systemBranch, parentPathIds);
    const gid = group.id;
    setIsOpen(false);

    void (async () => {
      setIsLoading(true);
      try {
        if (localSqlMirror) {
          const fromDb = await getCompanyDocFromBrowserDb(companyId, "groups", gid);
          const base: Record<string, unknown> =
            (fromDb as Record<string, unknown> | null) ?? {
              id: gid,
              companyId,
              ownerId: user.uid,
              name: group.name,
              parentId: group.parentId || "",
              isDeleted: false,
            };
          const payload: Record<string, unknown> = {
            ...base,
            id: gid,
            companyId,
            name: editedName,
            parentId: resolvedParentId,
          };
          await upsertCompanyDocInBrowserDb(companyId, "groups", gid, payload);
          await enqueueCompanyDocOutbox(companyId, "groups", "update", gid, payload);
          toast({ title: "Group Updated!", description: `"${editedName}" saved locally — will sync when online.` });
          onGroupUpdated();
          return;
        }

        const groupRef = doc(firestore, `companies/${companyId}/groups`, gid);
        await updateDoc(groupRef, {
          name: editedName,
          parentId: resolvedParentId,
        });

        toast({ title: "Group Updated!", description: `"${editedName}" has been successfully updated.` });
        onGroupUpdated();
      } catch (error) {
        console.error("Error updating group:", error);
        toast({ variant: "destructive", title: "Error Updating Group", description: "An error occurred. Please try again." });
      } finally {
        setIsLoading(false);
      }
    })();
  }

  const handleMoveToBin = async () => {
    if (!companyId || !user?.uid) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    if (hasAccounts || hasDirectChildGroups) {
      sonnerToast.error("Cannot Delete", {
        description: hasDirectChildGroups
          ? "This group has nested child groups and cannot be deleted."
          : "This group has accounts and cannot be deleted.",
      });
      setIsDeleteDialogOpen(false);
      return;
    }
    if (apkOfflineViewOnly) {
      sonnerToast.error("Offline — view only.");
      setIsDeleteDialogOpen(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await softDeleteCompanySubdocToRecycleBin(companyId, "groups", group.id, user.uid);
      if (!res.ok) {
        throw new Error("error" in res ? res.error : "Move to bin failed");
      }
      toast({ title: "Group Moved to Recycle Bin", description: `"${group.name}" has been moved.` });
      onGroupDeleted();
      setIsOpen(false);
    } catch (error) {
      console.error("Error moving group to bin:", error);
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: "An error occurred while moving the group to the recycle bin.",
      });
    } finally {
      setIsLoading(false);
      setIsDeleteDialogOpen(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    if (hasAccounts || hasDirectChildGroups) {
      sonnerToast.error("Cannot Delete", {
        description: hasDirectChildGroups
          ? "This group has nested child groups and cannot be deleted."
          : "This group has accounts and cannot be deleted.",
      });
      setIsDeleteDialogOpen(false);
      return;
    }
    if (apkOfflineViewOnly) {
      sonnerToast.error("Offline — view only.");
      setIsDeleteDialogOpen(false);
      return;
    }
    setIsLoading(true);
    try {
      await permanentDeleteCompanySubdocFromRecycleBin(companyId, "groups", group.id);
      toast({
        title: "Group Deleted Permanently",
        description: `"${group.name}" has been permanently removed.`,
      });
      onGroupDeleted();
      setIsOpen(false);
    } catch (error) {
      console.error("Error permanently deleting group:", error);
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: "An error occurred while permanently deleting the group.",
      });
    } finally {
      setIsLoading(false);
      setIsDeleteDialogOpen(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Group</DialogTitle>
            <DialogDescription>
              System group → Users Parent group → Child group. Add Child group se unlimited tree depth.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <MasterEntityNestedGroupFields
              allGroups={allGroups}
              config={PARTY_ENTITY_GROUP_PRESET.config}
              topParentOptions={PARTY_ENTITY_GROUP_PRESET.topParentOptions}
              legacyParentIds={PARTY_ENTITY_GROUP_PRESET.legacyParentIds}
              excludeGroupId={group.id}
              systemBranch={systemBranch}
              onSystemBranchChange={setSystemBranch}
              parentPathIds={parentPathIds}
              onParentPathIdsChange={setParentPathIds}
              childPathIds={childPathIds}
              onChildPathIdsChange={setChildPathIds}
              onAddNewAtLevel={(level, name) => void handleAddNewParentAtLevel(level, name)}
              groupName={groupName}
              onGroupNameChange={setGroupName}
              mode="edit"
              editingGroup={liveGroup}
              disabled={isLoading || isSystemGroup || apkOfflineViewOnly}
              formResetKey={formResetKey}
              editLevel0Trailing={
                canDeleteGroup ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setIsDeleteDialogOpen(true)}
                          disabled={isLoading}
                          aria-label="Delete group"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Delete empty group</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : null
              }
            />
            <DialogFooter className={MASTER_DIALOG_FOOTER_ROW_CLASS}>
                <DialogClose asChild>
                  <Button type="button" variant="ghost" className={MASTER_DIALOG_CANCEL_GRAY_PILL_BTN_CLASS}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={isLoading || isSystemGroup || apkOfflineViewOnly}
                  className="ml-auto shrink-0"
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete group?</AlertDialogTitle>
            <AlertDialogDescription>
              Choose how to remove{" "}
              <span className="font-semibold text-foreground">{group.name}</span>. This group has no
              accounts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-row flex-nowrap items-center gap-2 sm:flex-row sm:justify-stretch sm:space-x-0">
            <AlertDialogCancel
              className={cn(MASTER_ALERT_DIALOG_CANCEL_GRAY_CLASS, "min-w-0 flex-1")}
              disabled={isLoading}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              className="min-w-0 flex-1"
              onClick={() => void handleMoveToBin()}
              disabled={isLoading || apkOfflineViewOnly}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Move to Bin
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-w-0 flex-1 px-2 text-xs sm:px-3 sm:text-sm"
              onClick={() => void handlePermanentDelete()}
              disabled={isLoading || apkOfflineViewOnly}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete permanently
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
