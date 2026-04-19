
"use client";

import * as React from "react";
import { toast } from "sonner";
import { openPrintDirect } from "@/lib/printDirect";
import type { Party, Group } from "@/components/party/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Edit,
  Printer,
  Users,
  Calendar as CalendarIcon,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  FilePlus,
  XCircle,
  MoreVertical,
  ArrowLeft,
  Scroll,
  DollarSign,
  ChevronDown,
  Columns3,
  Filter,
  Search,
} from "lucide-react";
import { TransactionsTable, type VisibleColumns, type TransactionColumnKey } from "../vouchers/TransactionsTable";
import { TransactionTableSortDropdown, type TransactionSortBy, type TransactionSortOrder } from "@/components/vouchers/TransactionTableSortDropdown";
import { useShowNotes } from "../vouchers/transactionColumnVisibility";
import {
  sortTransactionsWithFiscalMergeForCompany,
  recomputeRunningBalanceTopToBottom,
  DEFAULT_TRANSACTION_SORT_ORDER,
} from "@/lib/transactionSort";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { cn } from "@/lib/utils";
import { startOfDay, endOfDay, format } from "date-fns";
import AdCalendar from "../ui/ad-calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import type { DateRange } from "@/components/ui/ad-calendar";
import { useDate } from "@/hooks/useDate";
import { useBalanceMode } from "@/hooks/useBalanceMode";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useRowsPerPage } from "@/hooks/useRowsPerPage";
import { EditGroupDialog } from "./EditGroupDialog";
import { PartyFilterDropdown } from "./PartyFilterDropdown";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { CreateNoteForm } from "../vouchers/CreateNoteForm";
import { Checkbox } from "../ui/checkbox";
import { AddVoucherDialog } from "../vouchers/AddVoucherDialog";
import { HistoryDialog } from "../vouchers/HistoryDialog";
import { LinkAdvancesToVoucherDialog } from "../vouchers/LinkAdvancesToVoucherDialog";
import { LinkPaymentToTxnsDialog } from "../vouchers/LinkPaymentToTxnsDialog";
import { useTransactions } from "@/hooks/use-transactions";
import { useVouchers } from "@/hooks/useVouchers";
import { Input } from "../ui/input";
import { useIsMobile, useCalendarMonths } from "@/hooks/use-mobile";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useUrlModalBack } from "@/contexts/DialogBackHandlerContext";
import { Combobox } from "../ui/combobox";
import NepaliCalendar from "../ui/nepali-calendar";
import type { BSDate } from "@/lib/bs-date";
import { Badge } from "../ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { doc, getDoc, updateDoc, query, collection, getDocs, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { StaffGroupDetails } from "../staff/StaffGroupDetails";
import type { StaffGroup, Staff } from "../staff/types";
import { AccountGroupDetails } from "../bank-cash/AccountGroupDetails";
import type { AccountGroup, Account } from "../bank-cash/types";
import { TaxGroupDetails } from "../tax/TaxGroupDetails";
import type { TaxGroup, Tax } from "../tax/types";
import { ExpenseGroupDetails } from "../expenses/ExpenseGroupDetails";
import type { ExpenseGroup, ExpenseAccount } from "../expenses/types";
import { ItemGroupDetails } from "../items/ItemGroupDetails";
import type { ItemGroup, Item } from "../items/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { getLocalAuthUser } from "@/lib/localApiClient";
import { isLocalOnlyMode } from "@/lib/localMode";

const getInitials = (name: string) => {
  if (!name) return "NA";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
};

const COLUMN_VISIBILITY_KEY = "transactionVisibleColumns";
const DEFAULT_VISIBLE_COLUMNS: VisibleColumns = {
  date: true,
  type: true,
  voucherNo: true,
  user: true,
  file: true,
  dr: true,
  cr: true,
  status: true,
  runningBalance: true,
};
const COLUMN_LABELS: Record<TransactionColumnKey, string> = {
  date: "Date",
  type: "Type",
  voucherNo: "Voucher No.",
  user: "User",
  file: "File",
  dr: "Dr",
  cr: "Cr",
  status: "Status",
  runningBalance: "Running Balance",
};

const DEFAULT_STATUS_FILTER = { paid: true, unpaid: true, partial: true, overdue: true };
type StatusFilter = { paid: boolean; unpaid: boolean; partial: boolean; overdue: boolean };
const STATUS_FILTER_KEY = "transactionStatusFilter";

function filterByStatus(txns: any[], statusFilter: StatusFilter): any[] {
  const anySelected = statusFilter.paid || statusFilter.unpaid || statusFilter.partial || statusFilter.overdue;
  if (!anySelected) return txns;
  return txns.filter((t) => {
    if (t.type === "note") return true; // Notes have no payment status; always show
    // Journal/Contra are non-bill-wise rows; keep visible in group ledger regardless of payment-status filter.
    if (t.type === "journal" || t.type === "contra") return true;
    if (statusFilter.paid && t.paymentStatus === "paid") return true;
    if (statusFilter.unpaid && t.paymentStatus === "unpaid") return true;
    if (statusFilter.partial && t.paymentStatus === "partially_paid") return true;
    if (statusFilter.overdue && t.isOverdue) return true;
    return false;
  });
}

