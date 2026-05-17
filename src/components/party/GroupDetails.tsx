
"use client";

import * as React from "react";
import { toast } from "sonner";
import { openPrintDirect } from "@/lib/printDirect";
import type { Party, Group } from "@/components/party/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LedgerViewModePills } from "@/components/ui/LedgerViewModePills";
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
import { LedgerFooterTextPill, LedgerFooterChromePill } from "@/components/vouchers/ledgerFooterChrome";
import { LedgerFooterColumnsMenu } from "@/components/vouchers/LedgerFooterColumnsMenu";

import { useShowNotes } from "../vouchers/transactionColumnVisibility";
import { StatementCheckModeFooterControls } from "@/components/vouchers/StatementCheckModeFooterControls";
import { LedgerFooterCheckboxPill } from "@/components/vouchers/ledgerFooterChrome";
import { useStatementLedgerCheckModePaging } from "@/hooks/useStatementLedgerCheckModePaging";
import {
  sortTransactionsWithFiscalMergeForCompany,
  recomputeRunningBalanceTopToBottom,
  DEFAULT_TRANSACTION_SORT_ORDER,
} from "@/lib/transactionSort";
import { getTransactionQuickSearchHaystack } from "@/components/vouchers/transactionTableShared";
import { mergeLedgerUserDisplayNameMaps } from "@/lib/ledgerUserColumnDisplay";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { cn } from "@/lib/utils";
import { MobileDetailSummaryCollapsible } from "@/components/layout/MobileDetailSummaryCollapsible";
import {
  clearPlModalParentQueryBackup,
  pathnameForModalRouterReplace,
  patchMasterDetailUrlAfterModalClose,
  persistPlModalParentQuery,
  searchParamsStringAfterClosingModal,
  searchParamsStringForModalClose,
} from "@/lib/modalUrlSync";
import { startOfDay, endOfDay, format } from "date-fns";
import { formatVoucherEntryTimeLocal } from "@/lib/voucherDateNormalize";
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
import { useSyncTempDateRangeFromProp } from "@/hooks/useLedgerDetailDateRange";
import { ROWS_PER_PAGE_OPTIONS_DEFAULT } from "@/lib/rowsPerPageSelect";
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
import { DateRangePresetRow } from "@/components/ui/DateRangePresetRow";
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
import { MobileTransactionsPager } from "@/components/vouchers/MobileTransactionsPager";
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
  useEffect(() => {
    setCurrentPage(1);
  }, [group.id]);
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
  // dateRange object har render par naya ref ho sakta hai — sirf from/to timestamps (infinite loop avoid).
  const dateRangeFromMs = dateRange?.from?.getTime();
  const dateRangeToMs = dateRange?.to?.getTime();
  const [mobileSearchTerm, setMobileSearchTerm] = useState("");
  const [isDateSearchMode, setIsDateSearchMode] = useState(false);
  const [mobileFooterDialogOpen, setMobileFooterDialogOpen] = useState<null | "sale" | "purchase">(null);
  const openingModalRef = useRef(false);

  // Radix Select: value list me na ho to ref/setState loop — sirf maujood option strings.
  const rowsPerPageSelectValue = useMemo(() => {
    if (rowsPerPage === 0) return "0";
    if ((ROWS_PER_PAGE_OPTIONS_DEFAULT as readonly number[]).includes(rowsPerPage)) return `${rowsPerPage}`;
    return "10";
  }, [rowsPerPage]);
  const handleRowsPerPageChange = useCallback(
    (value: string) => {
      setRowsPerPage(Number(value) || 0);
      setCurrentPage(1);
    },
    [setRowsPerPage, setCurrentPage]
  );

  useSyncTempDateRangeFromProp(dateRange, setTempDateRange);

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
  /** Party ledger jaisa dated opening row: filter lagne par range-from dikhao. */
  const hasLedgerDateFilter = Boolean(dateRange?.from != null || dateRange?.to != null);

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
  }, [isLocalMode, companyId, (company as { adminUsername?: string })?.adminUsername]);
  
  // Merge prop userNames with locally fetched userNames
  // Merge: recurring "Auto" jaise voucher naam Firestore fetch se overwrite na hon
  const mergedUserNames = useMemo(() => mergeLedgerUserDisplayNameMaps(userNames || {}, localFetchedUserNames), [userNames, localFetchedUserNames]);

  const mobileSearchNames = useMemo(
    () => ({ ...journalAccountNames, ...mergedUserNames }),
    [journalAccountNames, mergedUserNames]
  );
  
  // useTransactions ko har render par naya entity object mat do — sirf group/items badle tab.
  const groupTransactionEntity = useMemo(
    () => ({ ...group, items: allItemsInGroup, expenseGroupIds: expenseGroupIdsInGroup }),
    [group, allItemsInGroup, expenseGroupIdsInGroup]
  );

  const {
    openingBalanceForPeriod,
    processedTransactions,
    periodDr,
    periodCr,
    closingBalance: calculatedClosingBalance,
    openingBalanceOutstanding,
    openingBalanceLinkedVoucherNos,
  } = useTransactions(
    groupTransactionEntity,
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
  
  // User ids stable key — processedTransactions naya array ref par effect loop na chale.
  const transactionUserIdsKey = useMemo(() => {
    if (!processedTransactions?.length) return "";
    return [...new Set(processedTransactions.map((t: any) => t.userId).filter(Boolean) as string[])].sort().join(",");
  }, [processedTransactions]);

  // Fetch missing user names directly from Firestore and store in local state
  useEffect(() => {
    if (!transactionUserIdsKey) return;
    if (isLocalMode) return;
    
    const uids = new Set(transactionUserIdsKey.split(",").filter(Boolean));
    
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
        setLocalFetchedUserNames((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const [uid, name] of Object.entries(newUserNames)) {
            if (next[uid] !== name) {
              next[uid] = name;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }
    });
  }, [transactionUserIdsKey, userNames, isLocalMode]);

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
    persistPlModalParentQuery(searchParams.toString());
    const params = new URLSearchParams(searchParamsStringForModalClose(searchParams.toString()));
    params.set("modal", "1");
    router.push(`${pathname}?${params.toString()}`);
  }, [isMobile, pathname, searchParams, router]);
  const closeModalInUrl = useCallback(() => {
    if (!pathname) return;
    const raw = searchParamsStringAfterClosingModal(searchParams.toString());
    const params = new URLSearchParams(raw);
    params.delete("modal");
    params.delete("modalts");
    // Party groups tab: `view=groups` + `selected` dono pakke â€” approve ke baad Parties tab pe mat kheench
    patchMasterDetailUrlAfterModalClose(params, { entityId: group.id, groupsTab: true });
    const q = params.toString();
    const basePath = pathnameForModalRouterReplace(pathname);
    router.replace(q ? `${basePath}?${q}` : basePath, { scroll: false });
    clearPlModalParentQueryBackup();
  }, [pathname, searchParams, router, group.id]);
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

  // Statement check mode + desktop tail paging (PartyDetails jaisa)
  const {
    statementCheck,
    desktopPaginationMeta,
    paginatedTransactions,
    totalPages,
  } = useStatementLedgerCheckModePaging({
    companyId,
    context: "group",
    contextId: group?.id,
    viewMode: balanceMode === "bill_wise" ? "bill_wise" : "statement",
    searchFilteredTransactions: sortedTransactions,
    rowsPerPage,
    currentPage,
    ledgerOpeningForRunning: openingBalanceForPeriod,
  });

  /** Desktop table: Book OB sirf jab slice chronological shuru se (PartyDetails jaisa). */
  const desktopLedgerOpeningPeriodStartDate = useMemo(() => {
    const list = sortedTransactions as any[];
    const start = desktopPaginationMeta.sliceStart;
    if (rowsPerPage <= 0) {
      if (hasLedgerDateFilter) return dateRange?.from;
      return undefined;
    }
    if (start === 0) {
      if (hasLedgerDateFilter) return dateRange?.from;
      return undefined;
    }
    const t = list[start - 1] as any;
    if (!t) return undefined;
    const raw = t.date?.toDate ? t.date.toDate() : t.date ? new Date(t.date) : undefined;
    return raw instanceof Date && !isNaN(raw.getTime()) ? raw : undefined;
  }, [sortedTransactions, rowsPerPage, desktopPaginationMeta.sliceStart, hasLedgerDateFilter, dateRange?.from]);

  const booksOpeningForGroup = Number(group.openingBalance) || 0;

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
  // Group opening row: Balance column should stay on ledger opening, not OB outstanding override.
  const groupOpeningOutstandingForTable: number | undefined = undefined;

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
        getTransactionQuickSearchHaystack(t, mobileSearchNames, "group", group.id, "party").includes(lowerCaseSearch) ||
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
  }, [sortedTransactions, mobileSearchTerm, formatDate, formatDateBS, mobileSearchNames, group.id]);

  // Keep page in valid range when list size/page-size changes (dateRange object deps se loop avoid).
  useEffect(() => {
    const perPage = rowsPerPage <= 0 ? filteredMobileTransactions.length || 1 : rowsPerPage;
    const total = Math.max(1, Math.ceil(filteredMobileTransactions.length / perPage));
    setCurrentPage((prev) => {
      const next = Math.min(Math.max(1, prev), total);
      return next === prev ? prev : next;
    });
  }, [dateRangeFromMs, dateRangeToMs, filteredMobileTransactions.length, rowsPerPage, group.id]);

  const mobileTransactionsToShow = useMemo(() => {
    if (rowsPerPage <= 0) return filteredMobileTransactions;
    const total = filteredMobileTransactions.length;
    const totalPagesLocal = Math.max(1, Math.ceil(total / rowsPerPage));
    const safePage = Math.min(Math.max(1, currentPage), totalPagesLocal);
    const end = total - (safePage - 1) * rowsPerPage;
    const start = Math.max(0, end - rowsPerPage);
    return filteredMobileTransactions.slice(start, Math.max(start, end));
  }, [filteredMobileTransactions, currentPage, rowsPerPage]);
  const mobilePagerEdgeCounts = useMemo(() => {
    const total = filteredMobileTransactions.length;
    if (rowsPerPage <= 0) return { before: 0, after: 0 };
    const totalPagesLocal = Math.max(1, Math.ceil(total / rowsPerPage));
    const safePage = Math.min(Math.max(1, currentPage), totalPagesLocal);
    const end = total - (safePage - 1) * rowsPerPage;
    const start = Math.max(0, end - rowsPerPage);
    return { before: start, after: Math.max(0, total - end) };
  }, [filteredMobileTransactions.length, currentPage, rowsPerPage]);
  const mobilePaginationMeta = useMemo(() => {
    const list = filteredMobileTransactions;
    const total = list.length;
    if (rowsPerPage <= 0) {
      const pageDr = list.reduce((sum, t: any) => sum + (Number(t?.debit) || 0), 0);
      const pageCr = list.reduce((sum, t: any) => sum + (Number(t?.credit) || 0), 0);
      return {
        sliceStart: 0,
        openingForPage: openingBalanceForPeriod,
        periodDrForPage: pageDr,
        periodCrForPage: pageCr,
        closingForPage: openingBalanceForPeriod + pageDr - pageCr,
      };
    }
    const totalPagesLocal = Math.max(1, Math.ceil(total / rowsPerPage));
    const safePage = Math.min(Math.max(1, currentPage), totalPagesLocal);
    const end = total - (safePage - 1) * rowsPerPage;
    const start = Math.max(0, end - rowsPerPage);
    const pageTransactions = list.slice(start, Math.max(start, end));
    const previousTx = start > 0 ? list[start - 1] : null;
    const previousRunningBalance =
      previousTx != null
        ? (typeof previousTx.balance === "number"
            ? previousTx.balance
            : typeof previousTx.runningBalance === "number"
              ? previousTx.runningBalance
              : undefined)
        : undefined;
    const openingForPage =
      typeof previousRunningBalance === "number" && !Number.isNaN(previousRunningBalance)
        ? previousRunningBalance
        : openingBalanceForPeriod;
    const periodDrForPage = pageTransactions.reduce((sum, t: any) => sum + (Number(t?.debit) || 0), 0);
    const periodCrForPage = pageTransactions.reduce((sum, t: any) => sum + (Number(t?.credit) || 0), 0);
    return {
      sliceStart: start,
      openingForPage,
      periodDrForPage,
      periodCrForPage,
      closingForPage: openingForPage + periodDrForPage - periodCrForPage,
    };
  }, [filteredMobileTransactions, rowsPerPage, currentPage, openingBalanceForPeriod]);

  /** Mobile search list: tail slice ke hisaab se dated OB (desktop se alag list ho sakti hai). */
  const mobileLedgerOpeningPeriodStartDate = useMemo(() => {
    const list = filteredMobileTransactions as any[];
    const start = mobilePaginationMeta.sliceStart;
    if (rowsPerPage <= 0) {
      if (hasLedgerDateFilter) return dateRange?.from;
      return undefined;
    }
    if (start === 0) {
      if (hasLedgerDateFilter) return dateRange?.from;
      return undefined;
    }
    const t = list[start - 1] as any;
    if (!t) return undefined;
    const raw = t.date?.toDate ? t.date.toDate() : t.date ? new Date(t.date) : undefined;
    return raw instanceof Date && !isNaN(raw.getTime()) ? raw : undefined;
  }, [filteredMobileTransactions, rowsPerPage, mobilePaginationMeta.sliceStart, hasLedgerDateFilter, dateRange?.from]);

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
            {displayDate()} â€¢ {formatVoucherEntryTimeLocal(transaction as Record<string, unknown>)}
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
        <MobileDetailSummaryCollapsible>
        <div className="flex flex-shrink-0 items-center justify-center gap-1 border-b px-2 py-0.5">
          <span className="text-[11px] font-medium leading-tight text-muted-foreground">{!dateRange || (dateRange.from == null && dateRange.to == null) ? "All Time" : dateRangeLabel}</span>
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
        <div className="flex-shrink-0 border-b px-2 py-1">
          <p className={cn("text-center text-lg font-bold leading-tight", closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
            {balanceText} {formatCurrency(Math.abs(closingBalance), { noSuffix: true })}
          </p>
        </div>
        {/* Group dropdown + Edit icon + Search - same size as Party Details (equal width & height, edit h-9 w-8) */}
        <div className="flex-shrink-0 border-b px-2 py-1">
          <div className="flex items-stretch gap-1.5">
            <div className="h-8 min-w-0 flex-1 [&_button]:h-8 [&_button]:text-xs">
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
                <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0" data-theme-detail="edit">
                  <Edit className="h-3.5 w-3.5" />
                </Button>
              </EditGroupDialog>
            )}
            <div className="relative h-8 min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 z-10 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search transactions"
                className="h-8 w-full min-w-0 pl-7 text-xs"
                value={mobileSearchTerm}
                onChange={(e) => {
                  setMobileSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>
        </div>
        </MobileDetailSummaryCollapsible>
        {/* scroll-touch + inline style for APK/WebView touch scroll */}
        <div
          className="flex-1 min-h-0 overflow-auto scroll-touch"
          style={{ overflowY: "scroll", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        >
          <div className="pb-2">
          {/* Unapproved: pink row â€” default `highlightPendingApproval` */}
          <TransactionsTable
            transactions={mobileTransactionsToShow}
            context="group"
            // Mark this as party-group context so bill-wise table keeps running-balance behavior.
            groupEntityType="party"
            contextId={group.id}
            openingBalance={mobilePaginationMeta.openingForPage}
            openingBalanceOutstanding={groupOpeningOutstandingForTable}
            openingBalanceLinkedVoucherNos={openingBalanceLinkedVoucherNos}
            openingBalanceDate={(group as any).openingBalanceDate}
            openingBalanceNarration={(group as any).openingBalanceNarration}
            booksOpeningBalance={booksOpeningForGroup}
            ledgerDateFilterActive={hasLedgerDateFilter}
            ledgerShowBookOpeningRow={rowsPerPage <= 0 || mobilePaginationMeta.sliceStart === 0}
            openingBalancePeriodStartDate={mobileLedgerOpeningPeriodStartDate}
            dateRange={dateRange}
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
            periodDr={mobilePaginationMeta.periodDrForPage}
            periodCr={mobilePaginationMeta.periodCrForPage}
            closingBalance={mobilePaginationMeta.closingForPage}
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
            {...statementCheck.tableProps}
          />
          </div>
        </div>
        <MobileTransactionsPager
          className="flex-shrink-0 mb-12"
          currentPage={currentPage}
          totalItems={filteredMobileTransactions.length}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(nextRows) => {
            setRowsPerPage(nextRows);
            setCurrentPage(1);
          }}
          onPageChange={setCurrentPage}
          edgeCounts={rowsPerPage > 0 ? mobilePagerEdgeCounts : undefined}
        />
      </div>
      <div className="fixed bottom-0 left-0 right-0 p-1.5 border-t bg-background/95 backdrop-blur z-50 flex items-center justify-around gap-1.5">
        {/* Mobile: header jaisa pill â€” active mode par green border */}
        <LedgerViewModePills
          className="flex-1 min-w-0"
          buttonClassName="h-6 flex-1 min-w-0 px-1 text-xs"
          value={balanceMode}
          onChange={setBalanceMode}
          options={[
            { value: "statement", label: "Statement" },
            { value: "bill_wise", label: "Bill wise" },
          ]}
        />
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
                <NepaliCalendar
                  rangePresetSlot={
                    <DateRangePresetRow
                      country={company?.country}
                      onApply={(r) => {
                        onDateRangeChange(r);
                        setIsCalendarOpen(false);
                      }}
                    />
                  }
                  onSelect={handleNepaliSelect}
                  valueAD={dateRange}
                  isRange={true}
                  numberOfMonths={calendarMonths}
                />
              )}
              {(dateSystem === "AD" || dateSystem === "Both") && (
                <div className="flex-1 w-full min-w-0">
                  <AdCalendar
                    rangePresetSlot={
                      <DateRangePresetRow
                        country={company?.country}
                        onApply={(r) => {
                          onDateRangeChange(r);
                          setIsCalendarOpen(false);
                        }}
                      />
                    }
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
      {/* Header: Part 1 (nameâ†’balance) and Part 2 (dateâ†’print) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
      <div className="border-b p-3 overflow-auto min-h-0 scrollbar-slim-dim">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
          {/* Part 1: account name through balance â€” single line, no wrap */}
          <div className="flex min-w-0 flex-nowrap items-center gap-1.5 min-w-0 overflow-x-auto scrollbar-slim-dim">
            {onBack && (
              <Button variant="ghost" size="icon" onClick={onBack} className="flex-shrink-0">
                <ArrowLeft className="h-3 w-3" />
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
          {/* Part 2: date range, Add Note, print â€” single line, no wrap; on small screens this row is below */}
          <div className="flex flex-shrink-0 flex-nowrap items-center justify-end gap-1.5 overflow-x-auto scrollbar-slim-dim flex-shrink-0">
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
                    rangePresetSlot={
                      <DateRangePresetRow
                        country={company?.country}
                        onApply={(r) => {
                          setTempDateRange(r);
                          onDateRangeChange(r);
                          setIsDesktopCalendarOpen(false);
                        }}
                      />
                    }
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
              </div>
            )}
            {isFilterActive && (
              // Header par duplicate clear controls hata kar single clear button.
              <Button
                variant="ghost"
                size="icon"
                onClick={clearFilters}
                className="h-10 w-10 flex-shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Clear date filter"
              >
                <XCircle className="h-4 w-4" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  // Trigger compact rakho; sirf dropdown panel wide hoga.
                  className="w-[200px] justify-between flex-shrink-0 h-10"
                  data-theme-detail="members"
                >
                  <span className="truncate">Members ({partiesInGroup.length})</span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[320px] max-h-72 overflow-y-auto">
                {partiesInGroup.map((p) => (
                  <DropdownMenuItem key={p.id} disabled>
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="truncate text-left">{p.name}</span>
                      <span
                        className={cn(
                          "shrink-0 text-xs font-semibold tabular-nums",
                          (Number((p as any).balance) || 0) >= 0 ? "text-green-600" : "text-red-600"
                        )}
                      >
                        {formatCurrency(Number((p as any).balance) || 0, { showDrCr: true })}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <LedgerViewModePills
              value={balanceMode}
              onChange={setBalanceMode}
              options={[
                { value: "statement", label: "Statement" },
                { value: "bill_wise", label: "Bill wise" },
              ]}
            />
            <Button
              variant="chromePill"
              size="sm"
              onClick={() => handleOpenNoteDialog()}
              className="flex-shrink-0 h-10"
              data-theme-detail="add-note"
            >
              <FilePlus className="mr-2 h-4 w-4" /> Add Note
            </Button>
            <Button variant="chromePill" size="icon" onClick={handlePrint} className="flex-shrink-0 h-10 w-10" data-theme-detail="print">
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
            openingBalance={desktopPaginationMeta.openingForPage}
            openingBalanceOutstanding={groupOpeningOutstandingForTable}
            openingBalanceLinkedVoucherNos={openingBalanceLinkedVoucherNos}
            openingBalanceDate={(group as any).openingBalanceDate}
            openingBalanceNarration={(group as any).openingBalanceNarration}
            booksOpeningBalance={booksOpeningForGroup}
            ledgerDateFilterActive={hasLedgerDateFilter}
            ledgerShowBookOpeningRow={rowsPerPage <= 0 || desktopPaginationMeta.sliceStart === 0}
            openingBalancePeriodStartDate={desktopLedgerOpeningPeriodStartDate}
            dateRange={dateRange}
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
            periodDr={desktopPaginationMeta.periodDrForPage}
            periodCr={desktopPaginationMeta.periodCrForPage}
            closingBalance={desktopPaginationMeta.closingForPage}
            scrollOnlyTransactions
            statusFilter={statusFilter}
            statusFilterAllChecked={statusFilterAllChecked}
            onStatusFilterAll={handleStatusFilterAll}
            onStatusFilterChange={handleStatusFilterChange}
            statusFilterIdPrefix="group"
            {...statementCheck.tableProps}
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
          <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto scrollbar-slim-dim text-sm text-muted-foreground">
              <LedgerFooterCheckboxPill
                id="show-narration-party-group"
                checked={showNarration}
                onCheckedChange={(checked) => (checked) => handleShowNarrationChange(Boolean(checked))}
                label="Show Narration"
              />
            <LedgerFooterColumnsMenu>
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
              </LedgerFooterColumnsMenu>
              <LedgerFooterCheckboxPill
                id="show-notes-group"
                checked={includeNotesInTable}
                disabled={notesPreferenceLockedOnMobile}
                onCheckedChange={(c) => setShowNotes(Boolean(c))}
                label="Note"
              />
            <StatementCheckModeFooterControls
              idPrefix="party-group"
              enabled={statementCheck.checkModeEnabled}
              onEnabledChange={statementCheck.setCheckModeEnabled}
              viewMode={balanceMode === "bill_wise" ? "bill_wise" : "statement"}
              hiddenCount={statementCheck.hiddenCount}
            />
          </div>
          <div className="flex flex-shrink-0 flex-nowrap items-center justify-end gap-1.5 overflow-x-auto scrollbar-slim-dim flex-shrink-0">
            <TransactionTableSortDropdown
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={(by, order) => { setSortBy(by); setSortOrder(order); }}
              viewMode={balanceMode === "bill_wise" ? "bill_wise" : "statement"}
            />
            {/* Tail paging (page1=latest): (xx) << < [rows] > >> (xx) â€” PartyDetails jaisa */}
            <LedgerFooterTextPill>({desktopPaginationMeta.beforeCount})</LedgerFooterTextPill>
            <Button type="button" variant="chromePill" size="icon" className="h-8 w-8 shrink-0"
              // Left side goes toward older pages.
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button type="button" variant="chromePill" size="icon" className="h-8 w-8 shrink-0"
              // Older side single step.
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <LedgerFooterChromePill className="px-1">

            <Select value={rowsPerPageSelectValue} onValueChange={handleRowsPerPageChange}>
              <SelectTrigger className="h-7 w-[64px] border-0 bg-transparent shadow-none focus:ring-0">
                <SelectValue placeholder={rowsPerPageSelectValue} />
              </SelectTrigger>
              <SelectContent side="top">
                {ROWS_PER_PAGE_OPTIONS_DEFAULT.map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
                <SelectItem value="0">All</SelectItem>
              </SelectContent>
            </Select>
            </LedgerFooterChromePill>
            <Button type="button" variant="chromePill" size="icon" className="h-8 w-8 shrink-0"
              // Right side goes toward newest pages.
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button type="button" variant="chromePill" size="icon" className="h-8 w-8 shrink-0"
              // Jump to newest end (page 1 in latest-first pagination).
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
            <LedgerFooterTextPill>({desktopPaginationMeta.afterCount})</LedgerFooterTextPill>
            {/* Footer count right-side short controls ke paas hi rahe. */}
            <LedgerFooterTextPill>Total Trxn {statusFilteredTransactions.length}</LedgerFooterTextPill>
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
