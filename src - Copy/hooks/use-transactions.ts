
"use client";

import { useMemo, useCallback } from "react";
import { startOfDay, endOfDay } from "date-fns";
import type { Party, Group } from "@/components/party/types";
import type { Account, AccountGroup } from "@/components/bank-cash/types";
import type { Staff, StaffGroup } from "@/components/staff/types";
import type { Tax, TaxGroup } from "@/components/tax/types";
import type { Item, ItemGroup, StockView } from "@/components/items/types";
import { useVouchers } from "./useVouchers";
import { useDate } from "./useDate";
import type { ExpenseAccount, ExpenseGroup } from "@/components/expenses/types";
import { type Context } from "@/components/vouchers/TransactionsTable";
import {
  getAllocatedByVoucherId,
  getAllocatedByVoucherIdFromPaymentOuts,
  getPaymentStatus as getPaymentStatusResult,
  getPaymentInRemaining,
  getPaymentOutRemaining,
  getAllocationTotal,
  OPENING_BALANCE_VOUCHER_ID,
} from "@/lib/payment-allocation-utils";


type EntityWithItems = { id: string; items: (Item | Staff | Account | ExpenseAccount | Party)[], openingBalance?: number, [key: string]: any };

type Entity = Party | Account | Staff | Tax | Item | Group | AccountGroup | StaffGroup | TaxGroup | ItemGroup | ExpenseAccount | ExpenseGroup | EntityWithItems;

const safeToDate = (date: any): Date | null => {
    if (!date) return null;
    if (date instanceof Date) return date;
    if (date.toDate instanceof Function) return date.toDate();
    const parsed = new Date(date);
    return isNaN(parsed.getTime()) ? null : parsed;
};

const getParticularsText = (t: any, names: Record<string, string> = {}) => {
    let particulars: string[] = [];
    
    const getName = (id: string | undefined) => (id ? (names[id] || "—") : "N/A");

    if (t.type === 'sale') particulars.push(`To: ${getName(t.partyId)}`);
    else if (t.type === 'purchase') particulars.push(`From: ${getName(t.partyId)}`);
    else if (t.type === 'payment_in') particulars.push(`From: ${names?.[t.partyId] || names?.[t.staffId] || names?.[t.taxAccountId] || names?.[t.incomeAccountId] || t.payeeName || 'N/A'}`);
    else if (t.type === 'payment_out') particulars.push(`To: ${names?.[t.partyId] || names?.[t.staffId] || names?.[t.taxAccountId] || names?.[t.expenseAccountId] || t.payeeName || 'N/A'}`);
    else if (t.type === 'contra') particulars.push(`${getName(t.fromAccountId)} to ${getName(t.toAccountId)}`);
    else if (t.type === 'direct_income') particulars.push(`By: ${getName(t.incomeAccountId)}`);
    else if (t.type === 'direct_expense') particulars.push(`To: ${getName(t.toAccountId || t.expenseAccountId)}`);
    else if (t.type === 'journal') {
        if (t.entries && Array.isArray(t.entries)) {
            const dr = t.entries.filter((e: any) => e.debit > 0).map((e: any) => `Dr: ${getName(e.accountId)}`);
            const cr = t.entries.filter((e: any) => e.credit > 0).map((e: any) => `Cr: ${getName(e.accountId)}`);
            particulars.push(...dr, ...cr);
        }
    }
    else if (t.type === 'note') {
        particulars.push(`Note for: ${getName(t.entityId)}`);
    }
    
    return particulars.join(', ');
};

