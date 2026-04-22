

"use client";

import * as React from "react";
import { toast } from "sonner";
import { openPrintDirect } from "@/lib/printDirect";
import type { Party, Group } from "@/components/party/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
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
  Wand2,
  Calendar as CalendarIcon,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  FilePlus,
  FileText,
  Search,
  Filter,
  XCircle,
  ArrowLeft,
  MoreVertical,
  Phone,
  MessageSquare,
  Gift,
  FileDigit,
  Columns3,
  ChevronDown,
} from "lucide-react";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { DateRange } from "@/components/ui/ad-calendar";
import { addDays, format, startOfDay, endOfDay, isSameDay } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import AdCalendar from "@/components/ui/ad-calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDate } from "@/hooks/useDate";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { CreateNoteForm } from "@/components/vouchers/CreateNoteForm";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useRowsPerPage } from "@/hooks/useRowsPerPage";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { EditPartyDialog } from "@/components/party/EditPartyDialog";
import { useVouchers } from "@/hooks/useVouchers";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { doc, getDoc, updateDoc, query, collection, getDocs, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";
import { HistoryDialog } from "@/components/vouchers/HistoryDialog";
import { LinkAdvancesToVoucherDialog } from "@/components/vouchers/LinkAdvancesToVoucherDialog";
import { EntityAlarmPopup } from "@/components/messages/EntityAlarmPopup";
import { LinkPaymentToTxnsDialog } from "@/components/vouchers/LinkPaymentToTxnsDialog";
import { TransactionsTable, type Context, type VisibleColumns, type TransactionColumnKey } from "@/components/vouchers/TransactionsTable";
import { TransactionTableSortDropdown, type TransactionSortBy, type TransactionSortOrder } from "@/components/vouchers/TransactionTableSortDropdown";
import { useShowNotes } from "@/components/vouchers/transactionColumnVisibility";
import {
  sortTransactionsWithFiscalMergeForCompany,
  recomputeRunningBalanceTopToBottom,
  DEFAULT_TRANSACTION_SORT_ORDER,
} from "@/lib/transactionSort";
import { getTransactionQuickSearchHaystack } from "@/components/vouchers/transactionTableShared";
import { useTransactions } from "@/hooks/use-transactions";
import { useIsMobile, useCalendarMonths } from "@/hooks/use-mobile";
import NepaliCalendar from "../ui/nepali-calendar";
import { DateRangePresetRow } from "@/components/ui/DateRangePresetRow";
import type { BSDate } from "@/lib/bs-date";
import { Combobox } from "@/components/ui/combobox";
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
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import { NotificationBell } from "../vouchers/NotificationBell";
import { useBalanceMode } from "@/hooks/useBalanceMode";
import { useUrlModalBack } from "@/contexts/DialogBackHandlerContext";
import { getLocalAuthUser } from "@/lib/localApiClient";
import { MobileTransactionsPager } from "@/components/vouchers/MobileTransactionsPager";
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
    // Notes have no payment status; always show them regardless of status filter
    if (t.type === "note") return true;
    // Journal/Contra are non-bill-wise rows; keep visible in party ledger regardless of payment-status filter.
    if (t.type === "journal" || t.type === "contra") return true;
    if (statusFilter.paid && t.paymentStatus === "paid") return true;
    if (statusFilter.unpaid && t.paymentStatus === "unpaid") return true;
    if (statusFilter.partial && t.paymentStatus === "partially_paid") return true;
    if (statusFilter.overdue && t.isOverdue) return true;
    return false;
  });
}

