"use client";

import { ItemList } from "@/components/items/ItemList";
import ItemDetails from "@/components/items/ItemDetails";
import { ItemGroupList } from "@/components/items/ItemGroupList";
import { Suspense, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { getDoc, doc, collection, query, getDocs, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Search, Package, Users } from "lucide-react";
import { CreateItemDialog } from "@/components/items/CreateItemDialog";
import { Input } from "@/components/ui/input";
import { CreateItemGroupDialog } from "@/components/items/CreateItemGroupDialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ItemGroupDetails } from "@/components/items/ItemGroupDetails";
import { cn } from "@/lib/utils";
import { PermissionButton } from "@/components/permission";
import { useDate } from "@/hooks/useDate";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import type { StockView } from "@/components/items/types";
import type { Item, ItemGroup } from "@/components/items/types";
import type { DateRange } from "@/components/ui/ad-calendar";
import { useVouchers } from "@/hooks/useVouchers";
import usePermissions from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMasterDetailQueryNav } from "@/hooks/useMasterDetailQueryNav";
import { useRegisterMasterDetailHardwareBack } from "@/hooks/useRegisterMasterDetailHardwareBack";
import { useSyncMasterDetailHeaderId } from "@/hooks/useSyncMasterDetailHeaderId";
import { masterDetailListHref } from "@/lib/masterDetailListPath";
import { useRouter, useSearchParams } from "next/navigation";
import { useResponsiveListLayout } from "@/hooks/useResponsiveListLayout";
import { ResponsiveMasterDetail } from "@/components/layout/ResponsiveMasterDetail";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { usePageMemory } from "@/hooks/usePageMemory";
import { isSystemParentGroup } from "@/lib/system-groups";
import { filterByPendingApproval } from "@/lib/pendingApprovalFilter";
import { UnapprovedOnlyToggle } from "@/components/entity-lists/UnapprovedOnlyToggle";

type DisplayUnitState = Record<string, string>;

