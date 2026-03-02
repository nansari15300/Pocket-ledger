"use client";

import { Button } from "@/components/ui/button";
import { PermissionButton } from "@/components/permission";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, Search, Users, Landmark, Briefcase, Receipt, BookText, Package } from "lucide-react";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { collection, onSnapshot, query, where, orderBy, collectionGroup, getDoc, doc, getDocs } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useCompany } from "@/hooks/useCompany";
import { Skeleton } from "@/components/ui/skeleton";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { PartyDetails } from "@/components/party/PartyDetails";
import type { Party } from "@/components/party/types";
import type { Staff } from "@/components/staff/types";
import { StaffDetails } from "@/components/staff/StaffDetails";
import { TaxDetails } from "@/components/tax/TaxDetails";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { Account } from "@/components/bank-cash/types";
import { AccountDetails } from "@/components/account/AccountDetails";
import type { Item } from "@/components/items/types";
import ItemDetails from "@/components/items/ItemDetails";
import type { StockView } from "@/components/items/ItemDetails";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { Tax } from "@/components/tax/types";
import { Badge } from "@/components/ui/badge";
import { NoteDetails } from "@/components/notes/NoteDetails";

// ✅ Custom Hook Import
import { usePageMemory } from "@/hooks/usePageMemory";

type NotedEntity = {
    id: string;
    name: string;
    type: 'Party' | 'Bank/Cash' | 'Staff' | 'Tax' | 'Items';
    entity: any;
    balance?: number; // Added for sorting logic in usePageMemory
};

const typeIconMap = {
    Party: Users,
    'Bank/Cash': Landmark,
    Staff: Briefcase,
    Tax: Receipt,
    Items: Package,
};


