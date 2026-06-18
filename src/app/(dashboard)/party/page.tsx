
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
import { Search, User, Users, AlertCircle, ArrowLeft, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn, masterDetailBalanceToneClass } from "@/lib/utils";
import { mlc } from "@/lib/mobileListChrome";
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
import { resolveMasterListSelection } from "@/lib/masterEntityLiveUpdate";
import usePermissions from "@/hooks/usePermissions";
import type { Party, Group } from "@/components/party/types";
import { useResponsiveListLayout } from "@/hooks/useResponsiveListLayout";
import { ResponsiveMasterDetail } from "@/components/layout/ResponsiveMasterDetail";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { applyPaymentBillWiseLinkAllocations } from "@/lib/voucherActionsClient";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMasterDetailQueryNav } from "@/hooks/useMasterDetailQueryNav";
import { useRegisterMasterDetailHardwareBack } from "@/hooks/useRegisterMasterDetailHardwareBack";
import { useSyncMasterDetailHeaderId } from "@/hooks/useSyncMasterDetailHeaderId";
import { masterDetailListHref } from "@/lib/masterDetailListPath";
import {
  masterDetailTabHref,
  replaceMasterDetailTabUrl,
  tabSwitchSelection,
} from "@/lib/masterDetailTabChange";
import type { DateRange } from "@/components/ui/ad-calendar";
import { toast } from "sonner";
import { useBalanceMode } from "@/hooks/useBalanceMode";
import { TransactionsTable } from "@/components/vouchers/TransactionsTable";
import { getTransactionQuickSearchHaystack } from "@/components/vouchers/transactionTableShared";

// Custom Hook
import { usePageMemory } from "@/hooks/usePageMemory";
import { isSystemParentGroup } from "@/lib/system-groups";
import { shouldReplaceWithMasterDetailCanonical } from "@/lib/maybeReplaceMasterDetailUrl";
import { appendPreservedModalQueryToHref } from "@/lib/modalUrlSync";
import { consumeMasterDetailSidebarListNav } from "@/lib/masterDetailSidebarNav";
import { usePendingApprovalListFilter } from "@/hooks/usePendingApprovalListFilter";
import { collectPartyIdsTouchedByUnapprovedVoucher } from "@/lib/voucherTouchesPartyLedger";
import { PendingApprovalListFilterBadge } from "@/components/layout/PendingApprovalListFilterBadge";
import { MasterListViewShell } from "@/components/layout/MasterListViewShell";
import {
  type EntityListQuickFilter,
} from "@/components/entity/EntityListQuickFilterBar";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
import { openAttachmentInApp } from "@/lib/openAttachmentInApp";
import { trimEntityFileUrlForPreview } from "@/lib/trimEntityFileUrlForPreview";
import {
  matchesOverdueImportanceFilter,
  readOverdueImportanceFilter,
  writeOverdueImportanceFilter,
  type OverdueImportanceFilter,
} from "@/lib/overdueImportanceFilter";
/** Tab `replaceState` ke baad `useSearchParams` stale reh sakta hai — address bar (location) pehle. */
function readPartyPageUrlState(viewFromUrl: string | null, selectedIdFromUrl: string | null) {
  if (typeof window === "undefined") {
    return { view: viewFromUrl, selectedId: selectedIdFromUrl };
  }
  const loc = new URLSearchParams(window.location.search);
  // `view` bhi location-only — replaceState `/party` ke baad stale searchParams.view=groups se wapas Groups mat kholo
  const view = loc.has("view") ? loc.get("view") : null;
  // URL me `selected` param nahi → stale searchParams.selected ignore (Groups tab switch fix)
  const selectedId = loc.has("selected") ? loc.get("selected") : null;
  return { view, selectedId };
}

/** partyPageState.selections — tab click par turant row pick (useEffect wait nahi). */
function readPartyPageSelectionsFromStorage(): Record<string, string> {
  try {
    const raw = localStorage.getItem("partyPageState");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { selections?: Record<string, string> };
    return parsed?.selections ?? {};
  } catch {
    return {};
  }
}

/** Active tab ki list se memory / pehli real row — Overdue default skip. */
function pickPartyTabSelection(
  tab: "parties" | "groups",
  parties: Party[],
  groups: Group[]
): Party | Group | null {
  const items = tab === "parties" ? parties : groups;
  if (items.length === 0) return null;
  const remembered = readPartyPageSelectionsFromStorage()[tab];
  if (remembered) {
    const found = items.find((i) => i.id === remembered);
    if (found) return found;
  }
  return items.find((i) => i.id !== OVERDUE_ACCOUNT_ID) ?? items[0] ?? null;
}

