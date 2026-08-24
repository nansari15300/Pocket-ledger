
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
import { Crown, Loader2, PlusCircle, Trash2, Save, Undo2, KeyRound, Eye, EyeOff, Edit, Pencil, Info, Search, X } from "lucide-react";
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
import usePermissions, {
  type PermissionConfig,
  type UserRole,
  initialPermissionConfig,
  normalizePermissionConfig,
} from "@/hooks/usePermissions";
import { companyUsesDeviceOrPlPermissionConfig, logPlPerm, summarizePermissionDateLimits } from "@/lib/permissionConfigSource";
import { cn } from "@/lib/utils";
import { isCompanyNotFoundError, COMPANY_NOT_SYNCED_MESSAGE } from "@/lib/companyUpdateGuard";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import { isLocalCompanyHostShareable } from "@/lib/listShareableLocalCompaniesForHost";
import { isElectronLocalServerApiAvailable } from "@/lib/electronLocalServer";
import { LocalPlServerSharePanel } from "@/components/settings/LocalPlServerSharePanel";
import { resolveEffectiveAccountPlanId } from "@/lib/accountPlanForOwner";
import { getLocalCompanyById, upsertLocalCompany, type LocalCompanyDoc } from "@/lib/localCompanyStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getPlanFromPlans, useLivePlans } from "@/hooks/useLivePlans";
import { getNextPaidUpgrade, numericEntitlement, companyStorageIsLocal, isUnlimitedEntitlementCap, isAtOrOverEntitlementCap, formatEntitlementCapLabel, type PlanId } from "@/config/plans";
import { collectAccountWideShareMemberEmails } from "@/lib/accountShareUserCap";
import {
  EMPTY_PURCHASED_PLAN_ADDONS,
  parsePurchasedPlanAddOns,
  planUserCapWithAddOns,
  type PurchasedPlanAddOns,
} from "@/lib/planAddOns";
import {
  COMPANY_PERMISSION_ROLE_OPTIONS,
  COMPANY_SHARE_ROLE_OPTIONS,
  companyShareRoleLabel,
} from "@/lib/localCompanyAppRoles";
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

const PERMISSION_CATEGORY_ALL = "__all__";
const PERMISSION_CATEGORY_DATE = "__date_control__";
const PERMISSION_CATEGORY_FILE = "__file_attachment__";

const DATE_CONTROL_SEARCH_TEXTS = [
  "Date Control",
  "Back Date Entry Days",
  "Back Date Edit Days",
  "Back Date Delete Days",
  "0 = disabled to modify backdated. 1–9998 = last X days. 9999 = unlimited.",
];

const DATE_CONTROL_DAYS_HELP =
  "0 = disabled to modify backdated. 1–9998 = last X days. 9999 = unlimited.";

const FILE_ATTACHMENT_SEARCH_TEXTS = [
  "File Attachment Settings",
  "Allow File Attachments",
  "Enable or disable file uploads across all voucher and entry forms.",
  "Max File Count",
  "Maximum number of files allowed per voucher under current plan.",
  "Allow Image Files",
  "Enable image file uploads.",
  "Allow PDF Files",
  "Enable PDF file uploads.",
  "Allow File Delete",
  "Allow deleting uploaded files from voucher attachments.",
  "Role limit is capped by plan",
  "file attachment",
  "upload",
];

function permissionSearchNorm(query: string): string {
  return query.trim().toLowerCase();
}

function permissionTextMatches(text: string, query: string): boolean {
  const q = permissionSearchNorm(query);
  if (!q) return true;
  return text.toLowerCase().includes(q);
}

function permissionSectionMatchesSearch(texts: readonly string[], query: string): boolean {
  const q = permissionSearchNorm(query);
  if (!q) return true;
  return texts.some((text) => text.toLowerCase().includes(q));
}

/** Firestore / local company doc se aayi `permissionConfig` ko UI shape me merge — ek hi function dono path. */
function buildMergedPermissionConfig(currentConfig: PermissionConfig | undefined | null): PermissionConfig {
  return normalizePermissionConfig(currentConfig);
  // Har role ki boolean[] ko current PermissionGroups length tak pad — naye recurring keys align rahein.
}

/** Save se pehle har role array ko full length par normalize — sparse index bug avoid. */
function normalizePermissionConfigForSave(config: PermissionConfig): PermissionConfig {
  return normalizePermissionConfig(config);
}