export const getTransactionAmounts = (
    transaction: any,
    context: Context,
    entity: any,
    stockView: StockView = 'amount',
    entityList?: Entity[],
    processedTaxes?: any[]
) => {
    let debit = 0;
    let credit = 0;
    let quantity = 0;
    let taxableAmount = 0;
    
    const amount = Number(transaction.total || transaction.amount || 0);

    if (['sale', 'purchase'].includes(transaction.type)) {
      taxableAmount = (transaction.subTotal || 0) - (transaction.discount || 0);
    } else {
      taxableAmount = amount;
    }
    
    switch (context) {
        case "party":
            if (entity && entity.id === 'all') {
                // Handle all transaction types for "All Vouchers" view
                if (transaction.type === 'sale') {
                    debit += taxableAmount; 
                } else if (transaction.type === 'purchase') {
                    credit += taxableAmount;
                } else if (transaction.type === 'payment_out' || transaction.type === 'direct_expense') {
                    credit += amount; // Payment Out = Credit (money going out)
                } else if (transaction.type === 'payment_in' || transaction.type === 'direct_income') {
                    debit += amount; // Payment In = Debit (money coming in)
                }
            }
            else if (entity && entity.id === 'sales_account') {
                if (transaction.type === 'sale') credit += taxableAmount;
            }
            else if (entity && entity.id === 'purchase_account') {
                if (transaction.type === 'purchase') debit += taxableAmount;
            }
            else if (entity && transaction.partyId === entity.id) {
                if (["sale", "payment_out", "direct_income"].includes(transaction.type)) debit += amount;
                if (["purchase", "payment_in", "direct_expense"].includes(transaction.type)) credit += amount;
            }
            
            if (transaction.type === "journal" && Array.isArray(transaction.entries)) {
                const entry = transaction.entries.find((e: any) => e.accountId === entity?.id);
                if (entry) {
                    debit += Number(entry.debit || 0);
                    credit += Number(entry.credit || 0);
                }
            }
            break;
            
        case "account":
            if (entity && entity.id === 'all') {
                // Handle "All Journal Vouchers" view - show all journal vouchers with total debit/credit per voucher
                const isJournalAllView = (entity as any).accountType === 'journal_view' || (entity as any).accountName?.includes('Journal');
                if (isJournalAllView && transaction.type === 'journal' && transaction.subType !== 'add_salary') {
                    const journalAmounts = getJournalTransactionAmountsForAll(transaction);
                    debit += journalAmounts.debit;
                    credit += journalAmounts.credit;
                }
                // Handle "All Vouchers" view for contra - show all contra transactions
                else if (transaction.type === 'contra') {
                    debit += amount;
                    credit += amount;
                } else if (transaction.accountId) {
                    if (["payment_in", "direct_income", "sale"].includes(transaction.type)) debit += amount;
                    if (["payment_out", "direct_expense", "purchase"].includes(transaction.type)) credit += amount;
                }
            } else if (transaction.accountId === entity.id) {
                if (["payment_in", "direct_income", "sale"].includes(transaction.type)) debit += amount;
                if (["payment_out", "direct_expense", "purchase"].includes(transaction.type)) credit += amount;
            }
            if (transaction.type === "contra") {
                if (transaction.toAccountId === entity.id) debit = amount; 
                if (transaction.fromAccountId === entity.id) credit = amount; 
            } else if (transaction.type === "journal" && Array.isArray(transaction.entries)) {
                const entry = transaction.entries.find((e: any) => e.accountId === entity.id);
                if (entry) {
                    debit += Number(entry.debit || 0);
                    credit += Number(entry.credit || 0);
                }
            }
            break;

        case "staff":
            if (entity && entity.id === 'all') {
                // Handle "All Vouchers" view for staff - show all add_salary transactions (net only: staff credits, exclude tax)
                if (transaction.type === 'journal' && transaction.subType === 'add_salary' && Array.isArray(transaction.entries)) {
                    transaction.entries.forEach((e: any) => {
                        if ((Number(e.credit) || 0) > 0 && !String(e.narration || '').includes('(Staff ID:')) {
                            credit += Number(e.credit || 0);
                        }
                    });
                } else if (transaction.type === 'payment_out' && transaction.staffId) {
                    debit += amount;
                } else if (transaction.type === 'payment_in' && transaction.staffId) {
                    credit += amount;
                }
            } else {
                const { debit: staffDebit, credit: staffCredit } = getStaffTransactionAmounts(transaction, [entity.id], []);
                debit += staffDebit;
                credit += staffCredit;
            }
            break;
    
        case "tax":
            const {debit: d, credit: c} = getTaxTransactionAmounts(transaction, entity.id, entityList || [])
            debit += d;
            credit += c;
            break;
    
        case "expense":
            // Individual Expense Account Logic
            if (transaction.type === 'direct_expense' && (transaction.toAccountId || transaction.expenseAccountId) === entity.id) {
                debit += amount;
            }
            // Add Salary Support for Individual Expense Account
            if (transaction.type === 'journal' && transaction.subType === 'add_salary') {
                const debitEntry = transaction.entries.find((e: any) => e.accountId === entity.id && e.debit > 0);
                if(debitEntry) {
                    debit += Number(debitEntry.debit || 0);
                }
            }

            if (transaction.type === 'direct_income' && transaction.incomeAccountId === entity.id) {
                credit += amount;
            }
            
            // Handle Sale and Purchase transactions for Sales Account and Purchase Account
            if (entity && entity.id === 'sales_account') {
                if (transaction.type === 'sale') {
                    // Sales Account: Sale transactions increase income (Credit)
                    credit += taxableAmount;
                }
            } else if (entity && entity.id === 'purchase_account') {
                if (transaction.type === 'purchase') {
                    // Purchase Account: Purchase transactions increase expenses (Debit)
                    debit += taxableAmount;
                }
            }
            
            if (transaction.type === "journal" && transaction.subType !== 'add_salary' && Array.isArray(transaction.entries)) {
                const entry = transaction.entries.find((e: any) => e.accountId === entity.id);
                if (entry) {
                    debit += Number(entry.debit || 0);
                    credit += Number(entry.credit || 0);
                }
            }
            break;
        
        case "group":
            const { items, expenseGroupIds, ...groupEntity } = entity;
            const memberIdsInGroup = new Set((items || []).map((i: any) => i.id));
            const firstItem = items?.[0];
            
            // Check if this is "All Journal Vouchers" view - show total debit/credit for each journal transaction
            const isJournalAllView = entity.id === 'all' && (entity as any).accountType === 'journal_view';
            
            const isStaffGroup = firstItem && 'salary' in firstItem;
            const isTaxGroup = firstItem && 'rate' in firstItem;
            const isItemGroup = firstItem && ('purchasePrice' in firstItem || 'salePrice' in firstItem || 'stockQty' in firstItem || 'openingBalanceRate' in firstItem);

            // Check expense group relationships
            const expenseGroupIdsArray = expenseGroupIds || [];
            const hasDirectIncome = expenseGroupIdsArray.includes('direct_income') || entity.id === 'direct_income';
            const hasIndirectIncome = expenseGroupIdsArray.includes('indirect_income') || entity.id === 'indirect_income';
            const hasDirectExpense = expenseGroupIdsArray.includes('direct_expense') || entity.id === 'direct_expense';
            const hasIndirectExpense = expenseGroupIdsArray.includes('indirect_expense') || entity.id === 'indirect_expense';
            const hasIncomeGroup = entity.id === 'income' || hasDirectIncome || hasIndirectIncome;
            const hasExpenseGroup = entity.id === 'expenses' || hasDirectExpense || hasIndirectExpense;
            const hasSalesAccount = memberIdsInGroup.has('sales_account');

            if (isStaffGroup) {
                const taxesToUse = processedTaxes || entityList?.filter((e: any) => e.rate !== undefined) || [];
                const staffAmounts = getStaffTransactionAmounts(transaction, Array.from(memberIdsInGroup) as string[], taxesToUse);
                debit += staffAmounts.debit;
                credit += staffAmounts.credit;
            
            } else if (isTaxGroup) {
                let groupDebit = 0;
                let groupCredit = 0;
                memberIdsInGroup.forEach(taxId => {
                    const taxAmounts = getTaxTransactionAmounts(transaction, taxId as string, entityList || []);
                    groupDebit += taxAmounts.debit;
                    groupCredit += taxAmounts.credit;
                });
                debit = groupDebit;
                credit = groupCredit;

            } else if (isItemGroup) {
                 const itemsArray = transaction.lineItems || transaction.items || [];
                 
                 itemsArray.forEach((li: any) => {
                     if (memberIdsInGroup.has(li.itemId)) {
                        const qty = Number(li.quantity) || 0;
                        const rate = Number(li.rate) || 0; // This is sale rate for sale transactions
                        const lineTotal = qty * rate;
                        
                        // Find the item to get purchase price
                        const item = entityList?.find((e: any) => e.id === li.itemId);

                        if (stockView === "amount") {
                            if (["purchase", "direct_income"].includes(transaction.type)) {
                                debit += lineTotal;
                            }
                            if (["sale", "direct_expense"].includes(transaction.type)) {
                                // IMPORTANT: For item group transactions, sale transactions must show purchase amount (not sale amount)
                                // This is required for stock matching - stock is valued at purchase price, not sale price
                                // Account list and group list balances use purchase rate for sale transactions
                                // Party view remains unchanged (shows sale amount) - see "party" case above
                                // Get purchase price: use totalPurchasePrice from transaction if available, otherwise use item's purchasePrice
                                const purchasePrice = transaction.totalPurchasePrice && transaction.totalPurchasePrice > 0 
                                    ? transaction.totalPurchasePrice 
                                    : (qty * (Number((item as Item)?.purchasePrice) || rate));
                                credit += purchasePrice;
                            }
                        } else {
                            if (["purchase", "direct_income"].includes(transaction.type)) debit += qty;
                            if (["sale", "direct_expense"].includes(transaction.type)) credit += qty;
                        }
                        quantity += qty;
                     }
                 });

            } else {
                // Generic Logic for Party, Expense, and Bank/Cash Groups
                
                // Handle Journal "All" view first - similar to contra logic
                if (isJournalAllView && transaction.type === 'journal' && transaction.subType !== 'add_salary') {
                    // For "All Journal Vouchers" view, show total debit/credit for each journal transaction
                    // Similar to contra: both debit and credit are shown
                    const journalAmounts = getJournalTransactionAmountsForAll(transaction);
                    debit = journalAmounts.debit;
                    credit = journalAmounts.credit;
                }
                // Handle Contra - both sides get amount (similar pattern for journal "all" view)
                else if (transaction.type === 'contra') {
                    if (memberIdsInGroup.has(transaction.toAccountId)) debit += amount;
                    if (memberIdsInGroup.has(transaction.fromAccountId)) credit += amount;
                }
                // 1. Expense/Income Group
                // Direct Expenses: Show transactions where expenseAccountId matches OR if group is direct_expense
                else if (transaction.type === 'direct_expense' && (memberIdsInGroup.has(transaction.toAccountId || transaction.expenseAccountId) || hasDirectExpense)) {
                    debit += amount;
                }
                // Direct Income: Show transactions where incomeAccountId matches OR if group is direct_income
                else if (transaction.type === 'direct_income' && (memberIdsInGroup.has(transaction.incomeAccountId) || hasDirectIncome)) {
                    credit += amount;
                }
                // Direct Expenses: Show ALL purchase transactions for direct_expense group
                else if (transaction.type === 'purchase' && hasDirectExpense) {
                    // Purchase transactions increase expenses (Debit side)
                    debit += taxableAmount;
                }
                // Direct Income: Show ALL sale transactions for direct_income group
                else if (transaction.type === 'sale' && hasDirectIncome) {
                    // Sale transactions increase income (Credit side)
                    credit += taxableAmount;
                }
                // Income group (parent): Show ALL sale transactions if it contains direct_income or has sales_account
                else if (transaction.type === 'sale' && hasIncomeGroup && (hasDirectIncome || hasSalesAccount)) {
                    credit += taxableAmount;
                }
                // Income group (parent): Show ALL direct_income transactions
                else if (transaction.type === 'direct_income' && hasIncomeGroup) {
                    credit += amount;
                }
                // Expenses group (parent): Show ALL purchase and direct_expense transactions if it contains direct_expense
                else if (hasExpenseGroup && ((transaction.type === 'purchase' && hasDirectExpense) || (transaction.type === 'direct_expense' && hasDirectExpense))) {
                    if (transaction.type === 'purchase') {
                        debit += taxableAmount;
                    } else {
                        debit += amount;
                    }
                }
                // FIX: Add specific handling for 'add_salary' so it's not double-counted by generic journal logic.
                else if (transaction.type === 'journal' && transaction.subType === 'add_salary') {
                    const debitEntry = transaction.entries?.find((e: any) => memberIdsInGroup.has(e.accountId) && e.debit > 0);
                    if (debitEntry) {
                        debit += Number(debitEntry.debit || 0);
                    }
                }
                // 2. Party Group
                else if (transaction.partyId && memberIdsInGroup.has(transaction.partyId)) {
                    if (["sale", "payment_out", "direct_income"].includes(transaction.type)) debit += amount;
                    if (["purchase", "payment_in", "direct_expense"].includes(transaction.type)) credit += amount;
                } 
                // 3. Bank/Cash Group
                else if (transaction.accountId && memberIdsInGroup.has(transaction.accountId)) {
                    if (["payment_in", "direct_income", "sale"].includes(transaction.type)) debit += amount;
                    if (["payment_out", "direct_expense", "purchase"].includes(transaction.type)) credit += amount;
                }
            }
            
            // Generic Journal Processing for Groups (non-all view) - exclude salary journals and staff groups as they are handled above
            // Staff groups handle add_salary journals via getStaffTransactionAmounts, so skip generic processing for them
            if (!isJournalAllView && !isStaffGroup && transaction.type === 'journal' && transaction.subType !== 'add_salary') {
                // For specific account groups, only process entries matching accounts in the group
                transaction.entries.forEach((e: any) => {
                    if(memberIdsInGroup.has(e.accountId)) {
                        debit += Number(e.debit || 0);
                        credit += Number(e.credit || 0);
                    }
                });
            }
            break;

    case "item":
        const itemsArrayItem = transaction.lineItems || transaction.items;
        const lineItem = itemsArrayItem?.find((li: any) => li.itemId === entity.id);
        if (lineItem) {
             const qty = Number(lineItem.quantity) || 0;
             const rate = Number(lineItem.rate) || 0; // This is sale rate for sale transactions
             const conversions = (entity.unitConversions || []) as any[];
             const smallestUnit = conversions.length > 0 ? conversions[conversions.length - 1].toUnit : lineItem.unit;
             let factorToSmallest = 1;
             
             if (lineItem.unit && lineItem.unit !== smallestUnit) {
                let currentUnit = lineItem.unit;
                while (currentUnit !== smallestUnit && currentUnit) {
                    const conv = conversions.find((c: any) => c.fromUnit === currentUnit);
                    if (!conv) { factorToSmallest = 0; break; }
                    factorToSmallest *= Number(conv.conversionFactor);
                    currentUnit = conv.toUnit;
                }
             }
             if (factorToSmallest === 0) factorToSmallest = 1; 
             const convertedQty = qty * factorToSmallest;

            if (stockView === "amount") {
                if (["purchase", "direct_income"].includes(transaction.type)) {
                    debit += qty * rate;
                }
                if (["sale", "direct_expense"].includes(transaction.type)) {
                    // IMPORTANT: For item transactions, sale transactions must show purchase amount (not sale amount)
                    // This is required for stock matching - stock is valued at purchase price, not sale price
                    // Party view remains unchanged (shows sale amount) - see "party" case above
                    // Get purchase price: use totalPurchasePrice from transaction if available, otherwise use item's purchasePrice
                    const purchasePrice = transaction.totalPurchasePrice && transaction.totalPurchasePrice > 0 
                        ? transaction.totalPurchasePrice 
                        : (qty * (Number(entity.purchasePrice) || rate));
                    credit += purchasePrice;
                }
            } else { 
                if (["purchase", "direct_income"].includes(transaction.type)) debit += convertedQty;
                if (["sale", "direct_expense"].includes(transaction.type)) credit += convertedQty;
            }
            quantity = convertedQty;
        } 
        else {
            if (typeof transaction.debit === "number") debit = transaction.debit;
            if (typeof transaction.credit === "number") credit = transaction.credit;
            
            if (stockView === 'qty' && debit === 0 && credit === 0) {
                 if (typeof transaction.inQty === "number") debit = transaction.inQty;
                 else if (typeof transaction.in === "number") debit = transaction.in;

                 if (typeof transaction.outQty === "number") credit = transaction.outQty;
                 else if (typeof transaction.out === "number") credit = transaction.out;
            }
        }
      break;
    
    case "daybook":
        if (transaction.type === 'journal') {
          debit = transaction.entries ? transaction.entries.reduce((sum: number, e: any) => sum + (Number(e.debit) || 0), 0) : 0;
          credit = transaction.entries ? transaction.entries.reduce((sum: number, e: any) => sum + (Number(e.credit) || 0), 0) : 0;
        } else if (transaction.type === 'contra') {
          debit = amount; 
          credit = amount;
        } else if (['sale', 'payment_in', 'direct_income'].includes(transaction.type)) {
          credit = amount; // Money coming in = Credit
        } else if (['purchase', 'payment_out', 'direct_expense'].includes(transaction.type)) {
          debit = amount; // Money going out = Debit
        }
        break;
        
    case "other":
        if (transaction.payeeName === entity.id) {
            if (transaction.type === 'payment_in' || transaction.type === 'direct_income') {
                credit += amount;
            } else if (transaction.type === 'payment_out' || transaction.type === 'direct_expense') {
                debit += amount;
            }
        }
        break;
        
    default:
        if (typeof transaction.debit === "number") debit = transaction.debit;
        if (typeof transaction.credit === "number") credit = transaction.credit;
  }

  return { debit, credit, quantity, taxableAmount };
};