function partyTabCanonicalHref(tab: "parties" | "groups", item: { id: string } | null): string {
  const base = masterDetailListHref("party");
  if (!item) return tab === "groups" ? `${base}?view=groups` : base;
  if (tab === "groups") {
    return `${base}?view=groups&selected=${encodeURIComponent(item.id)}`;
  }
  if (item.id === OVERDUE_ACCOUNT_ID) {
    return `${base}?selected=${encodeURIComponent(OVERDUE_ACCOUNT_ID)}`;
  }
  return `${base}?selected=${encodeURIComponent(item.id)}`;
}

function PartyPageContent() {
  const { user } = useAuth();
  // Pehle company context: warna vouchersLoading false ho kar khali list flash, phir company aate hi dubara paint (Poora page jump).
  const { company, companyId, loading: companyLoading, effectiveNotificationSettings } = useCompany();
  const { formatCurrency } = useDate();
  const { vouchers, loading: vouchersLoading, processedParties, processedPartiesForSelection, processedGroups: initialProcessedGroups, overdueTransactions, hasOverdueTransactions, userNames: voucherUserNames, journalAccountNames } = useVouchers();
  const waitingForCompany = Boolean(companyId && (companyLoading || !company));
  const pageColdLoading = waitingForCompany || (vouchersLoading && processedParties.length === 0);
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
  const selectedIdFromUrl = searchParams.get("selected");
  const viewFromUrl = searchParams.get("view");
  const isInitialMount = useRef(true);
  /** List click turant select — URL effect stale ?selected= se peeche wala row na khole */
  const pendingPartySelectIdRef = useRef<string | null>(null);
  /** Mobile back → list: partyPageState / URL restore se detail dubara na khule */
  const suppressPartyListRestoreRef = useRef(false);
  const { setBalanceMode } = useBalanceMode();

  const [activeView, setActiveView] = useState(() => {
    // Refresh / ?view=groups deep link — pehla paint sahi tab
    if (typeof window === "undefined") return "parties";
    return new URLSearchParams(window.location.search).get("view") === "groups" ? "groups" : "parties";
  });
  const { isMobile, selected, setSelected } = useResponsiveListLayout<Party | Group>(`party_view_${activeView}`);
  // APK/static: mobile list-detail + hardware back — sirf `isMobile` par mat band karo (PC mode tablet)
  const useQueryNav = useMasterDetailQueryNav();
  const mobileMasterDetail = useQueryNav;

  // List farkina: replace (push jasto double history hoina) + hardware back ma pani (Capacitor) yahi logic
  const onBackToList = useCallback(() => {
    pendingPartySelectIdRef.current = null;
    suppressPartyListRestoreRef.current = true;
    const base = masterDetailListHref("party");
    // Groups tab se detail se wapas aane par URL me `view=groups` rakho — warna bare `/party` pe memory/effect Parties pe kheench leta hai
    const href = activeView === "groups" ? `${base}?view=groups` : base;
    // Pehle URL + memory clear — phir selected null (sync effect purani ?selected= se detail na khole)
    if (typeof window !== "undefined") {
      try {
        window.history.replaceState(window.history.state, "", href);
        const raw = localStorage.getItem("partyPageState");
        if (raw) {
          const parsed = JSON.parse(raw) as { selections?: Record<string, string> };
          if (parsed.selections?.[activeView]) {
            delete parsed.selections[activeView];
            localStorage.setItem("partyPageState", JSON.stringify(parsed));
          }
        }
      } catch {
        /* ignore */
      }
    }
    setSelected(null);
    router.replace(href, { scroll: false });
  }, [setSelected, router, activeView]);
  useRegisterMasterDetailHardwareBack("party", onBackToList);

  const [searchTerm, setSearchTerm] = useState("");
  const [partyListQuickFilter, setPartyListQuickFilter] = useState<EntityListQuickFilter>("default");
  const [groupListQuickFilter, setGroupListQuickFilter] = useState<EntityListQuickFilter>("default");
  /** Party list: sirf un jinke paas pending approval (count box click toggle) */
  const {
    showOnlyEntities: showOnlyPartiesWithPendingApproval,
    setShowOnlyEntities: setShowOnlyPartiesWithPendingApproval,
    showOnlyGroups: showOnlyPartyGroupsWithPendingApproval,
    setShowOnlyGroups: setShowOnlyPartyGroupsWithPendingApproval,
  } = usePendingApprovalListFilter(totalPendingApprovalVoucherCount);
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
  /** Overdue se voucher dialog khula — save/cancel ke baad overdue detail par wapas */
  const editingFromOverdueRef = useRef(false);
  const [historyVoucher, setHistoryVoucher] = useState<any>(null);
  const [linkAdvancesVoucher, setLinkAdvancesVoucher] = useState<any>(null);
  const [linkPaymentVoucher, setLinkPaymentVoucher] = useState<any>(null);
  const [overdueMobileSearchTerm, setOverdueMobileSearchTerm] = useState("");
  const [overdueFilters, setOverdueFilters] = useState<Record<string, string>>({});
  const [overdueActiveFilter, setOverdueActiveFilter] = useState<string | null>(null);
  const [overdueFooterDialog, setOverdueFooterDialog] = useState<null | "payment_in" | "payment_out" | "sale">(null);
  const [overdueImportanceFilter, setOverdueImportanceFilter] = useState<OverdueImportanceFilter>(() =>
    readOverdueImportanceFilter()
  );
  const handleOverdueImportanceFilterChange = useCallback((next: OverdueImportanceFilter) => {
    setOverdueImportanceFilter(next);
    writeOverdueImportanceFilter(next);
  }, []);
  const overdueTransactionsForView = useMemo(
    () => overdueTransactions.filter((t) => matchesOverdueImportanceFilter(t, overdueImportanceFilter)),
    [overdueTransactions, overdueImportanceFilter]
  );
  const [overdueShowNarration, setOverdueShowNarration] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return sessionStorage.getItem("showNarration") !== "false";
    } catch {
      return true;
    }
  });

  const selectedPartyRaw = activeView === 'parties' ? selected as Party : null;
  const selectedParty = useMemo(
    () => resolveMasterListSelection(selectedPartyRaw, processedPartiesForSelection),
    [selectedPartyRaw, processedPartiesForSelection]
  );
  const selectedGroup = activeView === 'groups' ? selected as Group : null;
  const handlePartyUpdated = useCallback((patch?: Partial<Party>) => {
    if (!patch?.id || !selectedPartyRaw || selectedPartyRaw.id !== patch.id) return;
    setSelected({ ...selectedPartyRaw, ...patch });
  }, [setSelected, selectedPartyRaw]);
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
  /** Mobile party ledger: master row me "Parties" ki jagah context clear ("Party details" + naam). */
  const responsiveMasterDetailTitle = useMemo(() => {
    if (isMobile && selectedParty) return "Party details";
    return partyMasterDetailTitle;
  }, [isMobile, selectedParty, partyMasterDetailTitle]);
  const mobileDetailHeaderAvatar = useMemo(() => {
    if (!isMobile || !selectedParty) return null;
    // Fixed 8x8 slot: keep box size same, avatar sits with 1px inset on all sides.
    // `"null"` string / khali fileUrl — bina file ke hover PDF na kholo
    const attachmentUrl = trimEntityFileUrlForPreview((selectedParty as any).fileUrl);
    const initials = (selectedParty.name || "NA")
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
    const openPreview = () => {
      // Mobile header avatar tap: open full in-app attachment preview.
      if (!attachmentUrl) return;
      void openAttachmentInApp(attachmentUrl, { title: selectedParty.name });
    };
    return (
      <div className="h-8 w-8 border-l border-border flex items-center justify-center p-px">
        <EntityFileAttachmentHover fileUrl={attachmentUrl} triggerClassName="inline-flex rounded-full">
          <button
            type="button"
            className="inline-flex h-full w-full items-center justify-center rounded-full"
            onClick={openPreview}
            aria-label={`Preview ${selectedParty.name} avatar`}
          >
            <ResolvedEntityAvatar
              className="h-full w-full text-xs"
              src={attachmentUrl ?? undefined}
              alt={selectedParty.name}
              fallbackText={initials || "NA"}
            />
          </button>
        </EntityFileAttachmentHover>
      </div>
    );
  }, [isMobile, selectedParty]);
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
    return overdueTransactionsForView.map((row) => {
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
        createdAt: (row as any).createdAt ?? (v as any)?.createdAt,
        lastEditedAt: (row as any).lastEditedAt ?? (v as any)?.lastEditedAt,
        updatedAt: (row as any).updatedAt ?? (v as any)?.updatedAt,
        dueDate: row.dueDate,
        isApproved: v?.isApproved,
        partyName: row.partyName,
      };
    });
  }, [overdueTransactionsForView, vouchers]);

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
  /** usePageMemory: overdue virtual row list me — save ke baad __overdue__ valid rahe */
  const partiesForPageMemory = useMemo(() => {
    if (!overdueVirtualParty) return partiesForList;
    return [overdueVirtualParty, ...partiesForList];
  }, [partiesForList, overdueVirtualParty]);
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

  const groupsForPartyGroupListView = useMemo(() => {
    if (!showOnlyPartyGroupsWithPendingApproval || !showApproveOnList) return processedGroups;
    return processedGroups.filter((g) => (pendingApprovalByGroupId[g.id] ?? 0) > 0);
  }, [processedGroups, showOnlyPartyGroupsWithPendingApproval, showApproveOnList, pendingApprovalByGroupId]);

  const partyUrlState = useMemo(
    () => readPartyPageUrlState(viewFromUrl, selectedIdFromUrl),
    [viewFromUrl, selectedIdFromUrl, activeView]
  );

  // URL sync effect ko har voucher snapshot par re-run na karo — refs se latest lists
  const processedPartiesRef = useRef(processedParties);
  const processedGroupsRef = useRef(processedGroups);
  const selectedRef = useRef(selected);
  const activeViewRef = useRef(activeView);
  processedPartiesRef.current = processedParties;
  processedGroupsRef.current = processedGroups;
  selectedRef.current = selected;
  activeViewRef.current = activeView;
  const overdueVirtualPartyRef = useRef(overdueVirtualParty);
  overdueVirtualPartyRef.current = overdueVirtualParty;

  // ========== MEMORY LOGIC ==========
  usePageMemory(
    "partyPageState",
    activeView,
    setActiveView,
    selected,
    setSelected,
    activeView === "parties" ? partiesForPageMemory : processedGroups,
    pageDataLoading,
    isMobile, // static PC: auto-select chalu — `useQueryNav` sirf URL/mobile list-first ke liye
    partyUrlState.selectedId,
    undefined,
    [OVERDUE_ACCOUNT_ID]
  );
  // ==================================

  /** Sidebar Parties click — saved detail / memory skip, sirf list kholo */
  useEffect(() => {
    if (pageDataLoading) return;
    if (!consumeMasterDetailSidebarListNav("party")) return;
    suppressPartyListRestoreRef.current = true;
    pendingPartySelectIdRef.current = null;
    const href =
      activeView === "groups"
        ? `${masterDetailListHref("party")}?view=groups`
        : masterDetailListHref("party");
    if (typeof window !== "undefined") {
      try {
        window.history.replaceState(window.history.state, "", href);
        const raw = localStorage.getItem("partyPageState");
        if (raw) {
          const parsed = JSON.parse(raw) as { selections?: Record<string, string> };
          if (parsed.selections) {
            delete parsed.selections.parties;
            delete parsed.selections.groups;
            localStorage.setItem("partyPageState", JSON.stringify(parsed));
          }
        }
      } catch {
        /* ignore */
      }
    }
    setSelected(null);
  }, [pageDataLoading, selectedIdFromUrl, viewFromUrl, activeView, setSelected]);

  // URL ↔ tab/selection sync (location-first — stale ?selected= se Groups tab wapas Parties mat kheecho)
  useEffect(() => {
    if (pageDataLoading) return;
    const { view, selectedId } = readPartyPageUrlState(viewFromUrl, selectedIdFromUrl);
    const currentSelectedId = selectedRef.current?.id ?? null;
    const currentActiveView = activeViewRef.current;

    // User ne abhi click kiya — router.replace / useSearchParams peeche ho to purana id mat lagao
    const pendingId = pendingPartySelectIdRef.current;
    if (pendingId) {
      if (selectedId === pendingId) {
        pendingPartySelectIdRef.current = null;
      } else if (currentSelectedId === pendingId) {
        return;
      }
    }

    if (!selectedId) {
      if (view === "groups") {
        // Sirf tab align — selection tab handler / usePageMemory; null se list flash mat karo
        if (currentActiveView !== "groups") {
          setActiveView("groups");
        }
      } else if (currentActiveView !== "parties") {
        setActiveView("parties");
      }
      return;
    }

    if (selectedId === OVERDUE_ACCOUNT_ID) {
      const overdueParty = overdueVirtualPartyRef.current;
      if (!overdueParty) return;
      if (currentActiveView !== "parties") setActiveView("parties");
      if (currentSelectedId !== OVERDUE_ACCOUNT_ID) setSelected(overdueParty);
      const overdueUrl = `/party?selected=${encodeURIComponent(OVERDUE_ACCOUNT_ID)}`;
      if (shouldReplaceWithMasterDetailCanonical(overdueUrl)) {
        router.replace(overdueUrl, { scroll: false });
      }
      return;
    }
    const groupItem = processedGroupsRef.current.find((i) => i.id === selectedId);
    const partyItem = processedPartiesRef.current.find((i) => i.id === selectedId);
    let targetView = currentActiveView;
    if (groupItem && partyItem) {
      targetView = view === "groups" ? "groups" : "parties";
    } else if (view === "groups" && groupItem) targetView = "groups";
    else if (partyItem) targetView = "parties";
    else if (groupItem) targetView = "groups";
    if (targetView !== currentActiveView) setActiveView(targetView);
    const item =
      groupItem && partyItem
        ? view === "groups"
          ? groupItem
          : partyItem
        : groupItem || partyItem;
    if (item && item.id !== currentSelectedId) setSelected(item);
    const canonical =
      view === "groups"
        ? `/party?view=groups&selected=${encodeURIComponent(selectedId)}`
        : `/party?selected=${encodeURIComponent(selectedId)}`;
    const canonicalWithModal = appendPreservedModalQueryToHref(canonical);
    if (shouldReplaceWithMasterDetailCanonical(canonicalWithModal)) {
      router.replace(canonicalWithModal, { scroll: false });
    }
  }, [
    viewFromUrl,
    selectedIdFromUrl,
    pageDataLoading,
    setSelected,
    setActiveView,
    router,
  ]);

  /** Refresh / bare `/party`: URL na ho to partyPageState ya selectedItemId se party restore — Overdue default na kholo */
  useEffect(() => {
    if (pageDataLoading) return;
    // Mobile list-first: back ke baad memory se detail mat kholo (static PC refresh restore chalu)
    if (isMobile) return;
    if (suppressPartyListRestoreRef.current) return;
    const { view, selectedId } = readPartyPageUrlState(viewFromUrl, selectedIdFromUrl);
    if (selectedId) return;
    if (view === "groups") return;
    if (activeView !== "parties") return;
    if (selected?.id && selected.id !== OVERDUE_ACCOUNT_ID) return;

    let rememberedId: string | null = null;
    try {
      const raw = localStorage.getItem("partyPageState");
      if (raw) {
        const parsed = JSON.parse(raw) as { selections?: Record<string, string> };
        rememberedId = parsed?.selections?.parties ?? null;
      }
    } catch {
      /* ignore */
    }
    if (!rememberedId && typeof window !== "undefined") {
      rememberedId = localStorage.getItem(`selectedItemId_party_view_parties`);
    }
    if (!rememberedId || rememberedId === OVERDUE_ACCOUNT_ID) return;

    const party = processedParties.find((p) => p.id === rememberedId);
    if (!party || party.id === selected?.id) return;

    setSelected(party);
    const canonical = `/party?selected=${encodeURIComponent(rememberedId)}`;
    if (shouldReplaceWithMasterDetailCanonical(canonical)) {
      router.replace(canonical, { scroll: false });
    }
  }, [
    pageDataLoading,
    selectedIdFromUrl,
    viewFromUrl,
    activeView,
    processedParties,
    selected?.id,
    setSelected,
    router,
    isMobile,
    mobileMasterDetail,
  ]);

  /** Parties tab + selected id kisi group row se match ho (same id edge) to selection clear. */
  useEffect(() => {
    if (pageDataLoading) return;
    if (activeView !== "parties") return;
    const sid = selected?.id;
    if (!sid) return;
    if (!processedGroups.some((g) => g.id === sid)) return;
    setSelected(null);
  }, [pageDataLoading, activeView, selected?.id, processedGroups, setSelected]);

  /** Tab switch — turant list row select (null + useEffect = 1–7s random delay fix). */
  const handlePartyGroupsTabChange = useCallback(
    (value: string) => {
      const tab: "parties" | "groups" = value === "groups" ? "groups" : "parties";
      const nextSelected = tabSwitchSelection(
        isMobile,
        pickPartyTabSelection(tab, partiesForPageMemory, processedGroups)
      );
      suppressPartyListRestoreRef.current = false;
      pendingPartySelectIdRef.current = nextSelected?.id ?? null;
      setActiveView(tab);
      setSelected(nextSelected);
      const href = isMobile
        ? masterDetailTabHref("party", { tab, defaultTab: "parties", listOnly: true })
        : partyTabCanonicalHref(tab, nextSelected);
      replaceMasterDetailTabUrl(href, router, useQueryNav);
      try {
        const raw = localStorage.getItem("partyPageState");
        const parsed = raw ? JSON.parse(raw) : { selections: {} };
        parsed.activeView = tab;
        if (nextSelected?.id) {
          parsed.selections = { ...(parsed.selections ?? {}), [tab]: nextSelected.id };
        }
        localStorage.setItem("partyPageState", JSON.stringify(parsed));
      } catch {
        /* ignore */
      }
    },
    [partiesForPageMemory, processedGroups, setActiveView, setSelected, useQueryNav, router, isMobile]
  );

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

  // Company switch: search + detail selection reset — purani company ki party list/detail na dikhe.
  useEffect(() => {
    setSearchTerm("");
    setSelected(null);
    pendingPartySelectIdRef.current = null;
    suppressPartyListRestoreRef.current = true;
  }, [companyId, setSelected]);
  useEffect(() => {
    setShowOnlyPartiesWithPendingApproval(false);
    setShowOnlyPartyGroupsWithPendingApproval(false);
  }, [companyId]);
  useEffect(() => {
    if (activeView !== "parties") setShowOnlyPartiesWithPendingApproval(false);
    if (activeView !== "groups") setShowOnlyPartyGroupsWithPendingApproval(false);
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

  const restoreOverdueDetailAfterVoucherDialog = useCallback(() => {
    if (!editingFromOverdueRef.current || !overdueVirtualParty) return;
    editingFromOverdueRef.current = false;
    setActiveView("parties");
    setSelected(overdueVirtualParty);
    const overdueUrl = `/party?selected=${encodeURIComponent(OVERDUE_ACCOUNT_ID)}`;
    if (useQueryNav && shouldReplaceWithMasterDetailCanonical(overdueUrl)) {
      router.replace(overdueUrl, { scroll: false });
    }
  }, [overdueVirtualParty, setSelected, setActiveView, useQueryNav, router]);

  const handleSelect = useCallback((item: Party | Group) => {
    suppressPartyListRestoreRef.current = false;
    pendingPartySelectIdRef.current = item.id;
    setSelected(item);
    // Har viewport: ?selected= URL sync — refresh / wapas aane par wahi party/group khule
    const path =
      item.id === OVERDUE_ACCOUNT_ID
        ? `/party?selected=${encodeURIComponent(OVERDUE_ACCOUNT_ID)}`
        : "pan" in item
          ? `/party?selected=${encodeURIComponent(item.id)}`
          : `/party?view=groups&selected=${encodeURIComponent(item.id)}`;
    // replaceState pehle — URL effect ko turant sahi id mile (1-click-late bug fix)
    if (typeof window !== "undefined") {
      try {
        window.history.replaceState(window.history.state, "", path);
      } catch {
        /* ignore */
      }
    }
    router.replace(path, { scroll: false });
  }, [router, setSelected]);

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

  if (pageColdLoading) {
    return <LoadingSpinner />;
  }
  
  const partyTabsEl = (
    <Tabs value={activeView} onValueChange={handlePartyGroupsTabChange} className="w-full">
      <TabsList listChrome>
        <TabsTrigger listChrome value="parties" className="flex-1">Parties</TabsTrigger>
        <TabsTrigger listChrome value="groups" className="flex-1">Groups</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  const partySearchRowEl = (
    <div className={mlc.searchRow}>
      <div className={mlc.searchWrap}>
        <Search className={mlc.searchIcon} />
        <Input
          placeholder={activeView === "parties" ? "Search parties..." : "Search groups..."}
          listChrome
          listChromeSearch
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          autoComplete="off"
        />
      </div>
      {activeView === "parties" && showApproveOnList && totalPendingApprovalVoucherCount > 0 ? (
        <PendingApprovalListFilterBadge
          compact
          count={totalPendingApprovalVoucherCount}
          pressed={showOnlyPartiesWithPendingApproval}
          onToggle={() => setShowOnlyPartiesWithPendingApproval((v) => !v)}
          tooltipFilterHint={`Only parties with pending approval — ${totalPendingApprovalVoucherCount} voucher(s) (click)`}
          tooltipShowAllHint="Show all parties (click)"
          ariaLabelFilter={`Filter ${totalPendingApprovalVoucherCount} pending approval vouchers`}
          ariaLabelShowAll="Show all parties"
        />
      ) : null}
      {activeView === "groups" && showApproveOnList && totalPendingApprovalVoucherCount > 0 ? (
        <PendingApprovalListFilterBadge
          compact
          count={totalPendingApprovalVoucherCount}
          pressed={showOnlyPartyGroupsWithPendingApproval}
          onToggle={() => setShowOnlyPartyGroupsWithPendingApproval((v) => !v)}
          tooltipFilterHint={`Only groups with pending approval — ${totalPendingApprovalVoucherCount} voucher(s) (click)`}
          tooltipShowAllHint="Show all groups (click)"
          ariaLabelFilter={`Filter ${totalPendingApprovalVoucherCount} pending approval vouchers`}
          ariaLabelShowAll="Show all groups"
        />
      ) : null}
      {activeView === "parties" ? (
        <CreatePartyDialog onPartyCreated={() => {}} isOpen={isCreatePartyOpen} onOpenChange={setIsCreatePartyOpen}>
          <PermissionButton permission="create_records" variant="chromePill" size="list" onClick={() => setIsCreatePartyOpen(true)}>
            + Add Party
          </PermissionButton>
        </CreatePartyDialog>
      ) : (
        <CreateGroupDialog onGroupCreated={() => {}} groups={processedGroups} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
          <PermissionButton permission="create_records" variant="chromePill" size="list" onClick={() => setIsCreateGroupOpen(true)}>
            + Add Group
          </PermissionButton>
        </CreateGroupDialog>
      )}
    </div>
  );

  const partySectionLabelEl = (
    <div className={cn(mlc.sectionLabelRow, "justify-between", isMobile && "px-[2px]")}>
      <div className="flex items-center gap-2">
        <User className={mlc.sectionIcon} />
        <span>Party ({filteredPartyCount})</span>
      </div>
      {hasOverdueTransactions && overdueVirtualParty ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs font-medium border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/40 dark:hover:text-amber-100"
          onClick={() => handleSelect(overdueVirtualParty)}
        >
          <AlertCircle className="h-3.5 w-3 mr-1 shrink-0" />
          Overdue Vouchers ({overdueTransactions.length})
        </Button>
      ) : null}
    </div>
  );

  const groupSectionLabelEl = (
    <div className={cn(mlc.sectionLabelRow, isMobile && "px-[2px]")}>
      <Users className={mlc.sectionIcon} />
      <span>Party group ({groupsForPartyGroupListView.length})</span>
    </div>
  );

  const listView = (
    <MasterListViewShell
      isMobile={isMobile}
      searchRow={partySearchRowEl}
      sectionLabel={activeView === "parties" ? partySectionLabelEl : groupSectionLabelEl}
      tabs={partyTabsEl}
      quickFilter={activeView === "parties" ? partyListQuickFilter : groupListQuickFilter}
      onQuickFilterChange={
        activeView === "parties" ? setPartyListQuickFilter : setGroupListQuickFilter
      }
    >
      <div className="relative h-full min-h-0 w-full overflow-hidden">
        <div
          className={cn(
            "absolute inset-0 flex h-full min-h-0 flex-col overflow-hidden",
            activeView !== "parties" && "hidden pointer-events-none"
          )}
          aria-hidden={activeView !== "parties"}
        >
          <PartyList
            parties={partiesForPartyListView}
            onSelectParty={handleSelect}
            selectedParty={selectedParty}
            searchTerm={searchTerm}
            topPartyId={hasOverdueTransactions ? OVERDUE_ACCOUNT_ID : undefined}
            overdueVoucherCount={hasOverdueTransactions ? overdueTransactions.length : undefined}
            pendingApprovalByPartyId={pendingApprovalByPartyId}
            getItemHref={useQueryNav ? (p) => (p.id === OVERDUE_ACCOUNT_ID ? undefined : `/party?selected=${p.id}`) : undefined}
            quickFilter={partyListQuickFilter}
            onQuickFilterChange={setPartyListQuickFilter}
            hideQuickFilterBar
          />
        </div>
        <div
          className={cn(
            "absolute inset-0 flex h-full min-h-0 flex-col overflow-hidden",
            activeView !== "groups" && "hidden pointer-events-none"
          )}
          aria-hidden={activeView !== "groups"}
        >
          <PartyGroupList
            groups={groupsForPartyGroupListView}
            onSelectGroup={handleSelect}
            selectedGroup={selectedGroup}
            searchTerm={searchTerm}
            collapsible={false}
            pendingApprovalByGroupId={pendingApprovalByGroupId}
            getItemHref={useQueryNav ? (g) => `/party?view=groups&selected=${g.id}` : undefined}
            quickFilter={groupListQuickFilter}
            onQuickFilterChange={setGroupListQuickFilter}
            hideQuickFilterBar
            hideCategoryHeaders={isMobile}
          />
        </div>
      </div>
    </MasterListViewShell>
  );

  const detailView = (
    <>
      {activeView === 'parties' && selectedParty?.id === OVERDUE_ACCOUNT_ID && (
        <OverdueAccountView
          overdueTransactions={overdueTransactions}
          importanceFilter={overdueImportanceFilter}
          onImportanceFilterChange={handleOverdueImportanceFilterChange}
          userNames={mergedUserNames}
          onEditVoucher={(row: OverdueTransactionRow) => {
            const voucher = vouchers.find((v) => v.id === row.id);
            if (voucher) {
              editingFromOverdueRef.current = true;
              setOverdueVoucherToEdit(voucher);
            }
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
        <PartyDetails party={selectedParty} allParties={processedParties} onPartyUpdated={handlePartyUpdated} onPartyDeleted={() => setSelected(null)} dateRange={partyDetailsDateRange} onDateRangeChange={setPartyDetailsDateRange} userNames={mergedUserNames} />
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
      if (voucher) {
        editingFromOverdueRef.current = true;
        setOverdueVoucherToEdit(voucher);
      }
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
          {/* Row 2: All / Important / Normal — desktop overdue header jaisa */}
          <div className="px-2 py-1.5 border-b flex justify-center items-center gap-2 flex-shrink-0">
            <Button
              type="button"
              variant={overdueImportanceFilter === "all" ? "default" : "outline"}
              size="sm"
              className="h-8"
              onClick={() => handleOverdueImportanceFilterChange("all")}
            >
              All
            </Button>
            <Button
              type="button"
              variant={overdueImportanceFilter === "important" ? "default" : "outline"}
              size="sm"
              className="h-8"
              onClick={() => handleOverdueImportanceFilterChange("important")}
            >
              Important
            </Button>
            <Button
              type="button"
              variant={overdueImportanceFilter === "normal" ? "default" : "outline"}
              size="sm"
              className="h-8"
              onClick={() => handleOverdueImportanceFilterChange("normal")}
            >
              Normal
            </Button>
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
          <Button className="flex-1 h-6 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-medium" onClick={() => { editingFromOverdueRef.current = true; setOverdueFooterDialog("payment_in"); }}>
            Receive
          </Button>
          <Button className="flex-1 h-6 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium" onClick={() => { editingFromOverdueRef.current = true; setOverdueFooterDialog("payment_out"); }}>
            Pay
          </Button>
          <Button className="flex-1 h-6 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium" onClick={() => { editingFromOverdueRef.current = true; setOverdueFooterDialog("sale"); }}>
            New Sale
          </Button>
        </div>
        <AddVoucherDialog
          isOpen={!!overdueVoucherToEdit || !!overdueFooterDialog}
          onOpenChange={(open: boolean) => {
            if (!open) {
              setOverdueVoucherToEdit(null);
              setOverdueFooterDialog(null);
              restoreOverdueDetailAfterVoucherDialog();
            }
          }}
          voucher={overdueVoucherToEdit}
          defaultTab={overdueFooterDialog || undefined}
          defaultVoucherData={overdueVoucherToEdit ? undefined : {}}
          onVoucherAction={() => {
            setOverdueVoucherToEdit(null);
            setOverdueFooterDialog(null);
            restoreOverdueDetailAfterVoucherDialog();
          }}
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
                await applyPaymentBillWiseLinkAllocations(companyId, linkPaymentVoucher, allocations);
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
        listChromeRouteKey="party"
        mobileTabsDocked={isMobile}
        title={responsiveMasterDetailTitle}
        mobileSelectionLabel={mobilePartyGroupSelectionLabel}
        mobileSelectionLabelClassName={mobilePartyGroupSelectionLabelClassName}
        mobileDetailHeaderEnd={mobileDetailHeaderAvatar}
        balance={
          <span className={cn(
              "font-semibold",
              totalBalance >= 0 ? "text-green-600" : "text-red-600"
          )}>
              {formatCurrency(totalBalance, { showDrCr: true, noAnimation: true })}
          </span>
        }
        tabs={isMobile ? undefined : partyTabsEl}
        listView={listView}
        detailView={detailView}
        isMobile={isMobile}
        mobileListOnly={true}
        hasSelectedItem={!!selected}
        onBackToList={onBackToList}
      />
      <AddVoucherDialog
        isOpen={!!overdueVoucherToEdit}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setOverdueVoucherToEdit(null);
            restoreOverdueDetailAfterVoucherDialog();
          }
        }}
        voucher={overdueVoucherToEdit}
        onVoucherAction={() => {
          setOverdueVoucherToEdit(null);
          restoreOverdueDetailAfterVoucherDialog();
        }}
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
              await applyPaymentBillWiseLinkAllocations(companyId, linkPaymentVoucher, allocations);
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
