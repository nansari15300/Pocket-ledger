
"use client";

import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableCaption,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Search, XCircle, Loader2, AlertTriangle, ChevronDown, ChevronUp, ChevronRight, Users } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useVouchers } from "@/hooks/useVouchers";
import { useDate } from "@/hooks/useDate";
import { TransactionsTable } from "../vouchers/TransactionsTable";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useCompany } from "@/hooks/useCompany";
import { MonthYearFilter } from "@/components/dashboard/MonthYearFilter";
import { openPrintDirect } from "@/lib/printDirect";
import { Printer } from "lucide-react";
import { PrintOptionsDialog } from "@/components/ui/PrintOptionsDialog";
<<<<<<< HEAD
import type { DateRange } from "react-day-picker";
=======
import type { DateRange } from "@/components/ui/ad-calendar";
>>>>>>> 6a1ec26 (Animation Fixed)
import { startOfDay, endOfDay } from "date-fns";

/**
 * TYPES
 */
type BalanceSheetRow = {
  accountId: string;
  accountName: string;
  group: string;
  category: "Assets" | "Liabilities" | "Equity";
  amount: number;
  transactions?: any[];
  openingBalance?: number;
  isGroup?: boolean;
  entityType?: 'party' | 'account' | 'staff' | 'tax' | 'income' | 'expense' | 'opening_balance';
};

/**
 * HELPERS
 */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const toNepaliCurrency = (n: number) =>
  n === 0
    ? "-"
    : new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);

const safeToDate = (date: any): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (date.toDate instanceof Function) return date.toDate();
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * MAIN BALANCE SHEET PAGE COMPONENT
 */