export function GroupDetails({
  group,
  allGroups,
  allParties,
  onGroupUpdated,
  onGroupDeleted,
  onPartyUpdated,
  dateRange,
  onDateRangeChange,
  userNames,
  onBack,
}: {
  group: Group;
  allGroups: Group[];
  allParties: Party[];
  onGroupUpdated: () => void;
  onGroupDeleted: () => void;
  onPartyUpdated: () => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (dateRange: DateRange | undefined) => void;
  userNames: Record<string, string>;
  onBack?: () => void;
}) {
  const { dateSystem, formatDateBS, formatDate, formatCurrency } = useDate();
  const { balanceMode, setBalanceMode } = useBalanceMode();
  const { company, companyId } = useCompany();
  const { vouchers, processedParties, processedAccounts, processedExpenseAccounts, processedAccountGroups, processedExpenseGroups, processedTaxGroups, processedStaffGroups, processedTaxes, processedStaff, processedItems, processedItemGroups, journalAccountNames } = useVouchers();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const calendarMonths = useCalendarMonths();
  const [rowsPerPage, setRowsPerPage] = useRowsPerPage(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteEntityId, setNoteEntityId] = useState<string | null>(null);
  const [showNarration, setShowNarration] = useState(true);
  const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>(() => {
    if (typeof window === "undefined") return DEFAULT_VISIBLE_COLUMNS;
    try {
      const saved = sessionStorage.getItem(COLUMN_VISIBILITY_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as VisibleColumns;
        return { ...DEFAULT_VISIBLE_COLUMNS, ...parsed };
      }
    } catch (_) {}
    return DEFAULT_VISIBLE_COLUMNS;
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    if (typeof window === "undefined") return { ...DEFAULT_STATUS_FILTER };
    try {
      const saved = sessionStorage.getItem(STATUS_FILTER_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<StatusFilter>;
        return {
          paid: parsed.paid ?? DEFAULT_STATUS_FILTER.paid,
          unpaid: parsed.unpaid ?? DEFAULT_STATUS_FILTER.unpaid,
          partial: parsed.partial ?? DEFAULT_STATUS_FILTER.partial,
          overdue: parsed.overdue ?? DEFAULT_STATUS_FILTER.overdue,
        };
      }
    } catch (_) {}
    return { ...DEFAULT_STATUS_FILTER };
  });
  const statusFilterAllChecked = statusFilter.paid && statusFilter.unpaid && statusFilter.partial && statusFilter.overdue;
  const handleStatusFilterAll = () => {
    const next = statusFilterAllChecked ? { paid: false, unpaid: false, partial: false, overdue: false } : { ...DEFAULT_STATUS_FILTER };
    setStatusFilter(next);
    sessionStorage.setItem(STATUS_FILTER_KEY, JSON.stringify(next));
    setCurrentPage(1);
  };
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [historyVoucher, setHistoryVoucher] = useState<any>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDesktopCalendarOpen, setIsDesktopCalendarOpen] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(dateRange);
  const [mobileSearchTerm, setMobileSearchTerm] = useState("");
  const [isDateSearchMode, setIsDateSearchMode] = useState(false);
  const [mobileFooterDialogOpen, setMobileFooterDialogOpen] = useState<null | "sale" | "purchase">(null);
  const openingModalRef = useRef(false);

  useEffect(() => {
    setTempDateRange(dateRange);
  }, [dateRange]);

  // Determine group type
  const groupType = useMemo(() => {
    if ((group as any).groupType) return (group as any).groupType;
    // Check if it's a tax group
    if (processedTaxGroups.some(tg => tg.id === group.id)) return 'tax';
    // Check if it's a staff group
    if (processedStaffGroups.some(sg => sg.id === group.id)) return 'staff';
    // Check if it's an account group
    if (processedAccountGroups.some(ag => ag.id === group.id)) return 'account';
    // Check if it's an expense group
    if (processedExpenseGroups.some(eg => eg.id === group.id)) return 'expense';
    // Default to party group
    return 'party';
  }, [group, processedTaxGroups, processedStaffGroups, processedAccountGroups, processedExpenseGroups]);

  const partiesInGroup = useMemo(() => {
    if (group.id === "ungrouped")
      // Ungrouped should include both empty groupId and persisted ungrouped id rows.
      return allParties.filter((p) => !p.groupId || p.groupId === "ungrouped_party");
    // Only filter parties if this is a party group
    if (groupType === 'party') {
      return allParties.filter((p) => p.groupId === group.id);
    }
    return [];
  }, [allParties, group, groupType]);

  // Get child groups (groups that have this group as parent)
  const childGroups = useMemo(() => {
    return allGroups.filter((g) => (g as any).parentId === group.id);
  }, [allGroups, group]);

  // Get all accounts (bank accounts, expense accounts) that belong to this group or its child groups
  const accountsInGroup = useMemo(() => {
    const groupIds = new Set([group.id, ...childGroups.map(g => g.id)]);
    
    // Handle different group types
    if (groupType === 'tax') {
      // For tax groups, get taxes that belong to this group
      return processedTaxes.filter((tax) => tax.groupId === group.id);
    }
    
    if (groupType === 'staff') {
      // For staff groups, get staff that belong to this group
      return processedStaff.filter((staff) => staff.groupId === group.id);
    }
    
    if (groupType === 'account') {
      // For account groups, get accounts that belong to this group
      return processedAccounts.filter((acc) => acc.groupId === group.id);
    }
    
    if (groupType === 'expense') {
      // For expense groups, get expense accounts that belong to this group
      return processedExpenseAccounts.filter((acc) => acc.groupId === group.id);
    }
    
    if (groupType === 'item') {
      // For item groups, get items that belong to this group
      return processedItems.filter((item) => item.groupId === group.id);
    }
    
    // For party groups, use the existing logic
    // Get account groups (bank/cash groups) that belong to this party group or its child groups
    const accountGroupIds = processedAccountGroups
      .filter(ag => {
        const parentId = (ag as any).parentId;
        return parentId && groupIds.has(parentId);
      })
      .map(ag => ag.id);
    
    // Get expense groups (income/expense groups) that belong to this party group or its child groups
    const expenseGroupIds = processedExpenseGroups
      .filter(eg => {
        const parentId = (eg as any).parentId;
        return parentId && groupIds.has(parentId);
      })
      .map(eg => eg.id);
    
    // Get tax groups that belong to this party group or its child groups
    const taxGroupIds = processedTaxGroups
      .filter(tg => {
        const parentId = (tg as any).parentId;
        return parentId && groupIds.has(parentId);
      })
      .map(tg => tg.id);
    
    // Get staff groups that belong to this party group or its child groups
    const staffGroupIds = processedStaffGroups
      .filter(sg => {
        const parentId = (sg as any).parentId;
        return parentId && groupIds.has(parentId);
      })
      .map(sg => sg.id);
    
    // Get bank accounts that belong to those account groups
    const bankAccounts = processedAccounts.filter((acc) => 
      acc.groupId && accountGroupIds.includes(acc.groupId)
    );
    
    // Get expense accounts that belong to those expense groups
    const expenseAccounts = processedExpenseAccounts.filter((acc) => 
      acc.groupId && expenseGroupIds.includes(acc.groupId)
    );
    
    // Get taxes that belong to those tax groups
    const taxesInGroup = processedTaxes.filter((tax) => 
      tax.groupId && taxGroupIds.includes(tax.groupId)
    );
    
    // Get staff that belong to those staff groups
    const staffInGroup = processedStaff.filter((staff) => 
      staff.groupId && staffGroupIds.includes(staff.groupId)
    );
    
    return [...bankAccounts, ...expenseAccounts, ...taxesInGroup, ...staffInGroup];
  }, [group, groupType, childGroups, processedAccounts, processedExpenseAccounts, processedAccountGroups, processedExpenseGroups, processedTaxGroups, processedStaffGroups, processedTaxes, processedStaff, processedItems]);

  // Get expense group IDs that belong to this group (for transaction filtering)
  const expenseGroupIdsInGroup = useMemo(() => {
    const groupIds = new Set([group.id, ...childGroups.map(g => g.id)]);
    return processedExpenseGroups
      .filter(eg => {
        const parentId = (eg as any).parentId;
        return parentId && groupIds.has(parentId);
      })
      .map(eg => eg.id);
  }, [group, childGroups, processedExpenseGroups]);

  // Combine parties and accounts for the group
  const allItemsInGroup = useMemo(() => {
    return [...partiesInGroup, ...accountsInGroup];
  }, [partiesInGroup, accountsInGroup]);

  const isFilterActive =
    dateRange !== undefined || Object.values(filters).some((v) => v);

  // For staff groups, use the group's balance directly if no date range is set
  // This ensures consistency with the list view
  const shouldUseGroupBalance = !dateRange && groupType === 'staff' && group.balance !== undefined;
  
  // Maintain local userNames state that merges with prop
  const [localFetchedUserNames, setLocalFetchedUserNames] = useState<Record<string, string>>({});
  const { user, customUser } = useAuth();
  const isLocalMode = isLocalOnlyMode();

  useEffect(() => {
    if (!user?.uid) return;
    const me = customUser?.displayName || user.displayName || user.email || "";
    if (!me) return;
    setLocalFetchedUserNames((prev) => (prev[user.uid] === me ? prev : { ...prev, [user.uid]: me }));
  }, [user?.uid, user?.displayName, user?.email, customUser?.displayName]);

  useEffect(() => {
    if (!isLocalMode || !companyId) return;
    const localUser = getLocalAuthUser(companyId);
    const localDisplayName = (
      localUser?.displayName ||
      localUser?.username ||
      ((company as any)?.adminUsername as string) ||
      "Admin"
    ).trim();
    if (!localDisplayName) return;
    setLocalFetchedUserNames((prev) => {
      // Keep a stable local-id map so transaction rows resolve local actor names.
      const next = { ...prev };
      next["local"] = localDisplayName;
      next["local_guest_user"] = localDisplayName;
      if (localUser?.id) next[String(localUser.id)] = localDisplayName;
      if (localUser?.username) next[String(localUser.username)] = localDisplayName;
      return next;
    });
  }, [isLocalMode, companyId, company]);
  
  // Merge prop userNames with locally fetched userNames
  const mergedUserNames = useMemo(() => {
    return { ...userNames, ...localFetchedUserNames };
  }, [userNames, localFetchedUserNames]);
  
  const {
    openingBalanceForPeriod,
    processedTransactions,
    periodDr,
    periodCr,
    closingBalance: calculatedClosingBalance,
    openingBalanceOutstanding,
    openingBalanceLinkedVoucherNos,
  } = useTransactions(
    { ...group, items: allItemsInGroup, expenseGroupIds: expenseGroupIdsInGroup },
    "group",
    dateRange,
    undefined,
    allParties,
    undefined,
    undefined,
    filters,
    undefined,
    undefined,
    mergedUserNames
  );
  
  // Fetch missing user names directly from Firestore and store in local state
  useEffect(() => {
    if (!processedTransactions || processedTransactions.length === 0) return;
    if (isLocalMode) return;
    
    const uids = new Set(processedTransactions.map((t: any) => t.userId).filter(Boolean) as string[]);
    
    // Fetch missing user names - check both prop and local state
    const missingUids = Array.from(uids).filter(uid => {
      const propName = userNames?.[uid];
      const localName = localFetchedUserNames[uid];
      return (!propName || propName === "Unknown" || propName === "N/A") && 
             (!localName || localName === "Unknown" || localName === "N/A");
    });
    
    if (missingUids.length === 0) return;
    
    Promise.all(
      missingUids.map(async (uid) => {
        try {
          // Try query by uid field first
          const q = query(collection(firestore, "users"), where("uid", "==", uid));
          const snap = await getDocs(q);
          let data = snap.docs[0]?.data();
          
          if (!data) {
            // Fallback: try doc ID as uid
            const userDoc = await getDoc(doc(firestore, 'users', uid));
            if (userDoc.exists()) {
              data = userDoc.data();
            } else {
              // Fallback 2: search all users for doc ending with uid
              const allUsersSnap = await getDocs(collection(firestore, "users"));
              const matchingDoc = allUsersSnap.docs.find(d => {
                const docData = d.data();
                return docData.uid === uid || d.id.endsWith(uid);
              });
              if (matchingDoc) {
                data = matchingDoc.data();
              }
            }
          }
          
          const displayName = data?.displayName || data?.name || null;
          const email = typeof data?.email === "string" ? data.email : "";
          const emailPrefix = email.includes("@") ? email.split("@")[0] : "";
          let resolvedName = displayName || emailPrefix || null;
          if (resolvedName) {
            const isUIDPattern = resolvedName.length > 15 && /^[a-zA-Z0-9_-]+$/.test(resolvedName) && !resolvedName.includes("@") && !resolvedName.includes(" ");
            if (isUIDPattern && emailPrefix) {
              resolvedName = emailPrefix;
            }
          }
          if (resolvedName && resolvedName !== uid && resolvedName !== "Unknown" && resolvedName !== "N/A") {
            return { uid, name: resolvedName };
          }
        } catch (e) {
          console.error('[GroupDetails] Error fetching userName for', uid, e);
        }
        return { uid, name: null };
      })
    ).then(results => {
      const newUserNames: Record<string, string> = {};
      results.forEach(({ uid, name }) => {
        if (name) {
          newUserNames[uid] = name;
        }
      });
      if (Object.keys(newUserNames).length > 0) {
        setLocalFetchedUserNames(prev => ({ ...prev, ...newUserNames }));
      }
    });
  }, [processedTransactions, userNames, localFetchedUserNames, isLocalMode]);

  // Use group balance if no date range, otherwise use calculated balance
  const closingBalance = shouldUseGroupBalance ? (group.balance || 0) : calculatedClosingBalance;

  const transactionDates = useMemo(() => {
    const dates = new Set<number>();
    processedTransactions.forEach((v: any) => {
      const dateValue = v.date?.toDate ? v.date.toDate() : new Date(v.date);
      if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
        dates.add(startOfDay(dateValue).getTime());
      }
    });
    return Array.from(dates).map((d) => new Date(d));
  }, [processedTransactions]);

  const clearFilters = () => {
    onDateRangeChange(undefined);
    setFilters({});
  };

  const handleEditVoucher = (voucher: any) => {
    openingModalRef.current = true;
    setSelectedVoucher(voucher);
    setIsVoucherDialogOpen(true);
  };

  const handleHistoryVoucher = (voucher: any) => {
    openingModalRef.current = true;
    setHistoryVoucher(voucher);
  };

  const [linkAdvancesVoucher, setLinkAdvancesVoucher] = useState<any>(null);
  const [linkPaymentVoucher, setLinkPaymentVoucher] = useState<any>(null);

  const handleDeleteVoucher = (voucher: any) => {
    openingModalRef.current = true;
    setSelectedVoucher(voucher);
    setIsVoucherDialogOpen(true);
  };

  useEffect(() => {
    const savedState = sessionStorage.getItem("showNarration");
    setShowNarration(savedState !== "false");
  }, []);

  const anyMobilePopupOpen = isMobile && (
    !!mobileFooterDialogOpen || isCalendarOpen || isVoucherDialogOpen || isNoteOpen || !!historyVoucher || !!linkAdvancesVoucher || !!linkPaymentVoucher
  );
  const openModalInUrl = useCallback(() => {
    if (!isMobile || !pathname) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("modal", "1");
    router.push(`${pathname}?${params.toString()}`);
  }, [isMobile, pathname, searchParams, router]);
  const closeModalInUrl = useCallback(() => {
    if (!pathname) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("modal");
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }, [pathname, searchParams, router]);
  const modalParam = searchParams.get("modal");
  const urlModalOpen = isMobile && modalParam === "1" && anyMobilePopupOpen;
  const closeUrlModal = useCallback(() => {
    setMobileFooterDialogOpen(null);
    setIsCalendarOpen(false);
    setIsVoucherDialogOpen(false);
    setSelectedVoucher(null);
    setIsNoteOpen(false);
    setHistoryVoucher(null);
    setLinkAdvancesVoucher(null);
    setLinkPaymentVoucher(null);
    closeModalInUrl();
  }, [closeModalInUrl]);
  useUrlModalBack(urlModalOpen, closeUrlModal);

  useEffect(() => {
    if (!isMobile) return;
    if (modalParam === "1") openingModalRef.current = false;
    if (modalParam !== "1" && anyMobilePopupOpen && !openingModalRef.current) {
      setMobileFooterDialogOpen(null);
      setIsCalendarOpen(false);
      setIsVoucherDialogOpen(false);
      setSelectedVoucher(null);
      setIsNoteOpen(false);
      setHistoryVoucher(null);
      setLinkAdvancesVoucher(null);
      setLinkPaymentVoucher(null);
    }
  }, [isMobile, modalParam, anyMobilePopupOpen]);

  const handleAddLink = useCallback((voucher: any) => {
    openModalInUrl?.();
    const isPaymentType = ["payment_in", "payment_out", "direct_income", "direct_expense"].includes(voucher?.type);
    if (isPaymentType) {
      setLinkPaymentVoucher(voucher);
    } else {
      setLinkAdvancesVoucher(voucher);
    }
  }, [openModalInUrl]);

  const handleMobileBack = useCallback(() => {
    if (mobileFooterDialogOpen) {
      setMobileFooterDialogOpen(null);
      closeModalInUrl();
      return;
    }
    if (isCalendarOpen) {
      setIsCalendarOpen(false);
      closeModalInUrl();
      return;
    }
    if (isVoucherDialogOpen) {
      setIsVoucherDialogOpen(false);
      setSelectedVoucher(null);
      closeModalInUrl();
      return;
    }
    if (isNoteOpen) {
      setIsNoteOpen(false);
      closeModalInUrl();
      return;
    }
    if (historyVoucher) {
      setHistoryVoucher(null);
      closeModalInUrl();
      return;
    }
    if (linkPaymentVoucher) {
      setLinkPaymentVoucher(null);
      closeModalInUrl();
      return;
    }
    if (linkAdvancesVoucher) {
      setLinkAdvancesVoucher(null);
      closeModalInUrl();
      return;
    }
    onBack?.();
  }, [mobileFooterDialogOpen, isCalendarOpen, isVoucherDialogOpen, isNoteOpen, historyVoucher, linkPaymentVoucher, linkAdvancesVoucher, closeModalInUrl, onBack]);

  const handleShowNarrationChange = (checked: boolean) => {
    setShowNarration(checked);
    sessionStorage.setItem("showNarration", String(checked));
  };

  const handleColumnVisibilityChange = (key: TransactionColumnKey, checked: boolean) => {
    const next = { ...visibleColumns, [key]: checked };
    setVisibleColumns(next);
    sessionStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(next));
  };

  const handleStatusFilterChange = (key: keyof StatusFilter, checked: boolean) => {
    const next = { ...statusFilter, [key]: checked };
    setStatusFilter(next);
    sessionStorage.setItem(STATUS_FILTER_KEY, JSON.stringify(next));
    setCurrentPage(1);
  };

  const { setShowNotes, includeNotesInTable, notesPreferenceLockedOnMobile } = useShowNotes();
  // PC: preference; mobile: hamesha notes (includeNotesInTable)
  const displayTransactions = useMemo(
    () => (includeNotesInTable ? processedTransactions : processedTransactions.filter((t: any) => t.type !== "note")),
    [processedTransactions, includeNotesInTable]
  );
  const statusFilteredTransactions = useMemo(
    () => filterByStatus(displayTransactions, statusFilter),
    [displayTransactions, statusFilter]
  );

  const [sortBy, setSortBy] = useState<TransactionSortBy>("date");
  const [sortOrder, setSortOrder] = useState<TransactionSortOrder>(DEFAULT_TRANSACTION_SORT_ORDER);
  const sortedTransactions = useMemo(
    () =>
      recomputeRunningBalanceTopToBottom(
        sortTransactionsWithFiscalMergeForCompany(statusFilteredTransactions, sortBy, sortOrder, undefined, company),
        openingBalanceForPeriod
      ),
    [statusFilteredTransactions, sortBy, sortOrder, openingBalanceForPeriod, company]
  );

  const totalPages = Math.max(
    1,
    Math.ceil(sortedTransactions.length / rowsPerPage)
  );
  const paginatedTransactions = sortedTransactions.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const handleOpenNoteDialog = (partyId?: string) => {
    if (partiesInGroup.length === 1) {
      setNoteEntityId(partiesInGroup[0].id);
    } else if (partyId) {
      setNoteEntityId(partyId);
    }
    setIsNoteOpen(true);
  };

  const buildDateRangeText = () => {
    if (!company) return;
    const from = dateRange?.from;
    const to = dateRange?.to;
    let dateRangeText = "All Time";
    if (from) {
      const fromBS = formatDateBS(from);
      const toBS = to ? formatDateBS(to) : fromBS;
      const fromAD = formatDate(from);
      const toAD = to ? formatDate(to) : fromAD;

      if (dateSystem === "AD") dateRangeText = `AD: ${fromAD} to ${toAD}`;
      else if (dateSystem === "BS") dateRangeText = `BS: ${fromBS} to ${toBS}`;
      else
        dateRangeText = `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
    }
    return dateRangeText;
  };

  const getPrintTitle = (variant: "statement" | "bill_wise") => {
    const title = `Group Statement: ${group.name}`;
    return variant === "bill_wise" ? `Bill Wise ${title}` : title;
  };

  const printTransactions = (transactionsToPrint: any[], variant: "statement" | "bill_wise") => {
    if (!company) return Promise.resolve();
    const dateRangeText = buildDateRangeText();
    // Match printed columns and note visibility with current table controls.
    const printVisibleColumns = variant === "bill_wise" ? { ...visibleColumns, status: true } : visibleColumns;
    return openPrintDirect({
      company: {
        name: company.name,
        pan: company.pan,
        phone: company.phone,
        address: company.address,
        decimalPlaces: company.decimalPlaces,
        showDrCr: company.showDrCr,
        showCurrencySymbol: company.showCurrencySymbol,
        logoUrl: company.logoUrl,
      },
      title: getPrintTitle(variant),
      context: "group",
      contextId: group.id,
      dateSystem: dateSystem,
      dateRangeText: dateRangeText || "All Time",
      vouchersCount: transactionsToPrint.length,
      openingBalance: openingBalanceForPeriod,
      openingBalanceDate: (group as any).openingBalanceDate,
      openingBalanceNarration: (group as any).openingBalanceNarration ?? null,
      transactions: transactionsToPrint,
      showNarration: showNarration,
      includeNotes: includeNotesInTable,
      visibleColumns: printVisibleColumns,
      userNames: userNames,
      billWise: variant === "bill_wise",
      ...(variant === "bill_wise" && { openingBalanceOutstanding, openingBalanceLinkedVoucherNos, vouchers }),
    }, true);
  };

  const handlePrint = () => {
    (async () => {
      try {
        await printTransactions(statusFilteredTransactions, balanceMode === "bill_wise" ? "bill_wise" : "statement");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Print failed. Please try again.");
      }
    })();
  };

  const balanceText = closingBalance >= 0 ? "To Receive" : "To Pay";

  const handleNepaliSelect = (bsDate: BSDate, adDate: Date) => {
    const range = dateRange;
    if (!range?.from || (range.from && range.to)) {
      onDateRangeChange({ from: adDate, to: undefined });
    } else if (adDate < range.from) {
      onDateRangeChange({ from: adDate, to: range.from });
      setIsCalendarOpen(false);
    } else {
      onDateRangeChange({ from: range.from, to: adDate });
      setIsCalendarOpen(false);
    }
  };

  const filteredMobileTransactions = useMemo(() => {
    if (!mobileSearchTerm) return sortedTransactions;
    const lowerCaseSearch = mobileSearchTerm.toLowerCase();
    return sortedTransactions.filter((t) => {
      const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
      const debitCreditAmount = t.debit > 0 ? t.debit : t.credit;
      return (
        t.voucherNumber?.toLowerCase().includes(lowerCaseSearch) ||
        t.type.replace(/_/g, " ").toLowerCase().includes(lowerCaseSearch) ||
        t.narration?.toLowerCase().includes(lowerCaseSearch) ||
        formatDate(d).toLowerCase().includes(lowerCaseSearch) ||
        formatDateBS(d).toLowerCase().includes(lowerCaseSearch) ||
        String(t.total || t.amount || 0)
          .toLowerCase()
          .includes(lowerCaseSearch) ||
        String(t.debit).toLowerCase().includes(lowerCaseSearch) ||
        String(t.credit).toLowerCase().includes(lowerCaseSearch) ||
        String(debitCreditAmount).toLowerCase().includes(lowerCaseSearch) ||
        String(t.balance).toLowerCase().includes(lowerCaseSearch)
      );
    });
  }, [sortedTransactions, mobileSearchTerm, formatDate, formatDateBS]);

  const totalPagesMobile = Math.max(1, Math.ceil(filteredMobileTransactions.length / rowsPerPage));
  const paginatedMobileTransactions = filteredMobileTransactions.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  // Default to last page (most recent 10) on open and when date filter or list changes
  useEffect(() => {
    const total = Math.max(1, Math.ceil(filteredMobileTransactions.length / rowsPerPage));
    setCurrentPage(total);
  }, [dateRange, filteredMobileTransactions.length, rowsPerPage]);

  // Mobile: show a simple "last 10" view by default (no date filter),
  // and all matching transactions when a date filter is applied.
  const mobileTransactionsToShow = useMemo(() => {
    const hasDateFilter =
      !!dateRange && (dateRange.from != null || dateRange.to != null);

    if (hasDateFilter) {
      // Date filter active → show all filtered transactions on mobile
      return filteredMobileTransactions;
    }

    // No date filter → always show the last 10 transactions (any date)
    const list = filteredMobileTransactions;
    if (list.length <= 10) return list;
    return list.slice(-10);
  }, [filteredMobileTransactions, dateRange]);

  const dateRangeLabel = buildDateRangeText() || "All Time";

  // Group dropdown: hide Assets, Equity, Expenses, Income, Liabilities (show Sundry Creditors, Sundry Debtors, etc.)
  const groupDropdownOptions = useMemo(() => {
    const exclude = ["assets", "equity", "expenses", "income", "liabilities", "liability"];
    return allGroups
      .filter(
        (g) =>
          g.id === group?.id || !exclude.includes((g.name || "").trim().toLowerCase())
      )
      .map((g) => ({ value: g.id, label: g.name }));
  }, [allGroups, group?.id]);

  const TransactionRow = React.memo(({ transaction }: { transaction: any }) => {
    const { dateSystem, formatDate, formatDateBS, formatCurrency } = useDate();

    const d = transaction.date?.toDate
      ? transaction.date.toDate()
      : transaction.date
      ? new Date(transaction.date)
      : null;

    if (!d) {
      return (
        <Card className="p-2 m-2 mb-0">
          <p className="text-red-500">Invalid date found</p>
        </Card>
      );
    }

    const displayDate = () => {
      switch (dateSystem) {
        case "AD":
          return formatDate(d);
        case "BS":
          return formatDateBS(d);
        case "Both":
          return `${formatDateBS(d)} (${formatDate(d)})`;
        default:
          return formatDateBS(d);
      }
    };

    return (
      <Card
        className="p-2 m-2 mb-0 rounded-lg shadow-sm border overflow-hidden"
        onClick={() => handleEditVoucher(transaction)}
      >
        <div className="flex justify-between items-start">
          <div>
            <p className="font-semibold text-xs">
              {transaction.voucherNumber} -{" "}
              {transaction.type
                ? transaction.type.replace(/_/g, " ")
                : "N/A"}
            </p>
            <p className="text-xs text-muted-foreground">
              {transaction.narration || "No narration"}
            </p>
          </div>
          <div className="text-right">
            <p
              className={cn(
                "font-bold text-sm",
                transaction.debit > 0 ? "text-red-600" : "text-green-600"
              )}
            >
              {formatCurrency(
                transaction.debit > 0 ? transaction.debit : transaction.credit
              )}
            </p>
          </div>
        </div>
        <div className="flex justify-between items-center mt-1">
          <p className="text-xs text-muted-foreground">
            {displayDate()} • {format(d, "p")}
          </p>
          <Badge
            variant="secondary"
            className={cn(
              "font-normal text-xs px-1.5 py-0.5",
              transaction.balance >= 0
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            )}
          >
            Bal: {formatCurrency(transaction.balance)}
          </Badge>
        </div>
      </Card>
    );
  });
  TransactionRow.displayName = "TransactionRow";

  const renderMobileView = () => (
    <>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full">
        {/* Mobile: scroll area extends to footer; inner pb-24 so last row clears fixed footer */}
        <div className="px-2 py-1.5 border-b flex items-center justify-between gap-2 flex-shrink-0">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={handleMobileBack} className="flex-shrink-0 h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <h1 className="text-base font-bold truncate flex-1 min-w-0">Party Group Details</h1>
          <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
            Showing {mobileTransactionsToShow.length} of {filteredMobileTransactions.length} voucher(s)
          </span>
        </div>
        <div className="px-2 py-1 border-b flex justify-center items-center gap-1.5 flex-shrink-0">
          <span className="text-xs font-medium text-muted-foreground">{!dateRange || (dateRange.from == null && dateRange.to == null) ? "Last 10 Txns" : dateRangeLabel}</span>
          {dateRange != null && (dateRange.from != null || dateRange.to != null) && (
            <button
              type="button"
              onClick={() => onDateRangeChange(undefined)}
              className="p-0.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
              aria-label="Clear date filter"
            >
              <XCircle className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="px-3 py-3 border-b flex-shrink-0">
          <p className={cn("text-2xl font-bold text-center", closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
            {balanceText} {formatCurrency(Math.abs(closingBalance), { noSuffix: true })}
          </p>
        </div>
        {/* Group dropdown + Edit icon + Search - same size as Party Details (equal width & height, edit h-9 w-8) */}
        <div className="p-2 border-b flex-shrink-0">
          <div className="flex items-stretch gap-2">
            <div className="flex-1 min-w-0 h-9 [&_button]:h-9">
              <Combobox
                options={groupDropdownOptions}
                value={group?.id || ""}
                onChange={(value) => {
                  if (value && value !== group.id) router.push(`/party?view=groups&selected=${value}`);
                }}
                placeholder="Select group"
              />
            </div>
            {group.id !== "ungrouped" && (
              <EditGroupDialog group={group} allGroups={allGroups} onGroupUpdated={onGroupUpdated} onGroupDeleted={onGroupDeleted} hasAccounts={partiesInGroup.length > 0 || childGroups.length > 0}>
                <Button variant="outline" size="icon" className="h-9 w-8 flex-shrink-0" data-theme-detail="edit">
                  <Edit className="h-4 w-4" />
                </Button>
              </EditGroupDialog>
            )}
            <div className="flex-1 min-w-0 h-9 relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none z-10" />
              <Input
                placeholder="Search transactions"
                className="pl-8 h-9 text-sm w-full min-w-0"
                value={mobileSearchTerm}
                onChange={(e) => {
                  setMobileSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>
        </div>
        {/* scroll-touch + inline style for APK/WebView touch scroll */}
        <div
          className="flex-1 min-h-0 overflow-auto scroll-touch"
          style={{ overflowY: "scroll", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        >
          <div className="pb-24">
          {/* Unapproved: pink row — default `highlightPendingApproval` */}
          <TransactionsTable
            transactions={mobileTransactionsToShow}
            context="group"
            // Mark this as party-group context so bill-wise table keeps running-balance behavior.
            groupEntityType="party"
            contextId={group.id}
            openingBalance={openingBalanceForPeriod}
            openingBalanceOutstanding={openingBalanceOutstanding}
            openingBalanceLinkedVoucherNos={openingBalanceLinkedVoucherNos}
            openingBalanceDate={(group as any).openingBalanceDate}
            openingBalanceActions={undefined}
            showNarration={showNarration}
            visibleColumns={balanceMode === "bill_wise" ? { ...visibleColumns, status: true } : visibleColumns}
            journalAccountNames={journalAccountNames}
            userNames={mergedUserNames}
            onRowClick={(t) => { openModalInUrl(); handleEditVoucher(t); }}
            onDeleteVoucher={handleDeleteVoucher}
            onHistoryVoucher={(v) => { openModalInUrl(); handleHistoryVoucher(v); }}
            onAddLink={handleAddLink}
            filters={filters}
            setFilters={setFilters}
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
            periodDr={periodDr}
            periodCr={periodCr}
            closingBalance={closingBalance}
            isAllVouchersView={false}
            hideDebitColumn={false}
            hideCreditColumn={false}
            hideBalanceColumn={false}
            isDateChange={false}
            scrollOnlyTransactions
            statusFilter={statusFilter}
            statusFilterAllChecked={statusFilterAllChecked}
            onStatusFilterAll={handleStatusFilterAll}
            onStatusFilterChange={handleStatusFilterChange}
            statusFilterIdPrefix="group"
          />
          </div>
        </div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 p-1.5 border-t bg-background/95 backdrop-blur z-50 flex items-center justify-around gap-1.5">
        <Button
          type="button"
          className="flex-1 h-6 min-w-0 rounded-md text-xs font-medium shrink-0 bg-orange-600 hover:bg-orange-700 text-white border-0"
          onClick={() => setBalanceMode(balanceMode === "bill_wise" ? "statement" : "bill_wise")}
          data-theme-btn={balanceMode === "bill_wise" ? "statement" : "bill-wise"}
        >
          {balanceMode === "bill_wise" ? "Statement" : "Bill wise"}
        </Button>
        <Button className="flex-1 h-6 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium" onClick={() => { openingModalRef.current = true; setMobileFooterDialogOpen("sale"); openModalInUrl(); }}>
          New Sale
        </Button>
        <Button className="flex-1 h-6 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium" onClick={() => { openingModalRef.current = true; setMobileFooterDialogOpen("purchase"); openModalInUrl(); }}>
          New Purchase
        </Button>
        <AddVoucherDialog
          isOpen={!!mobileFooterDialogOpen}
          onOpenChange={(open: boolean) => {
            if (!open) {
              setMobileFooterDialogOpen(null);
              closeModalInUrl();
            }
          }}
          defaultTab={mobileFooterDialogOpen || "sale"}
        />
        <Drawer
          open={isCalendarOpen}
          onOpenChange={(open: boolean) => {
            if (open) {
              openingModalRef.current = true;
              openModalInUrl();
            }
            setIsCalendarOpen(open);
            if (!open) closeModalInUrl();
          }}
        >
          <DrawerTrigger asChild>
            <Button className="flex-1 h-6 min-w-0 rounded-md text-xs font-medium px-1 bg-pink-600 hover:bg-pink-700 text-white">
              <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader className="p-4 text-left">
              <DrawerTitle>Select Date Range</DrawerTitle>
              <DrawerDescription>Select a date range for the transaction list.</DrawerDescription>
            </DrawerHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
              {(dateSystem === "BS" || dateSystem === "Both") && (
                <NepaliCalendar onSelect={handleNepaliSelect} valueAD={dateRange} isRange={true} numberOfMonths={calendarMonths} />
              )}
              {(dateSystem === "AD" || dateSystem === "Both") && (
                <div className="flex-1 w-full min-w-0">
                  <AdCalendar
                    valueAD={dateRange}
                    isRange
                    numberOfMonths={calendarMonths}
                    transactionDates={transactionDates}
                    onSelect={(adDate) => {
                      const range = dateRange;
                      if (!range?.from || (range.from && range.to)) {
                        onDateRangeChange({ from: adDate, to: undefined });
                      } else if (adDate < range.from) {
                        onDateRangeChange({ from: adDate, to: range.from });
                        setIsCalendarOpen(false);
                      } else {
                        onDateRangeChange({ from: range.from, to: adDate });
                        setIsCalendarOpen(false);
                      }
                    }}
                  />
                </div>
              )}
            </div>
            <DrawerFooter className="p-4 pt-2">
              <DrawerClose asChild>
                <Button variant="outline">Close</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>
    </>
  );

  const renderDesktopView = () => (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header: Part 1 (name→balance) and Part 2 (date→print) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
      <div className="border-b p-3 overflow-auto min-h-0 scrollbar-slim-dim">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
          {/* Part 1: account name through balance — single line, no wrap */}
          <div className="flex items-center gap-2 sm:gap-4 flex-nowrap min-w-0 overflow-x-auto scrollbar-slim-dim">
            {onBack && (
              <Button variant="ghost" size="icon" onClick={onBack} className="flex-shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <Avatar className="h-12 w-12 text-lg flex-shrink-0">
              <AvatarFallback className="bg-muted text-muted-foreground">
                {getInitials(group.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex items-center gap-2 flex-nowrap min-w-0">
              <h2 className="text-xl font-semibold truncate">{group.name}</h2>
              {group.id !== "ungrouped" && (
                <EditGroupDialog
                  group={group}
                  allGroups={allGroups}
                  onGroupUpdated={onGroupUpdated}
                  onGroupDeleted={onGroupDeleted}
                  hasAccounts={partiesInGroup.length > 0 || childGroups.length > 0}
                >
                  <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0">
                    <Edit className="h-4 w-4" />
                  </Button>
                </EditGroupDialog>
              )}
              <div
                className={cn(
                  "text-lg font-bold whitespace-nowrap flex-shrink-0",
                  closingBalance >= 0 ? "text-green-600" : "text-red-600"
                )}
              >
                {formatCurrency(closingBalance, { showDrCr: true })}
              </div>
            </div>
          </div>
          {/* Part 2: date range, Add Note, print — single line, no wrap; on small screens this row is below */}
          <div className="flex items-center gap-2 justify-end flex-nowrap overflow-x-auto scrollbar-slim-dim flex-shrink-0">
            {(dateSystem === "BS" || dateSystem === "Both") && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <BsDatePicker
                  isRange
                  valueAD={dateRange}
                  onChangeAD={(range) =>
                    onDateRangeChange(range as DateRange | undefined)
                  }
                  transactionDates={transactionDates}
                  className="w-auto"
                />
                {dateRange != null && (dateRange.from != null || dateRange.to != null) && (
                  <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => onDateRangeChange(undefined)} aria-label="Clear date filter">
                    <XCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
            {(dateSystem === "AD" || dateSystem === "Both") && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <Popover
                  open={isDesktopCalendarOpen}
                  onOpenChange={setIsDesktopCalendarOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      id="date"
                      variant={"outline"}
                      className={cn(
                        "justify-start text-left font-normal h-10 px-2 w-auto",
                        !dateRange && "text-muted-foreground"
                      )}
                      data-theme-detail="date-range"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "LLL dd, y")} -{" "}
                            {format(dateRange.to, "LLL dd, y")}
                          </>
                        ) : (
                          format(dateRange.from, "LLL dd, y")
                        )
                      ) : (
                        <span>Pick a date range</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <AdCalendar
                    valueAD={tempDateRange}
                    isRange
                    numberOfMonths={calendarMonths}
                    transactionDates={transactionDates}
                    onSelect={(adDate) => {
                      const range = tempDateRange;
                      if (!range?.from || (range.from && range.to)) {
                        setTempDateRange({ from: adDate, to: undefined });
                      } else if (adDate < range.from) {
                        const next = { from: adDate, to: range.from };
                        setTempDateRange(next);
                        onDateRangeChange(next);
                        setIsDesktopCalendarOpen(false);
                      } else {
                        const next = { from: range.from, to: adDate };
                        setTempDateRange(next);
                        onDateRangeChange(next);
                        setIsDesktopCalendarOpen(false);
                      }
                    }}
                  />
                </PopoverContent>
              </Popover>
                {dateRange != null && (dateRange.from != null || dateRange.to != null) && (
                  <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => onDateRangeChange(undefined)} aria-label="Clear date filter">
                    <XCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
            {isFilterActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-10 flex-shrink-0"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Clear Filters
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="w-[200px] justify-between flex-shrink-0 h-10"
                  data-theme-detail="members"
                >
                  <span className="truncate">Members ({partiesInGroup.length})</span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[200px] max-h-60 overflow-y-auto">
                {partiesInGroup.map((p) => (
                  <DropdownMenuItem key={p.id} disabled>
                    {p.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBalanceMode(balanceMode === "bill_wise" ? "statement" : "bill_wise")}
              className="flex-shrink-0 h-10"
              data-theme-btn={balanceMode === "bill_wise" ? "statement" : "bill-wise"}
            >
              {balanceMode === "bill_wise" ? "Statement" : "Bill wise"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenNoteDialog()}
              className="flex-shrink-0 h-10"
              data-theme-detail="add-note"
            >
              <FilePlus className="mr-2 h-4 w-4" /> Add Note
            </Button>
            <Button variant="outline" size="icon" onClick={handlePrint} className="flex-shrink-0 h-10 w-10" data-theme-detail="print">
              <Printer className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className={cn("flex-1 flex flex-col min-h-0", balanceMode === "bill_wise" ? "min-w-0" : "overflow-x-auto scrollbar-slim-dim")}>
        <div className="py-4 flex-1 flex flex-col min-h-0 min-w-0">
          <TransactionsTable
            transactions={paginatedTransactions}
            context="group"
            // Mark this as party-group context so bill-wise table keeps running-balance behavior.
            groupEntityType="party"
            contextId={group.id}
            showNarration={showNarration}
            visibleColumns={balanceMode === "bill_wise" ? { ...visibleColumns, status: true } : visibleColumns}
            openingBalance={openingBalanceForPeriod}
            openingBalanceOutstanding={openingBalanceOutstanding}
            openingBalanceLinkedVoucherNos={openingBalanceLinkedVoucherNos}
            openingBalanceDate={(group as any).openingBalanceDate}
            openingBalanceActions={
              group.id !== "ungrouped" ? (
                <EditGroupDialog
                  group={group}
                  allGroups={allGroups}
                  onGroupUpdated={onGroupUpdated}
                  onGroupDeleted={onGroupDeleted}
                  hasAccounts={partiesInGroup.length > 0 || childGroups.length > 0}
                >
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </EditGroupDialog>
              ) : null
            }
            userNames={mergedUserNames}
            onRowClick={handleEditVoucher}
            onDeleteVoucher={handleDeleteVoucher}
            onHistoryVoucher={handleHistoryVoucher}
            onAddLink={handleAddLink}
            filters={filters}
            setFilters={setFilters}
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
            periodDr={periodDr}
            periodCr={periodCr}
            closingBalance={closingBalance}
            scrollOnlyTransactions
            statusFilter={statusFilter}
            statusFilterAllChecked={statusFilterAllChecked}
            onStatusFilterAll={handleStatusFilterAll}
            onStatusFilterChange={handleStatusFilterChange}
            statusFilterIdPrefix="group"
          />
          {paginatedTransactions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No transactions found for the selected period.
            </div>
          )}
        </div>
      </div>
      {/* Footer: Part 1 (count, narration, columns) and Part 2 (rows per page, pagination) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
      <div className="py-2 px-4 border-t overflow-auto min-h-0 scrollbar-slim-dim">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
          <div className="flex items-center gap-2 sm:gap-4 flex-nowrap min-w-0 overflow-x-auto scrollbar-slim-dim text-sm text-muted-foreground">
            <span className="whitespace-nowrap flex-shrink-0">{statusFilteredTransactions.length} transaction(s).</span>
            <div className="flex items-center space-x-2 flex-shrink-0">
              <Checkbox id="show-narration-party-group" checked={showNarration} onCheckedChange={(checked) => handleShowNarrationChange(Boolean(checked))} />
              <label htmlFor="show-narration-party-group" className="text-sm font-medium leading-none whitespace-nowrap">Show Narration</label>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1 flex-shrink-0">
                  <Columns3 className="h-4 w-4" />
                  Columns
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52 p-2">
                {(Object.keys(COLUMN_LABELS) as TransactionColumnKey[])
                  .filter((key) => key !== "status" || balanceMode === "bill_wise")
                  .map((key) => {
                  const isStatusInStatement = key === "status" && balanceMode === "statement";
                  const isStatusInBillWise = key === "status" && balanceMode === "bill_wise";
                  const isStatusLocked = isStatusInStatement || isStatusInBillWise;
                  return (
                    <DropdownMenuItem
                      key={key}
                      onSelect={(e) => e.preventDefault()}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Checkbox
                        id={`col-${key}-group`}
                        checked={isStatusInStatement ? false : (isStatusInBillWise ? true : visibleColumns[key] !== false)}
                        disabled={isStatusLocked}
                        onCheckedChange={isStatusLocked ? undefined : (c) => handleColumnVisibilityChange(key, Boolean(c))}
                      />
                      <label htmlFor={`col-${key}-group`} className={cn("text-sm font-medium flex-1", isStatusLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
                        {COLUMN_LABELS[key]}
                      </label>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Checkbox id="show-notes-group" checked={includeNotesInTable} disabled={notesPreferenceLockedOnMobile} onCheckedChange={(c) => setShowNotes(Boolean(c))} />
              <label htmlFor="show-notes-group" className="text-sm font-medium leading-none whitespace-nowrap cursor-pointer">Note</label>
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end flex-nowrap overflow-x-auto scrollbar-slim-dim flex-shrink-0">
            <TransactionTableSortDropdown
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={(by, order) => { setSortBy(by); setSortOrder(order); }}
              viewMode={balanceMode === "bill_wise" ? "bill_wise" : "statement"}
            />
            <p className="text-sm font-medium flex-shrink-0">Rows per page</p>
            <Select
              value={`${rowsPerPage}`}
              onValueChange={(value) => {
                setRowsPerPage(Number(value));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue placeholder={`${rowsPerPage}`} />
              </SelectTrigger>
              <SelectContent side="top">
                {[10, 20, 30, 50].map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm font-medium flex-shrink-0">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex items-center space-x-1 flex-shrink-0">
              <Button
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // For staff groups, use the reusable StaffGroupDetails component
  if (groupType === 'staff') {
    const staffInGroup = accountsInGroup as Staff[]; // accountsInGroup contains staff for staff groups
    const staffGroup = group as unknown as StaffGroup;
    return (
      <StaffGroupDetails
        group={staffGroup}
        allGroups={processedStaffGroups as StaffGroup[]}
        staff={staffInGroup}
        onGroupUpdated={onGroupUpdated}
        onGroupDeleted={onGroupDeleted}
        onStaffUpdated={onPartyUpdated}
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
        onBack={onBack}
        userNames={userNames}
      />
    );
  }

  // For account groups (bank/cash), use the reusable AccountGroupDetails component
  if (groupType === 'account') {
    const accountsInAccountGroup = accountsInGroup as Account[]; // accountsInGroup contains accounts for account groups
    const accountGroup = group as unknown as AccountGroup;
    return (
      <AccountGroupDetails
        group={accountGroup}
        allGroups={processedAccountGroups as AccountGroup[]}
        accounts={accountsInAccountGroup}
        onGroupUpdated={onGroupUpdated}
        onGroupDeleted={onGroupDeleted}
        onAccountUpdated={onPartyUpdated}
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
        onBack={onBack}
        userNames={userNames}
      />
    );
  }

  // For tax groups, use the reusable TaxGroupDetails component
  if (groupType === 'tax') {
    const taxesInGroup = accountsInGroup as Tax[]; // accountsInGroup contains taxes for tax groups
    const taxGroup = group as unknown as TaxGroup;
    return (
      <TaxGroupDetails
        group={taxGroup}
        allGroups={processedTaxGroups as TaxGroup[]}
        taxes={taxesInGroup}
        onGroupUpdated={onGroupUpdated}
        onGroupDeleted={onGroupDeleted}
        onTaxUpdated={onPartyUpdated}
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
        onBack={onBack}
        userNames={userNames}
      />
    );
  }

  // For expense groups, use the reusable ExpenseGroupDetails component
  if (groupType === 'expense') {
    const expenseAccountsInGroup = accountsInGroup as ExpenseAccount[]; // accountsInGroup contains expense accounts for expense groups
    const expenseGroup = group as unknown as ExpenseGroup;
    return (
      <ExpenseGroupDetails
        group={expenseGroup}
        allGroups={processedExpenseGroups as ExpenseGroup[]}
        accounts={expenseAccountsInGroup}
        onGroupUpdated={onGroupUpdated}
        onGroupDeleted={onGroupDeleted}
        onAccountUpdated={onPartyUpdated}
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
        onBack={onBack}
        userNames={userNames}
      />
    );
  }

  // For item groups, use the reusable ItemGroupDetails component
  if (groupType === 'item') {
    const itemsInGroup = accountsInGroup as Item[]; // accountsInGroup contains items for item groups
    const itemGroup = group as unknown as ItemGroup;
    return (
      <ItemGroupDetails
        group={itemGroup}
        allGroups={processedItemGroups as ItemGroup[]}
        items={itemsInGroup}
        allItems={processedItems}
        onGroupUpdated={onGroupUpdated}
        onGroupDeleted={onGroupDeleted}
        onItemUpdated={onPartyUpdated}
        stockView="amount"
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
        onBack={onBack}
        userNames={userNames}
        transactions={vouchers}
      />
    );
  }

  return (
    <>
      <div className={cn("h-full min-h-0", isMobile && "flex flex-col")}>
        {isMobile ? renderMobileView() : renderDesktopView()}
      </div>
      <Dialog
        open={isNoteOpen}
        onOpenChange={(open: boolean) => {
          setIsNoteOpen(open);
          if (!open && isMobile) closeModalInUrl();
        }}
      >
        <DialogContent className="h-[95vh] w-full max-w-3xl flex flex-col">
          <DialogHeader>
            <DialogTitle>Add a New Note for a Party in {group.name}</DialogTitle>
            <DialogDescription>
              {partiesInGroup.length > 1
                ? "Select which party this note applies to."
                : "Record a new note for this party."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {partiesInGroup.length > 1 && !noteEntityId && (
              <div className="flex flex-col gap-2 p-4">
                <p className="font-semibold">Select a party for the note:</p>
                {partiesInGroup.map((p) => (
                  <Button
                    key={p.id}
                    variant="outline"
                    onClick={() => setNoteEntityId(p.id)}
                  >
                    {p.name}
                  </Button>
                ))}
              </div>
            )}
            {noteEntityId && (
              <CreateNoteForm
                onVoucherAction={() => {
                  onPartyUpdated();
                  setIsNoteOpen(false);
                  setNoteEntityId(null);
                }}
                initialContext="Party"
                initialEntityId={noteEntityId}
                compactFooter
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
      <AddVoucherDialog
        isOpen={isVoucherDialogOpen}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setIsVoucherDialogOpen(false);
            setSelectedVoucher(null);
            if (isMobile) closeModalInUrl();
          } else {
            setIsVoucherDialogOpen(open);
          }
        }}
        voucher={selectedVoucher}
        onVoucherAction={() => setSelectedVoucher(null)}
      />
      <HistoryDialog
        voucher={historyVoucher}
        isOpen={!!historyVoucher}
        onOpenChange={(open: boolean) => !open && setHistoryVoucher(null)}
        onHistoryReset={() => setHistoryVoucher((prev: any) => prev ? { ...prev, history: [] } : null)}
      />
      {linkAdvancesVoucher && (
        <LinkAdvancesToVoucherDialog
          isOpen={!!linkAdvancesVoucher}
          onOpenChange={(open: boolean) => !open && setLinkAdvancesVoucher(null)}
          mode={linkAdvancesVoucher.type === "purchase" || linkAdvancesVoucher.type === "purchase_service" ? "purchase" : "sale"}
          targetVoucherId={linkAdvancesVoucher.id}
          targetPartyId={linkAdvancesVoucher.partyId ?? ""}
          targetPartyName={allParties?.find((p) => p.id === linkAdvancesVoucher.partyId)?.name ?? "Party"}
          partyOpeningBalance={allParties?.find((p) => p.id === linkAdvancesVoucher.partyId)?.openingBalance ?? 0}
          balanceKind="all"
          onDone={() => setLinkAdvancesVoucher(null)}
        />
      )}
      {linkPaymentVoucher && (
        <LinkPaymentToTxnsDialog
          isOpen={!!linkPaymentVoucher}
          onOpenChange={(open: boolean) => !open && setLinkPaymentVoucher(null)}
          variant={linkPaymentVoucher.type === "payment_out" || linkPaymentVoucher.type === "direct_expense" ? "payment_out" : "payment_in"}
          partyId={linkPaymentVoucher.partyId ?? null}
          partyName={allParties?.find((p) => p.id === linkPaymentVoucher.partyId)?.name ?? "Party"}
          receivedAmount={Number(linkPaymentVoucher.amount ?? linkPaymentVoucher.total ?? 0)}
          existingAllocations={Array.isArray(linkPaymentVoucher.allocations) ? linkPaymentVoucher.allocations : []}
          paymentInId={["payment_in", "direct_income"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.id : undefined}
          paymentOutId={["payment_out", "direct_expense"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.id : undefined}
          paymentInVoucherNumber={["payment_in", "direct_income"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.voucherNumber : undefined}
          paymentInDate={["payment_in", "direct_income"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.date : undefined}
          paymentOutVoucherNumber={["payment_out", "direct_expense"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.voucherNumber : undefined}
          paymentOutDate={["payment_out", "direct_expense"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.date : undefined}
          partyOpeningBalance={allParties?.find((p) => p.id === linkPaymentVoucher.partyId)?.openingBalance ?? 0}
          onDone={async (allocations, _amount) => {
            if (!companyId || !linkPaymentVoucher?.id) return;
            try {
              await updateDoc(doc(firestore, `companies/${companyId}/vouchers`, linkPaymentVoucher.id), { allocations });
              toast.success("Allocations updated.");
              setLinkPaymentVoucher(null);
            } catch (e: any) {
              toast.error(e?.message || "Failed to update allocations.");
            }
          }}
        />
      )}
    </>
  );
}
