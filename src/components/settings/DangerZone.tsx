
"use client";

import { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { HandoverManager } from "./HandoverManager";
import { Button } from "../ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2 } from "lucide-react";
import { Input } from "../ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { doc, deleteField, serverTimestamp, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { isCompanyNotFoundError, COMPANY_NOT_SYNCED_MESSAGE } from "@/lib/companyUpdateGuard";

export function DangerZone() {
  const { user, customUser } = useAuth();
  const { company, companyId, allCompanies, clearCompanyId } = useCompany();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCompanyToDeleteId, setSelectedCompanyToDeleteId] = useState<string>("");

  const ownedCompanies = useMemo(() => {
    const list = allCompanies || [];
    return list.filter((c) => {
      if (c.isDeleted) return false;
      if (c.ownerId === user?.uid) return true;
      if (customUser?.role === "SuperAdmin" && c.ownerEmail && user?.email) {
        return c.ownerEmail.toLowerCase().trim() === user.email!.toLowerCase().trim();
      }
      return false;
    });
  }, [allCompanies, user?.uid, user?.email, customUser?.role]);

  const companyToDelete = useMemo(
    () => ownedCompanies.find((c) => c.id === selectedCompanyToDeleteId),
    [ownedCompanies, selectedCompanyToDeleteId]
  );

  const handleDelete = async () => {
    const targetId = selectedCompanyToDeleteId || companyId;
    if (!targetId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Select a company to delete.",
      });
      return;
    }
    const targetCompany = companyToDelete ?? company;
    const targetName = companyToDelete?.name ?? company?.name;
    setIsLoading(true);
    try {
      await updateDoc(doc(firestore, `companies/${targetId}`), {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        movedToAdminRecycleAt: deleteField(),
        deletedBy: user?.uid || "",
      });
      toast({
        title: "Company Moved to Bin",
        description: `"${targetName}" has been moved to the recycle bin.`,
      });
      if (companyId === targetId) clearCompanyId();
      setSelectedCompanyToDeleteId("");
    } catch (error) {
      console.error("Error moving to bin:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: isCompanyNotFoundError(error) ? COMPANY_NOT_SYNCED_MESSAGE : "Failed to move company to bin.",
      });
    } finally {
      setIsLoading(false);
      setIsDeleteDialogOpen(false);
      setDeleteConfirmationText("");
    }
  };

  return (
    <div className="space-y-8">
      <HandoverManager />

      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Delete Company</CardTitle>
          <CardDescription>
            This action will move the company to the recycle bin. You can restore it later from there. This action cannot be undone immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Select company to delete</Label>
            <Select
              value={selectedCompanyToDeleteId || undefined}
              onValueChange={setSelectedCompanyToDeleteId}
            >
              <SelectTrigger className="w-full max-w-sm">
                <SelectValue placeholder="Choose company to delete..." />
              </SelectTrigger>
              <SelectContent>
                {ownedCompanies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        <CardFooter>
          <AlertDialog
            open={isDeleteDialogOpen}
            onOpenChange={(open) => {
              setIsDeleteDialogOpen(open);
              if (!open) setDeleteConfirmationText("");
            }}
          >
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                disabled={ownedCompanies.length === 0 || !selectedCompanyToDeleteId}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Move Company to Recycle Bin
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will move the company &quot;{companyToDelete?.name ?? "selected"}&quot; to the recycle
                  bin. To confirm, please type the company name below.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                placeholder="Type company name to confirm"
              />
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={
                    isLoading ||
                    deleteConfirmationText.trim().toLowerCase() !==
                      (companyToDelete?.name || "").trim().toLowerCase()
                  }
                  className="bg-destructive hover:bg-destructive/90"
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Move to Bin
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      </Card>
    </div>
  );
}
