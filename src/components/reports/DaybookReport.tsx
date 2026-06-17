

"use client";

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { useCompany } from "@/hooks/useCompany";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Info, X, Calendar as CalendarIcon, Expand, Filter, RotateCw, ChevronLeft, ChevronRight, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import type { Account } from "@/components/bank-cash/types";
import type { Item } from "@/components/items/types";
import type { DateRange } from "@/components/ui/ad-calendar";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { startOfDay, isSameDay, addDays } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import AdCalendar from "@/components/ui/ad-calendar";
import { useDate } from "@/hooks/useDate";
import { useCalendarMonths } from "@/hooks/use-mobile";
import usePermissions from "@/hooks/usePermissions";
import { Checkbox } from "@/components/ui/checkbox";
import { ItemFilterDropdown } from "../items/ItemFilterDropdown";
import { collection, onSnapshot, query, getDoc, doc, updateDoc, getDocs, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { AddVoucherDialog } from "../vouchers/AddVoucherDialog";
import { HistoryDialog } from "../vouchers/HistoryDialog";
import { LinkAdvancesToVoucherDialog } from "../vouchers/LinkAdvancesToVoucherDialog";
import { LinkPaymentToTxnsDialog } from "../vouchers/LinkPaymentToTxnsDialog";
import { VoucherTypeFilter } from "../vouchers/VoucherTypeFilter";
import { Badge } from "@/components/ui/badge";
import { Input } from "../ui/input";
import { TransactionsTable } from "../vouchers/TransactionsTable";
import { NarrationNoteSearchInput } from "../vouchers/NarrationNoteSearchInput";
import { useVouchers } from "@/hooks/useVouchers";
import { Skeleton } from "../ui/skeleton";
import { useTransactions } from "@/hooks/use-transactions";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

type Voucher = {
    id: string;
    type: string;
    total?: number;
    amount?: number;
    partyId?: string;
    accountId?: string;
    fromAccountId?: string;
    toAccountId?: string;
    staffId?: string;
    date: any;
    voucherNumber?: string;
    invoiceNumber?: string;
    narration?: string;
    title?: string;
    entries?: any[];
    lineItems?: any[];
    userId?: string;
};

// 💡 Utility to compute debit, credit, and balance impact
function getTransactionAmounts(transaction: any) {
    const t = transaction;
    const amount = t.total || t.amount || 0;
    let debit = 0;
    let credit = 0;
  
    switch (t.type) {
      case "sale":
      case "direct_income":
      case "payment_in":
        credit = amount;
        break;
      case "purchase":
      case "direct_expense":
      case "payment_out":
        debit = amount;
        break;
      case "contra":
        debit = amount;
        credit = amount;
        break;
      case "journal":
        if (t.entries && Array.isArray(t.entries)) {
          debit = t.entries.reduce((sum: number, e: any) => sum + (Number(e.debit) || 0), 0);
          credit = t.entries.reduce((sum: number, e: any) => sum + (Number(e.credit) || 0), 0);
        }
        break;
    }
  
    return { debit, credit };
  }

interface DaybookReportProps {
  onFullScreenToggle?: () => void;
}


export function DaybookReport({ onFullScreenToggle }: DaybookReportProps) {
    const { vouchers, processedAccounts: accounts, processedParties, userNames: vouchersUserNames } = useVouchers();
    const { company, companyId } = useCompany();
    const { dateSystem, formatDate, formatDateBS, formatCurrency } = useDate();
    const { can } = usePermissions();
    const router = useRouter();
    const [daybookDate, setDaybookDate] = useState<Date | undefined>(undefined);
    const [daybookRowsPerPage, setDaybookRowsPerPage] = useState('all');
    const [daybookVoucherTypes, setDaybookVoucherTypes] = useState<string[]>(['all']);
    const [showDaybookNarration, setShowDaybookNarration] = useState(true);
    const [daybookNarrationNoteSearch, setDaybookNarrationNoteSearch] = useState("");
    const [items, setItems] = useState<Item[]>([]);
    const [journalAccountNames, setJournalAccountNames] = useState<Record<string, string>>({});
    const [isVoucherDialogOpen, setIsVoucherDialogOpen] = React.useState(false);
    const [selectedVoucher, setSelectedVoucher] = React.useState<any>(null);
    const [historyVoucher, setHistoryVoucher] = React.useState<any>(null);
    const [linkAdvancesVoucher, setLinkAdvancesVoucher] = React.useState<any>(null);
    const [linkPaymentVoucher, setLinkPaymentVoucher] = React.useState<any>(null);
    const [daybookFilters, setDaybookFilters] = useState<Record<string, string>>({});
    const [activeDaybookFilter, setActiveDaybookFilter] = useState<string | null>(null);
    const [userNames, setUserNames] = React.useState<Record<string, string>>({});
    const [isDateChange, setIsDateChange] = useState(false);
    const [daybookRotated, setDaybookRotated] = useState(false);
    const [isDaybookCalendarOpen, setIsDaybookCalendarOpen] = useState(false);
    /** Daybook summary + table: null = sab users; warna sirf is Firebase uid ke vouchers */
    const [daybookUserFilter, setDaybookUserFilter] = useState<string | null>(null);
    const [daybookBankExpanded, setDaybookBankExpanded] = useState(false);
    const [daybookCashExpanded, setDaybookCashExpanded] = useState(false);
    /** Daily Summary bank/cash list filter — transaction table par effect nahi */
    const [daybookSummaryAccountSearch, setDaybookSummaryAccountSearch] = useState("");
    const isMobile = useIsMobile();
    const calendarMonths = useCalendarMonths();

    const handleEditVoucher = (voucher: any) => {
        setSelectedVoucher(voucher);
        setIsVoucherDialogOpen(true);
    };

    const handleHistoryVoucher = (voucher: any) => setHistoryVoucher(voucher);
    const handleAddLink = (voucher: any) => {
        const isPaymentType = ["payment_in", "payment_out", "direct_income", "direct_expense"].includes(voucher?.type);
        if (isPaymentType) setLinkPaymentVoucher(voucher);
        else setLinkAdvancesVoucher(voucher);
    };

    useEffect(() => {
      setDaybookDate(new Date());
    }, []);

    const fetchAccountName = useCallback(async (accountId: string): Promise<string> => {
        if (!companyId) return 'Unknown Account';
        
        // Check cache first
        if (journalAccountNames[accountId]) {
            return journalAccountNames[accountId];
        }

        const collectionsToSearch = ['parties', 'bank_accounts', 'staff', 'items', 'expense_accounts', 'taxes', 'users'];
        const nameFields = ['name', 'accountName', 'name', 'name', 'name', 'name', 'displayName'];

        for (let i = 0; i < collectionsToSearch.length; i++) {
            const collectionName = collectionsToSearch[i];
            const nameField = nameFields[i];
            try {
                let data: any = null;
                
                if (collectionName === 'users') {
                    // User doc ID may be name_uid format, so query by uid field first
                    const q = query(collection(firestore, "users"), where("uid", "==", accountId));
                    const snap = await getDocs(q);
                    data = snap.docs[0]?.data();
                    
                    if (!data) {
                        // Fallback: doc ID might be uid (legacy)
                        const docSnap = await getDoc(doc(firestore, "users", accountId));
                        if (docSnap.exists()) {
                            data = docSnap.data();
                        }
                    }
                } else {
                    const docRef = doc(firestore, `companies/${companyId}/${collectionName}`, accountId);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        data = docSnap.data();
                    }
                }
                
                if (data) {
                    const name = data[nameField] || 'Unknown';
                    // For users, store in userNames; for others, store in journalAccountNames
                    if (collectionName === 'users') {
                        setUserNames(prev => ({...prev, [accountId]: name}));
                    } else {
                        setJournalAccountNames(prev => ({...prev, [accountId]: name}));
                    }
                    return name;
                }
            } catch (error) {
            }
        }
        
        setJournalAccountNames(prev => ({...prev, [accountId]: 'Unknown Account'}));
        return 'Unknown Account';
    }, [companyId, journalAccountNames, userNames, setUserNames]);


    const loadJournalAccountNames = useCallback(async (vouchersToLoad: Voucher[]) => {
        const accountIdsToFetch = new Set<string>();
        vouchersToLoad.forEach(v => {
            // Note: linked party/account/staff/item ka naam resolve karne ke liye entityId bhi fetch karo
            const noteEntityId = (v as any).type === "note" ? (v as any).entityId : undefined;
            if (noteEntityId && !journalAccountNames[noteEntityId]) accountIdsToFetch.add(noteEntityId);
            if (v.type === 'journal' || v.type === 'contra' || v.type === 'payment_in' || v.type === 'payment_out' || v.type === 'direct_income' || v.type === 'direct_expense' || v.type === 'sale' || v.type === 'purchase') {
                (v.entries || []).forEach((entry: any) => {
                    if (entry.accountId && !journalAccountNames[entry.accountId]) accountIdsToFetch.add(entry.accountId);
                });
                if(v.fromAccountId && !journalAccountNames[v.fromAccountId]) accountIdsToFetch.add(v.fromAccountId);
                if(v.toAccountId && !journalAccountNames[v.toAccountId]) accountIdsToFetch.add(v.toAccountId);
                if(v.partyId && !journalAccountNames[v.partyId]) accountIdsToFetch.add(v.partyId);
                if(v.staffId && !journalAccountNames[v.staffId]) accountIdsToFetch.add(v.staffId);
                if(v.accountId && !journalAccountNames[v.accountId]) accountIdsToFetch.add(v.accountId);
                if((v as any).expenseAccountId && !journalAccountNames[(v as any).expenseAccountId]) accountIdsToFetch.add((v as any).expenseAccountId);
                if((v as any).incomeAccountId && !journalAccountNames[(v as any).incomeAccountId]) accountIdsToFetch.add((v as any).incomeAccountId);
                 if((v as any).userId && !userNames[(v as any).userId]) {
                    fetchAccountName((v as any).userId).then(name => setUserNames(prev => ({...prev, [(v as any).userId]: name})))
                }
            }
        });
        
        if (accountIdsToFetch.size > 0) {
            const newNames: Record<string, string> = {};
            for (const accountId of Array.from(accountIdsToFetch)) {
                newNames[accountId] = await fetchAccountName(accountId);
            }
            setJournalAccountNames(prev => ({...prev, ...newNames}));
        }
    }, [fetchAccountName, journalAccountNames, userNames]);


    useEffect(() => {
        if (vouchers.length > 0) {
            loadJournalAccountNames(vouchers as Voucher[]);
        }
    }, [vouchers, loadJournalAccountNames]);

    useEffect(() => {
        if (!companyId) return;
        const unsub = onSnapshot(query(collection(firestore, `companies/${companyId}/items`)), (snap) => {
            setItems(snap.docs.map(d => ({id: d.id, ...d.data()} as Item)))
        });
        return () => unsub();
    }, [companyId]);

    useEffect(() => {
        const savedState = sessionStorage.getItem("showNarration");
        setShowDaybookNarration(savedState !== "false");
    }, []);

    const handleShowNarrationChange = (checked: boolean) => {
        setShowDaybookNarration(checked);
        sessionStorage.setItem("showNarration", String(checked));
    };

    // PC: ek din shift — arrow buttons + keyboard (- / =); mobile par nahi
    const shiftDaybookDateBy = useCallback((deltaDays: number) => {
        setDaybookDate((prev) => startOfDay(addDays(prev ?? new Date(), deltaDays)));
    }, []);

    useEffect(() => {
        if (isMobile) return;
        const onKeyDown = (e: KeyboardEvent) => {
            const isMinus = e.key === "-" || e.code === "Minus" || e.code === "NumpadSubtract";
            const isEqual = e.key === "=" || e.code === "Equal";
            if (!isMinus && !isEqual) return;
            const el = e.target as HTMLElement | null;
            if (el?.closest("input, textarea, select, [contenteditable=true]")) return;
            if (el?.closest('[role="combobox"]')) return;
            if (el?.closest('[role="dialog"]')) return;
            e.preventDefault();
            shiftDaybookDateBy(isMinus ? -1 : 1);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isMobile, shiftDaybookDateBy]);
    
    const isDaybookFilterActive = useMemo(() => {
        const isTypeFiltered = daybookVoucherTypes.length > 0 && !daybookVoucherTypes.includes('all');
        const isDateFiltered = daybookDate !== undefined && !isSameDay(daybookDate, new Date());
        const isColumnFiltered = Object.values(daybookFilters).some(v => v);
        const isUserFiltered = !!daybookUserFilter;
        return isTypeFiltered || isDateFiltered || isColumnFiltered || isUserFiltered;
    }, [daybookVoucherTypes, daybookDate, daybookFilters, daybookUserFilter]);
    
    const clearDaybookFilters = () => {
        setDaybookDate(new Date());
        setDaybookVoucherTypes(['all']);
        setDaybookFilters({});
        setDaybookUserFilter(null);
    };
    
    const handleDaybookFilterChange = (key: string, value: string) => {
        setDaybookFilters(prev => ({...prev, [key]: value}));
    }

    const transactionDates = useMemo(() => {
      const dates = new Set<number>();
      vouchers.forEach(v => {
          const dateValue = v.date?.toDate ? v.date.toDate() : new Date(v.date);
          if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
              dates.add(startOfDay(dateValue).getTime());
          }
      });
      return Array.from(dates).map(d => new Date(d));
    }, [vouchers]);

    // User filter: sirf company owner + sharedWith — reconciliation / voucher ke extra userId mat dikhao
    const { daybookUserFilterIds, daybookUserLabelHints } = useMemo(() => {
        const idSet = new Set<string>();
        const labelHints: Record<string, string> = {};
        if (company?.ownerId) {
            const oid = String(company.ownerId);
            idSet.add(oid);
            labelHints[oid] = (company.ownerEmail && String(company.ownerEmail).trim()) || "Owner";
        }
        (company?.sharedWith || []).forEach((u: any) => {
            if (!u?.uid) return;
            const id = String(u.uid);
            idSet.add(id);
            if (!labelHints[id]) labelHints[id] = (u.name && String(u.name).trim()) || u.email || id;
        });
        const sorted = Array.from(idSet).sort((a, b) => {
            const la = labelHints[a] || a;
            const lb = labelHints[b] || b;
            return la.localeCompare(lb, undefined, { sensitivity: "base" });
        });
        return { daybookUserFilterIds: sorted, daybookUserLabelHints: labelHints };
    }, [company]);

    // Company share list se user hata diya ho to stale filter clear
    useEffect(() => {
        if (daybookUserFilter && !daybookUserFilterIds.includes(daybookUserFilter)) {
            setDaybookUserFilter(null);
        }
    }, [daybookUserFilterIds, daybookUserFilter]);

    const { daybookTransactions, daybookSummary } = useTransactions(
        {id: 'daybook', items: []}, 
        'daybook', 
        daybookDate ? {from: daybookDate, to: daybookDate} : undefined, 
        undefined, 
        accounts, 
        vouchers, 
        undefined, 
        daybookFilters, 
        daybookVoucherTypes, 
        journalAccountNames, 
        { ...vouchersUserNames, ...userNames },
        undefined,
        daybookUserFilter
      );

    // Daily Summary account search — sirf bank/cash rows; trxn table alag (column filter / daybookFilters)
    const daybookAccountSearchTerm = daybookSummaryAccountSearch.trim().toLowerCase();
    const displayDaybookSummary = useMemo(() => {
        if (!daybookSummary) return null;
        if (!daybookAccountSearchTerm) return daybookSummary;
        const nameMatches = (name: string) => (name || "").toLowerCase().includes(daybookAccountSearchTerm);
        const bankAccounts = ((daybookSummary as any).bankAccounts || []).filter((row: { name: string }) => nameMatches(row.name));
        const cashAccounts = ((daybookSummary as any).cashAccounts || []).filter((row: { name: string }) => nameMatches(row.name));
        const sumField = (rows: { yesterday: number; in: number; out: number; today: number }[], key: "yesterday" | "in" | "out" | "today") =>
            rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
        const bank = {
            yesterday: sumField(bankAccounts, "yesterday"),
            in: sumField(bankAccounts, "in"),
            out: sumField(bankAccounts, "out"),
            today: sumField(bankAccounts, "today"),
        };
        const cash = {
            yesterday: sumField(cashAccounts, "yesterday"),
            in: sumField(cashAccounts, "in"),
            out: sumField(cashAccounts, "out"),
            today: sumField(cashAccounts, "today"),
        };
        const total = {
            yesterday: bank.yesterday + cash.yesterday,
            in: bank.in + cash.in,
            out: bank.out + cash.out,
            today: bank.today + cash.today,
        };
        return { bank, cash, total, bankAccounts, cashAccounts };
    }, [daybookSummary, daybookAccountSearchTerm]);

    // Account search par matching group auto-expand
    useEffect(() => {
        if (!daybookAccountSearchTerm || !daybookSummary) return;
        const bankHas = ((daybookSummary as any).bankAccounts || []).some((r: { name: string }) =>
            (r.name || "").toLowerCase().includes(daybookAccountSearchTerm)
        );
        const cashHas = ((daybookSummary as any).cashAccounts || []).some((r: { name: string }) =>
            (r.name || "").toLowerCase().includes(daybookAccountSearchTerm)
        );
        if (bankHas) setDaybookBankExpanded(true);
        if (cashHas) setDaybookCashExpanded(true);
    }, [daybookAccountSearchTerm, daybookSummary]);
    
    const isFullScreen = !!onFullScreenToggle;

    return (
      <div id="daybook-area" className={cn("printable-area flex flex-col min-h-0 h-full")}>
        <Card className={cn(
            "flex-1 flex flex-col min-h-0 overflow-hidden border-2 border-foreground transition-all duration-300",
            isFullScreen && "h-full",
            isMobile && "px-0",
            isMobile && daybookRotated && "max-w-[90vh] w-[90vh] h-[100vw] fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90 z-50"
        )}>
            <CardHeader className={cn("print:hidden flex-shrink-0", isMobile && "px-0.5")}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <CardTitle>Daybook</CardTitle>
                        <CardDescription>All transactions for the selected date.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        {isMobile && daybookRowsPerPage !== 'all' && (
                            <Button 
                                variant="outline" 
                                size="icon" 
                                className="h-9 w-9"
                                onClick={() => setDaybookRotated(!daybookRotated)}
                            >
                                <RotateCw className="h-4 w-4" />
                            </Button>
                        )}
                        {onFullScreenToggle && (
                            <Button variant="ghost" size="icon" onClick={onFullScreenToggle}>
                               <Expand className="h-5 w-5" />
                            </Button>
                        )}
                    </div>
                </div>
                 {displayDaybookSummary && (
                    <Card className={cn("mt-4 bg-blue-50 border-blue-200 text-blue-800", isMobile && "rounded-lg mx-[2px]")}>
                        <CardHeader className={cn("pb-2 pt-4 space-y-3", isMobile ? "px-2" : "px-4")}>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                    <CardTitle className="text-sm flex items-center gap-2"><Info className="h-4 w-4 shrink-0" />Daily Summary</CardTitle>
                                    {/* PC: account search yahi (pehle user dropdown tha); user filter neeche transaction row me */}
                                    <CardDescription className="text-blue-700">Only showing bank and cash summary.</CardDescription>
                                </div>
                                {/* Mobile: User filter; PC: account search — Daily Summary header right */}
                                {isMobile ? (
                                <div className="flex w-full flex-col gap-1 sm:w-[min(100%,220px)] shrink-0">
                                    <span className="text-xs font-medium text-blue-900">User</span>
                                    <Select
                                        value={daybookUserFilter ?? "__all__"}
                                        onValueChange={(v) => setDaybookUserFilter(v === "__all__" ? null : v)}
                                    >
                                        <SelectTrigger className="h-9 bg-background/80 border-blue-200">
                                            <SelectValue placeholder="All users" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__all__">All users</SelectItem>
                                            {daybookUserFilterIds.map((uid) => (
                                                <SelectItem key={uid} value={uid}>
                                                    {daybookUserLabelHints[uid] || vouchersUserNames[uid] || userNames[uid] || uid}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                ) : (
                                <div className="relative w-full sm:w-[min(100%,220px)] shrink-0">
                                    <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none z-10" />
                                    <Input
                                        id="daybook-account-search"
                                        type="search"
                                        value={daybookSummaryAccountSearch}
                                        onChange={(e) => setDaybookSummaryAccountSearch(e.target.value)}
                                        placeholder="Search account"
                                        className="h-9 pl-8 text-sm bg-background/80 border-blue-200"
                                        autoComplete="off"
                                    />
                                </div>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className={cn("pb-4", isMobile ? "px-2" : "px-4")}>
                          {/* Summary borders: Bank/Cash/Total dono side moti; child account rows ~50% patli */}
                          <div
                            className={
                              isMobile
                                ? "[&_thead_tr]:!border-b-[3px] [&_tbody_tr]:!border-b-[1.2px] [&_tbody_tr.daybook-summary-group-row]:!border-t-[3px] [&_tbody_tr.daybook-summary-group-row]:!border-b-[3px]"
                                : "[&_thead_tr]:!border-b-[3px] [&_tbody_tr]:!border-b-[1.5px] [&_tbody_tr.daybook-summary-group-row]:!border-t-[3px] [&_tbody_tr.daybook-summary-group-row]:!border-b-[3px]"
                            }
                          >
                           <Table>
                            <TableHeader><TableRow><TableHead className="font-bold">Account</TableHead><TableHead className="text-right font-bold">Yesterdays Balance</TableHead><TableHead className="text-right font-bold text-green-600">Todays In</TableHead><TableHead className="text-right font-bold text-red-600">Todays Out</TableHead><TableHead className="text-right font-bold">Todays Balance</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {/* Bank group — search par sirf tab dikhao jab match ho */}
                                {(!daybookAccountSearchTerm || (displayDaybookSummary as any).bankAccounts?.length > 0) && (
                                <>
                                <TableRow className="hover:bg-blue-100/40 daybook-summary-group-row">
                                    <TableCell className="font-medium">
                                        <button
                                            type="button"
                                            className="flex items-center gap-1 text-left"
                                            onClick={() => setDaybookBankExpanded((e) => !e)}
                                            aria-expanded={daybookBankExpanded}
                                        >
                                            {daybookBankExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                                            Bank
                                        </button>
                                    </TableCell>
                                    <TableCell className={cn("text-right", displayDaybookSummary.bank.yesterday >= 0 ? 'text-green-600' : 'text-red-600')}>{formatCurrency(displayDaybookSummary.bank.yesterday)}</TableCell>
                                    <TableCell className="text-right text-green-600">{formatCurrency(displayDaybookSummary.bank.in, {noSuffix: true})}</TableCell>
                                    <TableCell className="text-right text-red-600">{formatCurrency(displayDaybookSummary.bank.out, {noSuffix: true})}</TableCell>
                                    <TableCell className={cn("text-right", displayDaybookSummary.bank.today >= 0 ? 'text-green-600' : 'text-red-600')}>{formatCurrency(displayDaybookSummary.bank.today)}</TableCell>
                                </TableRow>
                                {daybookBankExpanded && (displayDaybookSummary as any).bankAccounts?.map((row: { id: string; name: string; yesterday: number; in: number; out: number; today: number }) => (
                                    <TableRow key={`bank-${row.id}`} className="bg-blue-100/30 text-sm">
                                        <TableCell className="pl-9 text-muted-foreground">{row.name}</TableCell>
                                        <TableCell className={cn("text-right", row.yesterday >= 0 ? 'text-green-600' : 'text-red-600')}>{formatCurrency(row.yesterday)}</TableCell>
                                        <TableCell className="text-right text-green-600">{formatCurrency(row.in, { noSuffix: true })}</TableCell>
                                        <TableCell className="text-right text-red-600">{formatCurrency(row.out, { noSuffix: true })}</TableCell>
                                        <TableCell className={cn("text-right", row.today >= 0 ? 'text-green-600' : 'text-red-600')}>{formatCurrency(row.today)}</TableCell>
                                    </TableRow>
                                ))}
                                </>
                                )}
                                {(!daybookAccountSearchTerm || (displayDaybookSummary as any).cashAccounts?.length > 0) && (
                                <>
                                <TableRow className="hover:bg-blue-100/40 daybook-summary-group-row">
                                    <TableCell className="font-medium">
                                        <button
                                            type="button"
                                            className="flex items-center gap-1 text-left"
                                            onClick={() => setDaybookCashExpanded((e) => !e)}
                                            aria-expanded={daybookCashExpanded}
                                        >
                                            {daybookCashExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                                            Cash
                                        </button>
                                    </TableCell>
                                    <TableCell className={cn("text-right", displayDaybookSummary.cash.yesterday >= 0 ? 'text-green-600' : 'text-red-600')}>{formatCurrency(displayDaybookSummary.cash.yesterday)}</TableCell>
                                    <TableCell className="text-right text-green-600">{formatCurrency(displayDaybookSummary.cash.in, {noSuffix: true})}</TableCell>
                                    <TableCell className="text-right text-red-600">{formatCurrency(displayDaybookSummary.cash.out, {noSuffix: true})}</TableCell>
                                    <TableCell className={cn("text-right", displayDaybookSummary.cash.today >= 0 ? 'text-green-600' : 'text-red-600')}>{formatCurrency(displayDaybookSummary.cash.today)}</TableCell>
                                </TableRow>
                                {daybookCashExpanded && (displayDaybookSummary as any).cashAccounts?.map((row: { id: string; name: string; yesterday: number; in: number; out: number; today: number }) => (
                                    <TableRow key={`cash-${row.id}`} className="bg-blue-100/30 text-sm">
                                        <TableCell className="pl-9 text-muted-foreground">{row.name}</TableCell>
                                        <TableCell className={cn("text-right", row.yesterday >= 0 ? 'text-green-600' : 'text-red-600')}>{formatCurrency(row.yesterday)}</TableCell>
                                        <TableCell className="text-right text-green-600">{formatCurrency(row.in, { noSuffix: true })}</TableCell>
                                        <TableCell className="text-right text-red-600">{formatCurrency(row.out, { noSuffix: true })}</TableCell>
                                        <TableCell className={cn("text-right", row.today >= 0 ? 'text-green-600' : 'text-red-600')}>{formatCurrency(row.today)}</TableCell>
                                    </TableRow>
                                ))}
                                </>
                                )}
                                <TableRow
                                  className={cn(
                                    "font-bold border-foreground daybook-summary-group-row"
                                  )}
                                >
                                  <TableCell>Total</TableCell>
                                  <TableCell className={cn("text-right", displayDaybookSummary.total.yesterday >= 0 ? 'text-green-600' : 'text-red-600')}>{formatCurrency(displayDaybookSummary.total.yesterday)}</TableCell>
                                  <TableCell className="text-right text-green-600">{formatCurrency(displayDaybookSummary.total.in, {noSuffix: true})}</TableCell>
                                  <TableCell className="text-right text-red-600">{formatCurrency(displayDaybookSummary.total.out, {noSuffix: true})}</TableCell>
                                  <TableCell className={cn("text-right", displayDaybookSummary.total.today >= 0 ? 'text-green-600' : 'text-red-600')}>{formatCurrency(displayDaybookSummary.total.today)}</TableCell>
                                </TableRow>
                            </TableBody>
                           </Table>
                          </div>
                        </CardContent>
                    </Card>
                )}
                 <div className="flex flex-col gap-2 mt-4 print:hidden">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            {/* Daybook only: single date system – show either BS or AD calendar, not both. Date select par calendar auto-close. */}
                            {dateSystem === 'BS' && (
                                <BsDatePicker valueAD={daybookDate} onChangeAD={(date) => setDaybookDate(date as Date)} isRange={false} transactionDates={transactionDates} />
                            )}
                            {(dateSystem === 'AD' || dateSystem === 'Both') && (
                                <Popover open={isDaybookCalendarOpen} onOpenChange={setIsDaybookCalendarOpen}>
                                    <PopoverTrigger asChild>
                                    <Button
                                        id="date"
                                        variant={"outline"}
                                        className={cn("w-auto justify-start text-left font-normal", !daybookDate && "text-muted-foreground")}
                                    >
                                        {!isMobile && <CalendarIcon className="mr-2 h-4 w-4" />}
                                        {daybookDate ? formatDate(daybookDate) : <span>Pick a date</span>}
                                    </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <AdCalendar
                                            valueAD={daybookDate}
                                            isRange={false}
                                            numberOfMonths={calendarMonths}
                                            transactionDates={transactionDates}
                                            onSelect={(adDate) => {
                                                setDaybookDate(adDate);
                                                setIsDaybookCalendarOpen(false);
                                            }}
                                        />
                                    </PopoverContent>
                                </Popover>
                            )}
                            {/* PC: date ↔ Today ke beech prev/next din; mobile par hide */}
                            {!isMobile && (
                                <>
                                    <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Previous day" onClick={() => shiftDaybookDateBy(-1)}>
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Next day" onClick={() => shiftDaybookDateBy(1)}>
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </>
                            )}
                            <Button variant="outline" onClick={() => setDaybookDate(new Date())}>Today</Button>
                             {isDaybookFilterActive && (
                                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={clearDaybookFilters} aria-label="Clear Filters"><X className="h-4 w-4" /></Button>
                            )}
                            {!isMobile && (
                            <>
                            <div className="flex items-center space-x-2 flex-shrink-0">
                                <Checkbox
                                    id="daybook-show-narration"
                                    checked={showDaybookNarration}
                                    onCheckedChange={(c) => handleShowNarrationChange(Boolean(c))}
                                />
                                <label htmlFor="daybook-show-narration" className="text-sm font-medium leading-none whitespace-nowrap cursor-pointer">Show Narration</label>
                            </div>
                            <NarrationNoteSearchInput
                              id="narration-search-report-daybook"
                              value={daybookNarrationNoteSearch}
                              onChange={setDaybookNarrationNoteSearch}
                            />
                            </>
                            )}
                        </div>
                        <div className="flex items-center space-x-2 flex-wrap justify-end">
                            {/* PC: User filter — Rows dropdown ke left; account search Daily Summary me */}
                            {!isMobile && (
                            <>
                            <span className="text-sm font-medium">User:</span>
                            <Select
                                value={daybookUserFilter ?? "__all__"}
                                onValueChange={(v) => setDaybookUserFilter(v === "__all__" ? null : v)}
                            >
                                <SelectTrigger className="h-9 w-[min(180px,18vw)] bg-background">
                                    <SelectValue placeholder="All users" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all__">All users</SelectItem>
                                    {daybookUserFilterIds.map((uid) => (
                                        <SelectItem key={uid} value={uid}>
                                            {daybookUserLabelHints[uid] || vouchersUserNames[uid] || userNames[uid] || uid}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            </>
                            )}
                            {!isMobile && <span className="text-sm font-medium">Rows:</span>}
                            <Select value={daybookRowsPerPage} onValueChange={(v) => setDaybookRowsPerPage(v)}>
                                <SelectTrigger className="h-9 w-[80px]">
                                    <SelectValue placeholder={`${daybookRowsPerPage}`} />
                                </SelectTrigger>
                                <SelectContent>
                                    {['15', '30', '50', 'all'].map(size => <SelectItem key={size} value={size}>{size}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <span className="text-sm font-medium text-muted-foreground w-full block">Total Vouchers: {daybookTransactions ? daybookTransactions.length : 0}</span>
                </div>
            </CardHeader>
            <CardContent className={cn(
                "flex-1 min-h-0 overflow-hidden flex flex-col relative px-0 min-w-full",
                isMobile && "px-0",
                (!daybookTransactions || daybookTransactions.length === 0) && "min-h-[420px]"
            )}>
                 {daybookTransactions && daybookTransactions.length > 0 ? (
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden min-w-full w-full">
                    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto min-w-full w-full">
                           {/* Mobile: 2px horizontal gap so transaction cards match Daily Summary card spacing */}
                           <div className={cn("w-full min-w-full overflow-hidden pr-[15px]", isMobile && "px-[2px]")}>
                           <TransactionsTable
                                transactions={daybookTransactions || []}
                                context="daybook" 
                                showNarration={showDaybookNarration}
                                narrationNoteSearch={daybookNarrationNoteSearch}
                                journalAccountNames={journalAccountNames}
                                userNames={{ ...vouchersUserNames, ...userNames }}
                                onRowClick={handleEditVoucher}
                                onHistoryVoucher={handleHistoryVoucher}
                                onAddLink={handleAddLink}
                                openingBalance={daybookSummary?.total.yesterday}
                                filters={daybookFilters}
                                setFilters={setDaybookFilters}
                                activeFilter={activeDaybookFilter}
                                setActiveFilter={setActiveDaybookFilter}
                                voucherTypes={daybookVoucherTypes}
                                onVoucherTypeChange={setDaybookVoucherTypes}
                                isDateChange={isDateChange}
                                hideFooter={true}
                           />
                           </div>
                    </div>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden rounded-b-lg min-h-[420px]">
                    <div className="absolute top-6 left-6 text-5xl md:text-6xl font-bold text-muted-foreground/15 transform -rotate-12 select-none">
                        Daybook
                    </div>
                    <p className="text-2xl md:text-3xl font-bold text-muted-foreground/25 transform -rotate-12 whitespace-nowrap select-none">
                        No Transactions Found
                    </p>
                    <div className="absolute bottom-6 right-6 text-5xl md:text-6xl font-bold text-muted-foreground/15 transform -rotate-12 select-none">
                        Report
                    </div>
                </div>
              )}
            </CardContent>
        </Card>
        <AddVoucherDialog isOpen={isVoucherDialogOpen} onOpenChange={setIsVoucherDialogOpen} voucher={selectedVoucher} onVoucherCreated={() => setSelectedVoucher(null)} />
        <HistoryDialog voucher={historyVoucher} isOpen={!!historyVoucher} onOpenChange={(open) => !open && setHistoryVoucher(null)} onHistoryReset={() => setHistoryVoucher((prev: any) => prev ? { ...prev, history: [] } : null)} />
        {linkAdvancesVoucher && (
          <LinkAdvancesToVoucherDialog
            isOpen={!!linkAdvancesVoucher}
            onOpenChange={(open: boolean) => !open && setLinkAdvancesVoucher(null)}
            mode={linkAdvancesVoucher.type === "purchase" || linkAdvancesVoucher.type === "purchase_service" ? "purchase" : "sale"}
            targetVoucherId={linkAdvancesVoucher.id}
            targetPartyId={linkAdvancesVoucher.partyId ?? ""}
            targetPartyName={processedParties?.find((p) => p.id === linkAdvancesVoucher.partyId)?.name ?? "Party"}
            partyOpeningBalance={processedParties?.find((p) => p.id === linkAdvancesVoucher.partyId)?.openingBalance ?? 0}
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
            partyName={processedParties?.find((p) => p.id === linkPaymentVoucher.partyId)?.name ?? "Party"}
            receivedAmount={Number(linkPaymentVoucher.amount ?? linkPaymentVoucher.total ?? 0)}
            existingAllocations={Array.isArray(linkPaymentVoucher.allocations) ? linkPaymentVoucher.allocations : []}
            paymentInId={["payment_in", "direct_income"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.id : undefined}
            paymentOutId={["payment_out", "direct_expense"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.id : undefined}
            paymentInVoucherNumber={["payment_in", "direct_income"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.voucherNumber : undefined}
            paymentInDate={["payment_in", "direct_income"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.date : undefined}
            paymentOutVoucherNumber={["payment_out", "direct_expense"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.voucherNumber : undefined}
            paymentOutDate={["payment_out", "direct_expense"].includes(linkPaymentVoucher.type) ? linkPaymentVoucher.date : undefined}
            partyOpeningBalance={processedParties?.find((p) => p.id === linkPaymentVoucher.partyId)?.openingBalance ?? 0}
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
      </div>
    );
}
