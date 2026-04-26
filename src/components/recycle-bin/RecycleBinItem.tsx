
"use client";

import { RotateCcw, Trash2, ArrowRight, ArrowUpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PermissionButton } from "@/components/permission";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { coerceDeletedAtToDate } from "@/lib/coerceDeletedAt";

export type DeletedItem = {
    id: string;
    name: string;
    type: string;
    deletedAt: any;
    collectionPath: string;
    convertedToType?: string;
    convertedToVoucherNumber?: string;
    allowCompanyAdminRecycleBin?: boolean; // New prop
    pan?: string;
    phone?: string;
    address?: string;
    email?: string;
    /** Company's email (for super admin list) */
    companyEmail?: string | null;
    /** User's login email (for super admin list) */
    userLoginEmail?: string | null;
    ownerEmail?: string;
    ownerId?: string;
    country?: string;
    isRootCollection?: boolean; // New prop for companies
    // Voucher-specific fields
    voucherNumber?: string;
    date?: any;
    accountId?: string;
    fromAccountId?: string;
    toAccountId?: string;
    accountName?: string;
    userId?: string;
    deletedBy?: string;
    deletedByUserName?: string;
    /** When set, item was sent to admin bin by user; admin may auto-delete after X days. */
    movedToAdminRecycleAt?: Date | null;
    /** User recycle bin: deleted company row — local SQLite vs Firestore mirror. */
    companyStorageSource?: "local" | "online";
};

interface RecycleBinItemProps {
    item: DeletedItem;
    onRestore: (item: DeletedItem) => void;
    onDelete: (item: DeletedItem) => void;
    /** e.g. "90 days to delete permanently" or "45 days until permanent delete" */
    daysToPermanentDeleteText?: string | null;
    /** When true, Restore and Delete Permanently buttons are disabled (e.g. Visible to Company admin tab) */
    disableActions?: boolean;
    /** When true, Restore button is disabled (e.g. plan max companies reached) */
    restoreDisabled?: boolean;
    /** When true, show only name, deleted date/time, and countdown (e.g. company admin recycle bin) */
    compactView?: boolean;
    /**
     * User recycle bin: **online** deleted company — apni company par header me shared company select ho to
     * `PermissionButton` band na ho (Firestore role).
     */
    ownerScopedCompanyActions?: boolean;
    /**
     * **Local** deleted company: header company ke `usePermissions` se alag — is row ke local unlock / owner se.
     * `undefined` = online row ya non-company (PermissionButton path).
     */
    localRecycleBinRestore?: boolean;
    localRecycleBinPermanentDelete?: boolean;
}

