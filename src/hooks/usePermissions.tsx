
"use client";

import { useEffect, useMemo, useState } from "react";
import { startOfDay, differenceInCalendarDays } from "date-fns";
import { useAuth } from "./useAuth";
import { useCompany } from "./useCompany";
import { Permission, PermissionGroups } from "@/lib/permissions";
import { useLivePlans, getPlanFromPlans } from "@/hooks/useLivePlans";
import { getLocalAuthToken, getLocalAuthUser, LOCAL_AUTH_CHANGED_EVENT } from "@/lib/localApiClient";
import { isLocalOnlyMode } from "@/lib/localMode";
import { resolvePlanIdForActiveCompany } from "@/lib/accountPlanForOwner";
import { readCloudSyncDriveShareUsers } from "@/lib/localCloudSync/companyConfig";


export type UserRole = "viewer" | "data-entry" | "accountant" | "editor" | "manager" | "owner";

export type DateLimits = {
    [key in UserRole]?: {
        entryDays: number;
        editDays: number;
        deleteDays: number;
    }
}

export type FileAttachmentLimits = {
    [key in UserRole]?: {
        maxFileCount: number; // 0 to 5
        allowImage: boolean;
        allowPDF: boolean;
        allowDelete: boolean;
    }
}

export type PermissionConfig = {
  permissions: Record<string, string[]>;
  roles: Record<UserRole, boolean[]>;
  dateLimits: DateLimits;
  fileAttachmentLimits?: FileAttachmentLimits;
  allowAttachments?: boolean; // Global toggle
};

const flattenedPermissions = PermissionGroups.flatMap(g => g.permissions.map(p => p.key));

