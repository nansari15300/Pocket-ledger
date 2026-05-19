"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, Search } from "lucide-react";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { NoteDetails } from "@/components/notes/NoteDetails";
import { useVouchers } from "@/hooks/useVouchers";
import { useDate } from "@/hooks/useDate";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";
import { PermissionButton } from "@/components/permission";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useCompany } from "@/hooks/useCompany";
import { collection, query, onSnapshot, orderBy, where } from "firebase/firestore";
import type { Party } from "@/components/party/types";
import type { Staff } from "@/components/staff/types";
import type { Account } from "@/components/bank-cash/types";
import type { Tax } from "@/components/tax/types";
import type { Item } from "@/components/items/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSearchParams } from "next/navigation";
import { ReportRegisterMobileListChrome } from "@/components/reports/ReportRegisterMobileListChrome";

type NotedEntity = {
    id: string;
    name: string;
    type: 'Party' | 'Bank/Cash' | 'Staff' | 'Tax' | 'Items';
    entity: any;
};

function NotedEntityList({ entities, selectedEntity, onSelectEntity, searchTerm }: { 
    entities: NotedEntity[], 
    selectedEntity: NotedEntity | null, 
    onSelectEntity: (entity: NotedEntity) => void, 
    searchTerm: string 
}) {
    const filteredEntities = useMemo(() => {
        if (!searchTerm) return entities;
        return entities.filter(e => 
            e.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [entities, searchTerm]);

    return (
        <ScrollArea className="flex-1 min-h-0">
            <ul className="p-2 space-y-1">
                {filteredEntities.map((entity) => {
                    const isSelected = selectedEntity?.id === entity.id && selectedEntity?.type === entity.type;
                    return (
                        <li key={`${entity.type}-${entity.id}`}>
                            <Card
                                className={cn(
                                    "p-1.5 cursor-pointer border",
                                    !isSelected && "hover:border-orange-300/80 hover:bg-orange-50/30"
                                )}
                                onClick={() => onSelectEntity(entity)}
                            >
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium truncate">{entity.name}</p>
                                    <span className="text-xs text-muted-foreground">({entity.type})</span>
                                </div>
                            </Card>
                        </li>
                    );
                })}
            </ul>
        </ScrollArea>
    );
}

export function NotesReportDetail() {
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const { formatCurrency } = useDate();
  const { companyId } = useCompany();
  const { vouchers: allVouchers, loading: vouchersLoading, processedParties } = useVouchers();
  const [selectedEntity, setSelectedEntity] = useState<NotedEntity | null>(null);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [showAllNotes, setShowAllNotes] = useState(false);
  const hasAutoSelected = useRef(false);

  const [parties, setParties] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  const noteVouchers = useMemo(() => allVouchers.filter((v) => v.type === "note"), [allVouchers]);

  const fetchUserName = useCallback(async (userId: string): Promise<string> => {
    try {
      const userDoc = await getDoc(doc(firestore, "users", userId));
      if (userDoc.exists()) {
        return userDoc.data().displayName || userDoc.data().email || "Unknown";
      }
    } catch (_) {}
    return "Unknown";
  }, []);

  useEffect(() => {
    const uids = new Set(allVouchers.map((t) => t.userId).filter(Boolean) as string[]);
    uids.forEach(async (uid) => {
      if (!userNames[uid]) {
        const name = await fetchUserName(uid);
        setUserNames((prev) => ({ ...prev, [uid]: name }));
      }
    });
  }, [allVouchers, userNames, fetchUserName]);

  useEffect(() => {
    if (!companyId) {
      setParties([]);
      setAccounts([]);
      setStaff([]);
      setTaxes([]);
      setItems([]);
      return;
    }

    const unsubs = [
      onSnapshot(query(collection(firestore, `companies/${companyId}/parties`)), (snap) => {
        setParties(snap.docs.map(d => ({ id: d.id, ...d.data() } as Party)));
      }),
      onSnapshot(query(collection(firestore, `companies/${companyId}/bank_accounts`)), (snap) => {
        setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Account)));
      }),
      onSnapshot(query(collection(firestore, `companies/${companyId}/staff`)), (snap) => {
        setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() } as Staff)));
      }),
      onSnapshot(query(collection(firestore, `companies/${companyId}/taxes`)), (snap) => {
        setTaxes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Tax)));
      }),
      onSnapshot(query(collection(firestore, `companies/${companyId}/items`)), (snap) => {
        setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as Item)));
      }),
    ];

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [companyId]);

  const notedEntities = useMemo(() => {
    if (vouchersLoading || noteVouchers.length === 0) return [];
    
    const getEntitiesWithNotes = <T extends { id: string, name?: string, accountName?: string }>(entities: T[], context: string): NotedEntity[] => {
        const entityIdsWithNotes = new Set(noteVouchers.filter(v => v.context === context).map(v => v.entityId));
        return entities
            .filter(e => entityIdsWithNotes.has(e.id))
            .map(e => ({ 
                id: e.id, 
                name: e.name || e.accountName || 'Unknown', 
                type: context as NotedEntity['type'], 
                entity: e,
            }));
    };

    return [
        ...getEntitiesWithNotes(parties, 'Party'),
        ...getEntitiesWithNotes(accounts, 'Bank/Cash'),
        ...getEntitiesWithNotes(staff, 'Staff'),
        ...getEntitiesWithNotes(taxes, 'Tax'),
        ...getEntitiesWithNotes(items, 'Items'),
    ].sort((a,b) => a.name.localeCompare(b.name));

  }, [noteVouchers, parties, accounts, staff, items, taxes, vouchersLoading]);

  const totalNotes = useMemo(() => noteVouchers.length, [noteVouchers]);

  const entityTransactions = useMemo(() => {
    if (!selectedEntity) return [];
    return noteVouchers.filter((v) => v.entityId === selectedEntity.id && v.context === selectedEntity.type);
  }, [noteVouchers, selectedEntity]);

  const allNotesEntity = useMemo(() => {
    if (!showAllNotes) return null;
    return {
      id: "all",
      name: "All Notes",
      type: 'Party' as const,
      entity: { 
        id: "all", 
        name: "All Notes",
        type: 'Party' as const,
      },
    };
  }, [showAllNotes]);

  const currentEntity = showAllNotes ? allNotesEntity : selectedEntity;
  const currentTransactions = showAllNotes ? noteVouchers : entityTransactions;
  
  const entityForDetails = useMemo(() => {
    if (!currentEntity) return null;
    // NoteDetails expects entity with id, name, and type
    return {
      id: currentEntity.entity.id,
      name: currentEntity.entity.name || currentEntity.entity.accountName || currentEntity.name,
      type: currentEntity.type,
    };
  }, [currentEntity]);

  const filteredEntities = useMemo(() => {
    return notedEntities.filter((e) =>
      e.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [notedEntities, searchTerm]);

  const REPORT_MEMORY_KEY = "reportNotesState";

  useEffect(() => {
    if (searchParams.get("allVouchers") === "1") {
      if (!hasAutoSelected.current) {
        hasAutoSelected.current = true;
        setShowAllNotes(true);
        setSelectedEntity(null);
      }
      return;
    }
    if (notedEntities.length === 0) return;
    if (hasAutoSelected.current) return;
    hasAutoSelected.current = true;
    if (isMobile) return; // Mobile: don't auto-select, show list first
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(REPORT_MEMORY_KEY) : null;
      const saved = raw ? (JSON.parse(raw) as { entityId?: string }) : null;
      const entityId = saved?.entityId;
      if (entityId) {
        const found = notedEntities.find((e) => e.id === entityId);
        if (found) {
          setSelectedEntity(found);
          return;
        }
      }
    } catch (_) {}
    setSelectedEntity(notedEntities[0]);
  }, [notedEntities, isMobile, searchParams]);

  const handleSelectEntity = useCallback((entity: NotedEntity) => {
    setShowAllNotes(false);
    setSelectedEntity(entity);
    try {
      localStorage.setItem(REPORT_MEMORY_KEY, JSON.stringify({ entityId: entity.id }));
    } catch (_) {}
  }, []);

  if (vouchersLoading) {
    return (
      <div className="flex flex-col h-full p-4 gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="flex-1 w-full" />
      </div>
    );
  }

  // Mobile: show list first, then details when selected (like party page)
  if (isMobile) {
    if (entityForDetails) {
      return (
        <div className="flex flex-col h-full min-h-0 overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <NoteDetails
              entity={entityForDetails}
              transactions={currentTransactions}
              userNames={userNames}
              onShowAll={() => setShowAllNotes(true)}
              isAllVouchersView={showAllNotes}
              mobileFooterVariant="report"
              mobileReportStickyTitle={showAllNotes ? "All Notes" : "Notes"}
              onBack={() => {
                setSelectedEntity(null);
                setShowAllNotes(false);
              }}
            />
          </div>
        </div>
      );
    }
    return (
      <ReportRegisterMobileListChrome
        title="Notes"
        actionSlot={
          <AddVoucherDialog onVoucherCreated={() => {}} defaultTab="note">
            <PermissionButton permission="create_records" className="w-full">
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Note
            </PermissionButton>
          </AddVoucherDialog>
        }
        summary={{
          label: "Total Notes",
          amountText: String(totalNotes),
          amountClassName: "text-green-600",
        }}
        searchPlaceholder="Search accounts..."
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        listSectionTitle={`Note accounts (${filteredEntities.length})`}
      >
        <NotedEntityList
          entities={filteredEntities}
          onSelectEntity={handleSelectEntity}
          selectedEntity={selectedEntity}
          searchTerm={searchTerm}
        />
      </ReportRegisterMobileListChrome>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[minmax(280px,max-content)_minmax(0,1fr)] min-h-0 overflow-hidden">
        <div className="flex flex-col min-h-0 border-r overflow-hidden bg-muted/30">
          <div className="p-4 border-b space-y-3 flex-shrink-0">
            <h2 className="text-lg font-bold font-headline">Notes</h2>
            <AddVoucherDialog onVoucherCreated={() => {}} defaultTab="note">
              <PermissionButton permission="create_records" className="w-full">
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Note
              </PermissionButton>
            </AddVoucherDialog>
            <Card className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Notes</p>
              <p className="text-xl font-bold text-green-600">
                {totalNotes}
              </p>
            </Card>
          </div>
          <div className="p-3 border-b flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search accounts..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="px-3 pt-2 pb-1 border-b flex-shrink-0">
            <h3 className="text-sm font-semibold">Note accounts ({filteredEntities.length})</h3>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <NotedEntityList
              entities={filteredEntities}
              onSelectEntity={handleSelectEntity}
              selectedEntity={selectedEntity}
              searchTerm={searchTerm}
            />
          </div>
        </div>

        <div className="flex flex-col min-h-0 overflow-hidden">
          {entityForDetails ? (
            <NoteDetails
              entity={entityForDetails}
              transactions={currentTransactions}
              userNames={userNames}
              onShowAll={() => setShowAllNotes(true)}
              isAllVouchersView={showAllNotes}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <Card className="w-full max-w-md text-center">
                <CardHeader>
                  <CardTitle>Select an account</CardTitle>
                  <CardDescription>
                    Choose a note account from the list to view notes.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {notedEntities.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No notes recorded yet. Create a note to see accounts here.
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