export function RecycleBinItem({
    item,
    onRestore,
    onDelete,
    daysToPermanentDeleteText,
    disableActions,
    restoreDisabled,
    compactView,
    ownerScopedCompanyActions,
    localRecycleBinRestore,
    localRecycleBinPermanentDelete,
}: RecycleBinItemProps) {
    const isConverted = !!item.convertedToType;
    const canRestoreCompany = !(item.isRootCollection && item.allowCompanyAdminRecycleBin === false);
    const isCompanyCard = item.isRootCollection === true || item.collectionPath === "companies";
    const useLocalRecycleBinButtons =
        isCompanyCard && typeof localRecycleBinRestore === "boolean" && typeof localRecycleBinPermanentDelete === "boolean";

    return (
        <li
            className={cn(
                "flex flex-col p-3 sm:p-4 hover:bg-muted/50",
                isConverted && "bg-blue-50/50 hover:bg-blue-50/70"
            )}
        >
            {/* Content – always on top */}
            <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm sm:text-base truncate">{item.name}</p>
                    {isCompanyCard && item.companyStorageSource && (
                        <Badge
                            variant={item.companyStorageSource === "local" ? "secondary" : "outline"}
                            className="text-[10px] sm:text-xs font-medium shrink-0"
                        >
                            {item.companyStorageSource === "local" ? "Local" : "Online"}
                        </Badge>
                    )}
                    {item.voucherNumber && (
                        <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded flex-shrink-0">
                            {item.voucherNumber}
                        </span>
                    )}
                </div>
                {!compactView && item.type === 'Voucher' && (
                    <>
                        {item.accountName && (
                            <p className="text-xs text-muted-foreground whitespace-nowrap truncate">
                                Account: <span className="font-medium">{item.accountName}</span>
                            </p>
                        )}
                        {item.date && (
                            <p className="text-xs text-muted-foreground whitespace-nowrap">
                                Voucher Date: <span className="font-medium">{item.date instanceof Date ? item.date.toLocaleDateString() : new Date(item.date).toLocaleDateString()}</span>
                            </p>
                        )}
                    </>
                )}
                {/* compactView bhi: company recycle bin me "Deleted by" dikhna chahiye */}
                {item.deletedByUserName && (
                    <p className="text-xs text-muted-foreground whitespace-nowrap truncate">
                        Deleted by: <span className="font-medium">{item.deletedByUserName}</span>
                    </p>
                )}
                {/* For companies (super admin list only): show all fields with N/A if empty */}
                {!compactView && item.isRootCollection && (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                        <p className="whitespace-nowrap truncate">User (login) email: <span className="font-medium">{item.userLoginEmail || item.ownerEmail || 'N/A'}</span></p>
                        <p className="whitespace-nowrap truncate">Company email: <span className="font-medium">{item.companyEmail ?? item.email ?? 'N/A'}</span></p>
                        <p className="truncate">Address: <span className="font-medium">{item.address || 'N/A'}</span></p>
                        <p className="whitespace-nowrap truncate">Phone: <span className="font-medium">{item.phone || 'N/A'}</span></p>
                        <p className="whitespace-nowrap truncate">VAT/PAN: <span className="font-medium">{(item.pan != null && item.pan !== '') ? item.pan : 'N/A'}</span></p>
                        <p className="whitespace-nowrap truncate">Country: <span className="font-medium">{item.country || 'N/A'}</span></p>
                    </div>
                )}
                {/* Non-company items (super admin): show only present fields */}
                {!compactView && !item.isRootCollection && (item.email || item.address || item.phone || item.pan || item.country) && (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                        {item.email && (
                            <p className="whitespace-nowrap truncate">Email: <span className="font-medium">{item.email}</span></p>
                        )}
                        {item.address && (
                            <p className="truncate">Address: <span className="font-medium">{item.address}</span></p>
                        )}
                        {item.phone && (
                            <p className="whitespace-nowrap truncate">Phone: <span className="font-medium">{item.phone}</span></p>
                        )}
                        {(item.pan != null && item.pan !== '') && (
                            <p className="whitespace-nowrap truncate">VAT/PAN: <span className="font-medium">{item.pan}</span></p>
                        )}
                        {item.country && (
                            <p className="whitespace-nowrap truncate">Country: <span className="font-medium">{item.country}</span></p>
                        )}
                    </div>
                )}
                <p className="text-xs text-muted-foreground whitespace-nowrap">
                    Deleted on:{" "}
                    {(() => {
                        const d = coerceDeletedAtToDate(item.deletedAt);
                        return d ? d.toLocaleString() : "N/A";
                    })()}
                </p>
                {!compactView && (
                    <p className="text-xs text-muted-foreground whitespace-nowrap truncate">
                        ID: <span className="font-mono text-[10px] sm:text-xs">{item.id}</span>
                    </p>
                )}
                {daysToPermanentDeleteText && (
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-500">
                        {daysToPermanentDeleteText}
                    </p>
                )}
                {!compactView && isConverted && (
                    <p className="text-xs sm:text-sm text-blue-600 font-semibold flex items-center gap-1 mt-1 flex-wrap">
                        <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                        <span className="break-words">
                            Converted to{" "}
                            {item.convertedToType
                                ?.replace(/_/g, " ")
                                .replace(/\b\w/g, (l) => l.toUpperCase())}{" "}
                            (#{item.convertedToVoucherNumber})
                        </span>
                    </p>
                )}
            </div>

            {/* Buttons – always below content, ~50% smaller */}
            <div className="flex flex-wrap gap-1.5 items-center justify-end pt-3 mt-1 border-t border-border/60">
                {!isConverted && (
                    <>
                        {canRestoreCompany ? (
                            useLocalRecycleBinButtons ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onRestore(item)}
                                    className="h-5 min-w-0 px-1.5 text-[10px] flex-shrink-0"
                                    disabled={disableActions || restoreDisabled || !localRecycleBinRestore}
                                >
                                    <RotateCcw className="mr-0.5 h-2.5 w-2.5" />
                                    <span>Restore</span>
                                </Button>
                            ) : ownerScopedCompanyActions ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onRestore(item)}
                                    className="h-5 min-w-0 px-1.5 text-[10px] flex-shrink-0"
                                    disabled={disableActions || restoreDisabled}
                                >
                                    <RotateCcw className="mr-0.5 h-2.5 w-2.5" />
                                    <span>Restore</span>
                                </Button>
                            ) : (
                                <PermissionButton
                                    permission="delete_records"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onRestore(item)}
                                    className="h-5 min-w-0 px-1.5 text-[10px] flex-shrink-0"
                                    disabled={disableActions || restoreDisabled}
                                >
                                    <RotateCcw className="mr-0.5 h-2.5 w-2.5" />
                                    <span>Restore</span>
                                </PermissionButton>
                            )
                        ) : (
                            <Button
                                variant="secondary"
                                size="sm"
                                asChild
                                className="h-5 min-w-0 px-1.5 text-[10px] flex-shrink-0"
                            >
                                <Link
                                    href="/admin/plans"
                                    className="flex items-center justify-center"
                                >
                                    <ArrowUpCircle className="mr-0.5 h-2.5 w-2.5" />
                                    <span>Upgrade to Restore</span>
                                </Link>
                            </Button>
                        )}
                    </>
                )}
                {useLocalRecycleBinButtons ? (
                    <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => onDelete(item)}
                        className="h-5 min-w-0 px-1.5 text-[10px] flex-shrink-0"
                        disabled={disableActions || !localRecycleBinPermanentDelete}
                    >
                        <Trash2 className="mr-0.5 h-2.5 w-2.5" />
                        <span>Delete Permanently</span>
                    </Button>
                ) : ownerScopedCompanyActions ? (
                    <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => onDelete(item)}
                        className="h-5 min-w-0 px-1.5 text-[10px] flex-shrink-0"
                        disabled={disableActions}
                    >
                        <Trash2 className="mr-0.5 h-2.5 w-2.5" />
                        <span>Delete Permanently</span>
                    </Button>
                ) : (
                    <PermissionButton
                        permission="permanently_delete_records"
                        variant="destructive"
                        size="sm"
                        onClick={() => onDelete(item)}
                        className="h-5 min-w-0 px-1.5 text-[10px] flex-shrink-0"
                        disabled={disableActions}
                    >
                        <Trash2 className="mr-0.5 h-2.5 w-2.5" />
                        <span>Delete Permanently</span>
                    </PermissionButton>
                )}
            </div>
        </li>
    );
}
