

"use client";

import React, { Suspense, useState, useMemo, useCallback, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar as CalendarIcon, XCircle, UploadCloud, UserCircle, MoreVertical, Loader2, Trash2, Ruler, Search, Edit } from "lucide-react";
import type { DateRange } from "@/components/ui/ad-calendar";
import { useVouchers } from "@/hooks/useVouchers";
import { useDate } from "@/hooks/useDate";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { cn } from "@/lib/utils";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, subDays } from "date-fns";
import { FilePreview } from "@/components/vouchers/FilePreview";
import { Combobox } from "@/components/ui/combobox";
import { useDropzone } from "react-dropzone";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { firestore } from "@/lib/firebase";
import { collection, onSnapshot, query, where, serverTimestamp, writeBatch, doc, orderBy, updateDoc, arrayRemove, getDoc, getDocs, deleteDoc, Timestamp } from "firebase/firestore";
import { toast } from "sonner";
import { compressFile } from "@/lib/compression";
import { uploadFile, deleteFileFromStorage } from "@/lib/storage";
import { checkStorageLimit, incrementCompanyStorage, decrementCompanyStorage } from "@/lib/storageUsageClient";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";


const ATTACHABLE_VOUCHER_TYPES = [
  { id: 'sale', label: 'Sale' },
  { id: 'purchase', label: 'Purchase' },
  { id: 'payment_in', label: 'Payment In' },
  { id: 'payment_out', label: 'Payment Out' },
  { id: 'direct_income', label: 'Direct Income' },
  { id: 'direct_expense', label: 'Direct Expense' },
  { id: 'contra', label: 'Contra' },
  { id: 'journal', label: 'Journal' },
  { id: 'add_salary', label: 'Add Salary' },
  { id: 'note', label: 'Note' },
];

const ALL_VOUCHER_TYPES_WITH_ALL = [
    { id: 'all', label: 'All' },
    ...ATTACHABLE_VOUCHER_TYPES,
];


const CATEGORIES = [
    { id: 'party', label: 'Party' },
    { id: 'staff', label: 'Staff' },
    { id: 'bank_cash', label: 'Bank/Cash' },
    { id: 'tax', label: 'Tax' },
    { id: 'items', label: 'Items' },
    { id: 'expense_income', label: 'Expense/Income'},
];

export type FileData = { id: string; url: string; name: string; type: 'pdf' | 'image' | 'other'; path?: string; };

