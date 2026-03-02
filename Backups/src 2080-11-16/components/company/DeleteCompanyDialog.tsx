
"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "../ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useCompany } from "@/hooks/useCompany";
import type { Company as CompanyData } from "@/hooks/useCompany";
import { DEFAULT_PLANS, type PlanId } from "@/config/plans";
import { Input } from "../ui/input";
import { deleteCompanyComplete } from "@/lib/actions/deleteCompanyAction";
import { useAuth } from "@/hooks/useAuth";

export function DeleteCompanyDialog({
  company,
  onCompanyDeleted,
  children,
  isOpen,
  onOpenChange,
}: {
  company: CompanyData;
  onCompanyDeleted: () => void;
  children?: React.ReactNode;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { clearCompanyId } = useCompany();
  const [confirmationText, setConfirmationText] = useState("");
  const { user } = useAuth(); // ✅ Get current user

  const allowRecycleBin = company.planId ? DEFAULT_PLANS[company.planId as PlanId].entitlements.allowCompanyAdminRecycleBin : false;

  const descriptionText = allowRecycleBin
    ? `This action will PERMANENTLY DELETE the company "${company.name}" and all associated data, including vouchers, parties, items, and uploaded files. This action cannot be undone.`
    : `You will not be able to see this company in your Recycle Bin. This company may be auto-deleted within a year.`;

  // ✅ Updated handleDelete to call the server action
  const handleDelete = async () => {
    if (!user) {
        toast({ variant: "destructive", title: "Authentication Error", description: "You are not logged in."});
        return;
    }
    setIsLoading(true);

    try {
      const result = await deleteCompanyComplete(company.id, user.uid);

      if (result.success) {
        toast({
          title: "Company Permanently Removed",
          description: `"${company.name}" and all its records have been deleted.`,
        });
        clearCompanyId();
        onCompanyDeleted(); // Refresh list
        onOpenChange(false);
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Deletion Failed",
        description: `An error occurred: ${error.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => {
        if (!open) setConfirmationText("");
        onOpenChange(open);
    }}>
      {children && <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            {descriptionText} To confirm, please type the company name 
            <span className="font-bold text-foreground"> {company.name} </span> below.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input 
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            placeholder="Type company name to confirm"
        />
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isLoading || confirmationText.trim().toLowerCase() !== company.name.trim().toLowerCase()}
            className="bg-destructive hover:bg-destructive/90"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Permanently Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
