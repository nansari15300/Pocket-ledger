
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useRef, useCallback } from "react";
import { collectionGroup, query, where, onSnapshot, orderBy, collection, DocumentData, Query, getDoc, getDocs, getDocFromServer, doc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import usePermissions from "./usePermissions";
import type { Party, Group } from "@/components/party/types";
import type { Staff, StaffGroup } from "@/components/staff/types";
import type { Account, AccountGroup } from "@/components/bank-cash/types";
import type { Tax, TaxGroup } from "@/components/tax/types";
import type { ExpenseAccount, ExpenseGroup } from "@/components/expenses/types";
import type { Item, ItemGroup } from "@/components/items/types";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";
import { getAllocatedByVoucherId, getAllocatedByVoucherIdFromPaymentOuts, getPaymentStatus as getPaymentStatusResult } from "@/lib/payment-allocation-utils";

// --- Report-only party IDs: show only in reports, never in voucher/entity dropdowns or lists ---
export const REPORT_ONLY_PARTY_IDS = ["owners_capital", "opening_balance_ledger"] as const;
// --- System accounts hidden from party/account dropdowns in vouchers (Sale, Purchase, etc.) ---
const PARTY_SELECTION_HIDDEN_IDS = ["sales_account", "purchase_account"] as const;

// --- Types ---
type ProcessedParty = Party & { debit: number; credit: number; balance: number; isSystemAccount?: boolean };
export type ProcessedStaff = Staff & { debit: number; credit: number; balance: number };
export type ProcessedAccount = Account & { debit: number; credit: number; balance: number };
type ProcessedTax = Tax & { debit: number; credit: number; balance: number };
type ProcessedItem = Item & { stockInQty?: number, stockOutQty?: number, stockQty?: number; displayStockQty?: number; };
type ProcessedItemGroup = ItemGroup & { debit: number; credit: number; balance: number; };
type ProcessedGroup = Group & { debit: number; credit: number; balance: number; };
type ProcessedAccountGroup = AccountGroup & { debit: number; credit: number; balance: number; };
export type ProcessedStaffGroup = StaffGroup & { debit: number; credit: number; balance: number; };
type ProcessedTaxGroup = TaxGroup & { debit: number; credit: number; balance: number; };
type ProcessedExpenseAccount = ExpenseAccount & { debit: number; credit: number; balance: number; };
type ProcessedExpenseGroup = ExpenseGroup & { debit: number; credit: number; balance: number; };

type VoucherContextType = {
  vouchers: any[];
  loading: boolean;
  processedParties: ProcessedParty[];
  /** Parties for dropdowns/lists only; excludes Opening Balance & Owner's Capital (report-only). */
  processedPartiesForSelection: ProcessedParty[];
  processedStaff: ProcessedStaff[];
  processedAccounts: ProcessedAccount[];
  processedTaxes: ProcessedTax[];
  expenseAccounts: ExpenseAccount[];
  processedItems: ProcessedItem[];
  processedItemGroups: ProcessedItemGroup[];
  processedGroups: ProcessedGroup[];
  processedAccountGroups: ProcessedAccountGroup[];
  processedStaffGroups: ProcessedStaffGroup[];
  processedTaxGroups: ProcessedTaxGroup[];
  processedExpenseAccounts: ProcessedExpenseAccount[];
  processedExpenseGroups: ProcessedExpenseGroup[];
  journalAccountNames: Record<string, string>;
  userNames: Record<string, string>;
  /** Overdue sale/purchase transactions across all parties (for "Overdue Vouchers" view). */
  overdueTransactions: Array<{ id: string; type: string; date: any; voucherNumber: string; partyId: string; partyName: string; total: number; outstanding: number; debit: number; credit: number; dueDate?: any; isOverdue: boolean; paymentStatus: string; userId?: string; narration?: string }>;
  hasOverdueTransactions: boolean;
};

const VoucherContext = createContext<VoucherContextType>({
  vouchers: [],
  loading: true,
  processedParties: [],
  processedPartiesForSelection: [],
  processedStaff: [],
  processedAccounts: [],
  processedTaxes: [],
  expenseAccounts: [],
  processedItems: [],
  processedItemGroups: [],
  processedGroups: [],
  processedAccountGroups: [],
  processedStaffGroups: [],
  processedTaxGroups: [],
  processedExpenseAccounts: [],
  processedExpenseGroups: [],
  journalAccountNames: {},
  userNames: {},
  overdueTransactions: [],
  hasOverdueTransactions: false,
});

// Helper for generic state setters
type StateSetter<T> = React.Dispatch<React.SetStateAction<T[]>>;

export const VoucherProvider = ({ children }: { children: ReactNode }) => {
  const { companyId, company, clearCompanyId } = useCompany();
  const { user, customUser, loading: authLoading } = useAuth();
  const { can } = usePermissions();

  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Apply View Own / View All Records: show only own vouchers when user doesn't have view_all_records
  const viewAllRecords = can("view_all_records");
  const vouchersForDisplay = useMemo(() => {
    if (viewAllRecords) return vouchers;
    if (!user?.uid) return [];
    return vouchers.filter((v) => v.userId === user.uid);
  }, [vouchers, viewAllRecords, user?.uid]);
  
  const [parties, setParties] = useState<Party[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [unprocessedExpenseAccounts, setUnprocessedExpenseAccounts] = useState<ExpenseAccount[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [accountGroups, setAccountGroups] = useState<AccountGroup[]>([]);
  const [staffGroups, setStaffGroups] = useState<StaffGroup[]>([]);
  const [taxGroups, setTaxGroups] = useState<TaxGroup[]>([]);
  const [expenseGroups, setExpenseGroups] = useState<ExpenseGroup[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [journalAccountNames, setJournalAccountNames] = useState<Record<string, string>>({});

  // Pre-fill current user name so transaction User column shows correctly (no fetch delay)
  useEffect(() => {
    if (!user?.uid) return;
    const name = customUser?.displayName || user.displayName || user.email || "You";
    setUserNames((prev) => (prev[user.uid] === name ? prev : { ...prev, [user.uid]: name }));
  }, [user?.uid, user?.displayName, user?.email, customUser?.displayName]);

  const previousData = useRef<Omit<VoucherContextType, 'loading'>>({
      vouchers: [],
      processedParties: [],
      processedPartiesForSelection: [],
      processedStaff: [],
      processedAccounts: [],
      processedTaxes: [],
      expenseAccounts: [],
      processedItems: [],
      processedItemGroups: [],
      processedGroups: [],
      processedAccountGroups: [],
      processedStaffGroups: [],
      processedTaxGroups: [],
      processedExpenseAccounts: [],
      processedExpenseGroups: [],
      journalAccountNames: {},
      userNames: {},
  });

  // --- Data Fetching Logic ---
  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    const resetAllStates = () => {
      setVouchers([]); setParties([]); setStaff([]); setAccounts([]);
      setTaxes([]); setUnprocessedExpenseAccounts([]); setItems([]);
      setItemGroups([]); setGroups([]); setAccountGroups([]);
      setStaffGroups([]); setTaxGroups([]); setExpenseGroups([]);
    };

    // सिंक पेन्डिङ भए वा कम्पनी अपूर्ण भए listener नलगाउने (permission denied रोक्न)। ownerId मिल्यो भने ownerEmail नभए पनि लगाउँछौं।
    const isCompanyReady = company?.ownerId === user?.uid || !!company?.ownerEmail || (!!user?.email && (company?.sharedWithEmails ?? []).includes(user.email));
    if (!companyId || !user || !isCompanyReady) {
      resetAllStates();
      setLoading(false);
      return;
    }

    // ४. कम्पनी को Firestore doc अस्तित्वमा छ कि छैन जाँच गर्ने (नभए rules ले subcollection deny गर्छ — यहीले permission error रोक्छ)
    let cancelled = false;
    const unsubRef = { current: [] as (() => void)[] };

    const companyRef = doc(firestore, "companies", companyId);
    // Server बाट मात्र जाँच गर्ने (cache ले नयाँ company नभए पनि true दिएर listener लगाउन रोक्न)
    getDocFromServer(companyRef).then((snap) => {
      if (cancelled) return;
      if (!snap.exists()) {
        console.log("Company doc not in Firestore yet... skipping listeners.");
        setLoading(false);
        resetAllStates();
        return;
      }
      const data = snap.data();
      const docOwnerId = data?.ownerId ?? '';
      const docOwnerEmail = (data?.ownerEmail ?? '').toString().toLowerCase().trim();
      const userEmail = (user?.email ?? '').toLowerCase().trim();
      const sharedEmails: string[] = (data?.sharedWithEmails ?? []).map((e: string) => String(e).toLowerCase().trim());
      const isOwner = docOwnerId === user?.uid || docOwnerEmail === userEmail;
      const isShared = userEmail && sharedEmails.includes(userEmail);
      if (!isOwner && !isShared) {
        console.log("Company doc owner mismatch or not shared with user... skipping listeners.");
        setLoading(false);
        resetAllStates();
        return;
      }
      if (vouchers.length === 0) setLoading(true);

      // Auth token लाई Firestore Listen request मा लग्न अलि ढिला (PERMISSION_DENIED कम गर्न)
      const attachListeners = () => {
        if (cancelled) return;
      // Using explicit types for config to avoid @ts-ignore
      const collectionsToFetch: { 
        path: string; 
        setter: StateSetter<any>; 
        isGroup?: boolean; 
        orderByField?: string 
    }[] = [
      { path: 'vouchers', setter: setVouchers, isGroup: false, orderByField: 'date' },
      { path: 'parties', setter: setParties },
      { path: 'staff', setter: setStaff },
      { path: 'bank_accounts', setter: setAccounts },
      { path: 'taxes', setter: setTaxes },
      { path: 'expense_accounts', setter: setUnprocessedExpenseAccounts },
      { path: 'items', setter: setItems },
      { path: 'item_groups', setter: setItemGroups },
      { path: 'groups', setter: setGroups },
      { path: 'account_groups', setter: setAccountGroups },
      { path: 'staff_groups', setter: setStaffGroups },
      { path: 'tax_groups', setter: setTaxGroups },
      { path: 'expense_groups', setter: setExpenseGroups },
    ];

      const unsubscribers = collectionsToFetch.map(({ path, setter, isGroup, orderByField }) => {
        const q = isGroup
          ? query(collectionGroup(firestore, path), where("companyId", "==", companyId))
          : query(collection(firestore, `companies/${companyId}/${path}`));
        return onSnapshot(q, (snapshot) => {
          if (cancelled) return;
          const data = snapshot.docs
            .map((d) => ({ ...d.data(), id: d.id }))
            .filter((item: any) => item.isDeleted !== true);
          if (orderByField) {
            data.sort((a: any, b: any) => {
              const dateA = a[orderByField]?.toDate ? a[orderByField].toDate() : new Date(a[orderByField]);
              const dateB = b[orderByField]?.toDate ? b[orderByField].toDate() : new Date(b[orderByField]);
              return dateA.getTime() - dateB.getTime();
            });
          }
          setter(data);
        }, (error: any) => {
          try {
            if (error?.code === 'unavailable' || error?.code === 'deadline-exceeded' || error?.message?.includes('network')) {
              return;
            }
            // PERMISSION_DENIED: Owner भए companyId clear नगर्ने (Settings लूप रोक्न; rules/auth timing को कारण पनि deny आउन सक्छ)।
            if (error?.code === 'permission-denied' || error?.code === 'PERMISSION_DENIED' || (error?.message && String(error.message).includes('permission'))) {
              console.warn(`[PERMISSION_DENIED TRACK] source=useVouchers path=companies/${companyId}/${path}`, { companyId, path, code: error?.code });
              const isOwner = company?.ownerId === user?.uid || (!!company?.ownerEmail && !!user?.email && company.ownerEmail.toLowerCase().trim() === user.email.toLowerCase().trim());
              if (!isOwner) {
                console.warn(`[Firestore] PERMISSION_DENIED for path: companies/${companyId}/${path}. Clearing invalid company selection.`, { companyId, path });
                try { clearCompanyId(); } catch (_) {}
              } else {
                console.warn(`[Firestore] PERMISSION_DENIED for path: companies/${companyId}/${path}. You are owner – check Firestore rules deploy or auth.`, { companyId, path });
              }
              return;
            }
            console.error(`Error fetching ${path}:`, error?.message || error);
            errorEmitter.emit('permission-error', new FirestorePermissionError({
              path: `companies/${companyId}/${path}`,
              operation: 'list'
            }));
          } catch (_) {}
        });
      });
      unsubRef.current = unsubscribers;

      const initialFetches = collectionsToFetch.map(({ path, isGroup }) =>
        new Promise((resolve) => {
          const q = isGroup
            ? query(collectionGroup(firestore, path), where("companyId", "==", companyId))
            : query(collection(firestore, `companies/${companyId}/${path}`));
          const unsub = onSnapshot(q, () => { unsub(); resolve(true); }, (err: any) => {
            if (err?.code === 'permission-denied' || err?.code === 'PERMISSION_DENIED' || String(err?.message || '').includes('permission')) {
              console.warn('[PERMISSION_DENIED TRACK] source=useVouchers initialFetches path=companies/' + companyId + '/' + path, { companyId, path });
            }
            resolve(true);
          });
        })
      );
      Promise.all(initialFetches).then(() => { if (!cancelled) setLoading(false); });
      };
      // 600ms delay so auth token is attached to Listen request (reduces PERMISSION_DENIED on first load)
      setTimeout(attachListeners, 600);
    }).catch(() => { if (!cancelled) setLoading(false); });

    return () => {
      cancelled = true;
      unsubRef.current.forEach(u => u());
      unsubRef.current = [];
    };
  }, [companyId, company, user, authLoading]);
  
  const fetchAccountName = useCallback(async (accountId: string): Promise<string> => {
    if (!companyId || !accountId) return 'Unknown Account';
    
    // Check local state cache first
    if (journalAccountNames[accountId]) return journalAccountNames[accountId];

    const collectionsToSearch = ['parties', 'bank_accounts', 'staff', 'items', 'expense_accounts', 'taxes', 'users'];
    const nameFields = ['name', 'accountName', 'name', 'name', 'name', 'name', 'displayName'];

    for (let i = 0; i < collectionsToSearch.length; i++) {
        const collectionName = collectionsToSearch[i];
        const nameField = nameFields[i];
        try {
            if (collectionName === 'users') {
                // User doc ID may be name_uid; look up by uid field
                const q = query(collection(firestore, 'users'), where('uid', '==', accountId));
                const snap = await getDocs(q);
                const d = snap.docs[0]?.data();
                if (d) return d[nameField] || 'Unknown';
            } else {
                const docRef = doc(firestore, `companies/${companyId}/${collectionName}`, accountId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const name = docSnap.data()?.[nameField] || 'Unknown';
                    return name;
                }
            }
        } catch (error) {}
    }
    
    return 'Unknown Account';
}, [companyId, journalAccountNames]);


  useEffect(() => {
    const fetchAllNames = async () => {
        if (!vouchersForDisplay.length) return;

        const idsToFetch = new Set<string>();
        const userIdsToFetch = new Set<string>();
        
        vouchersForDisplay.forEach(v => {
            if (v.userId) userIdsToFetch.add(v.userId);
            const accountFields = ['partyId', 'accountId', 'fromAccountId', 'toAccountId', 'staffId', 'taxAccountId', 'incomeAccountId', 'expenseAccountId'];
            accountFields.forEach(field => {
                if (v[field]) idsToFetch.add(v[field]);
            });
            (v.entries || []).forEach((e: any) => { if (e.accountId) idsToFetch.add(e.accountId) });
        });

        const newAccountNames: Record<string, string> = {};
        for (const id of Array.from(idsToFetch)) {
            if (!journalAccountNames[id]) {
                newAccountNames[id] = await fetchAccountName(id);
            }
        }
        
        const newUserNames: Record<string, string> = {};
        // First, learn names directly from vouchers themselves (works even when users query is restricted).
        vouchersForDisplay.forEach((v: any) => {
            const uid = v?.userId;
            const fromVoucher = v?.userDisplayName || v?.userName || null;
            if (!uid || !fromVoucher) return;
            if (fromVoucher !== "Unknown" && fromVoucher !== "N/A") {
                newUserNames[uid] = fromVoucher;
            }
        });

        // Bulk preload user names once (more reliable for shared users than per-uid queries).
        const bulkUserNameByUid: Record<string, string> = {};
        try {
            const allUsersSnap = await getDocs(collection(firestore, "users"));
            allUsersSnap.docs.forEach((d) => {
                const data = d.data() as any;
                const uid = (data?.uid as string) || d.id;
                const email = typeof data?.email === "string" ? data.email : "";
                const emailPrefix = email.includes("@") ? email.split("@")[0] : "";
                const name = data?.displayName || data?.name || emailPrefix || null;
                if (uid && name && name !== "Unknown" && name !== "N/A") {
                    bulkUserNameByUid[uid] = name;
                }
            });
        } catch {
            // ignore; fallback paths below still run
        }

        const currentUserName = user ? (customUser?.displayName || user.displayName || user.email || "You") : "";
        for (const uid of Array.from(userIdsToFetch)) {
            // Refetch if missing, Unknown, or N/A
            if ((!userNames[uid] || userNames[uid] === "Unknown" || userNames[uid] === "N/A") && !newUserNames[uid]) {
                if (bulkUserNameByUid[uid]) {
                    newUserNames[uid] = bulkUserNameByUid[uid];
                    continue;
                }
                if (uid === user?.uid && currentUserName) {
                    newUserNames[uid] = currentUserName;
                    continue;
                }
                // Company metadata fallback (works for shared users without global users query access).
                const ownerEmail = (company as any)?.ownerEmail as string | undefined;
                const ownerPrefix = ownerEmail?.includes("@") ? ownerEmail.split("@")[0] : "";
                if (uid === (company as any)?.ownerId && ownerPrefix) {
                    newUserNames[uid] = ownerPrefix;
                    continue;
                }
                const sharedUser = ((company as any)?.sharedWith || []).find((su: any) => su?.uid === uid);
                if (sharedUser?.name) {
                    newUserNames[uid] = String(sharedUser.name);
                    continue;
                }
                try {
                    // User doc ID may be name_uid (e.g. manishshah46_AaCbiR708nhGe28Ltf217YZzpNv1), so query by uid field first
                    const q = query(collection(firestore, "users"), where("uid", "==", uid));
                    const snap = await getDocs(q);
                    let data = snap.docs[0]?.data();
                    
                    if (!data) {
                        // Fallback 1: doc ID might be uid (legacy)
                        const docSnap = await getDoc(doc(firestore, "users", uid));
                        if (docSnap.exists()) {
                            data = docSnap.data();
                        } else {
                            // Fallback 2: doc ID might be name_uid format - try to find by searching all docs ending with uid
                            // This is expensive, so only do if needed
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
                    
                    const displayName = data?.displayName;
                    const email = typeof data?.email === "string" ? data.email : "";
                    const emailPrefix = email.includes("@") ? email.split("@")[0] : "";
                    let userName = displayName || data?.name || emailPrefix || null;

                    // If detected value still looks like raw UID, use email prefix if possible.
                    if (userName) {
                        const isUIDPattern = userName.length > 15 && /^[a-zA-Z0-9_-]+$/.test(userName) && !userName.includes("@") && !userName.includes(" ");
                        if (isUIDPattern && emailPrefix) {
                            userName = emailPrefix;
                        }
                    }

                    if (userName && userName !== "Unknown" && userName !== "N/A") {
                        newUserNames[uid] = userName;
                    }
                } catch (e) {
                    // On error, don't store anything - let local fetch handle it
                }
            }
        }

        if (Object.keys(newAccountNames).length > 0) {
            setJournalAccountNames(prev => ({ ...prev, ...newAccountNames }));
        }
        if (Object.keys(newUserNames).length > 0) {
            setUserNames(prev => ({ ...prev, ...newUserNames }));
        }
    };

    fetchAllNames();
}, [vouchersForDisplay, fetchAccountName, journalAccountNames, userNames, company, user, customUser]);


  // --- Optimization: Calculate Aggregates ONCE ---
  // This replaces the nested loops. We loop vouchers once and build Maps.
  const voucherAggregates = useMemo(() => {
    const partyMap = new Map<string, { debit: number; credit: number }>();
    const staffMap = new Map<string, { debit: number; credit: number }>();
    const accountMap = new Map<string, { debit: number; credit: number }>();
    const taxMap = new Map<string, { debit: number; credit: number }>();
    const expenseMap = new Map<string, { debit: number; credit: number }>();
    
    // For items, we need specific stock tracking
    const itemMap = new Map<string, { debit: number; credit: number; stockIn: number; stockOut: number }>();

    // Helper to safely add to map
    const addVal = (map: Map<string, any>, id: string, type: 'debit' | 'credit', val: number) => {
        if (!id) return;
        const current = map.get(id) || { debit: 0, credit: 0, stockIn: 0, stockOut: 0 };
        if (type === 'debit') current.debit += val;
        else current.credit += val;
        map.set(id, current);
    };

    // Pre-create Item Map for faster Unit Conversion lookup inside the loop
    const itemConfigMap = new Map<string, Item>();
    items.forEach(i => itemConfigMap.set(i.id, i));

    vouchersForDisplay.forEach(v => {
        const amount = Number(v.amount || v.total || 0);
        const subTotal = Number(v.subTotal || amount);

        // --- Staff Logic ---
        if (v.type === "journal" && v.subType === "add_salary" && Array.isArray(v.entries)) {
            v.entries.forEach((entry: any) => {
                const isStaff = staff.some(s => s.id === entry.accountId);
                if (isStaff) {
                  addVal(staffMap, entry.accountId, 'credit', Number(entry.credit || 0));
                }
            });
        } else if (v.staffId) {
            if (v.type === "payment_out") {
                addVal(staffMap, v.staffId, 'debit', amount);
            } else if (v.type === "payment_in") {
                addVal(staffMap, v.staffId, 'credit', amount);
            }
        }
        
        // --- Party Logic ---
        if (v.partyId) {
            if (["sale", "payment_out", "direct_income"].includes(v.type)) {
                addVal(partyMap, v.partyId, 'debit', amount);
            } else if (["purchase", "payment_in", "direct_expense"].includes(v.type)) {
                addVal(partyMap, v.partyId, 'credit', amount);
            }
        }

        // --- System Accounts (Sales/Purchase) Double Entry ---
        if (v.type === "sale") {
            addVal(expenseMap, 'sales_account', 'credit', subTotal); // Sales Account Credit
        } else if (v.type === "purchase") {
            addVal(expenseMap, 'purchase_account', 'debit', subTotal); // Purchase Account Debit
        }

        // --- Account Logic ---
        const fromAccId = v.fromAccountId || v.accountId;
        if (fromAccId) {
             if (['payment_in', 'direct_income', 'sale'].includes(v.type)) addVal(accountMap, fromAccId, 'debit', amount);
             else if (['payment_out', 'direct_expense', 'purchase'].includes(v.type)) addVal(accountMap, fromAccId, 'credit', amount);
        }
        
        // Contra Logic for Accounts
        if (v.type === 'contra') {
            if (v.toAccountId) addVal(accountMap, v.toAccountId, 'debit', amount);
            if (v.fromAccountId) addVal(accountMap, v.fromAccountId, 'credit', amount);
        }

        // --- Tax Logic ---
        if (v.taxAccountId) {
             if (v.type === 'payment_out') addVal(taxMap, v.taxAccountId, 'debit', amount);
             else if (v.type === 'payment_in') addVal(taxMap, v.taxAccountId, 'credit', amount);
        }

        // --- Direct Expense/Income (Expense Accounts) ---
        if (v.type === "direct_income" && v.incomeAccountId) {
            addVal(expenseMap, v.incomeAccountId, 'credit', amount);
        } else if (["direct_expense"].includes(v.type)) {
            const toAccId = v.toAccountId || v.expenseAccountId;
            if (toAccId) addVal(expenseMap, toAccId, 'debit', amount);
        }

        // --- Line Items (For Tax & Items) ---
        if (v.lineItems && Array.isArray(v.lineItems)) {
            v.lineItems.forEach((line: any) => {
                // Line Tax
                if (line.taxAccountId && line.taxAmount) {
                      const tAmt = Number(line.taxAmount);
                      if (v.type === 'purchase') addVal(taxMap, line.taxAccountId, 'debit', tAmt);
                      else if (v.type === 'sale') addVal(taxMap, line.taxAccountId, 'credit', tAmt);
                }

                // --- Item Stock Logic ---
                if (line.itemId) {
                    const item = itemConfigMap.get(line.itemId);
                    if (item) {
                        const current = itemMap.get(line.itemId) || { debit: 0, credit: 0, stockIn: 0, stockOut: 0 };
                        const qty = Number(line.quantity) || 0;
                        const rate = Number(line.rate) || 0;
                        const lineAmount = qty * rate;

                        if (v.type === 'purchase') current.debit += lineAmount;
                        if (v.type === 'sale') {
                           current.credit += v.totalPurchasePrice && v.totalPurchasePrice > 0 ? v.totalPurchasePrice : (qty * (item.purchasePrice || rate));
                        }

                        const conversions = (item.unitConversions || []) as any[];
                        const smallestUnit = conversions.length > 0 ? conversions[conversions.length - 1].toUnit : ((item as any).openingBalanceUnit || '');
                        
                        // Helper to get factor (inline to access closures)
                        let factor = 1;
                        if (line.unit && line.unit !== smallestUnit) {
                            let currentUnit = line.unit;
                             // Basic loop to find path to smallest unit. 
                             // Optimized: assuming direct chain for now or simple list match
                             // Logic: If I have 1 Box, and 1 Box = 10 Pcs (Base). Factor is 10.
                             // Loop: Find conversion where fromUnit == currentUnit. 
                             let found = false;
                             // Limit loop to prevent infinite
                             for(let k=0; k<10; k++) {
                                 const conv = conversions.find((c:any) => c.fromUnit === currentUnit);
                                 if(!conv) break;
                                 factor *= Number(conv.conversionFactor) || 1;
                                 currentUnit = conv.toUnit;
                                 if(currentUnit === smallestUnit) {
                                     found = true;
                                     break;
                                 }
                             }
                        }

                        const standardizedQty = qty * factor;

                        if (v.type === 'purchase') current.stockIn += standardizedQty;
                        if (v.type === 'sale') current.stockOut += standardizedQty;

                        itemMap.set(line.itemId, current);
                    }
                }
            });
        }

        // --- Journal Entries ---
        if (v.type === "journal" && Array.isArray(v.entries)) {
            v.entries.forEach((entry: any) => {
                const d = Number(entry.debit || 0);
                const c = Number(entry.credit || 0);
                if (entry.accountId) {
                    addVal(partyMap, entry.accountId, 'debit', d); addVal(partyMap, entry.accountId, 'credit', c);
                    if (v.subType !== 'add_salary') { // Corrected: only apply to non-salary journals
                       addVal(staffMap, entry.accountId, 'debit', d); addVal(staffMap, entry.accountId, 'credit', c);
                    }
                    addVal(accountMap, entry.accountId, 'debit', d); addVal(accountMap, entry.accountId, 'credit', c);
                    addVal(taxMap, entry.accountId, 'debit', d); addVal(taxMap, entry.accountId, 'credit', c);
                    addVal(expenseMap, entry.accountId, 'debit', d); addVal(expenseMap, entry.accountId, 'credit', c);
                }
            });
        }
    });

    return { partyMap, staffMap, accountMap, taxMap, expenseMap, itemMap };
  }, [vouchersForDisplay, items, staff]); // Added items dependency so itemMap rebuilds if items change


 const processedParties: ProcessedParty[] = useMemo(() => {
    // Return early if the necessary data isn't loaded yet.
    if (loading || !parties || !unprocessedExpenseAccounts) {
        return previousData.current.processedParties || [];
    }
    const regularParties = parties.map(p => {
        const stats = voucherAggregates.partyMap.get(p.id) || { debit: 0, credit: 0 };
        // For Opening Balance ledger, balance should equal openingBalance (no transactions)
        const isOpeningBalanceLedger = p.id === 'opening_balance_ledger';
        const balance = isOpeningBalanceLedger 
          ? (Number(p.openingBalance) || 0)
          : (Number(p.openingBalance) || 0) + stats.debit - stats.credit;
        return {
            ...p,
            openingBalance: Number(p.openingBalance) || 0, // Preserve openingBalance field
            debit: isOpeningBalanceLedger ? (balance > 0 ? balance : 0) : stats.debit,
            credit: isOpeningBalanceLedger ? (balance < 0 ? Math.abs(balance) : 0) : stats.credit,
            balance,
            isSystemAccount: (p as any).isSystemReserved || (p as any).isSystemAccount || false,
        };
    }).filter(p => !p.isDeleted);
    
    const systemIds = ['sales_account', 'purchase_account'];
    const systemParties = systemIds.map(id => {
        const stats = voucherAggregates.expenseMap.get(id) || { debit: 0, credit: 0 };
        const originalAcc = unprocessedExpenseAccounts.find(a => a.id === id);
        return {
            id,
            name: originalAcc?.name || (id === 'sales_account' ? 'Sales Account' : 'Purchase Account'),
            groupId: id === 'sales_account' ? 'income' : 'expenses',
            debit: stats.debit,
            credit: stats.credit,
            balance: stats.debit - stats.credit,
            isSystemAccount: (originalAcc as any)?.isSystemReserved || true
        } as ProcessedParty;
    }).filter(sp => sp.debit !== 0 || sp.credit !== 0);

    return [...regularParties, ...systemParties];
}, [parties, voucherAggregates.partyMap, voucherAggregates.expenseMap, unprocessedExpenseAccounts, loading]);

  const processedPartiesForSelection: ProcessedParty[] = useMemo(
    () => processedParties.filter(
      (p) => !REPORT_ONLY_PARTY_IDS.includes(p.id as any) && !PARTY_SELECTION_HIDDEN_IDS.includes(p.id as any)
    ),
    [processedParties]
  );

  const { overdueTransactions, hasOverdueTransactions } = useMemo(() => {
    const allocatedBySale = getAllocatedByVoucherId(vouchersForDisplay);
    const allocatedByPurchase = getAllocatedByVoucherIdFromPaymentOuts(vouchersForDisplay);
    const partyNameById = new Map(processedParties.map((p) => [p.id, p.name]));
    const list: Array<{ id: string; type: string; date: any; voucherNumber: string; partyId: string; partyName: string; total: number; outstanding: number; debit: number; credit: number; dueDate?: any; isOverdue: boolean; paymentStatus: string; userId?: string; narration?: string }> = [];
    for (const v of vouchersForDisplay) {
      if ((v.type !== "sale" && v.type !== "purchase") || !v.partyId) continue;
      const total = Number(v.total ?? v.amount ?? ((v.subTotal ?? 0) - (v.discount ?? 0) + (v.tax ?? 0))) || 0;
      const fromPayments = v.type === "sale" ? (allocatedBySale.get(v.id) ?? 0) : (allocatedByPurchase.get(v.id) ?? 0);
      const fromOB = Number(v.openingBalanceAllocated) || 0;
      const allocated = fromPayments + fromOB;
      const result = getPaymentStatusResult(total, allocated, v.dueDate);
      if (!result.isOverdue) continue;
      const partyName = partyNameById.get(v.partyId) ?? v.partyId;
      const outstanding = result.outstanding;
      const debit = v.type === "sale" ? outstanding : 0;
      const credit = v.type === "purchase" ? outstanding : 0;
      list.push({
        id: v.id,
        type: v.type,
        date: v.date,
        voucherNumber: v.voucherNumber ?? v.id,
        partyId: v.partyId,
        partyName,
        total,
        outstanding,
        debit,
        credit,
        dueDate: v.dueDate,
        isOverdue: true,
        paymentStatus: "overdue",
        userId: v.userId,
        narration: (v as any).narration,
      });
    }
    return { overdueTransactions: list, hasOverdueTransactions: list.length > 0 };
  }, [vouchersForDisplay, processedParties]);

  const processedStaff: ProcessedStaff[] = useMemo(() => {
    return staff.map(s => {
        const stats = voucherAggregates.staffMap.get(s.id) || { debit: 0, credit: 0 };
        return {
            ...s,
            openingBalance: Number(s.openingBalance) || 0,
            debit: stats.debit,
            credit: stats.credit,
            balance: (Number(s.openingBalance) || 0) + stats.debit - stats.credit
        };
    }).filter(s => !s.isDeleted);
  }, [staff, voucherAggregates.staffMap]);

  const processedAccounts: ProcessedAccount[] = useMemo(() => {
    return accounts.map(a => {
        const stats = voucherAggregates.accountMap.get(a.id) || { debit: 0, credit: 0 };
        return {
            ...a,
            debit: stats.debit,
            credit: stats.credit,
            balance: (Number(a.openingBalance) || 0) + stats.debit - stats.credit
        };
    }).filter(a => !a.isDeleted);
  }, [accounts, voucherAggregates.accountMap]);

  const processedTaxes: ProcessedTax[] = useMemo(() => {
    return taxes.map(t => {
        const stats = voucherAggregates.taxMap.get(t.id) || { debit: 0, credit: 0 };
        return {
            ...t,
            debit: stats.debit,
            credit: stats.credit,
            balance: (Number(t.openingBalance) || 0) + stats.debit - stats.credit
        };
    }).filter(t => !t.isDeleted);
  }, [taxes, voucherAggregates.taxMap]);

  const processedExpenseAccounts: ProcessedExpenseAccount[] = useMemo(() => {
    return unprocessedExpenseAccounts.map(e => {
        const stats = voucherAggregates.expenseMap.get(e.id) || { debit: 0, credit: 0 };
        return {
            ...e,
            debit: stats.debit,
            credit: stats.credit,
            balance: (Number((e as any).openingBalance) || 0) + stats.debit - stats.credit
        };
    }).filter(e => !e.isDeleted);
  }, [unprocessedExpenseAccounts, voucherAggregates.expenseMap]);
  
  const expenseAccounts = processedExpenseAccounts;

  // --- Item Processing ---
  // Using the pre-calculated itemMap from aggregates
  const processedItems: ProcessedItem[] = useMemo(() => {
    return items.map(item => {
        const stats = voucherAggregates.itemMap.get(item.id) || { debit: 0, credit: 0, stockIn: 0, stockOut: 0 };
        const newItem: ProcessedItem = { ...item, ...stats }; // Copy stats directly

        const conversions = (item.unitConversions || []) as any[];
        const smallestUnit = conversions.length > 0 ? conversions[conversions.length - 1].toUnit : ((item as any).openingBalanceUnit || '');
        
        const getFactor = (unit: string) => {
             if (!unit || conversions.length === 0) return 1;
             if (unit === smallestUnit) return 1;
             let factor = 1;
             let currentUnit = unit;
             for (let i=0; i < 10; i++) { // safety break
                const conv = conversions.find((c:any) => c.fromUnit === currentUnit);
                if (!conv) return 0; 
                factor *= Number(conv.conversionFactor) || 1;
                currentUnit = conv.toUnit;
                if (currentUnit === smallestUnit) break;
             }
             return factor;
        };
        const openingUnit = (item as any).openingBalanceUnit || (conversions.length > 0 ? conversions[0].fromUnit : "");
        const openingStockInSmallest = (Number(item.openingBalance) || 0) * (openingUnit ? getFactor(openingUnit) : 1);
        
        // Calculate Final Stock Qty
        newItem.stockQty = openingStockInSmallest + (stats.stockIn || 0) - (stats.stockOut || 0);
        
        // Calculate Financial Balance
        newItem.balance = (Number(item.openingBalance) || 0) * (Number(item.openingBalanceRate) || 0) + stats.debit - stats.credit;

        // Calculate Display Qty
        const displayUnitFactor = getFactor((item as any).displayUnit || smallestUnit || '');
        
        newItem.displayStockQty = displayUnitFactor > 0 ? newItem.stockQty / displayUnitFactor : 0;
        
        return newItem;
      });
  }, [items, voucherAggregates.itemMap]); // Only re-run if items or aggregated stats change


  // --- Group Processing (Standard Aggregation) ---
  const processGroups = useCallback((groups: any[], items: any[]) => {
      const groupMap = new Map<string, any>();
      groups.forEach(g => groupMap.set(g.id, { ...g, debit: 0, credit: 0, balance: 0, openingBalance: Number(g.openingBalance || 0) }));

      items.forEach(item => {
          if (item.groupId && groupMap.has(item.groupId)) {
              const g = groupMap.get(item.groupId);
              const isItemGroup = 'purchasePrice' in item;

              if (isItemGroup) {
                // For item groups, balance = opening value + purchase values - cogs
                g.debit += item.debit || 0;
                g.credit += item.credit || 0;
                const itemOpeningValue = (Number(item.openingBalance) || 0) * (Number(item.openingBalanceRate) || 1);
                g.openingBalance += itemOpeningValue;
              } else {
                // For other groups, use standard debit/credit
                g.debit += item.debit || 0;
                g.credit += item.credit || 0;
                g.openingBalance += (Number(item.openingBalance) || 0);
              }
          }
      });
      
      const sortedGroups = [...groupMap.values()].sort((a,b) => (a.parentId ? 1 : -1));
      
      sortedGroups.forEach(g => {
         g.balance = g.openingBalance + g.debit - g.credit; 
      });
      
       sortedGroups.forEach(g => {
         if (g.parentId && groupMap.has(g.parentId)) {
             const parent = groupMap.get(g.parentId);
             parent.debit += g.debit;
             parent.credit += g.credit;
             parent.openingBalance += g.openingBalance;
             parent.balance = parent.openingBalance + parent.debit - parent.credit;
         }
      });

      return Array.from(groupMap.values()).filter(g => !g.isDeleted);
  }, []);

  const processedGroups = useMemo(() => processGroups(groups, processedParties), [groups, processedParties, processGroups]);
  const processedStaffGroups = useMemo(() => processGroups(staffGroups, processedStaff), [staffGroups, processedStaff, processGroups]);
  const processedAccountGroups = useMemo(() => processGroups(accountGroups, processedAccounts), [accountGroups, processedAccounts, processGroups]);
  const processedTaxGroups = useMemo(() => processGroups(taxGroups, processedTaxes), [taxGroups, processedTaxes, processGroups]);
  const processedItemGroups = useMemo(() => processGroups(itemGroups, processedItems), [itemGroups, processedItems, processGroups]);
  const processedExpenseGroups = useMemo(() => processGroups(expenseGroups, processedExpenseAccounts), [expenseGroups, processedExpenseAccounts, processGroups]);

  // Pre-load names from collections (available immediately) so transactions show names, not UIDs
  const journalAccountNamesMerged = useMemo(() => {
    const preloaded: Record<string, string> = {};
    processedParties.forEach((p) => { preloaded[p.id] = p.name; });
    processedAccounts.forEach((a) => { preloaded[a.id] = a.accountName; });
    processedStaff.forEach((s) => { preloaded[s.id] = s.name; });
    processedTaxes.forEach((t) => { preloaded[t.id] = t.name; });
    processedExpenseAccounts.forEach((e) => { preloaded[e.id] = e.name; });
    processedItems.forEach((i) => { preloaded[i.id] = i.name; });
    return { ...preloaded, ...journalAccountNames };
  }, [processedParties, processedAccounts, processedStaff, processedTaxes, processedExpenseAccounts, processedItems, journalAccountNames]);
  
  const value = useMemo(() => {
    const currentData = { 
        vouchers: vouchersForDisplay, 
        loading, 
        processedParties, 
        processedPartiesForSelection, 
        processedStaff, 
        processedAccounts, 
        processedTaxes, 
        expenseAccounts, 
        processedItems, 
        processedItemGroups, 
        processedGroups, 
        processedAccountGroups, 
        processedStaffGroups, 
        processedTaxGroups,
        processedExpenseAccounts,
        processedExpenseGroups,
        journalAccountNames: journalAccountNamesMerged,
        userNames,
        overdueTransactions,
        hasOverdueTransactions,
    };
    
    return currentData;
  }, [
    vouchersForDisplay, loading, processedParties, processedPartiesForSelection, processedStaff, processedAccounts, 
    processedTaxes, expenseAccounts, processedItems, processedItemGroups, 
    processedGroups, processedAccountGroups, processedStaffGroups, processedTaxGroups,
    processedExpenseAccounts, processedExpenseGroups, journalAccountNamesMerged, userNames,
    overdueTransactions, hasOverdueTransactions
  ]);

  // Update ref in useEffect to avoid accessing refs during render
  useEffect(() => {
    if (!loading) {
      previousData.current = value;
    }
  }, [loading, value]);

  // Use state to track the display value to avoid ref access during render
  const [displayValue, setDisplayValue] = useState(() => value);

  useEffect(() => {
    if (loading) {
      setDisplayValue({ ...previousData.current, loading: true });
    } else {
      setDisplayValue(value);
    }
  }, [loading, value]);

  return (
    <VoucherContext.Provider value={displayValue}>
      {children}
    </VoucherContext.Provider>
  );
};

export const useVouchers = () => {
  const context = useContext(VoucherContext);
  if (context === undefined) {
    throw new Error("useVouchers must be used within a VoucherProvider");
  }
  return context;
};

