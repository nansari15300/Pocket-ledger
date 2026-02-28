
"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "../ui/button";
import { useState } from "react";
import { SetIndividualPasswordsDialog } from "./SetIndividualPasswordsDialog";
import type { Company } from "@/hooks/useCompany";
import { useCompany } from "@/hooks/useCompany";

type SharedUser = {
  email: string;
  name: string;
  role: string;
  password?: string;
};

interface PasswordUpdateConfirmationDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  newPassword: string;
  affectedUsers: SharedUser[];
  onConfirm: (updatedUsers?: SharedUser[]) => void;
}

export function PasswordUpdateConfirmationDialog({
  isOpen,
  onOpenChange,
  newPassword,
  affectedUsers,
  onConfirm,
}: PasswordUpdateConfirmationDialogProps) {
  const [showIndividualPasswordDialog, setShowIndividualPasswordDialog] = useState(false);

  const handleUseNewCompanyPassword = () => {
    onConfirm();
    onOpenChange(false);
  };
  
  const handleSetIndividualPasswords = () => {
    setShowIndividualPasswordDialog(true);
  };

  const handleIndividualPasswordsSet = (updatedUsers: SharedUser[]) => {
    const fullListOfSharedUsers = (company?.sharedWith || []).map((su: SharedUser) => {
        const foundUpdate = updatedUsers.find(u => u.email === su.email);
        return foundUpdate ? { ...su, password: foundUpdate.password } : su;
    });
    onConfirm(fullListOfSharedUsers);
    setShowIndividualPasswordDialog(false);
    onOpenChange(false);
  }

  const { company } = useCompany();

  return (
    <>
      <AlertDialog open={isOpen && !showIndividualPasswordDialog} onOpenChange={onOpenChange}>
        <AlertDialogContent className="max-w-[calc(100vw-1rem)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Password Change</AlertDialogTitle>
            <AlertDialogDescription>
              You've changed the main company password. This will affect{' '}
              <span className="font-bold">{affectedUsers.length}</span> shared user(s) who
              do not have their own separate password. How do you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-wrap gap-2 justify-end sm:justify-center min-w-0">
            <AlertDialogCancel className="shrink-0 h-8 px-3 text-xs sm:text-sm">Cancel</AlertDialogCancel>
            <Button variant="outline" size="sm" className="shrink-0 h-8 text-xs sm:text-sm whitespace-nowrap" onClick={handleSetIndividualPasswords}>
              Set Individual Passwords
            </Button>
            <AlertDialogAction onClick={handleUseNewCompanyPassword} className="shrink-0 h-8 px-3 text-xs sm:text-sm whitespace-nowrap">
              Use New Company Password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {company && (
        <SetIndividualPasswordsDialog
          isOpen={showIndividualPasswordDialog}
          onOpenChange={setShowIndividualPasswordDialog}
          newCompanyPassword={newPassword}
          affectedUsers={affectedUsers}
          onConfirm={handleIndividualPasswordsSet}
          company={company}
        />
      )}
    </>
  );
}
