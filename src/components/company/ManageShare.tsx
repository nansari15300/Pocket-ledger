
"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { doc, onSnapshot, updateDoc, arrayRemove, getDoc, collection, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Crown, Loader2, PlusCircle, Trash2, Save, Undo2, KeyRound, Eye, EyeOff, Edit, Pencil, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "../ui/skeleton";
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
import { Input } from "../ui/input";
import { ShareCompanyDialog } from "../company/ShareCompanyDialog";
import { Checkbox } from "../ui/checkbox";
import { Switch } from "../ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Permission, PermissionGroups } from "@/lib/permissions";
import usePermissions, { type PermissionConfig, type UserRole, initialPermissionConfig } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { isCompanyNotFoundError, COMPANY_NOT_SYNCED_MESSAGE } from "@/lib/companyUpdateGuard";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import { readCloudSyncConfigFromCompany } from "@/lib/localCloudSync/companyConfig";
import { LocalDriveShareManagePanel } from "@/components/company/LocalDriveShareManagePanel";
import { resolveEffectiveAccountPlanId } from "@/lib/accountPlanForOwner";
import { updateCompanyDocRoot } from "@/lib/companyDocsClient";
import { getLocalCompanyById, upsertLocalCompany, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getPlanFromPlans, useLivePlans } from "@/hooks/useLivePlans";
import { getNextPaidUpgrade, numericEntitlement, companyStorageIsLocal, type PlanId } from "@/config/plans";
import { getSuperAdminEmails } from "@/lib/superAdminEmails";
import {
  companyProfileChromeRoot,
  companyProfileGreenZone,
  companyProfilePageBg,
  companyProfileTabsList3,
  companyProfileTabsTrigger,
  settingsDetailCardShell,
} from "@/lib/companyProfileChrome";

type SharedUser = {
  email: string;
  name: string;
  role: UserRole;
  password?: string;
  photoURL?: string;
};

const normalizeEmail = (email?: string) => (email || "").trim().toLowerCase();