function NotedEntityList({ entities, selectedEntity, onSelectEntity, searchTerm }: { 
    entities: NotedEntity[], 
    selectedEntity: NotedEntity | null, 
    onSelectEntity: (entity: NotedEntity) => void, 
    searchTerm: string 
}) {
    const filteredEntities = useMemo(() => {
        return entities.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [entities, searchTerm]);

    if (filteredEntities.length === 0) {
        return <div className="text-center text-muted-foreground p-8">No items with notes found.</div>
    }

    return (
         <ScrollArea className="flex-1 min-h-0">
            <ul className="p-2 space-y-1">
                {filteredEntities.map(entity => {
                    const isSelected = selectedEntity?.id === entity.id;
                    const Icon = typeIconMap[entity.type];
                    return (
                        <li key={entity.id}>
                            <Card
                            className={cn(
                                "p-2 cursor-pointer border",
                                isSelected ? "border-primary bg-secondary" : "hover:border-primary/50"
                            )}
                            onClick={() => onSelectEntity(entity)}
                            >
                            <div className="flex items-center justify-between w-full gap-2">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className="h-8 w-8 flex-shrink-0 flex items-center justify-center bg-muted rounded-md text-muted-foreground">
                                    <Icon className="h-5 w-5" />
                                </div>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <p className="font-semibold whitespace-nowrap truncate">{entity.name}</p>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>{entity.name}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                </div>
                                <Badge variant="outline">{entity.type}</Badge>
                            </div>
                            </Card>
                        </li>
                    )
                })}
            </ul>
        </ScrollArea>
    )
}

export default function NotesPage() {
    const { companyId } = useCompany();
    const { user } = useAuth();
    const [vouchers, setVouchers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedEntity, setSelectedEntity] = useState<NotedEntity | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [isVoucherOpen, setIsVoucherOpen] = useState(false);
    const [stockView, setStockView] = useState<StockView>("amount");
    // Changed default to false so memory selection works
    const [showAllNotes, setShowAllNotes] = useState(false); 

    const [parties, setParties] = useState<Party[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [staff, setStaff] = useState<Staff[]>([]);
    const [taxes, setTaxes] = useState<Tax[]>([]);
    const [items, setItems] = useState<Item[]>([]);
    
    const [userNames, setUserNames] = useState<Record<string, string>>({});
    const fetchedUserNames = useRef<Record<string, string>>({});

    const noteVouchers = useMemo(() => vouchers.filter(v => v.type === 'note'), [vouchers]);
    
    const fetchUserName = useCallback(async (userId: string): Promise<string> => {
        if (fetchedUserNames.current[userId] && fetchedUserNames.current[userId] !== "Unknown") return fetchedUserNames.current[userId];
        try {
            // User doc ID may be name_uid format, so query by uid field first
            const q = query(collection(firestore, "users"), where("uid", "==", userId));
            const snap = await getDocs(q);
            let data = snap.docs[0]?.data();
            
            if (!data) {
                // Fallback: doc ID might be uid (legacy)
                const userDoc = await getDoc(doc(firestore, 'users', userId));
                if (userDoc.exists()) {
                    data = userDoc.data();
                }
            }
            
            if (data) {
                // Get displayName from user document - this is the primary field
                const displayName = data.displayName || data.name || data.email || null;
                if (displayName && displayName !== userId && !displayName.match(/^[a-zA-Z0-9_-]{20,}$/)) {
                    fetchedUserNames.current[userId] = displayName;
                    return displayName;
                }
            }
        } catch (e) {
            console.error("Error fetching user name:", e);
        }
        return "N/A"; // Return N/A instead of Unknown
    }, []);

    useEffect(() => {
        const uidsToFetch = new Set<string>();
        noteVouchers.forEach(t => {
            if (t.userId && !fetchedUserNames.current[t.userId]) {
                uidsToFetch.add(t.userId);
            }
        });

        if (uidsToFetch.size > 0) {
            const fetchAll = async () => {
                const newNames: Record<string, string> = {};
                for (const uid of Array.from(uidsToFetch)) {
                    newNames[uid] = await fetchUserName(uid);
                }
                setUserNames(prev => ({ ...prev, ...newNames }));
            };
            fetchAll();
        }
    }, [noteVouchers, fetchUserName]);


    useEffect(() => {
        if (!companyId || !user) {
            setLoading(false);
            return;
        };

        setLoading(true);
        const vouchersQuery = query(collection(firestore, `companies/${companyId}/vouchers`), where("type", "==", "note"), orderBy('date', 'desc'));
        const unsubVouchers = onSnapshot(vouchersQuery, (snapshot) => {
            setVouchers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        const collectionsToFetch = [
            { path: 'parties', setter: setParties, type: undefined },
            { path: 'bank_accounts', setter: setAccounts, type: undefined },
            { path: 'staff', setter: setStaff, type: undefined },
            { path: 'items', setter: setItems, type: undefined },
            { path: 'taxes', setter: setTaxes, type: undefined },
        ];

        const unsubs = collectionsToFetch.map(({path, setter}) => 
            onSnapshot(query(collection(firestore, `companies/${companyId}/${path}`)), (snap) => {
                setter(snap.docs.map(d=>({id: d.id, ...d.data()})) as any);
            })
        );
        
        const initialFetches = Promise.all([
            new Promise(res => onSnapshot(vouchersQuery, () => res(true), () => res(true))),
            ...collectionsToFetch.map(({path}) => new Promise(res => {
                 const unsub = onSnapshot(query(collection(firestore, `companies/${companyId}/${path}`)), () => {
                    unsub();
                    res(true);
                }, () => res(true));
            }))
        ]);
        
        initialFetches.then(() => setLoading(false));

        return () => {
            unsubVouchers();
            unsubs.forEach(unsub => unsub());
        };
    }, [companyId, user]);
    
     const notedEntities = useMemo(() => {
        if (loading || noteVouchers.length === 0) return [];
        
        const getEntitiesWithNotes = <T extends { id: string, name?: string, accountName?: string, balance?: number }>(entities: T[], context: string): NotedEntity[] => {
            const entityIdsWithNotes = new Set(noteVouchers.filter(v => v.context === context).map(v => v.entityId));
            return entities
                .filter(e => entityIdsWithNotes.has(e.id))
                .map(e => ({ 
                    id: e.id, 
                    name: e.name || e.accountName || 'Unknown', 
                    type: context as NotedEntity['type'], 
                    entity: e,
                    balance: e.balance || 0 // Include balance for sorting
                }));
        };

        return [
            ...getEntitiesWithNotes(parties, 'Party'),
            ...getEntitiesWithNotes(accounts, 'Bank/Cash'),
            ...getEntitiesWithNotes(staff, 'Staff'),
            ...getEntitiesWithNotes(taxes, 'Tax'),
            ...getEntitiesWithNotes(items, 'Items'),
        ].sort((a,b) => a.name.localeCompare(b.name)); // Initial sort by name, hook re-sorts if needed

    }, [noteVouchers, parties, accounts, staff, items, taxes, loading]);
    
    // ========== MEMORY LOGIC ==========
    usePageMemory(
        "notesPageState", 
        "list", // Static View Name
        () => {},  // No-op
        selectedEntity,                 
        (entity) => {
            setSelectedEntity(entity);
            if (entity) setShowAllNotes(false);
        },              
        notedEntities, 
        loading           
    );
    // ==================================
    
    const handleSelectEntity = (entity: NotedEntity) => {
        setSelectedEntity(entity);
        setShowAllNotes(false);
    }
    
    const handleShowAll = () => {
        setSelectedEntity(null);
        setShowAllNotes(true);
    }

     const currentTransactions = useMemo(() => {
        if (showAllNotes) return noteVouchers;
        if (!selectedEntity) return [];
        return noteVouchers.filter(v => v.entityId === selectedEntity.id && v.context === selectedEntity.type);
    }, [noteVouchers, selectedEntity, showAllNotes]);
    
    const allNotesEntity = useMemo(() => ({
        id: 'all',
        name: 'All Notes',
        type: 'Party', // Placeholder, won't use this part
        entity: {
            id: 'all',
            name: 'All Notes',
            balance: 0,
            openingBalance: 0
        }
    }), []);
    
    const currentEntityForDetails = showAllNotes ? allNotesEntity : selectedEntity;
    
    if (loading) {
        return (
          <div className="grid grid-cols-1 md:grid-cols-[360px_1fr] gap-4 p-4 h-full">
            <div className="space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-full w-full" /></div>
            <div className="space-y-2"><Skeleton className="h-full w-full" /></div>
          </div>
        );
      }
      
    const DetailsView = () => {
         if (!currentEntityForDetails) {
            return (
                 <div className="flex flex-1 items-center justify-center">
                    <Card className="w-full max-w-md text-center">
                         <CardHeader><CardTitle>No Notes Found</CardTitle><CardDescription>Create your first note to see details here.</CardDescription></CardHeader>
                         <CardContent>
                    <PermissionButton permission="create_records" onClick={() => setIsVoucherOpen(true)}>
                      <PlusCircle className="mr-2 h-4 w-4" /> Add Note
                    </PermissionButton>
                  </CardContent>
                    </Card>
                </div>
            );
         }
         
        return <NoteDetails 
            entity={currentEntityForDetails} 
            transactions={noteVouchers} 
            userNames={userNames} 
            onShowAll={handleShowAll}
            isAllVouchersView={showAllNotes}
        />;
    }


    return (
        <div className="grid grid-cols-1 md:grid-cols-[360px_1fr] gap-4 p-4 h-full">
            <div className="flex flex-col min-h-0">
                <div className="p-4 border-b">
                    <h1 className="text-2xl font-bold font-headline">Notes</h1>
                    <p className="text-sm text-muted-foreground">Manage your notes and memos.</p>
                </div>
                <div className="p-4 border-b">
                    <PermissionButton permission="create_records" className="w-full" onClick={() => setIsVoucherOpen(true)}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Note
                  </PermissionButton>
                    <Card className="mt-4 p-4 text-center">
                        <p className="text-sm text-muted-foreground">Total Notes</p>
                        <p className="text-2xl font-bold text-blue-600">{noteVouchers.length}</p>
                         <Button 
                            variant="link" 
                            size="sm" 
                            className="mt-1 h-auto p-0 text-xs" 
                            onClick={handleShowAll}
                        >
                            View All Entries
                        </Button>
                    </Card>
                    <div className="relative mt-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                </div>
                <NotedEntityList entities={notedEntities} selectedEntity={selectedEntity} onSelectEntity={handleSelectEntity} searchTerm={searchTerm} />
            </div>

            <div className="hidden md:flex flex-col min-h-0">
                <DetailsView />
            </div>
            <AddVoucherDialog
                isOpen={isVoucherOpen}
                onOpenChange={setIsVoucherOpen}
                defaultTab="note"
                onVoucherCreated={() => {}}
            />
        </div>
    );
}