export const getJournalTransactionAmountsForAll = (transaction: any) => {
    let debit = 0;
    let credit = 0;
    if (transaction.type === 'journal' && Array.isArray(transaction.entries)) {
        debit = transaction.entries.reduce((sum: number, e: any) => sum + Number(e.debit || 0), 0);
        credit = transaction.entries.reduce((sum: number, e: any) => sum + Number(e.credit || 0), 0);
    }
    return { debit, credit };
}

export const getStaffTransactionAmounts = (transaction: any, staffIds: string[], processedTaxes: any[]) => {
  let debit = 0;
  let credit = 0;
  let taxRate = 0;
  let taxableAmount = 0;
  let taxAmount = 0;
  let quantity = 0;
  const amount = Number(transaction.amount || transaction.total || 0);

  if (transaction.type === "note") return { debit, credit, taxRate, taxableAmount, taxAmount, quantity };

  if (transaction.taxAccountId) {
    const tax = processedTaxes.find(t => t.id === transaction.taxAccountId);
    if (tax) {
      taxRate = tax.rate || 0;
    }
  }

  if (transaction.type === 'payment_out' && staffIds.includes(transaction.staffId)) {
    debit = amount; 
  } else if (transaction.type === 'payment_in' && staffIds.includes(transaction.staffId)) {
    credit = amount;
  } else if (transaction.type === 'journal' && transaction.subType === 'add_salary' && Array.isArray(transaction.entries)) {
      // For add_salary journals, only process staff entries, explicitly exclude tax entries
      const staffEntry = transaction.entries.find((e: any) => {
        // Must be a staff member (in staffIds)
        const isStaff = staffIds.includes(e.accountId);
        // Must have credit (staff gets credit in add_salary)
        const hasCredit = (Number(e.credit || 0) > 0);
        // Must NOT be a tax account (double-check)
        const isNotTax = !processedTaxes.some(pt => pt.id === e.accountId);
        return isStaff && hasCredit && isNotTax;
      });
      
      if (staffEntry) {
         // Only include staff credit, never tax credit
         credit = Number(staffEntry.credit || 0);
         // Find tax entry for reference (but don't add to credit)
         const taxEntry = transaction.entries.find((taxE: any) => 
            processedTaxes.some(pt => pt.id === taxE.accountId) && 
            (taxE.narration || "").includes(`(Staff ID: ${staffEntry.accountId})`)
         );
         const taxAmountValue = taxEntry?.credit || 0;
         taxableAmount = credit + taxAmountValue;
         taxAmount = taxAmountValue;
         const relevantTax = processedTaxes.find(t => t.id === taxEntry?.accountId);
         taxRate = relevantTax?.rate || 0;
         debit = 0;
      }
  } else if (transaction.type === 'journal' && transaction.subType !== 'add_salary') {
      // For non-add_salary journals, only process staff entries, exclude tax entries
      transaction.entries.forEach((e: any) => {
        const isStaff = staffIds.includes(e.accountId);
        const isNotTax = !processedTaxes.some(pt => pt.id === e.accountId);
        if (isStaff && isNotTax) {
          debit += Number(e.debit || 0);
          credit += Number(e.credit || 0);
        }
      });
  }

  return { debit, credit, taxRate, taxableAmount, taxAmount, quantity };
};