export const initialPermissionConfig: PermissionConfig = {
  permissions: PermissionGroups.reduce((acc, group) => {
    acc[group.title] = group.permissions.map(p => p.label);
    return acc;
  }, {} as Record<string, string[]>),
  // Role arrays: order matches flattenedPermissions (trailing block = Recurring Auto Voucher group).
  roles: {
    viewer:       [true, false, false, false, false, false, false, false, false, false, false, false, true, false, true, true, true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    // data-entry: manage_users_roles + configure_company_settings = false; recurring voucher strip allowed.
    "data-entry": [true, false, true, true, false, true, false, false, false, false, false, false, false, false, true, true, true, false, false, false, false, false, false, false, false, false, false, false, true, true, false, false, false, false, true, true, true, true, false, false, false, false, false, false, false, false, false, false],
    accountant:   [true, true, true, true, true, true, true, true, true, false, true, true, true, true, true, true, true, false, true, true, true, false, false, false, false, false, false, true, false, true, true, false, false, false, false, true, true, true, true, true, true, false, true, true, true, true, true, true],
    editor:       [true, true, true, true, true, true, true, true, true, false, true, true, true, true, true, true, true, false, true, true, true, false, false, false, false, false, false, true, false, true, true, false, false, false, false, true, true, true, true, true, true, false, true, true, true, true, true, true],
    manager:      [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, false, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
    owner: Array(flattenedPermissions.length).fill(true)
  },
  dateLimits: {
    viewer: { entryDays: 0, editDays: 0, deleteDays: 0 },
    "data-entry": { entryDays: 2, editDays: 0, deleteDays: 0 },
    accountant: { entryDays: 0, editDays: 7, deleteDays: 0 },
    editor: { entryDays: 3, editDays: 5, deleteDays: 5 },
    manager: { entryDays: 7, editDays: 7, deleteDays: 7 },
    owner: { entryDays: 9999, editDays: 9999, deleteDays: 9999 },
  },
  fileAttachmentLimits: {
    viewer: { maxFileCount: 0, allowImage: false, allowPDF: false, allowDelete: false },
    "data-entry": { maxFileCount: 3, allowImage: true, allowPDF: true, allowDelete: true },
    accountant: { maxFileCount: 5, allowImage: true, allowPDF: true, allowDelete: true },
    editor: { maxFileCount: 5, allowImage: true, allowPDF: true, allowDelete: true },
    manager: { maxFileCount: 5, allowImage: true, allowPDF: true, allowDelete: true },
    owner: { maxFileCount: 5, allowImage: true, allowPDF: true, allowDelete: true },
  },
  allowAttachments: true,
};


/** Offline company SQLite session — ye role Firebase owner se alag ho sakta hai (same email owner + staff login). */
function isLocalStorageCompany(c: { storageOption?: string } | null | undefined): boolean {
  return String(c?.storageOption || "local").toLowerCase() === "local";
}

const usePermissions = () => {
    const { customUser } = useAuth();
    const { company, allCompanies } = useCompany();
    const livePlans = useLivePlans();
    /** Local unlock ke baad localStorage role turant useMemo me aaye (same-tab me storage event nahi aata). */
    const [localAuthEpoch, setLocalAuthEpoch] = useState(0);
    useEffect(() => {
      const onAuth = () => setLocalAuthEpoch((n) => n + 1);
      window.addEventListener(LOCAL_AUTH_CHANGED_EVENT, onAuth);
      return () => window.removeEventListener(LOCAL_AUTH_CHANGED_EVENT, onAuth);
    }, []);

    const permissions = useMemo(() => {
        const config: PermissionConfig = company?.permissionConfig || initialPermissionConfig;
        
        let role: UserRole = 'viewer'; 

        if (customUser && company) {
            // SuperAdmin: treat as owner for selected company so they can use app like a normal user (plans, header buttons, etc.)
            if (customUser.role === 'SuperAdmin') {
                role = 'owner';
            } else {
            // Check if user is owner by email (case-insensitive) or by ownerId
            const isOwnerByEmail = company.ownerEmail && 
                customUser.email && 
                customUser.email.toLowerCase().trim() === company.ownerEmail.toLowerCase().trim();
            const isOwnerById = company.ownerId && 
                customUser.uid && 
                company.ownerId === customUser.uid;
            
            if (isOwnerByEmail || isOwnerById) {
                role = 'owner';
            } else {
                const normalizedEmail = (customUser.email || "").toLowerCase().trim();
                const sharedUser = company.sharedWith?.find((u: any) => {
                    const sharedEmail = (u?.email || "").toLowerCase().trim();
                    const byUid = !!u?.uid && !!customUser.uid && String(u.uid) === String(customUser.uid);
                    const byEmail = !!sharedEmail && !!normalizedEmail && sharedEmail === normalizedEmail;
                    return byUid || byEmail;
                });
                if (sharedUser?.role) {
                    const normalizedRole = String(sharedUser.role)
                      .toLowerCase()
                      .trim()
                      .replace(/_/g, "-")
                      .replace(/\s+/g, "-");
                    if (["viewer", "data-entry", "accountant", "editor", "manager", "owner"].includes(normalizedRole)) {
                        role = normalizedRole as UserRole;
                    }
                } else if (isLocalStorageCompany(company) && normalizedEmail) {
                    // Drive Gmail share list — app role (Drive par hamesha writer).
                    const driveShareUsers = readCloudSyncDriveShareUsers(company as Record<string, unknown>);
                    const driveShare = driveShareUsers.find((u) => u.email === normalizedEmail);
                    if (driveShare?.appRole) {
                        const normalizedRole = String(driveShare.appRole)
                          .toLowerCase()
                          .trim()
                          .replace(/_/g, "-")
                          .replace(/\s+/g, "-");
                        if (["viewer", "data-entry", "accountant", "editor", "manager", "owner"].includes(normalizedRole)) {
                            role = normalizedRole as UserRole;
                        }
                    }
                }
            }
            }
        } else if (customUser && !company) {
            // Header "No Company": company-scoped role nahi milta — viewer reh kar `delete_records` false ho jata tha
            // aur sidebar / PermissionRouteGuard recycle bin chhupa dete. Bin me deleted companies tab bhi hoti hain.
            if (customUser.role === "SuperAdmin") {
                role = "owner";
            } else {
                const normalizedEmail = (customUser.email || "").toLowerCase().trim();
                const uid = (customUser.uid || "").trim();
                const ownsAnyInList = allCompanies.some((c) => {
                    if (c.isOwned === true) return true;
                    if (uid && String(c.ownerId || "").trim() === uid) return true;
                    if (normalizedEmail) {
                        const oe = String(c.ownerEmail || "").toLowerCase().trim();
                        if (oe && oe === normalizedEmail) return true;
                    }
                    return false;
                });
                // List empty: sab active companies delete ho chuki (ya load) — owner phir bhi apna recycle bin khol sake
                if (ownsAnyInList || (uid.length > 0 && allCompanies.length === 0)) {
                    role = "owner";
                }
            }
        }

        // Local company: effective role = local unlock (username/password), NOT only Firebase owner email.
        // `local_admin_fallback` = Admin username + company password → owner-level settings.
        if (customUser && company && isLocalStorageCompany(company) && company.id && getLocalAuthToken(company.id)) {
          const localUser = getLocalAuthUser(company.id);
          if (localUser?.id) {
            if (localUser.id === "local_admin_fallback") {
              role = "owner";
            } else if (localUser.role) {
              const normalizedRole = String(localUser.role)
                .toLowerCase()
                .trim()
                .replace(/_/g, "-")
                .replace(/\s+/g, "-");
              if (["viewer", "data-entry", "accountant", "editor", "manager", "owner"].includes(normalizedRole)) {
                role = normalizedRole as UserRole;
              }
            }
          }
        }
        
        // Firestore may have shorter boolean[] than current PermissionGroups (new keys appended); pad from defaults so can() stays aligned.
        const storedRolePerms = config.roles[role] || [];
        const defaultRolePerms = initialPermissionConfig.roles[role] || [];
        const rolePermissions = flattenedPermissions.map((_, i) =>
            i < storedRolePerms.length ? !!storedRolePerms[i] : !!defaultRolePerms[i]
        );
        const dateLimits = config.dateLimits?.[role] || { entryDays: 0, editDays: 0, deleteDays: 0 };
        
        const can = (permissionName: Permission): boolean => {
            if (role === 'owner') return true;
            const index = flattenedPermissions.indexOf(permissionName);
            if (index === -1) return false;
            return rolePermissions[index] || false;
        };
        
        const canPerformBackdatedAction = (action: 'entry' | 'edit' | 'delete', recordDate?: Date): boolean => {
            if (role === 'owner') return true;
            if (!recordDate) return true;

            const limit = dateLimits[`${action}Days`];
            // 9999+ = unlimited (allow any backdate)
            if (limit >= 9999) return true;

            const today = startOfDay(new Date());
            const recordDay = startOfDay(recordDate instanceof Date ? recordDate : new Date(recordDate));
            const ageInDays = differenceInCalendarDays(today, recordDay);

            // 0 = disabled: no backdate (only today allowed)
            if (limit === 0) return ageInDays === 0;
            // Positive limit: allow records from today (0) up to limit days in the past
            return ageInDays >= 0 && ageInDays <= limit;
        };

        const canEditRecord = (isOwnRecord: boolean, voucher?: { isApproved?: boolean } | null): boolean => {
            if (role === 'owner') return true;
            if (voucher?.isApproved && !can('edit_approved_voucher')) return false;
            return can('edit_all_records') || (can('edit_own_records') && isOwnRecord);
        };

        const canDeleteVoucher = (voucher?: { isApproved?: boolean } | null): boolean => {
            if (!can('delete_records')) return false;
            if (voucher?.isApproved && !can('delete_approved_voucher')) return false;
            return true;
        };

        // Shared user: company.owner ka planId (advance file limit 2); owned: account-level best SKU
        const effectivePlanId = resolvePlanIdForActiveCompany(
          company,
          allCompanies,
          customUser?.uid,
          customUser?.email
        );
        const plan = getPlanFromPlans(livePlans, effectivePlanId);
        const roleFileLimits = config.fileAttachmentLimits?.[role] || { maxFileCount: 0, allowImage: false, allowPDF: false, allowDelete: false };

        // Plan entitlements (live `app_settings/plans` + cache); default basic tier me files band ho sakte hain
        let canAddFileImagePdf = plan.entitlements.canAddFileImagePdf === true;
        let planMaxFiles = Math.max(0, Math.min(10, Number(plan.entitlements.maxVoucherFileCount) || 0));

        /** Viewer ke alawa role jab file types allow karti ho — SQLite/local company par `planId` purana "basic" reh jata hai ya offline cache miss */
        const roleAllowsFiles =
          role !== "viewer" &&
          (roleFileLimits.maxFileCount > 0 || roleFileLimits.allowImage || roleFileLimits.allowPDF);

        // Static APK / local storage company: billing/advance Firestore tak sync na ho to bhi voucher attachments role ke hisaab se khulen
        if (
          company &&
          config.allowAttachments !== false &&
          roleAllowsFiles &&
          (!canAddFileImagePdf || planMaxFiles === 0) &&
          (isLocalStorageCompany(company) || isLocalOnlyMode())
        ) {
          canAddFileImagePdf = true;
          planMaxFiles = Math.max(
            planMaxFiles,
            Math.min(10, Math.max(1, Number(roleFileLimits.maxFileCount) || 3))
          );
        }

        let canAddAvatar = plan.entitlements.canAddAvatar === true;
        // Local company / APK: `app_settings/plans` sync na ho ya cache purana ho to `basic` bundle me `canAddAvatar: false` reh jata hai — party-staff avatar bhi voucher files jaisa role se chale
        if (
          company &&
          role !== "viewer" &&
          !canAddAvatar &&
          (isLocalStorageCompany(company) || isLocalOnlyMode())
        ) {
          canAddAvatar = true;
        }
        const cappedMax = canAddFileImagePdf && planMaxFiles > 0
          ? Math.min(roleFileLimits.maxFileCount, planMaxFiles)
          : 0;
        const fileAttachmentLimits = canAddFileImagePdf && planMaxFiles > 0
          ? { ...roleFileLimits, maxFileCount: cappedMax }
          : { maxFileCount: 0, allowImage: false, allowPDF: false, allowDelete: false };
        const allowAttachments = (config.allowAttachments !== false) && canAddFileImagePdf && planMaxFiles > 0;

        return { 
            can, 
            role, 
            dateLimits, 
            canPerformBackdatedAction, 
            canEditRecord,
            canDeleteVoucher,
            fileAttachmentLimits,
            allowAttachments,
            canAddAvatar,
            canAddFileImagePdf,
        };

    }, [customUser, company, allCompanies, livePlans, localAuthEpoch]);

    return permissions;
};

function normalizeStaffRoleString(raw: string | undefined): UserRole {
    if (!raw) return "viewer";
    const n = String(raw)
        .toLowerCase()
        .trim()
        .replace(/_/g, "-")
        .replace(/\s+/g, "-");
    if (["viewer", "data-entry", "accountant", "editor", "manager", "owner"].includes(n)) {
        return n as UserRole;
    }
    return "viewer";
}

type RecycleBinCompanyOwnerPick = { ownerId?: string; ownerEmail?: string };

/**
 * Recycle bin me deleted **local** company: header me jo company select hai uske `usePermissions` se alag —
 * is company id ke local unlock session (ya Firebase owner) se role.
 */
export function getLocalSessionRoleForRecycleBinCompany(
    companyId: string,
    row: RecycleBinCompanyOwnerPick | undefined,
    firebaseUid: string | undefined,
    firebaseEmail: string | null | undefined
): UserRole {
    const cid = String(companyId || "").trim();
    if (!cid) return "viewer";

    if (getLocalAuthToken(cid)) {
        const u = getLocalAuthUser(cid);
        if (u?.id === "local_admin_fallback") return "owner";
        return normalizeStaffRoleString(u?.role);
    }

    if (row && firebaseUid) {
        const ue = String(firebaseEmail || "").toLowerCase().trim();
        const oid = String(row.ownerId || "").trim();
        const oe = String(row.ownerEmail || "").toLowerCase().trim();
        if (oid && oid === firebaseUid) return "owner";
        if (oe && ue && oe === ue) return "owner";
    }
    return "viewer";
}

/** Local company recycle bin row: `permanently_delete_records` / `delete_records` header company se alag evaluate. */
export function canForRecycleBinLocalCompany(
    companyId: string,
    row: RecycleBinCompanyOwnerPick | undefined,
    firebaseUid: string | undefined,
    firebaseEmail: string | null | undefined,
    permission: Permission
): boolean {
    const role = getLocalSessionRoleForRecycleBinCompany(companyId, row, firebaseUid, firebaseEmail);
    if (role === "owner") return true;
    const idx = flattenedPermissions.indexOf(permission);
    if (idx === -1) return false;
    const arr = initialPermissionConfig.roles[role] || [];
    return !!arr[idx];
}

export default usePermissions;