export function PartyDetails({
  party: initialParty,
  allParties,
  transactions: passedTransactions,
  onPartyUpdated,
  onPartyDeleted,
  onShowAll,
  dateRange,
  onDateRangeChange,
  isAllVouchersView,
  journalAccountNames,
  userNames,
  onBack,
  context,
  /** Jab PartyDetails kisi report ke andar ho: dropdown se party badle bina `/party` par na jao */
  onEmbeddedPartyChange,
}: {
  party: Party & { saleTotal?: number; purchaseTotal?: number };
  allParties?: Party[];
  transactions?: any[];
  onPartyUpdated: () => void;
  onPartyDeleted: (deletedId: string) => void;
  onShowAll?: () => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (dateRange: DateRange | undefined) => void;
  isAllVouchersView?: boolean;
  journalAccountNames?: Record<string, string>;
  userNames?: Record<string, string>;
  onBack?: () => void;
  context?: string;
  onEmbeddedPartyChange?: (partyId: string) => void;
}) {
  const { company, companyId } = useCompany();
  const { balanceMode, setBalanceMode } = useBalanceMode();
  const { dateSystem, formatDate, formatDateBS, formatCurrency, formatCurrencyForPrint } =
    useDate();
  const { vouchers, processedParties, journalAccountNames: voucherJournalAccountNames } = useVouchers();
  const resolvedJournalAccountNames = journalAccountNames ?? voucherJournalAccountNames;
  const isMobile = useIsMobile();
  const calendarMonths = useCalendarMonths();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isDateChange, setIsDateChange] = useState(false);

  const party = useMemo(() => {
    if (!processedParties || !initialParty) return initialParty;
    return processedParties.find(p => p.id === initialParty.id) || initialParty;
  }, [processedParties, initialParty]);

  /** Mobile AddVoucher — inline `{ partyId }` har render = naya object → dialog `initialVoucherData` + sale form date reset; stable deps */
  const addVoucherDefaultPartyOnly = useMemo(() => ({ partyId: party.id }), [party.id]);

  const transactionDates = useMemo(() => {
    const dates = new Set<number>();
    vouchers.forEach((v) => {
      if (v.partyId === party.id || (v.entries && v.entries.some((e: any) => e.accountId === party.id))) {
          const dateValue = v.date?.toDate ? v.date.toDate() : new Date(v.date);
          if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
              dates.add(startOfDay(dateValue).getTime());
          }
      }
    });
    return Array.from(dates).map((d) => new Date(d));
  }, [vouchers, party.id]);

  const [rowsPerPage, setRowsPerPage] = useRowsPerPage(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
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
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [isVoucherDialogOpen, setIsVoucherDialogOpen] = useState(false);
  const [historyVoucher, setHistoryVoucher] = useState<any>(null);
  const [linkAdvancesVoucher, setLinkAdvancesVoucher] = useState<any>(null);
  const [linkPaymentVoucher, setLinkPaymentVoucher] = useState<any>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDesktopCalendarOpen, setIsDesktopCalendarOpen] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(dateRange);
  const [mobileSearchTerm, setMobileSearchTerm] = useState("");
  const [mobileFooterDialogOpen, setMobileFooterDialogOpen] = useState<null | "payment_in" | "payment_out" | "sale">(null);
  const openingModalRef = useRef(false);

  useEffect(() => {
    setTempDateRange(dateRange);
  }, [dateRange]);
  
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

  const handleShowNarrationChange = (checked: boolean) => {
    setShowNarration(checked);
    sessionStorage.setItem("showNarration", String(checked));
  };

  const handleColumnVisibilityChange = (key: TransactionColumnKey, checked: boolean) => {
    const next = { ...visibleColumns, [key]: checked };
    setVisibleColumns(next);
    sessionStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(next));
  };

  const { showNotes, setShowNotes, includeNotesInTable, notesPreferenceLockedOnMobile } = useShowNotes();

  const handleStatusFilterChange = (key: keyof StatusFilter, checked: boolean) => {
    const next = { ...statusFilter, [key]: checked };
    setStatusFilter(next);
    sessionStorage.setItem(STATUS_FILTER_KEY, JSON.stringify(next));
    setCurrentPage(1);
  };
  
  // Maintain local userNames state that merges with prop
  const [localFetchedUserNames, setLocalFetchedUserNames] = useState<Record<string, string>>({});
  const { user, customUser } = useAuth();
  const isLocalMode = isLocalOnlyMode();

  // Always seed current user's display name so own transactions never fall back to raw UID.
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

  const mobileSearchNames = useMemo(
    () => ({ ...resolvedJournalAccountNames, ...mergedUserNames }),
    [resolvedJournalAccountNames, mergedUserNames]
  );
  
  const { processedTransactions, openingBalanceForPeriod, periodDr, periodCr, closingBalance, openingBalanceOutstanding, openingBalanceLinkedVoucherNos } = useTransactions(party, "party", dateRange, undefined, allParties, passedTransactions, context, filters, undefined, resolvedJournalAccountNames, mergedUserNames);
  
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
          console.error('[PartyDetails] Error fetching userName for', uid, e);
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

  const handleEditVoucher = (voucher: any) => {
    openingModalRef.current = true;
    setSelectedVoucher(voucher);
    openModalInUrl();
    setIsVoucherDialogOpen(true);
  };

  const handleHistoryVoucher = (voucher: any) => {
    openingModalRef.current = true;
    openModalInUrl();
    setHistoryVoucher(voucher);
  };

  const handleDeleteVoucher = (voucher: any) => {
    openingModalRef.current = true;
    setSelectedVoucher(voucher);
    openModalInUrl();
    setIsVoucherDialogOpen(true);
  };

  const handleAddLink = (voucher: any) => {
    openingModalRef.current = true;
    openModalInUrl();
    const isPaymentType = ["payment_in", "payment_out", "direct_income", "direct_expense"].includes(voucher?.type);
    if (isPaymentType) {
      setLinkPaymentVoucher(voucher);
    } else {
      setLinkAdvancesVoucher(voucher);
    }
  };

  const isFilterActive =
    dateRange !== undefined || Object.values(filters).some((v) => v);

  const clearFilters = () => {
    onDateRangeChange(undefined);
    setFilters({});
  };
  
  // PC: preference; mobile: hamesha notes (includeNotesInTable)
  const displayTransactions = useMemo(
    () => (includeNotesInTable ? processedTransactions : processedTransactions.filter((t: any) => t.type !== "note")),
    [processedTransactions, includeNotesInTable]
  );
  const statusFilteredTransactions = useMemo(
    () => filterByStatus(displayTransactions, statusFilter),
    [displayTransactions, statusFilter]
  );

  // Sort state for footer dropdown (Statement / Bill wise); applied after status filter, before search/pagination
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

  const searchFilteredTransactions = useMemo(() => {
    if (!mobileSearchTerm.trim()) return sortedTransactions;
    const q = mobileSearchTerm.toLowerCase().trim();
    return sortedTransactions.filter((t) => {
      const d = t.date?.toDate ? t.date.toDate() : t.date ? new Date(t.date) : null;
      const dateStr = d ? (dateSystem === "BS" ? formatDateBS(d) : format(d, "yyyy-MM-dd")) : "";
      const timeStr = d ? format(d, "h:mm a") : "";
      const amt = t.debit > 0 ? t.debit : t.credit;
      const bal = t.balance ?? t.runningBalance ?? 0;
      const userStr = (userNames && t.userId && userNames[t.userId]) || "";
      return (
        getTransactionQuickSearchHaystack(t, mobileSearchNames, "party", party.id).includes(q) ||
        dateStr.toLowerCase().includes(q) ||
        timeStr.toLowerCase().includes(q) ||
        String(amt || 0).toLowerCase().includes(q) ||
        String(t.debit || 0).toLowerCase().includes(q) ||
        String(t.credit || 0).toLowerCase().includes(q) ||
        String(bal).toLowerCase().includes(q) ||
        userStr.toLowerCase().includes(q)
      );
    });
  }, [sortedTransactions, mobileSearchTerm, dateSystem, formatDateBS, format, userNames, mobileSearchNames, party.id]);

  const totalPages = rowsPerPage > 0 ? Math.ceil(searchFilteredTransactions.length / rowsPerPage) : 1;
  const paginatedTransactions = rowsPerPage > 0 ? searchFilteredTransactions.slice(
      (currentPage - 1) * rowsPerPage,
      currentPage * rowsPerPage
  ) : searchFilteredTransactions;

  const mobileTransactions = useMemo(() => {
    if (rowsPerPage <= 0) return searchFilteredTransactions;
    const total = searchFilteredTransactions.length;
    const totalPagesLocal = Math.max(1, Math.ceil(total / rowsPerPage));
    const safePage = Math.min(Math.max(1, currentPage), totalPagesLocal);
    const end = total - (safePage - 1) * rowsPerPage;
    const start = Math.max(0, end - rowsPerPage);
    return searchFilteredTransactions.slice(start, Math.max(start, end));
  }, [searchFilteredTransactions, currentPage, rowsPerPage]);

  /** Mobile pager: slice [start,end) — left = purane (low index), right = naye (high index) count. */
  const mobilePagerEdgeCounts = useMemo(() => {
    const total = searchFilteredTransactions.length;
    if (rowsPerPage <= 0) return { before: 0, after: 0 };
    const totalPagesLocal = Math.max(1, Math.ceil(total / rowsPerPage));
    const safePage = Math.min(Math.max(1, currentPage), totalPagesLocal);
    const end = total - (safePage - 1) * rowsPerPage;
    const start = Math.max(0, end - rowsPerPage);
    return { before: start, after: total - end };
  }, [searchFilteredTransactions.length, currentPage, rowsPerPage]);

  // Party dropdown: hide Owners Capital and Opening Balance (keep current party so selection shows)
  const partyDropdownOptions = useMemo(() => {
    const normalized = (name: string) =>
      (name || "").trim().toLowerCase().replace(/'/g, "");
    const excludeNames = ["owners capital", "opening balance"];
    return (allParties || []).filter((p) => {
      if (p.id === party?.id) return true;
      const n = normalized(p.name || "");
      return !excludeNames.includes(n) && !(n.includes("owner") && n.includes("capital"));
    }).map((p) => ({ value: p.id, label: p.name }));
  }, [allParties, party?.id]);

  // Keep page in valid range when list size/page-size changes.
  useEffect(() => {
    const total = rowsPerPage > 0 ? Math.ceil(searchFilteredTransactions.length / rowsPerPage) : 1;
    const safeTotal = Math.max(1, total);
    setCurrentPage((prev) => Math.min(Math.max(1, prev), safeTotal));
  }, [dateRange, searchFilteredTransactions.length, rowsPerPage]);

  const buildDateRangeText = () => {
    if (!company) return;
    const from = dateRange?.from;
    const to = dateRange?.to;
    let dateRangeText = "All Time";
    if(from) {
        const fromBS = formatDateBS(from);
        const toBS = to ? formatDateBS(to) : fromBS;
        const fromAD = formatDate(from);
        const toAD = to ? formatDate(to) : fromAD;
        
        if (dateSystem === 'AD') dateRangeText = `AD: ${fromAD} to ${toAD}`;
        else if (dateSystem === 'BS') dateRangeText = `BS: ${fromBS} to ${toBS}`;
        else dateRangeText = `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
    }
    return dateRangeText;
  };

  const getPrintTitle = (variant: "statement" | "bill_wise") => {
    let title = `Party Statement: ${party.name}`;
    if (context === 'sale') {
      title = `Sale Statement / ${party.name}`;
    } else if (context === 'purchase') {
      title = `Purchase Statement / ${party.name}`;
    } else if (context === 'payment-in') {
      title = `Receipt Statement / ${party.name}`;
    } else if (context === 'payment-out') {
      title = `Payment Statement / ${party.name}`;
    }
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
      context: "party",
      contextId: party.id,
      dateSystem: dateSystem,
      dateRangeText: dateRangeText || "All Time",
      vouchersCount: transactionsToPrint.length,
      openingBalance: openingBalanceForPeriod,
      openingBalanceDate: (party as any).openingBalanceDate,
      openingBalanceNarration: party.openingBalanceNarration ?? null,
      transactions: transactionsToPrint.map((t: any) => ({ ...t, dueDate: t.dueDate ?? t.due_date })),
      showNarration: showNarration,
      includeNotes: showNotes,
      visibleColumns: printVisibleColumns,
      userNames: mergedUserNames,
      journalAccountNames: resolvedJournalAccountNames,
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
  
  if(!party) return null;

  const dateRangeLabel = buildDateRangeText() || "All Time";
  const balanceLabel = closingBalance >= 0 ? "To Receive" : "To Pay";

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

  if (isMobile) {
    return (
      <>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full">
          {/* Mobile: no pb-24 here so scroll area extends to footer; inner pb-24 so last row clears fixed footer */}
          {/* Master-detail flow: title "Party details" master header me; yahan sirf direct /party/[id] pe back + context. */}
          {onBack ? (
            <div className="flex flex-shrink-0 items-center gap-1.5 border-b px-2 py-1">
              <Button variant="ghost" size="icon" onClick={handleMobileBack} className="h-7 w-7 flex-shrink-0" aria-label="Back">
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
              <h1 className="shrink-0 text-base font-bold text-muted-foreground">Party details</h1>
              <span className="min-w-0 flex-1 truncate text-sm font-medium" title={party.name}>
                {party.name}
              </span>
            </div>
          ) : null}
          {/* Row 2 (center): Date range - compact; no filter = "Last 10 Txns", else date range; cross to reset when filter is on */}
          <div className="px-2 py-1 border-b flex justify-center items-center gap-1.5 flex-shrink-0">
            <span className="text-xs font-medium text-muted-foreground">{!dateRange || (dateRange.from == null && dateRange.to == null) ? "All Time" : dateRangeLabel}</span>
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
          {/* Selected party balance (closing) */}
          <div className="px-3 py-3 border-b flex-shrink-0">
            <p className={cn("text-2xl font-bold text-center", closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
              {balanceLabel} {formatCurrency(Math.abs(closingBalance), { noSuffix: true })}
            </p>
          </div>
          {/* Dropdown + Edit icon + Search - same size (equal width & height) */}
          <div className="p-2 border-b flex-shrink-0">
            <div className="flex items-stretch gap-2">
              {allParties && allParties.length > 0 && (
                <div className="flex-1 min-w-0 h-9 [&_button]:h-9">
                  <Combobox
                    options={partyDropdownOptions}
                    value={party.id}
                    onChange={(value) => {
                      if (!value || value === party.id) return;
                      // Report-embedded list: parent hi party state rakhta hai (Anusuchi 13 filtered subset)
                      if (onEmbeddedPartyChange) onEmbeddedPartyChange(value);
                      else router.push(`/party?selected=${value}`);
                    }}
                    placeholder="Select party"
                  />
                </div>
              )}
              {party.id !== "all" && !(party as any).isSystemAccount && (
                <EditPartyDialog
                  party={party}
                  onPartyUpdated={onPartyUpdated}
                  onPartyDeleted={() => onPartyDeleted(party.id)}
                  hasTransactions={processedTransactions.length > 0}
                >
                  <Button variant="outline" size="icon" className="h-9 w-8 flex-shrink-0">
                    <Edit className="h-4 w-4" />
                  </Button>
                </EditPartyDialog>
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
          {/* Transaction list - extends to footer line; scroll-touch + inline style for APK/WebView touch scroll */}
          <div
            className="flex-1 min-h-0 overflow-auto scroll-touch"
            style={{ overflowY: "scroll", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
          >
            <div className="pb-2">
            {/* Unapproved (`isApproved` !== true): pink row tint — TransactionsTable default highlightPendingApproval */}
            <TransactionsTable
              transactions={mobileTransactions}
              context="party"
              contextId={party.id}
              openingBalance={openingBalanceForPeriod}
              openingBalanceOutstanding={openingBalanceOutstanding}
              openingBalanceLinkedVoucherNos={openingBalanceLinkedVoucherNos}
              openingBalanceNarration={party.openingBalanceNarration}
              openingBalanceAttachmentUrls={party.documentFileUrls}
              openingBalanceDate={(party as any).openingBalanceDate}
              openingBalanceActions={undefined}
              showNarration={showNarration}
              visibleColumns={balanceMode === "bill_wise" ? { ...visibleColumns, status: true } : visibleColumns}
              journalAccountNames={resolvedJournalAccountNames}
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
              isAllVouchersView={isAllVouchersView}
              hideDebitColumn={false}
              hideCreditColumn={false}
              hideBalanceColumn={false}
              isDateChange={isDateChange}
              scrollOnlyTransactions
              statusFilter={statusFilter}
              statusFilterAllChecked={statusFilterAllChecked}
              onStatusFilterAll={handleStatusFilterAll}
              onStatusFilterChange={handleStatusFilterChange}
              statusFilterIdPrefix="party"
            />
            </div>
          </div>
          <MobileTransactionsPager
            className="flex-shrink-0 mb-12"
            currentPage={currentPage}
            totalItems={searchFilteredTransactions.length}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(nextRows) => {
              setRowsPerPage(nextRows);
              setCurrentPage(1);
            }}
            onPageChange={setCurrentPage}
            edgeCounts={rowsPerPage > 0 ? mobilePagerEdgeCounts : undefined}
          />
        </div>
        {/* Fixed bottom: Bill wise/Statement, Receive, Pay, New Sale, Calendar - open popups */}
        <div className="fixed bottom-0 left-0 right-0 p-1.5 border-t bg-background/95 backdrop-blur z-50 flex items-center justify-around gap-1.5">
          <Button
            type="button"
            className={cn("flex-1 h-6 rounded-md text-xs font-medium shrink-0 min-w-0", balanceMode === "bill_wise" ? "bg-orange-600 hover:bg-orange-700 text-white border-0" : "bg-violet-600 hover:bg-violet-700 text-white border-0")}
            onClick={() => setBalanceMode(balanceMode === "bill_wise" ? "statement" : "bill_wise")}
            data-theme-btn={balanceMode === "bill_wise" ? "statement" : "bill-wise"}
          >
            {balanceMode === "bill_wise" ? "Statement" : "Bill wise"}
          </Button>
          <Button className="flex-1 h-6 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-medium" onClick={() => { openingModalRef.current = true; setMobileFooterDialogOpen("payment_in"); openModalInUrl(); }}>
            Receive
          </Button>
          <Button className="flex-1 h-6 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium" onClick={() => { openingModalRef.current = true; setMobileFooterDialogOpen("payment_out"); openModalInUrl(); }}>
            Pay
          </Button>
          <Button className="flex-1 h-6 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium" onClick={() => { openingModalRef.current = true; setMobileFooterDialogOpen("sale"); openModalInUrl(); }}>
            New Sale
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
            defaultVoucherData={addVoucherDefaultPartyOnly}
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
                    onSelect={(_bs, adDate) => {
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
        <Dialog
          open={isNoteOpen}
          onOpenChange={(open: boolean) => {
            setIsNoteOpen(open);
            if (!open) closeModalInUrl();
          }}
        >
          <DialogContent className="h-[95vh] w-full max-w-3xl flex flex-col">
            <DialogHeader>
              <DialogTitle>Add a New Note for {party.name}</DialogTitle>
              <DialogDescription>Record a new note associated with this party.</DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0">
              <CreateNoteForm
                onVoucherAction={() => { onPartyUpdated(); setIsNoteOpen(false); }}
                initialContext="Party"
                initialEntityId={party.id}
                compactFooter
              />
            </div>
          </DialogContent>
        </Dialog>
        <AddVoucherDialog
          isOpen={isVoucherDialogOpen}
          onOpenChange={(open: boolean) => {
            if (!open) {
              setIsVoucherDialogOpen(false);
              setSelectedVoucher(null);
              closeModalInUrl();
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
            targetPartyId={linkAdvancesVoucher.partyId ?? party?.id ?? ""}
            targetPartyName={allParties?.find((p) => p.id === (linkAdvancesVoucher.partyId ?? party?.id))?.name ?? party?.name ?? "Party"}
            partyOpeningBalance={allParties?.find((p) => p.id === (linkAdvancesVoucher.partyId ?? party?.id))?.openingBalance ?? party?.openingBalance ?? 0}
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

  return (
    <>
      {party?.id && <EntityAlarmPopup context="Party" entityId={party.id} />}
      <div className="h-full min-h-full flex flex-col overflow-hidden">
        {/* Header: Part 1 (name→balance) and Part 2 (date→print) side by side; Part 2 wraps to bottom on small; parts never wrap internally; scroll if needed */}
        <div className="border-b p-3 overflow-auto min-h-0 scrollbar-slim-dim">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
            {/* Part 1: account name through balance — single line, no wrap */}
            <div className="flex items-center gap-2 sm:gap-4 flex-nowrap min-w-0 overflow-x-auto scrollbar-slim-dim">
              {isMobile && onBack && (
                <Button variant="ghost" size="icon" onClick={onBack} className="flex-shrink-0">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              )}
              <EntityFileAttachmentHover fileUrl={party.fileUrl} triggerClassName="inline-flex shrink-0 rounded-full">
                {(party as any).isSystemAccount ? (
                  <Avatar className="h-12 w-12 text-lg flex-shrink-0">
                    <AvatarImage src={party.fileUrl} alt={party.name} />
                    <AvatarFallback className="bg-muted text-muted-foreground">
                      <FileDigit className="h-6 w-6" />
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <ResolvedEntityAvatar
                    className="h-12 w-12 text-lg flex-shrink-0"
                    src={party.fileUrl}
                    alt={party.name}
                    fallbackText={getInitials(party.name)}
                  />
                )}
              </EntityFileAttachmentHover>
              <div className="flex items-center gap-2 flex-nowrap min-w-0">
                <h2 className="text-xl font-semibold truncate">{party.name}</h2>
                {party.id !== 'all' && !(party as any).isSystemAccount && (
                  <EditPartyDialog
                    party={party}
                    onPartyUpdated={onPartyUpdated}
                    onPartyDeleted={() => onPartyDeleted(party.id)}
                    hasTransactions={processedTransactions.length > 0}
                  >
                    <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0" data-theme-detail="edit">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </EditPartyDialog>
                )}
                <div className={cn("text-lg font-bold whitespace-nowrap flex-shrink-0", closingBalance >= 0 ? "text-green-600" : "text-red-600")}>
                  {formatCurrency(closingBalance, { showDrCr: true })}
                </div>
              </div>
            </div>
            {/* Part 2: date range, Add Note, print — single line, no wrap; on small screens this row is below */}
            <div className="flex items-center gap-2 justify-end flex-nowrap overflow-x-auto scrollbar-slim-dim flex-shrink-0">
              {(dateSystem === 'BS' || dateSystem === 'Both') && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <BsDatePicker
                    isRange
                    valueAD={dateRange}
                    onChangeAD={(range) => onDateRangeChange(range as DateRange | undefined)}
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
              {(dateSystem === 'AD' || dateSystem === 'Both') && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Popover open={isDesktopCalendarOpen} onOpenChange={setIsDesktopCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="date"
                        variant={"outline"}
                        className={cn("justify-start text-left font-normal h-10 px-2 w-auto", !dateRange && "text-muted-foreground")}
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
                  {dateRange != null && (dateRange.from != null || dateRange.to != null) && (
                    <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => onDateRangeChange(undefined)} aria-label="Clear date filter">
                      <XCircle className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
              {isFilterActive && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-10 flex-shrink-0">
                  <XCircle className="mr-2 h-4 w-4"/>Clear Filters
                </Button>
              )}
              <NotificationBell context="Party" entityId={party.id} />
              <Button
                variant="outline"
                size="sm"
                className={cn("flex-shrink-0 h-10", balanceMode === "bill_wise" ? "bg-orange-600 hover:bg-orange-700 text-white border-0" : "")}
                onClick={() => setBalanceMode(balanceMode === "bill_wise" ? "statement" : "bill_wise")}
                data-theme-btn={balanceMode === "bill_wise" ? "statement" : "bill-wise"}
              >
                {balanceMode === "bill_wise" ? "Statement" : "Bill wise"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsNoteOpen(true)}
                className="flex-shrink-0 h-10"
                data-theme-detail="add-note"
              >
                <FilePlus className="mr-2 h-4 w-4" />
                Add Note
              </Button>
              {onShowAll && (
                <Button variant="outline" size="sm" onClick={onShowAll} className="flex-shrink-0 h-10">
                  All Vouchers
                </Button>
              )}
              <Button variant="outline" size="icon" className="h-10 w-10 flex-shrink-0" onClick={handlePrint} data-theme-detail="print">
                <Printer className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        {/* Party docs sirf table Opening row File column + Edit party dialog — yahan duplicate thumbnail strip nahi */}
        <div className={cn("flex-1 flex flex-col min-h-0", balanceMode === "bill_wise" ? "min-w-0" : "overflow-x-auto scrollbar-slim-dim")}>
          <div className="py-4 flex-1 flex flex-col min-h-0 min-w-0">
            <TransactionsTable
              transactions={paginatedTransactions}
              context="party"
              contextId={party.id}
              openingBalance={openingBalanceForPeriod}
              openingBalanceOutstanding={openingBalanceOutstanding}
              openingBalanceLinkedVoucherNos={openingBalanceLinkedVoucherNos}
              openingBalanceNarration={party.openingBalanceNarration}
              openingBalanceAttachmentUrls={party.documentFileUrls}
              openingBalanceDate={(party as any).openingBalanceDate}
              openingBalanceActions={
                party.id !== "all" && !(party as any).isSystemAccount ? (
                  <EditPartyDialog
                    party={party}
                    onPartyUpdated={onPartyUpdated}
                    onPartyDeleted={() => onPartyDeleted(party.id)}
                    hasTransactions={processedTransactions.length > 0}
                  >
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreVertical className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </EditPartyDialog>
                ) : null
              }
              showNarration={showNarration}
              visibleColumns={balanceMode === "bill_wise" ? { ...visibleColumns, status: true } : visibleColumns}
              journalAccountNames={resolvedJournalAccountNames}
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
              isAllVouchersView={isAllVouchersView}
              hideDebitColumn={false}
              hideCreditColumn={false}
              hideBalanceColumn={false}
              isDateChange={isDateChange}
              scrollOnlyTransactions
              statusFilter={statusFilter}
              statusFilterAllChecked={statusFilterAllChecked}
              onStatusFilterAll={handleStatusFilterAll}
              onStatusFilterChange={handleStatusFilterChange}
              statusFilterIdPrefix="party"
            />
          </div>
        </div>
        {/* Footer: fixed at bottom of details pane (screen anusar) */}
        <div className="py-2 px-4 border-t overflow-auto min-h-0 scrollbar-slim-dim flex-shrink-0 mt-auto bg-background">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-2 min-w-max">
            <div className="flex items-center gap-2 sm:gap-4 flex-nowrap min-w-0 overflow-x-auto scrollbar-slim-dim text-sm text-muted-foreground">
              <span className="whitespace-nowrap flex-shrink-0">{statusFilteredTransactions.length} transaction(s).</span>
              <div className="flex items-center space-x-2 flex-shrink-0">
                <Checkbox id="show-narration-party" checked={showNarration} onCheckedChange={(checked: boolean) => handleShowNarrationChange(Boolean(checked))} />
                <label htmlFor="show-narration-party" className="text-sm font-medium leading-none whitespace-nowrap">Show Narration</label>
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
                          id={`col-${key}-party`}
                          checked={isStatusInStatement ? false : (isStatusInBillWise ? true : visibleColumns[key] !== false)}
                          disabled={isStatusLocked}
                          onCheckedChange={isStatusLocked ? undefined : (c) => handleColumnVisibilityChange(key, Boolean(c))}
                        />
                        <label htmlFor={`col-${key}-party`} className={cn("text-sm font-medium flex-1", isStatusLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
                          {COLUMN_LABELS[key]}
                        </label>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Checkbox id="show-notes-party" checked={includeNotesInTable} disabled={notesPreferenceLockedOnMobile} onCheckedChange={(c) => setShowNotes(Boolean(c))} />
                <label htmlFor="show-notes-party" className="text-sm font-medium leading-none whitespace-nowrap cursor-pointer">Note</label>
              </div>
            </div>
            <div className="flex items-center gap-2 justify-end flex-nowrap overflow-x-auto scrollbar-slim-dim flex-shrink-0">
              <TransactionTableSortDropdown
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSortChange={(by, order) => {
                  setSortBy(by);
                  setSortOrder(order);
                }}
                viewMode={balanceMode === "bill_wise" ? "bill_wise" : "statement"}
              />
              <p className="text-sm font-medium flex-shrink-0">Rows per page</p>
              <Select
                value={`${rowsPerPage}`}
                onValueChange={(value) => {
                  setRowsPerPage(Number(value) || 0);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue placeholder={`${rowsPerPage}`} />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 30, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>{pageSize}</SelectItem>
                  ))}
                  <SelectItem value="0">All</SelectItem>
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
      <Dialog open={isNoteOpen} onOpenChange={setIsNoteOpen}>
        <DialogContent className="h-[95vh] w-full max-w-3xl flex flex-col">
          <DialogHeader>
            <DialogTitle>Add a New Note for {party.name}</DialogTitle>
            <DialogDescription>
              Record a new note associated with this party.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <CreateNoteForm
              onVoucherAction={() => {
                onPartyUpdated();
                setIsNoteOpen(false);
              }}
              initialContext="Party"
              initialEntityId={party.id}
              compactFooter
            />
          </div>
        </DialogContent>
      </Dialog>
      <AddVoucherDialog
        isOpen={isVoucherDialogOpen}
        onOpenChange={(open) => {
          setIsVoucherDialogOpen(open);
          if (!open) {
            setSelectedVoucher(null);
            if (isMobile) closeModalInUrl();
          }
        }}
        voucher={selectedVoucher}
        onVoucherAction={() => setSelectedVoucher(null)}
      />
      <HistoryDialog voucher={historyVoucher} isOpen={!!historyVoucher} onOpenChange={(open) => !open && setHistoryVoucher(null)} onHistoryReset={() => setHistoryVoucher((prev: any) => prev ? { ...prev, history: [] } : null)} />
      {linkAdvancesVoucher && (
        <LinkAdvancesToVoucherDialog
          isOpen={!!linkAdvancesVoucher}
          onOpenChange={(open: boolean) => !open && setLinkAdvancesVoucher(null)}
          mode={linkAdvancesVoucher.type === "purchase" || linkAdvancesVoucher.type === "purchase_service" ? "purchase" : "sale"}
          targetVoucherId={linkAdvancesVoucher.id}
          targetPartyId={linkAdvancesVoucher.partyId ?? party?.id ?? ""}
          targetPartyName={allParties?.find((p) => p.id === (linkAdvancesVoucher.partyId ?? party?.id))?.name ?? party?.name ?? "Party"}
          partyOpeningBalance={allParties?.find((p) => p.id === (linkAdvancesVoucher.partyId ?? party?.id))?.openingBalance ?? party?.openingBalance ?? 0}
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

    

