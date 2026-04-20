
"use client";

import { Suspense, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Search, User, AlertCircle, ArrowLeft, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn, masterDetailBalanceToneClass } from "@/lib/utils";
import { useDate } from "@/hooks/useDate";
import { useRouter, useSearchParams } from "next/navigation";
import { PartyList } from "@/components/party/PartyList";
import { PartyDetails } from "@/components/party/PartyDetails";
import { PartyGroupList } from "@/components/party/PartyGroupList";
import { GroupDetails } from "@/components/party/GroupDetails";
import { OverdueAccountView, type OverdueTransactionRow } from "@/components/party/OverdueAccountView";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";
import { HistoryDialog } from "@/components/vouchers/HistoryDialog";
import { LinkAdvancesToVoucherDialog } from "@/components/vouchers/LinkAdvancesToVoucherDialog";
import { LinkPaymentToTxnsDialog } from "@/components/vouchers/LinkPaymentToTxnsDialog";

export const OVERDUE_ACCOUNT_ID = "__overdue__";
import { CreatePartyDialog } from "@/components/party/CreatePartyDialog";
import { CreateGroupDialog } from "@/components/party/CreateGroupDialog";
import { PermissionButton } from "@/components/permission";
import { useVouchers } from "@/hooks/useVouchers";
import usePermissions from "@/hooks/usePermissions";
import type { Party, Group } from "@/components/party/types";
import { useResponsiveListLayout } from "@/hooks/useResponsiveListLayout";
import { ResponsiveMasterDetail } from "@/components/layout/ResponsiveMasterDetail";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMasterDetailQueryNav } from "@/hooks/useMasterDetailQueryNav";
import { useRegisterMasterDetailHardwareBack } from "@/hooks/useRegisterMasterDetailHardwareBack";
import { useSyncMasterDetailHeaderId } from "@/hooks/useSyncMasterDetailHeaderId";
import { masterDetailListHref } from "@/lib/masterDetailListPath";
import type { DateRange } from "@/components/ui/ad-calendar";
import { toast } from "sonner";
import { useBalanceMode } from "@/hooks/useBalanceMode";
import { TransactionsTable } from "@/components/vouchers/TransactionsTable";
import { getTransactionQuickSearchHaystack } from "@/components/vouchers/transactionTableShared";

// Custom Hook
import { usePageMemory } from "@/hooks/usePageMemory";
import { isSystemParentGroup } from "@/lib/system-groups";
import { shouldReplaceWithMasterDetailCanonical } from "@/lib/maybeReplaceMasterDetailUrl";
import { collectPartyIdsTouchedByUnapprovedVoucher } from "@/lib/voucherTouchesPartyLedger";
import { PendingApprovalListFilterBadge } from "@/components/layout/PendingApprovalListFilterBadge";