export function BalanceSheetPage() {
  const {
    vouchers,
    loading,
    processedParties,
    processedStaff,
    processedAccounts,
    processedTaxes,
    processedExpenseAccounts,
    processedExpenseGroups,
    processedGroups,
    processedAccountGroups,
    processedTaxGroups,
    processedStaffGroups,
  } = useVouchers();
  const { companyId, company } = useCompany();
  const { dateSystem, formatDate, formatDateBS, formatCurrencyForPrint } = useDate();

  const [query, setQuery] = useState("");
  const [sortDesc, setSortDesc] = useState(false);
  const [sortBy, setSortBy] = useState<'entity' | 'balance' | 'date'>('entity');
  const [entityFilter, setEntityFilter] = useState<'all' | 'party' | 'account' | 'staff' | 'tax' | 'income' | 'expense'>('all');
  const [activeRow, setActiveRow] = useState<BalanceSheetRow | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [journalAccountNames, setJournalAccountNames] = useState<
    Record<string, string>
  >({});
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [showDifferenceDetails, setShowDifferenceDetails] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Reset date range when date system changes
  useEffect(() => {
    setDateRange(undefined);
  }, [dateSystem]);

  // Reset all local state when company changes
  useEffect(() => {
    if (companyId) {
      setQuery("");
      setDateRange(undefined);
      setActiveRow(null);
      setSortDesc(false);
    }
  }, [companyId]);

  // Filter vouchers based on date range
  const filteredVouchers = useMemo(() => {
    if (!dateRange?.from) return vouchers;
    const fromDate = startOfDay(dateRange.from);
    const toDate = dateRange.to ? endOfDay(dateRange.to) : endOfDay(fromDate);
    return vouchers.filter(v => {
      const txDate = safeToDate(v.date);
      return txDate && txDate <= toDate;
    });
  }, [vouchers, dateRange]);

  // Calculate balances up to the selected date
  const balanceSheetData = useMemo((): BalanceSheetRow[] => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/416a5fc5-599f-40c3-9ff9-05c0e4dd1818',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BalanceSheet.tsx:150',message:'balanceSheetData start',data:{accounts:processedAccounts.length,parties:processedParties.length,staff:processedStaff.length,taxes:processedTaxes.length,expenseAccounts:processedExpenseAccounts.length,filteredVouchers:filteredVouchers.length},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion agent log
    const assets: BalanceSheetRow[] = [];
    const liabilities: BalanceSheetRow[] = [];

    // Calculate account balances based on filtered vouchers
    const calculateAccountBalance = (accountId: string, openingBalance: number = 0): number => {
      let balance = openingBalance;
      filteredVouchers.forEach(v => {
        const amount = v.total || v.amount || 0;
        if (v.accountId === accountId) {
          if (['payment_in', 'direct_income', 'sale'].includes(v.type)) balance += amount;
          if (['payment_out', 'direct_expense', 'purchase'].includes(v.type)) balance -= amount;
        }
        if (v.type === 'contra') {
          if (v.toAccountId === accountId) balance += amount;
          if (v.fromAccountId === accountId) balance -= amount;
        }
        if (v.type === "journal" && Array.isArray(v.entries)) {
          const entry = v.entries.find((e: any) => e.accountId === accountId);
          if (entry) balance += Number(entry.debit || 0) - Number(entry.credit || 0);
        }
      });
      return balance;
    };

    const calculatePartyBalance = (partyId: string, openingBalance: number = 0): number => {
      let balance = openingBalance;
      filteredVouchers.forEach(v => {
        const amount = v.total || v.amount || 0;
        if (v.partyId === partyId) {
          if (["sale", "payment_out", "direct_income"].includes(v.type)) balance += amount;
          else if (["purchase", "payment_in", "direct_expense"].includes(v.type)) balance -= amount;
        }
      });
      return balance;
    };

    const calculateStaffBalance = (staffId: string, openingBalance: number = 0): number => {
      let balance = openingBalance;
      filteredVouchers.forEach(v => {
        const amount = v.total || v.amount || 0;
        if (v.staffId === staffId) {
          if (v.type === 'payment_out') balance += amount;
          else if (v.type === 'payment_in') balance -= amount;
        }
      });
      return balance;
    };

    const calculateTaxBalance = (taxId: string, openingBalance: number = 0): number => {
      let balance = openingBalance;
      filteredVouchers.forEach(v => {
        if (v.taxAccountId === taxId) {
          const amount = v.total || v.amount || 0;
          if (v.type === 'payment_out') balance += amount;
          else if (v.type === 'payment_in') balance -= amount;
        } else if (v.lineItems?.some((li: any) => li.taxAccountId === taxId)) {
          const taxAmount = v.lineItems.find((li: any) => li.taxAccountId === taxId)?.taxAmount || 0;
          if (v.type === 'purchase') balance += taxAmount;
          else if (v.type === 'sale') balance -= taxAmount;
        }
      });
      return balance;
    };

    // Helper function to get group name
    const getGroupName = (groupId: string | undefined, groupType: 'party' | 'account' | 'tax' | 'staff'): string => {
      if (!groupId) return 'Ungrouped';
      if (groupType === 'party') return processedGroups.find(g => g.id === groupId)?.name || 'Ungrouped';
      if (groupType === 'account') return processedAccountGroups.find(g => g.id === groupId)?.name || 'Ungrouped';
      if (groupType === 'tax') return processedTaxGroups.find(g => g.id === groupId)?.name || 'Ungrouped';
      if (groupType === 'staff') return processedStaffGroups.find(g => g.id === groupId)?.name || 'Ungrouped';
      return 'Ungrouped';
    };

    // Helper function to check if a group is Nominal (Income/Expense) - should NOT appear in Balance Sheet
    const isNominalGroup = (groupId: string | undefined, groupType: 'party' | 'account' | 'tax' | 'staff'): boolean => {
      if (!groupId) return false;
      const groupName = getGroupName(groupId, groupType).toLowerCase();
      // Check for Income/Expense groups
      return groupName.includes('income') || 
             groupName.includes('expense') || 
             groupName.includes('sales') || 
             groupName.includes('purchase') ||
             groupId === 'direct_income' ||
             groupId === 'indirect_income' ||
             groupId === 'direct_expense' ||
             groupId === 'indirect_expense' ||
             groupId === 'income' ||
             groupId === 'expenses';
    };

    // Use Trial Balance logic: balance > 0 (Dr) = Assets, balance < 0 (Cr) = Liabilities
    // Accounts - Use balance from processedAccounts (same as Trial Balance)
    // IMPORTANT: Skip Nominal accounts (Income/Expense) - they don't appear in Balance Sheet
    processedAccounts.forEach((acc) => {
      // Skip Income/Expense accounts (Nominal accounts) - they go to P&L, not Balance Sheet
      if (isNominalGroup(acc.groupId, 'account')) return;
      
      // Use the balance from processedAccounts (calculated same way as Trial Balance)
      const balance = acc.balance || 0;
      const groupName = getGroupName(acc.groupId, 'account');
      if (balance > 0) {
        assets.push({ 
          accountId: acc.id, 
          accountName: acc.accountName, 
          group: groupName, 
          category: "Assets", 
          amount: balance, 
          openingBalance: acc.openingBalance, 
          isGroup: false,
          entityType: 'account'
        });
      } else if (balance < 0) {
        liabilities.push({ 
          accountId: acc.id, 
          accountName: acc.accountName, 
          group: groupName, 
          category: "Liabilities", 
          amount: -balance, 
          openingBalance: acc.openingBalance, 
          isGroup: false,
          entityType: 'account'
        });
      }
    });
    
    // Parties - Use balance from processedParties (same as Trial Balance)
    // IMPORTANT: Skip Nominal accounts (Income/Expense) - they don't appear in Balance Sheet
    processedParties.forEach((p) => {
      if (p.id === 'opening_balance_ledger') return; // Skip opening balance ledger here (handled separately)
      
      // Skip Income/Expense accounts (Nominal accounts) - they go to P&L, not Balance Sheet
      if (isNominalGroup(p.groupId, 'party')) return;
      
      // Use the balance from processedParties (calculated same way as Trial Balance)
      const balance = p.balance || 0;
      const groupName = getGroupName(p.groupId, 'party');
      
      // Apply consistent Dr/Cr logic to ALL accounts (including Equity):
      // Dr balance (positive) = Assets side
      // Cr balance (negative) = Liabilities + Equity side
      const isEquityGroup = p.groupId === 'equity';
      
      if (balance > 0) {
        // Debit balance (Dr) → Assets side
        // For Equity accounts, Dr balance is unusual but should still show on Assets side
        assets.push({ 
          accountId: p.id, 
          accountName: p.name, 
          group: groupName, 
          category: isEquityGroup ? "Assets" : "Assets", 
          amount: balance, 
          openingBalance: p.openingBalance, 
          isGroup: false,
          entityType: 'party'
        });
      } else if (balance < 0) {
        // Credit balance (Cr) → Liabilities + Equity side
        // For Equity accounts, Cr balance is normal and goes to Equity category
        liabilities.push({ 
          accountId: p.id, 
          accountName: p.name, 
          group: groupName, 
          category: isEquityGroup ? "Equity" : "Liabilities", 
          amount: -balance, 
          openingBalance: p.openingBalance, 
          isGroup: false,
          entityType: 'party'
        });
      } else {
        // Zero balance - show Equity accounts for visibility
        if (isEquityGroup && (p.name.toLowerCase().includes('capital') || p.name.toLowerCase().includes('owner'))) {
          liabilities.push({ 
            accountId: p.id, 
            accountName: p.name, 
            group: groupName, 
            category: "Equity", 
            amount: 0, 
            openingBalance: p.openingBalance, 
            isGroup: false,
            entityType: 'party'
          });
        }
      }
    });
    
    // Add Opening Balance ledger - use its actual balance from processedParties
    // IMPORTANT: Individual accounts already include opening balance in their balance calculation
    // The Opening Balance ledger is a balancing account that should show the NET difference
    // (accounts whose opening balance is NOT already included in their individual ledger)
    // We use the ledger's balance directly, not recalculate by summing all opening balances
    const openingBalanceLedger = processedParties.find(p => p.id === 'opening_balance_ledger');
    if (openingBalanceLedger) {
      // Use the Opening Balance ledger's actual balance (already calculated in processedParties)
      // This balance represents the NET difference - accounts not already included in individual balances
      const openingBalanceAmount = openingBalanceLedger.balance || 0;
      
      // Dynamically switch sides based on Dr/Cr: Dr (positive) → Assets, Cr (negative) → Liabilities + Equity
      if (openingBalanceAmount > 0) {
        // Debit opening balance (Dr) → Assets side
        assets.push({ 
          accountId: 'opening_balance_ledger', 
          accountName: 'Opening Balance', 
          group: 'Equity', 
          category: 'Assets', 
          amount: openingBalanceAmount,
          openingBalance: openingBalanceLedger.openingBalance || 0,
          isGroup: false,
          entityType: 'opening_balance'
        });
      } else if (openingBalanceAmount < 0) {
        // Credit opening balance (Cr) → Liabilities + Equity side
        liabilities.push({ 
          accountId: 'opening_balance_ledger', 
          accountName: 'Opening Balance', 
          group: 'Equity', 
          category: 'Equity', 
          amount: -openingBalanceAmount,
          openingBalance: openingBalanceLedger.openingBalance || 0,
          isGroup: false,
          entityType: 'opening_balance'
        });
      } else {
        // Zero balance - show on Equity side for visibility
        liabilities.push({ 
          accountId: 'opening_balance_ledger', 
          accountName: 'Opening Balance', 
          group: 'Equity', 
          category: 'Equity', 
          amount: 0,
          openingBalance: openingBalanceLedger.openingBalance || 0,
          isGroup: false,
          entityType: 'opening_balance'
        });
      }
    }
    
    // Staff - Use balance from processedStaff (same as Trial Balance)
    // IMPORTANT: Skip Nominal accounts (Income/Expense) - they don't appear in Balance Sheet
    processedStaff.forEach((s) => {
      // Skip Income/Expense accounts (Nominal accounts) - they go to P&L, not Balance Sheet
      if (isNominalGroup(s.groupId, 'staff')) return;
      
      // Use the balance from processedStaff (calculated same way as Trial Balance)
      const balance = s.balance || 0;
      const groupName = getGroupName(s.groupId, 'staff');
      if (balance > 0) {
        assets.push({ 
          accountId: s.id, 
          accountName: s.name, 
          group: groupName, 
          category: "Assets", 
          amount: balance, 
          openingBalance: s.openingBalance, 
          isGroup: false,
          entityType: 'staff'
        });
      } else if (balance < 0) {
        liabilities.push({ 
          accountId: s.id, 
          accountName: s.name, 
          group: groupName, 
          category: "Liabilities", 
          amount: -balance, 
          openingBalance: s.openingBalance, 
          isGroup: false,
          entityType: 'staff'
        });
      }
    });
    
    // Taxes - Use balance from processedTaxes (same as Trial Balance)
    // Debit balance (Dr) = Asset, Credit balance (Cr) = Liability
    // IMPORTANT: Skip Nominal accounts (Income/Expense) - they don't appear in Balance Sheet
    processedTaxes.forEach((t) => {
      // Skip Income/Expense accounts (Nominal accounts) - they go to P&L, not Balance Sheet
      if (isNominalGroup(t.groupId, 'tax')) return;
      
      // Use the balance from processedTaxes (calculated same way as Trial Balance)
      const balance = t.balance || 0;
      const groupName = getGroupName(t.groupId, 'tax');
      if (balance > 0) {
        // Debit balance (Dr) - Tax receivable/Input tax credit = Asset
        assets.push({ 
          accountId: t.id, 
          accountName: t.name, 
          group: groupName, 
          category: "Assets", 
          amount: balance, 
          openingBalance: t.openingBalance, 
          isGroup: false,
          entityType: 'tax'
        });
      } else if (balance < 0) {
        // Credit balance (Cr) - Tax payable/Output tax = Liability
        liabilities.push({ 
          accountId: t.id, 
          accountName: t.name, 
          group: groupName, 
          category: "Liabilities", 
          amount: -balance, 
          openingBalance: t.openingBalance, 
          isGroup: false,
          entityType: 'tax'
        });
      }
    });

    // Add Group Totals - Show net balance on ONE side only (not both)
    // Account Groups - Skip Income/Expense groups (Nominal accounts)
    processedAccountGroups.forEach((group) => {
      // Skip Income/Expense groups - they don't appear in Balance Sheet
      if (isNominalGroup(group.id, 'account')) return;
      
      const groupAccounts = processedAccounts.filter(acc => acc.groupId === group.id);
      let netBalance = 0;
      
      groupAccounts.forEach(acc => {
        // Use balance from processedAccounts (same as Trial Balance)
        netBalance += acc.balance || 0;
      });
      
      // Show net balance on appropriate side only
      if (netBalance > 0) {
        assets.push({ 
          accountId: `group_account_${group.id}`, 
          accountName: group.name, 
          group: group.name, 
          category: "Assets", 
          amount: netBalance, 
          openingBalance: 0, 
          isGroup: true,
          entityType: 'account'
        });
      } else if (netBalance < 0) {
        liabilities.push({ 
          accountId: `group_account_${group.id}`, 
          accountName: group.name, 
          group: group.name, 
          category: "Liabilities", 
          amount: -netBalance, 
          openingBalance: 0, 
          isGroup: true,
          entityType: 'account'
        });
      }
    });

    // Party Groups (excluding Equity and Income/Expense - handled separately)
    processedGroups.forEach((group) => {
      // Skip Equity group - it will be handled separately
      if (group.id === 'equity') return;
      
      // Skip Income/Expense groups - they don't appear in Balance Sheet
      if (isNominalGroup(group.id, 'party')) return;
      
      const groupParties = processedParties.filter(p => p.groupId === group.id && p.id !== 'opening_balance_ledger');
      let netBalance = 0;
      
      groupParties.forEach(p => {
        // Use balance from processedParties (same as Trial Balance)
        netBalance += p.balance || 0;
      });
      
      // Show net balance on appropriate side only
      if (netBalance > 0) {
        assets.push({ 
          accountId: `group_party_${group.id}`, 
          accountName: group.name, 
          group: group.name, 
          category: "Assets", 
          amount: netBalance, 
          openingBalance: 0, 
          isGroup: true,
          entityType: 'party'
        });
      } else if (netBalance < 0) {
        liabilities.push({ 
          accountId: `group_party_${group.id}`, 
          accountName: group.name, 
          group: group.name, 
          category: "Liabilities", 
          amount: -netBalance, 
          openingBalance: 0, 
          isGroup: true,
          entityType: 'party'
        });
      }
    });

    // Equity Group - Show separately
    // Include Opening Balance ledger balance in Equity group calculation
    // IMPORTANT: Individual accounts already include opening balance in their balance calculation
    // The Opening Balance ledger is a balancing account - use its balance directly
    const equityGroup = processedGroups.find(g => g.id === 'equity');
    if (equityGroup) {
      const equityParties = processedParties.filter(p => p.groupId === 'equity' && p.id !== 'opening_balance_ledger');
      let netEquityBalance = 0;
      
      equityParties.forEach(p => {
        netEquityBalance += p.balance || 0;
      });
      
      // Include Opening Balance ledger's balance (already calculated in processedParties)
      // This represents the NET difference - accounts not already included in individual balances
      const openingBalanceLedger = processedParties.find(p => p.id === 'opening_balance_ledger');
      const openingBalanceAmount = openingBalanceLedger?.balance || 0;
      netEquityBalance += openingBalanceAmount;
      
      // Apply consistent Dr/Cr logic to Equity Group:
      // Dr balance (positive) → Assets side
      // Cr balance (negative) → Liabilities + Equity side
      if (netEquityBalance > 0) {
        // Debit balance (Dr) → Assets side
        assets.push({ 
          accountId: `group_party_equity`, 
          accountName: equityGroup.name, 
          group: equityGroup.name, 
          category: "Assets", 
          amount: netEquityBalance, 
          openingBalance: openingBalanceAmount, 
          isGroup: true,
          entityType: 'party'
        });
      } else if (netEquityBalance < 0) {
        // Credit balance (Cr) → Liabilities + Equity side
        liabilities.push({ 
          accountId: `group_party_equity`, 
          accountName: equityGroup.name, 
          group: equityGroup.name, 
          category: "Equity", 
          amount: -netEquityBalance, 
          openingBalance: openingBalanceAmount, 
          isGroup: true,
          entityType: 'party'
        });
      }
    }

    // Tax Groups - Skip Income/Expense groups (Nominal accounts)
    processedTaxGroups.forEach((group) => {
      // Skip Income/Expense groups - they don't appear in Balance Sheet
      if (isNominalGroup(group.id, 'tax')) return;
      
      const groupTaxes = processedTaxes.filter(t => t.groupId === group.id);
      let netBalance = 0;
      
      groupTaxes.forEach(t => {
        // Use balance from processedTaxes (same as Trial Balance)
        netBalance += t.balance || 0;
      });
      
      // Show net balance on appropriate side only
      if (netBalance > 0) {
        assets.push({ 
          accountId: `group_tax_${group.id}`, 
          accountName: group.name, 
          group: group.name, 
          category: "Assets", 
          amount: netBalance, 
          openingBalance: 0, 
          isGroup: true,
          entityType: 'tax'
        });
      } else if (netBalance < 0) {
        liabilities.push({ 
          accountId: `group_tax_${group.id}`, 
          accountName: group.name, 
          group: group.name, 
          category: "Liabilities", 
          amount: -netBalance, 
          openingBalance: 0, 
          isGroup: true,
          entityType: 'tax'
        });
      }
    });

    // Staff Groups - Skip Income/Expense groups (Nominal accounts)
    processedStaffGroups.forEach((group) => {
      // Skip Income/Expense groups - they don't appear in Balance Sheet
      if (isNominalGroup(group.id, 'staff')) return;
      
      const groupStaff = processedStaff.filter(s => s.groupId === group.id);
      let netBalance = 0;
      
      groupStaff.forEach(s => {
        // Use balance from processedStaff (same as Trial Balance)
        netBalance += s.balance || 0;
      });
      
      // Show net balance on appropriate side only
      if (netBalance > 0) {
        assets.push({ 
          accountId: `group_staff_${group.id}`, 
          accountName: group.name, 
          group: group.name, 
          category: "Assets", 
          amount: netBalance, 
          openingBalance: 0, 
          isGroup: true,
          entityType: 'staff'
        });
      } else if (netBalance < 0) {
        liabilities.push({ 
          accountId: `group_staff_${group.id}`, 
          accountName: group.name, 
          group: group.name, 
          category: "Liabilities", 
          amount: -netBalance, 
          openingBalance: 0, 
          isGroup: true,
          entityType: 'staff'
        });
      }
    });

    // Note: Income and Expense accounts (Nominal accounts) are NOT shown in Balance Sheet
    // They are shown in Profit & Loss Statement instead
    // Balance Sheet only shows Personal and Real accounts (Assets, Liabilities, Equity)
    // Opening Balance ledger is already included above with sum of all entities' opening balances

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/416a5fc5-599f-40c3-9ff9-05c0e4dd1818',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BalanceSheet.tsx:717',message:'balanceSheetData end',data:{assetsCount:assets.length,liabilitiesCount:liabilities.length},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion agent log
    // Calculate Net Profit from expense accounts up to selected date
    const calculateExpenseAccountBalance = (acc: any): number => {
      let balance = Number(acc.openingBalance) || 0;
      filteredVouchers.forEach(v => {
        const directExpenseToId = v.toAccountId || v.expenseAccountId;
        if (v.expenseAccountId === acc.id || v.incomeAccountId === acc.id || directExpenseToId === acc.id) {
          const amount = v.total || v.amount || 0;
          if (v.type === 'direct_income' && v.incomeAccountId === acc.id) balance += amount;
          if (v.type === 'direct_expense' && directExpenseToId === acc.id) balance -= amount;
        }
        if (v.type === "journal" && Array.isArray(v.entries)) {
          const entry = v.entries.find((e: any) => e.accountId === acc.id);
          if (entry) balance += Number(entry.debit || 0) - Number(entry.credit || 0);
        }
      });
      return balance;
    };

    // Don't add Net Profit to regular rows - it will be shown separately below TOTAL
    return [...assets, ...liabilities];

  }, [processedAccounts, processedParties, processedStaff, processedTaxes, processedExpenseAccounts, processedGroups, processedAccountGroups, processedTaxGroups, processedStaffGroups, filteredVouchers]);

  // Opening Balance Audit - Check if opening balances are balanced
  const openingBalanceAudit = useMemo(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/416a5fc5-599f-40c3-9ff9-05c0e4dd1818',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BalanceSheet.tsx:724',message:'openingBalanceAudit start',data:{accounts:processedAccounts.length,parties:processedParties.length,staff:processedStaff.length,taxes:processedTaxes.length,expenseAccounts:processedExpenseAccounts.length},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H5'})}).catch(()=>{});
    // #endregion agent log
    let totalOpeningDr = 0;
    let totalOpeningCr = 0;

    // सबै प्रकारका लेजरहरू (Accounts, Parties, Staff, Taxes) जम्मा गर्ने
    const allEntities = [
      ...processedAccounts,
      ...processedParties,
      ...processedStaff,
      ...processedTaxes,
      ...processedExpenseAccounts
    ];

    allEntities.forEach((entity) => {
      const ob = Number(entity.openingBalance) || 0;
      if (ob > 0) {
        totalOpeningDr += ob; // डेबिट ओपनिङ
      } else if (ob < 0) {
        totalOpeningCr += Math.abs(ob); // क्रेडिट ओपनिङ
      }
    });

    const result = {
      totalOpeningDr: round2(totalOpeningDr),
      totalOpeningCr: round2(totalOpeningCr),
      diff: round2(totalOpeningDr - totalOpeningCr),
      isBalanced: Math.abs(totalOpeningDr - totalOpeningCr) < 0.01
    };
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/416a5fc5-599f-40c3-9ff9-05c0e4dd1818',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BalanceSheet.tsx:746',message:'openingBalanceAudit end',data:{totalOpeningDr:result.totalOpeningDr,totalOpeningCr:result.totalOpeningCr,diff:result.diff,isBalanced:result.isBalanced},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H5'})}).catch(()=>{});
    // #endregion agent log
    return result;
  }, [processedAccounts, processedParties, processedStaff, processedTaxes, processedExpenseAccounts]);

  // Opening Balance Entities for Summary Table
  const openingBalanceEntities = useMemo(() => {
    // सबै लेजरहरू जम्मा गर्ने
    const data = [
      ...processedAccounts.map(a => ({ ...a, type: 'Account', accountName: a.accountName })),
      ...processedParties.map(p => ({ ...p, type: 'Party', accountName: p.name })),
      ...processedStaff.map(s => ({ ...s, type: 'Staff', accountName: s.name })),
      ...processedTaxes.map(t => ({ ...t, type: 'Tax', accountName: t.name })),
      ...processedExpenseAccounts.map(e => ({ ...e, type: 'Income/Expense', accountName: e.name }))
    ];
    // केवल ओपनिङ ब्यालेन्स भएका लेजरहरू मात्र फिल्टर गर्ने
    return data.filter(e => Number(e.openingBalance) !== 0);
  }, [processedAccounts, processedParties, processedStaff, processedTaxes, processedExpenseAccounts]);

  // Calculate Net Profit separately
  // Formula: Net Profit = Total Income - Total Expenses
  // Income = Sales Account + Direct Income + Indirect Income accounts
  // Expenses = Purchase Account + Direct Expense + Indirect Expense + Salary Expense accounts
  // Note: Use account.balance directly (which includes openingBalance) to match Income & Expense page calculation
  const netProfit = useMemo(() => {
    // Identify income groups (direct_income, indirect_income)
    const incomeGroupIds = new Set<string>();
    const expenseGroupIds = new Set<string>();
    
    if (processedExpenseGroups) {
      processedExpenseGroups.forEach(group => {
        // Income groups have parentId === 'income' or id === 'direct_income' or 'indirect_income'
        if (group.parentId === 'income' || group.id === 'direct_income' || group.id === 'indirect_income') {
          incomeGroupIds.add(group.id);
        }
        // Expense groups have parentId === 'expenses' or id === 'direct_expense' or 'indirect_expense'
        if (group.parentId === 'expenses' || group.id === 'direct_expense' || group.id === 'indirect_expense') {
          expenseGroupIds.add(group.id);
        }
      });
    }
    
    // Calculate Total Income and Total Expenses
    // Match Income & Expense page calculation: totalBalance = sum of all account.balance
    // For Net Profit: Income accounts contribute negatively, Expense accounts contribute positively
    let totalIncome = 0;
    let totalExpenses = 0;
    let unclassifiedAccounts: any[] = [];
    
    processedExpenseAccounts.forEach(acc => {
      const isIncomeAccount = acc.id === 'sales_account' || (acc.groupId && incomeGroupIds.has(acc.groupId));
      const isExpenseAccount = acc.id === 'purchase_account' || 
                               (acc.groupId && expenseGroupIds.has(acc.groupId)) ||
                               (acc as any).type === 'Expense' || 
                               (acc as any).type === 'Salary';
      
      if (isIncomeAccount) {
        // Income accounts: negative balance (Cr) means income earned
        // Income = Credit - Debit = -(balance - openingBalance) ≈ -balance (if openingBalance small)
        // To match Income & Expense page logic: Income = -balance
        totalIncome += -(acc.balance || 0);
      } else if (isExpenseAccount) {
        // Expense accounts: positive balance (Dr) means expenses incurred
        // Expenses = Debit - Credit = balance - openingBalance ≈ balance (if openingBalance small)
        // To match Income & Expense page logic: Expenses = balance
        totalExpenses += (acc.balance || 0);
      } else {
        // Track unclassified accounts for debugging
        unclassifiedAccounts.push({ id: acc.id, name: acc.name, balance: acc.balance, groupId: acc.groupId });
        // Default: treat as expense if balance is positive, income if balance is negative
        if ((acc.balance || 0) > 0) {
          totalExpenses += (acc.balance || 0);
        } else {
          totalIncome += -(acc.balance || 0);
        }
      }
    });
    
    // Net Profit = Total Income - Total Expenses
    // This equals: Net Profit = -sum(income balances) - sum(expense balances) = -(sum of all balances)
    // This should match Income & Expense page: totalBalance = sum of all account.balance
    // So Net Profit = -totalBalance (from Income & Expense page)
    const profit = totalIncome - totalExpenses;
    
    // #region agent log
    const allBalancesSum = processedExpenseAccounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
    fetch('http://127.0.0.1:7242/ingest/416a5fc5-599f-40c3-9ff9-05c0e4dd1818',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BalanceSheet.tsx:850',message:'netProfit calculation with balances',data:{totalIncome,totalExpenses,profit,allBalancesSum,expectedProfit:-allBalancesSum,difference:profit+allBalancesSum,incomeGroupIds:Array.from(incomeGroupIds),expenseGroupIds:Array.from(expenseGroupIds),unclassifiedAccounts:unclassifiedAccounts.map(a=>({id:a.id,name:a.name,balance:a.balance})),totalAccounts:processedExpenseAccounts.length},timestamp:Date.now(),sessionId:'debug-session',runId:'net-profit-fix-v3',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion agent log
    
    return round2(profit);
  }, [processedExpenseAccounts, processedExpenseGroups]);

  // Debug: Calculate total debit and credit from all vouchers to verify double-entry
  const doubleEntryCheck = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    const problematicVouchers: Array<{
      id: string;
      type: string;
      voucherNumber: string;
      date: Date | null;
      debit: number;
      credit: number;
      difference: number;
      description: string;
    }> = [];
    
    filteredVouchers.forEach(v => {
      const amount = Number(v.total || v.amount || 0);
      const subTotal = Number(v.subTotal || amount);
      let voucherDebit = 0;
      let voucherCredit = 0;
      
      if (v.type === 'sale') {
        // Sale: Debit Party (total amount), Credit Sales Account (subtotal) + Tax Account (tax)
        const saleSubTotal = subTotal - (v.discount || 0);
        // Calculate tax from lineItems if not directly available
        let taxAmount = Number(v.taxAmount || v.tax || 0);
        if (taxAmount === 0 && v.lineItems && Array.isArray(v.lineItems)) {
          taxAmount = v.lineItems.reduce((sum: number, li: any) => sum + Number(li.taxAmount || 0), 0);
        }
        const saleTotal = saleSubTotal + taxAmount;
        voucherDebit = saleTotal; // Party receives total
        voucherCredit = saleTotal; // Sales account + Tax account = total
        totalDebit += saleTotal;
        totalCredit += saleTotal;
      } else if (v.type === 'purchase') {
        // Purchase: Debit Purchase Account (subtotal) + Tax Account (tax), Credit Party (total)
        const purchaseSubTotal = subTotal - (v.discount || 0);
        // Calculate tax from lineItems if not directly available
        let taxAmount = Number(v.taxAmount || v.tax || 0);
        if (taxAmount === 0 && v.lineItems && Array.isArray(v.lineItems)) {
          taxAmount = v.lineItems.reduce((sum: number, li: any) => sum + Number(li.taxAmount || 0), 0);
        }
        const purchaseTotal = purchaseSubTotal + taxAmount;
        voucherDebit = purchaseTotal; // Purchase account + Tax account = total
        voucherCredit = purchaseTotal; // Party pays total
        totalDebit += purchaseTotal;
        totalCredit += purchaseTotal;
      } else if (v.type === 'payment_in') {
        // Payment In: Debit Account, Credit Party
        voucherDebit = amount;
        voucherCredit = amount;
        totalDebit += amount;
        totalCredit += amount;
      } else if (v.type === 'payment_out') {
        // Payment Out: Debit Party/Staff, Credit Account
        voucherDebit = amount;
        voucherCredit = amount;
        totalDebit += amount;
        totalCredit += amount;
      } else if (v.type === 'direct_income') {
        // Direct Income: Debit Account, Credit Income Account
        voucherDebit = amount;
        voucherCredit = amount;
        totalDebit += amount;
        totalCredit += amount;
      } else if (v.type === 'direct_expense') {
        // Direct Expense: Debit Expense Account, Credit Account
        voucherDebit = amount;
        voucherCredit = amount;
        totalDebit += amount;
        totalCredit += amount;
      } else if (v.type === 'contra') {
        // Contra: Debit To Account, Credit From Account
        voucherDebit = amount;
        voucherCredit = amount;
        totalDebit += amount;
        totalCredit += amount;
      } else if (v.type === 'journal' && Array.isArray(v.entries)) {
        // Journal: Sum of all entries
        v.entries.forEach((entry: any) => {
          const debit = Number(entry.debit || 0);
          const credit = Number(entry.credit || 0);
          voucherDebit += debit;
          voucherCredit += credit;
          totalDebit += debit;
          totalCredit += credit;
        });
      } else if (v.type === 'add_salary') {
        // Add Salary: handled in journal entries
        if (v.entries && Array.isArray(v.entries)) {
          v.entries.forEach((entry: any) => {
            const debit = Number(entry.debit || 0);
            const credit = Number(entry.credit || 0);
            voucherDebit += debit;
            voucherCredit += credit;
            totalDebit += debit;
            totalCredit += credit;
          });
        }
      } else if (v.type === 'add_salary') {
        // Add Salary: handled in journal entries
        if (v.entries && Array.isArray(v.entries)) {
          v.entries.forEach((entry: any) => {
            const debit = Number(entry.debit || 0);
            const credit = Number(entry.credit || 0);
            voucherDebit += debit;
            voucherCredit += credit;
            totalDebit += debit;
            totalCredit += credit;
          });
        }
      }
      
      // Check if this voucher is unbalanced
      const voucherDiff = Math.abs(voucherDebit - voucherCredit);
      if (voucherDiff > 0.01) {
        const txDate = safeToDate(v.date);
        
        // Build description with group names
        const descriptionParts: string[] = [];
        if (v.voucherNumber) descriptionParts.push(`Voucher: ${v.voucherNumber}`);
        
        // Get party info with group
        if (v.partyId) {
          const party = processedParties.find(p => p.id === v.partyId);
          if (party) {
            const groupName = party.groupId ? processedGroups.find(g => g.id === party.groupId)?.name : 'Ungrouped';
            descriptionParts.push(`Party: ${party.name} (Group: ${groupName || 'Ungrouped'})`);
          } else {
            descriptionParts.push(`Party: ${v.partyId}`);
          }
        }
        
        // Get account info with group
        if (v.accountId) {
          const account = processedAccounts.find(a => a.id === v.accountId);
          if (account) {
            const groupName = account.groupId ? processedAccountGroups.find(g => g.id === account.groupId)?.name : 'Ungrouped';
            descriptionParts.push(`Account: ${account.accountName} (Group: ${groupName || 'Ungrouped'})`);
          } else {
            descriptionParts.push(`Account: ${v.accountId}`);
          }
        }
        
        // Get staff info with group
        if (v.staffId) {
          const staff = processedStaff.find(s => s.id === v.staffId);
          if (staff) {
            const groupName = staff.groupId ? processedStaffGroups.find(g => g.id === staff.groupId)?.name : 'Ungrouped';
            descriptionParts.push(`Staff: ${staff.name} (Group: ${groupName || 'Ungrouped'})`);
          } else {
            descriptionParts.push(`Staff: ${v.staffId}`);
          }
        }
        
        // Get tax info with group
        if (v.taxAccountId) {
          const tax = processedTaxes.find(t => t.id === v.taxAccountId);
          if (tax) {
            const groupName = tax.groupId ? processedTaxGroups.find(g => g.id === tax.groupId)?.name : 'Ungrouped';
            descriptionParts.push(`Tax: ${tax.name} (Group: ${groupName || 'Ungrouped'})`);
          } else {
            descriptionParts.push(`Tax: ${v.taxAccountId}`);
          }
        }
        
        // Get contra account info with groups
        if (v.type === 'contra') {
          if (v.fromAccountId) {
            const fromAcc = processedAccounts.find(a => a.id === v.fromAccountId);
            if (fromAcc) {
              const groupName = fromAcc.groupId ? processedAccountGroups.find(g => g.id === fromAcc.groupId)?.name : 'Ungrouped';
              descriptionParts.push(`From Account: ${fromAcc.accountName} (Group: ${groupName || 'Ungrouped'})`);
            }
          }
          if (v.toAccountId) {
            const toAcc = processedAccounts.find(a => a.id === v.toAccountId);
            if (toAcc) {
              const groupName = toAcc.groupId ? processedAccountGroups.find(g => g.id === toAcc.groupId)?.name : 'Ungrouped';
              descriptionParts.push(`To Account: ${toAcc.accountName} (Group: ${groupName || 'Ungrouped'})`);
            }
          }
        }
        
        // Get expense/income account info with groups
        if (v.expenseAccountId) {
          const expAcc = processedExpenseAccounts.find(e => e.id === v.expenseAccountId);
          if (expAcc) {
            descriptionParts.push(`Expense Account: ${expAcc.name}`);
          }
        }
        if (v.incomeAccountId) {
          const incAcc = processedExpenseAccounts.find(e => e.id === v.incomeAccountId);
          if (incAcc) {
            descriptionParts.push(`Income Account: ${incAcc.name}`);
          }
        }
        
        // Check journal entries for account groups
        if ((v.type === 'journal' || v.type === 'add_salary') && Array.isArray(v.entries)) {
          const entryAccounts = v.entries.map((e: any) => {
            const acc = processedAccounts.find(a => a.id === e.accountId);
            if (acc) {
              const groupName = acc.groupId ? processedAccountGroups.find(g => g.id === acc.groupId)?.name : 'Ungrouped';
              return `${acc.accountName} (Group: ${groupName || 'Ungrouped'})`;
            }
            return e.accountId || 'Unknown';
          }).filter(Boolean);
          if (entryAccounts.length > 0) {
            descriptionParts.push(`Journal Accounts: ${entryAccounts.join(', ')}`);
          }
        }
        
        problematicVouchers.push({
          id: v.id || '',
          type: v.type,
          voucherNumber: v.voucherNumber || '',
          date: txDate,
          debit: round2(voucherDebit),
          credit: round2(voucherCredit),
          difference: round2(voucherDiff),
          description: `${v.type.toUpperCase()}${descriptionParts.length > 0 ? ' - ' + descriptionParts.join(' | ') : ''}`
        });
      }
    });
    
    return {
      totalDebit: round2(totalDebit),
      totalCredit: round2(totalCredit),
      isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
      difference: round2(Math.abs(totalDebit - totalCredit)),
      problematicVouchers: problematicVouchers.sort((a, b) => b.difference - a.difference)
    };
  }, [filteredVouchers, processedParties, processedAccounts, processedStaff, processedTaxes, processedGroups, processedAccountGroups, processedTaxGroups, processedStaffGroups]);

  const filtered = useMemo(() => {
    let sortedData = [...balanceSheetData];

    // Apply sorting based on sortBy
    if (sortBy === 'balance') {
      if (sortDesc) {
        sortedData.sort((a, b) => b.amount - a.amount);
      } else {
        sortedData.sort((a, b) => a.amount - b.amount);
      }
    } else if (sortBy === 'entity') {
      if (sortDesc) {
        sortedData.sort((a, b) => b.accountName.localeCompare(a.accountName));
      } else {
        sortedData.sort((a, b) => a.accountName.localeCompare(b.accountName));
      }
    } else if (sortBy === 'date') {
      // For date sorting, we need to get the latest transaction date for each entity
      // Since we don't have direct date info, we'll sort by entity name as fallback
      // But first, let's try to get dates from transactions
      sortedData.sort((a, b) => {
        const aTransactions = filteredVouchers.filter(v => 
          v.partyId === a.accountId || v.staffId === a.accountId || v.accountId === a.accountId ||
          v.fromAccountId === a.accountId || v.toAccountId === a.accountId || v.taxAccountId === a.accountId ||
          (v.entries || []).some((e: any) => e.accountId === a.accountId)
        );
        const bTransactions = filteredVouchers.filter(v => 
          v.partyId === b.accountId || v.staffId === b.accountId || v.accountId === b.accountId ||
          v.fromAccountId === b.accountId || v.toAccountId === b.accountId || v.taxAccountId === b.accountId ||
          (v.entries || []).some((e: any) => e.accountId === b.accountId)
        );
        
        const aLatestDate = aTransactions.length > 0 
          ? Math.max(...aTransactions.map(t => safeToDate(t.date)?.getTime() || 0))
          : 0;
        const bLatestDate = bTransactions.length > 0 
          ? Math.max(...bTransactions.map(t => safeToDate(t.date)?.getTime() || 0))
          : 0;
        
        if (sortDesc) {
          return bLatestDate - aLatestDate;
        } else {
          return aLatestDate - bLatestDate;
        }
      });
    }

    // Filter to show only group totals (isGroup: true)
      sortedData = sortedData.filter(r => r.isGroup === true);

    // Filter by entity type (both groups and individual accounts)
    if (entityFilter !== 'all') {
      sortedData = sortedData.filter(r => {
        // Filter both groups and individual accounts by entity type
        if (r.entityType === entityFilter) return true;
        
        // Special case: Opening Balance filter in group view should also show Equity group
        // (since Equity group includes opening balance)
        if ((entityFilter as string) === 'opening_balance' && r.isGroup && r.accountId === 'group_party_equity') {
          return true;
        }
        
        return false;
      });
    }

    if (query) {
      return sortedData.filter(
        (row) =>
          row.accountName.toLowerCase().includes(query.toLowerCase()) ||
          row.group.toLowerCase().includes(query.toLowerCase())
      );
    }

    return sortedData;
  }, [balanceSheetData, query, sortDesc, sortBy, filteredVouchers, entityFilter]);
  
  // Helper function to get accounts for a group
  const getAccountsForGroup = useCallback((groupRow: BalanceSheetRow): BalanceSheetRow[] => {
    if (!groupRow.isGroup) return [];
    
    // Extract group type and ID from accountId (e.g., "group_party_equity" -> "party", "equity")
    const match = groupRow.accountId.match(/^group_(party|account|tax|staff)_(.+)$/);
    if (!match) return [];
    
    const [, groupType, groupId] = match;
    const groupName = groupRow.group;
    
    // Get all accounts that belong to this group
    return balanceSheetData.filter(acc => {
      if (acc.isGroup) return false; // Exclude nested groups
      
      // Match by group name and entity type
      if (acc.group === groupName && acc.entityType === groupType) {
        return true;
      }
      
      // Special handling for specific group IDs
      if (groupType === 'party' && groupId === 'equity') {
        return acc.group === groupName && (acc.entityType === 'party' || acc.entityType === 'opening_balance');
        }
      
      return false;
      });
  }, [balanceSheetData]);

  // Main groups (Assets, Liabilities, Equity) for collapsed view
  const mainGroupRows = useMemo((): BalanceSheetRow[] => {
    const byCategory: Record<string, number> = {};
    filtered.forEach((r) => {
      const groupAccounts = getAccountsForGroup(r);
      let sum = 0;
      groupAccounts.forEach((acc) => {
        if (acc.category === "Assets") sum += acc.amount || 0;
        else if (acc.category === "Liabilities" || acc.category === "Equity") sum += Math.abs(acc.amount || 0);
      });
      const cat = r.category;
      if (!byCategory[cat]) byCategory[cat] = 0;
      byCategory[cat] += sum;
    });
    const rows: BalanceSheetRow[] = [];
    if ((byCategory["Assets"] || 0) > 0) {
      rows.push({
        accountId: "main_Assets",
        accountName: "Assets",
        group: "Assets",
        category: "Assets",
        amount: byCategory["Assets"],
        isGroup: true,
      });
    }
    if ((byCategory["Liabilities"] || 0) > 0) {
      rows.push({
        accountId: "main_Liabilities",
        accountName: "Liabilities",
        group: "Liabilities",
        category: "Liabilities",
        amount: byCategory["Liabilities"],
        isGroup: true,
      });
    }
    if ((byCategory["Equity"] || 0) > 0) {
      rows.push({
        accountId: "main_Equity",
        accountName: "Equity",
        group: "Equity",
        category: "Equity",
        amount: byCategory["Equity"],
        isGroup: true,
      });
    }
    return rows;
  }, [filtered, getAccountsForGroup]);

  const getSubGroupsForMain = useCallback(
    (mainCategory: string): BalanceSheetRow[] => filtered.filter((r) => r.category === mainCategory),
    [filtered]
  );

  const totals = useMemo(() => {
    // Calculate totals from regular rows (Net Profit excluded, shown separately)
    // IMPORTANT: Always use individual accounts for totals, not group totals
    // This ensures Detail Wise and Group Wise show the same totals
    const allIndividualAccounts = balanceSheetData.filter(r => !r.isGroup && r.accountId !== 'net-profit');
    
    const assets = allIndividualAccounts.filter(r => r.category === 'Assets').reduce((sum, r) => sum + (r.amount || 0), 0);
    const liab = allIndividualAccounts.filter(r => r.category === 'Liabilities').reduce((sum, r) => sum + (r.amount || 0), 0);
    const equity = allIndividualAccounts.filter(r => r.category === 'Equity').reduce((sum, r) => sum + (r.amount || 0), 0);
    
    // Balance Sheet Equation: Assets = Liabilities + Equity + Net Profit
    // Net Profit is calculated separately from Income - Expenses (Nominal accounts)
    const totalAssets = round2(assets);
    const totalLiabEquity = round2(liab + equity + netProfit);
    
    // फरक पत्ता लगाउने (Difference Calculation)
    const diff = round2(totalAssets - totalLiabEquity);
    
    // Suspense Account को side निर्धारण गर्ने
    const suspenseSide = diff > 0 ? 'Liabilities' : 'Assets';
    const suspenseAmount = Math.abs(diff);
    
    // Suspense Account लाई totals मा जोड्ने (यसले गर्दा totals balanced हुन्छ)
    const finalAssets = diff < 0 ? round2(totalAssets + suspenseAmount) : totalAssets;
    const finalLiabEquity = diff > 0 ? round2(totalLiabEquity + suspenseAmount) : totalLiabEquity;
    
    // Suspense Account include गरेपछि totals balanced हुनुपर्छ
    const isBalancedAfterSuspense = Math.abs(finalAssets - finalLiabEquity) < 0.01;
    
    return { 
      assets: finalAssets, // Suspense Account include गरेको Assets total
      liab: round2(liab),
      equity: round2(equity),
      netProfit: netProfit,
      totalLiabEquity: finalLiabEquity, // Suspense Account include गरेको Liabilities + Equity total
      difference: diff, // Original difference (before Suspense Account)
      suspenseSide: suspenseSide,
      suspenseAmount: suspenseAmount,
      isBalanced: Math.abs(diff) < 0.01 // Original balance check (before Suspense Account)
    };
  }, [filtered, netProfit]);

  const openDetail = (row: BalanceSheetRow) => {
    const accountTransactions = filteredVouchers.filter(v => 
        v.partyId === row.accountId || 
        v.staffId === row.accountId || 
        v.accountId === row.accountId || 
        v.fromAccountId === row.accountId ||
        v.toAccountId === row.accountId ||
        v.taxAccountId === row.accountId ||
        v.expenseAccountId === row.accountId ||
        (v.entries || []).some((e: any) => e.accountId === row.accountId)
      );
    setActiveRow({ ...row, transactions: accountTransactions });
  };
  const closeDrawer = () => setActiveRow(null);

  const handlePrintBalanceSheet = (expandAll: boolean) => {
    if (!company) return;
    
    const getDateText = (date: Date) => {
      if (dateSystem === 'BS') return formatDateBS(date);
      if (dateSystem === 'Both') return `${formatDate(date)} / ${formatDateBS(date)}`;
      return formatDate(date);
    };
    
    const dateRangeText = dateRange?.from 
      ? dateRange.to 
        ? `${getDateText(dateRange.from)} - ${getDateText(dateRange.to)}`
        : getDateText(dateRange.from)
      : "All Time";

    // Determine if we should show parent/sub group columns
    const showColumns = expandAll;
    
    // Helper function to format currency without Rs. symbol (for print)
    const formatAmountForPrint = (amount: number): string => {
      if (typeof amount !== 'number' || isNaN(amount) || amount === 0) return '-';
      return new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Math.abs(amount));
    };

    // Build table header based on mode
    const tableHeader: any[] = showColumns
      ? [{ text: 'Parent Group', bold: true, fontSize: 10 }, { text: 'Sub Group', bold: true, fontSize: 10 }, { text: 'Account Name', bold: true, fontSize: 10 }, { text: 'Assets', bold: true, alignment: 'right', fontSize: 10 }, { text: 'Liabilities + Equity', bold: true, alignment: 'right', fontSize: 10 }]
      : [{ text: 'Group', bold: true, fontSize: 10 }, { text: 'Assets', bold: true, alignment: 'right', fontSize: 10 }, { text: 'Liabilities + Equity', bold: true, alignment: 'right', fontSize: 10 }];

    const tableBody: any[] = [tableHeader];

    // Filter out Net Profit from regular rows (it will be shown separately)
    const rowsWithoutNetProfit = filtered.filter(row => row.accountId !== 'net-profit');
    
    if (expandAll) {
      // Expanded mode: Show groups with their accounts (with parent/sub group columns)
      rowsWithoutNetProfit.forEach(groupRow => {
        const groupAccounts = getAccountsForGroup(groupRow);
        
        // Calculate sum of all accounts in group separately for Assets and Liabilities
        let assetsSum = 0;
        let liabilitiesSum = 0;
        
        groupAccounts.forEach(acc => {
          if (acc.category === 'Assets') {
            assetsSum += acc.amount || 0;
          } else if (acc.category === 'Liabilities' || acc.category === 'Equity') {
            liabilitiesSum += acc.amount || 0;
          }
        });
        
        if (groupAccounts.length > 0) {
          // Add group row without amounts (when expanded, only accounts show amounts)
      tableBody.push([
            { text: groupRow.category, bold: true, fontSize: 9 },
            { text: groupRow.group || groupRow.accountName, bold: true, fontSize: 9 },
            { text: '', bold: true, fontSize: 9 },
            { text: '-', alignment: 'right', fontSize: 9 },
            { text: '-', alignment: 'right', fontSize: 9 }
          ]);
          
          // Add account rows
          groupAccounts.forEach(acc => {
            tableBody.push([
              { text: acc.category, fontSize: 8 },
              { text: acc.group, fontSize: 8 },
              { text: acc.accountName, fontSize: 8 },
              { text: acc.category === 'Assets' ? formatAmountForPrint(acc.amount) : '-', alignment: 'right', color: acc.category === 'Assets' ? 'green' : undefined, fontSize: 8 },
              { text: acc.category !== 'Assets' ? formatAmountForPrint(acc.amount) : '-', alignment: 'right', color: acc.category !== 'Assets' ? 'red' : undefined, fontSize: 8 }
      ]);
    });
        } else {
          // Group with no accounts - show as single row (use group row amount)
          tableBody.push([
            { text: groupRow.category, bold: true, fontSize: 9 },
            { text: groupRow.group || groupRow.accountName, bold: true, fontSize: 9 },
            { text: '', bold: true, fontSize: 9 },
            { text: groupRow.category === 'Assets' ? formatAmountForPrint(groupRow.amount) : '-', alignment: 'right', color: groupRow.category === 'Assets' ? 'green' : undefined, fontSize: 9 },
            { text: groupRow.category !== 'Assets' ? formatAmountForPrint(groupRow.amount) : '-', alignment: 'right', color: groupRow.category !== 'Assets' ? 'red' : undefined, fontSize: 9 }
          ]);
        }
      });
    } else {
      // Collapsed mode: Show only groups, no account column
      // Calculate sum of all accounts in each group (not net balance)
      rowsWithoutNetProfit.forEach(groupRow => {
        const groupAccounts = getAccountsForGroup(groupRow);
        
        // Calculate sum of Assets and Liabilities separately
        let assetsSum = 0;
        let liabilitiesSum = 0;
        
        groupAccounts.forEach(acc => {
          if (acc.category === 'Assets') {
            assetsSum += acc.amount || 0;
          } else if (acc.category === 'Liabilities' || acc.category === 'Equity') {
            liabilitiesSum += acc.amount || 0;
          }
        });
        
        // Show sum of all accounts, not net balance
        tableBody.push([
          { text: groupRow.accountName, fontSize: 9 },
          { text: assetsSum > 0 ? formatAmountForPrint(assetsSum) : '-', alignment: 'right', color: assetsSum > 0 ? 'green' : undefined, fontSize: 9 },
          { text: liabilitiesSum > 0 ? formatAmountForPrint(liabilitiesSum) : '-', alignment: 'right', color: liabilitiesSum > 0 ? 'red' : undefined, fontSize: 9 }
        ]);
      });
    }

    // Add TOTAL row (before Net Profit)
    // Adjust colSpan based on whether columns are shown
    const totalColSpan = showColumns ? 3 : 1;
    tableBody.push([
      { text: 'TOTAL', bold: true, colSpan: totalColSpan, fontSize: 10 },
      ...(showColumns ? [{}, {}] : []),
      { text: formatAmountForPrint(totals.assets), bold: true, alignment: 'right', color: 'green', fontSize: 10 },
      { text: formatAmountForPrint(totals.liab), bold: true, alignment: 'right', color: 'red', fontSize: 10 }
    ]);

    // Add Net Profit as special row below TOTAL (with color based on positive/negative)
    // Net Profit is part of Equity, so it goes on Liabilities + Equity side
    if (netProfit !== 0) {
      const netProfitColor = netProfit >= 0 ? 'green' : 'red';
      tableBody.push([
        { text: 'Net Profit', bold: true, colSpan: totalColSpan, fillColor: '#f3f4f6', fontSize: 10 },
        ...(showColumns ? [{}, {}] : []),
        { text: '-', alignment: 'right', fillColor: '#f3f4f6', fontSize: 10 },
        { text: formatAmountForPrint(netProfit), bold: true, alignment: 'right', color: netProfitColor, fillColor: '#f3f4f6', fontSize: 10 }
      ]);

      // Add final balanced total row below Net Profit
      // Equation: Assets = Liabilities + Equity (where Equity = Net Profit)
      const balanceText = totals.isBalanced 
        ? 'TOTAL (Assets = Liabilities + Equity) ✓'
        : `TOTAL (Assets = Liabilities + Equity) - Difference: ${formatAmountForPrint(Math.abs(totals.assets - totals.totalLiabEquity))}`;
      
      tableBody.push([
        { text: balanceText, bold: true, colSpan: totalColSpan, fillColor: totals.isBalanced ? '#d1fae5' : '#fee2e2', fontSize: 10 },
        ...(showColumns ? [{}, {}] : []),
        { text: formatAmountForPrint(totals.assets), bold: true, alignment: 'right', color: 'green', fillColor: totals.isBalanced ? '#d1fae5' : '#fee2e2', fontSize: 10 },
        { text: formatAmountForPrint(totals.totalLiabEquity), bold: true, alignment: 'right', color: 'red', fillColor: totals.isBalanced ? '#d1fae5' : '#fee2e2', fontSize: 10 }
      ]);
    }

    openPrintDirect({
      company: {
        name: company.name || '',
        pan: company.pan,
        phone: company.phone,
        address: company.address,
        decimalPlaces: company.decimalPlaces,
        showDrCr: company.showDrCr,
        showCurrencySymbol: company.showCurrencySymbol,
        logoUrl: company.logoUrl,
      },
      title: "Balance Sheet",
      context: "daybook",
      dateSystem: dateSystem as "AD" | "BS" | "Both",
      dateRangeText,
      vouchersCount: 0,
      openingBalance: 0,
      transactions: [],
      customContent: [
        {
          table: {
            widths: showColumns ? ['*', '*', '*', 'auto', 'auto'] : ['*', 'auto', 'auto'],
            body: tableBody,
          },
          layout: {
            hLineWidth: (i: number) => (i === 0 || i === tableBody.length) ? 1 : 0.5,
            vLineWidth: () => 0.5,
            paddingLeft: () => 4,
            paddingRight: () => 4,
            paddingTop: () => 4,
            paddingBottom: () => 4,
          },
        },
        { text: '\nNote: Balance Sheet follows the rule: Assets = Liabilities + Equity', fontSize: 10, italics: true, margin: [0, 10, 0, 0] }
      ]
    }, true);
  };
  
  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="pb-[72px] p-0.5 w-full h-full overflow-y-auto">
      <div className="p-0 space-y-3">
        <Card className="border-2 border-foreground/20">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-2xl">Balance Sheet</CardTitle>
            <div className="flex items-center gap-2">
              <MonthYearFilter dateRange={dateRange} setDateRange={setDateRange} dateSystem={dateSystem} />
              <Button variant="outline" size="sm" onClick={() => setShowPrintDialog(true)} className="flex items-center gap-2">
                <Printer className="h-4 w-4" /> Print
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    const mainIds = ["main_Assets", "main_Liabilities", "main_Equity"];
                    const subGroupIds = filtered.filter(r => getAccountsForGroup(r).length > 0).map(r => r.accountId);
                    const allIds = [...mainIds, ...subGroupIds];
                    const allExpanded = allIds.every(id => expandedGroups.has(id));
                    
                    if (allExpanded) {
                      setExpandedGroups(new Set());
                    } else {
                      setExpandedGroups(new Set(allIds));
                    }
                  }}
                  className="flex items-center gap-2"
                >
                  {["main_Assets", "main_Liabilities", "main_Equity", ...filtered.filter(r => getAccountsForGroup(r).length > 0).map(r => r.accountId)].every(id => expandedGroups.has(id)) ? (
                    <>
                      <ChevronUp className="h-4 w-4" /> Collapse All
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" /> Expand All
                    </>
                  )}
                </Button>
              </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 opacity-70" />
                    <Input
                      placeholder="Search account or group…"
                      className="pl-8"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <select
                    value={entityFilter}
                    onChange={(e) => setEntityFilter(e.target.value as 'all' | 'party' | 'account' | 'staff' | 'tax' | 'income' | 'expense')}
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="all">All Entities</option>
                    <option value="party">Party</option>
                    <option value="account">Bank/Account</option>
                    <option value="staff">Staff</option>
                    <option value="tax">Tax</option>
                    <option value="opening_balance">Opening Balance</option>
                  </select>
                  <div className="flex items-center gap-2">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'entity' | 'balance' | 'date')}
                      className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    >
                      <option value="entity">Sort by Entity</option>
                      <option value="balance">Sort by Balance</option>
                      <option value="date">Sort by Date</option>
                    </select>
                    <Button variant="outline" size="sm" onClick={() => setSortDesc((s) => !s)}>
                      <ArrowUpDown className="mr-2 h-4 w-4" /> {sortDesc ? "Desc" : "Asc"}
                    </Button>
                  </div>
                </div>
              </div>
              
                <div className="rounded-2xl border w-full overflow-x-auto">
                  <Table>
                    <TableCaption>Group totals - Summary view</TableCaption>
                    <TableHeader>
                      <TableRow>
                        {expandedGroups.size > 0 ? (
                          <>
                            <TableHead>Parent Group</TableHead>
                            <TableHead>Sub Group</TableHead>
                            <TableHead>Account Name</TableHead>
                            <TableHead className="text-right">Assets</TableHead>
                            <TableHead className="text-right">Liabilities + Equity</TableHead>
                          </>
                        ) : (
                          <>
                        <TableHead>Group</TableHead>
                            <TableHead>Account</TableHead>
                        <TableHead className="text-right">Assets</TableHead>
                        <TableHead className="text-right">Liabilities + Equity</TableHead>
                          </>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expandedGroups.size === 0 ? (
                        // Collapsed: show main groups only (Assets, Liabilities, Equity)
                        mainGroupRows.map((main) => {
                          const assetsVal = main.category === 'Assets' ? (main.amount || 0) : 0;
                          const liabVal = (main.category === 'Liabilities' || main.category === 'Equity') ? (main.amount || 0) : 0;
                          const hasSubGroups = getSubGroupsForMain(main.category).some(r => getAccountsForGroup(r).length > 0);
                          return (
                            <TableRow
                              key={main.accountId}
                              className="bg-muted/40 font-semibold cursor-pointer hover:bg-muted/60"
                              onClick={() => {
                                if (hasSubGroups) {
                                  setExpandedGroups(prev => new Set([...prev, main.accountId]));
                                }
                              }}
                            >
                              <TableCell className="font-medium text-primary">
                                <div className="flex items-center gap-2">
                                  {hasSubGroups && <ChevronRight className="h-4 w-4" />}
                                  <Users className="h-4 w-4" />
                                  {main.accountName}
                                </div>
                              </TableCell>
                              <TableCell></TableCell>
                              <TableCell className="text-right tabular-nums">
                                {assetsVal > 0 ? toNepaliCurrency(assetsVal) : '-'}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {liabVal > 0 ? toNepaliCurrency(liabVal) : '-'}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        // Expanded: main groups + sub-groups + accounts
                        mainGroupRows.flatMap((main) => {
                          const mainExpanded = expandedGroups.has(main.accountId);
                          const subGroups = getSubGroupsForMain(main.category);
                          const hasSubGroups = subGroups.some(r => getAccountsForGroup(r).length > 0);
                          const assetsVal = main.category === 'Assets' ? (main.amount || 0) : 0;
                          const liabVal = (main.category === 'Liabilities' || main.category === 'Equity') ? (main.amount || 0) : 0;
                          const els: React.ReactNode[] = [];
                          els.push(
                            <TableRow
                              key={main.accountId}
                              className="bg-muted/40 font-semibold cursor-pointer hover:bg-muted/60"
                              onClick={() => {
                                setExpandedGroups(prev => {
                                  const next = new Set(prev);
                                  if (next.has(main.accountId)) next.delete(main.accountId);
                                  else next.add(main.accountId);
                                  return next;
                                });
                              }}
                            >
                              <TableCell className="font-medium text-primary">
                                <div className="flex items-center gap-2">
                                  {hasSubGroups && (mainExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                                  <Users className="h-4 w-4" />
                                  {main.accountName}
                                </div>
                              </TableCell>
                              <TableCell className="font-medium text-primary"></TableCell>
                              <TableCell className="font-medium text-primary"></TableCell>
                              <TableCell className="text-right tabular-nums">
                                {!mainExpanded && assetsVal > 0 ? toNepaliCurrency(assetsVal) : '-'}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {!mainExpanded && liabVal > 0 ? toNepaliCurrency(liabVal) : '-'}
                              </TableCell>
                            </TableRow>
                          );
                          if (mainExpanded) {
                            subGroups.forEach((r) => {
                              const isSubExpanded = expandedGroups.has(r.accountId);
                              const groupAccounts = getAccountsForGroup(r);
                              let assetsSum = 0, liabilitiesSum = 0;
                              groupAccounts.forEach(acc => {
                                if (acc.category === 'Assets') assetsSum += acc.amount || 0;
                                else if (acc.category === 'Liabilities' || acc.category === 'Equity') liabilitiesSum += acc.amount || 0;
                              });
                              const hasAccounts = groupAccounts.length > 0;
                              els.push(
                                <TableRow
                                  key={r.accountId}
                                  className="bg-muted/30 font-semibold cursor-pointer hover:bg-muted/50"
                                  onClick={() => {
                                    if (hasAccounts) {
                                      setExpandedGroups(prev => {
                                        const next = new Set(prev);
                                        if (next.has(r.accountId)) next.delete(r.accountId);
                                        else next.add(r.accountId);
                                        return next;
                                      });
                                    }
                                  }}
                                >
                                  <TableCell className="pl-6 font-medium text-primary">{main.category}</TableCell>
                                  <TableCell className="font-medium text-primary">
                                    <div className="flex items-center gap-2">
                                      {hasAccounts && (isSubExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                                      {r.group || r.accountName}
                                    </div>
                                  </TableCell>
                                  <TableCell className="font-medium text-primary">{isSubExpanded ? '' : r.accountName}</TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {isSubExpanded ? '-' : (assetsSum > 0 ? toNepaliCurrency(assetsSum) : '-')}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {isSubExpanded ? '-' : (liabilitiesSum > 0 ? toNepaliCurrency(liabilitiesSum) : '-')}
                                  </TableCell>
                                </TableRow>
                              );
                              if (isSubExpanded && hasAccounts) {
                                groupAccounts.forEach((acc) => (
                                  els.push(
                                    <TableRow
                                      key={acc.accountId}
                                      className="bg-muted/20 text-sm cursor-pointer hover:bg-muted/40"
                                      onClick={(e) => { e.stopPropagation(); openDetail(acc); }}
                                    >
                                      <TableCell className="pl-8 text-muted-foreground">{acc.category}</TableCell>
                                      <TableCell className="pl-8 text-muted-foreground">{acc.group}</TableCell>
                                      <TableCell className="pl-8 font-medium">{acc.accountName}</TableCell>
                                      <TableCell className="text-right tabular-nums">
                                        {acc.category === 'Assets' ? toNepaliCurrency(acc.amount || 0) : '-'}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums">
                                        {acc.category !== 'Assets' ? toNepaliCurrency(acc.amount || 0) : '-'}
                                      </TableCell>
                                    </TableRow>
                                  )
                                ));
                              }
                            });
                          }
                          return els;
                        })
                      )}
                      {/* यदि हिसाब मिलेको छैन भने Suspense Account रो देखाउने */}
                      {!totals.isBalanced && (
                        <TableRow className="bg-red-50 italic">
                          <TableCell colSpan={expandedGroups.size > 0 ? 3 : 2} className="font-bold text-red-700">⚠️ Suspense Account (Difference)</TableCell>
                          <TableCell className="text-right text-red-600">
                            {totals.suspenseSide === 'Assets' ? toNepaliCurrency(totals.suspenseAmount) : "-"}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            {totals.suspenseSide === 'Liabilities' ? toNepaliCurrency(totals.suspenseAmount) : "-"}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                          <TableCell colSpan={expandedGroups.size > 0 ? 3 : 2} className="font-bold">TOTAL</TableCell>
                          <TableCell className="text-right font-bold tabular-nums text-green-600">{toNepaliCurrency(totals.assets)}</TableCell>
                          <TableCell className="text-right font-bold tabular-nums text-red-600">{toNepaliCurrency(totals.liab)}</TableCell>
                      </TableRow>
                      {netProfit !== 0 && (
                        <>
                          <TableRow className="bg-muted/30 border-t-2 border-foreground/20">
                            <TableCell colSpan={expandedGroups.size > 0 ? 3 : 2} className="font-bold text-foreground">
                              {netProfit >= 0 ? 'Net Profit' : 'Net Loss'}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">-</TableCell>
                            <TableCell className={`text-right font-bold tabular-nums ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {toNepaliCurrency(netProfit)}
                            </TableCell>
                          </TableRow>
                          <TableRow className={`bg-muted/50 border-t-2 border-foreground/30 ${totals.isBalanced ? 'border-green-500' : 'border-orange-500'}`}>
                            <TableCell colSpan={expandedGroups.size > 0 ? 3 : 2} className="font-bold text-foreground">
                              TOTAL (Assets = Liabilities + Equity)
                              {!totals.isBalanced && (
                                <span className="text-orange-600 text-xs ml-2">
                                  (Balanced with Suspense Account)
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-bold tabular-nums text-green-600">{toNepaliCurrency(totals.assets)}</TableCell>
                            <TableCell className="text-right font-bold tabular-nums text-red-600">{toNepaliCurrency(totals.totalLiabEquity)}</TableCell>
                          </TableRow>
                        </>
                      )}
                    </TableFooter>
                  </Table>
                </div>
            <div className="mt-2 space-y-2">
              <p className="text-sm opacity-80">
                Note: Balance Sheet follows the rule: Assets = Liabilities + Equity
              </p>
              
              {/* Opening Balance Audit Warning */}
              {!openingBalanceAudit.isBalanced && (
                <div className="p-4 mb-4 bg-orange-50 border-l-4 border-orange-500 rounded">
                  <h3 className="text-orange-800 font-bold flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    ⚠️ Opening Balance Mismatch!
                  </h3>
                  <p className="text-sm text-orange-700 mt-2">
                    तपाईंको ओपनिङ डेबिट र क्रेडिट बराबर छैन।
                    <br />
                    <strong>Total Opening Dr: {toNepaliCurrency(openingBalanceAudit.totalOpeningDr)}</strong>
                    <br />
                    <strong>Total Opening Cr: {toNepaliCurrency(openingBalanceAudit.totalOpeningCr)}</strong>
                    <br />
                    <strong className="text-red-700">Difference: {toNepaliCurrency(openingBalanceAudit.diff)}</strong>
                  </p>
                  <p className="text-xs mt-2 italic text-orange-600">
                    * यसलाई मिलाउन एउटा "Opening Balance Ledger" बनाएर बाँकी रकम त्यसमा राख्नुहोस्।
                  </p>
                </div>
              )}
              
              {netProfit !== 0 && (
                <div className="text-sm space-y-1 p-2 bg-muted/30 rounded-md">
                  <p className="font-semibold">
                    {netProfit >= 0 ? '✓ Net Profit' : '⚠️ Net Loss'} Explanation:
                  </p>
                  <p className={netProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {netProfit >= 0 
                      ? `Green value (${toNepaliCurrency(netProfit)}) indicates Net Profit - your income exceeded expenses.`
                      : `Red value (${toNepaliCurrency(netProfit)}) indicates Net Loss - your expenses exceeded income.`
                    }
                  </p>
                </div>
              )}
              
              <div className="text-sm space-y-2 p-3 bg-muted/30 rounded-md border">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">
                    {doubleEntryCheck.isBalanced ? '✓' : '⚠️'} Double-Entry Check:
                  </p>
                  {!doubleEntryCheck.isBalanced && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowDifferenceDetails(!showDifferenceDetails)}
                      className="h-auto p-1"
                    >
                      {showDifferenceDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
                {doubleEntryCheck.isBalanced ? (
                  <p className="text-green-600">
                    <strong>Debit = Credit = {toNepaliCurrency(doubleEntryCheck.totalDebit)}</strong> - All transactions are properly balanced.
                  </p>
                ) : (
                  <>
                    <div className="bg-destructive/10 border-2 border-destructive/30 rounded-lg p-3 shadow-sm">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-red-600 font-bold text-base">
                            Unbalanced Transactions Found!
                          </p>
                          <div className="mt-2 space-y-1 text-sm">
                            <div className="flex items-center gap-4 flex-wrap">
                              <span className="text-green-700 font-semibold">Total Debit: <strong>{toNepaliCurrency(doubleEntryCheck.totalDebit)}</strong></span>
                              <span className="text-red-700 font-semibold">Total Credit: <strong>{toNepaliCurrency(doubleEntryCheck.totalCredit)}</strong></span>
                            </div>
                            <div className="bg-red-100 border border-red-300 rounded px-2 py-1 inline-block">
                              <span className="text-red-800 font-bold text-base">
                                Total Difference: {toNepaliCurrency(doubleEntryCheck.difference)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    {showDifferenceDetails && doubleEntryCheck.problematicVouchers.length > 0 && (
                      <div className="mt-3 space-y-2 max-h-80 overflow-y-auto border rounded-lg p-2 bg-background">
                        <p className="text-sm font-bold text-red-600 mb-2 sticky top-0 bg-background pb-1 border-b">
                          Problematic Vouchers ({doubleEntryCheck.problematicVouchers.length}):
                        </p>
                        {doubleEntryCheck.problematicVouchers.map((v, idx) => (
                          <div key={idx} className="text-xs bg-muted/50 p-3 rounded border border-destructive/30 hover:bg-muted transition-colors">
                            <div className="flex justify-between items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="font-bold text-red-700">{v.type.toUpperCase()}</span>
                                  {v.voucherNumber && <span className="text-muted-foreground">#{v.voucherNumber}</span>}
                                  {v.date && <span className="text-muted-foreground">({formatDate(v.date)})</span>}
                                </div>
                                <div className="bg-background/80 p-2 rounded mt-1 border">
                                  <p className="text-[11px] leading-relaxed break-words whitespace-pre-wrap">{v.description}</p>
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0 border-l pl-3 ml-2">
                                <div className="space-y-0.5">
                                  <p className="text-green-700 font-semibold">Dr: {toNepaliCurrency(v.debit)}</p>
                                  <p className="text-red-700 font-semibold">Cr: {toNepaliCurrency(v.credit)}</p>
                                  <div className="bg-red-100 border border-red-300 rounded px-1.5 py-0.5 mt-1">
                                    <p className="text-red-800 font-bold">Diff: {toNepaliCurrency(v.difference)}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {showDifferenceDetails && doubleEntryCheck.problematicVouchers.length === 0 && (
                      <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                        <p className="text-xs text-yellow-800">
                          No individual vouchers found with imbalance. The difference may be due to:
                        </p>
                        <ul className="text-xs text-yellow-800 list-disc list-inside mt-1 space-y-0.5">
                          <li>Opening balances not properly balanced</li>
                          <li>Account classification issues</li>
                          <li>Rounding differences accumulating over time</li>
                          <li>Missing or incomplete journal entries</li>
                        </ul>
                      </div>
                    )}
                  </>
                )}
                <p className="text-xs opacity-70 mt-2 pt-2 border-t">
                  Note: Balance Sheet difference ({toNepaliCurrency(Math.abs(totals.assets - totals.totalLiabEquity))}) may differ from Double-Entry Check difference due to opening balances, 
                  account classifications, or Net Profit calculations.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DETAIL DRAWER */}
      <Drawer open={!!activeRow} onClose={closeDrawer}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>
              {activeRow?.accountName} {activeRow?.group ? `· ${activeRow.group}` : ""}
            </DrawerTitle>
          </DrawerHeader>
          <ScrollArea className="px-6 pb-4 h-[60vh]">
            {activeRow && (
              <TransactionsTable 
                context="party"
                contextId={activeRow.accountId}
                transactions={activeRow.transactions || []}
                openingBalance={activeRow.openingBalance}
              />
            )}
          </ScrollArea>
          <DrawerFooter className="flex items-center justify-between">
            <DrawerClose asChild>
              <Button variant="outline">Close</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* PRINT OPTIONS DIALOG */}
      <PrintOptionsDialog
        open={showPrintDialog}
        onOpenChange={setShowPrintDialog}
        onSelect={(option) => {
          // For BalanceSheet, both options print the same (already flat structure)
          handlePrintBalanceSheet(option === 'expand');
        }}
      />
    </div>
  );
}