export const getTaxTransactionAmounts = (transaction: any, taxAccountId: string, processedTaxes: any[]) => {
    let debit = 0;
    let credit = 0;
    let taxableAmount = 0;
    let taxAmount = 0;
    let taxRate = 0;
    let quantity = 0;

    const tax = processedTaxes.find(t => t.id === taxAccountId);
    if (tax) taxRate = tax.rate || 0;

    if (transaction.type === "note") return { debit, credit, taxableAmount, taxAmount, taxRate, quantity };
    
    if (transaction.type === 'payment_out' && transaction.taxAccountId === taxAccountId) {
        debit += transaction.amount || 0;
        taxAmount += transaction.amount || 0;
    } else if (transaction.type === 'payment_in' && transaction.taxAccountId === taxAccountId) {
        credit += transaction.amount || 0;
        taxAmount += transaction.amount || 0;
    } else if (transaction.lineItems) {
        transaction.lineItems.forEach((line: any) => {
            if (line.taxAccountId === taxAccountId) {
                const amount = Number(line.amount || 0);
                const taxAmt = Number(line.taxAmount || 0);
                taxableAmount += amount;
                taxAmount += taxAmt;

                if (transaction.type === 'purchase') debit += taxAmt;
                else if (transaction.type === 'sale') credit += taxAmt;
            }
        });
        if (taxableAmount > 0 && taxAmount > 0 && taxRate === 0) {
            taxRate = (taxAmount / taxableAmount) * 100;
        }
    } else if (Array.isArray(transaction.entries)) {
        const taxEntry = transaction.entries.find((e: any) => e.accountId === taxAccountId);
        if (taxEntry) {
            const entryDebit = Number(taxEntry.debit || 0);
            const entryCredit = Number(taxEntry.credit || 0);
            taxAmount = entryDebit || entryCredit;

            debit += entryDebit;
            credit += entryCredit;
            
            if (transaction.subType === 'add_salary') {
                const staffEntry = transaction.entries.find((e: any) => e.credit > 0 && e.accountId !== taxAccountId);
                if (staffEntry) {
                    taxableAmount = staffEntry.credit + taxAmount; 
                }
                if (taxableAmount > 0 && taxAmount > 0) {
                  taxRate = (taxAmount / taxableAmount) * 100;
                }
            } else {
                const otherEntry = transaction.entries.find((e: any) => e.accountId !== taxAccountId);
                if (otherEntry) {
                    taxableAmount = otherEntry.debit || otherEntry.credit || 0;
                      if (taxableAmount > 0 && taxAmount > 0 && taxRate === 0) {
                        taxRate = (taxAmount / taxableAmount) * 100;
                    }
                }
            }
        }
    } else if (transaction.subType === 'pay_salary' && transaction.taxAccountId === taxAccountId) {
        debit += transaction.amount || 0;
        taxAmount += transaction.amount || 0;
        taxableAmount = 0; 
    }


    return { debit, credit, taxableAmount, taxAmount, taxRate, quantity };
};