// --- Sub-Component: Company Files Tab ---
function CompanyFilesTab({ previewSize, onSizeChange, onEditVoucher }: { previewSize: number, onSizeChange: (size: string | number) => void, onEditVoucher: (voucher: any) => void }) {
  const isMobile = useIsMobile();
  const { vouchers, loading, journalAccountNames, processedParties, processedPartiesForSelection, processedStaff, processedAccounts, processedItems, expenseAccounts, processedTaxes } = useVouchers();
  const { dateSystem, formatDate, formatDateBS } = useDate();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date();
    const thirtyDaysAgo = subDays(today, 30);
    return { from: thirtyDaysAgo, to: today };
  });
  
  const [selectedEntityId, setSelectedEntityId] = useState<string | "all">("all");
  const [selectedVoucherTypes, setSelectedVoucherTypes] = useState<string[]>(['all']);
  const [voucherNumberSearch, setVoucherNumberSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | "all">("all");
  const [selectedAccountType, setSelectedAccountType] = useState<string>("all");
  const [showAvatarsOnly, setShowAvatarsOnly] = useState(false);
  const { companyId } = useCompany();
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const router = useRouter();
  // Defer Radix Popover/Combobox until client mount to avoid hydration mismatch (aria-controls IDs differ on server vs client).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Fetch all users (same as Unassigned) so userId resolves by doc id, uid, or userId field.
  useEffect(() => {
    const q = query(collection(firestore, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData: Record<string, string> = {};
      snapshot.forEach((userDoc) => {
        const data = userDoc.data();
        const label = getUserLabelFromDoc(data) || 'Unknown User';
        usersData[userDoc.id] = label;
        const uid = String(data?.uid || data?.userId || "").trim();
        if (uid) usersData[uid] = label;
      });
      setUserNames(usersData);
    });
    return () => unsubscribe();
  }, []);

  // Fallback: for voucher userIds still missing, try uid/userId queries (legacy schemas).
  useEffect(() => {
    const allUserIds = vouchers.flatMap((t) => [t.userId, (t as any).createdBy, (t as any).createdByUserId, (t as any).changedBy].filter(Boolean) as string[]);
    const missingIds = Array.from(new Set(allUserIds))
      .filter((id) => !userNames[id]);
    if (missingIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const resolvedMap: Record<string, string> = {};
      for (const uploaderId of missingIds) {
        try {
          const byId = await getDoc(doc(firestore, "users", uploaderId));
          if (byId.exists()) {
            const label = getUserLabelFromDoc(byId.data());
            if (label) { resolvedMap[uploaderId] = label; continue; }
          }
          const byUid = await getDocs(query(collection(firestore, "users"), where("uid", "==", uploaderId)));
          if (!byUid.empty) {
            const label = getUserLabelFromDoc(byUid.docs[0].data());
            if (label) { resolvedMap[uploaderId] = label; continue; }
          }
          const byUserId = await getDocs(query(collection(firestore, "users"), where("userId", "==", uploaderId)));
          if (!byUserId.empty) {
            const label = getUserLabelFromDoc(byUserId.docs[0].data());
            if (label) resolvedMap[uploaderId] = label;
          }
        } catch { /* ignore */ }
      }
      if (!cancelled && Object.keys(resolvedMap).length > 0) {
        setUserNames((prev) => ({ ...prev, ...resolvedMap }));
      }
    })();
    return () => { cancelled = true; };
  }, [vouchers, userNames]);
  
  // Dedupe by label: same user has docId and uid in userNames; show once like Unassigned.
  const userOptions = useMemo(() => {
    const voucherUserIds = new Set(vouchers.flatMap((v) => [v.userId, (v as any).createdBy, (v as any).createdByUserId, (v as any).changedBy].filter(Boolean) as string[]));
    const byLabel = new Map<string, string>();
    for (const [id, name] of Object.entries(userNames)) {
      if (!name || name === 'Unknown User') continue;
      const existing = byLabel.get(name);
      if (!existing) {
        byLabel.set(name, id);
      } else if (voucherUserIds.has(id) && !voucherUserIds.has(existing)) {
        byLabel.set(name, id);
      }
    }
    return Array.from(byLabel.entries()).map(([label, value]) => ({ value, label }));
  }, [userNames, vouchers]);

  const allEntityOptions = useMemo(() => {
    const options = [
      ...processedPartiesForSelection.map((p) => ({ value: `party-${p.id}`, label: p.name, context: 'Party' })),
      ...processedAccounts.map((a) => ({ value: `account-${a.id}`, label: a.accountName, context: 'Bank/Cash' })),
      ...processedStaff.map((s) => ({ value: `staff-${s.id}`, label: s.name, context: 'Staff' })),
      ...processedItems.map((i) => ({ value: `item-${i.id}`, label: i.name, context: 'Item' })),
      ...processedTaxes.map((t) => ({ value: `tax-${t.id}`, label: t.name, context: 'Tax' })),
    ];
    return options.filter(opt => opt.label).sort((a, b) => a.label.localeCompare(b.label));
  }, [processedPartiesForSelection, processedAccounts, processedStaff, processedItems, processedTaxes]);

  const avatarFiles = useMemo(() => {
    const allAvatars: any[] = [];
    processedParties.forEach(p => p.fileUrl && allAvatars.push({ id: `party-${p.id}`, name: p.name, type: 'Party', url: p.fileUrl, date: (p as any).createdAt, userId: (p as any).ownerId }));
    processedStaff.forEach(s => s.fileUrl && allAvatars.push({ id: `staff-${s.id}`, name: s.name, type: 'Staff', url: s.fileUrl, date: (s as any).createdAt, userId: (s as any).ownerId }));
    processedAccounts.forEach(a => a.fileUrl && allAvatars.push({ id: `account-${a.id}`, name: a.accountName, type: 'Bank/Cash', url: a.fileUrl, date: (a as any).createdAt, userId: (a as any).ownerId }));
    return allAvatars;
  }, [processedParties, processedStaff, processedAccounts]);

  const displayItems = useMemo(() => {
      let itemsToFilter = showAvatarsOnly ? avatarFiles.map(a => ({...a, fileUrls: [a.url], voucherNumber: a.name, type: a.type, isAvatar: true })) : vouchers.filter(v => Array.isArray(v.fileUrls) && v.fileUrls.length > 0);

      // Apply common filters
      if (selectedUserId !== 'all') {
        itemsToFilter = itemsToFilter.filter(item => {
          const uid = item.userId || (item as any).createdBy || (item as any).createdByUserId || (item as any).changedBy;
          return uid === selectedUserId;
        });
      }
      if (voucherNumberSearch) {
        itemsToFilter = itemsToFilter.filter(item => item.voucherNumber?.toLowerCase().includes(voucherNumberSearch.toLowerCase()));
      }
       if (dateRange?.from) {
        const fromDate = startOfDay(dateRange.from);
        const toDate = dateRange.to ? endOfDay(dateRange.to) : endOfDay(fromDate);
        itemsToFilter = itemsToFilter.filter(item => {
            const itemDate = item.date?.toDate ? item.date.toDate() : new Date();
            return itemDate >= fromDate && itemDate <= toDate;
        });
      }
      if (selectedVoucherTypes.length > 0 && !selectedVoucherTypes.includes('all')) {
        itemsToFilter = itemsToFilter.filter(item => {
            const typeToCheck = item.type === 'journal' && item.subType === 'add_salary' ? 'add_salary' : item.type;
            return selectedVoucherTypes.includes(typeToCheck);
        });
      }
       if (selectedEntityId !== 'all') {
        const [type, actualId] = selectedEntityId.split('-');
        itemsToFilter = itemsToFilter.filter(item => {
            if (showAvatarsOnly) {
                return item.id === selectedEntityId.replace(`${type}-`, '');
            } else {
                if (type === 'party') return item.partyId === actualId;
                if (type === 'staff') return item.staffId === actualId || item.entries?.some((e: any) => e.accountId === actualId);
                if (type === 'account') return item.accountId === actualId || item.fromAccountId === actualId || item.toAccountId === actualId || item.entries?.some((e: any) => e.accountId === actualId);
                if (type === 'item') return item.lineItems?.some((li: any) => li.itemId === actualId);
                if (type === 'tax') return item.taxAccountId === actualId || item.lineItems?.some((li:any) => li.taxAccountId === actualId) || item.entries?.some((e: any) => e.accountId === actualId);
            }
            return false;
        });
      }
      if (selectedAccountType !== 'all') {
        itemsToFilter = itemsToFilter.filter(item => {
            if (showAvatarsOnly) {
                const typeMap: Record<string, string> = { 
                    'party': 'Party', 'staff': 'Staff', 'bank_cash': 'Bank/Cash', 
                    'tax': 'Tax', 'items': 'Item', 'expense_income': 'Expense/Income'
                };
                return item.type === typeMap[selectedAccountType];
            } else {
                if (selectedAccountType === 'party') return !!item.partyId;
                if (selectedAccountType === 'staff') return !!item.staffId || item.entries?.some((e: any) => processedStaff.some(s => s.id === e.accountId));
                if (selectedAccountType === 'bank_cash') return !!item.accountId || !!item.fromAccountId || !!item.toAccountId;
                if (selectedAccountType === 'items') return item.lineItems?.length > 0;
                if (selectedAccountType === 'tax') return !!item.taxAccountId;
                return true;
            }
        });
    }

      return itemsToFilter.sort((a,b) => (b.date?.toDate ? b.date.toDate().getTime() : 0) - (a.date?.toDate ? a.date.toDate().getTime() : 0));
    }, [showAvatarsOnly, avatarFiles, vouchers, selectedUserId, voucherNumberSearch, dateRange, selectedVoucherTypes, selectedEntityId, selectedAccountType]);


  const allFilesCount = useMemo(() => {
    return vouchers.reduce((acc, v) => acc + (v.fileUrls?.length || 0), 0);
  }, [vouchers]);

  const filteredFilesCount = useMemo(() => {
    return displayItems.reduce((acc, v) => acc + (v.fileUrls?.length || 0), 0);
  }, [displayItems]);

 const getAccountNameFromVoucher = (voucher: any) => {
    if (voucher.isAvatar) return voucher.name;
    if (voucher.type === 'journal' && voucher.subType === 'add_salary') {
        const staffEntries = (voucher.entries || []).filter((e: any) =>
            processedStaff.some(s => s.id === e.accountId)
        );
        if (staffEntries.length > 0) {
            return staffEntries.map((e: any) => journalAccountNames[e.accountId] || e.accountId).join(', ');
        }
    }
    if (voucher.type === 'journal') {
        const debits = (voucher.entries || []).filter((e: any) => e.debit > 0).map((e: any) => `Dr: ${journalAccountNames[e.accountId] || e.accountId}`);
        const credits = (voucher.entries || []).filter((e: any) => e.credit > 0).map((e: any) => `Cr: ${journalAccountNames[e.accountId] || e.accountId}`);
        if(debits.length > 0 || credits.length > 0) return [...debits, ...credits].join(' | ');
    }
    if (voucher.type === 'contra') {
        const from = journalAccountNames[voucher.fromAccountId] || voucher.fromAccountId;
        const to = journalAccountNames[voucher.toAccountId] || voucher.toAccountId;
        return `${from} ➔ ${to}`;
    }
    const relevantId = voucher.partyId || voucher.staffId || voucher.accountId || voucher.entityId || voucher.incomeAccountId || voucher.expenseAccountId;
    return journalAccountNames[relevantId] || voucher.voucherNumber;
};
  
  const handleClearFilters = () => {
      setSelectedEntityId('all');
      setSelectedVoucherTypes(['all']);
      setVoucherNumberSearch('');
      setDateRange(undefined);
      setSelectedUserId('all');
      setSelectedAccountType('all');
  };

  const hasFiltersApplied = selectedAccountType !== 'all' || selectedEntityId !== 'all' || selectedUserId !== 'all' || (dateRange?.from != null);

  return (
    <div className={cn("space-y-6", isMobile && "w-full")}>
      <Card className={cn(isMobile && "w-full")}>
        <CardHeader className={cn("flex flex-row flex-wrap items-center justify-between gap-4", isMobile && "flex-col items-stretch gap-4 px-0.5")}>
          <div className="flex items-center justify-between gap-4 w-full">
            <div>
              <CardTitle className="text-lg">{showAvatarsOnly ? "Account Avatars" : "Company File Gallery"}</CardTitle>
              <CardDescription className="text-xs">{showAvatarsOnly ? "Profile pictures for parties, staff, etc." : "All transaction documents."}</CardDescription>
            </div>
            <Badge variant="secondary" className="text-[10px] px-2 py-0 shrink-0">Showing {filteredFilesCount} of {allFilesCount} files</Badge>
          </div>
          <div className={cn("flex items-center gap-2 flex-wrap", isMobile && "flex flex-row w-full gap-1.5 flex-nowrap min-w-0")}>
            <div className={cn("flex h-10 items-center gap-0.5 border rounded-md shrink-0", isMobile ? "w-16 px-1" : "px-2")}>
                {!isMobile && <Ruler className="h-4 w-4 text-muted-foreground shrink-0" />}
                <Input type="text" value={previewSize} onChange={(e) => onSizeChange(e.target.value.replace(/[^0-9]/g, ''))} className={cn("h-8 border-0 focus-visible:ring-0", isMobile ? "w-9 p-0 text-center text-sm" : "w-20")} placeholder="Size" />
                <span className="text-sm text-muted-foreground shrink-0">px</span>
            </div>
            <Button variant={showAvatarsOnly ? "secondary" : "outline"} onClick={() => setShowAvatarsOnly(!showAvatarsOnly)} className={isMobile ? "shrink-0" : ""}>{!isMobile && <UserCircle className="mr-2 h-4 w-4" />}Avatars</Button>
            {mounted && (isMobile ? (
              <div className="flex-1 min-w-0 overflow-hidden">
                <BsDatePicker valueAD={dateRange} onChangeAD={setDateRange as any} className="w-full min-w-0 truncate" />
              </div>
            ) : (
              <BsDatePicker valueAD={dateRange} onChangeAD={setDateRange as any} />
            ))}
            {!mounted && <Skeleton className="h-10 w-24 shrink-0" />}
          </div>
        </CardHeader>
        <CardContent className={cn(isMobile && "px-0.5")}>
    <div className={cn(
      isMobile ? "flex flex-row flex-wrap gap-2 items-center" : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end"
    )}>
        {mounted ? (
          <>
        <div className={cn(isMobile && "flex-1 min-w-[100px]")}>
          <Combobox 
            options={[{ id: 'all', label: 'All Accounts' }, ...CATEGORIES].map(c => ({ value: c.id, label: c.label }))} 
            value={selectedAccountType} 
            onChange={setSelectedAccountType} 
            placeholder="Account Type" 
          />
        </div>
        <div className={cn(isMobile && "flex-1 min-w-[100px]")}>
          <Combobox options={allEntityOptions} value={selectedEntityId} onChange={setSelectedEntityId} placeholder="Search Account..." />
        </div>
        <div className={cn(isMobile && "flex-1 min-w-[100px]")}>
          <Combobox options={[{ value: 'all', label: 'All Users' }, ...userOptions]} value={selectedUserId} onChange={setSelectedUserId} placeholder="Filter by user" />
        </div>
        {(!isMobile || hasFiltersApplied) && (
          <Button variant="ghost" onClick={handleClearFilters} size={isMobile ? "icon" : "default"} className={cn("h-10 border border-dashed", isMobile && "shrink-0")} title={isMobile ? "Clear filters" : undefined}>
            <XCircle className={cn("h-4 w-4", !isMobile && "mr-2")} />
            {!isMobile && "Clear All"}
          </Button>
        )}
          </>
        ) : (
          <>
            <Skeleton className="h-10 flex-1 min-w-[100px]" />
            <Skeleton className="h-10 flex-1 min-w-[100px]" />
            <Skeleton className="h-10 flex-1 min-w-[100px]" />
          </>
        )}
           </div>
        </CardContent>
      </Card>

      <div 
        className="grid gap-x-8 gap-y-12" 
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${previewSize}px, 1fr))` }}
      >
        {displayItems.map((item) => (
            (item.fileUrls || []).map((url: string, index: number) => {
              const cleanFileName = getCleanName(url.split('/').pop()?.split('?')[0] || '');
              const voucherDate = item.date?.toDate ? item.date.toDate() : new Date();
              const effectiveUserId = item.userId || (item as any).createdBy || (item as any).createdByUserId || (item as any).changedBy;
              const userName = (effectiveUserId && userNames[effectiveUserId]) || 'Unknown User';
              const accountName = getAccountNameFromVoucher(item);
              
              const displayDate = () => {
                if (!voucherDate) return '-';
                if (dateSystem === 'AD') return formatDate(voucherDate);
                if (dateSystem === 'BS') return formatDateBS(voucherDate);
                return `${formatDate(voucherDate)} (${formatDateBS(voucherDate)})`;
              };

              return (
                <TooltipProvider key={`${item.id}-${index}`} delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                       <div className="relative group w-full flex flex-col gap-2 no-underline">
                         <div
                            className="relative w-full aspect-square border-2 border-transparent group-hover:border-primary group-hover:shadow-lg transition-all rounded-lg overflow-hidden bg-muted/30 cursor-pointer"
                            style={{ width: `${previewSize}px`, height: `${previewSize}px` }}
                            onClick={() => {
                                const newMetadata = { contentType: url.includes('.pdf') ? 'application/pdf' : 'image/jpeg', contentDisposition: 'inline' };
                                fetch(url).then(res => res.blob()).then(blob => {
                                    const file = new File([blob], cleanFileName, { type: newMetadata.contentType });
                                    const fileURL = URL.createObjectURL(file);
                                    window.open(fileURL, '_blank');
                                });
                            }}
                         >
                            <FilePreview file={url} size={Number(previewSize)} />
                            {!item.isAvatar && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className={cn(
                                      "absolute top-1 right-1 h-7 w-7 bg-background/80 backdrop-blur-sm",
                                      isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                    )}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-64 p-0" onClick={(e) => e.stopPropagation()}>
                                  <div className="p-3 space-y-2 border-b">
                                    <p className="text-xs"><span className="font-semibold">Voucher No:</span> {item.voucherNumber}</p>
                                    <p className="text-xs max-w-xs truncate"><span className="font-semibold">Account:</span> {accountName}</p>
                                    <p className="text-xs"><span className="font-semibold">Date:</span> {displayDate()}</p>
                                    <p className="text-xs"><span className="font-semibold">Time:</span> {format(voucherDate, "h:mm a")}</p>
                                    <p className="text-xs"><span className="font-semibold">By:</span> {userName}</p>
                                  </div>
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEditVoucher(item); }}>
                                    <Edit className="h-3 w-3 mr-2" /> Edit Voucher
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                         </div>
                         <p className="text-[10px] text-center truncate px-2 text-muted-foreground">
                            {cleanFileName}
                         </p>
                      </div>
                    </TooltipTrigger>
                    {!isMobile && (
                      <TooltipContent className="text-xs p-2">
                        <div className="space-y-1">
                          <p><span className="font-semibold">Voucher No:</span> {item.voucherNumber}</p>
                          <p className="max-w-xs"><span className="font-semibold">Account:</span> {accountName}</p>
                          <p><span className="font-semibold">Date:</span> {displayDate()}</p>
                          <p><span className="font-semibold">Time:</span> {format(voucherDate, "h:mm a")}</p>
                          <p><span className="font-semibold">By:</span> {userName}</p>
                        </div>
                        {!item.isAvatar && (
                          <Button variant="link" size="sm" className="p-0 h-auto text-xs mt-2" onClick={() => onEditVoucher(item)}>
                            <Edit className="h-3 w-3 mr-1" /> Edit Voucher
                          </Button>
                        )}
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              )
            })
        ))}
      </div>
    </div>
  );
}

// --- Type for Unassigned File ---
type UnassignedFile = {
    id: string;
    name: string;
    url: string;
    path: string;
    type: 'image' | 'pdf' | 'other';
    size: number;
    uploadedAt: Timestamp;
    uploadedBy: string;
    status: 'FREE' | 'LOCKED';
}

type UploadingFile = {
  id: string; // Use a temporary unique ID
  name: string;
  size: number;
};

// Convert an email to the text after '@' for compact fallback labels.
function getEmailSuffixLabel(value?: string): string | null {
  if (!value || !value.includes("@")) return null;
  const parts = value.split("@");
  const suffix = parts[1]?.trim();
  return suffix ? suffix : null;
}

// Build a user label with preference: displayName -> email suffix -> email.
function getUserLabelFromDoc(data: any): string | null {
  const displayName = String(data?.displayName || data?.name || "").trim();
  if (displayName) return displayName;
  const email = String(data?.email || "").trim();
  return getEmailSuffixLabel(email) || (email || null);
}

// --- Sub-Component: Unassigned Documents Tab ---
function UnassignedDocumentsTab({ handleAttachToVoucher, previewSize, onSizeChange }: { handleAttachToVoucher: any; previewSize: number; onSizeChange: any; }) {
  const { user } = useAuth();
  const { company, companyId } = useCompany();
  const { dateSystem, formatDate, formatDateBS } = useDate();
  // Render popover-driven controls only after mount to avoid Radix SSR/client id mismatch during hydration.
  const [isHydrated, setIsHydrated] = useState(false);
  const [unassignedFiles, setUnassignedFiles] = useState<UnassignedFile[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [fileToDelete, setFileToDelete] = useState<UnassignedFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [selectedUploaderId, setSelectedUploaderId] = useState<string | "all">("all");

  useEffect(() => {
    // Mark mounted on client so popover ids are generated only client-side for these controls.
    setIsHydrated(true);
  }, []);
  
  // Fetch unassigned files
  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(firestore, `companies/${companyId}/unassigned_documents`), orderBy('uploadedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const filesData = snapshot.docs.map(d => ({id: d.id, ...d.data()}) as UnassignedFile);
        setUnassignedFiles(filesData);
    });
    return () => unsubscribe();
  }, [companyId]);

  // Fetch users separately to avoid re-fetching files when a user is added
  useEffect(() => {
    const q = query(collection(firestore, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const usersData: Record<string, string> = {};
        snapshot.forEach((userDoc) => {
            // Store mapping by both doc id and uid/userId fields so uploadedBy can resolve in all id formats.
            const data = userDoc.data();
            const label = getUserLabelFromDoc(data) || "Unknown User";
            usersData[userDoc.id] = label;
            const uid = String(data?.uid || data?.userId || "").trim();
            if (uid) usersData[uid] = label;
        });
        setUserNames(usersData);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Fallback resolver: for any still-missing uploader id, fetch displayName directly from users collection.
    const missingUploaderIds = Array.from(new Set(unassignedFiles.map((f) => f.uploadedBy).filter(Boolean)))
      .filter((id) => !userNames[id]);
    if (missingUploaderIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const resolvedMap: Record<string, string> = {};
      for (const uploaderId of missingUploaderIds) {
        try {
          // Try direct doc id first (users/{uploadedBy}).
          const byId = await getDoc(doc(firestore, "users", uploaderId));
          if (byId.exists()) {
            const label = getUserLabelFromDoc(byId.data());
            if (label) {
              resolvedMap[uploaderId] = label;
              continue;
            }
          }
          // Then try users.uid == uploadedBy.
          const byUid = await getDocs(query(collection(firestore, "users"), where("uid", "==", uploaderId)));
          if (!byUid.empty) {
            const label = getUserLabelFromDoc(byUid.docs[0].data());
            if (label) {
              resolvedMap[uploaderId] = label;
              continue;
            }
          }
          // Last fallback: users.userId == uploadedBy (legacy schemas).
          const byUserId = await getDocs(query(collection(firestore, "users"), where("userId", "==", uploaderId)));
          if (!byUserId.empty) {
            const label = getUserLabelFromDoc(byUserId.docs[0].data());
            if (label) resolvedMap[uploaderId] = label;
          }
        } catch {
          // Intentionally ignore per-id failures; UI fallback handles unresolved labels.
        }
      }
      if (!cancelled && Object.keys(resolvedMap).length > 0) {
        setUserNames((prev) => ({ ...prev, ...resolvedMap }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [unassignedFiles, userNames]);
  
  const uploaderOptions = useMemo(() => {
    const uniqueNamesMap = new Map();
    unassignedFiles.forEach(file => {
      // Fallback priority: resolved name -> email suffix (text after '@') -> unknown.
      const resolved = userNames[file.uploadedBy];
      const uploaderName = resolved && resolved !== "Unknown"
        ? (getEmailSuffixLabel(resolved) || resolved)
        : (getEmailSuffixLabel(file.uploadedBy) || "Unknown User");
      if (uploaderName && !Array.from(uniqueNamesMap.values()).some((obj: any) => obj.label === uploaderName)) {
        uniqueNamesMap.set(file.uploadedBy, { value: file.uploadedBy, label: uploaderName });
      }
    });
    return Array.from(uniqueNamesMap.values());
  }, [unassignedFiles, userNames]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!companyId || !user) return;

    const newUploadingFiles: UploadingFile[] = acceptedFiles.map(file => ({
      id: `${file.name}-${file.size}-${Math.random()}`,
      name: file.name,
      size: file.size,
    }));
    setUploadingFiles(prev => [...prev, ...newUploadingFiles]);

    let compressedFiles: File[] = [];
    try {
      compressedFiles = await Promise.all(acceptedFiles.map(f => compressFile(f)));
      const totalNewBytes = compressedFiles.reduce((sum, c) => sum + c.size, 0);
      const limitCheck = await checkStorageLimit(companyId, company?.planId, {
        attachmentsBytes: totalNewBytes,
        storageBytes: totalNewBytes,
      });
      if (!limitCheck.allowed) {
        toast.error("Storage limit reached", { description: limitCheck.message });
        setUploadingFiles(prev => prev.filter(p => !newUploadingFiles.some(n => n.id === p.id)));
        return;
      }
    } catch (e) {
      setUploadingFiles(prev => prev.filter(p => !newUploadingFiles.some(n => n.id === p.id)));
      return;
    }

    const batch = writeBatch(firestore);
    let batchOperationsCount = 0;

    await Promise.all(newUploadingFiles.map(async (uploadingFile) => {
      const idx = acceptedFiles.findIndex(f => f.name === uploadingFile.name && f.size === uploadingFile.size);
      const compressedFile = idx >= 0 ? compressedFiles[idx] : null;
      if (!compressedFile) return;
      try {
        const uploadResult = await uploadFile(
          { name: compressedFile.name, type: compressedFile.type, arrayBuffer: await compressedFile.arrayBuffer() },
          companyId!,
          company?.name,
          "unassigned",
          undefined,
          undefined,
          undefined,
          new Date()
        );
        if (uploadResult.success) {
          await incrementCompanyStorage(companyId, {
            attachmentsBytes: compressedFile.size,
            storageBytes: compressedFile.size,
          });
          const docRef = doc(collection(firestore, `companies/${companyId}/unassigned_documents`));
          batch.set(docRef, {
            url: uploadResult.url, path: uploadResult.path, name: compressedFile.name,
            type: compressedFile.type.startsWith("image/") ? 'image' : 'pdf',
            size: compressedFile.size, uploadedAt: serverTimestamp(), uploadedBy: user.uid, status: 'FREE'
          });
          batchOperationsCount++;
        }
      } catch (error) {
        const message = error instanceof Error && error.message?.includes("fetch")
          ? "Check your internet connection and try again."
          : "Something went wrong. Please try again.";
        toast.error(`Upload failed: ${uploadingFile.name}`, { description: message });
        console.error("Upload failed for file:", uploadingFile.name, error);
      } finally {
        setUploadingFiles(prev => prev.filter(f => f.id !== uploadingFile.id));
      }
    }));

    if (batchOperationsCount > 0) {
      await batch.commit();
      const failedCount = newUploadingFiles.length - batchOperationsCount;
      if (failedCount > 0) {
        toast.success(`${batchOperationsCount} file(s) uploaded.`, { description: `${failedCount} file(s) failed.` });
      } else {
        toast.success("Upload complete", { description: `${batchOperationsCount} file(s) uploaded.` });
      }
    }
  }, [companyId, user, company?.name, company?.planId]);
  
  const { getRootProps, getInputProps } = useDropzone({ onDrop });
  
  const handleDeleteFile = async () => {
    if (!fileToDelete || !companyId) return;
    setIsDeleting(true);
    try {
        await deleteFileFromStorage(fileToDelete.path);
        await decrementCompanyStorage(companyId, {
          attachmentsBytes: fileToDelete.size,
          storageBytes: fileToDelete.size,
        });
        await deleteDoc(doc(firestore, `companies/${companyId}/unassigned_documents`, fileToDelete.id));
        toast.success("File deleted successfully");
    } catch (error) {
        console.error("Error deleting file:", error);
        toast.error("Failed to delete file");
    } finally {
        setIsDeleting(false);
        setFileToDelete(null);
    }
  };

  const filteredFiles = useMemo(() => {
    let filtered = [...unassignedFiles];
    
    if (selectedUploaderId !== 'all') {
      filtered = filtered.filter(f => f.uploadedBy === selectedUploaderId);
    }
    if (dateRange?.from) {
        const fromDate = startOfDay(dateRange.from);
        const toDate = dateRange.to ? endOfDay(dateRange.to) : endOfDay(fromDate);
        filtered = filtered.filter(f => {
            if (!f.uploadedAt) return false;
            const uploadedAt = f.uploadedAt.toDate();
            return uploadedAt >= fromDate && uploadedAt <= toDate;
        });
    }
    return filtered;
  }, [unassignedFiles, selectedUploaderId, dateRange]);

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!bytes || bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  return (
    <div className="space-y-6">
        <Card>
        <CardHeader className="space-y-6">
  <div className="flex items-center justify-between">
    <div>
      <CardTitle className="text-lg font-bold">Unassigned Documents</CardTitle>
      <CardDescription className="text-xs">Drag or click to upload. Attach them to vouchers later.</CardDescription>
    </div>
    <Badge variant="secondary" className="text-[10px] px-2 py-0 shrink-0">Showing {filteredFiles.length} of {unassignedFiles.length} files</Badge>
  </div>

  <div className="flex flex-wrap items-center gap-4 w-full bg-muted/30 p-4 rounded-xl border">
    <div className="flex-shrink-0">
      {isHydrated ? (
        <BsDatePicker valueAD={dateRange} onChangeAD={setDateRange as any} />
      ) : (
        // Keep SSR/client first paint identical while hydration completes.
        <Button type="button" variant="outline" className="h-10 w-[190px] justify-start text-muted-foreground" disabled>
          <CalendarIcon className="mr-2 h-4 w-4" />
          Pick a date range
        </Button>
      )}
    </div>

    <div className="flex-1 min-w-[200px] max-w-[300px]">
      {isHydrated ? (
        <Combobox options={uploaderOptions} value={selectedUploaderId} onChange={setSelectedUploaderId} placeholder="Filter by user"/>
      ) : (
        // Keep SSR/client first paint identical while hydration completes.
        <Button type="button" variant="outline" className="h-10 w-full justify-start text-muted-foreground" disabled>
          Filter by user
        </Button>
      )}
    </div>

    <Button variant="ghost" onClick={() => { setDateRange(undefined); setSelectedUploaderId('all')}} className="hover:text-destructive">
      <XCircle className="mr-2 h-4 w-4"/>Clear
    </Button>

    <div className="flex items-center gap-3 bg-background border-2 border-primary/20 rounded-lg px-3 h-11 ml-auto shadow-sm">
      <Ruler className="h-4 w-4 text-primary" />
      <div className="flex items-center">
        <Input 
          type="text" 
          value={previewSize} 
          onChange={(e) => onSizeChange(e.target.value.replace(/[^0-9]/g, ''))} 
          className="w-16 h-8 border-0 focus-visible:ring-0 text-center font-bold p-0" 
        />
        <span className="text-xs font-bold text-muted-foreground ml-1">px</span>
      </div>
    </div>
  </div>
</CardHeader>
            <CardContent>
                <div {...getRootProps()} className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:bg-slate-50 transition-colors">
                    <input {...getInputProps()} /><UploadCloud className="mx-auto h-10 w-10 text-slate-400" />
                    <p className="mt-2 text-sm text-slate-500">Drag or click to upload</p>
                </div>
            </CardContent>
        </Card>
        
        <div className="grid gap-x-8 gap-y-12" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${previewSize}px, 1fr))` }}>
            {uploadingFiles.map((file) => (
              <div key={file.id} className="relative w-full flex flex-col gap-2">
                  <div className="relative w-full aspect-square rounded-lg bg-muted/30 flex items-center justify-center" style={{ width: `${previewSize}px`, height: `${previewSize}px` }}>
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-8 w-8 animate-spin" />
                        <span className="text-xs">Uploading...</span>
                      </div>
                  </div>
                  <p className="text-[10px] text-center truncate px-2 text-muted-foreground">{file.name}</p>
              </div>
            ))}
            {filteredFiles.map((file) => {
              const uploadDate = file.uploadedAt?.toDate ? file.uploadedAt.toDate() : new Date();
              // Keep tooltip/uploader text consistent with dropdown fallback behavior.
              const resolved = userNames[file.uploadedBy];
              const uploaderName = resolved && resolved !== "Unknown"
                ? (getEmailSuffixLabel(resolved) || resolved)
                : (getEmailSuffixLabel(file.uploadedBy) || "Unknown User");
              const cleanFileName = getCleanName(file.name);
              
              const displayDate = () => {
                if (dateSystem === 'AD') return formatDate(uploadDate);
                if (dateSystem === 'BS') return formatDateBS(uploadDate);
                return `${formatDate(uploadDate)} (${formatDateBS(uploadDate)})`;
              };

              return (
                <TooltipProvider key={file.id} delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                       <div className="relative group w-full flex flex-col gap-2">
                            <div className="relative w-full aspect-square border-2 border-transparent group-hover:border-primary group-hover:shadow-lg transition-all rounded-lg overflow-hidden bg-muted/30" style={{ width: `${previewSize}px`, height: `${previewSize}px` }}>
                                <FilePreview file={file.url} size={Number(previewSize)} fileSize={file.size} storagePath={file.path} />
                                <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button variant="destructive" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setFileToDelete(file); }}>
                                        <Trash2 className="h-4 w-4"/>
                                    </Button>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="icon" className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100">
                                        <MoreVertical className="h-4 w-4"/>
                                    </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                    {ATTACHABLE_VOUCHER_TYPES.map((type) => (
                                        <DropdownMenuItem key={type.id} onClick={() => handleAttachToVoucher(type.id, file)}>Attach to {type.label}</DropdownMenuItem>
                                    ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                            <p className="text-[10px] text-center truncate px-2 text-muted-foreground">{cleanFileName}</p>
                        </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs space-y-1 p-2">
                        <p><span className="font-semibold">File:</span> {cleanFileName}</p>
                        {file.size && <p><span className="font-semibold">Size:</span> {formatBytes(file.size)}</p>}
                        <p><span className="font-semibold">Date:</span> {displayDate()}</p>
                        <p><span className="font-semibold">Time:</span> {format(uploadDate, "h:mm a")}</p>
                        <p><span className="font-semibold">By:</span> {uploaderName}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
            )})}
        </div>

        <AlertDialog open={!!fileToDelete} onOpenChange={(open) => !open && setFileToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will permanently delete the file <span className="font-bold">{fileToDelete?.name}</span>. This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteFile} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4"/>}
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
  );
}