export function ManageShare() {
  const { company: companyData, companyId, allCompanies, allCompaniesRegistry, reloadLocalCompanyRegistry, triggerSync, localCompanyRegistryEpoch } = useCompany();
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
  const [permissionCategoryFilter, setPermissionCategoryFilter] = useState(PERMISSION_CATEGORY_ALL);
  const [permissionSearchQuery, setPermissionSearchQuery] = useState("");
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);

  /** Save ke baad snapshot se editable mat udao; onSnapshot bhi unsaved edits preserve kare */
  const hasUnsavedChangesRef = useRef(false);
  const permissionsCompanyIdRef = useRef<string | null>(null);

  const [allAppUsers, setAllAppUsers] = useState<any[]>([]);
  /** Revoke ke baad context/SQLite stale ho sakta hai — turant list se hatao; `companyData.sharedWith` sync par khud saaf. */
  const [optimisticRevokedEmails, setOptimisticRevokedEmails] = useState<string[]>([]);
  const [plServerHostShareable, setPlServerHostShareable] = useState(false);
  const [plServerHostShareableResolved, setPlServerHostShareableResolved] = useState(false);
  const hostShareableCompanyIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cid = String(companyId || "").trim();
    const companyChanged = hostShareableCompanyIdRef.current !== cid;
    if (companyChanged) {
      hostShareableCompanyIdRef.current = cid;
      setPlServerHostShareableResolved(false);
    }
    if (!cid || !companyData || !isOfflineCompanyStorage(companyData)) {
      setPlServerHostShareable(false);
      setPlServerHostShareableResolved(true);
      return;
    }
    if (!isElectronLocalServerApiAvailable()) {
      setPlServerHostShareable(false);
      setPlServerHostShareableResolved(true);
      return;
    }
    const registry = allCompaniesRegistry?.length ? allCompaniesRegistry : allCompanies;
    void isLocalCompanyHostShareable(cid, registry, companyData).then((ok) => {
      if (!cancelled) {
        setPlServerHostShareable(ok);
        setPlServerHostShareableResolved(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [companyId, companyData, allCompanies, allCompaniesRegistry, localCompanyRegistryEpoch]);

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

  /** Local/PL: SQLite permission fingerprint — context row omit kar sakti hai; epoch se reload. */
  const localPermissionSyncKey = useMemo(() => {
    if (!companyData || !companyUsesDeviceOrPlPermissionConfig(companyData)) return "";
    try {
      return `${localCompanyRegistryEpoch}:${JSON.stringify(
        (companyData as { permissionConfig?: PermissionConfig }).permissionConfig ?? null
      )}`;
    } catch {
      return `${localCompanyRegistryEpoch}:${Date.now()}`;
    }
  }, [companyData, localCompanyRegistryEpoch]);

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

    // Strict: local / PL-server / gate → Firebase onSnapshot mat (defaults editDays=7 paint + write).
    const useDeviceOrPl = companyUsesDeviceOrPlPermissionConfig(companyData);
    if (useDeviceOrPl) {
      let cancelled = false;
      void (async () => {
        try {
          const row = await getLocalCompanyById(companyId, { includeDeleted: true });
          if (cancelled) return;
          const raw =
            (row as { permissionConfig?: PermissionConfig } | null)?.permissionConfig ??
            (companyData as { permissionConfig?: PermissionConfig } | null)?.permissionConfig ??
            null;
          const merged = buildMergedPermissionConfig(raw);
          logPlPerm("manage-share-load-sqlite", {
            companyId,
            hasSqliteRow: Boolean(row),
            hasPermissionConfig: Boolean(raw),
            dateLimits: summarizePermissionDateLimits(merged),
          });
          applyPermissionConfigFromServer(merged);
        } catch (e) {
          console.error(e);
          if (!cancelled) {
            applyPermissionConfigFromServer(
              buildMergedPermissionConfig(
                (companyData as { permissionConfig?: PermissionConfig } | null)?.permissionConfig ?? null
              )
            );
          }
        }
      })();
      return () => {
        cancelled = true;
      };
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
  }, [companyId, localPermissionSyncKey, applyPermissionConfigFromServer]);
  
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
  const [ownerAddons, setOwnerAddons] = useState<PurchasedPlanAddOns>(EMPTY_PURCHASED_PLAN_ADDONS);
  const [accountWideUserCount, setAccountWideUserCount] = useState(0);
  useEffect(() => {
    const ownerUid = String(companyData?.ownerId || user?.uid || "").trim();
    if (!ownerUid) {
      setOwnerAddons(EMPTY_PURCHASED_PLAN_ADDONS);
      setAccountWideUserCount(0);
      return;
    }
    const unsub = onSnapshot(
      doc(firestore, "users", ownerUid),
      (snap) => {
        setOwnerAddons(parsePurchasedPlanAddOns(snap.exists() ? (snap.data() as Record<string, unknown>) : null));
      },
      () => setOwnerAddons(EMPTY_PURCHASED_PLAN_ADDONS)
    );
    return () => unsub();
  }, [companyData?.ownerId, user?.uid]);
  useEffect(() => {
    const ownerUid = String(companyData?.ownerId || user?.uid || "").trim();
    if (!ownerUid) {
      setAccountWideUserCount(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const ownedSnap = await getDocs(
          query(collection(firestore, "companies"), where("ownerId", "==", ownerUid))
        );
        if (cancelled) return;
        const memberEmails = collectAccountWideShareMemberEmails({
          ownerEmail: companyData?.ownerEmail,
          ownedCompanyRows: ownedSnap.docs.map((row) =>
            row.data() as { sharedWithEmails?: unknown; ownerEmail?: unknown }
          ),
        });
        setAccountWideUserCount(memberEmails.size);
      } catch {
        if (!cancelled) setAccountWideUserCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyData?.ownerId, companyData?.ownerEmail, user?.uid, companyData?.sharedWithEmails]);
  const planAllowsFileAttachment = activePlan.entitlements.canAddFileImagePdf === true;
  const planMaxFilesPerVoucher = Math.max(0, Number(activePlan.entitlements.maxVoucherFileCount) || 0);
  const maxUsersPerPlanRaw = planUserCapWithAddOns(
    activePlan,
    companyStorageIsLocal(companyData?.storageOption),
    ownerAddons
  );
  const maxUsersPerPlan = isUnlimitedEntitlementCap(maxUsersPerPlanRaw)
    ? Number.POSITIVE_INFINITY
    : Math.max(0, maxUsersPerPlanRaw);
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

  const permissionCategoryOptions = useMemo(
    () => [
      { value: PERMISSION_CATEGORY_ALL, label: "All Categories" },
      { value: PERMISSION_CATEGORY_DATE, label: "Date Control" },
      { value: PERMISSION_CATEGORY_FILE, label: "File Attachment Settings" },
      ...PermissionGroups.map((group) => ({ value: group.title, label: group.title })),
    ],
    []
  );

  const filteredPermissionGroups = useMemo(() => {
    return PermissionGroups.map((group) => {
      if (
        permissionCategoryFilter !== PERMISSION_CATEGORY_ALL &&
        permissionCategoryFilter !== group.title
      ) {
        return { ...group, permissions: [] as typeof group.permissions };
      }
      const permissions = group.permissions.filter((permission) => {
        if (!permissionSearchNorm(permissionSearchQuery)) return true;
        if (permissionTextMatches(group.title, permissionSearchQuery)) return true;
        if (permissionTextMatches(permission.label, permissionSearchQuery)) return true;
        if (permission.description && permissionTextMatches(permission.description, permissionSearchQuery)) {
          return true;
        }
        return false;
      });
      return { ...group, permissions };
    }).filter((group) => group.permissions.length > 0);
  }, [permissionCategoryFilter, permissionSearchQuery]);

  const showDateControlSection = useMemo(() => {
    if (
      permissionCategoryFilter !== PERMISSION_CATEGORY_ALL &&
      permissionCategoryFilter !== PERMISSION_CATEGORY_DATE
    ) {
      return false;
    }
    return permissionSectionMatchesSearch(DATE_CONTROL_SEARCH_TEXTS, permissionSearchQuery);
  }, [permissionCategoryFilter, permissionSearchQuery]);

  const showFileAttachmentSection = useMemo(() => {
    if (
      permissionCategoryFilter !== PERMISSION_CATEGORY_ALL &&
      permissionCategoryFilter !== PERMISSION_CATEGORY_FILE
    ) {
      return false;
    }
    return permissionSectionMatchesSearch(FILE_ATTACHMENT_SEARCH_TEXTS, permissionSearchQuery);
  }, [permissionCategoryFilter, permissionSearchQuery]);

  const hasVisiblePermissionSections =
    showDateControlSection || showFileAttachmentSection || filteredPermissionGroups.length > 0;

  const isUserLimitReached = isAtOrOverEntitlementCap(accountWideUserCount, maxUsersPerPlan);

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
      
      const { shouldPersistPermissionConfigViaPlServerHost, notifyPlServerHostCompanyMetaSaved } = await import(
        "@/lib/plServerCompanyMetaSync"
      );
      // Strict: local/PL/gate → always SQLite host path (never Firebase write).
      const saveViaPlServerHost =
        companyUsesDeviceOrPlPermissionConfig(companyData) ||
        (await shouldPersistPermissionConfigViaPlServerHost(companyId, companyData));

      if (saveViaPlServerHost) {
        // Electron / PL host: SQLite `local_companies` delta export + staff meta ka source of truth.
        try {
          const existing = await getLocalCompanyById(companyId, { includeDeleted: true });
          if (!existing) {
            toast({
              variant: "destructive",
              title: "Could not save",
              description: "Local company row not found for permission save.",
            });
            return;
          }
          await upsertLocalCompany({
            ...existing,
            id: companyId,
            permissionConfig: configToSave,
            updatedAt: Date.now(),
          } as LocalCompanyDoc);
          try {
            const { flushPendingBrowserDbSave } = await import("@/lib/localSqlite");
            await flushPendingBrowserDbSave();
          } catch {
            /* best-effort */
          }
          // Verify round-trip — refresh pe 7 revert = write miss.
          const verify = await getLocalCompanyById(companyId, { includeDeleted: true });
          const verifiedDays = (verify as { permissionConfig?: PermissionConfig } | null)?.permissionConfig
            ?.dateLimits?.[selectedRoleForPermissions]?.editDays;
          const expectedEdit = configToSave.dateLimits?.[selectedRoleForPermissions]?.editDays;
          logPlPerm("host-save", {
            companyId,
            saveViaPlServerHost: true,
            dateLimits: summarizePermissionDateLimits(configToSave),
            selectedRole: selectedRoleForPermissions,
            verifiedEditDays: verifiedDays ?? null,
            expectedEditDays: expectedEdit ?? null,
          });
          if (expectedEdit != null && Number(verifiedDays) !== Number(expectedEdit)) {
            toast({
              variant: "destructive",
              title: "Save verify failed",
              description: "PermissionConfig SQLite me confirm nahi hua — try again.",
            });
            return;
          }
          // Do NOT call updateCompanyDocRoot here — local API mirror can race / omit fields.
          commitSavedPermissionConfig(configToSave);
          reloadLocalCompanyRegistry();
          if (typeof window !== "undefined") {
            const { PL_SERVER_COMPANY_META_UPDATED_EVENT } = await import("@/lib/plServerCompanyMetaSync");
            window.dispatchEvent(
              new CustomEvent(PL_SERVER_COMPANY_META_UPDATED_EVENT, { detail: { companyId } })
            );
          }
          // Live bump staff clients — await so gate gets full permissionConfig patch.
          await notifyPlServerHostCompanyMetaSaved(companyId, { permissionConfig: configToSave });
          toast({
            title: "Success",
            description: "Permissions saved on this PC — staff clients sync via PL server.",
          });
          return;
        } catch (e) {
          console.error(e);
          toast({
            variant: "destructive",
            title: "Could not save",
            description: "Local company: sync server chalao ya baad mein try karein.",
          });
          return;
        }
      }

      // Online company only — Firebase.
      if (companyUsesDeviceOrPlPermissionConfig(companyData)) {
        toast({
          variant: "destructive",
          title: "Could not save",
          description: "Local/PL company cannot save role permissions to Firebase.",
        });
        return;
      }

      const companyRef = doc(firestore, "companies", companyId);
      await updateDoc(companyRef, { permissionConfig: configToSave });
      commitSavedPermissionConfig(configToSave);
      triggerSync();
      toast({ title: "Success", description: "Permissions have been saved." });
      return;
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

          const emailLowerRemove = normalizeEmail(userToRemove.email);
          await updateDoc(companyRef, { 
              sharedWith: arrayRemove(fullUserObject),
              sharedWithEmails: arrayRemove(emailForArrayRemove),
              sharedWithEmailsLower: arrayRemove(emailLowerRemove),
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
  const isPlServerHostShare =
    isDeviceLocalCompany &&
    plServerHostShareable &&
    isElectronLocalServerApiAvailable();
  const hostShareablePending =
    isDeviceLocalCompany && isElectronLocalServerApiAvailable() && !plServerHostShareableResolved;

  if (hostShareablePending) {
    return (
      <div className="p-4 sm:p-6 md:p-8">
        <Card className={cn("w-full max-w-lg mx-auto", settingsDetailCardShell)} {...{ [companyProfileChromeRoot]: "" }}>
          <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking local server sharing…
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
        {isPlServerHostShare && companyData && companyId ? (
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
                  Share this local company via your PC server. Users get a Messages invite — ledger stays on this device.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className={`p-4 ${companyProfileGreenZone}`}>
              <LocalPlServerSharePanel
                companyId={companyId}
                companyName={companyData.name}
                allCompaniesRegistry={allCompaniesRegistry?.length ? allCompaniesRegistry : allCompanies}
                variant="manageShare"
              />
            </CardContent>
          </Card>
        ) : isDeviceLocalCompany && companyData && companyId ? (
          <Card className={settingsDetailCardShell} {...{ [companyProfileChromeRoot]: "" }}>
            <CardContent className="p-4 text-sm text-muted-foreground">
              Local company login users are managed in{" "}
              <strong>Settings → Company Profile</strong> (Add company user section).
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
                    Users: {accountWideUserCount}/{formatEntitlementCapLabel(maxUsersPerPlan)}
                  </span>
                  {isUserLimitReached && (
                    <span className="text-xs text-amber-700">
                      User limit reached.{" "}
                      <Link
                        href={nextPaidUpgradePlanId ? "/billing" : "/billing?addon=user"}
                        className="underline font-medium hover:no-underline"
                      >
                        {nextPaidUpgradePlanId ? "Update plan" : "Buy user add-on"}
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
                                      {COMPANY_SHARE_ROLE_OPTIONS.map((r) => (
                                        <SelectItem key={r.value} value={r.value}>
                                          {r.label}
                                        </SelectItem>
                                      ))}
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
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>Role Permissions</CardTitle>
                    </div>
                    <CardDescription>
                      Select a role to view and edit its permissions. Open <strong>My Role</strong> next to Settings to see what this login actually enforces.
                    </CardDescription>
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
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <Select value={selectedRoleForPermissions} onValueChange={(value) => setSelectedRoleForPermissions(value as UserRole)}>
                        <SelectTrigger className="w-[220px]">
                            <SelectValue placeholder="Select a role to edit" />
                        </SelectTrigger>
                        <SelectContent>
                            {COMPANY_PERMISSION_ROLE_OPTIONS.map((r) => (
                                <SelectItem key={r.value} value={r.value}>
                                    {r.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={permissionCategoryFilter} onValueChange={setPermissionCategoryFilter}>
                        <SelectTrigger className="w-[220px]">
                            <SelectValue placeholder="All Categories" />
                        </SelectTrigger>
                        <SelectContent>
                            {permissionCategoryOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <div className="relative w-full sm:w-[260px]">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={permissionSearchQuery}
                        onChange={(e) => setPermissionSearchQuery(e.target.value)}
                        placeholder="Search categories & permissions…"
                        className={cn("pl-8", permissionSearchQuery.trim() ? "pr-9" : "pr-3")}
                      />
                      {permissionSearchQuery.trim() ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0.5 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label="Clear search"
                          onClick={() => setPermissionSearchQuery("")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                    </div>
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
                 {!hasVisiblePermissionSections ? (
                    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      No permissions match your category or search.
                    </p>
                 ) : null}
                 {showDateControlSection ? (
                 <div className="space-y-4 pt-4">
                    <h3 className="text-lg font-semibold border-b pb-2">Date Control</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {["Entry", "Edit", "Delete"].map((action) => {
                        const key = `${action.toLowerCase()}Days` as keyof typeof dateLimitsForSelectedRole;
                        const value = dateLimitsForSelectedRole?.[key] ?? 0;
                        return (
                            <div key={action} className="flex flex-col gap-2 rounded-lg border p-3">
                            <div className="flex items-center gap-2">
                              <label className="text-sm font-medium">{`Back Date ${action} Days`}</label>
                              <PermissionHelpPopover
                                label={`Back Date ${action} Days`}
                                description={DATE_CONTROL_DAYS_HELP}
                              />
                            </div>
                             <Input
                                type="number"
                                min={0}
                                value={value}
                                onChange={(e) => handleDateLimitChange(action.toLowerCase() as any, Number(e.target.value))}
                                disabled={selectedRoleForPermissions === "owner"}
                                className="w-full"
                              />
                            </div>
                        );
                        })}
                    </div>
                </div>
                ) : null}

                {showFileAttachmentSection ? (
                <div className="space-y-4 pt-4">
                    <h3 className="text-lg font-semibold border-b pb-2">File Attachment Settings</h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {showFileAttachmentUpgradeBanner ? (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                        <p className="font-semibold text-amber-900">
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
                    <p className="rounded-lg border border-black bg-muted/30 p-3 text-sm font-semibold text-foreground">
                        Your current plan allows max {planMaxFilesPerVoucher} file(s) per voucher.
                    </p>
                    )}
                    
                    {/* Global Toggle */}
                    <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
                        <div className="flex min-w-0 items-center gap-2">
                            <label className="text-base font-medium">Allow File Attachments</label>
                            <PermissionHelpPopover
                                label="Allow File Attachments"
                                description="Enable or disable file uploads across all voucher and entry forms."
                            />
                        </div>
                        <Switch 
                            checked={allowAttachmentsGlobal} 
                            onCheckedChange={handleAllowAttachmentsGlobalChange}
                        />
                    </div>
                    </div>

                    {/* Role-based File Limits */}
                    {allowAttachmentsGlobal && (
                        <div className="space-y-4 p-4 border rounded-lg">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-sm font-semibold">File Limits for {companyShareRoleLabel(selectedRoleForPermissions)} Role</h4>
                              {showPlanFileLimitNotice ? (
                                <PermissionHelpPopover
                                  label={`File Limits for ${companyShareRoleLabel(selectedRoleForPermissions)} Role`}
                                  description={`Role limit is capped by plan. Effective max files is ${effectiveRoleMaxFiles}.`}
                                />
                              ) : null}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch">
                                {/* Max File Count */}
                                <div className="flex flex-col justify-center gap-2 rounded-lg border p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <label className="text-sm font-medium">Max File Count (0-{planMaxFilesPerVoucher})</label>
                                        <PermissionHelpPopover
                                          label={`Max File Count (0-${planMaxFilesPerVoucher})`}
                                          description="Maximum number of files allowed per voucher under current plan."
                                        />
                                      </div>
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
                                          className="h-9 w-16 shrink-0 px-2 text-center"
                                      />
                                    </div>
                                </div>

                                {/* Allow Image */}
                                <div className="flex flex-col justify-center gap-2 rounded-lg border p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <label className="text-sm font-medium">Allow Image Files</label>
                                        <PermissionHelpPopover
                                          label="Allow Image Files"
                                          description="Enable image file uploads."
                                        />
                                      </div>
                                      <Switch
                                          checked={fileAttachmentLimitsForSelectedRole.allowImage}
                                          onCheckedChange={(checked) => handleFileAttachmentLimitChange('allowImage', checked)}
                                          disabled={selectedRoleForPermissions === "owner" || effectiveRoleMaxFiles === 0 || !planAllowsFileAttachment}
                                      />
                                    </div>
                                </div>

                                {/* Allow PDF */}
                                <div className="flex flex-col justify-center gap-2 rounded-lg border p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <label className="text-sm font-medium">Allow PDF Files</label>
                                        <PermissionHelpPopover
                                          label="Allow PDF Files"
                                          description="Enable PDF file uploads."
                                        />
                                      </div>
                                      <Switch
                                          checked={fileAttachmentLimitsForSelectedRole.allowPDF}
                                          onCheckedChange={(checked) => handleFileAttachmentLimitChange('allowPDF', checked)}
                                          disabled={selectedRoleForPermissions === "owner" || effectiveRoleMaxFiles === 0 || !planAllowsFileAttachment}
                                      />
                                    </div>
                                </div>

                                {/* Allow Delete Uploaded Files */}
                                <div className="flex flex-col justify-center gap-2 rounded-lg border p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <label className="text-sm font-medium">Allow File Delete</label>
                                        <PermissionHelpPopover
                                          label="Allow File Delete"
                                          description="Allow deleting uploaded files from voucher attachments."
                                        />
                                      </div>
                                      <Switch
                                          checked={!!fileAttachmentLimitsForSelectedRole.allowDelete}
                                          onCheckedChange={(checked) => handleFileAttachmentLimitChange('allowDelete', checked)}
                                          disabled={selectedRoleForPermissions === "owner" || effectiveRoleMaxFiles === 0 || !planAllowsFileAttachment}
                                      />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                ) : null}

                {filteredPermissionGroups.map((group) => (
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