export function useTransactions(
    entity: Entity | null | undefined,
    context: Context,
    dateRange?: { from?: Date; to?: Date },
    stockView: StockView = 'amount',
    entityList?: any[],
    passedTransactions?: any[],
    transactionContext?: string, 
    filters?: Record<string, string>,
    voucherTypes?: string[],
    journalAccountNames?: Record<string, string>,
    userNames?: Record<string, string>,
    displayUnit?: string
) {
    const { vouchers, processedTaxes } = useVouchers();
    const { dateSystem, formatDate, formatDateBS, formatCurrency } = useDate();

    const result = useMemo(() => {
        if (!entity) {
             return { processedTransactions: [], totalTransactions: 0, openingBalanceForPeriod: 0, periodDr: 0, periodCr: 0, closingBalance: 0, daybookSummary: null };
        }
        
        const transactionsToProcess = passedTransactions || vouchers;
        
        let entityTransactions: any[] = [];
        
        // If passedTransactions is provided, use them directly (they're already filtered for the entity)
        // Only apply entity filtering if passedTransactions is not provided
        // EXCEPTION: For item context, always filter by itemId even if passedTransactions is provided
        if (passedTransactions && passedTransactions.length >= 0 && context !== 'item') {
            // Use passed transactions directly - they're already filtered for the specific entity
            entityTransactions = passedTransactions;
        } else if (transactionContext && entity.id === 'all') {
            entityTransactions = transactionsToProcess.filter((v: any) => v.type === transactionContext);
        } else if (context === 'group' && 'items' in entity) {
            // Check if this is "All Journal Vouchers" view
            const isJournalAllView = entity.id === 'all' && (entity as any).accountType === 'journal_view';
            if (isJournalAllView) {
                // For "All Journal Vouchers" view, show all journal transactions (excluding add_salary)
                entityTransactions = transactionsToProcess.filter((v: any) => 
                    v.type === 'journal' && v.subType !== 'add_salary'
                );
            } else {
                const memberIds = new Set((entity as any).items?.map((i: any) => i.id));
                const expenseGroupIds = (entity as any).expenseGroupIds || [];
                const hasDirectIncome = expenseGroupIds.includes('direct_income') || entity.id === 'direct_income';
                const hasIndirectIncome = expenseGroupIds.includes('indirect_income') || entity.id === 'indirect_income';
                const hasDirectExpense = expenseGroupIds.includes('direct_expense') || entity.id === 'direct_expense';
                const hasIndirectExpense = expenseGroupIds.includes('indirect_expense') || entity.id === 'indirect_expense';
                const hasIncomeGroup = entity.id === 'income' || hasDirectIncome || hasIndirectIncome;
                const hasExpenseGroup = entity.id === 'expenses' || hasDirectExpense || hasIndirectExpense;
                const hasSalesAccount = memberIds.has('sales_account');
                
                entityTransactions = transactionsToProcess.filter(v => 
                    v.lineItems?.some((li: any) => memberIds.has(li.itemId) || memberIds.has(li.taxAccountId)) || 
                    v.items?.some((li: any) => memberIds.has(li.itemId)) ||
                    v.entries?.some((e: any) => memberIds.has(e.accountId)) ||
                    memberIds.has(v.partyId) ||
                    memberIds.has(v.staffId) ||
                    memberIds.has(v.accountId) ||
                    memberIds.has(v.taxAccountId) ||
                    memberIds.has(v.incomeAccountId) ||
                    memberIds.has(v.expenseAccountId) ||
                    memberIds.has(v.fromAccountId) ||
                    memberIds.has(v.toAccountId) ||
                    (v.type === 'note' && memberIds.has(v.entityId)) ||
                    // Direct Expenses group: Show ALL purchase and direct_expense transactions
                    (v.type === 'purchase' && hasDirectExpense) ||
                    (v.type === 'direct_expense' && hasDirectExpense) ||
                    // Direct Income group: Show ALL sale and direct_income transactions
                    (v.type === 'sale' && hasDirectIncome) ||
                    (v.type === 'direct_income' && hasDirectIncome) ||
                    // Income group (parent): Show ALL sale and direct_income transactions if it contains direct_income or has sales_account
                    (hasIncomeGroup && ((v.type === 'sale' && (hasDirectIncome || hasSalesAccount)) || v.type === 'direct_income')) ||
                    // Expenses group (parent): Show ALL purchase and direct_expense transactions if it contains direct_expense
                    (hasExpenseGroup && ((v.type === 'purchase' && hasDirectExpense) || (v.type === 'direct_expense' && hasDirectExpense)))
                );
            }
        } else if (context === 'daybook') {
            entityTransactions = transactionsToProcess;
        } else if (context === 'other') {
             entityTransactions = transactionsToProcess.filter((v: any) => v.payeeName === entity.id);
        } else if (context === 'item') {
            // For items, ONLY show transactions that contain this item in lineItems
            entityTransactions = transactionsToProcess.filter((v: any) =>
                v.lineItems?.some((li: any) => li.itemId === entity.id) || 
                v.items?.some((li: any) => li.itemId === entity.id)
            );
        } else {
            entityTransactions = transactionsToProcess.filter((v: any) => {
                // Standard filters
                if (v.partyId === entity.id ||
                v.accountId === entity.id ||
                v.staffId === entity.id ||
                v.taxAccountId === entity.id ||
                v.expenseAccountId === entity.id ||
                v.incomeAccountId === entity.id ||
                v.lineItems?.some((li: any) => li.itemId === entity.id || li.taxAccountId === entity.id) || 
                v.items?.some((li: any) => li.itemId === entity.id) || 
                v.entries?.some((e: any) => e.accountId === entity.id) ||
                (v.type === 'note' && v.entityId === entity.id) ||
                    (v.type === 'contra' && (v.fromAccountId === entity.id || v.toAccountId === entity.id))) {
                    return true;
                }
                
                // Special handling for Sales Account and Purchase Account
                // Sales Account should show all 'sale' transactions
                if (entity.id === 'sales_account' && v.type === 'sale') {
                    return true;
                }
                // Purchase Account should show all 'purchase' transactions
                if (entity.id === 'purchase_account' && v.type === 'purchase') {
                    return true;
                }
                
                return false;
            });
        }

        if (transactionContext && !passedTransactions) {
            // Only filter by transactionContext if passedTransactions is not provided
            // If passedTransactions is provided, they're already filtered
            const contextType = transactionContext === 'payment-in' ? 'payment_in' : 
                              transactionContext === 'payment-out' ? 'payment_out' : transactionContext;
            entityTransactions = entityTransactions.filter((v: any) => {
                if (contextType === 'payment_in' || contextType === 'payment_out') {
                    return v.type === contextType || (contextType === 'payment_in' && v.type === 'direct_income') || 
                           (contextType === 'payment_out' && v.type === 'direct_expense');
                }
                return v.type === contextType;
            });
        }
        
        let filteredByType = entityTransactions;
        if (voucherTypes && !voucherTypes.includes('all')) {
            filteredByType = entityTransactions.filter((v) => {
                const type = v.type === 'journal' && v.subType ? v.subType : v.type;
                return voucherTypes.includes(type);
            });
        }

        let filteredByColumn = filteredByType;
        
        if (filters && Object.values(filters).some((v) => v)) {
            filteredByColumn = filteredByType.filter((t: any) => {
              return Object.entries(filters).every(([key, value]) => {
                if (!value) return true;
                const rawSearchTerm = String(value).toLowerCase().trim();
                
                const d = safeToDate(t.date);
        
                // Build searchable text from all transaction fields
                const allSearchableFields: string[] = [];
                
                // Date fields
                if (d) {
                    allSearchableFields.push(formatDateBS(d).toLowerCase());
                    allSearchableFields.push(formatDate(d).toLowerCase());
                }
                
                // Type
                const displayType = t.type ? (t.subType === 'add_salary' ? 'Add Salary' : t.type.replace(/_/g, " ")) : "";
                allSearchableFields.push(displayType.toLowerCase());
                
                // Voucher Number
                if (t.voucherNumber) {
                    allSearchableFields.push(t.voucherNumber.toLowerCase());
                }
                
                // User
                const uId = t.userId;
                const userName = (userNames && uId && userNames[uId]) ? userNames[uId] : (t.userId || "");
                allSearchableFields.push(userName.toLowerCase());
                
                // Accounts/Particulars
                const particularsText = getParticularsText(t, { ...journalAccountNames, ...userNames });
                allSearchableFields.push(particularsText.toLowerCase());
                
                // Narration
                if (t.narration) {
                    allSearchableFields.push(t.narration.toLowerCase());
                }
                
                // Title (for notes)
                if (t.title) {
                    allSearchableFields.push(t.title.toLowerCase());
                }
                
                // Amount fields
                const { debit, credit } = getTransactionAmounts(t, context, entity, stockView, entityList, processedTaxes);
                const debitStr = formatCurrency(debit, { noSuffix: true, noAnimation: true })?.toString() ?? "";
                const creditStr = formatCurrency(credit, { noSuffix: true, noAnimation: true })?.toString() ?? "";
                allSearchableFields.push(debitStr.toLowerCase());
                allSearchableFields.push(creditStr.toLowerCase());
                
                // Combine all fields into one searchable string
                const combinedSearchText = allSearchableFields.join(" ");
                
                // For amount fields, also check numeric matching (works with 1+ characters)
                if (key === "debit" || key === "credit" || key === "balance") {
                    const amountSearchTerm = rawSearchTerm.replace(/[^0-9.]/g, "");
                    const cleanCombinedText = combinedSearchText.replace(/[^0-9.-]/g, "");
                    // Allow matching even with single digit/character
                    if (amountSearchTerm.length > 0 && cleanCombinedText.includes(amountSearchTerm)) {
                        return true;
                    }
                }
                
                // General text search across all fields (works with 1+ characters)
                // Allow matching even with single character
                if (rawSearchTerm.length > 0 && combinedSearchText.includes(rawSearchTerm)) {
                    return true;
                }
                return false;
              });
            });
        }

        // IMPORTANT: never sort in-place (it causes UI jitter on re-renders)
        // Use a stable, deterministic sort with a final tie-breaker.
        const sorted = filteredByColumn.slice().sort((a, b) => {
            const dateA = safeToDate(a.date)?.getTime() || 0;
            const dateB = safeToDate(b.date)?.getTime() || 0;
            
            if (dateB !== dateA) return dateA - dateB;
            
            const creationA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const creationB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            if (creationA !== creationB) return creationA - creationB;

            // Final tie-breaker: id (prevents random reordering when timestamps are equal/missing)
            const idA = String(a.id || "");
            const idB = String(b.id || "");
            return idA.localeCompare(idB);
        });
        
        const totalTransactions = sorted.length;
        let initialOpeningBalance: number = 0;
        
        if (context === 'group' && 'items' in entity) {
          const groupEntity = entity as EntityWithItems;
          const firstItem = groupEntity.items?.[0];
          
          const isItemGroup = firstItem && ('purchasePrice' in firstItem || 'salePrice' in firstItem || 'stockQty' in firstItem || 'openingBalanceRate' in firstItem);
          
          // Get the group's own opening balance if it exists (from processedStaffGroups, processedTaxGroups, etc.)
          const groupOpeningBalance = (groupEntity as any).openingBalance !== undefined ? Number((groupEntity as any).openingBalance) || 0 : 0;

          // Sum opening balances from items (staff, taxes, accounts, etc.)
          const itemsOpeningBalance = (groupEntity.items || []).reduce((sum: number, item: any) => {
              if (isItemGroup && stockView === 'amount') {
                  return sum + (Number(item.openingBalance) || 0) * (Number(item.openingBalanceRate) || 0);
              } 
              else {
                  // For staff, taxes, accounts, etc., use their openingBalance field
                  return sum + (Number(item.openingBalance) || 0);
              }
          }, 0);
          
          // For groups, always use the sum of items' opening balances (which matches the group's opening balance from processGroups)
          // This ensures consistency: group opening balance = sum of all items' opening balances
          initialOpeningBalance = itemsOpeningBalance !== 0 ? itemsOpeningBalance : groupOpeningBalance;

        } else if (context === 'item' && entity) {
            // Item context: always compute from openingBalance/openingBalanceRate (handles number, string from Firestore)
            const openingBalanceDate = safeToDate((entity as any).openingBalanceDate);
            if (openingBalanceDate && dateRange?.from && openingBalanceDate > startOfDay(dateRange.from)) {
                // Opening balance date is after filter start - not yet applicable
            } else {
                if (stockView === 'amount') {
                    const obQty = Number((entity as any).openingBalance) || 0;
                    const obRate = Number((entity as any).openingBalanceRate) || 0;
                    initialOpeningBalance = obQty * obRate;
                } else if (stockView === 'qty') {
                    // This is the fix. Convert opening balance qty to smallest unit
                    const item = entity as Item;
                    const conversions = (item.unitConversions || []) as any[];
                    const smallestUnit = conversions.length > 0 ? conversions[conversions.length - 1].toUnit : ((item as any).openingBalanceUnit || '');
                    
                    const getFactor = (unit: string) => {
                         if (!unit || conversions.length === 0) return 1;
                         if (unit === smallestUnit) return 1;
                         let factor = 1;
                         let currentUnit = unit;
                         for (let i=0; i < 10; i++) {
                            const conv = conversions.find((c:any) => c.fromUnit === currentUnit);
                            if (!conv) return 0; 
                            factor *= Number(conv.conversionFactor) || 1;
                            currentUnit = conv.toUnit;
                            if (currentUnit === smallestUnit) break;
                         }
                         return factor;
                    };
                    const openingUnit = (item as any).openingBalanceUnit || '';
                    const factor = getFactor(openingUnit);
                    initialOpeningBalance = (Number((entity as any).openingBalance) || 0) * factor;
                }
            }
        } else if (entity && 'openingBalance' in entity && typeof (entity as any).openingBalance === 'number') {
            const openingBalanceDate = safeToDate((entity as any).openingBalanceDate);
            if (openingBalanceDate && dateRange?.from && openingBalanceDate > startOfDay(dateRange.from)) {
            } else {
                if ('type' in entity && entity.type === 'service' && stockView === 'amount') {
                    initialOpeningBalance = (entity as any).openingBalance || 0;
                } else {
                    initialOpeningBalance = (entity as any).openingBalance || 0;
                }
            }
        }


        let openingBalanceForPeriod = initialOpeningBalance;
        const effectiveDateRange = dateRange;

        let transactionsToDisplay = sorted;

        if (effectiveDateRange?.from) {
            const fromDate = startOfDay(effectiveDateRange.from);
            
            const prePeriodTransactions = sorted.filter(t => {
                const transactionDate = safeToDate(t.date);
                const openingBalanceDate = safeToDate((entity as any).openingBalanceDate);

                if (!transactionDate) return false;

                // If opening balance date is set, only consider txns after it for OB calculation
                if (openingBalanceDate && transactionDate < openingBalanceDate) {
                  return false;
                }
                
                return transactionDate < fromDate;
            });

            openingBalanceForPeriod = prePeriodTransactions.reduce((balance, t) => {
                const amounts = getTransactionAmounts(t, context, entity, stockView, entityList, processedTaxes);
                return balance + amounts.debit - amounts.credit;
            }, initialOpeningBalance);

            const toDate = effectiveDateRange.to ? endOfDay(effectiveDateRange.to) : endOfDay(effectiveDateRange.from);
            transactionsToDisplay = sorted.filter(t => {
                const transactionDate = safeToDate(t.date);
                return transactionDate && transactionDate >= fromDate && transactionDate <= toDate;
            });

        }
        
        let runningBalance = openingBalanceForPeriod;
        // For journal "all" view, calculate cumulative balance differently
        const isJournalAllView = context === 'group' && entity && entity.id === 'all' && (entity as any).accountType === 'journal_view';

        // Bill-wise payment status for party/group/daybook; also staff (add_salary paid via payment_out); tax ledger (sale/purchase/payment status)
        const isBillWiseContext = context === 'party' || context === 'group' || context === 'daybook';
        const isStaffContext = context === 'staff' || context === 'group';
        const firstItemForContext = context === 'group' && entity && 'items' in entity ? ((entity as EntityWithItems).items || [])[0] : null;
        const isTaxGroupContext = !!(firstItemForContext && 'rate' in firstItemForContext && !('accountType' in firstItemForContext));
        const isTaxContext = context === 'tax' || context === 'tax_group' || isTaxGroupContext;
        const isExpenseContext = context === 'expense';
        const allocatedBySale = (isBillWiseContext || isTaxContext || isExpenseContext) ? getAllocatedByVoucherId(vouchers) : new Map<string, number>();
        const allocatedByPurchase = (isBillWiseContext || isStaffContext || isTaxContext || isExpenseContext) ? getAllocatedByVoucherIdFromPaymentOuts(vouchers) : new Map<string, number>();
        const entityIdForLinks = entity && 'id' in entity ? (entity as any).id : undefined;

        const withBalance = transactionsToDisplay
            .map(t => {
                const amounts = getTransactionAmounts(t, context, entity, stockView, entityList, processedTaxes);
                
                // Fix: Filter out transactions with zero amounts for individual accounts/groups
                // This ensures only relevant transactions are shown (not transactions from other accounts/groups)
                if (context !== 'daybook' && context !== 'other' && amounts.debit === 0 && amounts.credit === 0) {
                    // Skip transactions with no amount impact for this entity
                    return null;
                }
                
                if (isJournalAllView && t.type === 'journal') {
                    // For journal transactions in "all" view, running balance should remain at opening balance
                    // Since journals balance (debit = credit), debit - credit = 0, so balance doesn't change
                    runningBalance += amounts.debit - amounts.credit; // This will be 0 for balanced journal entries
                } else {
                    runningBalance += amounts.debit - amounts.credit;
                }

                // Bill-wise status and outstanding for sale/purchase in party/group/daybook context
                let paymentStatus: string | undefined;
                let isOverdue = false;
                let outstanding: number | undefined;
                if (isBillWiseContext && (t.type === 'sale' || t.type === 'purchase')) {
                    // Use voucher's invoice total (same as Net Balance base in form: Total - linked). Include openingBalanceAllocated.
                    const total = Number(t.total ?? t.amount ?? ((t.subTotal ?? 0) - (t.discount ?? 0) + (t.tax ?? 0))) || 0;
                    const fromPayments = t.type === 'sale' ? (allocatedBySale.get(t.id) ?? 0) : (allocatedByPurchase.get(t.id) ?? 0);
                    const fromOB = Number((t as any).openingBalanceAllocated) || 0;
                    const allocated = fromPayments + fromOB;
                    const result = getPaymentStatusResult(total, allocated, t.dueDate);
                    paymentStatus = result.isOverdue ? 'overdue' : result.status;
                    isOverdue = result.isOverdue;
                    outstanding = result.outstanding;
                }
                // Tax ledger: Sale / Purchase – show Paid/Unpaid/Partial/Overdue (same as party bill-wise)
                if (isTaxContext && (t.type === 'sale' || t.type === 'purchase')) {
                    const total = Number(t.total ?? t.amount ?? ((t.subTotal ?? 0) - (t.discount ?? 0) + (t.tax ?? 0))) || 0;
                    const fromPayments = t.type === 'sale' ? (allocatedBySale.get(t.id) ?? 0) : (allocatedByPurchase.get(t.id) ?? 0);
                    const fromOB = Number((t as any).openingBalanceAllocated) || 0;
                    const allocated = fromPayments + fromOB;
                    const result = getPaymentStatusResult(total, allocated, t.dueDate);
                    paymentStatus = result.isOverdue ? 'overdue' : result.status;
                    isOverdue = result.isOverdue;
                    outstanding = result.outstanding;
                }
                // Income & Expense ledger: Sale / Purchase – show Paid/Unpaid/Partial/Overdue (same as tax)
                if (isExpenseContext && (t.type === 'sale' || t.type === 'purchase')) {
                    const total = Number(t.total ?? t.amount ?? ((t.subTotal ?? 0) - (t.discount ?? 0) + (t.tax ?? 0))) || 0;
                    const fromPayments = t.type === 'sale' ? (allocatedBySale.get(t.id) ?? 0) : (allocatedByPurchase.get(t.id) ?? 0);
                    const fromOB = Number((t as any).openingBalanceAllocated) || 0;
                    const allocated = fromPayments + fromOB;
                    const result = getPaymentStatusResult(total, allocated, t.dueDate);
                    paymentStatus = result.isOverdue ? 'overdue' : result.status;
                    isOverdue = result.isOverdue;
                    outstanding = result.outstanding;
                }
                // Bill-wise: payment_in / payment_out - Settled when remaining 0; Partially Paid only when remaining > 0 AND payment link (allocations) exists; else Unpaid
                if (isBillWiseContext && (t.type === 'payment_in' || t.type === 'payment_out' || t.type === 'direct_income' || t.type === 'direct_expense')) {
                    const remaining = t.type === 'payment_in' || t.type === 'direct_income' ? getPaymentInRemaining(t) : getPaymentOutRemaining(t);
                    const hasAllocations = ((t.allocations as { voucherId: string; amount: number }[] | undefined) || []).length > 0;
                    if (remaining <= 0) {
                        paymentStatus = 'paid';
                        isOverdue = false;
                        outstanding = 0;
                    } else if (hasAllocations) {
                        paymentStatus = 'partially_paid';
                        outstanding = remaining;
                    } else {
                        paymentStatus = 'unpaid';
                        outstanding = remaining;
                    }
                }
                // Bank/Cash account ledger: show Settled/Partial/Unpaid for payment_in, payment_out, direct_income, direct_expense
                if (context === 'account' && (t.type === 'payment_in' || t.type === 'payment_out' || t.type === 'direct_income' || t.type === 'direct_expense')) {
                    const remaining = t.type === 'payment_in' || t.type === 'direct_income' ? getPaymentInRemaining(t) : getPaymentOutRemaining(t);
                    const hasAllocations = ((t.allocations as { voucherId: string; amount: number }[] | undefined) || []).length > 0;
                    if (remaining <= 0) {
                        paymentStatus = 'paid';
                        isOverdue = false;
                        outstanding = 0;
                    } else if (hasAllocations) {
                        paymentStatus = 'partially_paid';
                        outstanding = remaining;
                    } else {
                        paymentStatus = 'unpaid';
                        outstanding = remaining;
                    }
                }
                // Tax account ledger: show Paid/Partial/Unpaid for payment_in, payment_out, direct_income, direct_expense involving this tax
                if ((context === 'tax' || context === 'tax_group') && (t.type === 'payment_in' || t.type === 'payment_out' || t.type === 'direct_income' || t.type === 'direct_expense')) {
                    const remaining = t.type === 'payment_in' || t.type === 'direct_income' ? getPaymentInRemaining(t) : getPaymentOutRemaining(t);
                    const hasAllocations = ((t.allocations as { voucherId: string; amount: number }[] | undefined) || []).length > 0;
                    if (remaining <= 0) {
                        paymentStatus = 'paid';
                        isOverdue = false;
                        outstanding = 0;
                    } else if (hasAllocations) {
                        paymentStatus = 'partially_paid';
                        outstanding = remaining;
                    } else {
                        paymentStatus = 'unpaid';
                        outstanding = remaining;
                    }
                }
                // Income & Expense account ledger: show Paid/Partial/Unpaid for payment_in, payment_out, direct_income, direct_expense
                if (context === 'expense' && (t.type === 'payment_in' || t.type === 'payment_out' || t.type === 'direct_income' || t.type === 'direct_expense')) {
                    const remaining = t.type === 'payment_in' || t.type === 'direct_income' ? getPaymentInRemaining(t) : getPaymentOutRemaining(t);
                    const hasAllocations = ((t.allocations as { voucherId: string; amount: number }[] | undefined) || []).length > 0;
                    if (remaining <= 0) {
                        paymentStatus = 'paid';
                        isOverdue = false;
                        outstanding = 0;
                    } else if (hasAllocations) {
                        paymentStatus = 'partially_paid';
                        outstanding = remaining;
                    } else {
                        paymentStatus = 'unpaid';
                        outstanding = remaining;
                    }
                }
                // Add Salary net (linkable) total: staff credits only; tax credits are linked separately. Payment outs link to net.
                const getAddSalaryNetTotal = (v: any) => {
                    if (!Array.isArray(v.entries) || v.entries.length === 0) return Number(v.total ?? v.amount ?? 0) || 0;
                    return v.entries
                        .filter((e: any) => (Number(e.credit) || 0) > 0 && !String(e.narration || '').includes('(Staff ID:'))
                        .reduce((s: number, e: any) => s + (Number(e.credit) || 0), 0);
                };
                // Staff ledger: Add Salary behaves like a bill – paid via Payment Out; show Paid/Unpaid/Partial/Overdue
                if (isStaffContext && t.type === 'journal' && t.subType === 'add_salary') {
                    const total = getAddSalaryNetTotal(t);
                    const allocated = allocatedByPurchase.get(t.id) ?? 0;
                    const result = getPaymentStatusResult(total, allocated, t.dueDate);
                    paymentStatus = result.isOverdue ? 'overdue' : result.status;
                    isOverdue = result.isOverdue;
                    outstanding = result.outstanding;
                }
                // Staff ledger: Payment Out / Direct Expense – outstanding = amount not yet linked to salary (for bill-wise balance column)
                if (isStaffContext && (t.type === 'payment_out' || t.type === 'direct_expense')) {
                    outstanding = getPaymentOutRemaining(t);
                }
                // Tax ledger (single tax details): Add Salary – show Paid/Unpaid/Partial/Overdue same as staff
                if (isTaxContext && t.type === 'journal' && t.subType === 'add_salary') {
                    const total = getAddSalaryNetTotal(t);
                    const allocated = allocatedByPurchase.get(t.id) ?? 0;
                    const result = getPaymentStatusResult(total, allocated, t.dueDate);
                    paymentStatus = result.isOverdue ? 'overdue' : result.status;
                    isOverdue = result.isOverdue;
                    outstanding = result.outstanding;
                }
                // Income & Expense ledger: Add Salary – show Paid/Unpaid/Partial/Overdue same as staff
                if (isExpenseContext && t.type === 'journal' && t.subType === 'add_salary') {
                    const total = getAddSalaryNetTotal(t);
                    const allocated = allocatedByPurchase.get(t.id) ?? 0;
                    const result = getPaymentStatusResult(total, allocated, t.dueDate);
                    paymentStatus = result.isOverdue ? 'overdue' : result.status;
                    isOverdue = result.isOverdue;
                    outstanding = result.outstanding;
                }

                // Linked voucher numbers for Status column: "from X , to Y"
                let linkedFromVoucherNos: string[] = [];
                let linkedToVoucherNos: string[] = [];
                const staffShowLinkDetails = isStaffContext && (t.type === 'journal' && t.subType === 'add_salary' || t.type === 'payment_out' || t.type === 'direct_expense');
                if ((isBillWiseContext || context === 'account' || context === 'tax' || context === 'tax_group' || context === 'expense' || staffShowLinkDetails) && (paymentStatus != null || t.type === 'sale' || t.type === 'purchase' || t.type === 'payment_in' || t.type === 'payment_out' || t.type === 'direct_income' || t.type === 'direct_expense' || (t.type === 'journal' && t.subType === 'add_salary'))) {
                    if (t.type === 'sale' || t.type === 'purchase') {
                        const payTypes = t.type === 'sale' ? ['payment_in', 'direct_income'] : ['payment_out', 'direct_expense'];
                        const partyId = String((t as any).partyId ?? '');
                        vouchers.forEach((v: any) => {
                            if (!payTypes.includes(v.type)) return;
                            if (entityIdForLinks && partyId && String((v as any).partyId ?? '') !== partyId) return;
                            const allocs = (v.allocations as { voucherId: string; amount: number }[] | undefined) || [];
                            if (allocs.some((a: any) => a.voucherId === t.id)) {
                                const no = v.voucherNumber ?? v.voucher_number ?? '';
                                if (no) linkedFromVoucherNos.push(no);
                            }
                        });
                        if (Number((t as any).openingBalanceAllocated) > 0) {
                            linkedFromVoucherNos.push("Opening Balance");
                        }
                        const myNo = t.voucherNumber ?? t.voucher_number ?? '';
                        if (myNo) linkedToVoucherNos = [myNo];
                    } else if (t.type === 'journal' && t.subType === 'add_salary') {
                        // Add Salary: payment_out that allocated to this voucher show as "from PYMT-X"
                        vouchers.forEach((v: any) => {
                            if (v.type !== 'payment_out' && v.type !== 'direct_expense') return;
                            const allocs = (v.allocations as { voucherId: string; amount: number }[] | undefined) || [];
                            if (allocs.some((a: any) => a.voucherId === t.id)) {
                                const no = v.voucherNumber ?? v.voucher_number ?? '';
                                if (no) linkedFromVoucherNos.push(no);
                            }
                        });
                        const myNo = t.voucherNumber ?? t.voucher_number ?? '';
                        if (myNo) linkedToVoucherNos = [myNo];
                    } else if (t.type === 'payment_in' || t.type === 'payment_out' || t.type === 'direct_income' || t.type === 'direct_expense') {
                        const myNo = t.voucherNumber ?? t.voucher_number ?? '';
                        if (myNo) linkedFromVoucherNos = [myNo];
                        const allocs = (t.allocations as { voucherId: string; amount: number }[] | undefined) || [];
                        allocs.forEach((a: any) => {
                            if (a.voucherId === OPENING_BALANCE_VOUCHER_ID) {
                                linkedToVoucherNos.push("Opening Balance");
                            } else {
                                const target = vouchers.find((v: any) => v.id === a.voucherId);
                                const no = target?.voucherNumber ?? target?.voucher_number ?? '';
                                if (no) linkedToVoucherNos.push(no);
                            }
                        });
                    }
                }

                return {
                    ...t,
                    ...amounts,
                    quantity: amounts.quantity,
                    originalQuantity: t.lineItems?.find((li:any) => entity && 'id' in entity && li.itemId === entity.id)?.quantity || 0,
                    balance: runningBalance,
                    paymentStatus,
                    isOverdue,
                    outstanding,
                    linkedFromVoucherNos,
                    linkedToVoucherNos,
                };
            })
            .filter((t): t is NonNullable<typeof t> => t !== null);    
        
        // Recalculate totals after filtering out zero-amount transactions
        const periodDr = withBalance.reduce((sum, t) => sum + (t.debit || 0), 0);
        const periodCr = withBalance.reduce((sum, t) => sum + (t.credit || 0), 0);
        const closing = openingBalanceForPeriod + periodDr - periodCr;
        
        let daybookSummary: any = null;
        if (context === 'daybook' && dateRange?.from) {
            const today = startOfDay(dateRange.from);

            const calculateBalanceUpTo = (targetDate: Date, accountType?: 'Bank' | 'Cash') => {
                let balance = 0;
                const relevantAccounts = accountType ? (entityList as Account[]).filter(a => a.accountType === accountType) : (entityList as Account[]);
                
                relevantAccounts.forEach(acc => {
                    balance += acc.openingBalance || 0;
                });
                
                vouchers.forEach((v: any) => {
                    const transactionDate = safeToDate(v.date);
                    if (transactionDate && transactionDate < targetDate) {
                        const accountIsRelevant = relevantAccounts.some(a => a.id === v.accountId || a.id === v.toAccountId || a.id === v.fromAccountId || (v.entries && v.entries.some((e:any) => e.accountId === a.id)));
                        if(accountIsRelevant) {
                           const { debit, credit } = getTransactionAmounts(v, "account", { id: relevantAccounts.find(a => a.id === v.accountId || a.id === v.toAccountId || a.id === v.fromAccountId)?.id }, stockView, entityList, processedTaxes);
                           balance += debit - credit;
                        }
                    }
                });
                return balance;
            };

            const yesterdayBankBalance = calculateBalanceUpTo(today, 'Bank');
            const yesterdayCashBalance = calculateBalanceUpTo(today, 'Cash');
            
            let totalBankIn = 0, totalBankOut = 0, totalCashIn = 0, totalCashOut = 0;
            const bankAccountIds = new Set((entityList as Account[]).filter(a => a.accountType === 'Bank').map(a => a.id));
            const cashAccountIds = new Set((entityList as Account[]).filter(a => a.accountType === 'Cash').map(a => a.id));
            
            withBalance.forEach(v => {
                const amount = v.total || v.amount || 0;
                if(v.type === 'contra') {
                    if (bankAccountIds.has(v.toAccountId)) totalBankIn += amount;
                    if (bankAccountIds.has(v.fromAccountId)) totalBankOut += amount;
                    if (cashAccountIds.has(v.toAccountId)) totalCashIn += amount;
                    if (cashAccountIds.has(v.fromAccountId)) totalCashOut += amount;
                } else if (bankAccountIds.has(v.accountId)) {
                    if (['sale', 'payment_in', 'direct_income'].includes(v.type)) totalBankIn += amount;
                    if (['purchase', 'payment_out', 'direct_expense'].includes(v.type)) totalBankOut += amount;
                } else if (cashAccountIds.has(v.accountId)) {
                    if (['sale', 'payment_in', 'direct_income'].includes(v.type)) totalCashIn += amount;
                    if (['purchase', 'payment_out', 'direct_expense'].includes(v.type)) totalCashOut += amount;
                }
            });

            const bank = { yesterday: yesterdayBankBalance, in: totalBankIn, out: totalBankOut, today: yesterdayBankBalance + totalBankIn - totalBankOut };
            const cash = { yesterday: yesterdayCashBalance, in: totalCashIn, out: totalCashOut, today: yesterdayCashBalance + totalCashIn - totalCashOut };
            const total = { yesterday: bank.yesterday + cash.yesterday, in: bank.in + cash.in, out: bank.out + cash.out, today: bank.today + cash.today };

            daybookSummary = { bank, cash, total };
        }

        // Bill-wise: opening balance row outstanding (amount - linked) and linked voucher nos for status
        let openingBalanceOutstanding: number | undefined;
        let openingBalanceLinkedVoucherNos: string[] = [];
        const entityOB = entity && 'openingBalance' in entity ? Number((entity as any).openingBalance) || 0 : 0;
        const entityId = entity && 'id' in entity ? (entity as any).id : undefined;
        const groupOB = context === 'group' && 'items' in entity ? openingBalanceForPeriod : undefined;
        const memberIds = context === 'group' && entity && 'items' in entity
            ? new Set(((entity as EntityWithItems).items || []).map((i: any) => String(i.id)))
            : null;
        if (entityId && (context === 'staff' || context === 'party')) {
            const obAmount = Math.abs(entityOB);
            let totalAllocatedToOB = 0;
            if (context === 'staff') {
                (vouchers as any[]).forEach((v: any) => {
                    if ((v.type !== 'payment_out' && v.type !== 'direct_expense') || v.staffId !== entityId) return;
                    const allocs = (v.allocations as { voucherId: string; amount: number }[] | undefined) || [];
                    allocs.forEach((a: any) => {
                        if (a.voucherId === OPENING_BALANCE_VOUCHER_ID) {
                            totalAllocatedToOB += getAllocationTotal(a);
                            const no = v.voucherNumber ?? v.voucher_number ?? '';
                            if (no) openingBalanceLinkedVoucherNos.push(no);
                        }
                    });
                });
            } else if (context === 'party') {
                const payTypes = entityOB > 0 ? ['payment_in', 'direct_income'] : ['payment_out', 'direct_expense'];
                (vouchers as any[]).forEach((v: any) => {
                    if (!payTypes.includes(v.type) || String((v as any).partyId ?? '') !== String(entityId)) return;
                    const allocs = (v.allocations as { voucherId: string; amount: number }[] | undefined) || [];
                    allocs.forEach((a: any) => {
                        if (a.voucherId === OPENING_BALANCE_VOUCHER_ID) {
                            totalAllocatedToOB += getAllocationTotal(a);
                            const no = v.voucherNumber ?? v.voucher_number ?? '';
                            if (no) openingBalanceLinkedVoucherNos.push(no);
                        }
                    });
                });
                let totalConsumedFromOB = 0;
                (vouchers as any[]).forEach((v: any) => {
                    if ((v.type !== 'sale' && v.type !== 'sale_service' && v.type !== 'purchase' && v.type !== 'purchase_service') || String((v as any).partyId ?? '') !== String(entityId)) return;
                    totalConsumedFromOB += Number((v as any).openingBalanceAllocated) || 0;
                    const obAlloc = Number((v as any).openingBalanceAllocated) || 0;
                    if (obAlloc > 0) {
                        const no = v.voucherNumber ?? v.voucher_number ?? '';
                        if (no) openingBalanceLinkedVoucherNos.push(no);
                    }
                });
                totalAllocatedToOB += totalConsumedFromOB;
            }
            openingBalanceOutstanding = Math.max(0, obAmount - totalAllocatedToOB);
        } else if (context === 'group' && memberIds && groupOB != null) {
            const obAmount = Math.abs(groupOB);
            let totalAllocatedToOB = 0;
            const firstItem = entity && 'items' in entity ? ((entity as EntityWithItems).items || [])[0] : null;
            const isAccountGroup = firstItem && 'accountType' in firstItem;
            const isTaxGroup = firstItem && 'rate' in firstItem && !('accountType' in firstItem);
            if (isAccountGroup || isTaxGroup) {
                openingBalanceOutstanding = Math.max(0, obAmount);
                openingBalanceLinkedVoucherNos = [];
            } else {
            const isStaffGroup = firstItem && !('partyId' in firstItem);
            if (isStaffGroup) {
                (vouchers as any[]).forEach((v: any) => {
                    if ((v.type !== 'payment_out' && v.type !== 'direct_expense') || !memberIds.has(String((v as any).staffId ?? ''))) return;
                    const allocs = (v.allocations as { voucherId: string; amount: number }[] | undefined) || [];
                    allocs.forEach((a: any) => {
                        if (a.voucherId === OPENING_BALANCE_VOUCHER_ID) {
                            totalAllocatedToOB += getAllocationTotal(a);
                            const no = v.voucherNumber ?? v.voucher_number ?? '';
                            if (no) openingBalanceLinkedVoucherNos.push(no);
                        }
                    });
                });
            } else {
                const payTypes = groupOB > 0 ? ['payment_in', 'direct_income'] : ['payment_out', 'direct_expense'];
                (vouchers as any[]).forEach((v: any) => {
                    if (!payTypes.includes(v.type) || !memberIds.has(String((v as any).partyId ?? ''))) return;
                    const allocs = (v.allocations as { voucherId: string; amount: number }[] | undefined) || [];
                    allocs.forEach((a: any) => {
                        if (a.voucherId === OPENING_BALANCE_VOUCHER_ID) {
                            totalAllocatedToOB += getAllocationTotal(a);
                            const no = v.voucherNumber ?? v.voucher_number ?? '';
                            if (no) openingBalanceLinkedVoucherNos.push(no);
                        }
                    });
                });
                let totalConsumedFromOB = 0;
                (vouchers as any[]).forEach((v: any) => {
                    if ((v.type !== 'sale' && v.type !== 'sale_service' && v.type !== 'purchase' && v.type !== 'purchase_service') || !memberIds.has(String((v as any).partyId ?? ''))) return;
                    const obAlloc = Number((v as any).openingBalanceAllocated) || 0;
                    totalConsumedFromOB += obAlloc;
                    if (obAlloc > 0) {
                        const no = v.voucherNumber ?? v.voucher_number ?? '';
                        if (no) openingBalanceLinkedVoucherNos.push(no);
                    }
                });
                totalAllocatedToOB += totalConsumedFromOB;
            }
            openingBalanceOutstanding = Math.max(0, obAmount - totalAllocatedToOB);
            openingBalanceLinkedVoucherNos = Array.from(new Set(openingBalanceLinkedVoucherNos));
            }
        }
        if ((context === 'account' || context === 'tax') && openingBalanceOutstanding === undefined) {
            openingBalanceOutstanding = Math.max(0, Math.abs(openingBalanceForPeriod));
            openingBalanceLinkedVoucherNos = [];
        }

        return {
            processedTransactions: withBalance,
            daybookTransactions: withBalance,
            totalTransactions,
            openingBalanceForPeriod,
            periodDr,
            periodCr,
            closingBalance: closing,
            daybookSummary,
            openingBalanceOutstanding,
            openingBalanceLinkedVoucherNos,
        };

  }, [entity, context, vouchers, dateRange, stockView, entityList, passedTransactions, transactionContext, filters, voucherTypes, formatDate, formatDateBS, journalAccountNames, userNames, formatCurrency]);

  return result;
}
