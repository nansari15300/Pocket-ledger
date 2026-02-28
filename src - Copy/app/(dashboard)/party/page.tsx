
"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Search, User, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
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
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useIsMobile } from "@/hooks/use-mobile";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";

// Custom Hook
import { usePageMemory } from "@/hooks/usePageMemory";
import { isSystemParentGroup } from "@/lib/system-groups";

export default function PartyPage() {
  const { user } = useAuth();
  const { company, companyId } = useCompany();
  const { formatCurrency } = useDate();
  const { vouchers, loading: vouchersLoading, processedParties, processedPartiesForSelection, processedGroups: initialProcessedGroups, overdueTransactions, hasOverdueTransactions } = useVouchers();
  const { can } = usePermissions();
  const showApproveOnList =
    can("approve_transactions") &&
    company?.notificationSettings?.approve?.on === true &&
    company?.notificationSettings?.approve?.onList === true;
  const pendingApprovalByPartyId = useMemo(() => {
    if (!showApproveOnList || !vouchers?.length) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    vouchers.forEach((v: any) => {
      if (v.isApproved === true) return;
      if (v.partyId) {
        map[v.partyId] = (map[v.partyId] || 0) + 1;
      }
    });
    return map;
  }, [vouchers, showApproveOnList]);
  const pendingApprovalByGroupId = useMemo(() => {
    if (!showApproveOnList || !vouchers?.length || !processedParties?.length) return {} as Record<string, number>;
    const byParty: Record<string, number> = {};
    vouchers.forEach((v: any) => {
      if (v.isApproved === true) return;
      if (v.partyId) byParty[v.partyId] = (byParty[v.partyId] || 0) + 1;
    });
    const byGroup: Record<string, number> = {};
    processedParties.forEach((p: Party) => {
      if (!p.groupId) return;
      byGroup[p.groupId] = (byGroup[p.groupId] || 0) + (byParty[p.id] || 0);
    });
    return byGroup;
  }, [vouchers, processedParties, showApproveOnList]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isInitialMount = useRef(true);
  
  const [activeView, setActiveView] = useState("parties");
  const { isMobile, selected, setSelected } = useResponsiveListLayout<Party | Group>(`party_view_${activeView}`);

  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCreatePartyOpen, setIsCreatePartyOpen] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [partyDetailsDateRange, setPartyDetailsDateRange] = useState<DateRange | undefined>(undefined);
  const [groupDetailsDateRange, setGroupDetailsDateRange] = useState<DateRange | undefined>(undefined);
  const [overdueVoucherToEdit, setOverdueVoucherToEdit] = useState<any>(null);
  const [historyVoucher, setHistoryVoucher] = useState<any>(null);
  const [linkAdvancesVoucher, setLinkAdvancesVoucher] = useState<any>(null);
  const [linkPaymentVoucher, setLinkPaymentVoucher] = useState<any>(null);

  const selectedParty = activeView === 'parties' ? selected as Party : null;
  const selectedGroup = activeView === 'groups' ? selected as Group : null;

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

  const partiesForList = processedPartiesForSelection;
  
   const processedGroups = useMemo(() => {
    const ungrouped = processedPartiesForSelection.filter(p => !p.groupId);
    
    // Filter out report-only groups (isReportOnly: true) and system parent groups
    const userDefinedGroups = initialProcessedGroups.filter(g => {
        const anyG = g as any;
        const isReportOnly = anyG.isReportOnly === true;
        const isSystemParent =
          anyG.isSystemReserved === true ||
          isSystemParentGroup("groups", anyG.id);
        return !isReportOnly && !isSystemParent;
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
    vouchersLoading           
  );
  // ==================================

  // Restore selection when returning from details (e.g. /party?selected=xyz or /party?view=groups&selected=xyz)
  const selectedIdFromUrl = searchParams.get("selected");
  const viewFromUrl = searchParams.get("view");
  useEffect(() => {
    if (!selectedIdFromUrl) return;
    if (vouchersLoading) return;
    if (selectedIdFromUrl === OVERDUE_ACCOUNT_ID && overdueVirtualParty) {
      setActiveView("parties");
      setSelected(overdueVirtualParty);
      router.replace("/party", { scroll: false });
      return;
    }
    const groupItem = processedGroups.find((i) => i.id === selectedIdFromUrl);
    const partyItem = processedParties.find((i) => i.id === selectedIdFromUrl);
    const item = groupItem || partyItem;
    if (viewFromUrl === "groups" && groupItem) setActiveView("groups");
    else if (partyItem) setActiveView("parties");
    if (item) setSelected(item);
    router.replace("/party", { scroll: false });
  }, [selectedIdFromUrl, viewFromUrl, vouchersLoading, processedParties, processedGroups, overdueVirtualParty, setSelected, setActiveView, router]);

  const fetchUserName = useCallback(async (userId: string): Promise<string> => {
    if (userNames[userId]) return userNames[userId];
    try {
        const userDoc = await getDoc(doc(firestore, 'users', userId));
        if (userDoc.exists()) {
            return userDoc.data().displayName || userDoc.data().email || "Unknown";
        }
    } catch (e) {}
    return "Unknown";
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
    if (isMobile) {
        const path = item.id === OVERDUE_ACCOUNT_ID
          ? `/party?selected=${OVERDUE_ACCOUNT_ID}`
          : 'pan' in item ? `/party/${item.id}` : (item.id === 'ungrouped' ? '/party?view=groups' : `/party/group/${item.id}`);
        router.push(path);
    } else {
        setSelected(item);
    }
  };

  const partiesForSelectedGroup = useMemo(() => {
    if (!selectedGroup) return [];
    if (selectedGroup.id === 'ungrouped') {
        return processedPartiesForSelection.filter(p => !p.groupId);
    }
    return processedPartiesForSelection.filter(p => p.groupId === selectedGroup.id);
  }, [selectedGroup, processedPartiesForSelection]);

  // Filtered count for party list (matches PartyList logic: search + exclude system accounts)
  const filteredPartyCount = useMemo(() => {
    const searchLower = (searchTerm || "").toLowerCase();
    return (partiesForList || []).filter((p) => {
      if (!p.name) return false;
      const isSystemAccount = (p as any).isSystemAccount === true;
      const matchesSearch = searchLower ? p.name.toLowerCase().includes(searchLower) : true;
      return matchesSearch && !isSystemAccount;
    }).length;
  }, [partiesForList, searchTerm]);


  if (vouchersLoading) {
    return <LoadingSpinner />;
  }
  
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
  
  const listView = (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={activeView === 'parties' ? 'Search parties...' : 'Search groups...'} className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoComplete="off" />
        </div>
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
                    onClick={() => setSelected(overdueVirtualParty)}
                  >
                    <AlertCircle className="h-3.5 w-3 mr-1 shrink-0" />
                    Overdue Vouchers ({overdueTransactions.length})
                  </Button>
                )}
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <PartyList
                parties={partiesForList}
                onSelectParty={handleSelect}
                selectedParty={selectedParty}
                searchTerm={searchTerm}
                topPartyId={hasOverdueTransactions ? OVERDUE_ACCOUNT_ID : undefined}
                overdueVoucherCount={hasOverdueTransactions ? overdueTransactions.length : undefined}
                pendingApprovalByPartyId={pendingApprovalByPartyId}
              />
              </div>
            </>
        ) : (
            <PartyGroupList groups={processedGroups} onSelectGroup={handleSelect} selectedGroup={selectedGroup} searchTerm={searchTerm} collapsible={false} pendingApprovalByGroupId={pendingApprovalByGroupId} />
        )}
    </div>
  );

  const detailView = (
    <>
      {activeView === 'parties' && selectedParty?.id === OVERDUE_ACCOUNT_ID && (
        <OverdueAccountView
          overdueTransactions={overdueTransactions}
          userNames={userNames}
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
        <PartyDetails party={selectedParty} allParties={processedParties} onPartyUpdated={() => {}} onPartyDeleted={() => setSelected(null)} dateRange={partyDetailsDateRange} onDateRangeChange={setPartyDetailsDateRange} userNames={userNames} />
      )}
      {activeView === 'groups' && selectedGroup && (
        <GroupDetails group={selectedGroup} allGroups={processedGroups} allParties={partiesForSelectedGroup} onGroupUpdated={() => {}} onGroupDeleted={() => setSelected(null)} onPartyUpdated={() => {}} dateRange={groupDetailsDateRange} onDateRangeChange={setGroupDetailsDateRange} userNames={userNames} />
      )}
      {!selected && <div className="p-6 text-center text-muted-foreground">Select an item to see details</div>}
    </>
  );

  return (
    <>
      <ResponsiveMasterDetail
        title="Parties"
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
      />
      <AddVoucherDialog
        isOpen={!!overdueVoucherToEdit}
        onOpenChange={(open) => !open && setOverdueVoucherToEdit(null)}
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
