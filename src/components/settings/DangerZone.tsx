
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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { getLocalCompanyById, upsertLocalCompany } from "@/lib/localCompanyStore";
import type { Company } from "@/hooks/useCompany";
import { sendRecycleBinMovedAlert } from "@/lib/transactionAlerts";
import {
  isOnlineCompanyRow,
  isDeviceLocalCompany,
  buildDuplicateNameCountMap,
  companySelectOptionLabel,
  mergeOwnedCompaniesForUser,
} from "@/lib/companyStorageKind";
import { resolveCompanyIsOwnedForUser } from "@/lib/companyOnlineIntegrity";

export function DangerZone() {
  const { user, customUser } = useAuth();
  const { company, companyId, allCompanies, allCompaniesRegistry, clearCompanyId, reloadLocalCompanyRegistry, triggerSync } = useCompany();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCompanyToDeleteId, setSelectedCompanyToDeleteId] = useState<string>("");

  const ownedCompanies = useMemo(() => {
    const shareUser = { uid: user?.uid || "", email: user?.email ?? null };
    return mergeOwnedCompaniesForUser(
      [allCompaniesRegistry || [], allCompanies || []],
      user?.uid ? shareUser : null,
      (c, u) => {
        if (resolveCompanyIsOwnedForUser(c, u)) return true;
        if (customUser?.role === "SuperAdmin" && c.ownerEmail && u.email) {
          return c.ownerEmail.toLowerCase().trim() === u.email.toLowerCase().trim();
        }
        return false;
      }
    );
  }, [allCompanies, allCompaniesRegistry, user?.uid, user?.email, customUser?.role]);

  const companyToDelete = useMemo(
    () => ownedCompanies.find((c) => c.id === selectedCompanyToDeleteId),
    [ownedCompanies, selectedCompanyToDeleteId]
  );

  const { localCompaniesToDelete, onlineCompaniesToDelete } = useMemo(() => {
    const local: Company[] = [];
    const online: Company[] = [];
    for (const c of ownedCompanies) {
      if (isDeviceLocalCompany(c)) local.push(c);
      else online.push(c);
    }
    return { localCompaniesToDelete: local, onlineCompaniesToDelete: online };
  }, [ownedCompanies]);

  const duplicateNameCountMap = useMemo(() => buildDuplicateNameCountMap(ownedCompanies), [ownedCompanies]);

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
      const existingLocalCompany = await getLocalCompanyById(targetId, { includeDeleted: true });
      const isOnline =
        (targetCompany && isOnlineCompanyRow(targetCompany)) ||
        (!!existingLocalCompany && isOnlineCompanyRow(existingLocalCompany as Company));

      const moveToBinUpdate = {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        movedToAdminRecycleAt: deleteField(),
      };

      // Online: Firestore; local-only (basic/web SQLite): sirf upsert — web par Firestore doc nahi hota
      if (isOnline) {
        await updateDoc(doc(firestore, `companies/${targetId}`), moveToBinUpdate);
      }
      if (existingLocalCompany) {
        await upsertLocalCompany({
          ...existingLocalCompany,
          id: targetId,
          isDeleted: true,
          deletedAt: Date.now(),
        });
      } else if (!isOnline) {
        throw new Error("Local company not found");
      }
      toast({
        title: "Company Moved to Bin",
        description: `"${targetName}" has been moved to the recycle bin.`,
      });
      void sendRecycleBinMovedAlert(targetId, targetCompany ?? null, {
        entityKind: "company",
        entityId: targetId,
        entityName: String(targetName || "Company"),
        performedByUserId: user?.uid,
        performedByEmail: user?.email ?? undefined,
        performedByName: user?.displayName ?? customUser?.displayName ?? undefined,
      });
      if (companyId === targetId) clearCompanyId();
      setSelectedCompanyToDeleteId("");
      reloadLocalCompanyRegistry();
      triggerSync();
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
                {localCompaniesToDelete.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-xs font-semibold text-muted-foreground">Local</SelectLabel>
                    {localCompaniesToDelete.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                            Local
                          </span>
                          <span className="truncate">{companySelectOptionLabel(c, duplicateNameCountMap)}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {onlineCompaniesToDelete.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-xs font-semibold text-muted-foreground">Online (cloud)</SelectLabel>
                    {onlineCompaniesToDelete.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <span className="rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0 text-[10px] font-medium text-sky-800 dark:text-sky-300">
                            Online
                          </span>
                          <span className="truncate">{companySelectOptionLabel(c, duplicateNameCountMap)}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
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
