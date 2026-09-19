
"use client";

import { useState } from "react";
import { AlertDialog, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { MasterDeleteConfirmAlertDialogContent } from "@/components/common/MasterDeleteConfirmAlertDialog";
import { AlertDialogContent } from "@/components/ui/alert-dialog";
import { permanentDeleteCompanySubdocFromRecycleBin } from "@/lib/recycleBinEntityLifecycle";
import { Button } from "../ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import type { Party } from "@/components/party/types";
import { softDeleteCompanySubdocToRecycleBin } from "@/lib/recycleBinEntityLifecycle";

export function DeletePartyDialog({
  party,
  onPartyDeleted,
  children,
}: {
  party: Party;
  onPartyDeleted: () => void;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId } = useCompany();

  const handlePermanentDelete = async () => {
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    setIsDeleting(true);
    try {
      await permanentDeleteCompanySubdocFromRecycleBin(companyId, "parties", party.id);
      toast({
        title: "Party deleted permanently",
        description: `"${party.name}" was permanently deleted.`,
      });
      onPartyDeleted();
      setIsOpen(false);
    } catch (error) {
      console.error("Error permanently deleting party: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to permanently delete party.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDelete = async () => {
    if(!companyId) {
      toast({ variant: "destructive", title: "Error", description: "No company selected." });
      return;
    }
    setIsDeleting(true);
    try {
      // Local+Drive: SQLite soft-delete + cloud_sync — recycle bin sab devices par.
      const res = await softDeleteCompanySubdocToRecycleBin(companyId, "parties", party.id, user?.uid || "");
      if (!res.ok) throw new Error("error" in res ? res.error : "Failed to move party to bin.");
      toast({
        title: "Party Moved to Bin",
        description: `"${party.name}" has been moved to the recycle bin.`,
      });
      onPartyDeleted();
      setIsOpen(false);
    } catch (error) {
      console.error("Error moving party to bin: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to move party to bin. Please try again.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <MasterDeleteConfirmAlertDialogContent
          entityKind="party"
          entityName={party.name}
          onMoveToBin={handleDelete}
          onDeletePermanently={handlePermanentDelete}
          busy={isDeleting}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}