function PartyPageContent() {
  const { user } = useAuth();
  // Pehle company context: warna vouchersLoading false ho kar khali list flash, phir company aate hi dubara paint (Poora page jump).
  const { company, companyId, loading: companyLoading, effectiveNotificationSettings } = useCompany();
  const { formatCurrency } = useDate();
  const { vouchers, loading: vouchersLoading, processedParties, processedPartiesForSelection, processedGroups: initialProcessedGroups, overdueTransactions, hasOverdueTransactions, userNames: voucherUserNames, journalAccountNames } = useVouchers();
  const waitingForCompany = Boolean(companyId && (companyLoading || !company));
  const pageDataLoading = waitingForCompany || vouchersLoading;
  const { can } = usePermissions();
  const showApproveOnList =
    can("approve_transactions") &&
    effectiveNotificationSettings?.approve?.on !== false &&
    effectiveNotificationSettings?.approve?.onList !== false;
  const pendingApprovalByPartyId = useMemo(() => {
    if (!showApproveOnList || !vouchers?.length || !processedParties?.length) return {} as Record<string, number>;
    // Journal/contra `partyId` ke bina bhi — ledger jaisa touch (`voucherTouchesPartyLedger`)
    const partyIdSet = new Set(processedParties.map((p: Party) => p.id));
    const map: Record<string, number> = {};
    vouchers.forEach((v: any) => {
      const touched = collectPartyIdsTouchedByUnapprovedVoucher(v, partyIdSet);
      touched.forEach((id) => {
        map[id] = (map[id] || 0) + 1;
      });
    });
    return map;
  }, [vouchers, showApproveOnList, processedParties]);
  const pendingApprovalByGroupId = useMemo(() => {
    if (!showApproveOnList || !processedParties?.length) return {} as Record<string, number>;
    const byGroup: Record<string, number> = {};
    processedParties.forEach((p: Party) => {
      const n = pendingApprovalByPartyId[p.id] || 0;
      if (!n) return;
      // `PartyGroupList` ka synthetic row `id: 'ungrouped'` — bina groupId / `ungrouped_party` wale parties yahi pe
      const gid =
        p.groupId && String(p.groupId).trim() !== "" && p.groupId !== "ungrouped_party"
          ? p.groupId
          : "ungrouped";
      byGroup[gid] = (byGroup[gid] || 0) + n;
    });
    return byGroup;
  }, [processedParties, showApproveOnList, pendingApprovalByPartyId]);

  /** Search aur + Add Party ke beech: kitne unapproved vouchers kisi party ledger ko touch karte hain (badge total) */
  const totalPendingApprovalVoucherCount = useMemo(() => {
    if (!showApproveOnList || !vouchers?.length || !processedParties?.length) return 0;
    const partyIdSet = new Set(processedParties.map((p: Party) => p.id));
    let n = 0;
    for (const v of vouchers as any[]) {
      if (v?.isApproved === true) continue;
      if (collectPartyIdsTouchedByUnapprovedVoucher(v, partyIdSet).size > 0) n += 1;
    }
    return n;
  }, [vouchers, showApproveOnList, processedParties]);

  const router = useRouter();
  const searchParams = useSearchParams();
  const isInitialMount = useRef(true);
  const { setBalanceMode } = useBalanceMode();

  const [activeView, setActiveView] = useState("parties");
  const { isMobile, selected, setSelected } = useResponsiveListLayout<Party | Group>(`party_view_${activeView}`);
  // APK / static Electron: wide window par bhi ?selected= rakho taaki header Report button ko id mile
  const useQueryNav = useMasterDetailQueryNav();

  // List farkina: replace (push jasto double history hoina) + hardware back ma pani (Capacitor) yahi logic
  const onBackToList = useCallback(() => {
    setSelected(null);
    router.replace(masterDetailListHref("party"), { scroll: false });
  }, [setSelected, router]);
  useRegisterMasterDetailHardwareBack(onBackToList, isMobile && !!selected);

  const [searchTerm, setSearchTerm] = useState("");
  /** Party list: sirf un jinke paas pending approval (count box click toggle) */
  const [showOnlyPartiesWithPendingApproval, setShowOnlyPartiesWithPendingApproval] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCreatePartyOpen, setIsCreatePartyOpen] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const mergedUserNames = useMemo(
    () => ({ ...voucherUserNames, ...userNames }),
    [voucherUserNames, userNames]
  );

  const [partyDetailsDateRange, setPartyDetailsDateRange] = useState<DateRange | undefined>(undefined);
  const [groupDetailsDateRange, setGroupDetailsDateRange] = useState<DateRange | undefined>(undefined);
  const [overdueVoucherToEdit, setOverdueVoucherToEdit] = useState<any>(null);
  const [historyVoucher, setHistoryVoucher] = useState<any>(null);
  const [linkAdvancesVoucher, setLinkAdvancesVoucher] = useState<any>(null);
  const [linkPaymentVoucher, setLinkPaymentVoucher] = useState<any>(null);
  const [overdueMobileSearchTerm, setOverdueMobileSearchTerm] = useState("");
  const [overdueFilters, setOverdueFilters] = useState<Record<string, string>>({});
  const [overdueActiveFilter, setOverdueActiveFilter] = useState<string | null>(null);
  const [overdueFooterDialog, setOverdueFooterDialog] = useState<null | "payment_in" | "payment_out" | "sale">(null);
  const [overdueShowNarration, setOverdueShowNarration] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return sessionStorage.getItem("showNarration") !== "false";
    } catch {
      return true;
    }
  });

  const selectedParty = activeView === 'parties' ? selected as Party : null;
  const selectedGroup = activeView === 'groups' ? selected as Group : null;
  const mobilePartyGroupSelectionLabel = useMemo(() => {
    if (!selected) return null;
    const name = (selected as Party | Group).name;
    return name && String(name).trim() ? String(name).trim() : null;
  }, [selected]);
  const mobilePartyGroupSelectionLabelClassName = useMemo(() => {
    if (!selected) return undefined;
    return masterDetailBalanceToneClass((selected as Party | Group).balance);
  }, [selected]);
  const partyMasterDetailTitle = activeView === "groups" ? "Party Groups" : "Parties";
  // Header Report: sessionStorage sync — URL ?selected= flicker / router.replace race se button stable rahe
  useSyncMasterDetailHeaderId("party", selectedParty?.id ?? selectedGroup?.id ?? null);

  const overdueVirtualParty = useMemo((): Party | null => {
    if (!hasOverdueTransactions || overdueTransactions.length === 0) return null;
    const totalDebit = overdueTransactions.reduce((s, t) => s + t.debit, 0);
    const totalCredit = overdueTransactions.reduce((s, t) => s + t.credit, 0);
    return {
      id: OVERDUE_ACCOUNT_ID,
      name: "Overdue Vouchers",
      openingBalance: 0,
      debit: totalDebit,
      credit: totalCredit,
      balance: totalDebit - totalCredit,
      companyId: companyId || "",
    };
  }, [hasOverdueTransactions, overdueTransactions, companyId]);

  // Overdue mobile: map overdue rows to transaction-like for TransactionsTable (same UI as Party Details)
  const overdueAsTransactions = useMemo(() => {
    return overdueTransactions.map((row) => {
      const v = vouchers.find((v) => v.id === row.id);
      const out = Number(row.outstanding) ?? 0;
      const signedOut =
        row.type === "purchase" || row.type === "payment_out" || row.type === "direct_expense" ? -out : out;
      return {
        id: row.id,
        type: row.type,
        date: row.date,
        voucherNumber: row.voucherNumber,
        partyId: row.partyId,
        debit: row.debit,
        credit: row.credit,
        outstanding: out,
        runningBalance: signedOut,
        balance: signedOut,
        paymentStatus: row.paymentStatus,
        userId: row.userId,
        userName: row.userName,
        narration: row.narration,
        dueDate: row.dueDate,
        isApproved: v?.isApproved,
        partyName: row.partyName,
      };
    });
  }, [overdueTransactions, vouchers]);

  const overduePartyNames = useMemo(() => {
    const m: Record<string, string> = {};
    overdueTransactions.forEach((r) => {
      if (r.partyId) m[r.partyId] = r.partyName || m[r.partyId] || "";
    });
    return m;
  }, [overdueTransactions]);

  const overdueMobileSearchNames = useMemo(
    () => ({ ...journalAccountNames, ...mergedUserNames, ...overduePartyNames }),
    [journalAccountNames, mergedUserNames, overduePartyNames]
  );

  const mobileFilteredOverdue = useMemo(() => {
    if (!overdueMobileSearchTerm.trim()) return overdueAsTransactions;
    const q = overdueMobileSearchTerm.toLowerCase().trim();
    return overdueAsTransactions.filter((t: any) => {
      const amt = t.debit > 0 ? t.debit : t.credit;
      return (
        getTransactionQuickSearchHaystack(t, overdueMobileSearchNames, t.partyId ? "party" : undefined, t.partyId).includes(q) ||
        String(amt || 0).toLowerCase().includes(q)
      );
    });
  }, [overdueAsTransactions, overdueMobileSearchTerm, overdueMobileSearchNames]);

  const overduePeriodDr = useMemo(
    () => mobileFilteredOverdue.reduce((s, t) => s + (t.debit ?? 0), 0),
    [mobileFilteredOverdue]
  );
  const overduePeriodCr = useMemo(
    () => mobileFilteredOverdue.reduce((s, t) => s + (t.credit ?? 0), 0),
    [mobileFilteredOverdue]
  );
  const overdueClosingBalance = useMemo(() => {
    const totalOut = mobileFilteredOverdue.reduce((s, t) => s + (Number(t.outstanding) ?? 0), 0);
    return -totalOut;
  }, [mobileFilteredOverdue]);

  const partiesForList = processedPartiesForSelection;
  const partiesForPartyListView = useMemo(() => {
    if (!showOnlyPartiesWithPendingApproval || !showApproveOnList) return partiesForList;
    return partiesForList.filter((p) => (pendingApprovalByPartyId[p.id] ?? 0) > 0);
  }, [partiesForList, showOnlyPartiesWithPendingApproval, showApproveOnList, pendingApprovalByPartyId]);
  
   const processedGroups = useMemo(() => {
    // Show Ungrouped row only when at least one party is in the Ungrouped bucket.
    const ungrouped = processedPartiesForSelection.filter((p: any) => !p.groupId || p.groupId === "ungrouped_party");
    
    // Filter out report-only groups (isReportOnly: true) and system parent groups
    const userDefinedGroups = initialProcessedGroups.filter(g => {
        const anyG = g as any;
        const isReportOnly = anyG.isReportOnly === true;
        // Hide auto-created Ungrouped base doc; UI row is injected only when actually needed.
        const isAutoUngrouped = anyG.isAutoUngrouped === true;
        const isSystemParent =
          anyG.isSystemReserved === true ||
          isSystemParentGroup("groups", anyG.id);
        return !isReportOnly && !isSystemParent && !isAutoUngrouped;
    });

    if (ungrouped.length > 0) {
      const ungroupedBalance = ungrouped.reduce((sum, p) => sum + p.balance, 0);
      const ungroupedGroup: Group = {
        id: 'ungrouped',
        name: 'Ungrouped',
        balance: ungroupedBalance,
        companyId: companyId || '',
        debit: ungrouped.reduce((sum, p) => sum + p.debit, 0),
        credit: ungrouped.reduce((sum, p) => sum + p.credit, 0),
      };
      return [...userDefinedGroups, ungroupedGroup];
    }
    return userDefinedGroups;
  }, [processedPartiesForSelection, initialProcessedGroups, companyId]);

  // ========== MEMORY LOGIC ==========
  usePageMemory(
    "partyPageState", 
    activeView,               
    setActiveView,            
    selected,                 
    setSelected,              
    activeView === 'parties' ? partiesForList : processedGroups, 
    pageDataLoading
  );
  // ==================================

  // Restore selection when returning from details (e.g. /party?selected=xyz or /party?view=groups&selected=xyz)
  const selectedIdFromUrl = searchParams.get("selected");
  const viewFromUrl = searchParams.get("view");
  useEffect(() => {
    if (!selectedIdFromUrl) return;
    if (pageDataLoading) return;
    if (selectedIdFromUrl === OVERDUE_ACCOUNT_ID && overdueVirtualParty) {
      setActiveView("parties");
      setSelected(overdueVirtualParty);
      // URL pehle se match ho to replace mat — snapshot deps se effect bar-baar chalne par double navigation
      const overdueUrl = `/party?selected=${encodeURIComponent(OVERDUE_ACCOUNT_ID)}`;
      if (shouldReplaceWithMasterDetailCanonical(overdueUrl)) {
        router.replace(overdueUrl, { scroll: false });
      }
      return;
    }
    const groupItem = processedGroups.find((i) => i.id === selectedIdFromUrl);
    const partyItem = processedParties.find((i) => i.id === selectedIdFromUrl);
    const item = groupItem || partyItem;
    if (viewFromUrl === "groups" && groupItem) setActiveView("groups");
    else if (partyItem) setActiveView("parties");
    if (item) setSelected(item);
    // URL me ?selected= / view=groups rakhna: router.replace("/party") se hataane par header Report + static build break ho jata tha
    const canonical =
      viewFromUrl === "groups"
        ? `/party?view=groups&selected=${encodeURIComponent(selectedIdFromUrl)}`
        : `/party?selected=${encodeURIComponent(selectedIdFromUrl)}`;
    if (shouldReplaceWithMasterDetailCanonical(canonical)) {
      router.replace(canonical, { scroll: false });
    }
  }, [selectedIdFromUrl, viewFromUrl, pageDataLoading, processedParties, processedGroups, overdueVirtualParty, setSelected, setActiveView, router]);

  const fetchUserName = useCallback(async (userId: string): Promise<string> => {
    if (userNames[userId] && userNames[userId] !== "Unknown" && userNames[userId] !== "N/A") {
      return userNames[userId];
    }
    try {
        // Primary lookup by uid because user doc IDs may be name_uid format.
        const q = query(collection(firestore, "users"), where("uid", "==", userId));
        const snap = await getDocs(q);
        let data = snap.docs[0]?.data();

        if (!data) {
            // Fallback 1: user document id is uid (legacy).
            const userDoc = await getDoc(doc(firestore, "users", userId));
            if (userDoc.exists()) {
                data = userDoc.data();
            } else {
                // Fallback 2: scan for docs ending with uid.
                const allUsersSnap = await getDocs(collection(firestore, "users"));
                const matchingDoc = allUsersSnap.docs.find((d) => {
                    const docData = d.data();
                    return docData.uid === userId || d.id.endsWith(userId);
                });
                if (matchingDoc) {
                    data = matchingDoc.data();
                }
            }
        }

        if (data) {
            const displayName = data.displayName || data.name || data.email || null;
            if (displayName && displayName !== userId && displayName !== "Unknown" && displayName !== "N/A") {
                const isUIDPattern =
                  displayName.length > 15 &&
                  /^[a-zA-Z0-9_-]+$/.test(displayName) &&
                  !displayName.includes("@") &&
                  !displayName.includes(" ");
                if (!isUIDPattern) return displayName;
            }
        }
    } catch (e) {
      console.error("[PartyPage] Error fetching userName for", userId, e);
    }
    return "N/A";
  }, [userNames]);

  useEffect(() => {
    const uids = new Set(vouchers.map((t) => t.userId).filter(Boolean));
    uids.forEach(async (uid) => {
        if (!userNames[uid as any]) {
            const name = await fetchUserName(uid as any);
            setUserNames((prev) => ({ ...prev, [uid as any]: name }));
        }
    });
  }, [vouchers, userNames, fetchUserName]);

  // Clear search when company changes (prevent email/other data from carrying over)
  useEffect(() => {
    setSearchTerm("");
  }, [companyId]);
  useEffect(() => {
    setShowOnlyPartiesWithPendingApproval(false);
  }, [companyId]);
  useEffect(() => {
    if (activeView !== "parties") setShowOnlyPartiesWithPendingApproval(false);
  }, [activeView]);

  // Mobile overdue: force bill-wise mode while on this page (party default is already bill_wise; restore on leave)
  useEffect(() => {
    if (isMobile && selectedParty?.id === OVERDUE_ACCOUNT_ID) {
      setBalanceMode("bill_wise");
      return () => setBalanceMode("bill_wise");
    }
  }, [isMobile, selectedParty?.id, setBalanceMode]);

  // Initial mount check
  useEffect(() => {
    if (isInitialMount.current) {
        isInitialMount.current = false;
    }
  }, []);
  
  const totalBalance = useMemo(() => {
    if (activeView === 'parties') {
        // Exclude system accounts from total balance
        return processedParties
            .filter(p => !(p as any).isSystemAccount)
            .reduce((acc, party) => acc + party.balance, 0);
    }
    // Groups view: sum only user-defined + synthetic groups (processedGroups already excludes system parents)
    return processedGroups
      .reduce((acc, group) => acc + group.balance, 0);
  }, [activeView, processedParties, processedGroups]);

  const handleSelect = (item: Party | Group) => {
    if (useQueryNav) {
        // Static export ke liye query params use karte hain – /party/[id] path 404 de sakta hai
        const path = item.id === OVERDUE_ACCOUNT_ID
          ? `/party?selected=${OVERDUE_ACCOUNT_ID}`
          : 'pan' in item ? `/party?selected=${item.id}` : `/party?view=groups&selected=${item.id}`;
        router.push(path);
    } else {
        setSelected(item);
    }
  };

  const partiesForSelectedGroup = useMemo(() => {
    if (!selectedGroup) return [];
    if (selectedGroup.id === 'ungrouped') {
      return processedPartiesForSelection.filter((p: any) => !p.groupId || p.groupId === "ungrouped_party");
    }
    return processedPartiesForSelection.filter(p => p.groupId === selectedGroup.id);
  }, [selectedGroup, processedPartiesForSelection]);

  // Filtered count for party list (matches PartyList logic: search + exclude system accounts)
  const filteredPartyCount = useMemo(() => {
    const searchLower = (searchTerm || "").toLowerCase();
    return (partiesForPartyListView || []).filter((p) => {
      if (!p.name) return false;
      const isSystemAccount = (p as any).isSystemAccount === true;
      const matchesSearch = searchLower ? p.name.toLowerCase().includes(searchLower) : true;
      return matchesSearch && !isSystemAccount;
    }).length;
  }, [partiesForPartyListView, searchTerm]);


  if (!companyId) {
    return (
         <div className="flex flex-1 items-center justify-center p-4 sm:p-6 md:p-8 h-full">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <CardTitle>No Company Selected</CardTitle>
                    <CardDescription>
                        Please select a company to view party data.
                    </CardDescription>
                </CardHeader>
            </Card>
        </div>
    );
  }

  if (pageDataLoading) {
    return <LoadingSpinner />;
  }
  
  const listView = (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={activeView === 'parties' ? 'Search parties...' : 'Search groups...'} className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoComplete="off" />
        </div>
        {activeView === "parties" && showApproveOnList && totalPendingApprovalVoucherCount > 0 ? (
          <PendingApprovalListFilterBadge
            count={totalPendingApprovalVoucherCount}
            pressed={showOnlyPartiesWithPendingApproval}
            onToggle={() => setShowOnlyPartiesWithPendingApproval((v) => !v)}
            tooltipFilterHint={`Only parties with pending approval — ${totalPendingApprovalVoucherCount} voucher(s) (click)`}
            tooltipShowAllHint="Show all parties (click)"
            ariaLabelFilter={`Filter ${totalPendingApprovalVoucherCount} pending approval vouchers`}
            ariaLabelShowAll="Show all parties"
          />
        ) : null}
        {activeView === "parties" ? (
          <CreatePartyDialog onPartyCreated={() => {}} isOpen={isCreatePartyOpen} onOpenChange={setIsCreatePartyOpen}>
            <PermissionButton permission="create_records" size="sm" onClick={() => setIsCreatePartyOpen(true)}>
              + Add Party
            </PermissionButton>
          </CreatePartyDialog>
        ) : (
          <CreateGroupDialog onGroupCreated={() => {}} groups={processedGroups} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
            <PermissionButton permission="create_records" size="sm" onClick={() => setIsCreateGroupOpen(true)}>
              + Add Group
            </PermissionButton>
          </CreateGroupDialog>
        )}
      </div>
       {activeView === 'parties' ? (
            <>
              <div className="px-3 py-1.5 border-b flex items-center justify-between gap-2 text-sm font-semibold text-muted-foreground flex-shrink-0">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>Party ({filteredPartyCount})</span>
                </div>
                {hasOverdueTransactions && overdueVirtualParty && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs font-medium border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/40 dark:hover:text-amber-100"
                    onClick={() => handleSelect(overdueVirtualParty)}
                  >
                    <AlertCircle className="h-3.5 w-3 mr-1 shrink-0" />
                    Overdue Vouchers ({overdueTransactions.length})
                  </Button>
                )}
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <PartyList
                parties={partiesForPartyListView}
                onSelectParty={handleSelect}
                selectedParty={selectedParty}
                searchTerm={searchTerm}
                topPartyId={hasOverdueTransactions ? OVERDUE_ACCOUNT_ID : undefined}
                overdueVoucherCount={hasOverdueTransactions ? overdueTransactions.length : undefined}
                pendingApprovalByPartyId={pendingApprovalByPartyId}
                getItemHref={useQueryNav ? (p) => (p.id === OVERDUE_ACCOUNT_ID ? undefined : `/party?selected=${p.id}`) : undefined}
              />
              </div>
            </>
        ) : (
            <PartyGroupList
              groups={processedGroups}
              onSelectGroup={handleSelect}
              selectedGroup={selectedGroup}
              searchTerm={searchTerm}
              collapsible={false}
              pendingApprovalByGroupId={pendingApprovalByGroupId}
              getItemHref={useQueryNav ? (g) => `/party?view=groups&selected=${g.id}` : undefined}
            />
        )}
    </div>
  );

  const detailView = (
    <>
      {activeView === 'parties' && selectedParty?.id === OVERDUE_ACCOUNT_ID && (
        <OverdueAccountView
          overdueTransactions={overdueTransactions}
          userNames={mergedUserNames}
          onEditVoucher={(row: OverdueTransactionRow) => {
            const voucher = vouchers.find((v) => v.id === row.id);
            if (voucher) setOverdueVoucherToEdit(voucher);
          }}
          onHistoryVoucher={(row: OverdueTransactionRow) => {
            const voucher = vouchers.find((v) => v.id === row.id);
            if (voucher) setHistoryVoucher(voucher);
          }}
          onAddLink={(row: OverdueTransactionRow) => {
            const voucher = vouchers.find((v) => v.id === row.id);
            if (!voucher) return;
            const isPaymentType = ["payment_in", "payment_out", "direct_income", "direct_expense"].includes(voucher?.type);
            if (isPaymentType) setLinkPaymentVoucher(voucher);
            else setLinkAdvancesVoucher(voucher);
          }}
        />
      )}
      {activeView === 'parties' && selectedParty && selectedParty.id !== OVERDUE_ACCOUNT_ID && (
        <PartyDetails party={selectedParty} allParties={processedParties} onPartyUpdated={() => {}} onPartyDeleted={() => setSelected(null)} dateRange={partyDetailsDateRange} onDateRangeChange={setPartyDetailsDateRange} userNames={mergedUserNames} />
      )}
      {activeView === 'groups' && selectedGroup && (
        <GroupDetails group={selectedGroup} allGroups={processedGroups} allParties={partiesForSelectedGroup} onGroupUpdated={() => {}} onGroupDeleted={() => setSelected(null)} onPartyUpdated={() => {}} dateRange={groupDetailsDateRange} onDateRangeChange={setGroupDetailsDateRange} userNames={mergedUserNames} />
      )}
      {!selected && <div className="p-6 text-center text-muted-foreground">Select an item to see details</div>}
    </>
  );

  // Mobile: full-screen Overdue view – same UI as Party Details (header, To Pay, search, cards, Bill wise bar)
  if (isMobile && selectedParty?.id === OVERDUE_ACCOUNT_ID) {
    const handleOverdueRowClick = (t: any) => {
      const voucher = vouchers.find((v) => v.id === t.id);
      if (voucher) setOverdueVoucherToEdit(voucher);
    };
    const handleOverdueHistory = (t: any) => {
      const voucher = vouchers.find((v) => v.id === t.id);
      if (voucher) setHistoryVoucher(voucher);
    };
    const handleOverdueAddLink = (t: any) => {
      const voucher = vouchers.find((v) => v.id === t.id);
      if (!voucher) return;
      const isPaymentType = ["payment_in", "payment_out", "direct_income", "direct_expense"].includes(voucher?.type);
      if (isPaymentType) setLinkPaymentVoucher(voucher);
      else setLinkAdvancesVoucher(voucher);
    };
    return (
      <>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden pb-24">
          {/* Row 1: Back | Title | Showing x of y */}
          <div className="px-2 py-1.5 border-b flex items-center justify-between gap-2 flex-shrink-0">
            <Button variant="ghost" size="icon" className="flex-shrink-0 h-8 w-8" onClick={() => { setSelected(null); router.push("/party"); }}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-base font-bold truncate flex-1 min-w-0">Overdue Vouchers</h1>
            <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
              Showing {mobileFilteredOverdue.length} of {overdueAsTransactions.length} voucher(s)
            </span>
          </div>
          {/* Row 2: Overdue label */}
          <div className="px-2 py-1 border-b flex justify-center items-center gap-1.5 flex-shrink-0">
            <span className="text-xs font-medium text-muted-foreground">Overdue</span>
          </div>
          {/* To Pay total */}
          <div className="px-3 py-3 border-b flex-shrink-0">
            <p className="text-2xl font-bold text-center text-red-600">
              To Pay {formatCurrency(Math.abs(overdueClosingBalance), { noSuffix: true })}
            </p>
          </div>
          {/* Search */}
          <div className="p-2 border-b flex-shrink-0">
            <div className="flex items-stretch gap-2">
              <div className="flex-1 min-w-0 h-9 relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none z-10" />
                <Input
                  placeholder="Search transactions"
                  className="pl-8 h-9 text-sm w-full min-w-0"
                  value={overdueMobileSearchTerm}
                  onChange={(e) => setOverdueMobileSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
          {/* Transaction list – mobile cards; scroll-touch + inline for APK/WebView touch scroll */}
          <div
            className="flex-1 min-h-0 overflow-auto scroll-touch"
            style={{ overflowY: "scroll", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
          >
            <TransactionsTable
              transactions={mobileFilteredOverdue}
              context="party"
              contextId={OVERDUE_ACCOUNT_ID}
              openingBalance={0}
              showNarration={overdueShowNarration}
              userNames={mergedUserNames}
              accountNames={overduePartyNames}
              onRowClick={handleOverdueRowClick}
              onHistoryVoucher={handleOverdueHistory}
              onAddLink={handleOverdueAddLink}
              filters={overdueFilters}
              setFilters={setOverdueFilters}
              activeFilter={overdueActiveFilter}
              setActiveFilter={setOverdueActiveFilter}
              periodDr={overduePeriodDr}
              periodCr={overduePeriodCr}
              closingBalance={overdueClosingBalance}
              scrollOnlyTransactions
              visibleColumns={{ status: true }}
            />
          </div>
        </div>
        {/* Fixed bottom: Receive, Pay, New Sale (no Bill wise – overdue mobile is always bill-wise) */}
        <div className="fixed bottom-0 left-0 right-0 p-1.5 border-t bg-background/95 backdrop-blur z-50 flex items-center justify-around gap-1.5">
          <Button className="flex-1 h-6 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-medium" onClick={() => setOverdueFooterDialog("payment_in")}>
            Receive
          </Button>
          <Button className="flex-1 h-6 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium" onClick={() => setOverdueFooterDialog("payment_out")}>
            Pay
          </Button>
          <Button className="flex-1 h-6 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium" onClick={() => setOverdueFooterDialog("sale")}>
            New Sale
          </Button>
        </div>
        <AddVoucherDialog
          isOpen={!!overdueVoucherToEdit || !!overdueFooterDialog}
          onOpenChange={(open: boolean) => {
            if (!open) {
              setOverdueVoucherToEdit(null);
              setOverdueFooterDialog(null);
            }
          }}
          voucher={overdueVoucherToEdit}
          defaultTab={overdueFooterDialog || undefined}
          defaultVoucherData={overdueVoucherToEdit ? undefined : {}}
          onVoucherAction={() => { setOverdueVoucherToEdit(null); setOverdueFooterDialog(null); }}
        />
        <HistoryDialog
          voucher={historyVoucher}
          isOpen={!!historyVoucher}
          onOpenChange={(open) => !open && setHistoryVoucher(null)}
          onHistoryReset={() => setHistoryVoucher((prev: any) => prev ? { ...prev, history: [] } : null)}
        />
        {linkAdvancesVoucher && (
          <LinkAdvancesToVoucherDialog
            isOpen={!!linkAdvancesVoucher}
            onOpenChange={(open) => !open && setLinkAdvancesVoucher(null)}
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
            onOpenChange={(open) => !open && setLinkPaymentVoucher(null)}
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
      </>
    );
  }

  return (
    <>
      <ResponsiveMasterDetail
        title={partyMasterDetailTitle}
        mobileSelectionLabel={mobilePartyGroupSelectionLabel}
        mobileSelectionLabelClassName={mobilePartyGroupSelectionLabelClassName}
        balance={
          <span className={cn(
              "font-semibold",
              totalBalance >= 0 ? "text-green-600" : "text-red-600"
          )}>
              {formatCurrency(totalBalance, { showDrCr: true, noAnimation: true })}
          </span>
        }
        tabs={
          <Tabs value={activeView} onValueChange={setActiveView} className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="parties" className="flex-1">Parties</TabsTrigger>
              <TabsTrigger value="groups" className="flex-1">Groups</TabsTrigger>
            </TabsList>
          </Tabs>
        }
        listView={listView}
        detailView={detailView}
        isMobile={isMobile}
        mobileListOnly={true}
        hasSelectedItem={!!selected}
        onBackToList={onBackToList}
      />
      <AddVoucherDialog
        isOpen={!!overdueVoucherToEdit}
        onOpenChange={(open: boolean) => !open && setOverdueVoucherToEdit(null)}
        voucher={overdueVoucherToEdit}
        onVoucherAction={() => setOverdueVoucherToEdit(null)}
      />
      <HistoryDialog
        voucher={historyVoucher}
        isOpen={!!historyVoucher}
        onOpenChange={(open) => !open && setHistoryVoucher(null)}
        onHistoryReset={() => setHistoryVoucher((prev: any) => prev ? { ...prev, history: [] } : null)}
      />
      {linkAdvancesVoucher && (
        <LinkAdvancesToVoucherDialog
          isOpen={!!linkAdvancesVoucher}
          onOpenChange={(open) => !open && setLinkAdvancesVoucher(null)}
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
          onOpenChange={(open) => !open && setLinkPaymentVoucher(null)}
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
    </>
  );
}

export default function PartyPage() {
  return (
    // Keep useSearchParams consumer behind Suspense for Next.js static prerender compatibility.
    <Suspense fallback={<LoadingSpinner />}>
      <PartyPageContent />
    </Suspense>
  );
}
