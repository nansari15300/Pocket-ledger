
"use client";

import { useMemo } from "react";
import { startOfDay, differenceInCalendarDays } from "date-fns";
import { useAuth } from "./useAuth";
import { useCompany } from "./useCompany";
import { Permission, PermissionGroups } from "@/lib/permissions";
import { useLivePlans, getPlanFromPlans } from "@/hooks/useLivePlans";


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
  roles: {
    viewer:       [true, false, false, false, false, false, false, false, false, false, false, false, true, false, true, true, true, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    "data-entry": [true, false, true, true, false, true, false, false, false, false, false, false, true, true, true, true, true, false, false, false, false, false, false, false, false, false, false, false, false, true, true],
    accountant:   [true, true, true, true, true, true, true, true, true, false, false, false, true, true, true, true, true, false, true, true, true, false, false, false, false, false, false, true, false, true, true],
    editor:       [true, true, true, true, true, true, true, true, true, false, false, false, true, true, true, true, true, false, true, true, true, false, false, false, false, false, false, true, false, true, true],
    manager:      [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, false, true, true, true, true, true, true],
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
    viewer: { maxFileCount: 0, allowImage: false, allowPDF: false },
    "data-entry": { maxFileCount: 3, allowImage: true, allowPDF: true },
    accountant: { maxFileCount: 5, allowImage: true, allowPDF: true },
    editor: { maxFileCount: 5, allowImage: true, allowPDF: true },
    manager: { maxFileCount: 5, allowImage: true, allowPDF: true },
    owner: { maxFileCount: 5, allowImage: true, allowPDF: true },
  },
  allowAttachments: true,
};


const usePermissions = () => {
    const { customUser } = useAuth();
    const { company } = useCompany();
    const livePlans = useLivePlans();

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
                const sharedUser = company.sharedWith?.find(u => 
                    u.email && customUser.email && 
                    u.email.toLowerCase().trim() === customUser.email.toLowerCase().trim()
                );
                if (sharedUser?.role) {
                    const r = String(sharedUser.role).toLowerCase();
                    if (['viewer', 'data-entry', 'accountant', 'editor', 'manager', 'owner'].includes(r)) {
                        role = r as UserRole;
                    }
                }
            }
            }
        }
        
        const rolePermissions = config.roles[role] || [];
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

        const plan = getPlanFromPlans(livePlans, (company?.planId as any) || "basic");
        const canAddAvatar = plan.entitlements.canAddAvatar === true;
        const canAddFileImagePdf = plan.entitlements.canAddFileImagePdf === true;
        const planMaxFiles = Math.max(0, Math.min(10, Number(plan.entitlements.maxVoucherFileCount) || 0));
        const roleFileLimits = config.fileAttachmentLimits?.[role] || { maxFileCount: 0, allowImage: false, allowPDF: false };
        const cappedMax = canAddFileImagePdf && planMaxFiles > 0
          ? Math.min(roleFileLimits.maxFileCount, planMaxFiles)
          : 0;
        const fileAttachmentLimits = canAddFileImagePdf && planMaxFiles > 0
          ? { ...roleFileLimits, maxFileCount: cappedMax }
          : { maxFileCount: 0, allowImage: false, allowPDF: false };
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

    }, [customUser, company, livePlans]);

    return permissions;
};

export default usePermissions;
