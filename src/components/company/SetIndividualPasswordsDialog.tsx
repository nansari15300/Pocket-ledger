
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useState } from "react";
import { ScrollArea } from "../ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Eye, EyeOff } from "lucide-react";
import type { Company } from "@/hooks/useCompany";

type SharedUser = {
  email: string;
  name: string;
  role: string;
  password?: string;
};

interface SetIndividualPasswordsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  newCompanyPassword: string;
  affectedUsers: SharedUser[];
  onConfirm: (updatedUsers: SharedUser[]) => void;
  company: Company;
}

export function SetIndividualPasswordsDialog({
  isOpen,
  onOpenChange,
  newCompanyPassword,
  affectedUsers,
  onConfirm,
  company
}: SetIndividualPasswordsDialogProps) {
  const [userPasswords, setUserPasswords] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  const handlePasswordChange = (email: string, password: string) => {
    setUserPasswords((prev) => ({ ...prev, [email]: password }));
  };
  
  const handleToggleShowPassword = (email: string) => {
    setShowPasswords(prev => ({...prev, [email]: !prev[email]}));
  }

  const handleConfirm = () => {
    // Merge the new passwords into the company's full sharedWith list
    const updatedSharedWith = (company.sharedWith || []).map((sharedUser: SharedUser) => {
      if (userPasswords[sharedUser.email]) {
        return { ...sharedUser, password: userPasswords[sharedUser.email] };
      }
      return sharedUser;
    });
    onConfirm(updatedSharedWith);
  };
  
  const handleUseCompanyPassword = (email: string) => {
    handlePasswordChange(email, newCompanyPassword);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Set Individual Passwords</DialogTitle>
          <DialogDescription>
            Assign a new, unique password for each user or apply the new company password.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>New Password</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {affectedUsers.map((user) => (
                        <TableRow key={user.email}>
                            <TableCell>
                                <p className="font-medium">{user.name}</p>
                                <p className="text-xs text-muted-foreground">{user.email}</p>
                            </TableCell>
                            <TableCell>
                                <div className="relative">
                                    <Input 
                                        type={showPasswords[user.email] ? 'text' : 'password'}
                                        placeholder="Enter new password"
                                        value={userPasswords[user.email] || ""}
                                        onChange={(e) => handlePasswordChange(user.email, e.target.value)}
                                    />
                                     <Button
                                        type="button" variant="ghost" size="icon"
                                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                                        onClick={() => handleToggleShowPassword(user.email)}
                                    >
                                        {showPasswords[user.email] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </TableCell>
                            <TableCell className="text-right">
                                <Button variant="link" size="sm" onClick={() => handleUseCompanyPassword(user.email)}>
                                    Use Company Password
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm}>Save All Passwords</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