function ItemsPageContent() {
  const { user } = useAuth();
  const { company, companyId } = useCompany();
  const { formatCurrency } = useDate();
  const { vouchers, loading: vouchersLoading, processedItems, processedItemGroups: initialProcessedItemGroups, userNames: vouchersUserNames } = useVouchers();
  const { can } = usePermissions();
  // Unapproved toggle + pending badges: permission only (not company notification "on list" flags)
  const canApproveTransactions = can("approve_transactions");
  const pendingApprovalByItemId = useMemo(() => {
    if (!canApproveTransactions || !vouchers?.length) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    vouchers.forEach((v: any) => {
      if (v.isApproved === true) return;
      const ids = new Set<string>();
      (v.lineItems || []).forEach((line: any) => {
        if (line.itemId) ids.add(line.itemId);
      });
      ids.forEach((id) => {
        map[id] = (map[id] || 0) + 1;
      });
    });
    return map;
  }, [vouchers, canApproveTransactions]);
  const pendingApprovalByItemGroupId = useMemo(() => {
    if (!canApproveTransactions) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    processedItems.forEach((item: any) => {
      const groupId = item.groupId || "ungrouped";
      map[groupId] = (map[groupId] || 0) + (pendingApprovalByItemId[item.id] || 0);
    });
    return map;
  }, [processedItems, pendingApprovalByItemId, canApproveTransactions]);
  const isMobile = useIsMobile();
  const useQueryNav = useMasterDetailQueryNav();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeView, setActiveView] = useState("items");
  const { selected, setSelected } = useResponsiveListLayout<Item | ItemGroup>(`items_view_${activeView}`);

  const onBackToList = useCallback(() => {
    setSelected(null);
    router.replace(masterDetailListHref("items"), { scroll: false });
  }, [setSelected, router]);
  useRegisterMasterDetailHardwareBack(onBackToList, isMobile && !!selected);

  const [searchTerm, setSearchTerm] = useState("");
  const [unapprovedOnly, setUnapprovedOnly] = useState(false);
  const [stockView, setStockView] = useState<StockView>("amount");
  const [itemDisplayUnits, setItemDisplayUnits] = useState<DisplayUnitState>({});
  const [isCreateItemOpen, setIsCreateItemOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [groupDetailsDateRange, setGroupDetailsDateRange] = useState<DateRange | undefined>(undefined);
  const [userNames, setUserNames] = useState<Record<string, string>>(vouchersUserNames || {});
  
  // Use vouchersUserNames from useVouchers hook as primary source - always sync
  useEffect(() => {
    if (vouchersUserNames) {
      setUserNames(prev => {
        // Merge to keep any locally fetched names
        return { ...vouchersUserNames, ...prev };
      });
    }
  }, [vouchersUserNames]);

  const selectedItem = activeView === "items" ? (selected as Item) : null;
  const selectedItemGroup = activeView === "groups" ? (selected as ItemGroup) : null;
  useSyncMasterDetailHeaderId("items", selectedItem?.id ?? selectedItemGroup?.id ?? null);

  const processedItemGroups = useMemo(() => {
    // Hide auto-created Ungrouped base doc; system groups sirf Reports me – list pages pe nahi
    const baseGroups = initialProcessedItemGroups.filter((g) => {
      const anyG = g as any;
      if (anyG.isAutoUngrouped === true) return false;
      if (anyG.isReportOnly === true || anyG.isSystemReserved === true) return false;
      if (isSystemParentGroup("item_groups", anyG.id)) return false;
      return true;
    });
    // Show Ungrouped row only when at least one item is in the Ungrouped bucket.
    const ungrouped = processedItems.filter((p: any) => !p.groupId || p.groupId === "ungrouped_item");
    if (ungrouped.length > 0) {
      const ungroupedBalance = ungrouped.reduce((sum, p) => sum + p.balance, 0);
      const ungroupedGroup: ItemGroup = {
        id: "ungrouped",
        name: "Ungrouped",
        balance: ungroupedBalance,
        companyId: companyId || "",
        debit: ungrouped.reduce((sum, p) => sum + p.debit, 0),
        credit: ungrouped.reduce((sum, p) => sum + p.credit, 0),
      };
      return [...baseGroups, ungroupedGroup];
    }
    return baseGroups;
  }, [processedItems, initialProcessedItemGroups, companyId]);

  const allItems = useMemo(
    () => processedItems.filter((i) => i.type === "item" || i.type === "service" || i.type === "finished_good" || !i.type),
    [processedItems]
  );

  const itemsForListDisplay = useMemo(
    () => filterByPendingApproval(allItems, pendingApprovalByItemId, unapprovedOnly),
    [allItems, pendingApprovalByItemId, unapprovedOnly]
  );

  usePageMemory(
    "itemsPageState",
    activeView,
    setActiveView,
    selected,
    setSelected,
    activeView === "items" ? itemsForListDisplay : processedItemGroups,
    vouchersLoading
  );

  // Clear search when company changes (prevent email/other data from carrying over)
  useEffect(() => {
    setSearchTerm("");
    setUnapprovedOnly(false);
  }, [companyId]);

  // Restore selection when returning from details (e.g. /items?selected=xyz or /items?view=groups&selected=xyz)
  const selectedIdFromUrl = searchParams.get("selected");
  const viewFromUrl = searchParams.get("view");
  useEffect(() => {
    if (!selectedIdFromUrl) return;
    if (vouchersLoading) return;
    const groupItem = processedItemGroups.find((i) => i.id === selectedIdFromUrl);
    const itemFromList = allItems.find((i) => i.id === selectedIdFromUrl);
    const item = groupItem || itemFromList;
    if (viewFromUrl === "groups" && groupItem) setActiveView("groups");
    else if (itemFromList) setActiveView("items");
    if (item) setSelected(item);
    const canonical =
      viewFromUrl === "groups"
        ? `/items?view=groups&selected=${encodeURIComponent(selectedIdFromUrl)}`
        : `/items?selected=${encodeURIComponent(selectedIdFromUrl)}`;
    router.replace(canonical, { scroll: false });
  }, [selectedIdFromUrl, viewFromUrl, vouchersLoading, allItems, processedItemGroups, setSelected, setActiveView, router]);

  const storageKey = `itemDisplayUnits_${user?.uid}`;

  const fetchUserName = useCallback(async (userId: string): Promise<string> => {
    if (userNames[userId] && userNames[userId] !== "Unknown") return userNames[userId];
    try {
      // User doc ID may be name_uid format, so query by uid field first
      const q = query(collection(firestore, "users"), where("uid", "==", userId));
      const snap = await getDocs(q);
      let data = snap.docs[0]?.data();
      
      if (!data) {
        // Fallback: doc ID might be uid (legacy)
        const userDoc = await getDoc(doc(firestore, "users", userId));
        if (userDoc.exists()) {
          data = userDoc.data();
        }
      }
      
      if (data) {
        // Get displayName from user document - this is the primary field
        const displayName = data.displayName || data.name || data.email || null;
        if (displayName && displayName !== userId && !displayName.match(/^[a-zA-Z0-9_-]{20,}$/)) {
          return displayName;
        }
      }
    } catch (_) {}
    return "N/A"; // Return N/A instead of Unknown
  }, [userNames]);

  // Only fetch locally if not in vouchersUserNames
  useEffect(() => {
    if (!vouchers || vouchers.length === 0) return;
    const uids = new Set(vouchers.map((t) => t.userId).filter(Boolean) as string[]);
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
        if (name && name !== "Unknown" && name !== "N/A") {
          newUserNames[uid] = name;
        }
      });
      if (Object.keys(newUserNames).length > 0) {
        setUserNames((prev) => ({ ...prev, ...newUserNames }));
      }
    });
  }, [vouchers, fetchUserName, vouchersUserNames]);

  useEffect(() => {
    if (user) {
      try {
        const savedUnitsRaw = localStorage.getItem(storageKey);
        if (savedUnitsRaw) {
          const savedUnits: DisplayUnitState = JSON.parse(savedUnitsRaw);
          setItemDisplayUnits(savedUnits);
        }
      } catch (_) {}
    }
  }, [user, storageKey]);

  const handleSetItemDisplayUnit = (itemId: string, unit: string) => {
    const newUnits = { ...itemDisplayUnits, [itemId]: unit };
    setItemDisplayUnits(newUnits);
    if (user) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(newUnits));
      } catch (_) {}
    }
  };

  const totalBalance = useMemo(() => {
    if (activeView === "items") {
      const list = unapprovedOnly
        ? filterByPendingApproval(allItems, pendingApprovalByItemId, true)
        : allItems;
      return list.reduce((acc, item) => acc + item.balance, 0);
    }
    return processedItemGroups.reduce((acc, group) => acc + group.balance, 0);
  }, [activeView, allItems, processedItemGroups, unapprovedOnly, pendingApprovalByItemId]);

  const selectedGroupItems = useMemo(() => {
    if (!selectedItemGroup) return [];
    if (selectedItemGroup.id === "ungrouped") {
      return processedItems.filter((p: any) => !p.groupId || p.groupId === "ungrouped_item");
    }
    return processedItems.filter((p) => p.groupId === selectedItemGroup.id);
  }, [selectedItemGroup, processedItems]);

  // Filtered group count (matches ItemGroupList: exclude report-only + system groups; apply search)
  const filteredItemCount = useMemo(() => {
    const q = (searchTerm || "").toLowerCase();
    return itemsForListDisplay.filter((i) => i.name && i.name.toLowerCase().includes(q)).length;
  }, [itemsForListDisplay, searchTerm]);

  const filteredGroupCount = useMemo(() => {
    const searchLower = (searchTerm || "").toLowerCase();
    return (processedItemGroups || []).filter((g) => {
      const anyG = g as any;
      if (anyG.isReportOnly === true) return false;
      const isSystemParent = anyG.isSystemReserved === true || isSystemParentGroup("item_groups", anyG.id);
      if (isSystemParent) return false;
      return g.name && (searchLower ? g.name.toLowerCase().includes(searchLower) : true);
    }).length;
  }, [processedItemGroups, searchTerm]);

  const handleSelect = (item: Item | ItemGroup) => {
    if (useQueryNav) {
      // Static export ke liye query params – /items/[id] path refresh/redirect de sakta hai
      if ("type" in item) {
        router.push(`/items?selected=${item.id}`);
      } else if (item.id !== "ungrouped") {
        router.push(`/items?view=groups&selected=${item.id}`);
      } else {
        setSelected(item);
      }
    } else {
      setSelected(item);
    }
  };

  if (!companyId) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6 md:p-8 h-full">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>No Company Selected</CardTitle>
            <CardDescription>Please select a company to view item data.</CardDescription>
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
          <Input
            placeholder={activeView === "items" ? "Search items..." : "Search groups..."}
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoComplete="off"
          />
        </div>
        {activeView === "items" && canApproveTransactions && (
          <UnapprovedOnlyToggle active={unapprovedOnly} onToggle={() => setUnapprovedOnly((v) => !v)} />
        )}
        {activeView === "items" ? (
          <CreateItemDialog onItemCreated={() => {}} isOpen={isCreateItemOpen} onOpenChange={setIsCreateItemOpen}>
            <PermissionButton permission="create_records" size="sm" onClick={() => setIsCreateItemOpen(true)}>
              + Add Item
            </PermissionButton>
          </CreateItemDialog>
        ) : (
          <CreateItemGroupDialog
            onGroupCreated={() => {}}
            isOpen={isCreateGroupOpen}
            onOpenChange={setIsCreateGroupOpen}
            groups={processedItemGroups}
          >
            <PermissionButton permission="create_records" size="sm" onClick={() => setIsCreateGroupOpen(true)}>
              + Add Group
            </PermissionButton>
          </CreateItemGroupDialog>
        )}
      </div>
      {vouchersLoading ? (
        <div className="flex-1 min-h-0 flex items-center justify-center p-4">
          <LoadingSpinner />
        </div>
      ) : activeView === "items" ? (
        <>
          <div className="px-3 py-1.5 border-b flex items-center gap-2 text-sm font-semibold text-muted-foreground flex-shrink-0">
            <Package className="h-4 w-4" />
            <span>Item ({filteredItemCount})</span>
            <Select value={stockView} onValueChange={(v) => setStockView(v as StockView)}>
              <SelectTrigger className="w-[100px] h-7 ml-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="qty">Unit</SelectItem>
                <SelectItem value="amount">Amounts</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ItemList
              items={itemsForListDisplay}
              onSelectItem={(i) => handleSelect(i)}
              selectedItem={selectedItem}
              searchTerm={searchTerm}
              stockView={stockView}
              itemDisplayUnits={itemDisplayUnits}
              pendingApprovalByItemId={pendingApprovalByItemId}
              getItemHref={useQueryNav ? (i) => `/items?selected=${i.id}` : undefined}
            />
          </div>
        </>
      ) : (
        <>
          <div className="px-3 py-1.5 border-b flex items-center gap-2 text-sm font-semibold text-muted-foreground flex-shrink-0">
            <Users className="h-4 w-4" />
            <span>Groups ({filteredGroupCount})</span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ItemGroupList
              groups={processedItemGroups}
              onSelectGroup={(g) => handleSelect(g)}
              selectedGroup={selectedItemGroup}
              searchTerm={searchTerm}
              pendingApprovalByGroupId={pendingApprovalByItemGroupId}
              getItemHref={useQueryNav ? (g) => `/items?view=groups&selected=${g.id}` : undefined}
            />
          </div>
        </>
      )}
    </div>
  );

  const detailView = (
    <>
      {activeView === "items" && selectedItem && (
        <ItemDetails
          key={`item-${selectedItem.id}`}
          item={selectedItem}
          transactions={vouchers}
          onItemUpdated={() => {}}
          onItemDeleted={() => setSelected(null)}
          stockView={stockView}
          setStockView={setStockView}
          itemDisplayUnits={itemDisplayUnits}
          setItemDisplayUnit={handleSetItemDisplayUnit}
          userNames={{ ...vouchersUserNames, ...userNames }}
        />
      )}
      {activeView === "groups" && selectedItemGroup && (
        <ItemGroupDetails
          key={`group-${selectedItemGroup.id}`}
          group={selectedItemGroup}
          allGroups={processedItemGroups}
          items={selectedGroupItems}
          allItems={processedItems}
          onGroupUpdated={() => {}}
          onGroupDeleted={() => setSelected(null)}
          onItemUpdated={() => {}}
          stockView="amount"
          dateRange={groupDetailsDateRange}
          onDateRangeChange={setGroupDetailsDateRange}
          userNames={{ ...vouchersUserNames, ...userNames }}
          transactions={vouchers}
        />
      )}
      {!selected && (
        <div className="p-6 text-center text-muted-foreground">Select an item to see details</div>
      )}
    </>
  );

  return (
    <ResponsiveMasterDetail
      title="Items"
      balance={
        <span
          className={cn(
            "font-semibold",
            totalBalance >= 0 ? "text-green-600" : "text-red-600"
          )}
        >
          {formatCurrency(totalBalance, { showDrCr: true, noAnimation: true })}
        </span>
      }
      tabs={
        <Tabs value={activeView} onValueChange={setActiveView} className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="items" className="flex-1">
              Items
            </TabsTrigger>
            <TabsTrigger value="groups" className="flex-1">
              Groups
            </TabsTrigger>
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
  );
}

export default function ItemsPage() {
  return (
    // Keep useSearchParams consumer behind Suspense for Next.js static prerender compatibility.
    <Suspense fallback={<LoadingSpinner />}>
      <ItemsPageContent />
    </Suspense>
  );
}
