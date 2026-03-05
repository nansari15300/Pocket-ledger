"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Combobox } from "@/components/ui/combobox";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { GroupDetails } from "@/components/party/GroupDetails";
import { PartyGroupList } from "@/components/party/PartyGroupList";
import { PayeeDetails } from "@/components/payee/PayeeDetails";
import { TaxDetails } from "@/components/tax/TaxDetails";
import { TaxGroupDetails } from "@/components/tax/TaxGroupDetails";
import { StaffGroupDetails } from "@/components/staff/StaffGroupDetails";
import { AccountDetails } from "@/components/bank-cash/AccountDetails";
import { AccountGroupDetails } from "@/components/bank-cash/AccountGroupDetails";
import { ExpenseAccountDetails } from "@/components/expenses/ExpenseAccountDetails";
import { ExpenseGroupDetails } from "@/components/expenses/ExpenseGroupDetails";
import type { Group, Party } from "@/components/party/types";
import { useVouchers } from "@/hooks/useVouchers";
import { useDate } from "@/hooks/useDate";
import type { DateRange } from "@/components/ui/ad-calendar";
import { doc, getDoc, query, collection, getDocs, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { getAllSystemGroupNames } from "@/lib/system-group-names";

type GroupStatementPageProps = {
  onPartySelectionChange?: (isParty: boolean) => void;
};

export default function GroupStatementPage({ onPartySelectionChange }: GroupStatementPageProps) {
  const { formatCurrency, formatDateBS, dateSystem } = useDate();
  const { vouchers: allVouchers, loading: vouchersLoading, processedGroups: initialProcessedGroups, processedParties, processedStaff, processedTaxes, processedAccounts, processedExpenseAccounts, processedItems, processedTaxGroups, processedStaffGroups, processedAccountGroups, processedExpenseGroups, processedItemGroups, journalAccountNames, userNames: vouchersUserNames } = useVouchers();
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const hasAutoSelected = useRef(false);
  const isMobile = useIsMobile();

  const hasDateFilter = !!dateRange?.from || !!dateRange?.to;
  const dateRangeLabel = useMemo(() => {
    if (!hasDateFilter) return "Last 10 Txns";
    const from = dateRange!.from!;
    const to = dateRange!.to || from;
    const fromAD = format(from, "LLL dd, y");
    const toAD = to ? format(to, "LLL dd, y") : fromAD;
    const fromBS = formatDateBS(from);
    const toBS = to ? formatDateBS(to) : fromBS;
    if (dateSystem === "AD") return `AD: ${fromAD}${to !== from ? " to " + toAD : ""}`;
    if (dateSystem === "BS") return `BS: ${fromBS}${to !== from ? " to " + toBS : ""}`;
    return `AD: ${fromAD} to ${toAD} (BS: ${fromBS} to ${toBS})`;
  }, [dateRange, dateSystem, formatDateBS, hasDateFilter]);

  const fetchUserName = useCallback(async (userId: string): Promise<string> => {
    // Check if already fetched
    const existingName = vouchersUserNames?.[userId] || userNames[userId];
    if (existingName && existingName !== "Unknown" && existingName !== "N/A") return existingName;
    
    try {
      // User doc ID may be name_uid format (e.g. manishshah46_AaCbiR708nhGe28Ltf2I7YZzpNv1), so query by uid field first
      const q = query(collection(firestore, "users"), where("uid", "==", userId));
      const snap = await getDocs(q);
      let data = snap.docs[0]?.data();
      
      if (!data) {
        // Fallback 1: doc ID might be uid (legacy)
        const userDoc = await getDoc(doc(firestore, 'users', userId));
        if (userDoc.exists()) {
          data = userDoc.data();
        } else {
          // Fallback 2: doc ID might be name_uid format - try to find by searching all docs ending with uid
          const allUsersSnap = await getDocs(collection(firestore, "users"));
          const matchingDoc = allUsersSnap.docs.find(d => {
            const docData = d.data();
            return docData.uid === userId || d.id.endsWith(userId);
          });
          if (matchingDoc) {
            data = matchingDoc.data();
          }
        }
      }
      
      const displayName = data?.displayName || data?.name || data?.email || null;
      if (displayName && displayName !== userId && displayName !== "Unknown" && displayName !== "N/A") {
        // Check if it's not a UID pattern (long alphanumeric string without spaces/email)
        const isUIDPattern = displayName.length > 15 && /^[a-zA-Z0-9_-]+$/.test(displayName) && !displayName.includes('@') && !displayName.includes(' ');
        if (!isUIDPattern) {
          return displayName;
        }
      }
    } catch (e) {
      console.error('[GroupSummary] Error fetching userName for', userId, e);
    }
    return "N/A";
  }, [vouchersUserNames, userNames]);

  useEffect(() => {
    if (!allVouchers || allVouchers.length === 0) return;
    const uids = new Set(allVouchers.map((t) => t.userId).filter(Boolean) as string[]);
    // Only fetch if not in vouchersUserNames or if it's "Unknown"/"N/A"
    const uidsToFetch = Array.from(uids).filter(uid => {
      const vouchersName = vouchersUserNames?.[uid];
      return !vouchersName || vouchersName === "Unknown" || vouchersName === "N/A";
    });
    
    if (uidsToFetch.length === 0) return;
    
    // Fetch all user names in parallel
    Promise.all(
      uidsToFetch.map(async (uid) => {
        const name = await fetchUserName(uid);
        return { uid, name };
      })
    ).then(results => {
      const newUserNames: Record<string, string> = {};
      results.forEach(({ uid, name }) => {
        // Only store valid names (not "Unknown", not "N/A", not UID)
        if (name && name !== "Unknown" && name !== "N/A" && name !== uid && !name.match(/^[a-zA-Z0-9_-]{20,}$/)) {
          newUserNames[uid] = name;
        }
      });
      if (Object.keys(newUserNames).length > 0) {
        setUserNames((prev) => ({ ...prev, ...newUserNames }));
      }
    });
  }, [allVouchers, vouchersUserNames, fetchUserName]);

  // Process groups - show only user-created groups (not system groups or parent groups)
  // Filter out: isSystemReserved: true, isReportOnly: true, or no parentId
  const processedGroups = useMemo(() => {
    const allSubGroups: (Group | any)[] = [];

    // Helper function to check if a group should be shown (user-created only)
    const systemGroupNames = getAllSystemGroupNames();
    const systemGroupIds = [
      'sundry_debtors', 'sundry_creditors', 'duties_taxes', 
      'loans_liabilities', 'bank_accounts_group', 'cash_in_hand_group',
      'direct_income', 'indirect_income', 'direct_expense', 'indirect_expense',
      'assets', 'liabilities', 'income', 'expenses', 'equity',
      'stock_items', 'services'
    ];
    
    const isUserCreatedGroup = (g: any): boolean => {
      if (!g) return false;
      
      const groupName = String((g as any).name || '').trim();
      const groupId = String((g as any).id || '').trim();
      const parentId = String((g as any).parentId || '').trim();
      
      // FIRST: Check by exact name match (case-insensitive) - these should NEVER appear
      const exactSystemNames = [
        'Party', 
        'Staff', 
        'Tax', 
        'Bank', 
        'Income & Expense', 
        'Income & Expenses', 
        'Bank & Cash',
        'Sundry Debtors', 
        'Sundry Creditors',
        'Assets',
        'Liabilities',
        'Income',
        'Expenses',
        'Equity',
        'Duties & Taxes',
        'Loans & Liabilities',
        'Bank Accounts',
        'Cash-in-Hand',
        'Direct Income',
        'Indirect Income',
        'Direct Expenses',
        'Indirect Expenses',
        'Stock Items',
        'Services',
        'Item'
      ];
      const isExactSystemName = exactSystemNames.some(
        sysName => sysName.toLowerCase() === groupName.toLowerCase()
      );
      if (isExactSystemName) return false;
      
      // SECOND: Check if group name matches any system group name (case-insensitive)
      const isSystemGroupName = systemGroupNames.some(
        sysName => sysName.toLowerCase() === groupName.toLowerCase()
      );
      if (isSystemGroupName) return false;
      
      // THIRD: Check if group ID is a known system group ID
      const isSystemGroupId = systemGroupIds.some(
        sysId => sysId.toLowerCase() === groupId.toLowerCase()
      );
      if (isSystemGroupId) return false;
      
      // FOURTH: Check if parentId is a system group ID (hide children of system groups)
      const isChildOfSystemGroup = systemGroupIds.some(
        sysId => sysId.toLowerCase() === parentId.toLowerCase()
      );
      if (isChildOfSystemGroup) return false;
      
      // FIFTH: Check flags
      const isSystemReserved = (g as any).isSystemReserved === true;
      const isReportOnly = (g as any).isReportOnly === true;
      if (isSystemReserved || isReportOnly) return false;
      
      // SIXTH: Check if it has parentId (top-level groups without parentId should be excluded)
      const hasParentId = !!(g as any).parentId;
      if (!hasParentId) return false;
      
      return true;
    };

    // 1. Party groups - only user-created sub-groups (not system groups like "Party", "Liabilities", etc.)
    // Filter out ALL system groups including "Sundry Debtors" and "Sundry Creditors"
    const partySubGroups = initialProcessedGroups.filter(g => isUserCreatedGroup(g));
    allSubGroups.push(...partySubGroups);

    // 2. Tax groups - filter out system groups
    const userTaxGroups = processedTaxGroups.filter(tg => isUserCreatedGroup(tg));
    allSubGroups.push(...userTaxGroups.map(tg => ({
      ...tg,
      id: tg.id,
      name: tg.name,
      balance: tg.balance || 0,
      debit: tg.debit || 0,
      credit: tg.credit || 0,
      openingBalance: tg.openingBalance || 0,
      companyId: tg.companyId || '',
      type: 'Tax',
      groupType: 'tax' as const,
    })));

    // 3. Staff groups - filter out system groups
    const userStaffGroups = processedStaffGroups.filter(sg => isUserCreatedGroup(sg));
    allSubGroups.push(...userStaffGroups.map(sg => ({
      ...sg,
      id: sg.id,
      name: sg.name,
      balance: sg.balance || 0,
      debit: sg.debit || 0,
      credit: sg.credit || 0,
      openingBalance: sg.openingBalance || 0,
      companyId: sg.companyId || '',
      type: 'Liability',
      groupType: 'staff' as const,
    })));

    // 4. Account groups - filter out system groups
    const userAccountGroups = processedAccountGroups.filter(ag => isUserCreatedGroup(ag));
    allSubGroups.push(...userAccountGroups.map(ag => ({
      ...ag,
      id: ag.id,
      name: ag.name,
      balance: ag.balance || 0,
      debit: ag.debit || 0,
      credit: ag.credit || 0,
      openingBalance: ag.openingBalance || 0,
      companyId: ag.companyId || '',
      type: (ag as any).type || 'Bank',
      groupType: 'account' as const,
    })));

    // 5. Expense groups - filter out system groups
    const userExpenseGroups = processedExpenseGroups.filter(eg => isUserCreatedGroup(eg));
    allSubGroups.push(...userExpenseGroups.map(eg => ({
      ...eg,
      id: eg.id,
      name: eg.name,
      balance: eg.balance || 0,
      debit: eg.debit || 0,
      credit: eg.credit || 0,
      openingBalance: eg.openingBalance || 0,
      companyId: eg.companyId || '',
      type: (eg as any).type || 'Income',
      groupType: 'expense' as const,
    })));

    // 6. Item groups - filter out system groups
    const userItemGroups = processedItemGroups.filter(ig => isUserCreatedGroup(ig));
    allSubGroups.push(...userItemGroups.map(ig => ({
      ...ig,
      id: ig.id,
      name: ig.name,
      balance: ig.balance || 0,
      debit: ig.debit || 0,
      credit: ig.credit || 0,
      openingBalance: ig.openingBalance || 0,
      companyId: ig.companyId || '',
      type: 'Item',
      groupType: 'item' as const,
    })));

    // 7. Add ungrouped parties if any
    const ungrouped = processedParties.filter(p => !p.groupId);
    if (ungrouped.length > 0) {
      const ungroupedBalance = ungrouped.reduce((sum, p) => sum + p.balance, 0);
      const ungroupedGroup: Group = {
        id: 'ungrouped',
        name: 'Ungrouped',
        balance: ungroupedBalance,
        companyId: '',
        debit: ungrouped.reduce((sum, p) => sum + p.debit, 0),
        credit: ungrouped.reduce((sum, p) => sum + p.credit, 0),
      };
      allSubGroups.push(ungroupedGroup);
    }

    return allSubGroups;
  }, [processedParties, initialProcessedGroups, processedTaxGroups, processedStaffGroups, processedAccountGroups, processedExpenseGroups, processedItemGroups]);

  const totalBalance = useMemo(
    () => processedGroups.reduce((sum, g) => sum + (g.balance || 0), 0),
    [processedGroups]
  );

  const partiesForSelectedGroup = useMemo(() => {
    if (!selectedGroup) return [];
    if (selectedGroup.id === 'ungrouped') {
      return processedParties.filter(p => !p.groupId);
    }
    // For staff groups, return empty array (staff groups don't have parties)
    const groupType = (selectedGroup as any).groupType;
    if (groupType === 'staff' || groupType === 'tax' || groupType === 'account' || groupType === 'expense' || groupType === 'item') {
      return [];
    }
    return processedParties.filter(p => p.groupId === selectedGroup.id);
  }, [selectedGroup, processedParties]);

  // Mobile: group dropdown options (entity)
  const groupDropdownOptions = useMemo(() => {
    return processedGroups.map((g) => ({ value: g.id, label: g.name }));
  }, [processedGroups]);

  // Mobile: account dropdown options (members of selected group)
  const accountDropdownOptions = useMemo(() => {
    if (!selectedGroup) return [];
    const groupType = (selectedGroup as any).groupType;
    if (groupType === 'tax') {
      return processedTaxes.filter((t: any) => t.groupId === selectedGroup.id).map((t: any) => ({ value: t.id, label: t.name }));
    }
    if (groupType === 'staff') {
      return processedStaff.filter((s: any) => s.groupId === selectedGroup.id).map((s: any) => ({ value: s.id, label: s.name }));
    }
    if (groupType === 'account') {
      return processedAccounts.filter((a: any) => a.groupId === selectedGroup.id).map((a: any) => ({ value: a.id, label: a.name }));
    }
    if (groupType === 'expense') {
      return processedExpenseAccounts.filter((e: any) => e.groupId === selectedGroup.id).map((e: any) => ({ value: e.id, label: e.name }));
    }
    if (groupType === 'item') {
      return processedItems.filter((i: any) => (i as any).groupId === selectedGroup.id).map((i: any) => ({ value: i.id, label: i.name }));
    }
    // Party groups
    if (selectedGroup.id === 'ungrouped') {
      return processedParties.filter((p: any) => !p.groupId).map((p: any) => ({ value: p.id, label: p.name }));
    }
    return processedParties.filter((p: any) => p.groupId === selectedGroup.id).map((p: any) => ({ value: p.id, label: p.name }));
  }, [selectedGroup, processedParties, processedStaff, processedTaxes, processedAccounts, processedExpenseAccounts, processedItems]);

  const filteredGroups = useMemo(() => {
    return processedGroups.filter((g) =>
      g.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [processedGroups, searchTerm]);

  const REPORT_MEMORY_KEY = "reportGroupStatementState";

  useEffect(() => {
    if (processedGroups.length === 0) return;
    if (hasAutoSelected.current) return;
    hasAutoSelected.current = true;
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(REPORT_MEMORY_KEY) : null;
      const saved = raw ? (JSON.parse(raw) as { groupId?: string }) : null;
      const groupId = saved?.groupId;
      if (groupId) {
        const found = processedGroups.find((g) => g.id === groupId);
        if (found) {
          setSelectedGroup(found as Group);
          return;
        }
      }
    } catch (_) {}
    setSelectedGroup(processedGroups[0] as Group);
  }, [processedGroups]);

  const handleSelectGroup = useCallback((group: Group) => {
    setSelectedGroup(group);
    try {
      localStorage.setItem(REPORT_MEMORY_KEY, JSON.stringify({ groupId: group.id }));
    } catch (_) {}
  }, []);

  useEffect(() => {
    // Party groups don't have groupType; non-party groups have groupType: 'tax' | 'staff' | 'account' | 'expense' | 'item'
    const groupType = (selectedGroup as any)?.groupType;
    const isParty = !!selectedGroup && !["tax", "staff", "account", "expense", "item"].includes(groupType);
    onPartySelectionChange?.(isParty);
  }, [selectedGroup, onPartySelectionChange]);

  // Merge vouchersUserNames with fetched userNames
  const mergedUserNames = useMemo(() => {
    return { ...vouchersUserNames, ...userNames };
  }, [vouchersUserNames, userNames]);

  if (vouchersLoading) {
    return (
      <div className="flex flex-col h-full p-4 gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="flex-1 w-full" />
      </div>
    );
  }

  // Mobile: same UI as In/Exp Report - entity (group) dropdown + account dropdown
  const renderGroupDetailsContent = () => {
    if (selectedMember) {
      const groupType = (selectedGroup as any)?.groupType;
      if (groupType === 'tax') {
        const tax = processedTaxes.find((t: any) => t.id === selectedMember.id);
        if (tax) {
          return (
            <TaxDetails
              tax={tax}
              allTaxes={processedTaxes}
              transactions={allVouchers}
              onTaxUpdated={() => {}}
              onTaxDeleted={() => setSelectedMember(null)}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              userNames={mergedUserNames}
              context="report"
            />
          );
        }
      }
      if (groupType === 'staff') {
        const staff = processedStaff.find((s: any) => s.id === selectedMember.id);
        if (staff) {
          return (
            <PayeeDetails
              party={staff as any}
              allParties={[...processedParties, ...processedStaff, ...processedExpenseAccounts] as any}
              transactions={allVouchers}
              onPartyUpdated={() => {}}
              onPartyDeleted={() => setSelectedMember(null)}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              journalAccountNames={journalAccountNames}
              userNames={mergedUserNames}
            />
          );
        }
      }
      if (groupType === 'account') {
        const acc = processedAccounts.find((a: any) => a.id === selectedMember.id);
        if (acc) {
          return (
            <AccountDetails
              account={acc as any}
              allAccounts={processedAccounts}
              onAccountUpdated={() => {}}
              onAccountDeleted={() => setSelectedMember(null)}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              userNames={mergedUserNames}
              transactions={allVouchers}
            />
          );
        }
      }
      if (groupType === 'expense') {
        const exp = processedExpenseAccounts.find((e: any) => e.id === selectedMember.id);
        if (exp) {
          return (
            <ExpenseAccountDetails
              account={exp as any}
              allAccounts={processedExpenseAccounts}
              onAccountUpdated={() => {}}
              onAccountDeleted={() => setSelectedMember(null)}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              userNames={mergedUserNames}
            />
          );
        }
      }
      const party = processedParties.find((p: any) => p.id === selectedMember.id);
      if (party) {
        return (
          <PayeeDetails
            party={party as any}
            allParties={[...processedParties, ...processedStaff, ...processedExpenseAccounts] as any}
            transactions={allVouchers}
            onPartyUpdated={() => {}}
            onPartyDeleted={() => setSelectedMember(null)}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            journalAccountNames={journalAccountNames}
            userNames={mergedUserNames}
          />
        );
      }
    }
    if (selectedGroup) {
      const groupEntity = (selectedGroup as any).entity ?? selectedGroup;
      const groupType = (selectedGroup as any).groupType;
      if (groupType === 'party' || !groupType) {
        return (
          <GroupDetails
            group={groupEntity as Group}
            allGroups={processedGroups}
            allParties={partiesForSelectedGroup}
            onGroupUpdated={() => {}}
            onGroupDeleted={() => setSelectedGroup(null)}
            onPartyUpdated={() => {}}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            userNames={mergedUserNames}
          />
        );
      }
      if (groupType === 'staff') {
        return (
          <StaffGroupDetails
            group={groupEntity as any}
            allGroups={processedStaffGroups}
            staff={processedStaff.filter((s: any) => s.groupId === selectedGroup.id)}
            onGroupUpdated={() => {}}
            onGroupDeleted={() => setSelectedGroup(null)}
            onStaffUpdated={() => {}}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            userNames={mergedUserNames}
          />
        );
      }
      if (groupType === 'tax') {
        return (
          <TaxGroupDetails
            group={groupEntity as any}
            allGroups={processedTaxGroups}
            taxes={processedTaxes.filter((t: any) => t.groupId === selectedGroup.id)}
            onGroupUpdated={() => {}}
            onGroupDeleted={() => setSelectedGroup(null)}
            onTaxUpdated={() => {}}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            userNames={mergedUserNames}
          />
        );
      }
      if (groupType === 'expense') {
        return (
          <ExpenseGroupDetails
            group={groupEntity as any}
            allGroups={processedExpenseGroups}
            accounts={processedExpenseAccounts.filter((e: any) => e.groupId === selectedGroup.id)}
            onGroupUpdated={() => {}}
            onGroupDeleted={() => setSelectedGroup(null)}
            onAccountUpdated={() => {}}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            userNames={mergedUserNames}
          />
        );
      }
      if (groupType === 'account') {
        return (
          <AccountGroupDetails
            group={groupEntity as any}
            allGroups={processedAccountGroups}
            accounts={processedAccounts.filter((a: any) => a.groupId === selectedGroup.id)}
            onGroupUpdated={() => {}}
            onGroupDeleted={() => setSelectedGroup(null)}
            onAccountUpdated={() => {}}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            userNames={mergedUserNames}
          />
        );
      }
    }
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Select a group</CardTitle>
            <CardDescription>Choose a group from the list to view transactions.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  };

  if (isMobile) {
    return (
      <div className="h-full flex flex-col min-h-0 overflow-hidden bg-background">
        <div className="flex flex-col gap-2 p-3 border-b flex-shrink-0">
          <div className="flex justify-center items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">{dateRangeLabel}</span>
            {hasDateFilter && (
              <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => setDateRange(undefined)} title="Clear date filter">
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <Combobox
                options={groupDropdownOptions}
                value={selectedGroup?.id || ""}
                onChange={(value) => {
                  const grp = processedGroups.find((g) => g.id === value);
                  if (grp) {
                    setSelectedGroup(grp as Group);
                    setSelectedMember(null);
                  }
                }}
                placeholder="Group"
              />
            </div>
            <div className="flex-1 min-w-0">
              <Combobox
                options={accountDropdownOptions}
                value={selectedMember?.id || ""}
                onChange={(value) => {
                  const groupType = (selectedGroup as any)?.groupType;
                  let member: any = null;
                  if (groupType === 'tax') member = processedTaxes.find((t: any) => t.id === value);
                  else if (groupType === 'staff') member = processedStaff.find((s: any) => s.id === value);
                  else if (groupType === 'account') member = processedAccounts.find((a: any) => a.id === value);
                  else if (groupType === 'expense') member = processedExpenseAccounts.find((e: any) => e.id === value);
                  else if (groupType === 'item') member = processedItems.find((i: any) => i.id === value);
                  else member = processedParties.find((p: any) => p.id === value) || (selectedGroup?.id === 'ungrouped' ? processedParties.find((p: any) => !p.groupId && p.id === value) : processedParties.find((p: any) => p.groupId === selectedGroup?.id && p.id === value));
                  setSelectedMember(member || null);
                }}
                placeholder="Account"
              />
            </div>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">{renderGroupDetailsContent()}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[minmax(280px,max-content)_minmax(0,1fr)] min-h-0 overflow-hidden">
        <div className="flex flex-col min-h-0 border-r overflow-hidden bg-muted/30">
          <div className="p-4 border-b space-y-3 flex-shrink-0">
            <h2 className="text-lg font-bold font-headline">Group Summary</h2>
            <Card className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Balance</p>
              <p className={cn(
                "text-xl font-bold",
                totalBalance >= 0 ? "text-green-600" : "text-red-600"
              )}>
                {formatCurrency(totalBalance, { showDrCr: true, noSuffix: true })}
              </p>
            </Card>
          </div>
          <div className="p-3 border-b flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search groups..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="px-3 pt-2 pb-1 border-b flex-shrink-0">
            <h3 className="text-sm font-semibold">Groups ({filteredGroups.length})</h3>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <PartyGroupList
              groups={filteredGroups}
              onSelectGroup={handleSelectGroup}
              selectedGroup={selectedGroup}
              searchTerm={searchTerm}
            />
          </div>
        </div>

        <div className="flex flex-col min-h-0 overflow-hidden">
          {selectedGroup && (
            <div className="flex-shrink-0 flex justify-center items-center gap-2 py-2 border-b bg-muted/30">
              <span className="text-xs font-medium text-muted-foreground">{dateRangeLabel}</span>
              {hasDateFilter && (
                <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => setDateRange(undefined)} title="Clear date filter">
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
          {selectedGroup ? (
            <GroupDetails
              group={selectedGroup}
              allGroups={processedGroups}
              allParties={partiesForSelectedGroup}
              onGroupUpdated={() => {}}
              onGroupDeleted={() => setSelectedGroup(null)}
              onPartyUpdated={() => {}}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              userNames={mergedUserNames}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <Card className="w-full max-w-md text-center">
                <CardHeader>
                  <CardTitle>Select a group</CardTitle>
                  <CardDescription>
                    Choose a group from the list to view transactions.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {processedGroups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No groups found. Create a group to see it here.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
