"use client";

import React, { useMemo, useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useDate } from "@/hooks/useDate";
import usePermissions from "@/hooks/usePermissions";
import { useCompany } from "@/hooks/useCompany";
import { useIsMobile } from '@/hooks/use-mobile';
import { Printer, RotateCw, ChevronRight, ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { startOfDay, endOfDay, isSameDay } from "date-fns";
import type { DateRange } from "@/components/ui/ad-calendar";

import { MonthYearFilter } from "@/components/dashboard/MonthYearFilter";
import { openPrintDirect } from "@/lib/printDirect";
import { ShoppingBag, ShoppingCart, BookText, FileDigit, Landmark, TrendingUp, TrendingDown } from "lucide-react";

// Helper function to safely convert date
const safeToDate = (date: any): Date | null => {
    if (!date) return null;
    if (date instanceof Date) return date;
    if (date.toDate instanceof Function) return date.toDate();
    const parsed = new Date(date);
    return isNaN(parsed.getTime()) ? null : parsed;
};

type FinancialSummaryCardsProps = {
    vouchers: any[];
    processedParties: any[];
    processedStaff: any[];
    processedTaxes: any[];
    processedAccounts: any[];
    processedItems: any[];
    expenseAccounts: any[];
    loading?: boolean;
    showDetails?: boolean; // Show "View Details" buttons
    compact?: boolean; // Compact layout for report page
};

// Custom MonthYearFilter wrapper for report page with overflow handling
const ReportMonthYearFilter = ({ dateRange, setDateRange, dateSystem }: { dateRange: DateRange | undefined, setDateRange: (range: DateRange | undefined) => void, dateSystem: string }) => {
    return (
        <div className="flex-shrink-0 min-w-0 max-w-[110px]">
            <div className="[&_button]:h-7 [&_button]:px-2 [&_button]:text-xs [&_button]:font-normal [&_button]:whitespace-nowrap [&_button]:overflow-hidden [&_button]:max-w-full [&_button]:flex [&_button]:items-center [&_button]:gap-1 [&_button_svg]:h-3 [&_button_svg]:w-3 [&_button_svg]:flex-shrink-0 [&_button>*:not(svg)]:truncate [&_button>*:not(svg)]:max-w-[60px]">
                <MonthYearFilter dateRange={dateRange} setDateRange={setDateRange} dateSystem={dateSystem} />
            </div>
        </div>
    );
};

export function FinancialSummaryCards({
    vouchers,
    processedParties,
    processedStaff,
    processedTaxes,
    processedAccounts,
    processedItems,
    expenseAccounts,
    loading = false,
    showDetails = true,
    compact = false,
}: FinancialSummaryCardsProps) {
    const { formatCurrency, formatCurrencyForPrint, dateSystem, formatDate, formatDateBS } = useDate();
    const { can } = usePermissions();
    const { company } = useCompany();

    // Helper function to truncate account names
    const truncateAccountName = (name: string, maxLength: number = 30) => {
        if (!name || name.length <= maxLength) return name;
        return name.substring(0, maxLength) + '...';
    };

    // Date ranges for filtering
    const [receivablesDateRange, setReceivablesDateRange] = useState<DateRange | undefined>(undefined);
    const [cashFlowDateRange, setCashFlowDateRange] = useState<DateRange | undefined>(undefined);
    const [taxDateRange, setTaxDateRange] = useState<DateRange | undefined>(undefined);
    const [stockDateRange, setStockDateRange] = useState<DateRange | undefined>(undefined);
    const [bankCashDateRange, setBankCashDateRange] = useState<DateRange | undefined>(undefined);

    // Dialog states
    const [receivablesPayablesOpen, setReceivablesPayablesOpen] = useState(false);
    const [cashFlowOpen, setCashFlowOpen] = useState(false);
    const [taxSummaryOpen, setTaxSummaryOpen] = useState(false);
    const [stockSummaryOpen, setStockSummaryOpen] = useState(false);
    const [bankCashSummaryOpen, setBankCashSummaryOpen] = useState(false);
    const [bankCashRotated, setBankCashRotated] = useState(false);

    // Filter states
    const [receivablePayableFilter, setReceivablePayableFilter] = useState<'all' | 'party' | 'staff' | 'tax'>('all');
    const [receivablesPayablesTab, setReceivablesPayablesTab] = useState<'receivables' | 'payables' | 'both'>('both');
    const [hasTabBeenClicked, setHasTabBeenClicked] = useState(false);
    const [cashFlowFilter, setCashFlowFilter] = useState<'all' | 'inflow' | 'outflow'>('all');
    const [cashFlowCategoryFilter, setCashFlowCategoryFilter] = useState<'all' | 'party' | 'staff' | 'tax' | 'income_expense' | 'other'>('all');
    const [cashFlowTab, setCashFlowTab] = useState<'inflow' | 'outflow' | 'both'>('both');
    const [hasCashFlowTabBeenClicked, setHasCashFlowTabBeenClicked] = useState(false);
    const [taxFilter, setTaxFilter] = useState<'all' | 'input' | 'output'>('all');
    const [selectedTaxId, setSelectedTaxId] = useState<string | null>(null);
    const [expandedTaxAccounts, setExpandedTaxAccounts] = useState<Set<string>>(new Set());
    const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
    
    const isMobile = useIsMobile();
    
    const toggleTaxAccount = (taxId: string) => {
        setExpandedTaxAccounts(prev => {
            const newSet = new Set(prev);
            if (newSet.has(taxId)) {
                newSet.delete(taxId);
            } else {
                newSet.add(taxId);
            }
            return newSet;
        });
    };
    
    const expandAllTaxAccounts = () => {
        if (transactionsByTaxAccount.length === 0) return;
        const allTaxIds = transactionsByTaxAccount.map(tg => tg.taxId);
        setExpandedTaxAccounts(new Set(allTaxIds));
    };
    
    const collapseAllTaxAccounts = () => {
        setExpandedTaxAccounts(new Set());
    };
    
    const toggleAllTaxAccounts = () => {
        if (transactionsByTaxAccount.length === 0) return;
        const allTaxIds = transactionsByTaxAccount.map(tg => tg.taxId);
        const allExpanded = allTaxIds.length > 0 && allTaxIds.every(id => expandedTaxAccounts.has(id));
        if (allExpanded) {
            collapseAllTaxAccounts();
        } else {
            expandAllTaxAccounts();
        }
    };

    // Handle browser back button for dialogs on mobile
    useEffect(() => {
        if (!isMobile) return;
        
        // Tax Summary Dialog
        if (taxSummaryOpen && window.location.hash !== '#tax-summary') {
            window.history.pushState({ taxSummary: true }, '', '#tax-summary');
        }
        
        const handlePopState = (event: PopStateEvent) => {
            if (taxSummaryOpen && !event.state?.taxSummary) {
                setTaxSummaryOpen(false);
                setTaxFilter('all');
                setSelectedTaxId(null);
            }
            if (receivablesPayablesOpen && !event.state?.receivablesPayables) {
                setReceivablesPayablesOpen(false);
                setReceivablesPayablesTab('both');
            }
            if (cashFlowOpen && !event.state?.cashFlow) {
                setCashFlowOpen(false);
                setCashFlowTab('both');
            }
            if (stockSummaryOpen && !event.state?.stockSummary) {
                setStockSummaryOpen(false);
            }
            if (bankCashSummaryOpen && !event.state?.bankCashSummary) {
                setBankCashSummaryOpen(false);
            }
        };
        
        window.addEventListener('popstate', handlePopState);
        return () => {
            window.removeEventListener('popstate', handlePopState);
            if (window.location.hash === '#tax-summary' && !taxSummaryOpen) {
                window.history.back();
            }
        };
    }, [taxSummaryOpen, receivablesPayablesOpen, cashFlowOpen, stockSummaryOpen, bankCashSummaryOpen, isMobile]);

    useEffect(() => {
        if (!isMobile) return;
        if (receivablesPayablesOpen && window.location.hash !== '#receivables-payables') {
            window.history.pushState({ receivablesPayables: true }, '', '#receivables-payables');
        }
    }, [receivablesPayablesOpen, isMobile]);

    useEffect(() => {
        if (!isMobile) return;
        if (cashFlowOpen && window.location.hash !== '#cash-flow') {
            window.history.pushState({ cashFlow: true }, '', '#cash-flow');
        }
    }, [cashFlowOpen, isMobile]);

    useEffect(() => {
        if (!isMobile) return;
        if (stockSummaryOpen && window.location.hash !== '#stock-summary') {
            window.history.pushState({ stockSummary: true }, '', '#stock-summary');
        }
    }, [stockSummaryOpen, isMobile]);

    useEffect(() => {
        if (!isMobile) return;
        if (bankCashSummaryOpen && window.location.hash !== '#bank-cash-summary') {
            window.history.pushState({ bankCashSummary: true }, '', '#bank-cash-summary');
        }
    }, [bankCashSummaryOpen, isMobile]);

    // ---------- FINANCIAL SUMMARY CALCULATION (Grouped) ----------
    const financialSummary = useMemo(() => {
        if (loading) return { 
            totalReceivable: 0, 
            totalPayable: 0, 
            receivables: { parties: [], staff: [], taxes: [] }, 
            payables: { parties: [], staff: [], taxes: [] },
            recCount: 0,
            payCount: 0
        };
        
        let filteredVouchers = vouchers;
        if (receivablesDateRange?.from) {
            const fromDate = startOfDay(receivablesDateRange.from);
            const toDate = receivablesDateRange.to ? endOfDay(receivablesDateRange.to) : endOfDay(fromDate);
            filteredVouchers = vouchers.filter(v => {
                const txDate = safeToDate(v.date);
                return txDate && txDate >= fromDate && txDate <= toDate;
            });
        }

        const receivables = { parties: [] as any[], staff: [] as any[], taxes: [] as any[] };
        const payables = { parties: [] as any[], staff: [] as any[], taxes: [] as any[] };

        const processEntity = (entity: any, type: 'party' | 'staff' | 'tax') => {
            let balance = Number(entity.openingBalance) || 0;

            filteredVouchers.forEach(v => {
                const amount = v.total || v.amount || 0;

                if (v.type === 'journal') {
                    const entry = v.entries?.find((e: any) => e.accountId === entity.id);
                    if (entry) {
                        balance += (Number(entry.debit) || 0) - (Number(entry.credit) || 0);
                    }
                } else {
                     if (v.partyId === entity.id && type === 'party') {
                        if (["sale", "payment_out", "direct_income"].includes(v.type)) balance += amount;
                        else if (["purchase", "payment_in", "direct_expense"].includes(v.type)) balance -= amount;
                    } else if (v.staffId === entity.id && type === 'staff') {
                        if (v.type === 'payment_out') balance += amount;
                        else if (v.type === 'payment_in') balance -= amount;
                    } else if (v.taxAccountId === entity.id && type === 'tax') {
                        if (v.type === 'payment_out') balance += amount;
                        else if (v.type === 'payment_in') balance -= amount;
                    } else if (v.lineItems?.some((li: any) => li.taxAccountId === entity.id) && type === 'tax') {
                        const taxAmount = v.lineItems.reduce(
                            (sum: number, li: any) => li.taxAccountId === entity.id ? sum + Number(li.taxAmount || 0) : sum,
                            0
                        );
                        if (v.type === 'purchase') balance += taxAmount;
                        else if (v.type === 'sale') balance -= taxAmount;
                    }
                }
            });

            const entityData = { party: entity.name, balance: balance, fileUrl: (entity as any).fileUrl };
            if (balance > 0.01) {
                if (type === 'party') receivables.parties.push(entityData);
                if (type === 'staff') receivables.staff.push(entityData);
                if (type === 'tax') receivables.taxes.push(entityData);
            } else if (balance < -0.01) {
                if (type === 'party') payables.parties.push(entityData);
                if (type === 'staff') payables.staff.push(entityData);
                if (type === 'tax') payables.taxes.push(entityData);
            }
        };
        
        processedParties.forEach(p => processEntity(p, 'party'));
        processedStaff.forEach(s => processEntity(s, 'staff'));
        processedTaxes.forEach(t => processEntity(t, 'tax'));
        
        const sortFn = (a: any, b: any) => Math.abs(b.balance) - Math.abs(a.balance);
        receivables.parties.sort(sortFn); receivables.staff.sort(sortFn); receivables.taxes.sort(sortFn);
        payables.parties.sort(sortFn); payables.staff.sort(sortFn); payables.taxes.sort(sortFn);

        const calcSum = (arr: any[]) => arr.reduce((sum, item) => sum + item.balance, 0);
        const totalReceivable = calcSum(receivables.parties) + calcSum(receivables.staff) + calcSum(receivables.taxes);
        const totalPayable = calcSum(payables.parties) + calcSum(payables.staff) + calcSum(payables.taxes);

        const recCount = receivables.parties.length + receivables.staff.length + receivables.taxes.length;
        const payCount = payables.parties.length + payables.staff.length + payables.taxes.length;

        return { totalReceivable, totalPayable, receivables, payables, recCount, payCount };
    }, [processedParties, processedStaff, processedTaxes, loading, vouchers, receivablesDateRange]);

    const netBalance = financialSummary.totalReceivable + financialSummary.totalPayable;

    // --- CASH FLOW CALCULATION ---
    const cashFlowDetails = useMemo(() => {
        let filteredVouchers = vouchers;
        if (cashFlowDateRange?.from) {
            const fromDate = startOfDay(cashFlowDateRange.from);
            const toDate = cashFlowDateRange.to ? endOfDay(cashFlowDateRange.to) : endOfDay(fromDate);
            filteredVouchers = vouchers.filter(v => {
                const txDate = safeToDate(v.date);
                return txDate && txDate >= fromDate && txDate <= toDate;
            });
        }

        type FlowItem = { id: string; name: string; amount: number; type: string };
        const inflowMap = new Map<string, FlowItem>();
        const outflowMap = new Map<string, FlowItem>();

        const getEntityType = (v: any): string => {
            if(v.partyId) return 'Party';
            if(v.staffId) return 'Staff';
            if(v.taxAccountId) return 'Tax';
            if(v.incomeAccountId || v.expenseAccountId || v.toAccountId) return 'Income/Expense';
            return 'Other';
        }

        const getEntityInfo = (v: any): {id: string, name: string} => {
            if(v.partyId) return {id: v.partyId, name: processedParties.find(p=>p.id === v.partyId)?.name || 'Unknown Party'};
            if(v.staffId) return {id: v.staffId, name: processedStaff.find(s=>s.id === v.staffId)?.name || 'Unknown Staff'};
            if(v.taxAccountId) return {id: v.taxAccountId, name: processedTaxes.find(t=>t.id === v.taxAccountId)?.name || 'Unknown Tax'};
            if(v.incomeAccountId) return {id: v.incomeAccountId, name: expenseAccounts.find(e=>e.id === v.incomeAccountId)?.name || 'Unknown Income'};
            if(v.expenseAccountId) return {id: v.expenseAccountId, name: expenseAccounts.find(e=>e.id === v.expenseAccountId)?.name || 'Unknown Expense'};
            if(v.toAccountId) return {id: v.toAccountId, name: expenseAccounts.find(e=>e.id === v.toAccountId)?.name || 'Unknown Account'};
            return {id: (v as any).payeeName || 'other', name: (v as any).payeeName || 'Other'};
        }

        const aggregate = (map: Map<string, FlowItem>, v: any, type: string, amount: number) => {
            const info = getEntityInfo(v);
            const key = `${getEntityType(v)}-${info.id}`;
            const existing = map.get(key);
            if (existing) {
                existing.amount += amount;
            } else {
                map.set(key, { id: info.id, name: info.name, amount: amount, type: getEntityType(v) });
            }
        };
        
        filteredVouchers.forEach(v => {
            const amt = Number(v.amount || v.total || 0);
            if (v.type === 'payment_in' || v.type === 'direct_income') aggregate(inflowMap, v, v.type, amt);
            if (v.type === 'payment_out' || v.type === 'direct_expense') aggregate(outflowMap, v, v.type, amt);
        });

        const inflow = Array.from(inflowMap.values());
        const outflow = Array.from(outflowMap.values());
        
        const totalInflow = inflow.reduce((s, i) => s + i.amount, 0);
        const totalOutflow = outflow.reduce((s, i) => s + i.amount, 0);

        const categorizedInflow = inflow.reduce((acc, item) => {
            const categoryKey = item.type.replace('/', '_').toLowerCase();
            if (!acc[categoryKey]) acc[categoryKey] = [];
            acc[categoryKey].push(item);
            return acc;
        }, {} as Record<string, FlowItem[]>);

        const categorizedOutflow = outflow.reduce((acc, item) => {
            const categoryKey = item.type.replace('/', '_').toLowerCase();
            if (!acc[categoryKey]) acc[categoryKey] = [];
            acc[categoryKey].push(item);
            return acc;
        }, {} as Record<string, FlowItem[]>);

        return { categorizedInflow, categorizedOutflow, totalInflow, totalOutflow };
    }, [vouchers, cashFlowDateRange, processedParties, processedStaff, processedTaxes, expenseAccounts]);

    const taxSummary = useMemo(() => {
        if (!processedTaxes) return { totalInput: 0, totalOutput: 0, netBalance: 0, details: [] };
        const totalInput = processedTaxes.reduce((sum, tax) => sum + tax.debit, 0);
        const totalOutput = processedTaxes.reduce((sum, tax) => sum + tax.credit, 0);
        const netBalance = totalInput - totalOutput;
        return {
            totalInput,
            totalOutput,
            netBalance,
            details: processedTaxes.map(tax => ({
                id: tax.id,
                name: tax.name,
                input: tax.debit,
                output: tax.credit,
                balance: tax.debit - tax.credit,
            }))
        };
    }, [processedTaxes]);

    // Tax Breakdown Transactions
    const taxBreakdownTransactions = useMemo(() => {
        let filteredVouchers = vouchers;
        
        // Filter by date range
        if (taxDateRange?.from) {
            const fromDate = startOfDay(taxDateRange.from);
            const toDate = taxDateRange.to ? endOfDay(taxDateRange.to) : endOfDay(fromDate);
            filteredVouchers = vouchers.filter(v => {
                const txDate = safeToDate(v.date);
                if (!txDate) return false;
                const normalizedTxDate = startOfDay(txDate);
                return normalizedTxDate >= fromDate && normalizedTxDate <= toDate;
            });
        }

        const inputTransactions: any[] = [];
        const outputTransactions: any[] = [];
        let saleCount = 0;
        let purchaseCount = 0;
        let addSalaryCount = 0;

        filteredVouchers.forEach(v => {
            // Count transaction types
            if (v.type === 'sale') saleCount++;
            else if (v.type === 'purchase') purchaseCount++;
            else if (v.type === 'journal' && v.subType === 'add_salary') addSalaryCount++;

            // Process tax transactions
            if (v.type === 'payment_out' && v.taxAccountId) {
                const taxId = v.taxAccountId;
                if (!selectedTaxId || selectedTaxId === taxId) {
                    const tax = processedTaxes?.find(t => t.id === taxId);
                    const account = processedAccounts?.find(a => a.id === v.accountId);
                    inputTransactions.push({
                        id: v.id,
                        date: v.date,
                        voucherType: v.type,
                        voucherNumber: v.voucherNumber || v.invoiceNumber || '',
                        account: account?.accountName || account?.name || 'N/A',
                        debit: v.amount || 0,
                        credit: 0,
                        taxId: taxId,
                        taxName: tax?.name || 'N/A'
                    });
                }
            } else if (v.type === 'payment_in' && v.taxAccountId) {
                const taxId = v.taxAccountId;
                if (!selectedTaxId || selectedTaxId === taxId) {
                    const tax = processedTaxes?.find(t => t.id === taxId);
                    const account = processedAccounts?.find(a => a.id === v.accountId);
                    outputTransactions.push({
                        id: v.id,
                        date: v.date,
                        voucherType: v.type,
                        voucherNumber: v.voucherNumber || v.invoiceNumber || '',
                        account: account?.accountName || account?.name || 'N/A',
                        debit: 0,
                        credit: v.amount || 0,
                        taxId: taxId,
                        taxName: tax?.name || 'N/A'
                    });
                }
            } else if (v.lineItems && Array.isArray(v.lineItems)) {
                v.lineItems.forEach((line: any) => {
                    if (line.taxAccountId) {
                        const taxId = line.taxAccountId;
                        if (!selectedTaxId || selectedTaxId === taxId) {
                            const tax = processedTaxes?.find(t => t.id === taxId);
                            const taxAmount = Number(line.taxAmount || 0);
                            if (taxAmount > 0) {
                                // Get party name for sale/purchase
                                const party = processedParties?.find(p => p.id === v.partyId);
                                const accountName = party?.name || v.partyName || 'N/A';
                                
                                if (v.type === 'sale') {
                                    outputTransactions.push({
                                        id: `${v.id}-${line.itemId}-${taxId}`,
                                        date: v.date,
                                        voucherType: v.type,
                                        voucherNumber: v.voucherNumber || v.invoiceNumber || '',
                                        account: accountName,
                                        debit: 0,
                                        credit: taxAmount,
                                        taxId: taxId,
                                        taxName: tax?.name || 'N/A'
                                    });
                                } else if (v.type === 'purchase') {
                                    inputTransactions.push({
                                        id: `${v.id}-${line.itemId}-${taxId}`,
                                        date: v.date,
                                        voucherType: v.type,
                                        voucherNumber: v.voucherNumber || v.invoiceNumber || '',
                                        account: accountName,
                                        debit: taxAmount,
                                        credit: 0,
                                        taxId: taxId,
                                        taxName: tax?.name || 'N/A'
                                    });
                                }
                            }
                        }
                    }
                });
            } else if (v.type === 'journal' && v.subType === 'add_salary' && Array.isArray(v.entries)) {
                v.entries.forEach((entry: any) => {
                    const taxId = entry.accountId;
                    if (processedTaxes?.some(t => t.id === taxId) && entry.credit > 0) {
                        if (!selectedTaxId || selectedTaxId === taxId) {
                            const tax = processedTaxes?.find(t => t.id === taxId);
                            // Extract staff ID from narration: "TDS for Staff Name (Staff ID: staffId)"
                            let staffId: string | null = null;
                            if (entry.narration) {
                                const match = entry.narration.match(/\(Staff ID:\s*([^)]+)\)/);
                                if (match && match[1]) {
                                    staffId = match[1].trim();
                                }
                            }
                            // If not found in narration, find staff entry from same voucher
                            if (!staffId) {
                                const staffEntry = v.entries.find((e: any) => 
                                    processedStaff?.some(s => s.id === e.accountId) && 
                                    e.credit > 0 &&
                                    e.narration && 
                                    e.narration.includes('Salary for')
                                );
                                staffId = staffEntry?.accountId || null;
                            }
                            // Get staff name
                            const staff = staffId ? processedStaff?.find(s => s.id === staffId) : null;
                            const accountName = staff?.name || 'N/A';
                            // Add salary tax is payable (liability), so it goes to outputTransactions (Receivable) as Credit
                            outputTransactions.push({
                                id: `${v.id}-${entry.accountId}-${staffId || 'unknown'}`,
                                date: v.date,
                                voucherType: v.type,
                                voucherNumber: v.voucherNumber || '',
                                account: accountName,
                                debit: 0,
                                credit: entry.credit,
                                taxId: taxId,
                                taxName: tax?.name || 'N/A'
                            });
                        }
                    }
                });
            }
        });

        return {
            inputTransactions: inputTransactions.sort((a, b) => {
                const dateA = safeToDate(a.date)?.getTime() || 0;
                const dateB = safeToDate(b.date)?.getTime() || 0;
                return dateB - dateA;
            }),
            outputTransactions: outputTransactions.sort((a, b) => {
                const dateA = safeToDate(a.date)?.getTime() || 0;
                const dateB = safeToDate(b.date)?.getTime() || 0;
                return dateB - dateA;
            }),
            saleCount,
            purchaseCount,
            addSalaryCount
        };
    }, [vouchers, taxDateRange, selectedTaxId, processedTaxes, processedAccounts, processedParties, processedStaff]);

    // Group transactions by tax account
    const transactionsByTaxAccount = useMemo(() => {
        const grouped: Record<string, { 
            taxId: string; 
            taxName: string; 
            inputTransactions: any[]; 
            outputTransactions: any[] 
        }> = {};

        // Group input transactions
        taxBreakdownTransactions.inputTransactions.forEach(tx => {
            const key = tx.taxId || 'unknown';
            if (!grouped[key]) {
                grouped[key] = {
                    taxId: tx.taxId,
                    taxName: tx.taxName || 'Unknown Tax',
                    inputTransactions: [],
                    outputTransactions: []
                };
            }
            grouped[key].inputTransactions.push(tx);
        });

        // Group output transactions
        taxBreakdownTransactions.outputTransactions.forEach(tx => {
            const key = tx.taxId || 'unknown';
            if (!grouped[key]) {
                grouped[key] = {
                    taxId: tx.taxId,
                    taxName: tx.taxName || 'Unknown Tax',
                    inputTransactions: [],
                    outputTransactions: []
                };
            }
            grouped[key].outputTransactions.push(tx);
        });

        // Sort by tax name
        return Object.values(grouped).sort((a, b) =>
            a.taxName.localeCompare(b.taxName)
        );
    }, [taxBreakdownTransactions]);
    
    const areAllExpanded = useMemo(() => {
        if (transactionsByTaxAccount.length === 0) return false;
        const allTaxIds = transactionsByTaxAccount.map(tg => tg.taxId);
        return allTaxIds.length > 0 && allTaxIds.every(id => expandedTaxAccounts.has(id));
    }, [transactionsByTaxAccount, expandedTaxAccounts]);
    
    // Collect all visible transactions for keyboard navigation
    const allVisibleTransactions = useMemo(() => {
        const transactions: any[] = [];
        transactionsByTaxAccount.forEach(taxGroup => {
            if (taxFilter === 'all' || taxFilter === 'input') {
                taxGroup.inputTransactions.forEach(tx => transactions.push(tx));
            }
            if (taxFilter === 'all' || taxFilter === 'output') {
                taxGroup.outputTransactions.forEach(tx => transactions.push(tx));
            }
        });
        return transactions;
    }, [transactionsByTaxAccount, taxFilter]);
    
    // Reset selected transaction when dialog closes or filter changes
    useEffect(() => {
        if (!taxSummaryOpen) {
            setSelectedTransactionId(null);
        }
    }, [taxSummaryOpen]);
    
    useEffect(() => {
        setSelectedTransactionId(null);
    }, [taxFilter]);
    
    // Keyboard navigation handler
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (allVisibleTransactions.length === 0) return;
            if (!taxSummaryOpen) return;
            
            const currentIndex = allVisibleTransactions.findIndex(tx => tx.id === selectedTransactionId);
            
            if (e.key === "ArrowDown") {
                e.preventDefault();
                const nextIndex = Math.min(currentIndex + 1, allVisibleTransactions.length - 1);
                setSelectedTransactionId(allVisibleTransactions[nextIndex]?.id ?? null);
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                const prevIndex = Math.max(currentIndex - 1, 0);
                setSelectedTransactionId(allVisibleTransactions[prevIndex]?.id ?? null);
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [allVisibleTransactions, selectedTransactionId, taxSummaryOpen]);

    // STOCK SUMMARY DETAILS
    const overallStockSummary = useMemo(() => {
        let filteredVouchers = vouchers;
        if (stockDateRange?.from) {
            const fromDate = startOfDay(stockDateRange.from);
            const toDate = stockDateRange.to ? endOfDay(stockDateRange.to) : endOfDay(fromDate);
            filteredVouchers = vouchers.filter(v => {
                const txDate = safeToDate(v.date);
                if (!txDate) return false;
                // Normalize transaction date to start of day for proper comparison
                const normalizedTxDate = startOfDay(txDate);
                return normalizedTxDate >= fromDate && normalizedTxDate <= toDate;
            });
        }

        let totalValue = 0;
        const itemsWithSales = processedItems.map(item => {
            const conversions = (item.unitConversions || []) as any[];
            const smallestUnit = conversions.length > 0 ? conversions[conversions.length - 1].toUnit : ((item as any).openingBalanceUnit || '');
            
            const getFactorToSmallest = (unit: string): number => {
                if (!unit || conversions.length === 0 || unit === smallestUnit) return 1;
                
                let factor = 1;
                let current = unit;
                for (let i = 0; i < 10; i++) {
                    const conv = conversions.find(c => c.fromUnit === current);
                    if (!conv) return 0;
                    factor *= Number(conv.conversionFactor) || 1;
                    current = conv.toUnit;
                    if (current === smallestUnit) break;
                }
                return factor;
            };

            const purchasePriceUnit = (item as any).purchasePriceUnit || smallestUnit;
            const purchasePriceFactor = getFactorToSmallest(purchasePriceUnit);
            const purchasePriceInSmallestUnit = purchasePriceFactor > 0 ? (item.purchasePrice || 0) / purchasePriceFactor : 0;
            
            const value = (item.stockQty || 0) * purchasePriceInSmallestUnit;
            totalValue += value;

            let salesQty = 0;
            let salesValue = 0;
            let purchaseQty = 0;
            let purchaseValue = 0;

            filteredVouchers.forEach(v => {
                if (v.lineItems?.some((li: any) => li.itemId === item.id)) {
                    const lineItem = v.lineItems.find((li: any) => li.itemId === item.id);
                    if (lineItem) {
                        const qty = Number(lineItem.quantity) || 0;
                        const lineValue = (qty * Number(lineItem.rate)) || 0;
                        const standardizedQty = qty * getFactorToSmallest(lineItem.unit);

                        if (v.type === 'sale') {
                            salesQty += standardizedQty;
                            salesValue += lineValue;
                        } else if (v.type === 'purchase') {
                            purchaseQty += standardizedQty;
                            purchaseValue += lineValue;
                        }
                    }
                }
            });

            return {
                ...item,
                qty: item.stockQty || 0,
                unit: smallestUnit,
                rate: item.purchasePrice || 0,
                value: value,
                salesQty,
                salesValue,
                purchaseQty,
                purchaseValue,
                smallestUnit,
            };
        });

        // Filter items to only show those with transactions in the selected date range
        // If date range is selected, only show items that have sales or purchases in that period
        let filteredItems = itemsWithSales;
        if (stockDateRange?.from) {
            filteredItems = itemsWithSales.filter(item => 
                item.salesQty > 0 || item.purchaseQty > 0 || item.salesValue > 0 || item.purchaseValue > 0
            );
            // Recalculate totalValue based on filtered items
            totalValue = filteredItems.reduce((sum, item) => sum + item.value, 0);
        }

        const topSaleItems = [...filteredItems].filter(i => i.salesQty > 0 || i.salesValue > 0).sort((a,b) => b.salesValue - a.salesValue).slice(0, 5);
        const topPurchaseItems = [...filteredItems].filter(i => i.purchaseQty > 0 || i.purchaseValue > 0).sort((a,b) => b.purchaseValue - a.purchaseValue).slice(0, 5);

        return { items: filteredItems, totalStockValue: totalValue, topSaleItems, topPurchaseItems };
    }, [processedItems, vouchers, stockDateRange]);

    // Bank & Cash Summary
    const bankCashSummary = useMemo(() => {
        if (!processedAccounts || !vouchers) return { 
            totalBankBalance: 0, 
            totalCashBalance: 0, 
            grandTotalBalance: 0,
            cashAccounts: [],
            bankAccounts: [],
            totalBankInflow: 0,
            totalBankOutflow: 0,
            totalCashInflow: 0,
            totalCashOutflow: 0
        };
        
        const fromDate = bankCashDateRange?.from ? startOfDay(bankCashDateRange.from) : null;
        const toDate = bankCashDateRange?.to ? endOfDay(bankCashDateRange.to) : fromDate ? endOfDay(fromDate) : null;
        
        const summaryAccounts = processedAccounts.map((acc) => {
            const newAcc = { ...acc, inflow: 0, outflow: 0, balance: Number(acc.openingBalance) || 0 };
            
            const prePeriodTx = vouchers.filter(v => {
                if (!fromDate) return false;
                const txDate = safeToDate(v.date);
                return txDate && txDate < fromDate;
            });
            
            let openingForPeriod = Number(acc.openingBalance) || 0;
            prePeriodTx.forEach(v => {
                const amount = v.total || v.amount || 0;
                if (['payment_in', 'direct_income', 'sale'].includes(v.type) && v.accountId === acc.id) openingForPeriod += amount;
                if (['payment_out', 'direct_expense', 'purchase'].includes(v.type) && v.accountId === acc.id) openingForPeriod -= amount;
                if (v.type === 'contra') {
                    if (v.toAccountId === acc.id) openingForPeriod += amount;
                    if (v.fromAccountId === acc.id) openingForPeriod -= amount;
                }
                if (v.type === "journal" && Array.isArray(v.entries)) {
                    const entry = v.entries.find((e: any) => e.accountId === acc.id);
                    if (entry) openingForPeriod += Number(entry.debit || 0) - Number(entry.credit || 0);
                }
            });
            newAcc.balance = openingForPeriod;
            
            const periodTx = vouchers.filter(v => {
                if (!fromDate || !toDate) return true;
                const txDate = safeToDate(v.date);
                return txDate && txDate >= fromDate && txDate <= toDate;
            });
            
            periodTx.forEach((v) => {
                const amount = v.total || v.amount || 0;
                if (['payment_in', 'direct_income', 'sale'].includes(v.type) && v.accountId === acc.id) newAcc.inflow += amount;
                if (['payment_out', 'direct_expense', 'purchase', 'salary', 'add_salary'].includes(v.type) && v.accountId === acc.id) newAcc.outflow += amount;
                if (v.type === 'contra') {
                    if (v.toAccountId === acc.id) newAcc.inflow += amount;
                    if (v.fromAccountId === acc.id) newAcc.outflow += amount;
                }
                if (v.type === "journal" && Array.isArray(v.entries)) {
                    const entry = v.entries.find((e: any) => e.accountId === acc.id);
                    if (entry) {
                        newAcc.inflow += Number(entry.debit || 0);
                        newAcc.outflow += Number(entry.credit || 0);
                    }
                }
            });
            
            newAcc.balance += newAcc.inflow - newAcc.outflow;
            return newAcc;
        }).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
        
        const cashAccounts = summaryAccounts.filter((acc) => acc.accountType === 'Cash');
        const bankAccounts = summaryAccounts.filter((acc) => acc.accountType === 'Bank');
        
        const totalBankBalance = bankAccounts.reduce((sum, acc) => sum + acc.balance, 0);
        const totalCashBalance = cashAccounts.reduce((sum, acc) => sum + acc.balance, 0);
        const grandTotalBalance = totalBankBalance + totalCashBalance;
        
        const totalBankInflow = bankAccounts.reduce((sum, acc) => sum + acc.inflow, 0);
        const totalBankOutflow = bankAccounts.reduce((sum, acc) => sum + acc.outflow, 0);
        const totalCashInflow = cashAccounts.reduce((sum, acc) => sum + acc.inflow, 0);
        const totalCashOutflow = cashAccounts.reduce((sum, acc) => sum + acc.outflow, 0);
        
        return { 
            totalBankBalance, 
            totalCashBalance, 
            grandTotalBalance,
            cashAccounts,
            bankAccounts,
            totalBankInflow,
            totalBankOutflow,
            totalCashInflow,
            totalCashOutflow
        };
    }, [processedAccounts, vouchers, bankCashDateRange]);

    // Print handlers
    const handlePrint = () => {
        const shouldInclude = (type: 'party' | 'staff' | 'tax') => {
            if (receivablePayableFilter === 'all') return true;
            return receivablePayableFilter === type;
        };
        const calculateFilteredTotal = (list: typeof financialSummary.receivables) => {
            let sum = 0;
            if (shouldInclude('party')) sum += list.parties.reduce((s, i) => s + i.balance, 0);
            if (shouldInclude('staff')) sum += list.staff.reduce((s, i) => s + i.balance, 0);
            if (shouldInclude('tax')) sum += list.taxes.reduce((s, i) => s + i.balance, 0);
            return sum;
        };
        const printTotalReceivable = calculateFilteredTotal(financialSummary.receivables);
        const printTotalPayable = calculateFilteredTotal(financialSummary.payables);
        const excludeOpeningBalance = (arr: { party: string; balance: number }[]) => arr.filter(p => p.party !== "Opening Balance");
        const buildTableBody = (list: typeof financialSummary.receivables, typeColor: string) => {
            const body: any[] = [['Party/Staff/Tax', { text: 'Amount', alignment: 'right' }]];
            const parties = excludeOpeningBalance(list.parties);
            const staff = excludeOpeningBalance(list.staff);
            const taxes = excludeOpeningBalance(list.taxes);
            if (shouldInclude('party') && parties.length > 0) {
                body.push([{ text: 'Parties', bold: true, fillColor: '#f3f4f6' }, { text: '', fillColor: '#f3f4f6' }]);
                parties.forEach(item => body.push([item.party, { text: formatCurrencyForPrint(Math.abs(item.balance), {noSuffix: true, noAnimation: true}), alignment: 'right' }]));
            }
            if (shouldInclude('staff') && staff.length > 0) {
                body.push([{ text: 'Staff', bold: true, fillColor: '#f3f4f6' }, { text: '', fillColor: '#f3f4f6' }]);
                staff.forEach(item => body.push([item.party, { text: formatCurrencyForPrint(Math.abs(item.balance), {noSuffix: true, noAnimation: true}), alignment: 'right' }]));
            }
            if (shouldInclude('tax') && taxes.length > 0) {
                body.push([{ text: 'Taxes', bold: true, fillColor: '#f3f4f6' }, { text: '', fillColor: '#f3f4f6' }]);
                taxes.forEach(item => body.push([item.party, { text: formatCurrencyForPrint(Math.abs(item.balance), {noSuffix: true, noAnimation: true}), alignment: 'right' }]));
            }
            return body;
        };
        const receivablesBody = buildTableBody(financialSummary.receivables, '#059669');
        const payablesBody = buildTableBody(financialSummary.payables, '#DC2626');
        receivablesBody.push([{ text: 'Total Receivable', bold: true, alignment: 'right'}, { text: formatCurrencyForPrint(printTotalReceivable, {noSuffix: true, noAnimation: true}), bold: true, alignment: 'right', color: '#059669' }]);
        payablesBody.push([{ text: 'Total Payable', bold: true, alignment: 'right'}, { text: formatCurrencyForPrint(Math.abs(printTotalPayable), {noSuffix: true, noAnimation: true}), bold: true, alignment: 'right', color: '#DC2626' }]);
        const printRecCount = (shouldInclude('party') ? financialSummary.receivables.parties.length : 0) + (shouldInclude('staff') ? financialSummary.receivables.staff.length : 0) + (shouldInclude('tax') ? financialSummary.receivables.taxes.length : 0);
        const printPayCount = (shouldInclude('party') ? financialSummary.payables.parties.length : 0) + (shouldInclude('staff') ? financialSummary.payables.staff.length : 0) + (shouldInclude('tax') ? financialSummary.payables.taxes.length : 0);

        const asOfDate = dateSystem === 'BS' ? formatDateBS(new Date()) : formatDate(new Date());

        openPrintDirect({
            company: { name: company?.name || '', pan: company?.pan, phone: company?.phone, address: company?.address, decimalPlaces: company?.decimalPlaces, showDrCr: company?.showDrCr, showCurrencySymbol: company?.showCurrencySymbol, logoUrl: company?.logoUrl },
            dateSystem: dateSystem,
            title: `Receivables & Payables (${receivablePayableFilter.toUpperCase()})`,
            context: "daybook",
            dateRangeText: `As of ${asOfDate}`,
            vouchersCount: printRecCount + printPayCount,
            openingBalance: 0,
            transactions: [],
            showNarration: false,
            customContent: [
              {
                columns: [
                  {
                    width: '*',
                    stack: [
                      { text: 'Receivables', style: 'subheader', color: '#059669' },
                      {
                        table: {
                          headerRows: 1,
                          widths: ['*', 'auto'],
                          body: receivablesBody
                        },
                        layout: 'lightHorizontalLines',
                        margin: [0, 5, 0, 15]
                      },
                    ]
                  },
                  {
                    width: '*',
                    stack: [
                      { text: 'Payables', style: 'subheader', color: '#DC2626' },
                      {
                        table: {
                          headerRows: 1,
                          widths: ['*', 'auto'],
                          body: payablesBody
                        },
                          layout: 'lightHorizontalLines'
                      }
                    ]
                  }
                ],
                columnGap: 20
              }
            ]
        }, true);
    };

    const handlePrintCashFlow = () => {
        let dateRangeText = "All Time";
        if(cashFlowDateRange?.from) {
            const from = cashFlowDateRange.from;
            const to = cashFlowDateRange.to || from;
            const fromBS = formatDateBS(from);
            const toBS = formatDateBS(to);
            const fromAD = formatDate(from);
            const toAD = formatDate(to);
            if (dateSystem === 'AD') dateRangeText = `AD: ${fromAD}${!isSameDay(from, to) ? ` to ${toAD}`: ''}`;
            else if (dateSystem === 'BS') dateRangeText = `BS: ${fromBS}${!isSameDay(from, to) ? ` to ${toBS}`: ''}`;
            else dateRangeText = `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
        }
        
        const showIn = cashFlowFilter === 'all' || cashFlowFilter === 'inflow';
        const showOut = cashFlowFilter === 'all' || cashFlowFilter === 'outflow';
        
        const inBody: any[] = [['Source', { text: 'Amount', alignment: 'right' }]];
        if(showIn) {
            Object.entries(cashFlowDetails.categorizedInflow).forEach(([category, items]) => {
                const catNormal = category.toLowerCase().replace(/\s+/g, '');
                const filterNormal = cashFlowCategoryFilter.toLowerCase().replace(/\s+/g, '');
                
                if (cashFlowCategoryFilter === 'all' || catNormal === filterNormal || (filterNormal === 'income_expense' && catNormal === 'income/expense') || (filterNormal === 'income_expense' && catNormal.includes('income'))) {
                    inBody.push([{text: category.replace('_', ' / ').toUpperCase(), bold: true, fillColor: '#f3f4f6', colSpan: 2}, {}]);
                    items.forEach(i => inBody.push([i.name, {text: formatCurrencyForPrint(i.amount, {noSuffix: true, noAnimation: true}), alignment: 'right'}]));
                }
            });
            inBody.push([{text: 'Total Inflow', bold: true}, {text: formatCurrencyForPrint(cashFlowDetails.totalInflow, {noSuffix: true, noAnimation: true}), bold: true, alignment: 'right', color: '#059669'}]);
        }
        
        const outBody: any[] = [['Destination', { text: 'Amount', alignment: 'right' }]];
        if(showOut) {
            Object.entries(cashFlowDetails.categorizedOutflow).forEach(([category, items]) => {
                const catNormal = category.toLowerCase().replace(/\s+/g, '');
                const filterNormal = cashFlowCategoryFilter.toLowerCase().replace(/\s+/g, '');
                
                if (cashFlowCategoryFilter === 'all' || catNormal === filterNormal || (filterNormal === 'income_expense' && catNormal === 'income/expense') || (filterNormal === 'income_expense' && catNormal.includes('expense'))) {
                    outBody.push([{text: category.replace('_', ' / ').toUpperCase(), bold: true, fillColor: '#f3f4f6', colSpan: 2}, {}]);
                    items.forEach(i => outBody.push([i.name, {text: formatCurrencyForPrint(i.amount, {noSuffix: true, noAnimation: true}), alignment: 'right'}]));
                }
            });
            outBody.push([{text: 'Total Outflow', bold: true}, {text: formatCurrencyForPrint(cashFlowDetails.totalOutflow, {noSuffix: true, noAnimation: true}), bold: true, alignment: 'right', color: '#DC2626'}]);
        }

        openPrintDirect({
            company: { name: company?.name || '', address: company?.address, phone: company?.phone, pan: company?.pan, decimalPlaces: company?.decimalPlaces, showDrCr: company?.showDrCr, showCurrencySymbol: company?.showCurrencySymbol, logoUrl: company?.logoUrl },
            dateSystem, 
            title: `Cash Flow (${cashFlowFilter.toUpperCase()} - ${cashFlowCategoryFilter.toUpperCase().replace('_', ' / ')})`, 
            dateRangeText,
            context: 'daybook', vouchersCount: 0, openingBalance: 0, transactions: [],
            customContent: [{ columns: [
                showIn ? { width: '*', stack: [{ text: 'Inflow', style: 'subheader', color: '#059669' }, { table: { widths: ['*', 'auto'], body: inBody }, layout: 'lightHorizontalLines' }] } : {width: 0, text: ''}, 
                showOut ? { width: '*', stack: [{ text: 'Outflow', style: 'subheader', color: '#DC2626' }, { table: { widths: ['*', 'auto'], body: outBody }, layout: 'lightHorizontalLines' }] } : {width: 0, text: ''}
            ], columnGap: 20 }]
        }, true);
    };

    const handlePrintTax = () => {
        let dateRangeText = "All Time";
        if(taxDateRange?.from) {
            const from = taxDateRange.from;
            const to = taxDateRange.to || from;
            const fromBS = formatDateBS(from);
            const toBS = formatDateBS(to);
            const fromAD = formatDate(from);
            const toAD = formatDate(to);
            if (dateSystem === 'AD') dateRangeText = `AD: ${fromAD}${!isSameDay(from, to) ? ` to ${toAD}`: ''}`;
            else if (dateSystem === 'BS') dateRangeText = `BS: ${fromBS}${!isSameDay(from, to) ? ` to ${toBS}`: ''}`;
            else dateRangeText = `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
        }

        const showInput = taxFilter === 'all' || taxFilter === 'input';
        const showOutput = taxFilter === 'all' || taxFilter === 'output';

        // Group transactions by tax account
        const transactionsByTax: Record<string, { name: string; input: any[]; output: any[] }> = {};
        
        // Process input transactions
        if (showInput) {
            taxBreakdownTransactions.inputTransactions.forEach(tx => {
                if (!transactionsByTax[tx.taxId]) {
                    transactionsByTax[tx.taxId] = {
                        name: tx.taxName,
                        input: [],
                        output: []
                    };
                }
                transactionsByTax[tx.taxId].input.push(tx);
            });
        }
        
        // Process output transactions
        if (showOutput) {
            taxBreakdownTransactions.outputTransactions.forEach(tx => {
                if (!transactionsByTax[tx.taxId]) {
                    transactionsByTax[tx.taxId] = {
                        name: tx.taxName,
                        input: [],
                        output: []
                    };
                }
                transactionsByTax[tx.taxId].output.push(tx);
            });
        }

        // Build print content with transactions grouped by tax account and date
        const content: any[] = [];
        
        // Sort tax accounts by name
        const sortedTaxIds = Object.keys(transactionsByTax).sort((a, b) => 
            transactionsByTax[a].name.localeCompare(transactionsByTax[b].name)
        );

        sortedTaxIds.forEach(taxId => {
            const taxData = transactionsByTax[taxId];
            
            // Tax Account Header
            content.push({
                text: taxData.name,
                style: 'subheader',
                bold: true,
                fontSize: 11,
                margin: [0, 10, 0, 5]
            });

            // Group transactions by date
            const transactionsByDate: Record<string, { input: any[]; output: any[] }> = {};
            
            [...taxData.input, ...taxData.output].forEach(tx => {
                const txDate = safeToDate(tx.date);
                const dateKey = txDate ? (dateSystem === 'BS' ? formatDateBS(txDate) : dateSystem === 'AD' ? formatDate(txDate) : `${formatDateBS(txDate)} / ${formatDate(txDate)}`) : 'Unknown';
                
                if (!transactionsByDate[dateKey]) {
                    transactionsByDate[dateKey] = { input: [], output: [] };
                }
                
                if (tx.debit > 0) {
                    transactionsByDate[dateKey].input.push(tx);
                } else if (tx.credit > 0) {
                    transactionsByDate[dateKey].output.push(tx);
                }
            });

            // Sort dates descending
            const sortedDates = Object.keys(transactionsByDate).sort((a, b) => {
                // Find first transaction with this date to get actual date for sorting
                const txA = [...taxData.input, ...taxData.output].find(tx => {
                    const txDate = safeToDate(tx.date);
                    const dateKey = txDate ? (dateSystem === 'BS' ? formatDateBS(txDate) : dateSystem === 'AD' ? formatDate(txDate) : `${formatDateBS(txDate)} / ${formatDate(txDate)}`) : 'Unknown';
                    return dateKey === a;
                });
                const txB = [...taxData.input, ...taxData.output].find(tx => {
                    const txDate = safeToDate(tx.date);
                    const dateKey = txDate ? (dateSystem === 'BS' ? formatDateBS(txDate) : dateSystem === 'AD' ? formatDate(txDate) : `${formatDateBS(txDate)} / ${formatDate(txDate)}`) : 'Unknown';
                    return dateKey === b;
                });
                const dateA = safeToDate(txA?.date);
                const dateB = safeToDate(txB?.date);
                return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
            });

            // Calculate totals and voucher counts for this tax account
            const totalInput = taxData.input.reduce((sum, tx) => sum + tx.debit, 0);
            const totalOutput = taxData.output.reduce((sum, tx) => sum + tx.credit, 0);
            const netBalance = totalInput - totalOutput;
            
            // Count unique vouchers
            const inputVouchers = new Set(taxData.input.map(tx => tx.voucherNumber).filter(Boolean));
            const outputVouchers = new Set(taxData.output.map(tx => tx.voucherNumber).filter(Boolean));

            // Create table for this tax account
            const tableBody: any[] = [[
                { text: 'Date', bold: true, fontSize: 10 },
                { text: 'Voucher No', bold: true, fontSize: 10 },
                { text: 'Account', bold: true, fontSize: 10 },
                ...(showInput ? [{ text: 'Dr', bold: true, fontSize: 10, alignment: 'right' }] : []),
                ...(showOutput ? [{ text: 'Cr', bold: true, fontSize: 10, alignment: 'right' }] : [])
            ]];

            sortedDates.forEach(dateKey => {
                const dateTransactions = transactionsByDate[dateKey];
                
                // Add input transactions
                if (showInput && dateTransactions.input.length > 0) {
                    dateTransactions.input.forEach(tx => {
                        tableBody.push([
                            { text: dateKey, fontSize: 10 },
                            { text: tx.voucherNumber || '-', fontSize: 10 },
                            { text: truncateAccountName(tx.account, 25), fontSize: 10 },
                            ...(showInput ? [{ text: formatCurrencyForPrint(tx.debit, {noSuffix: true, noAnimation: true}), fontSize: 10, alignment: 'right', color: '#059669' }] : []),
                            ...(showOutput ? [{ text: '-', fontSize: 10, alignment: 'right' }] : [])
                        ]);
                    });
                }
                
                // Add output transactions
                if (showOutput && dateTransactions.output.length > 0) {
                    dateTransactions.output.forEach(tx => {
                        tableBody.push([
                            { text: dateKey, fontSize: 10 },
                            { text: tx.voucherNumber || '-', fontSize: 10 },
                            { text: truncateAccountName(tx.account, 25), fontSize: 10 },
                            ...(showInput ? [{ text: '-', fontSize: 10, alignment: 'right' }] : []),
                            ...(showOutput ? [{ text: formatCurrencyForPrint(tx.credit, {noSuffix: true, noAnimation: true}), fontSize: 10, alignment: 'right', color: '#DC2626' }] : [])
                        ]);
                    });
                }
            });

            // Add voucher count row (use { text: ' ' } for colspan placeholders - empty cells break pdfmake page breaks)
            tableBody.push([
                { text: 'Voucher Count', bold: true, fontSize: 10, colSpan: 3 },
                { text: ' ' },
                { text: ' ' },
                ...(showInput ? [{ text: String(inputVouchers.size), bold: true, fontSize: 10, alignment: 'right' }] : []),
                ...(showOutput ? [{ text: String(outputVouchers.size), bold: true, fontSize: 10, alignment: 'right' }] : [])
            ]);

            // Add total row
            tableBody.push([
                { text: 'Total', bold: true, fontSize: 10, colSpan: 3 },
                { text: ' ' },
                { text: ' ' },
                ...(showInput ? [{ text: formatCurrencyForPrint(totalInput, {noSuffix: true, noAnimation: true}), bold: true, fontSize: 10, alignment: 'right', color: '#059669' }] : []),
                ...(showOutput ? [{ text: formatCurrencyForPrint(totalOutput, {noSuffix: true, noAnimation: true}), bold: true, fontSize: 10, alignment: 'right', color: '#DC2626' }] : [])
            ]);

            // Add net balance row if both input and output are shown
            if (showInput && showOutput) {
                tableBody.push([
                    { text: 'Net Balance', bold: true, fontSize: 10, colSpan: 3 },
                    { text: ' ' },
                    { text: ' ' },
                    { text: formatCurrencyForPrint(Math.abs(netBalance), {noSuffix: true, noAnimation: true}) + (netBalance >= 0 ? ' Dr' : ' Cr'), bold: true, fontSize: 10, alignment: 'right', colSpan: 2 },
                    { text: ' ' }
                ]);
            }

            content.push({
                table: {
                    headerRows: 1,
                    widths: ['auto', 'auto', '*', ...(showInput ? ['auto'] : []), ...(showOutput ? ['auto'] : [])],
                    body: tableBody
                },
                layout: 'lightHorizontalLines',
                margin: [0, 0, 0, 15]
            });
        });
        
        // Calculate total unique vouchers across all tax accounts
        const allVouchers = new Set<string>();
        sortedTaxIds.forEach(taxId => {
            const taxData = transactionsByTax[taxId];
            taxData.input.forEach(tx => { if (tx.voucherNumber) allVouchers.add(tx.voucherNumber); });
            taxData.output.forEach(tx => { if (tx.voucherNumber) allVouchers.add(tx.voucherNumber); });
        });

        openPrintDirect({
            company: { name: company?.name || '', address: company?.address, phone: company?.phone, pan: company?.pan, decimalPlaces: company?.decimalPlaces, showDrCr: company?.showDrCr, showCurrencySymbol: company?.showCurrencySymbol, logoUrl: company?.logoUrl },
            dateSystem, 
            title: `Tax Summary (${taxFilter.toUpperCase()})`, 
            dateRangeText: dateRangeText,
            context: 'daybook', 
            vouchersCount: allVouchers.size, 
            openingBalance: 0, 
            transactions: [],
            customContent: content
        }, true);
    };

    const handlePrintStock = () => {
        let dateRangeText = "All Time";
        if(stockDateRange?.from) {
            const from = stockDateRange.from;
            const to = stockDateRange.to || from;
            const fromBS = formatDateBS(from);
            const toBS = formatDateBS(to);
            const fromAD = formatDate(from);
            const toAD = formatDate(to);
            if (dateSystem === 'AD') dateRangeText = `AD: ${fromAD}${!isSameDay(from, to) ? ` to ${toAD}`: ''}`;
            else if (dateSystem === 'BS') dateRangeText = `BS: ${fromBS}${!isSameDay(from, to) ? ` to ${toBS}`: ''}`;
            else dateRangeText = `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
        }

        const body: any[] = [
            [
                { text: 'Item Name', bold: true, fontSize: 8 }, 
                { text: 'Qty', bold: true, fontSize: 8, alignment: 'right' }, 
                { text: 'Rate', bold: true, fontSize: 8, alignment: 'right' }, 
                { text: 'Value', bold: true, fontSize: 8, alignment: 'right' }
            ]
        ];
        overallStockSummary.items.forEach(i => {
            body.push([
                { text: i.name, fontSize: 7, noWrap: false }, 
                { text: `${i.qty.toFixed(2)} ${i.unit}`, fontSize: 7, alignment: 'right' }, 
                { text: formatCurrency(i.rate, {noSuffix: true, noAnimation: true}), fontSize: 7, alignment: 'right' }, 
                { text: formatCurrency(i.value, {noSuffix: true, noAnimation: true}), fontSize: 7, alignment: 'right' }
            ]);
        });
        body.push([
            {text: 'Total Stock Value', bold: true, fontSize: 8, colSpan: 3}, 
            {}, 
            {}, 
            {text: formatCurrency(overallStockSummary.totalStockValue, {noSuffix: true, noAnimation: true}), bold: true, fontSize: 8, alignment: 'right'}
        ]);

        openPrintDirect({
            company: { name: company?.name || '', address: company?.address, phone: company?.phone, pan: company?.pan, logoUrl: company?.logoUrl },
            dateSystem, title: "Stock Summary", dateRangeText: dateRangeText,
            context: 'daybook', vouchersCount: 0, openingBalance: 0, transactions: [],
            customContent: [{ 
                table: { 
                    widths: ['*', 65, 65, 75], // Flexible first column, compact fixed widths for A4 paper (total ~205 + flexible)
                    body 
                }, 
                layout: {
                    hLineWidth: () => 0.5,
                    vLineWidth: () => 0,
                    paddingLeft: () => 2,
                    paddingRight: () => 2,
                    paddingTop: () => 2,
                    paddingBottom: () => 2,
                }
            }]
        }, true);
    };

    const handlePrintBankCash = () => {
        let dateRangeText = "All Time";
        if(bankCashDateRange?.from) {
            const from = bankCashDateRange.from;
            const to = bankCashDateRange.to || from;
            const fromBS = formatDateBS(from);
            const toBS = formatDateBS(to);
            const fromAD = formatDate(from);
            const toAD = formatDate(to);
            if (dateSystem === 'AD') dateRangeText = `AD: ${fromAD}${!isSameDay(from, to) ? ` to ${toAD}`: ''}`;
            else if (dateSystem === 'BS') dateRangeText = `BS: ${fromBS}${!isSameDay(from, to) ? ` to ${toBS}`: ''}`;
            else dateRangeText = `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
        }

        const body: any[] = [
            [
                { text: 'Account', bold: true, fontSize: 10 },
                { text: 'Type', bold: true, fontSize: 10 },
                { text: 'Total In', bold: true, fontSize: 10, alignment: 'right' },
                { text: 'Total Out', bold: true, fontSize: 10, alignment: 'right' },
                { text: 'Balance', bold: true, fontSize: 10, alignment: 'right' }
            ]
        ];

        // Bank accounts
        bankCashSummary.bankAccounts.forEach(acc => {
            const balance = acc.balance;
            const balanceText = balance !== 0 
                ? `${formatCurrencyForPrint(Math.abs(balance), {noSuffix: true, noAnimation: true})} ${balance >= 0 ? 'Dr' : 'Cr'}`
                : 'Rs. 0.00 Dr';
            body.push([
                { text: acc.accountName, fontSize: 9 },
                { text: acc.accountType, fontSize: 9 },
                { text: acc.inflow > 0 ? formatCurrencyForPrint(acc.inflow, {noSuffix: true, noAnimation: true}) : '-', fontSize: 9, alignment: 'right', color: '#059669' },
                { text: acc.outflow > 0 ? formatCurrencyForPrint(acc.outflow, {noSuffix: true, noAnimation: true}) : '-', fontSize: 9, alignment: 'right', color: '#DC2626' },
                { text: balanceText, fontSize: 9, alignment: 'right', bold: true, color: balance >= 0 ? '#059669' : '#DC2626' }
            ]);
        });

        // Bank Total
        const bankTotalBalance = bankCashSummary.bankAccounts.reduce((sum, a) => sum + a.balance, 0);
        const bankTotalText = `${formatCurrencyForPrint(Math.abs(bankTotalBalance), {noSuffix: true, noAnimation: true})} ${bankTotalBalance >= 0 ? 'Dr' : 'Cr'}`;
        body.push([
            { text: 'Bank Total', bold: true, fontSize: 10, colSpan: 2, fillColor: '#f3f4f6' },
            {},
            { text: formatCurrencyForPrint(bankCashSummary.totalBankInflow, {noSuffix: true, noAnimation: true}), bold: true, fontSize: 10, alignment: 'right', color: '#059669', fillColor: '#f3f4f6' },
            { text: formatCurrencyForPrint(bankCashSummary.totalBankOutflow, {noSuffix: true, noAnimation: true}), bold: true, fontSize: 10, alignment: 'right', color: '#DC2626', fillColor: '#f3f4f6' },
            { text: bankTotalText, bold: true, fontSize: 10, alignment: 'right', color: bankTotalBalance >= 0 ? '#059669' : '#DC2626', fillColor: '#f3f4f6' }
        ]);

        // Cash accounts
        bankCashSummary.cashAccounts.forEach(acc => {
            const balance = acc.balance;
            const balanceText = balance !== 0 
                ? `${formatCurrencyForPrint(Math.abs(balance), {noSuffix: true, noAnimation: true})} ${balance >= 0 ? 'Dr' : 'Cr'}`
                : 'Rs. 0.00 Dr';
            body.push([
                { text: acc.accountName, fontSize: 9 },
                { text: acc.accountType, fontSize: 9 },
                { text: acc.inflow > 0 ? formatCurrencyForPrint(acc.inflow, {noSuffix: true, noAnimation: true}) : '-', fontSize: 9, alignment: 'right', color: '#059669' },
                { text: acc.outflow > 0 ? formatCurrencyForPrint(acc.outflow, {noSuffix: true, noAnimation: true}) : '-', fontSize: 9, alignment: 'right', color: '#DC2626' },
                { text: balanceText, fontSize: 9, alignment: 'right', bold: true, color: balance >= 0 ? '#059669' : '#DC2626' }
            ]);
        });

        // Cash Total
        const cashTotalBalance = bankCashSummary.cashAccounts.reduce((sum, a) => sum + a.balance, 0);
        const cashTotalText = `${formatCurrencyForPrint(Math.abs(cashTotalBalance), {noSuffix: true, noAnimation: true})} ${cashTotalBalance >= 0 ? 'Dr' : 'Cr'}`;
        body.push([
            { text: 'Cash Total', bold: true, fontSize: 10, colSpan: 2, fillColor: '#f3f4f6' },
            {},
            { text: formatCurrencyForPrint(bankCashSummary.totalCashInflow, {noSuffix: true, noAnimation: true}), bold: true, fontSize: 10, alignment: 'right', color: '#059669', fillColor: '#f3f4f6' },
            { text: formatCurrencyForPrint(bankCashSummary.totalCashOutflow, {noSuffix: true, noAnimation: true}), bold: true, fontSize: 10, alignment: 'right', color: '#DC2626', fillColor: '#f3f4f6' },
            { text: cashTotalText, bold: true, fontSize: 10, alignment: 'right', color: cashTotalBalance >= 0 ? '#059669' : '#DC2626', fillColor: '#f3f4f6' }
        ]);

        openPrintDirect({
            company: { 
                name: company?.name || '', 
                address: company?.address, 
                phone: company?.phone, 
                pan: company?.pan,
                decimalPlaces: company?.decimalPlaces,
                showDrCr: company?.showDrCr,
                showCurrencySymbol: company?.showCurrencySymbol,
                logoUrl: company?.logoUrl
            },
            dateSystem,
            title: "Bank & Cash Summary",
            dateRangeText,
            context: 'daybook',
            vouchersCount: 0,
            openingBalance: 0,
            transactions: [],
            customContent: [{
                table: {
                    widths: ['*', 'auto', 'auto', 'auto', 'auto'],
                    body
                },
                layout: 'lightHorizontalLines'
            }]
        }, true); // Pass true to open in new tab instead of print dialog
    };

    // Stats calculation for voucher type summaries
    const statCardData = [
        { title: 'Sales', icon: ShoppingBag, type: 'sale', link: '/sale', isCredit: true },
        { title: 'Purchases', icon: ShoppingCart, type: 'purchase', link: '/purchase', isCredit: false },
        { title: 'Journals', icon: BookText, type: 'journal', link: '/journal', isCredit: false },
        { title: 'Add Salary', icon: FileDigit, type: 'add_salary', link: '/add-salary', isCredit: false },
        { title: 'Contra', icon: Landmark, type: 'contra', link: '/contra', isCredit: false },
        { title: 'Direct Income', icon: TrendingUp, type: 'direct_income', link: '/incomes', isCredit: true },
        { title: 'Direct Expense', icon: TrendingDown, type: 'direct_expense', link: '/incomes', isCredit: false },
    ];

    const getTransactionAmounts = (transaction: any) => {
        const t = transaction;
        const amount = Number(t.total || t.amount || 0);
        let debit = 0;
        let credit = 0;

        switch (t.type) {
            case 'sale':
            case 'direct_income':
            case 'payment_in': 
                credit = amount;
                break;
            case 'purchase':
            case 'direct_expense':
            case 'payment_out':
                debit = amount;
                break;
            case 'contra':
                debit = amount;
                credit = amount;
                break;
            case 'journal':
                if (t.entries && Array.isArray(t.entries)) {
                    debit = t.entries.reduce((sum: number, e: any) => sum + Number(e.debit || 0), 0);
                    credit = t.entries.reduce((sum: number, e: any) => sum + Number(e.credit || 0), 0);
                }
                break;
        }
        return { debit, credit };
    };

    const stats = useMemo(() => {
        if (!vouchers) return { paymentInTotal: 0, paymentOutTotal: 0, otherStats: statCardData.map(s => ({ ...s, total: 0, count: 0 })) };

        const paymentInTotal = vouchers.filter(v => v.type === 'payment_in').reduce((sum, v) => sum + (v.total || v.amount || 0), 0);
        const paymentOutTotal = vouchers.filter(v => v.type === 'payment_out').reduce((sum, v) => sum + (v.total || v.amount || 0), 0);

        const otherStats = statCardData.map((card) => {
            const filteredVouchers = vouchers.filter((v) => {
                if (card.type === 'journal') return v.type === 'journal' && !v.subType;
                if (card.type === 'add_salary') return v.type === 'journal' && v.subType === 'add_salary';
                return v.type === card.type;
            });
            
            let total = 0;
            if (card.type === 'journal' || card.type === 'add_salary' || card.type === 'contra') {
                total = filteredVouchers.reduce((sum, v) => sum + Number(getTransactionAmounts(v).debit), 0);
            } else {
                total = filteredVouchers.reduce((sum, v) => sum + Number(v.total || v.amount || 0), 0);
            }

            return { ...card, total, count: filteredVouchers.length };
        });

        return { paymentInTotal, paymentOutTotal, otherStats };
    }, [vouchers]);

    const gridCols = compact ? "" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5";
    const cardSpacing = compact ? "gap-0.5 px-0.5" : "gap-0.5 px-0.5";
    const cardBorder = compact ? "border-foreground/20" : "border-foreground/20";
    
    // Responsive classes only for compact mode (report page)
    // Use min-width to prevent content overflow, cards will auto-adjust columns
    const cardWrapperClass = compact ? "flex flex-col min-w-0 w-full" : "";
    const headerClass = compact ? "min-w-0 gap-2 flex-shrink-0" : "";
    const titleClass = compact ? "truncate flex-shrink-0" : "";
    const filterWrapperClass = compact ? "flex-shrink-0" : "";
    const contentClass = compact ? "flex-1 flex flex-col" : "";

    return (
        <div className={`${compact ? 'financial-summary-grid' : `grid ${gridCols}`} ${cardSpacing} ${compact ? 'w-full' : ''}`}>
            <Card className={`${compact ? 'financial-summary-stock-card' : 'col-span-1 lg:col-span-2'} transition-colors ${cardBorder} ${cardWrapperClass}`}>
                <CardHeader className={`flex flex-row items-center justify-between p-4 space-y-0 ${headerClass} overflow-hidden`}>
                    <CardTitle className={`text-base whitespace-nowrap ${titleClass} min-w-0`}>Stock Summary</CardTitle>
                    {compact ? (
                        <ReportMonthYearFilter dateRange={stockDateRange} setDateRange={setStockDateRange} dateSystem={dateSystem} />
                    ) : (
                        <MonthYearFilter dateRange={stockDateRange} setDateRange={setStockDateRange} dateSystem={dateSystem} />
                    )}
                </CardHeader>
                <CardContent className={`p-4 pt-0 flex flex-col min-h-0 ${contentClass}`}>
                    <ScrollArea className={`flex-1 max-h-[min(55vh,380px)] pr-3 -mr-1 ${compact ? 'min-h-0' : ''}`}>
                        <div className="space-y-6 pb-4">
                            <div className="text-center pt-2">
                                <p className="text-xs text-muted-foreground">Total Stock Value</p>
                                <div className="flex items-center justify-center gap-2">
                                    <p className={cn('text-2xl font-bold whitespace-nowrap', overallStockSummary.totalStockValue >= 0 ? 'text-green-600' : 'text-red-600')}>
                                        {formatCurrency(overallStockSummary.totalStockValue, {noSuffix: true, duration: 2})}
                                    </p>
                                </div>
                            </div>
                            <div className="space-y-6">
                                <div>
                                    <h4 className="text-xs font-semibold mb-2 text-center">Top 5 Sale Items</h4>
                                    <div className="space-y-2">
                                        {overallStockSummary.topSaleItems.map((item, index) => (
                                            <div key={`sale-top-${item.id}-${index}`} className="flex justify-between items-center text-sm border-t pt-2 gap-2">
                                                <span className="font-semibold min-w-0 truncate">{item.name}</span>
                                                <div className="text-right shrink-0 whitespace-nowrap">
                                                    <p className="font-bold text-green-600">{formatCurrency(item.salesValue, {noSuffix: true, duration: 2})}</p>
                                                    <p className="text-xs text-muted-foreground">{item.salesQty.toFixed(2)} {item.smallestUnit}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-xs font-semibold mb-2 text-center">Top 5 Purchase Items</h4>
                                    <div className="space-y-2">
                                        {overallStockSummary.topPurchaseItems.map((item, index) => (
                                            <div key={`purchase-top-${item.id}-${index}`} className="flex justify-between items-center text-sm border-t pt-2 gap-2">
                                                <span className="font-semibold min-w-0 truncate">{item.name}</span>
                                                <div className="text-right shrink-0 whitespace-nowrap">
                                                    <p className="font-bold text-red-600">{formatCurrency(item.purchaseValue, {noSuffix: true, duration: 2})}</p>
                                                    <p className="text-xs text-muted-foreground">{item.purchaseQty.toFixed(2)} {item.smallestUnit}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                    {showDetails && (
                        <div className="text-right pt-2">
                            <Dialog open={stockSummaryOpen} onOpenChange={setStockSummaryOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="link" size="sm" className="h-auto p-0">View Details</Button>
                                </DialogTrigger>
                                <DialogContent 
                                    className="max-w-4xl p-0 h-[90vh] rounded-lg flex flex-col"
                                    onPointerDownOutside={(e) => {
                                        const target = e.target as HTMLElement;
                                        // Prevent closing when clicking on Select dropdown (portal)
                                        if (target.closest('[data-radix-select-content]')) {
                                            e.preventDefault();
                                        }
                                    }}
                                    onInteractOutside={(e) => {
                                        const target = e.target as HTMLElement;
                                        // Prevent closing when clicking on Select dropdown (portal)
                                        if (target.closest('[data-radix-select-content]')) {
                                            e.preventDefault();
                                        }
                                    }}
                                >
                                    <DialogHeader className="px-4 pt-4 pb-2 border-b flex flex-row justify-between items-center">
                                        <div className="flex flex-col"><DialogTitle className="font-bold text-black">Stock Summary Details</DialogTitle></div>
                                        <div 
                                            className="flex items-center gap-2 mr-12"
                                            onClick={(e) => e.stopPropagation()}
                                            onPointerDown={(e) => e.stopPropagation()}
                                        >
                                            <div 
                                                onClick={(e) => e.stopPropagation()} 
                                                onPointerDown={(e) => e.stopPropagation()}
                                                className="[&_button]:h-9"
                                            >
                                                <MonthYearFilter dateRange={stockDateRange} setDateRange={setStockDateRange} dateSystem={dateSystem} />
                                            </div>
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePrintStock();
                                                }} 
                                                className="h-9 flex items-center gap-2"
                                            >
                                                Print <Printer className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </DialogHeader>
                                    <div className="flex-1 px-4 py-4 flex flex-col min-h-0">
                                        <div className="border rounded-lg flex-1 flex flex-col min-h-0 overflow-hidden">
                                            <div className="flex-1 flex flex-col min-h-0">
                                                <ScrollArea className="flex-1">
                                                    <table className="w-full border-collapse">
                                                        <thead className="sticky top-0 bg-background z-10">
                                                            <tr>
                                                                <th className="h-9 px-4 text-left align-middle font-bold text-black whitespace-nowrap border-b-2 border-r">Item Name</th>
                                                                <th className="h-9 px-4 text-right align-middle font-bold text-black whitespace-nowrap border-b-2 border-r">Quantity</th>
                                                                <th className="h-9 px-4 text-right align-middle font-bold text-black whitespace-nowrap border-b-2 border-r">Rate</th>
                                                                <th className="h-9 px-4 text-right align-middle font-bold text-black whitespace-nowrap border-b-2">Value</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {overallStockSummary.items.map((item, i) => (
                                                                <tr key={i}>
                                                                    <td className="px-4 py-2 align-middle font-medium whitespace-nowrap border-b-2 border-r">{item.name}</td>
                                                                    <td className="px-4 py-2 text-right align-middle whitespace-nowrap border-b-2 border-r">{item.qty.toFixed(2)} {item.unit}</td>
                                                                    <td className="px-4 py-2 text-right align-middle whitespace-nowrap border-b-2 border-r">{formatCurrency(item.rate, {noSuffix: true})}</td>
                                                                    <td className="px-4 py-2 text-right align-middle font-bold whitespace-nowrap border-b-2">{formatCurrency(item.value, {noSuffix: true})}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                        <tfoot className="bg-muted/50">
                                                            <tr>
                                                                <td className="px-4 py-2 align-middle font-bold whitespace-nowrap border-r" colSpan={3}>Total Stock Value</td>
                                                                <td className="px-4 py-2 text-right align-middle font-bold text-green-600 whitespace-nowrap">{formatCurrency(overallStockSummary.totalStockValue, {noSuffix: true})}</td>
                                                            </tr>
                                                        </tfoot>
                                                    </table>
                                                </ScrollArea>
                                            </div>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                    )}
                </CardContent>
            </Card>

            {can("view_receivable_payable_summary") && (
                <Card className={`col-span-1 transition-colors ${cardBorder} ${cardWrapperClass}`}>
                    <CardHeader className={`flex flex-row items-center justify-between p-4 space-y-0 ${headerClass} overflow-hidden`}>
                        <CardTitle className={`text-base whitespace-nowrap text-card-foreground ${titleClass} min-w-0`}>
                            Outstanding
                        </CardTitle>
                        {compact ? (
                            <ReportMonthYearFilter dateRange={receivablesDateRange} setDateRange={setReceivablesDateRange} dateSystem={dateSystem} />
                        ) : (
                            <MonthYearFilter dateRange={receivablesDateRange} setDateRange={setReceivablesDateRange} dateSystem={dateSystem} />
                        )}
                    </CardHeader>
                    <CardContent className={`p-4 pt-0 space-y-2 ${contentClass}`}>
                        <div className="flex items-baseline justify-between">
                            <span className="text-xs text-muted-foreground">{compact ? "Total Receivable" : "To Receive"}</span>
                            <span className="text-base font-bold text-green-600">
                                {formatCurrency(financialSummary.totalReceivable, {noSuffix: true})} <span className="text-xs">Dr</span>
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between">
                            <span className="text-xs text-muted-foreground">{compact ? "Total Payable" : "To Pay"}</span>
                            <span className="text-base font-bold text-red-600">
                                {formatCurrency(Math.abs(financialSummary.totalPayable), {noSuffix: true})} <span className="text-xs">Cr</span>
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between pt-2 mt-2 border-t">
                            <span className="text-sm font-bold">{compact ? "Net Balance" : "Net"}</span>
                            <span className={cn('text-lg font-bold', netBalance >= 0 ? "text-green-600" : "text-red-600")}>
                                {formatCurrency(netBalance, { showDrCr: true })}
                            </span>
                        </div>
                        {showDetails && (
                            <div className="text-right pt-2">
                                <Dialog open={receivablesPayablesOpen} onOpenChange={(open) => {
                                    setReceivablesPayablesOpen(open);
                                    if (!open) {
                                        // Reset tab state when dialog closes
                                        setReceivablesPayablesTab('both');
                                        setHasTabBeenClicked(false);
                                    }
                                }}>
                                    <DialogTrigger asChild>
                                        <Button variant="link" size="sm" className="h-auto p-0">View Details</Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-6xl p-0 h-[90vh] rounded-lg flex flex-col">
                                        <DialogHeader className="p-4 border-b flex flex-col space-y-3">
                                            <DialogTitle className="whitespace-nowrap text-base md:text-lg">Receivables & Payables Details</DialogTitle>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <div className="flex bg-muted rounded-md p-1 space-x-1 h-9">
                                                    {['all', 'party', 'staff', 'tax'].map((type) => (
                                                        <button 
                                                            key={type} 
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setReceivablePayableFilter(type as any);
                                                            }} 
                                                            className={cn("h-full px-3 text-xs rounded-sm transition-all capitalize font-medium flex items-center justify-center", receivablePayableFilter === type ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                                                        >
                                                            {type}
                                                        </button>
                                                    ))}
                                                </div>
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handlePrint();
                                                    }} 
                                                    className="h-9 flex items-center gap-2"
                                                >
                                                    Print <Printer className="h-4 w-4" />
                                                </Button>
                                            </div>
                                            <Tabs 
                                                value={receivablesPayablesTab === 'both' ? 'receivables' : receivablesPayablesTab} 
                                                onValueChange={(v) => {
                                                    setHasTabBeenClicked(true);
                                                    setReceivablesPayablesTab(v as 'receivables' | 'payables');
                                                }} 
                                                className="w-full"
                                            >
                                                <TabsList className="grid w-full grid-cols-2">
                                                    <TabsTrigger value="receivables">Receivables</TabsTrigger>
                                                    <TabsTrigger value="payables">Payables</TabsTrigger>
                                                </TabsList>
                                            </Tabs>
                                        </DialogHeader>
                                        <div className="flex-1 px-2 pt-0 pb-4 min-h-0 overflow-auto">
                                            {isMobile && !hasTabBeenClicked ? (
                                                // Mobile: Show both full width separately when tab is not clicked (initial state)
                                                <div className="space-y-4">
                                                    <div className="flex flex-col min-h-0">
                                                        <h3 className="text-lg font-semibold mb-0.5 text-green-600 mt-0">Receivables ({financialSummary.recCount})</h3>
                                                        <div className="border rounded-lg flex flex-col min-h-0">
                                                            <ScrollArea className="flex-1">
                                                                <Table>
                                                                    <TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                                                                    <TableBody>
                                                                        {(receivablePayableFilter === 'all' || receivablePayableFilter === 'party') && financialSummary.receivables.parties.filter(p => p.party !== "Opening Balance").map(p => <TableRow key={p.party}><TableCell>{p.party}</TableCell><TableCell className="text-right">{formatCurrency(p.balance, {noSuffix: true})}</TableCell></TableRow>)}
                                                                        {(receivablePayableFilter === 'all' || receivablePayableFilter === 'staff') && financialSummary.receivables.staff.filter(p => p.party !== "Opening Balance").map(p => <TableRow key={p.party}><TableCell>{p.party}</TableCell><TableCell className="text-right">{formatCurrency(p.balance, {noSuffix: true})}</TableCell></TableRow>)}
                                                                        {(receivablePayableFilter === 'all' || receivablePayableFilter === 'tax') && financialSummary.receivables.taxes.filter(p => p.party !== "Opening Balance").map(p => <TableRow key={p.party}><TableCell>{p.party}</TableCell><TableCell className="text-right">{formatCurrency(p.balance, {noSuffix: true})}</TableCell></TableRow>)}
                                                                    </TableBody>
                                                                </Table>
                                                            </ScrollArea>
                                                            <div className="p-2 border-t font-bold flex justify-between"><span>Total Receivable</span><span>{formatCurrency(financialSummary.totalReceivable, {noSuffix: true})}</span></div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col min-h-0">
                                                        <h3 className="text-lg font-semibold mb-0.5 text-red-600">Payables ({financialSummary.payCount})</h3>
                                                        <div className="border rounded-lg flex flex-col min-h-0">
                                                            <ScrollArea className="flex-1">
                                                                <Table>
                                                                    <TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                                                                    <TableBody>
                                                                        {(receivablePayableFilter === 'all' || receivablePayableFilter === 'party') && financialSummary.payables.parties.filter(p => p.party !== "Opening Balance").map(p => <TableRow key={p.party}><TableCell>{p.party}</TableCell><TableCell className="text-right">{formatCurrency(Math.abs(p.balance), {noSuffix: true})}</TableCell></TableRow>)}
                                                                        {(receivablePayableFilter === 'all' || receivablePayableFilter === 'staff') && financialSummary.payables.staff.filter(p => p.party !== "Opening Balance").map(p => <TableRow key={p.party}><TableCell>{p.party}</TableCell><TableCell className="text-right">{formatCurrency(Math.abs(p.balance), {noSuffix: true})}</TableCell></TableRow>)}
                                                                        {(receivablePayableFilter === 'all' || receivablePayableFilter === 'tax') && financialSummary.payables.taxes.filter(p => p.party !== "Opening Balance").map(p => <TableRow key={p.party}><TableCell>{p.party}</TableCell><TableCell className="text-right">{formatCurrency(Math.abs(p.balance), {noSuffix: true})}</TableCell></TableRow>)}
                                                                    </TableBody>
                                                                </Table>
                                                            </ScrollArea>
                                                            <div className="p-2 border-t font-bold flex justify-between"><span>Total Payable</span><span>{formatCurrency(Math.abs(financialSummary.totalPayable), {noSuffix: true})}</span></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                // Desktop: Always show side by side, Mobile: Show selected tab only
                                                <div className={cn("grid gap-4 flex-1 min-h-0", !isMobile ? "grid-cols-2" : "grid-cols-1")}>
                                                    {(!isMobile || receivablesPayablesTab === 'receivables') && (
                                                        <div className="flex flex-col min-h-0">
                                                            <h3 className="text-lg font-semibold mb-0.5 text-green-600">Receivables ({financialSummary.recCount})</h3>
                                                            <div className="flex-1 border rounded-lg flex flex-col min-h-0">
                                                                <ScrollArea className="flex-1">
                                                                    <Table>
                                                                        <TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                                                                        <TableBody>
                                                                            {(receivablePayableFilter === 'all' || receivablePayableFilter === 'party') && financialSummary.receivables.parties.filter(p => p.party !== "Opening Balance").map(p => <TableRow key={p.party}><TableCell>{p.party}</TableCell><TableCell className="text-right">{formatCurrency(p.balance, {noSuffix: true})}</TableCell></TableRow>)}
                                                                            {(receivablePayableFilter === 'all' || receivablePayableFilter === 'staff') && financialSummary.receivables.staff.filter(p => p.party !== "Opening Balance").map(p => <TableRow key={p.party}><TableCell>{p.party}</TableCell><TableCell className="text-right">{formatCurrency(p.balance, {noSuffix: true})}</TableCell></TableRow>)}
                                                                            {(receivablePayableFilter === 'all' || receivablePayableFilter === 'tax') && financialSummary.receivables.taxes.filter(p => p.party !== "Opening Balance").map(p => <TableRow key={p.party}><TableCell>{p.party}</TableCell><TableCell className="text-right">{formatCurrency(p.balance, {noSuffix: true})}</TableCell></TableRow>)}
                                                                        </TableBody>
                                                                    </Table>
                                                                </ScrollArea>
                                                                <div className="p-2 border-t font-bold flex justify-between"><span>Total Receivable</span><span>{formatCurrency(financialSummary.totalReceivable, {noSuffix: true})}</span></div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {(!isMobile || receivablesPayablesTab === 'payables') && (
                                                        <div className="flex flex-col min-h-0">
                                                            <h3 className="text-lg font-semibold mb-0.5 text-red-600">Payables ({financialSummary.payCount})</h3>
                                                            <div className="flex-1 border rounded-lg flex flex-col min-h-0">
                                                                <ScrollArea className="flex-1">
                                                                    <Table>
                                                                        <TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                                                                        <TableBody>
                                                                            {(receivablePayableFilter === 'all' || receivablePayableFilter === 'party') && financialSummary.payables.parties.filter(p => p.party !== "Opening Balance").map(p => <TableRow key={p.party}><TableCell>{p.party}</TableCell><TableCell className="text-right">{formatCurrency(Math.abs(p.balance), {noSuffix: true})}</TableCell></TableRow>)}
                                                                            {(receivablePayableFilter === 'all' || receivablePayableFilter === 'staff') && financialSummary.payables.staff.filter(p => p.party !== "Opening Balance").map(p => <TableRow key={p.party}><TableCell>{p.party}</TableCell><TableCell className="text-right">{formatCurrency(Math.abs(p.balance), {noSuffix: true})}</TableCell></TableRow>)}
                                                                            {(receivablePayableFilter === 'all' || receivablePayableFilter === 'tax') && financialSummary.payables.taxes.filter(p => p.party !== "Opening Balance").map(p => <TableRow key={p.party}><TableCell>{p.party}</TableCell><TableCell className="text-right">{formatCurrency(Math.abs(p.balance), {noSuffix: true})}</TableCell></TableRow>)}
                                                                        </TableBody>
                                                                    </Table>
                                                                </ScrollArea>
                                                                <div className="p-2 border-t font-bold flex justify-between"><span>Total Payable</span><span>{formatCurrency(Math.abs(financialSummary.totalPayable), {noSuffix: true})}</span></div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
            
            {can("view_payment_in_out_summary") && (
                <Card className={`col-span-1 transition-colors ${cardBorder} ${cardWrapperClass}`}>
                    <CardHeader className={`flex flex-row items-center justify-between p-4 space-y-0 ${headerClass} overflow-hidden`}>
                        <CardTitle className={`text-base whitespace-nowrap ${titleClass} min-w-0`}>Cash Flow</CardTitle>
                        {compact ? (
                            <ReportMonthYearFilter dateRange={cashFlowDateRange} setDateRange={setCashFlowDateRange} dateSystem={dateSystem} />
                        ) : (
                            <MonthYearFilter dateRange={cashFlowDateRange} setDateRange={setCashFlowDateRange} dateSystem={dateSystem} />
                        )}
                    </CardHeader>
                    <CardContent className={`p-4 pt-0 space-y-2 ${contentClass}`}>
                        <div className="flex items-baseline justify-between">
                            <span className="text-xs text-muted-foreground">Payment In</span>
                            <span className="text-base font-bold text-green-600">
                                {formatCurrency(cashFlowDetails.totalInflow, {noSuffix: true})} <span className="text-xs">Dr</span>
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between">
                            <span className="text-xs text-muted-foreground">Payment Out</span>
                            <span className="text-base font-bold text-red-600">
                                {formatCurrency(cashFlowDetails.totalOutflow, {noSuffix: true})} <span className="text-xs">Cr</span>
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between pt-2 mt-2 border-t">
                            <span className="text-sm font-bold">Net Flow</span>
                            <span className={cn('text-lg font-bold', (cashFlowDetails.totalInflow - cashFlowDetails.totalOutflow) >= 0 ? "text-green-600" : "text-red-600")}>
                                {formatCurrency(Math.abs(cashFlowDetails.totalInflow - cashFlowDetails.totalOutflow), { noSuffix: true, duration: 2 })} <span className="text-xs">{(cashFlowDetails.totalInflow - cashFlowDetails.totalOutflow) >= 0 ? 'Dr' : 'Cr'}</span>
                            </span>
                        </div>
                        {showDetails && (
                            <div className="text-right pt-2">
                                <Dialog open={cashFlowOpen} onOpenChange={(open) => {
                                    setCashFlowOpen(open);
                                    if (!open) {
                                        setCashFlowTab('both');
                                        setHasCashFlowTabBeenClicked(false);
                                    }
                                }}>
                                    <DialogTrigger asChild>
                                        <Button variant="link" size="sm" className="h-auto p-0">View Details</Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-6xl p-0 h-[90vh] rounded-lg flex flex-col">
                                        <DialogHeader className="p-4 border-b flex flex-col space-y-3">
                                            <DialogTitle className="whitespace-nowrap text-base md:text-lg">Cash Flow Details</DialogTitle>
                                            {/* First Row: Date Filter and Entity Dropdown */}
                                            <div className="flex items-center gap-2 w-full">
                                                <div className="flex-1 [&_button]:h-9">
                                                    <MonthYearFilter dateRange={cashFlowDateRange} setDateRange={setCashFlowDateRange} dateSystem={dateSystem} />
                                                </div>
                                                <Select value={cashFlowCategoryFilter} onValueChange={(v) => setCashFlowCategoryFilter(v as any)}>
                                                    <SelectTrigger className="h-9 flex-1">
                                                        <SelectValue placeholder="Select Entity" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="all">All</SelectItem>
                                                        <SelectItem value="party">Party</SelectItem>
                                                        <SelectItem value="staff">Staff</SelectItem>
                                                        <SelectItem value="tax">Tax</SelectItem>
                                                        <SelectItem value="income_expense">Income / Expense</SelectItem>
                                                        <SelectItem value="other">Other</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            {/* Second Row: Flow Filter Tabs (Desktop) / Buttons (Mobile) and Print */}
                                            <div className="flex items-center gap-2 w-full">
                                                {!isMobile ? (
                                                    // Desktop: Use Tabs component
                                                    <Tabs 
                                                        value={cashFlowFilter} 
                                                        onValueChange={(v) => {
                                                            setCashFlowFilter(v as 'all' | 'inflow' | 'outflow');
                                                        }} 
                                                        className="flex-1"
                                                    >
                                                        <TabsList className="grid w-full grid-cols-3 h-9">
                                                            <TabsTrigger value="all">All</TabsTrigger>
                                                            <TabsTrigger value="inflow">Inflow</TabsTrigger>
                                                            <TabsTrigger value="outflow">Outflow</TabsTrigger>
                                                        </TabsList>
                                                    </Tabs>
                                                ) : (
                                                    // Mobile: Use buttons (original behavior)
                                                    <div className="flex bg-muted rounded-md p-1 space-x-1 flex-1 h-9">
                                                        {['all', 'inflow', 'outflow'].map((type) => (
                                                            <button 
                                                                key={type} 
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setCashFlowFilter(type as any);
                                                                }} 
                                                                className={cn("h-full px-3 text-xs rounded-sm transition-all capitalize font-medium flex items-center justify-center flex-1", cashFlowFilter === type ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                                                            >
                                                                {type}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handlePrintCashFlow();
                                                    }} 
                                                    className="h-9 flex items-center gap-2"
                                                >
                                                    Print <Printer className="h-4 w-4" />
                                                </Button>
                                            </div>
                                            {/* Mobile only: Bottom tabs for switching between Inflow/Outflow */}
                                            {isMobile && (
                                                <Tabs 
                                                    value={cashFlowTab === 'both' ? 'inflow' : cashFlowTab} 
                                                    onValueChange={(v) => {
                                                        setHasCashFlowTabBeenClicked(true);
                                                        setCashFlowTab(v as 'inflow' | 'outflow');
                                                    }} 
                                                    className="w-full"
                                                >
                                                    <TabsList className="grid w-full grid-cols-2">
                                                        <TabsTrigger value="inflow">Inflow</TabsTrigger>
                                                        <TabsTrigger value="outflow">Outflow</TabsTrigger>
                                                    </TabsList>
                                                </Tabs>
                                            )}
                                        </DialogHeader>
                                        <div className="flex-1 px-2 pt-0 pb-4 min-h-0 overflow-auto">
                                            {isMobile && !hasCashFlowTabBeenClicked ? (
                                                // Mobile: Show both full width separately when tab is not clicked (initial state)
                                                <div className="space-y-4">
                                                    <div className="flex flex-col min-h-0">
                                                        <h3 className="text-lg font-semibold mb-0.5 text-green-600 mt-0">Inflow</h3>
                                                        <div className="border rounded-lg flex flex-col min-h-0">
                                                            <ScrollArea className="flex-1">
                                                                <Table>
                                                                    <TableBody>
                                                                        {Object.entries(cashFlowDetails.categorizedInflow).map(([category, items]) => { 
                                                                            if(cashFlowCategoryFilter !== 'all' && cashFlowCategoryFilter.replace('_', ' / ').toLowerCase() !== category.toLowerCase()) return null; 
                                                                            return ( <React.Fragment key={`in-${category}`}><TableRow className="bg-muted/50"><TableCell colSpan={2} className="font-bold text-xs uppercase">{category.replace('_', ' / ')}</TableCell></TableRow>{items.map((i) => (<TableRow key={i.id}><TableCell className="pl-6">{i.name}</TableCell><TableCell className="text-right text-green-600">{formatCurrency(i.amount, {noSuffix: true})}</TableCell></TableRow>))}</React.Fragment> )
                                                                        })}
                                                                    </TableBody>
                                                                </Table>
                                                            </ScrollArea>
                                                            <div className="p-2 border-t font-bold flex justify-between"><span>Total In</span><span className="text-green-600">{formatCurrency(cashFlowDetails.totalInflow, {noSuffix: true})}</span></div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col min-h-0">
                                                        <h3 className="text-lg font-semibold mb-0.5 text-red-600 mt-0">Outflow</h3>
                                                        <div className="border rounded-lg flex flex-col min-h-0">
                                                            <ScrollArea className="flex-1">
                                                                <Table>
                                                                    <TableBody>
                                                                        {Object.entries(cashFlowDetails.categorizedOutflow).map(([category, items]) => { 
                                                                            if(cashFlowCategoryFilter !== 'all' && cashFlowCategoryFilter.replace('_', ' / ').toLowerCase() !== category.toLowerCase()) return null; 
                                                                            return ( <React.Fragment key={`out-${category}`}><TableRow className="bg-muted/50"><TableCell colSpan={2} className="font-bold text-xs uppercase">{category.replace('_', ' / ')}</TableCell></TableRow>{items.map((i) => (<TableRow key={i.id}><TableCell className="pl-6">{i.name}</TableCell><TableCell className="text-right text-red-600">{formatCurrency(i.amount, {noSuffix: true})}</TableCell></TableRow>))}</React.Fragment> )
                                                                        })}
                                                                    </TableBody>
                                                                </Table>
                                                            </ScrollArea>
                                                            <div className="p-2 border-t font-bold flex justify-between"><span>Total Out</span><span className="text-red-600">{formatCurrency(cashFlowDetails.totalOutflow, {noSuffix: true})}</span></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                // Desktop: Always show side by side based on filter, Mobile: Show selected tab only
                                                <div className={cn("grid gap-4 flex-1 min-h-0", !isMobile ? "grid-cols-2" : "grid-cols-1")}>
                                                    {(!isMobile || cashFlowTab === 'inflow') && (cashFlowFilter === 'all' || cashFlowFilter === 'inflow') && (
                                                        <div className="flex flex-col min-h-0">
                                                            <h3 className="text-lg font-semibold mb-0.5 text-green-600 mt-0">Inflow</h3>
                                                            <div className="flex-1 border rounded-lg flex flex-col min-h-0">
                                                                <ScrollArea className="flex-1">
                                                                    <Table>
                                                                        <TableBody>
                                                                            {Object.entries(cashFlowDetails.categorizedInflow).map(([category, items]) => { 
                                                                                if(cashFlowCategoryFilter !== 'all' && cashFlowCategoryFilter.replace('_', ' / ').toLowerCase() !== category.toLowerCase()) return null; 
                                                                                return ( <React.Fragment key={`in-${category}`}><TableRow className="bg-muted/50"><TableCell colSpan={2} className="font-bold text-xs uppercase">{category.replace('_', ' / ')}</TableCell></TableRow>{items.map((i) => (<TableRow key={i.id}><TableCell className="pl-6">{i.name}</TableCell><TableCell className="text-right text-green-600">{formatCurrency(i.amount, {noSuffix: true})}</TableCell></TableRow>))}</React.Fragment> )
                                                                            })}
                                                                        </TableBody>
                                                                    </Table>
                                                                </ScrollArea>
                                                                <div className="p-2 border-t font-bold flex justify-between"><span>Total In</span><span className="text-green-600">{formatCurrency(cashFlowDetails.totalInflow, {noSuffix: true})}</span></div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {(!isMobile || cashFlowTab === 'outflow') && (cashFlowFilter === 'all' || cashFlowFilter === 'outflow') && (
                                                        <div className="flex flex-col min-h-0">
                                                            <h3 className="text-lg font-semibold mb-0.5 text-red-600 mt-0">Outflow</h3>
                                                            <div className="flex-1 border rounded-lg flex flex-col min-h-0">
                                                                <ScrollArea className="flex-1">
                                                                    <Table>
                                                                        <TableBody>
                                                                            {Object.entries(cashFlowDetails.categorizedOutflow).map(([category, items]) => { 
                                                                                if(cashFlowCategoryFilter !== 'all' && cashFlowCategoryFilter.replace('_', ' / ').toLowerCase() !== category.toLowerCase()) return null; 
                                                                                return ( <React.Fragment key={`out-${category}`}><TableRow className="bg-muted/50"><TableCell colSpan={2} className="font-bold text-xs uppercase">{category.replace('_', ' / ')}</TableCell></TableRow>{items.map((i) => (<TableRow key={i.id}><TableCell className="pl-6">{i.name}</TableCell><TableCell className="text-right text-red-600">{formatCurrency(i.amount, {noSuffix: true})}</TableCell></TableRow>))}</React.Fragment> )
                                                                            })}
                                                                        </TableBody>
                                                                    </Table>
                                                                </ScrollArea>
                                                                <div className="p-2 border-t font-bold flex justify-between"><span>Total Out</span><span className="text-red-600">{formatCurrency(cashFlowDetails.totalOutflow, {noSuffix: true})}</span></div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            <Card className={`col-span-1 transition-colors ${cardBorder} ${cardWrapperClass}`}>
                <CardHeader className={`flex flex-row items-center justify-between p-4 space-y-0 ${headerClass} overflow-hidden`}>
                    <CardTitle className={`text-base whitespace-nowrap ${titleClass} min-w-0`}>Tax Summary</CardTitle>
                    {compact ? (
                        <ReportMonthYearFilter dateRange={taxDateRange} setDateRange={setTaxDateRange} dateSystem={dateSystem} />
                    ) : (
                        <MonthYearFilter dateRange={taxDateRange} setDateRange={setTaxDateRange} dateSystem={dateSystem} />
                    )}
                </CardHeader>
                <CardContent className={`p-4 pt-0 space-y-2 ${contentClass}`}>
                    <div className="flex items-baseline justify-between">
                        <span className="text-xs text-muted-foreground">Paid Tax</span>
                        <span className="text-sm font-bold text-green-600">
                            {formatCurrency(taxSummary.totalInput, {noSuffix: true})} <span className="text-xs">Dr</span>
                        </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                        <span className="text-xs text-muted-foreground">Received Tax</span>
                        <span className="text-sm font-bold text-red-600">
                            {formatCurrency(taxSummary.totalOutput, {noSuffix: true})} <span className="text-xs">Cr</span>
                        </span>
                    </div>
                    <div className="flex items-baseline justify-between pt-2 mt-2 border-t">
                        <span className="text-sm font-bold">Net Balance</span>
                        <span className={cn('text-base font-bold', taxSummary.netBalance >= 0 ? "text-green-600" : "text-red-600")}>
                            {formatCurrency(taxSummary.netBalance, {showDrCr: true})}
                        </span>
                    </div>
                    {showDetails && (
                        <div className="text-right pt-2">
                            <Dialog open={taxSummaryOpen} onOpenChange={(open) => {
                                setTaxSummaryOpen(open);
                                if (!open) {
                                    setTaxFilter('all');
                                    setSelectedTaxId(null);
                                }
                            }}>
                                <DialogTrigger asChild>
                                    <Button variant="link" size="sm" className="h-auto p-0">View Details</Button>
                                </DialogTrigger>
                                <DialogContent className={cn(
                                    "p-0 rounded-lg flex flex-col",
                                    isMobile ? "max-w-[100vw] w-[100vw] h-[90vh] m-0" : "max-w-6xl h-[90vh]"
                                )}>
                                    <DialogHeader className={cn("border-b border-black flex flex-col", isMobile ? "p-2 space-y-2" : "p-4 space-y-3")}>
                                        <DialogTitle className={cn("whitespace-nowrap", isMobile ? "text-sm" : "text-base md:text-lg")}>Tax Summary Details</DialogTitle>
                                        {/* First Row: Date Filter, Dropdown, and Print */}
                                        <div className={cn("flex items-center gap-2 w-full", isMobile ? "px-5 gap-1" : "px-5")}>
                                            <div className={cn("flex-1 border border-black rounded-full overflow-hidden cursor-pointer hover:border-green-600 transition-colors [&_button]:border-0 [&_button]:bg-transparent [&_button]:hover:bg-transparent [&_button]:hover:text-foreground [&_button]:focus:bg-transparent [&_button]:focus:text-foreground [&_button]:text-foreground [&_button[data-state=open]]:border-2 [&_button[data-state=open]]:border-green-600 [&_button[data-state=open]]:text-foreground", isMobile ? "[&_button]:h-8 [&_button]:text-xs [&_button]:rounded-full [&_button]:w-full" : "[&_button]:h-9 [&_button]:rounded-full [&_button]:w-full")} onClick={(e) => {
                                                const button = e.currentTarget.querySelector('button');
                                                if (button) button.click();
                                            }}>
                                                <MonthYearFilter dateRange={taxDateRange} setDateRange={setTaxDateRange} dateSystem={dateSystem} />
                                            </div>
                                            <Select value={selectedTaxId || 'all'} onValueChange={(v) => setSelectedTaxId(v === 'all' ? null : v)}>
                                                <SelectTrigger className={cn("flex-1 w-full border border-black rounded-full hover:border-green-600 transition-colors data-[state=open]:border-2 data-[state=open]:border-green-600", isMobile ? "h-8 text-xs" : "h-9")}>
                                                    <SelectValue placeholder="Select Tax Head" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">All</SelectItem>
                                                    {taxSummary.details.map((tax) => (
                                                        <SelectItem key={tax.id} value={tax.id}>
                                                            {tax.name} ({formatCurrency(Math.abs(tax.balance), {noSuffix: true})} {tax.balance >= 0 ? 'Dr' : 'Cr'})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePrintTax();
                                                }} 
                                                className={cn(
                                                    "flex-1 flex items-center gap-2 justify-center border border-black rounded-full hover:bg-transparent hover:border-green-600 hover:text-foreground focus:bg-transparent focus:text-foreground active:bg-transparent active:text-foreground transition-colors",
                                                    isMobile ? "h-8 text-xs px-2" : "h-9"
                                                )}
                                            >
                                                {isMobile ? <Printer className="h-3 w-3" /> : <>Print <Printer className="h-4 w-4" /></>}
                                            </Button>
                                        </div>
                                        {/* Second Row: Tabs (All, Input, Output) */}
                                        <div className={cn("flex items-center gap-2 w-full", isMobile ? "px-5 gap-1" : "px-5")}>
                                            <Tabs 
                                                value={taxFilter} 
                                                onValueChange={(v) => {
                                                    setTaxFilter(v as 'all' | 'input' | 'output');
                                                }} 
                                                className="w-0 min-w-0 overflow-hidden shrink-0"
                                            >
                                                <TabsList className="hidden">
                                                    <TabsTrigger value="all">All</TabsTrigger>
                                                    <TabsTrigger value="input">Paid</TabsTrigger>
                                                    <TabsTrigger value="output">Received</TabsTrigger>
                                                </TabsList>
                                            </Tabs>
                                            <button
                                                type="button"
                                                onClick={() => setTaxFilter('all')}
                                                className={cn(
                                                    "flex-1 rounded-full flex items-center justify-center font-medium transition-colors hover:border-green-600",
                                                    isMobile ? "h-8 text-xs" : "h-9 text-sm",
                                                    taxFilter === 'all' ? "border-2 border-green-600 bg-background text-foreground" : "border border-black bg-background text-foreground"
                                                )}
                                            >
                                                All
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setTaxFilter('input')}
                                                className={cn(
                                                    "flex-1 rounded-full flex items-center justify-center font-medium transition-colors hover:border-green-600",
                                                    isMobile ? "h-8 text-xs" : "h-9 text-sm",
                                                    taxFilter === 'input' ? "border-2 border-green-600 bg-background text-foreground" : "border border-black bg-background text-foreground"
                                                )}
                                            >
                                                Paid
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setTaxFilter('output')}
                                                className={cn(
                                                    "flex-1 rounded-full flex items-center justify-center font-medium transition-colors hover:border-green-600",
                                                    isMobile ? "h-8 text-xs" : "h-9 text-sm",
                                                    taxFilter === 'output' ? "border-2 border-green-600 bg-background text-foreground" : "border border-black bg-background text-foreground"
                                                )}
                                            >
                                                Received
                                            </button>
                                            <button
                                                type="button"
                                                onClick={toggleAllTaxAccounts}
                                                className={cn(
                                                    "flex-1 rounded-full flex items-center justify-center gap-1 font-medium transition-colors border border-black hover:border-green-600 bg-background text-foreground",
                                                    isMobile ? "h-8 text-xs" : "h-9 text-sm"
                                                )}
                                            >
                                                {areAllExpanded ? (
                                                    <>
                                                        <span>Collapse</span>
                                                        <ChevronUp className={cn(isMobile ? "h-3 w-3" : "h-4 w-4")} />
                                                    </>
                                                ) : (
                                                    <>
                                                        <span>Expand</span>
                                                        <ChevronDown className={cn(isMobile ? "h-3 w-3" : "h-4 w-4")} />
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </DialogHeader>
                                    <div className={cn("flex-1 min-h-0 flex flex-col px-0.5 pt-0")}>
                                        <div className={cn("flex-1 min-h-0 overflow-auto", isMobile ? "pb-0" : "pb-0")}>
                                        {/* Transaction Count Summary */}
                                        <div className={cn("mb-2 bg-muted/50 rounded-md", isMobile ? "p-1 text-xs" : "p-2 text-sm")}>
                                            <div className={cn("flex items-center", isMobile ? "gap-2 flex-wrap" : "gap-4")}>
                                                <span className="font-bold">Total Transactions:</span>
                                                <span>Sale: <strong>{taxBreakdownTransactions.saleCount}</strong></span>
                                                <span>Purchase: <strong>{taxBreakdownTransactions.purchaseCount}</strong></span>
                                                <span>Add Salary: <strong>{taxBreakdownTransactions.addSalaryCount}</strong></span>
                                            </div>
                                        </div>
                                        {(isMobile && taxFilter === 'all') || (!isMobile && (taxFilter === 'all' || taxFilter === 'input' || taxFilter === 'output')) ? (
                                            // Mobile: Show unified table with Dr and Cr columns
                                            <div className="space-y-4">
                                                <div className="flex flex-col min-h-0">
                                                    <div className="border border-black rounded-lg flex flex-col min-h-0 overflow-hidden">
                                                        <ScrollArea className="flex-1 w-full">
                                                            <div className="w-full">
                                                                <Table className="w-full table-fixed">
                                                                <TableHeader>
                                                                    <TableRow className="border-b-[0.5px] border-gray-400">
                                                                        <TableHead className={cn("font-bold", isMobile ? "text-[10px] px-1 py-1 w-[15%]" : "")}>Date</TableHead>
                                                                        <TableHead className={cn("font-bold", isMobile ? "text-[10px] px-1 py-1 w-[17%]" : "")}>Voucher No</TableHead>
                                                                        <TableHead className={cn("font-bold", isMobile ? "text-[10px] px-1 py-1 w-[24%]" : "")}>Account</TableHead>
                                                                        <TableHead className={cn("text-right font-bold", isMobile && "text-[10px] px-1 py-1 w-[17%]")}>Dr</TableHead>
                                                                        <TableHead className={cn("text-right font-bold", isMobile && "text-[10px] px-1 py-1 w-[27%]")}>Cr</TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody>
                                                                    {transactionsByTaxAccount.length === 0 ? (
                                                                        <TableRow>
                                                                            <TableCell colSpan={5} className="text-center text-muted-foreground py-4">No transactions found</TableCell>
                                                                        </TableRow>
                                                                    ) : (() => {
                                                                        // Calculate overall totals across all visible accounts
                                                                        const overallPaid = transactionsByTaxAccount.reduce((sum, taxGroup) => {
                                                                            const hasInput = (taxFilter === 'all' || taxFilter === 'input') && taxGroup.inputTransactions.length > 0;
                                                                            if (!hasInput) return sum;
                                                                            return sum + taxGroup.inputTransactions.reduce((acc, tx) => acc + tx.debit, 0);
                                                                        }, 0);
                                                                        
                                                                        const overallReceived = transactionsByTaxAccount.reduce((sum, taxGroup) => {
                                                                            const hasOutput = (taxFilter === 'all' || taxFilter === 'output') && taxGroup.outputTransactions.length > 0;
                                                                            if (!hasOutput) return sum;
                                                                            return sum + taxGroup.outputTransactions.reduce((acc, tx) => acc + tx.credit, 0);
                                                                        }, 0);
                                                                        
                                                                        // Calculate overall net balance across all accounts
                                                                        const overallNetBalance = overallPaid - overallReceived;
                                                                        
                                                                            // Calculate overall total display for first account header
                                                                            let overallTotalDisplay = '';
                                                                            if (taxFilter === 'all') {
                                                                                // Show net balance (Dr or Cr)
                                                                                if (overallNetBalance !== 0) {
                                                                                    overallTotalDisplay = `${formatCurrency(Math.abs(overallNetBalance), {noSuffix: true, noAnimation: true})} ${overallNetBalance >= 0 ? 'Dr' : 'Cr'}`;
                                                                                }
                                                                            } else if (taxFilter === 'input') {
                                                                                overallTotalDisplay = overallPaid > 0 ? `${formatCurrency(overallPaid, {noSuffix: true, noAnimation: true})} Dr` : '';
                                                                            } else {
                                                                                overallTotalDisplay = overallReceived > 0 ? `${formatCurrency(overallReceived, {noSuffix: true, noAnimation: true})} Cr` : '';
                                                                            }
                                                                        
                                                                        return transactionsByTaxAccount.map((taxGroup, index) => {
                                                                            const hasInput = (taxFilter === 'all' || taxFilter === 'input') && taxGroup.inputTransactions.length > 0;
                                                                            const hasOutput = (taxFilter === 'all' || taxFilter === 'output') && taxGroup.outputTransactions.length > 0;
                                                                            const hasTransactions = hasInput || hasOutput;
                                                                            if (!hasTransactions) return null;
                                                                            
                                                                            // Combine and sort all transactions by date (filter based on taxFilter)
                                                                            const allTransactions = [
                                                                                ...(taxFilter === 'all' || taxFilter === 'input' ? taxGroup.inputTransactions.map(tx => ({ ...tx, isDebit: true })) : []),
                                                                                ...(taxFilter === 'all' || taxFilter === 'output' ? taxGroup.outputTransactions.map(tx => ({ ...tx, isDebit: false })) : [])
                                                                            ].sort((a, b) => {
                                                                                const dateA = safeToDate(a.date)?.getTime() || 0;
                                                                                const dateB = safeToDate(b.date)?.getTime() || 0;
                                                                                return dateB - dateA;
                                                                            });
                                                                            
                                                                            const accountPaid = taxGroup.inputTransactions.reduce((sum, tx) => sum + tx.debit, 0);
                                                                            const accountReceived = taxGroup.outputTransactions.reduce((sum, tx) => sum + tx.credit, 0);
                                                                            const accountNetBalance = accountPaid - accountReceived;
                                                                            
                                                                            const isExpanded = expandedTaxAccounts.has(taxGroup.taxId);
                                                                            
                                                                            // Show overall total only in the first account header
                                                                            const isFirstAccount = index === 0;
                                                                            
                                                                            // Calculate balance display for collapsed view
                                                                            let balanceDisplay = '';
                                                                            if (taxFilter === 'all') {
                                                                                balanceDisplay = accountNetBalance !== 0 ? `${formatCurrency(Math.abs(accountNetBalance), {noSuffix: true, noAnimation: true})} ${accountNetBalance >= 0 ? 'Dr' : 'Cr'}` : '';
                                                                            } else if (taxFilter === 'input') {
                                                                                balanceDisplay = accountPaid > 0 ? `${formatCurrency(accountPaid, {noSuffix: true, noAnimation: true})} Dr` : '';
                                                                            } else {
                                                                                balanceDisplay = accountReceived > 0 ? `${formatCurrency(accountReceived, {noSuffix: true, noAnimation: true})} Cr` : '';
                                                                            }
                                                                            
                                                                            return (
                                                                                    <React.Fragment key={taxGroup.taxId}>
                                                                                        <TableRow className="bg-muted/50 border-b-[0.5px] border-gray-400">
                                                                                            <TableCell className={cn("font-semibold", isMobile ? "text-xs py-1 px-1" : "py-2")}>
                                                                                                <div className="flex items-center gap-1 cursor-pointer" onClick={() => toggleTaxAccount(taxGroup.taxId)}>
                                                                                                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                                                                    <span>{taxGroup.taxName}</span>
                                                                                                </div>
                                                                                            </TableCell>
                                                                                            <TableCell colSpan={isMobile ? 2 : 3}></TableCell>
                                                                                            <TableCell className={cn("text-right font-semibold", isMobile ? "text-xs py-1 px-1 whitespace-nowrap overflow-visible" : "py-2")}>
                                                                                                {!isExpanded && balanceDisplay && (
                                                                                                    <span className={cn(
                                                                                                        taxFilter === 'all' ? (accountNetBalance >= 0 ? "text-green-600" : "text-red-600") : taxFilter === 'input' ? "text-green-600" : "text-red-600",
                                                                                                        isMobile && "inline-block text-right"
                                                                                                    )}>
                                                                                                        {balanceDisplay}
                                                                                                    </span>
                                                                                                )}
                                                                                            </TableCell>
                                                                                            {isMobile && <TableCell className="text-xs py-1 px-1"></TableCell>}
                                                                                        </TableRow>
                                                                                        {isExpanded && allTransactions.map((tx) => {
                                                                                            const txDate = safeToDate(tx.date);
                                                                                            const isSelected = selectedTransactionId === tx.id;
                                                                                            return (
                                                                                                <TableRow 
                                                                                                    key={tx.id} 
                                                                                                    className={cn(
                                                                                                        "border-b-[0.5px] border-gray-400 cursor-pointer",
                                                                                                        isSelected ? "bg-muted" : "hover:bg-muted/50"
                                                                                                    )}
                                                                                                    onClick={() => setSelectedTransactionId(tx.id)}
                                                                                                >
                                                                                                    <TableCell className={cn(isMobile ? "text-[10px] px-1 py-1 overflow-hidden" : "")}>{txDate ? (dateSystem === 'BS' ? formatDateBS(txDate) : dateSystem === 'AD' ? formatDate(txDate) : `${formatDateBS(txDate)} / ${formatDate(txDate)}`) : '-'}</TableCell>
                                                                                                    <TableCell className={cn(isMobile ? "text-[10px] px-1 py-1 overflow-hidden truncate" : "")}>{tx.voucherNumber || '-'}</TableCell>
                                                                                                    <TableCell className={cn("truncate", isMobile ? "text-[10px] px-1 py-1 overflow-hidden" : "max-w-[200px]")} title={tx.account}>{truncateAccountName(tx.account)}</TableCell>
                                                                                                    <TableCell className={cn("text-right text-green-600", isMobile && "text-[10px] px-1 py-1 overflow-hidden")}>{tx.isDebit && tx.debit > 0 ? formatCurrency(tx.debit, {noSuffix: true}) : '-'}</TableCell>
                                                                                                    <TableCell className={cn("text-right text-red-600", isMobile && "text-[10px] px-1 py-1 overflow-hidden")}>{!tx.isDebit && tx.credit > 0 ? formatCurrency(tx.credit, {noSuffix: true}) : '-'}</TableCell>
                                                                                                </TableRow>
                                                                                            );
                                                                                        })}
                                                                                        {isExpanded && (
                                                                                            /* Per Account Footer */
                                                                                            taxFilter === 'all' ? (
                                                                                                <>
                                                                                                    <TableRow className="bg-muted/30 border-t-[0.5px] border-gray-400">
                                                                                                        <TableCell colSpan={3} className={cn("font-semibold", isMobile ? "text-[10px] py-0.5 px-1" : "text-xs py-1")}>
                                                                                                            {taxGroup.taxName} - Total
                                                                                                        </TableCell>
                                                                                                        <TableCell className={cn("text-right font-semibold text-green-600", isMobile ? "text-[10px] py-0.5 px-1" : "text-xs py-1")}>
                                                                                                            {accountPaid > 0 ? formatCurrency(accountPaid, {noSuffix: true}) : '-'}
                                                                                                        </TableCell>
                                                                                                        <TableCell className={cn("text-right font-semibold text-red-600", isMobile ? "text-[10px] py-0.5 px-1" : "text-xs py-1")}>
                                                                                                            {accountReceived > 0 ? formatCurrency(accountReceived, {noSuffix: true}) : '-'}
                                                                                                        </TableCell>
                                                                                                    </TableRow>
                                                                                                    <TableRow className="bg-muted/30 border-b-[0.5px] border-gray-400">
                                                                                                        <TableCell colSpan={3} className={cn("font-semibold", isMobile ? "text-[10px] py-0.5 px-1" : "text-xs py-1")}>
                                                                                                            {taxGroup.taxName} - Net Balance
                                                                                                        </TableCell>
                                                                                                        <TableCell colSpan={2} className={cn("text-right font-semibold", isMobile ? "text-[10px] py-0.5 px-1" : "text-xs py-1")}>
                                                                                                            <span className={accountNetBalance >= 0 ? "text-green-600" : "text-red-600"}>
                                                                                                                {formatCurrency(Math.abs(accountNetBalance), {noSuffix: true})} {accountNetBalance >= 0 ? 'Dr' : 'Cr'}
                                                                                                            </span>
                                                                                                        </TableCell>
                                                                                                    </TableRow>
                                                                                                </>
                                                                                            ) : taxFilter === 'input' ? (
                                                                                                <TableRow className="bg-muted/30 border-t border-black">
                                                                                                    <TableCell colSpan={3} className={cn("font-semibold", isMobile ? "text-[10px] py-0.5 px-1" : "text-xs py-1")}>
                                                                                                        {taxGroup.taxName} - Total Paid
                                                                                                    </TableCell>
                                                                                                    <TableCell className={cn("text-right font-semibold text-green-600", isMobile ? "text-[10px] py-0.5 px-1" : "text-xs py-1")}>
                                                                                                        {accountPaid > 0 ? formatCurrency(accountPaid, {noSuffix: true}) : '-'}
                                                                                                    </TableCell>
                                                                                                    <TableCell className={cn("text-right", isMobile ? "text-[10px] py-0.5 px-1" : "text-xs py-1")}>-</TableCell>
                                                                                                </TableRow>
                                                                                            ) : (
                                                                                                <TableRow className="bg-muted/30 border-t border-black">
                                                                                                    <TableCell colSpan={3} className={cn("font-semibold", isMobile ? "text-[10px] py-0.5 px-1" : "text-xs py-1")}>
                                                                                                        {taxGroup.taxName} - Total Received
                                                                                                    </TableCell>
                                                                                                    <TableCell className={cn("text-right", isMobile ? "text-[10px] py-0.5 px-1" : "text-xs py-1")}>-</TableCell>
                                                                                                    <TableCell className={cn("text-right font-semibold text-red-600", isMobile ? "text-[10px] py-0.5 px-1" : "text-xs py-1")}>
                                                                                                        {accountReceived > 0 ? formatCurrency(accountReceived, {noSuffix: true}) : '-'}
                                                                                                    </TableCell>
                                                                                                </TableRow>
                                                                                            )
                                                                                        )}
                                                                                    </React.Fragment>
                                                                            );
                                                                        });
                                                                    })()}
                                                                </TableBody>
                                                            </Table>
                                                            </div>
                                                        </ScrollArea>
                                                    </div>
                                                </div>
                                            </div>
                                            ) : (
                                                // Desktop: Show unified table with Dr and Cr columns
                                                <div className="flex-1 min-h-0">
                                                    <div className="flex flex-col min-h-0">
                                                        <div className="flex-1 border border-black rounded-lg flex flex-col min-h-0">
                                                            <ScrollArea className="flex-1">
                                                                <Table>
                                                                    <TableHeader>
                                                                        <TableRow className="border-b-[0.5px] border-gray-400">
                                                                            <TableHead className="font-bold">Date</TableHead>
                                                                            <TableHead className="font-bold">Voucher No</TableHead>
                                                                            <TableHead className="font-bold">Account</TableHead>
                                                                            <TableHead className="text-right font-bold">Dr</TableHead>
                                                                            <TableHead className="text-right font-bold">Cr</TableHead>
                                                                        </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                        {transactionsByTaxAccount.length === 0 ? (
                                                                            <TableRow>
                                                                                <TableCell colSpan={5} className="text-center text-muted-foreground py-4">No transactions found</TableCell>
                                                                            </TableRow>
                                                                        ) : (() => {
                                                                            // Calculate overall totals across all visible accounts
                                                                            const overallPaid = transactionsByTaxAccount.reduce((sum, taxGroup) => {
                                                                                const hasInput = (taxFilter === 'all' || taxFilter === 'input') && taxGroup.inputTransactions.length > 0;
                                                                                if (!hasInput) return sum;
                                                                                return sum + taxGroup.inputTransactions.reduce((acc, tx) => acc + tx.debit, 0);
                                                                            }, 0);
                                                                            
                                                                            const overallReceived = transactionsByTaxAccount.reduce((sum, taxGroup) => {
                                                                                const hasOutput = (taxFilter === 'all' || taxFilter === 'output') && taxGroup.outputTransactions.length > 0;
                                                                                if (!hasOutput) return sum;
                                                                                return sum + taxGroup.outputTransactions.reduce((acc, tx) => acc + tx.credit, 0);
                                                                            }, 0);
                                                                            
                                                                            // Calculate overall net balance across all accounts
                                                                            const overallNetBalance = overallPaid - overallReceived;
                                                                            
                                                                            // Calculate overall total display for first account header
                                                                            let overallTotalDisplay = '';
                                                                            if (taxFilter === 'all') {
                                                                                // Show net balance (Dr or Cr)
                                                                                if (overallNetBalance !== 0) {
                                                                                    overallTotalDisplay = `${formatCurrency(Math.abs(overallNetBalance), {noSuffix: true, noAnimation: true})} ${overallNetBalance >= 0 ? 'Dr' : 'Cr'}`;
                                                                                }
                                                                            } else if (taxFilter === 'input') {
                                                                                overallTotalDisplay = overallPaid > 0 ? `${formatCurrency(overallPaid, {noSuffix: true, noAnimation: true})} Dr` : '';
                                                                            } else {
                                                                                overallTotalDisplay = overallReceived > 0 ? `${formatCurrency(overallReceived, {noSuffix: true, noAnimation: true})} Cr` : '';
                                                                            }
                                                                            
                                                                            return transactionsByTaxAccount.map((taxGroup, index) => {
                                                                                const hasInput = (taxFilter === 'all' || taxFilter === 'input') && taxGroup.inputTransactions.length > 0;
                                                                                const hasOutput = (taxFilter === 'all' || taxFilter === 'output') && taxGroup.outputTransactions.length > 0;
                                                                                const hasTransactions = hasInput || hasOutput;
                                                                                if (!hasTransactions) return null;
                                                                                
                                                                                // Combine and sort all transactions by date (filter based on taxFilter)
                                                                                const allTransactions = [
                                                                                    ...(taxFilter === 'all' || taxFilter === 'input' ? taxGroup.inputTransactions.map(tx => ({ ...tx, isDebit: true })) : []),
                                                                                    ...(taxFilter === 'all' || taxFilter === 'output' ? taxGroup.outputTransactions.map(tx => ({ ...tx, isDebit: false })) : [])
                                                                                ].sort((a, b) => {
                                                                                    const dateA = safeToDate(a.date)?.getTime() || 0;
                                                                                    const dateB = safeToDate(b.date)?.getTime() || 0;
                                                                                    return dateB - dateA;
                                                                                });
                                                                                
                                                                                const accountPaid = taxGroup.inputTransactions.reduce((sum, tx) => sum + tx.debit, 0);
                                                                                const accountReceived = taxGroup.outputTransactions.reduce((sum, tx) => sum + tx.credit, 0);
                                                                                const accountNetBalance = accountPaid - accountReceived;
                                                                                
                                                                                const isExpanded = expandedTaxAccounts.has(taxGroup.taxId);
                                                                                
                                                                                // Show overall total only in the first account header
                                                                                const isFirstAccount = index === 0;
                                                                                
                                                                                // Calculate balance display for collapsed view
                                                                                let balanceDisplay = '';
                                                                                if (taxFilter === 'all') {
                                                                                    balanceDisplay = accountNetBalance !== 0 ? `${formatCurrency(Math.abs(accountNetBalance), {noSuffix: true, noAnimation: true})} ${accountNetBalance >= 0 ? 'Dr' : 'Cr'}` : '';
                                                                                } else if (taxFilter === 'input') {
                                                                                    balanceDisplay = accountPaid > 0 ? `${formatCurrency(accountPaid, {noSuffix: true, noAnimation: true})} Dr` : '';
                                                                                } else {
                                                                                    balanceDisplay = accountReceived > 0 ? `${formatCurrency(accountReceived, {noSuffix: true, noAnimation: true})} Cr` : '';
                                                                                }
                                                                                
                                                                                return (
                                                                                    <React.Fragment key={taxGroup.taxId}>
                                                                                        <TableRow className="bg-muted/50 border-b-[0.5px] border-gray-400">
                                                                                            <TableCell className="font-semibold py-2">
                                                                                                <div className="flex items-center gap-1 cursor-pointer" onClick={() => toggleTaxAccount(taxGroup.taxId)}>
                                                                                                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                                                                    <span>{taxGroup.taxName}</span>
                                                                                                </div>
                                                                                            </TableCell>
                                                                                            <TableCell colSpan={3}></TableCell>
                                                                                            <TableCell className="text-right font-semibold py-2">
                                                                                                {!isExpanded && balanceDisplay && (
                                                                                                    <span className={taxFilter === 'all' ? (accountNetBalance >= 0 ? "text-green-600" : "text-red-600") : taxFilter === 'input' ? "text-green-600" : "text-red-600"}>
                                                                                                        {balanceDisplay}
                                                                                                    </span>
                                                                                                )}
                                                                                            </TableCell>
                                                                                        </TableRow>
                                                                                        {isExpanded && allTransactions.map((tx) => {
                                                                                            const txDate = safeToDate(tx.date);
                                                                                            const isSelected = selectedTransactionId === tx.id;
                                                                                            return (
                                                                                                <TableRow 
                                                                                                    key={tx.id} 
                                                                                                    className={cn(
                                                                                                        "border-b-[0.5px] border-gray-400 cursor-pointer",
                                                                                                        isSelected ? "bg-muted" : "hover:bg-muted/50"
                                                                                                    )}
                                                                                                    onClick={() => setSelectedTransactionId(tx.id)}
                                                                                                >
                                                                                                    <TableCell>{txDate ? (dateSystem === 'BS' ? formatDateBS(txDate) : dateSystem === 'AD' ? formatDate(txDate) : `${formatDateBS(txDate)} / ${formatDate(txDate)}`) : '-'}</TableCell>
                                                                                                    <TableCell>{tx.voucherNumber || '-'}</TableCell>
                                                                                                    <TableCell className="max-w-[200px] truncate" title={tx.account}>{truncateAccountName(tx.account)}</TableCell>
                                                                                                    <TableCell className="text-right text-green-600">{tx.isDebit && tx.debit > 0 ? formatCurrency(tx.debit, {noSuffix: true}) : '-'}</TableCell>
                                                                                                    <TableCell className="text-right text-red-600">{!tx.isDebit && tx.credit > 0 ? formatCurrency(tx.credit, {noSuffix: true}) : '-'}</TableCell>
                                                                                                </TableRow>
                                                                                            );
                                                                                        })}
                                                                                        {isExpanded && (
                                                                                            /* Per Account Footer */
                                                                                            taxFilter === 'all' ? (
                                                                                                <>
                                                                                                    <TableRow className="bg-muted/30 border-t-[0.5px] border-gray-400">
                                                                                                        <TableCell colSpan={3} className="text-xs font-semibold py-1">
                                                                                                            {taxGroup.taxName} - Total
                                                                                                        </TableCell>
                                                                                                        <TableCell className="text-right text-xs font-semibold text-green-600 py-1">
                                                                                                            {accountPaid > 0 ? formatCurrency(accountPaid, {noSuffix: true}) : '-'}
                                                                                                        </TableCell>
                                                                                                        <TableCell className="text-right text-xs font-semibold text-red-600 py-1">
                                                                                                            {accountReceived > 0 ? formatCurrency(accountReceived, {noSuffix: true}) : '-'}
                                                                                                        </TableCell>
                                                                                                    </TableRow>
                                                                                                    <TableRow className="bg-muted/30 border-b-[0.5px] border-gray-400">
                                                                                                        <TableCell colSpan={3} className="text-xs font-semibold py-1">
                                                                                                            {taxGroup.taxName} - Net Balance
                                                                                                        </TableCell>
                                                                                                        <TableCell colSpan={2} className="text-right text-xs font-semibold py-1">
                                                                                                            <span className={accountNetBalance >= 0 ? "text-green-600" : "text-red-600"}>
                                                                                                                {formatCurrency(Math.abs(accountNetBalance), {noSuffix: true})} {accountNetBalance >= 0 ? 'Dr' : 'Cr'}
                                                                                                            </span>
                                                                                                        </TableCell>
                                                                                                    </TableRow>
                                                                                                </>
                                                                                            ) : taxFilter === 'input' ? (
                                                                                                <TableRow className="bg-muted/30 border-t border-black">
                                                                                                    <TableCell colSpan={3} className="text-xs font-semibold py-1">
                                                                                                        {taxGroup.taxName} - Total Paid
                                                                                                    </TableCell>
                                                                                                    <TableCell className="text-right text-xs font-semibold text-green-600 py-1">
                                                                                                        {accountPaid > 0 ? formatCurrency(accountPaid, {noSuffix: true}) : '-'}
                                                                                                    </TableCell>
                                                                                                    <TableCell className="text-right text-xs py-1">-</TableCell>
                                                                                                </TableRow>
                                                                                            ) : (
                                                                                                <TableRow className="bg-muted/30 border-t border-black">
                                                                                                    <TableCell colSpan={3} className="text-xs font-semibold py-1">
                                                                                                        {taxGroup.taxName} - Total Received
                                                                                                    </TableCell>
                                                                                                    <TableCell className="text-right text-xs py-1">-</TableCell>
                                                                                                    <TableCell className="text-right text-xs font-semibold text-red-600 py-1">
                                                                                                        {accountReceived > 0 ? formatCurrency(accountReceived, {noSuffix: true}) : '-'}
                                                                                                    </TableCell>
                                                                                                </TableRow>
                                                                                            )
                                                                                        )}
                                                                                    </React.Fragment>
                                                                                );
                                                                            });
                                                                        })()}
                                                                    </TableBody>
                                                                </Table>
                                                            </ScrollArea>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {/* Fixed Footer with Totals Net Balance at bottom */}
                                    {(() => {
                                        // Calculate overall totals across all visible accounts
                                        const overallPaid = transactionsByTaxAccount.reduce((sum, taxGroup) => {
                                            const hasInput = (taxFilter === 'all' || taxFilter === 'input') && taxGroup.inputTransactions.length > 0;
                                            if (!hasInput) return sum;
                                            return sum + taxGroup.inputTransactions.reduce((acc, tx) => acc + tx.debit, 0);
                                        }, 0);
                                        
                                        const overallReceived = transactionsByTaxAccount.reduce((sum, taxGroup) => {
                                            const hasOutput = (taxFilter === 'all' || taxFilter === 'output') && taxGroup.outputTransactions.length > 0;
                                            if (!hasOutput) return sum;
                                            return sum + taxGroup.outputTransactions.reduce((acc, tx) => acc + tx.credit, 0);
                                        }, 0);
                                        
                                        const overallNetBalance = overallPaid - overallReceived;
                                        
                                        let overallTotalDisplay = '';
                                        if (taxFilter === 'all') {
                                            if (overallNetBalance !== 0) {
                                                overallTotalDisplay = `${formatCurrency(Math.abs(overallNetBalance), {noSuffix: true, noAnimation: true})} ${overallNetBalance >= 0 ? 'Dr' : 'Cr'}`;
                                            }
                                        } else if (taxFilter === 'input') {
                                            overallTotalDisplay = overallPaid > 0 ? `${formatCurrency(overallPaid, {noSuffix: true, noAnimation: true})} Dr` : '';
                                        } else {
                                            overallTotalDisplay = overallReceived > 0 ? `${formatCurrency(overallReceived, {noSuffix: true, noAnimation: true})} Cr` : '';
                                        }
                                        
                                        return overallTotalDisplay ? (
                                            <div className={cn(
                                                "bg-background border-t border-black flex items-center justify-between flex-shrink-0",
                                                isMobile ? "px-0.5 py-2 text-xs" : "px-0.5 py-3 text-sm"
                                            )}>
                                                <span className="font-bold">Totals Net Balance</span>
                                                <span className={cn(
                                                    "font-semibold",
                                                    taxFilter === 'all' ? (overallNetBalance >= 0 ? "text-green-600" : "text-red-600") : taxFilter === 'input' ? "text-green-600" : "text-red-600"
                                                )}>
                                                    {overallTotalDisplay}
                                                </span>
                                            </div>
                                        ) : null;
                                    })()}
                                </DialogContent>
                            </Dialog>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className={`col-span-1 transition-colors ${cardBorder} ${cardWrapperClass}`}>
                <CardHeader className={`flex flex-row items-center justify-between p-4 space-y-0 ${headerClass} overflow-hidden`}>
                    <CardTitle className={`text-base whitespace-nowrap ${titleClass} min-w-0`}>Bank & Cash Summary</CardTitle>
                    {compact ? (
                        <ReportMonthYearFilter dateRange={bankCashDateRange} setDateRange={setBankCashDateRange} dateSystem={dateSystem} />
                    ) : (
                        <MonthYearFilter dateRange={bankCashDateRange} setDateRange={setBankCashDateRange} dateSystem={dateSystem} />
                    )}
                </CardHeader>
                <CardContent className={`p-4 pt-0 space-y-2 ${contentClass}`}>
                    <div className="flex items-baseline justify-between">
                        <span className="text-xs text-muted-foreground">Total Bank Balance</span>
                        <span className={cn("text-lg font-bold", bankCashSummary.totalBankBalance >= 0 ? "text-green-600" : "text-red-600")}>
                            {formatCurrency(bankCashSummary.totalBankBalance, {noSuffix: true})}
                        </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                        <span className="text-xs text-muted-foreground">Total Cash Balance</span>
                        <span className={cn("text-lg font-bold", bankCashSummary.totalCashBalance >= 0 ? "text-green-600" : "text-red-600")}>
                            {formatCurrency(bankCashSummary.totalCashBalance, {noSuffix: true})}
                        </span>
                    </div>
                    <div className="flex items-baseline justify-between pt-2 mt-2 border-t">
                        <span className="text-sm font-bold">Grand Total</span>
                        <span className={cn("text-lg font-bold", bankCashSummary.grandTotalBalance >= 0 ? "text-green-600" : "text-red-600")}>
                            {formatCurrency(bankCashSummary.grandTotalBalance, {showDrCr: true})}
                        </span>
                    </div>
                    {showDetails && (
                        <div className="text-right pt-2">
                            <Dialog open={bankCashSummaryOpen} onOpenChange={(open) => {
                                setBankCashSummaryOpen(open);
                                if (!open) {
                                    setBankCashRotated(false);
                                }
                            }}>
                                <DialogTrigger asChild>
                                    <Button variant="link" size="sm" className="h-auto p-0">View Details</Button>
                                </DialogTrigger>
                                <DialogContent className={cn(
                                    "p-0 rounded-lg flex flex-col transition-all duration-300",
                                    isMobile && bankCashRotated ? "max-w-[90vh] w-[90vh] h-[100vw] m-0 fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90" : "",
                                    isMobile && !bankCashRotated ? "max-w-[100vw] w-[100vw] h-[90vh] m-0" : "",
                                    !isMobile ? "max-w-6xl h-[90vh]" : ""
                                )}>
                                    <DialogHeader className={cn("border-b flex flex-col", isMobile ? "p-2 space-y-2" : "p-4 flex-row justify-between items-center")}>
                                        <div className="flex flex-col"><DialogTitle className={cn(isMobile && "text-sm")}>Bank & Cash Summary Details</DialogTitle></div>
                                        <div className={cn("flex items-center gap-2", isMobile ? "w-full justify-between" : "mr-12")}>
                                            <div className={cn(
                                                isMobile && "[&_button]:h-9 [&_button]:text-xs",
                                                isMobile && !bankCashRotated && "[&_button_svg]:hidden"
                                            )}>
                                                <MonthYearFilter dateRange={bankCashDateRange} setDateRange={setBankCashDateRange} dateSystem={dateSystem} />
                                            </div>
                                            {isMobile && (
                                                <>
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        className="h-9 text-xs flex items-center gap-2 flex-shrink-0"
                                                        onClick={() => setBankCashRotated(!bankCashRotated)}
                                                    >
                                                        {bankCashRotated && <RotateCw className="h-4 w-4" />}
                                                        Rotate
                                                    </Button>
                                                    <div className="flex items-center gap-1 text-xs font-semibold flex-shrink-0 h-9 px-2 border rounded-md bg-muted/50">
                                                        <span className="text-muted-foreground whitespace-nowrap">Net:</span>
                                                        <span className={cn("whitespace-nowrap", bankCashSummary.grandTotalBalance >= 0 ? "text-green-600" : "text-red-600")}>
                                                            {formatCurrency(Math.abs(bankCashSummary.grandTotalBalance), {noSuffix: true})}
                                                        </span>
                                                    </div>
                                                </>
                                            )}
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePrintBankCash();
                                                }}
                                                className={cn("flex items-center gap-2 flex-shrink-0", isMobile && "h-9 text-xs")}
                                            >
                                                Print {isMobile && bankCashRotated && <Printer className="h-4 w-4" />}
                                                {!isMobile && <Printer className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                    </DialogHeader>
                                    <div className={cn("flex-1 flex flex-col min-h-0", isMobile ? "p-2" : "p-4")}>
                                        <div className="border rounded-lg flex-1 flex flex-col min-h-0 overflow-hidden">
                                            <div className="flex-1 overflow-x-auto overflow-y-auto">
                                                <Table className="w-full min-w-[600px]">
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead className={cn(isMobile && "text-xs whitespace-nowrap")}>Account</TableHead>
                                                            <TableHead className={cn(isMobile && "text-xs whitespace-nowrap")}>Type</TableHead>
                                                            <TableHead className={cn("text-right", isMobile && "text-xs whitespace-nowrap")}>Total In</TableHead>
                                                            <TableHead className={cn("text-right", isMobile && "text-xs whitespace-nowrap")}>Total Out</TableHead>
                                                            <TableHead className={cn("text-right", isMobile && "text-xs whitespace-nowrap")}>Balance</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {bankCashSummary.bankAccounts.map(acc => (
                                                            <TableRow key={acc.id}>
                                                                <TableCell className={cn(isMobile && "text-xs whitespace-nowrap")}>{acc.accountName}</TableCell>
                                                                <TableCell className={cn(isMobile && "text-xs whitespace-nowrap")}>{acc.accountType}</TableCell>
                                                                <TableCell className={cn("text-right text-green-600", isMobile && "text-xs whitespace-nowrap")}>{acc.inflow > 0 ? formatCurrency(acc.inflow, { noSuffix: true }) : '-'}</TableCell>
                                                                <TableCell className={cn("text-right text-red-600", isMobile && "text-xs whitespace-nowrap")}>{acc.outflow > 0 ? formatCurrency(acc.outflow, { noSuffix: true }) : '-'}</TableCell>
                                                                <TableCell className={cn("text-right font-semibold whitespace-nowrap", acc.balance >= 0 ? "text-green-600" : "text-red-600", isMobile && "text-xs")}>
                                                                    {acc.balance !== 0 ? formatCurrency(acc.balance, { showDrCr: true }) : 'Rs. 0.00 Dr'}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                        <TableRow className="font-bold bg-muted/50 border-b-2 border-foreground">
                                                            <TableCell colSpan={2} className={cn(isMobile && "text-xs whitespace-nowrap")}>Bank Total</TableCell>
                                                            <TableCell className={cn("text-right text-green-600", isMobile && "text-xs whitespace-nowrap")}>{formatCurrency(bankCashSummary.totalBankInflow, {noSuffix: true})}</TableCell>
                                                            <TableCell className={cn("text-right text-red-600", isMobile && "text-xs whitespace-nowrap")}>{formatCurrency(bankCashSummary.totalBankOutflow, {noSuffix: true})}</TableCell>
                                                            <TableCell className={cn("text-right whitespace-nowrap", (bankCashSummary.totalBankInflow - bankCashSummary.totalBankOutflow) >= 0 ? "text-green-600" : "text-red-600", isMobile && "text-xs")}>
                                                                {formatCurrency(bankCashSummary.bankAccounts.reduce((sum, a) => sum + a.balance, 0), { showDrCr: true })}
                                                            </TableCell>
                                                        </TableRow>
                                                        {bankCashSummary.cashAccounts.map(acc => (
                                                            <TableRow key={acc.id}>
                                                                <TableCell className={cn(isMobile && "text-xs whitespace-nowrap")}>{acc.accountName}</TableCell>
                                                                <TableCell className={cn(isMobile && "text-xs whitespace-nowrap")}>{acc.accountType}</TableCell>
                                                                <TableCell className={cn("text-right text-green-600", isMobile && "text-xs whitespace-nowrap")}>{acc.inflow > 0 ? formatCurrency(acc.inflow, { noSuffix: true }) : '-'}</TableCell>
                                                                <TableCell className={cn("text-right text-red-600", isMobile && "text-xs whitespace-nowrap")}>{acc.outflow > 0 ? formatCurrency(acc.outflow, { noSuffix: true }) : '-'}</TableCell>
                                                                <TableCell className={cn("text-right font-semibold whitespace-nowrap", acc.balance >= 0 ? "text-green-600" : "text-red-600", isMobile && "text-xs")}>
                                                                    {acc.balance !== 0 ? formatCurrency(acc.balance, { showDrCr: true }) : 'Rs. 0.00 Dr'}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                        <TableRow className="font-bold bg-muted/50 border-b-2 border-foreground">
                                                            <TableCell colSpan={2} className={cn(isMobile && "text-xs whitespace-nowrap")}>Cash Total</TableCell>
                                                            <TableCell className={cn("text-right text-green-600", isMobile && "text-xs whitespace-nowrap")}>{formatCurrency(bankCashSummary.totalCashInflow, {noSuffix: true})}</TableCell>
                                                            <TableCell className={cn("text-right text-red-600", isMobile && "text-xs whitespace-nowrap")}>{formatCurrency(bankCashSummary.totalCashOutflow, {noSuffix: true})}</TableCell>
                                                            <TableCell className={cn("text-right whitespace-nowrap", (bankCashSummary.totalCashInflow - bankCashSummary.totalCashOutflow) >= 0 ? "text-green-600" : "text-red-600", isMobile && "text-xs")}>
                                                                {formatCurrency(bankCashSummary.cashAccounts.reduce((sum, a) => sum + a.balance, 0), { showDrCr: true })}
                                                            </TableCell>
                                                        </TableRow>
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                    )}
                </CardContent>
            </Card>

            {can("view_voucher_type_summaries") && !compact && stats.otherStats.map((stat) => (
                <Card key={stat.type} className={`hover:bg-muted/50 transition-colors ${cardBorder}`}>
                    <CardHeader className="p-3 flex-row items-center justify-between">
                        <CardTitle className="text-sm whitespace-nowrap">{stat.title}</CardTitle>
                        <stat.icon className="h-5 w-5 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                        {stat.type === 'journal' || stat.type === 'add_salary' || stat.type === 'contra' ? (
                            <div className='text-xl font-bold text-blue-600'>{formatCurrency(stat.total, { noSuffix: true, duration: 2 })}</div>
                        ) : (
                            <div className={cn('text-xl font-bold', stat.isCredit ? 'text-green-600' : 'text-red-600')}>
                                {formatCurrency(stat.total, { noSuffix: true, duration: 2 })}
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">{stat.count} transaction(s)</p>
                    </CardContent>
                </Card>
            ))}

            {can("view_entity_counts_summary") && !compact && (
                <>
                    <Card className={cardBorder}><CardHeader className="p-3"><CardTitle className="text-sm whitespace-nowrap">Total Parties</CardTitle></CardHeader><CardContent className="p-3 pt-0 text-2xl font-bold">{processedParties.length}</CardContent></Card>
                    <Card className={cardBorder}><CardHeader className="p-3"><CardTitle className="text-sm whitespace-nowrap">Total Staff</CardTitle></CardHeader><CardContent className="p-3 pt-0 text-2xl font-bold">{processedStaff.length}</CardContent></Card>
                    <Card className={cardBorder}><CardHeader className="p-3"><CardTitle className="text-sm whitespace-nowrap">Bank/Cash Acc</CardTitle></CardHeader><CardContent className="p-3 pt-0 text-2xl font-bold">{processedAccounts.length}</CardContent></Card>
                    <Card className={cardBorder}><CardHeader className="p-3"><CardTitle className="text-sm whitespace-nowrap">Total Items</CardTitle></CardHeader><CardContent className="p-3 pt-0 text-2xl font-bold">{processedItems.length}</CardContent></Card>
                    <Card className={cardBorder}><CardHeader className="p-3"><CardTitle className="text-sm whitespace-nowrap">Total Vouchers</CardTitle></CardHeader><CardContent className="p-3 pt-0 text-2xl font-bold">{vouchers.length}</CardContent></Card>
                </>
            )}
        </div>
    );
}