const getAvatarUrl = (email: string, photoURL?: string) => {
  if (photoURL && photoURL.trim()) return photoURL;
  // fallback avatar (always works)
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(email)}`;
};

const getInitials = (nameOrEmail: string) => {
  const s = (nameOrEmail || "").trim();
  if (!s) return "U";
  const parts = s.includes("@") ? s.split("@")[0].split(/[.\s_-]+/) : s.split(/\s+/);
  return parts.slice(0, 2).map(p => p[0]?.toUpperCase()).join("") || "U";
};

/** Permission box — (i) click se English introduction popover */
function PermissionHelpPopover({ label, description }: { label: string; description: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-blue-700 hover:bg-blue-100",
            open && "bg-blue-100"
          )}
          aria-label={`About ${label}`}
          aria-expanded={open}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        collisionPadding={12}
        className="z-[10050] max-w-[min(20rem,calc(100vw-2rem))] p-3 text-xs leading-relaxed text-foreground"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="font-semibold text-sm mb-1.5">{label}</p>
        <p className="text-muted-foreground">{description}</p>
      </PopoverContent>
    </Popover>
  );
}

const flattenedPermissions = PermissionGroups.flatMap(g => g.permissions.map(p => p.key));

/** Firestore / local company doc se aayi `permissionConfig` ko UI shape me merge — ek hi function dono path. */
function buildMergedPermissionConfig(currentConfig: PermissionConfig | undefined | null): PermissionConfig {
  const needsReset = !currentConfig || !currentConfig.roles || !currentConfig.dateLimits;
  const base = needsReset ? initialPermissionConfig : currentConfig;
  const merged: PermissionConfig = {
    ...initialPermissionConfig,
    ...base,
    fileAttachmentLimits: {
      ...initialPermissionConfig.fileAttachmentLimits,
      ...(base.fileAttachmentLimits || {}),
    },
    allowAttachments:
      base.allowAttachments !== undefined ? base.allowAttachments : initialPermissionConfig.allowAttachments,
  };
  if (merged.roles.owner) {
    merged.roles.owner = Array(flattenedPermissions.length).fill(true);
  }
  // Har role ki boolean[] ko current PermissionGroups length tak pad — naye recurring keys align rahein.
  const roleKeys = Object.keys(merged.roles) as UserRole[];
  for (const roleKey of roleKeys) {
    if (roleKey === "owner") continue;
    const defaultArr = initialPermissionConfig.roles[roleKey] || [];
    const stored = merged.roles[roleKey] || [];
    merged.roles[roleKey] = flattenedPermissions.map((_, i) =>
      i < stored.length ? !!stored[i] : !!defaultArr[i],
    );
  }
  return merged;
}

/** Save se pehle har role array ko full length par normalize — sparse index bug avoid. */
function normalizePermissionConfigForSave(config: PermissionConfig): PermissionConfig {
  const out = JSON.parse(JSON.stringify(config)) as PermissionConfig;
  if (out.roles.owner) {
    out.roles.owner = Array(flattenedPermissions.length).fill(true);
  }
  for (const roleKey of Object.keys(out.roles) as UserRole[]) {
    if (roleKey === "owner") continue;
    const defaultArr = initialPermissionConfig.roles[roleKey] || [];
    const stored = out.roles[roleKey] || [];
    out.roles[roleKey] = flattenedPermissions.map((_, i) =>
      i < stored.length ? !!stored[i] : !!defaultArr[i],
    );
  }
  return out;
}

export function ManageShare() {
  const { company: companyData, companyId, allCompanies, reloadLocalCompanyRegistry, triggerSync } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const { can } = usePermissions();
  const livePlans = useLivePlans();
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [userToRemove, setUserToRemove] = useState<SharedUser | null>(null);
  const [userToEdit, setUserToEdit] = useState<SharedUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  const [firestorePermissionConfig, setFirestorePermissionConfig] = useState<PermissionConfig>(initialPermissionConfig);
  const [editablePermissionConfig, setEditablePermissionConfig] = useState<PermissionConfig>(initialPermissionConfig);
  const [selectedRoleForPermissions, setSelectedRoleForPermissions] = useState<UserRole>('viewer');
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);

  /** Save ke baad snapshot se editable mat udao; onSnapshot bhi unsaved edits preserve kare */
  const hasUnsavedChangesRef = useRef(false);
  const permissionsCompanyIdRef = useRef<string | null>(null);

  const [allAppUsers, setAllAppUsers] = useState<any[]>([]);
  /** Revoke ke baad context/SQLite stale ho sakta hai — turant list se hatao; `companyData.sharedWith` sync par khud saaf. */
  const [optimisticRevokedEmails, setOptimisticRevokedEmails] = useState<string[]>([]);

  useEffect(() => {
    const sw = companyData?.sharedWith || [];
    setOptimisticRevokedEmails((prev) =>
      prev.filter((email) => sw.some((u) => normalizeEmail(u.email) === normalizeEmail(email)))
    );
  }, [companyData?.sharedWith]);

  useEffect(() => {
    if (!user || !companyData) return;

    const emails = [
      companyData.ownerEmail,
      ...(companyData.sharedWith || []).map((u: any) => u.email),
    ].filter(Boolean).map((e: string) => normalizeEmail(e));
    
    const uniqueEmails = [...new Set(emails)];

    const chunk = (arr: string[], size: number) =>
      Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size)
      );

    const unsubs: Array<() => void> = [];

    chunk(uniqueEmails, 10).forEach((batchEmails) => {
      if (batchEmails.length === 0) return;
      const qy = query(
        collection(firestore, "users"),
        where("email", "in", batchEmails)
      );

      const unsub = onSnapshot(qy, (snap) => {
        setAllAppUsers((prev) => {
          const map = new Map(prev.map((x) => [x.id, x]));
          snap.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));
          return Array.from(map.values());
        });
      });

      unsubs.push(unsub);
    });

    return () => unsubs.forEach((u) => u());
  }, [user, companyData]);
  
  const hasUnsavedChanges = useMemo(() => {
      return JSON.stringify(firestorePermissionConfig) !== JSON.stringify(editablePermissionConfig);
  }, [firestorePermissionConfig, editablePermissionConfig]);

  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  /** Firestore / local mirror se config — skeleton sirf company badle tab; save par dubara loading mat */
  const applyPermissionConfigFromServer = useCallback((merged: PermissionConfig) => {
    setFirestorePermissionConfig(merged);
    if (!hasUnsavedChangesRef.current) {
      setEditablePermissionConfig(merged);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const savedRole = localStorage.getItem("selectedRoleForPermissions") as UserRole | null;
    if (savedRole && Object.keys(initialPermissionConfig.roles).includes(savedRole)) {
        setSelectedRoleForPermissions(savedRole);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("selectedRoleForPermissions", selectedRoleForPermissions);
  }, [selectedRoleForPermissions]);

  /** Local company: sirf tab permission reload jab SQLite/context me nested config badle — har `companyData` reference par Firestore dubara subscribe na ho. */
  const localPermissionSyncKey = useMemo(() => {
    if (!companyData || !isOfflineCompanyStorage(companyData)) return "";
    try {
      return JSON.stringify((companyData as { permissionConfig?: PermissionConfig }).permissionConfig ?? null);
    } catch {
      return String(Date.now());
    }
  }, [companyData]);

  useEffect(() => {
    if (!companyId) {
      permissionsCompanyIdRef.current = null;
      setLoading(false);
      return;
    }

    const companyChanged = permissionsCompanyIdRef.current !== companyId;
    if (companyChanged) {
      permissionsCompanyIdRef.current = companyId;
      setLoading(true);
    }

    // Device-local company: Firestore share/permission doc nahi — SQLite / context se config.
    if (companyData && isOfflineCompanyStorage(companyData)) {
      const raw = (companyData as { permissionConfig?: PermissionConfig }).permissionConfig;
      applyPermissionConfigFromServer(buildMergedPermissionConfig(raw ?? null));
      return;
    }

    const companyRef = doc(firestore, "companies", companyId);

    const unsubscribe = onSnapshot(companyRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        let currentConfig = data.permissionConfig as PermissionConfig | undefined;

        if (!currentConfig || !currentConfig.roles || !currentConfig.dateLimits) {
          console.log("Permission schema mismatch or missing. Resetting to default.");
          currentConfig = initialPermissionConfig;
          try {
            await updateDoc(companyRef, { permissionConfig: currentConfig });
          } catch (error: any) {
            const isNotFoundError = error?.code === "not-found" || error?.message?.includes("No document to update");
            if (isNotFoundError) {
              console.warn("Cannot update permission config: company not synced yet");
            } else {
              console.error("Error updating permission config:", error);
            }
          }
        }

        applyPermissionConfigFromServer(buildMergedPermissionConfig(currentConfig));
      } else {
        applyPermissionConfigFromServer(buildMergedPermissionConfig(null));
      }
    });

    return () => unsubscribe();
  }, [companyId, companyData?.storageOption, localPermissionSyncKey, applyPermissionConfigFromServer]);
  
  const permissionsForSelectedRole = editablePermissionConfig.roles[selectedRoleForPermissions] || Array(flattenedPermissions.length).fill(false);
  const dateLimitsForSelectedRole = editablePermissionConfig.dateLimits?.[selectedRoleForPermissions] || { entryDays: 0, editDays: 0, deleteDays: 0 };
  const fileAttachmentLimitsForSelectedRole = editablePermissionConfig.fileAttachmentLimits?.[selectedRoleForPermissions] || { maxFileCount: 0, allowImage: false, allowPDF: false, allowDelete: false };
  const allowAttachmentsGlobal = editablePermissionConfig.allowAttachments !== false;
  // Local row ka `planId` aksar "basic" rehta jabki account pe advance ho — file caps galat 0 dikhte the; header/billing jaisa aggregate use karo.
  const effectivePlanId = useMemo(
    () => resolveEffectiveAccountPlanId(allCompanies, user?.uid, companyData?.planId),
    [allCompanies, user?.uid, companyData?.planId]
  );
  const activePlan = useMemo(() => getPlanFromPlans(livePlans, effectivePlanId), [livePlans, effectivePlanId]);
  const planAllowsFileAttachment = activePlan.entitlements.canAddFileImagePdf === true;
  const planMaxFilesPerVoucher = Math.max(0, Number(activePlan.entitlements.maxVoucherFileCount) || 0);
  const maxUsersPerPlan = Math.max(
    1,
    numericEntitlement(activePlan.entitlements, "maxUsers", companyStorageIsLocal(companyData?.storageOption)) || 1
  );
  const roleMaxFilesRaw = Number(fileAttachmentLimitsForSelectedRole.maxFileCount) || 0;
  const effectiveRoleMaxFiles = planAllowsFileAttachment
    ? Math.min(roleMaxFilesRaw, planMaxFilesPerVoucher)
    : 0;
  const showPlanFileLimitNotice = planAllowsFileAttachment && roleMaxFilesRaw > planMaxFilesPerVoucher;
  // Pro / Pro Plus (ya koi tier jahan agla plan file cap badhaye na) — upgrade banner mat dikhao
  const nextPaidUpgradePlanId = getNextPaidUpgrade(effectivePlanId);
  const showFileAttachmentUpgradeBanner = useMemo(() => {
    if (!nextPaidUpgradePlanId) return false;
    const nextMax = Math.max(
      0,
      Number(getPlanFromPlans(livePlans, nextPaidUpgradePlanId).entitlements.maxVoucherFileCount) || 0
    );
    return nextMax > planMaxFilesPerVoucher;
  }, [nextPaidUpgradePlanId, livePlans, planMaxFilesPerVoucher]);
  const currentUserCount = useMemo(() => {
    if (!companyData) return 0;
    const ownerEmailNorm = (companyData.ownerEmail || "").toLowerCase().trim();
    const superAdminEmails = new Set(getSuperAdminEmails().map((e) => e.toLowerCase().trim()));
    const revoked = new Set(optimisticRevokedEmails.map((e) => e.toLowerCase().trim()));
    const sharedCount = (companyData.sharedWithEmails || []).filter((email) => {
      const e = (email || "").toLowerCase().trim();
      return (
        !!e &&
        e !== ownerEmailNorm &&
        !superAdminEmails.has(e) &&
        !revoked.has(e)
      );
    }).length;
    return 1 + sharedCount;
  }, [companyData, optimisticRevokedEmails]);
  const isUserLimitReached = currentUserCount >= maxUsersPerPlan;

const handleDateLimitChange = (action: 'entry' | 'edit' | 'delete', value: number) => {
      if (selectedRoleForPermissions === 'owner') return;
      
      setEditablePermissionConfig(prevConfig => {
          const newConfig = JSON.parse(JSON.stringify(prevConfig));
          if (!newConfig.dateLimits[selectedRoleForPermissions]) {
              newConfig.dateLimits[selectedRoleForPermissions] = { entryDays: 0, editDays: 0, deleteDays: 0 };
          }
          newConfig.dateLimits[selectedRoleForPermissions][`${action}Days`] = value;
          return newConfig;
      });
  };
  
  const handlePermissionChange = (permissionKey: Permission, checked: boolean) => {
    if (selectedRoleForPermissions === 'owner') return;

    const permissionIndex = flattenedPermissions.indexOf(permissionKey);
    if (permissionIndex === -1) return;
    
    setEditablePermissionConfig(prevConfig => {
      const newConfig = JSON.parse(JSON.stringify(prevConfig));
      newConfig.roles[selectedRoleForPermissions][permissionIndex] = checked;
      // delete_approved_voucher and edit_approved_voucher always move together
      if (permissionKey === 'delete_approved_voucher' || permissionKey === 'edit_approved_voucher') {
        const other = permissionKey === 'delete_approved_voucher' ? 'edit_approved_voucher' : 'delete_approved_voucher';
        const otherIdx = flattenedPermissions.indexOf(other);
        if (otherIdx !== -1) newConfig.roles[selectedRoleForPermissions][otherIdx] = checked;
      }
      // Link tab ke liye Shared list bhi chahiye — auto ON jab link enable ho
      if (permissionKey === 'link_reconciliation_accounts' && checked) {
        const sharedListIdx = flattenedPermissions.indexOf('view_reconciliation_shared_list');
        if (sharedListIdx !== -1) newConfig.roles[selectedRoleForPermissions][sharedListIdx] = true;
      }
      return newConfig;
    });
  };

  const handleFileAttachmentLimitChange = (field: 'maxFileCount' | 'allowImage' | 'allowPDF' | 'allowDelete', value: number | boolean) => {
    if (selectedRoleForPermissions === 'owner') return;
    
    setEditablePermissionConfig(prevConfig => {
      const newConfig = JSON.parse(JSON.stringify(prevConfig));
      if (!newConfig.fileAttachmentLimits) {
        newConfig.fileAttachmentLimits = {};
      }
      if (!newConfig.fileAttachmentLimits[selectedRoleForPermissions]) {
        newConfig.fileAttachmentLimits[selectedRoleForPermissions] = { maxFileCount: 0, allowImage: false, allowPDF: false, allowDelete: false };
      }
      newConfig.fileAttachmentLimits[selectedRoleForPermissions][field] = value;
      return newConfig;
    });
  };

  const handleAllowAttachmentsGlobalChange = (checked: boolean) => {
    setEditablePermissionConfig(prevConfig => {
      const newConfig = JSON.parse(JSON.stringify(prevConfig));
      newConfig.allowAttachments = checked;
      return newConfig;
    });
  };
  
  const handleSavePermissions = async () => {
    if (!companyId || !hasUnsavedChanges) return;
    
    // Permission check: manage users/roles (can is already available from component level)
    if (!can("manage_users_roles")) {
      toast({
        variant: "destructive",
        title: "Permission Denied",
        description: "You do not have permission to manage users and roles.",
      });
      return;
    }
    setIsSavingPermissions(true);
    try {
      // Ensure owner role always has all permissions set to true; baaki roles ko full length par pad.
      const configToSave = normalizePermissionConfigForSave(editablePermissionConfig);

      const commitSavedPermissionConfig = (saved: PermissionConfig) => {
        hasUnsavedChangesRef.current = false;
        setFirestorePermissionConfig(saved);
        setEditablePermissionConfig(saved);
      };
      
      if (companyData && isOfflineCompanyStorage(companyData)) {
        const localOk = await updateCompanyDocRoot(companyId, { permissionConfig: configToSave });
        if (localOk) {
          reloadLocalCompanyRegistry();
          commitSavedPermissionConfig(configToSave);
          toast({ title: "Success", description: "Permissions have been saved." });
          return;
        }
        try {
          const existing = await getLocalCompanyById(companyId);
          if (existing) {
            await upsertLocalCompany({
              ...existing,
              id: companyId,
              permissionConfig: configToSave,
              updatedAt: Date.now(),
            } as LocalCompanyDoc);
            reloadLocalCompanyRegistry();
            commitSavedPermissionConfig(configToSave);
            toast({ title: "Success", description: "Permissions have been saved (this device)." });
            return;
          }
        } catch (e) {
          console.error(e);
        }
        toast({
          variant: "destructive",
          title: "Could not save",
          description: "Local company: sync server chalao ya baad mein try karein.",
        });
        return;
      }

      const companyRef = doc(firestore, "companies", companyId);
      await updateDoc(companyRef, { permissionConfig: configToSave });
      commitSavedPermissionConfig(configToSave);
      triggerSync();
      toast({ title: "Success", description: "Permissions have been saved." });
    } catch (error) {
      console.error("Error saving permissions:", error);
      toast({ variant: "destructive", title: "Error", description: isCompanyNotFoundError(error) ? COMPANY_NOT_SYNCED_MESSAGE : "Failed to save permission changes." });
    } finally {
        setIsSavingPermissions(false);
    }
  }

  const handleResetPermissions = () => {
    setEditablePermissionConfig(firestorePermissionConfig);
  }

  const handleRoleChange = async (email: string, newRole: SharedUser["role"]) => {
    if (!companyId) return;

    try {
      if (!can("manage_users_roles")) {
        toast({
          variant: "destructive",
          title: "Permission Denied",
          description: "You do not have permission to manage users and roles.",
        });
        return;
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to check permissions.",
      });
      return;
    }

    if (newRole === "owner") {
      toast({
        variant: "destructive",
        title: "Invalid Role",
        description: "Only the company owner can be Owner role.",
      });
      return;
    }

    setIsUpdating(email);
    try {
      const companyRef = doc(firestore, "companies", companyId);
      const companySnap = await getDoc(companyRef);
      if (!companySnap.exists()) {
        toast({ variant: "destructive", title: "Error", description: COMPANY_NOT_SYNCED_MESSAGE });
        return;
      }

      const currentData = companySnap.data();
      const currentSharedWith = currentData.sharedWith || [];

      const normalizedRole = newRole.toLowerCase() as UserRole;
      if (!["viewer", "data-entry", "accountant", "editor", "manager"].includes(normalizedRole)) {
        toast({
          variant: "destructive",
          title: "Invalid Role",
          description: "Invalid role selected.",
        });
        return;
      }

      const updatedSharedWith = currentSharedWith.map((u: SharedUser) =>
        u.email === email ? { ...u, role: normalizedRole } : u
      );

      await updateDoc(companyRef, { sharedWith: updatedSharedWith, updatedAt: serverTimestamp() });
      reloadLocalCompanyRegistry();
      triggerSync();
      toast({ title: "Success", description: `Role for ${email} has been updated to ${normalizedRole}.` });
    } catch (error: any) {
      console.error("Error updating role:", error);
      const isNotFoundError = error?.code === "not-found" || error?.message?.includes("No document to update");
      toast({
        variant: "destructive",
        title: "Error",
        description: isNotFoundError ? COMPANY_NOT_SYNCED_MESSAGE : "Failed to update role.",
      });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleNameChange = async (email: string, newName: string) => {
    if (!companyId) return;
    
    // Check if company is pending sync
    
    setIsUpdating(email);
    try {
      const companyRef = doc(firestore, "companies", companyId);
      
      const companySnap = await getDoc(companyRef);
      if (!companySnap.exists()) {
        toast({ variant: "destructive", title: "Error", description: COMPANY_NOT_SYNCED_MESSAGE });
        return;
      }
      
      const currentData = companySnap.data();
      const currentSharedWith = currentData.sharedWith || [];

      const updatedSharedWith = currentSharedWith.map((u: SharedUser) => 
        u.email === email ? { ...u, name: newName } : u
      );

      await updateDoc(companyRef, { sharedWith: updatedSharedWith });
      toast({ title: "Success", description: `Name for ${email} has been updated.` });
    } catch (error: any) {
      console.error("Error updating name:", error);
      const isNotFoundError = error?.code === "not-found" || error?.message?.includes("No document to update");
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: isNotFoundError ? COMPANY_NOT_SYNCED_MESSAGE : "Failed to update name." 
      });
    } finally {
      setIsUpdating(null);
    }
  }

  const handlePasswordChange = async () => {
    if (!companyId || !userToEdit) return;
    
    // Check if company is pending sync
    
    setIsUpdating(userToEdit.email);
    try {
      const companyRef = doc(firestore, "companies", companyId);
      
      const companySnap = await getDoc(companyRef);
      if (!companySnap.exists()) {
        toast({ variant: "destructive", title: "Error", description: COMPANY_NOT_SYNCED_MESSAGE });
        return;
      }
      
      const currentData = companySnap.data();
      const currentSharedWith = currentData.sharedWith || [];

      const updatedSharedWith = currentSharedWith.map((u: SharedUser) => 
        u.email === userToEdit.email ? { ...u, password: newPassword } : u
      );

      await updateDoc(companyRef, { sharedWith: updatedSharedWith });
      toast({ title: "Success", description: `Password for ${userToEdit.email} has been updated.` });
    } catch (error: any) {
      console.error("Error updating password:", error);
      const isNotFoundError = error?.code === "not-found" || error?.message?.includes("No document to update");
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: isNotFoundError ? COMPANY_NOT_SYNCED_MESSAGE : "Failed to update password." 
      });
    } finally {
      setIsUpdating(null);
      setUserToEdit(null);
      setNewPassword("");
    }
  }
  
  const handleRemoveAccess = async (userToRemove: SharedUser) => {
      if (!companyData || !companyId) return;

      // Check if company is pending sync

      // Permission check: manage users/roles
      try {
        if (!can("manage_users_roles")) {
          toast({
            variant: "destructive",
            title: "Permission Denied",
            description: "You do not have permission to manage users and roles.",
          });
          return;
        }
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to check permissions.",
        });
        return;
      }

      setIsUpdating(userToRemove.email);
      try {
          const companyRef = doc(firestore, "companies", companyId);
          const companySnap = await getDoc(companyRef);
          if (!companySnap.exists()) {
            toast({ variant: "destructive", title: "Error", description: COMPANY_NOT_SYNCED_MESSAGE });
            return;
          }
          const serverData = companySnap.data();
          const sharedWithServer = (serverData.sharedWith || []) as SharedUser[];
          const fullUserObject = sharedWithServer.find(
            (u) => normalizeEmail(u.email) === normalizeEmail(userToRemove.email)
          );
          if (!fullUserObject) {
            toast({
              variant: "destructive",
              title: "Error",
              description: "User not found in the current share list. Try refreshing the page.",
            });
            return;
          }
          const emailsOnDoc = Array.isArray(serverData.sharedWithEmails) ? serverData.sharedWithEmails : [];
          const emailForArrayRemove =
            emailsOnDoc.find((e) => normalizeEmail(String(e)) === normalizeEmail(userToRemove.email)) ??
            fullUserObject.email;

          await updateDoc(companyRef, { 
              sharedWith: arrayRemove(fullUserObject),
              sharedWithEmails: arrayRemove(emailForArrayRemove) 
            });
          setOptimisticRevokedEmails((prev) =>
            prev.some((e) => normalizeEmail(e) === normalizeEmail(userToRemove.email))
              ? prev
              : [...prev, userToRemove.email]
          );
          reloadLocalCompanyRegistry();
          triggerSync();
          toast({ title: "Success", description: `Access for ${userToRemove.email} has been revoked.`});
      } catch (error: any) {
          console.error("Error removing access:", error);
          const isNotFoundError = error?.code === "not-found" || error?.message?.includes("No document to update");
          toast({ 
            variant: "destructive", 
            title: "Error", 
            description: isNotFoundError ? COMPANY_NOT_SYNCED_MESSAGE : "Failed to remove user access." 
          });
      } finally {
          setIsUpdating(null);
          setUserToRemove(null);
      }
  }
  
  const allUsers = useMemo(() => {
    if (!companyData || allAppUsers.length === 0) return [];
    
    const isUserOnline = (userInfo: any) => {
      if (!userInfo?.lastSeen?.toDate) return false;
      return (Date.now() - userInfo.lastSeen.toDate().getTime()) < 90 * 1000;
    };

    const uniqueUsers = new Map<string, SharedUser & { isOnline?: boolean; id?: string, photoURL?: string }>();

    if (companyData.ownerEmail) {
        const ownerInfo = allAppUsers.find(u => normalizeEmail(u.email) === normalizeEmail(companyData.ownerEmail));
        uniqueUsers.set(companyData.ownerEmail, {
            email: companyData.ownerEmail,
            name: ownerInfo?.displayName || "Admin", 
            role: 'owner',
            isOnline: isUserOnline(ownerInfo),
            id: ownerInfo?.id,
            photoURL: ownerInfo?.photoURL 
        });
    }

    (companyData.sharedWith || [])
      .filter(
        (user) =>
          user.email &&
          !optimisticRevokedEmails.some((e) => normalizeEmail(e) === normalizeEmail(user.email))
      )
      .forEach((user) => {
        const userInfo = allAppUsers.find((u) => normalizeEmail(u.email) === normalizeEmail(user.email));
        uniqueUsers.set(user.email, {
          ...user,
          name: userInfo?.displayName || user.name || "User",
          isOnline: isUserOnline(userInfo),
          id: userInfo?.id,
          photoURL: userInfo?.photoURL || user.photoURL,
        });
      });
    
    return Array.from(uniqueUsers.values());
}, [companyData, allAppUsers, optimisticRevokedEmails]);


  if (loading) {
    return (
        <div className="space-y-8">
            <Card className={settingsDetailCardShell} {...{ [companyProfileChromeRoot]: "" }}>
                <CardHeader>
                    <Skeleton className="h-8 w-64 mb-1" />
                    <Skeleton className="h-4 w-full max-w-sm" />
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                </CardContent>
            </Card>
        </div>
    )
  }

  if (!companyId || !companyData) {
    return (
        <div className="p-4 sm:p-6 md:p-8">
            <Card className={cn("w-full max-w-lg mx-auto text-center", settingsDetailCardShell)} {...{ [companyProfileChromeRoot]: "" }}>
                 <CardHeader>
                    <CardTitle>No Company Selected</CardTitle>
                    <CardDescription>Please select a company from the header to manage settings.</CardDescription>
                </CardHeader>
            </Card>
        </div>
    );
  }

  const totalPermissions = flattenedPermissions.length;
  const enabledPermissions = permissionsForSelectedRole.filter(p => p === true).length;
  const disabledPermissions = totalPermissions - enabledPermissions;

  /** SQLite / device-only: email-based Firestore share yahan support nahi — Company login + Local users. */
  const isDeviceLocalCompany = isOfflineCompanyStorage(companyData);
  const localCloudSyncCfg = companyData ? readCloudSyncConfigFromCompany(companyData as Record<string, unknown>) : null;
  const localDriveSharingEnabled =
    isDeviceLocalCompany &&
    localCloudSyncCfg?.cloudSyncEnabled === true &&
    localCloudSyncCfg?.cloudSyncProvider === "google_drive";

  return (
    <div className="space-y-8">
        {isDeviceLocalCompany && !localDriveSharingEnabled ? (
          <Card className={settingsDetailCardShell} {...{ [companyProfileChromeRoot]: "" }}>
            <CardHeader className={companyProfilePageBg}>
              <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>Sharing</span>
                <span className="text-muted-foreground font-normal tracking-tight" aria-hidden>
                  ----&gt;
                </span>
                <span className="text-base sm:text-lg font-semibold">{companyData.name}</span>
              </CardTitle>
              <CardDescription>
                Device-local company — language below. Firebase email share is for cloud-uploaded companies only.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-6 pb-6">
              {/* Eng / Nep / Hindi: Company Profile jaisa tabs + green content */}
              <Tabs defaultValue="eng" className="w-full">
                <TabsList className={companyProfileTabsList3}>
                  <TabsTrigger value="eng" className={companyProfileTabsTrigger}>
                    English
                  </TabsTrigger>
                  <TabsTrigger value="nep" className={companyProfileTabsTrigger}>
                    नेपाली
                  </TabsTrigger>
                  <TabsTrigger value="hi" className={companyProfileTabsTrigger}>
                    हिन्दी
                  </TabsTrigger>
                </TabsList>
                <TabsContent
                  value="eng"
                  className={`mt-3 p-4 text-sm space-y-2 outline-none ${companyProfileGreenZone}`}
                >
                  <p className="text-muted-foreground">
                    This company lives only on this device. Firebase &quot;Add Person&quot; / email sharing works for companies
                    that are uploaded to the cloud.
                  </p>
                  <p className="font-medium text-foreground">
                    How to give access: open{" "}
                    <Link href="/settings?view=company" className="underline font-semibold hover:no-underline">
                      Company Profile
                    </Link>{" "}
                    and set <strong>Company login</strong> (username + Protect company password). Your team can use these when
                    switching companies.
                  </p>
                  <p className="text-muted-foreground">
                    For extra device-only users, use <strong>Settings</strong> → <strong>Local users</strong> for this company —
                    that is not Firestore sharing.
                  </p>
                  <p className="text-muted-foreground">
                    For online email sharing, upload or sync this company to Firebase / the cloud first; then add people here under{" "}
                    <strong>Manage Sharing</strong>.
                  </p>
                </TabsContent>
                <TabsContent
                  value="nep"
                  lang="ne"
                  className={`mt-3 p-4 text-sm space-y-2 outline-none ${companyProfileGreenZone}`}
                >
                  {/* नेपाली देवनागरी — Roman placeholder हटाया */}
                  <p className="text-muted-foreground">
                    यो कम्पनी यस उपकरणमा मात्र स्थानीय छ। फायरबेसको &quot;Add Person&quot; / इमेल साझेदारी क्लाउडमा अपलोड गरिएका
                    कम्पनीहरूका लागि मात्र हुन्छ।
                  </p>
                  <p className="font-medium text-foreground">
                    पहुँच दिने तरिका:{" "}
                    <Link href="/settings?view=company" className="underline font-semibold hover:no-underline">
                      कम्पनी प्रोफाइल
                    </Link>{" "}
                    मा <strong>कम्पनी लगइन</strong> (प्रयोगकर्ता नाम + संरक्षित कम्पनी पासवर्ड) सेट गर्नुहोस्। कम्पनी बदल्दा यही
                    प्रमाणपत्र प्रयोग गर्नुहोस्।
                  </p>
                  <p className="text-muted-foreground">
                    थप उपकरण-मात्र प्रयोगकर्ताका लागि सेटिङहरू → यसै कम्पनीका <strong>स्थानीय प्रयोगकर्ता</strong> खण्ड प्रयोग
                    गर्नुहोस् — यो फायरस्टोर साझेदारी होइन।
                  </p>
                  <p className="text-muted-foreground">
                    अनलाइन इमेल साझेदारीका लागि पहिले यो कम्पनी फायरबेस / क्लाउडमा अपलोड वा सिङ्क गर्नुहोस्; पछि यहीं{" "}
                    <strong>साझेदारी व्यवस्थापन</strong>बाट व्यक्ति थप्नुहोस्।
                  </p>
                </TabsContent>
                <TabsContent
                  value="hi"
                  lang="hi"
                  className={`mt-3 p-4 text-sm space-y-2 outline-none ${companyProfileGreenZone}`}
                >
                  {/* पूरी हिंदी देवनागरी; अंग्रेज़ी शब्द जहाँ UI से मेल खाते हों वही रखे */}
                  <p className="text-muted-foreground">
                    यह कंपनी केवल इस डिवाइस पर स्थानीय है। फायरबेस का &quot;Add Person&quot; / ईमेल साझाकरण केवल उन कंपनियों के लिए
                    है जो क्लाउड पर अपलोड की गई हैं।
                  </p>
                  <p className="font-medium text-foreground">
                    पहुँच देने का तरीका:{" "}
                    <Link href="/settings?view=company" className="underline font-semibold hover:no-underline">
                      कंपनी प्रोफ़ाइल
                    </Link>{" "}
                    में <strong>कंपनी लॉगिन</strong> (उपयोगकर्ता नाम + संरक्षित कंपनी पासवर्ड) सेट करें। टीम कंपनी बदलते समय इन्हीं
                    प्रमाण-पत्रों का उपयोग कर सकती है।
                  </p>
                  <p className="text-muted-foreground">
                    अतिरिक्त केवल-डिवाइस उपयोगकर्ताओं के लिए सेटिंग्स → इसी कंपनी का <strong>स्थानीय उपयोगकर्ता</strong> खंड उपयोग
                    करें — यह फायरस्टोर साझाकरण नहीं है।
                  </p>
                  <p className="text-muted-foreground">
                    ऑनलाइन ईमेल साझाकरण के लिए पहले इस कंपनी को फायरबेस / क्लाउड पर अपलोड या सिंक करें; फिर यहीं{" "}
                    <strong>साझाकरण प्रबंधन</strong> से लोग जोड़ सकेंगे।
                  </p>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ) : isDeviceLocalCompany && localDriveSharingEnabled && companyData && companyId ? (
          <Card className={settingsDetailCardShell} {...{ [companyProfileChromeRoot]: "" }}>
            <CardContent className="p-4">
              <LocalDriveShareManagePanel
                variant="full"
                companyId={companyId}
                companyName={companyData.name}
                company={companyData as Record<string, unknown>}
                onUsersChanged={reloadLocalCompanyRegistry}
              />
            </CardContent>
          </Card>
        ) : (
          <Card className={settingsDetailCardShell} {...{ [companyProfileChromeRoot]: "" }}>
            <CardHeader className={cn(companyProfilePageBg, "flex flex-row flex-wrap items-start justify-between gap-4")}>
                <div>
                    <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>Manage Sharing</span>
                      <span className="text-muted-foreground font-normal tracking-tight" aria-hidden>
                        ----&gt;
                      </span>
                      <span className="text-base sm:text-lg font-semibold">{companyData.name}</span>
                    </CardTitle>
                    <CardDescription>
                        Control who has access. Change a shared user&apos;s <strong>role</strong> in the table below, or
                        when inviting from{" "}
                        <Link href="/settings?view=company" className="underline font-medium hover:no-underline">
                          Company Profile
                        </Link>
                        .
                    </CardDescription>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="text-xs text-muted-foreground">
                    Users: {currentUserCount}/{maxUsersPerPlan}
                  </span>
                  {isUserLimitReached && (
                    <span className="text-xs text-amber-700">
                      User limit reached.{" "}
                      <Link href="/billing" className="underline font-medium hover:no-underline">
                        Update plan
                      </Link>
                    </span>
                  )}
                  <ShareCompanyDialog company={companyData}>
                      <Button variant="outline" disabled={isUserLimitReached}>
                          <PlusCircle className="mr-2 h-4 w-4" />
                          Add Person
                      </Button>
                  </ShareCompanyDialog>
                </div>
            </CardHeader>
            <CardContent className={`p-4 ${companyProfileGreenZone}`}>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-2/5">Email</TableHead>
                        <TableHead className="w-1/4">Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {allUsers.map((sharedUser) => (
                        <TableRow key={sharedUser.email}>
                           <TableCell className="font-medium flex items-center gap-3">
                                <div className={cn(
                                    "relative rounded-full p-[2px] transition-all duration-500 shrink-0",
                                    sharedUser.isOnline ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]" : "bg-black"
                                )}>
                                    <Avatar className="h-9 w-9 border-2 border-background shrink-0">
                                        <AvatarImage 
                                            src={getAvatarUrl(sharedUser.email, sharedUser.photoURL)} 
                                            className="object-cover rounded-full" 
                                        />
                                        <AvatarFallback className="bg-muted text-xs font-bold">
                                            {getInitials(sharedUser.name)}
                                        </AvatarFallback>
                                    </Avatar>
                                </div>
                            
                                <div className="flex flex-col min-w-0 overflow-hidden">
                                    <span className="font-semibold text-sm truncate">{sharedUser.email}</span>
                                    {sharedUser.email === companyData.ownerEmail && (
                                        <span className="text-[10px] text-amber-600 font-bold flex items-center gap-1">
                                            <Crown className="h-3 w-3" /> OWNER
                                        </span>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell>
                                {sharedUser.email === companyData.ownerEmail ? (
                                    <span>{sharedUser.name}</span>
                                ) : (
                                    <Input 
                                        defaultValue={sharedUser.name}
                                        onBlur={(e) => handleNameChange(sharedUser.email, e.target.value)}
                                        disabled={isUpdating === sharedUser.email}
                                    />
                                )}
                            </TableCell>
                            <TableCell>
                                {sharedUser.email === companyData.ownerEmail ? (
                                  <span className="inline-flex items-center text-sm font-medium text-amber-700">
                                    <Crown className="mr-1 h-3.5 w-3.5" /> Owner
                                  </span>
                                ) : (
                                  <Select
                                    value={sharedUser.role}
                                    onValueChange={(newRole: SharedUser["role"]) =>
                                      handleRoleChange(sharedUser.email, newRole)
                                    }
                                    disabled={isUpdating === sharedUser.email}
                                  >
                                    <SelectTrigger className="h-9 w-[140px]">
                                      <SelectValue placeholder="Role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="viewer">Viewer</SelectItem>
                                      <SelectItem value="data-entry">Data Entry</SelectItem>
                                      <SelectItem value="accountant">Accountant</SelectItem>
                                      <SelectItem value="editor">Editor</SelectItem>
                                      <SelectItem value="manager">Admin</SelectItem>
                                      {sharedUser.role === "owner" ? (
                                        <SelectItem value="owner">
                                          <span className="flex items-center gap-1.5">
                                            <Crown className="h-3 w-3" /> Owner
                                          </span>
                                        </SelectItem>
                                      ) : null}
                                    </SelectContent>
                                  </Select>
                                )}
                            </TableCell>
                             <TableCell className="text-right">
                                <div className="flex justify-end items-center gap-1">
                                {sharedUser.email !== companyData.ownerEmail ? (
                                    <>
                                        <ShareCompanyDialog 
                                        company={companyData} 
                                        isEditing={true}
                                        userToEdit={sharedUser}
                                        >
                                        <Button variant="ghost" size="icon">
                                            <Pencil className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
                                        </Button>
                                        </ShareCompanyDialog>
                                    
                                        <Button variant="ghost" size="icon" onClick={() => setUserToEdit(sharedUser)}>
                                            <KeyRound className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
                                        </Button>

                                        {isUpdating === sharedUser.email ? (
                                            <Button variant="ghost" size="icon" disabled>
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setUserToRemove(sharedUser as SharedUser)}
                                            >
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        )}
                                    </>
                                ) : (
                                    <span className="text-xs text-muted-foreground mr-2">Owner</span>
                                )}
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {allUsers.length === 1 && (
                <p className="text-center text-muted-foreground p-8">
                    This company has not been shared with anyone yet.
                </p>
            )}
            </CardContent>
        </Card>
        )}
        
        <Dialog open={!!userToEdit} onOpenChange={(open) => !open && setUserToEdit(null)}>
             <DialogContent>
                <DialogHeader>
                    <DialogTitle>Reset Password for {userToEdit?.name}</DialogTitle>
                    <DialogDescription>Enter a new password for this user. They will be able to use this to log in to this company.</DialogDescription>
                </DialogHeader>
                <div className="py-4 relative">
                    <Input 
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter new password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="pr-10"
                    />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                </div>
                 <DialogFooter>
                    <Button variant="ghost" onClick={() => setUserToEdit(null)}>Cancel</Button>
                    <Button onClick={handlePasswordChange}>Set Password</Button>
                 </DialogFooter>
             </DialogContent>
        </Dialog>

        <Card className={settingsDetailCardShell} {...{ [companyProfileChromeRoot]: "" }}>
             <CardHeader className={cn(companyProfilePageBg, "flex flex-col md:flex-row justify-between md:items-start gap-4")}>
                <div className="flex-1">
                    <CardTitle>Role Permissions</CardTitle>
                    <CardDescription>Select a role to view and edit its permissions.</CardDescription>
                </div>
                 <div className="flex items-center text-base font-bold" style={{gap: '10mm'}}>
                    <div className="border rounded-lg p-2 flex items-center">Total: {totalPermissions}</div>
                    <div className="text-green-600 border rounded-lg p-2 flex items-center">Enabled: {enabledPermissions}</div>
                    <div className="text-red-600 border rounded-lg p-2 flex items-center">Disabled: {disabledPermissions}</div>
                </div>
            </CardHeader>
            <CardContent className={cn("space-y-4 p-4", companyProfileGreenZone)}>
                {/* Top Button */}
                <div className="flex justify-end pb-4 border-b">
                    <Button onClick={handleSavePermissions} disabled={isSavingPermissions || !hasUnsavedChanges}>
                        {isSavingPermissions ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                        Save Permissions
                    </Button>
                </div>
                 <div className="flex flex-wrap items-center justify-between gap-4">
                    <Select value={selectedRoleForPermissions} onValueChange={(value) => setSelectedRoleForPermissions(value as UserRole)}>
                        <SelectTrigger className="w-[220px]">
                            <SelectValue placeholder="Select a role to edit" />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.keys(editablePermissionConfig.roles).map(role => (
                                <SelectItem key={role} value={role} className="capitalize">
                                    {role.replace('-', ' ')}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                       {hasUnsavedChanges && (
                         <>
                           <span className="text-sm text-amber-600 font-medium">You have unsaved changes.</span>
                           <Button variant="outline" size="sm" onClick={handleResetPermissions} disabled={isSavingPermissions}>
                               <Undo2 className="mr-2 h-4 w-4"/> Reset
                           </Button>
                         </>
                       )}
                       {/* Middle Button */}
                       <Button size="sm" variant="outline" onClick={handleSavePermissions} disabled={isSavingPermissions || !hasUnsavedChanges}>
                           {isSavingPermissions ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                           Save Permissions
                       </Button>
                    </div>
                 </div>
                 <div className="space-y-4 pt-4">
                    <h3 className="text-lg font-semibold border-b pb-2">Date Control</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {["Entry", "Edit", "Delete"].map((action) => {
                        const key = `${action.toLowerCase()}Days` as keyof typeof dateLimitsForSelectedRole;
                        const value = dateLimitsForSelectedRole?.[key] ?? 0;
                        return (
                            <div key={action} className="flex flex-col space-y-2 p-3 border rounded-lg">
                            <label className="text-sm font-medium">{`Back Date ${action} Days`}</label>
                             <Input
                                type="number"
                                min={0}
                                value={value}
                                onChange={(e) => handleDateLimitChange(action.toLowerCase() as any, Number(e.target.value))}
                                disabled={selectedRoleForPermissions === "owner"}
                                className="w-full"
                              />
                               <p className="text-xs text-muted-foreground">0 = disabled to modify backdated. 1–9998 = last X days. 9999 = unlimited.</p>
                            </div>
                        );
                        })}
                    </div>
                </div>

                {/* File Attachment Settings */}
                <div className="space-y-4 pt-4">
                    <h3 className="text-lg font-semibold border-b pb-2">File Attachment Settings</h3>
                    {showFileAttachmentUpgradeBanner ? (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                        <p className="font-medium text-amber-800">
                            Your current plan allows max {planMaxFilesPerVoucher} file(s) per voucher.
                        </p>
                        <p className="text-amber-700">
                            To access more features and higher file limits,{" "}
                            <Link href="/billing" className="underline font-medium hover:no-underline">
                                update plan
                            </Link>.
                        </p>
                    </div>
                    ) : (
                    <p className="text-sm text-muted-foreground rounded-lg border border-black bg-muted/30 p-3">
                        Your current plan allows max {planMaxFilesPerVoucher} file(s) per voucher.
                    </p>
                    )}
                    
                    {/* Global Toggle */}
                    <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                            <label className="text-base font-medium">Allow File Attachments</label>
                            <p className="text-sm text-muted-foreground">
                                Enable or disable file uploads across all voucher and entry forms.
                            </p>
                        </div>
                        <Switch 
                            checked={allowAttachmentsGlobal} 
                            onCheckedChange={handleAllowAttachmentsGlobalChange}
                        />
                    </div>

                    {/* Role-based File Limits */}
                    {allowAttachmentsGlobal && (
                        <div className="space-y-4 p-4 border rounded-lg">
                            <h4 className="text-sm font-semibold">File Limits for {selectedRoleForPermissions.replace('-', ' ')} Role</h4>
                            {showPlanFileLimitNotice && (
                                <p className="text-xs text-amber-700">
                                    Role limit is capped by plan. Effective max files is {effectiveRoleMaxFiles}.
                                </p>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch">
                                {/* Max File Count */}
                                <div className="flex min-h-[132px] h-full flex-col justify-between rounded-lg border p-3">
                                    <label className="text-sm font-medium">Max File Count (0-{planMaxFilesPerVoucher})</label>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={planMaxFilesPerVoucher}
                                        value={effectiveRoleMaxFiles}
                                        onChange={(e) =>
                                          handleFileAttachmentLimitChange(
                                            "maxFileCount",
                                            Math.min(planMaxFilesPerVoucher, Math.max(0, Number(e.target.value)))
                                          )
                                        }
                                        disabled={selectedRoleForPermissions === "owner" || !planAllowsFileAttachment}
                                        className="w-full"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                      Maximum number of files allowed per voucher under current plan.
                                    </p>
                                </div>

                                {/* Allow Image */}
                                <div className="flex min-h-[132px] h-full flex-col justify-between rounded-lg border p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <label className="text-sm font-medium">Allow Image Files</label>
                                      <Switch
                                          checked={fileAttachmentLimitsForSelectedRole.allowImage}
                                          onCheckedChange={(checked) => handleFileAttachmentLimitChange('allowImage', checked)}
                                          disabled={selectedRoleForPermissions === "owner" || effectiveRoleMaxFiles === 0 || !planAllowsFileAttachment}
                                      />
                                    </div>
                                    <p className="text-xs text-muted-foreground">Enable image file uploads.</p>
                                </div>

                                {/* Allow PDF */}
                                <div className="flex min-h-[132px] h-full flex-col justify-between rounded-lg border p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <label className="text-sm font-medium">Allow PDF Files</label>
                                      <Switch
                                          checked={fileAttachmentLimitsForSelectedRole.allowPDF}
                                          onCheckedChange={(checked) => handleFileAttachmentLimitChange('allowPDF', checked)}
                                          disabled={selectedRoleForPermissions === "owner" || effectiveRoleMaxFiles === 0 || !planAllowsFileAttachment}
                                      />
                                    </div>
                                    <p className="text-xs text-muted-foreground">Enable PDF file uploads.</p>
                                </div>

                                {/* Allow Delete Uploaded Files */}
                                <div className="flex min-h-[132px] h-full flex-col justify-between rounded-lg border p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <label className="text-sm font-medium">Allow File Delete</label>
                                      <Switch
                                          checked={!!fileAttachmentLimitsForSelectedRole.allowDelete}
                                          onCheckedChange={(checked) => handleFileAttachmentLimitChange('allowDelete', checked)}
                                          disabled={selectedRoleForPermissions === "owner" || effectiveRoleMaxFiles === 0 || !planAllowsFileAttachment}
                                      />
                                    </div>
                                    <p className="text-xs text-muted-foreground">Allow deleting uploaded files from voucher attachments.</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {PermissionGroups.map((group) => (
                    <div key={group.title} className="space-y-4 pt-4">
                        <h3 className="text-lg font-semibold border-b pb-2">{group.title}</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {group.permissions.map((permission) => {
                                const globalIndex = flattenedPermissions.indexOf(permission.key);

                                if (globalIndex === -1) return null;

                                const hasPermission = selectedRoleForPermissions === "owner" ? true : permissionsForSelectedRole[globalIndex];

                                return (
                                    <div key={permission.key} className="flex items-start gap-2 p-2 rounded-md border">
                                        <Checkbox
                                            id={`${selectedRoleForPermissions}-${permission.key}`}
                                            checked={hasPermission}
                                            onCheckedChange={(checked) =>
                                                handlePermissionChange(permission.key, !!checked)
                                            }
                                            disabled={selectedRoleForPermissions === "owner"}
                                            className="mt-0.5"
                                        />
                                        <label
                                            htmlFor={`${selectedRoleForPermissions}-${permission.key}`}
                                            className="min-w-0 flex-1 text-sm font-medium leading-snug peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                        >
                                            {permission.label}
                                        </label>
                                        {permission.description ? (
                                            <PermissionHelpPopover
                                                label={permission.label}
                                                description={permission.description}
                                            />
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
                {/* Bottom Button */}
                <div className="flex justify-end pt-4 border-t">
                    <Button onClick={handleSavePermissions} disabled={isSavingPermissions || !hasUnsavedChanges}>
                        {isSavingPermissions ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                        Save Permissions
                    </Button>
                </div>
            </CardContent>
        </Card>

         <AlertDialog open={!!userToRemove} onOpenChange={(open) => !open && setUserToRemove(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will revoke <span className="font-bold">{userToRemove?.email}</span>'s access to the company. They will no longer be able to view or edit its data.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => userToRemove && handleRemoveAccess(userToRemove)}
                        className="bg-destructive hover:bg-destructive/90"
                    >
                        Revoke Access
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
  );
}

    