function getCleanName(name: string) {
  if (name.includes('_')) {
    return name.split('_').slice(1).join('_');
  }
  return name;
}

const GALLERY_TABS = ['company-files', 'unassigned'] as const;
type GalleryTab = (typeof GALLERY_TABS)[number];

function getTabFromSearchParams(searchParams: URLSearchParams): GalleryTab {
  const tab = searchParams.get('tab');
  return tab === 'unassigned' ? 'unassigned' : 'company-files';
}

function GalleryPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<GalleryTab>(() => getTabFromSearchParams(searchParams));
  const [previewSize, setPreviewSize] = useState<string | number>(160);
  const [isVoucherOpen, setIsVoucherOpen] = useState(false);
  const [defaultVoucherData, setDefaultVoucherData] = useState<any>(null);

  const [voucherToEdit, setVoucherToEdit] = useState<any | null>(null);
  const [isEditVoucherOpen, setIsEditVoucherOpen] = useState(false);

  // Keep URL in sync with tab so refresh keeps same tab
  const setGalleryTab = useCallback(
    (tab: GalleryTab) => {
      setActiveTab(tab);
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('tab', tab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    const savedSize = localStorage.getItem('galleryPreviewSize');
    if (savedSize && !isNaN(Number(savedSize))) {
      setPreviewSize(Number(savedSize));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('galleryPreviewSize', String(previewSize));
  }, [previewSize]);

  // Sync tab from URL (e.g. browser back/forward or direct link)
  useEffect(() => {
    setActiveTab(getTabFromSearchParams(searchParams));
  }, [searchParams]);
  
  const handleAttachToVoucher = (type: string, file: any) => {
    setDefaultVoucherData({
      defaultTab: type,
      date: new Date(),
      unassignedFile: {
          id: file.id,
          url: file.url,
          path: file.path,
          name: file.name
      },
      fileUrls: [file.url],
    });
    setIsVoucherOpen(true);
  };
  
  const handleDialogClose = (open: boolean) => {
    setIsVoucherOpen(open);
    if (!open) {
      setDefaultVoucherData(null);
    }
  }

  const handleEditVoucherClick = useCallback((voucher: any) => {
    setVoucherToEdit(voucher);
    setIsEditVoucherOpen(true);
  }, []);

  const handleEditDialogClose = (open: boolean) => {
    setIsEditVoucherOpen(open);
    if (!open) {
      setVoucherToEdit(null);
      // Pop the state we pushed when opening (so back-stack stays clean)
      if (typeof window !== "undefined" && window.history.state?.galleryEditModal) {
        window.history.back();
      }
    }
  };

  // When Edit Voucher dialog is open and user presses mobile back button: close dialog only, don't navigate
  useEffect(() => {
    if (!isEditVoucherOpen) return;
    const handlePopState = () => {
      setIsEditVoucherOpen(false);
      setVoucherToEdit(null);
    };
    window.history.pushState({ galleryEditModal: true }, "", window.location.href);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isEditVoucherOpen]);

  return (
    <div className="px-0.5 py-4 sm:p-6 md:p-8 h-full flex flex-col">
       <div className="grid grid-cols-2 gap-4 mb-6">
          <Button
            onClick={() => setGalleryTab('company-files')}
            className={cn(
              "h-12 text-sm",
              activeTab === 'company-files'
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-blue-100 text-blue-800 hover:bg-blue-200"
            )}
          >
            Company Files
          </Button>
          <Button
            onClick={() => setGalleryTab('unassigned')}
            className={cn(
              "h-12 text-sm",
              activeTab === 'unassigned'
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-blue-100 text-blue-800 hover:bg-blue-200"
            )}
          >
            Unassigned Documents
          </Button>
        </div>

        {activeTab === 'company-files' && (
           <CompanyFilesTab previewSize={Number(previewSize)} onSizeChange={setPreviewSize} onEditVoucher={handleEditVoucherClick} />
        )}
        {activeTab === 'unassigned' && (
           <UnassignedDocumentsTab handleAttachToVoucher={handleAttachToVoucher} previewSize={Number(previewSize)} onSizeChange={setPreviewSize} />
        )}

        {/* Dialog for creating new voucher from unassigned */}
        <AddVoucherDialog 
          isOpen={isVoucherOpen}
          onOpenChange={handleDialogClose}
          voucher={undefined} // Force "new" mode
          defaultVoucherData={defaultVoucherData}
          onVoucherAction={() => {}} 
        />
        {/* Dialog for editing existing voucher */}
        <AddVoucherDialog 
          isOpen={isEditVoucherOpen}
          onOpenChange={handleEditDialogClose}
          voucher={voucherToEdit}
          onVoucherAction={() => {}} 
        />
    </div>
  );
}

function GalleryPageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
        <p className="mt-4 text-muted-foreground">Loading gallery...</p>
      </div>
    </div>
  );
}

export default function GalleryPage() {
  return (
    // Wrap useSearchParams consumer in Suspense to satisfy static prerender in production build.
    <Suspense fallback={<GalleryPageLoading />}>
      <GalleryPageContent />
    </Suspense>
  );
}


