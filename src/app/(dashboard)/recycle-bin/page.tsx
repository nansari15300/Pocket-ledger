
"use client";

import { useState, useEffect, useMemo } from "react";
import { useCompany } from "@/hooks/useCompany";
import { PermissionRouteGuard } from "@/components/permission/PermissionRouteGuard";
import { collection, query, where, onSnapshot, updateDoc, doc, deleteDoc, writeBatch, getDoc, getDocs, serverTimestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { RecycleBinItem, type DeletedItem } from "@/components/recycle-bin/RecycleBinItem";
import { Input } from "@/components/ui/input";
import { Search, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import usePermissions from "@/hooks/usePermissions";
import { assertCan, PermissionDeniedError } from "@/lib/permissions/enforcePermission";
import { PermissionButton } from "@/components/permission";
import { cn } from "@/lib/utils";
import { useVouchers } from "@/hooks/useVouchers";
import { deleteCompanyComplete } from "@/lib/actions/deleteCompanyAction";
import { getRecycleBinConfig, subscribeRecycleBinConfig, type RecycleBinConfig } from "@/lib/recycleBinConfig";
import { sendTransactionAlert } from "@/lib/transactionAlerts";
import { useLivePlans, getPlanFromPlans } from "@/hooks/useLivePlans";
import { numericEntitlement, type PlanId } from "@/config/plans";
import { isLocalOnlyMode } from "@/lib/localMode";
import { getLocalCompanyById, listLocalCompanies, removeLocalCompanyById, upsertLocalCompany } from "@/lib/localCompanyStore";

const COLLECTIONS_TO_CHECK = [
    { path: 'parties', nameField: 'name', type: 'Party' },
    { path: 'groups', nameField: 'name', type: 'Party Group' },
    { path: 'bank_accounts', nameField: 'accountName', type: 'Bank/Cash Account' },
    { path: 'account_groups', nameField: 'name', type: 'Account Group' },
    { path: 'staff', nameField: 'name', type: 'Staff' },
    { path: 'staff_groups', nameField: 'name', type: 'Staff Group' },
    { path: 'items', nameField: 'name', type: 'Item' },
    { path: 'item_groups', nameField: 'name', type: 'Item Group' },
    { path: 'taxes', nameField: 'name', type: 'Tax' },
    { path: 'tax_groups', nameField: 'name', type: 'Tax Group' },
    { path: 'vouchers', nameField: 'voucherNumber', type: 'Voucher' },
    { path: 'unassigned_documents', nameField: 'name', type: 'Unassigned File' }
];

export default function RecycleBinPage() {
    return (
        <PermissionRouteGuard permission="delete_records">
            <RecycleBinContent />
        </PermissionRouteGuard>
    );
}

function RecycleBinContent() {
    const { user, customUser } = useAuth();
    const { can } = usePermissions();
    const { companyId, company, allCompanies } = useCompany();
    const livePlans = useLivePlans();
    const { journalAccountNames } = useVouchers();
    const [deletedItems, setDeletedItems] = useState<DeletedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const [itemToConfirm, setItemToConfirm] = useState<{item: DeletedItem, action: 'restore' | 'delete'} | null>(null);
    const [isEmptydialogOpen, setIsEmptyDialogOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [userNames, setUserNames] = useState<Record<string, string>>({});
    const [recycleBinConfig, setRecycleBinConfig] = useState<RecycleBinConfig | null>(null);
    const [, setCountdownTick] = useState(0);
    const [atMaxCompanies, setAtMaxCompanies] = useState(false);

    // Non-deleted company count vs plan limit (to disable company restore when at max)
    useEffect(() => {
        if (!user?.uid) {
            setAtMaxCompanies(false);
            return;
        }
        if (isLocalOnlyMode()) {
            // Local-only mode: company limit local registry se evaluate karo (non-deleted companies only).
            listLocalCompanies()
                .then((rows) => {
                    const count = rows.length;
                    const planId: PlanId = count === 0 ? "basic" : ((rows[0]?.planId as PlanId) || "basic");
                    const plan = getPlanFromPlans(livePlans, planId);
                    const max = numericEntitlement(plan?.entitlements, "maxCompanies", true);
                    setAtMaxCompanies(max > 0 && count >= max);
                })
                .catch(() => setAtMaxCompanies(false));
            return;
        }
        const q = query(
            collection(firestore, "companies"),
            where("ownerId", "==", user.uid),
            where("isDeleted", "!=", true)
        );
        const unsub = onSnapshot(q, (snap) => {
            const count = snap.size;
            const planId: PlanId = count === 0 ? "basic" : (snap.docs[0]?.data()?.planId as PlanId) || "basic";
            const plan = getPlanFromPlans(livePlans, planId);
            const max = numericEntitlement(plan?.entitlements, "maxCompanies", false);
            setAtMaxCompanies(max > 0 && count >= max);
        }, () => setAtMaxCompanies(false));
        return () => unsub();
    }, [user?.uid, livePlans]);

    // Recycle bin config (quick delete vs move to admin bin) – same as "Auto-delete after (days) – Company Admin" in super admin settings
    useEffect(() => {
        getRecycleBinConfig().then(setRecycleBinConfig);
        const unsub = subscribeRecycleBinConfig(setRecycleBinConfig);
        return unsub;
    }, []);

    // Re-render every second so any countdown (e.g. Xh Ym Zs) can run live
    useEffect(() => {
        const id = setInterval(() => setCountdownTick((t) => t + 1), 1000);
        return () => clearInterval(id);
    }, []);

    // Deleted companies: subscribe whenever user is set (so deleted companies show even when no company selected)
        useEffect(() => {
            if (!user?.uid) {
                setLoading(false);
                return;
            }
            if (isLocalOnlyMode()) {
                // Local-only mode: deleted companies local table se read karo.
                setLoading(true);
                listLocalCompanies({ includeDeleted: true })
                    .then((rows) => {
                        const companyItems: DeletedItem[] = rows
                            .filter((c) => c.isDeleted === true)
                            .map((c) => ({
                                id: c.id,
                                name: String(c.name || "Unnamed Company"),
                                type: "Company",
                                deletedAt: c.deletedAt ? new Date(c.deletedAt as any) : new Date(),
                                collectionPath: "companies",
                                isRootCollection: true,
                            }));
                        setDeletedItems((prev) => {
                            const otherItems = prev.filter((item) => item.collectionPath !== "companies");
                            return [...otherItems, ...companyItems];
                        });
                    })
                    .catch((error) => {
                        console.error("Error fetching deleted local companies:", error);
                    })
                    .finally(() => setLoading(false));
                return;
            }
            setLoading(true);
            const qCompanies = query(
                collection(firestore, "companies"),
                where("ownerId", "==", user.uid),
                where("isDeleted", "==", true)
            );
            const unsubCompanies = onSnapshot(qCompanies, (snapshot) => {
                const companyItems = snapshot.docs
                    .filter(d => !d.data().movedToAdminRecycleAt)
                    .map(docSnap => {
                        const data = docSnap.data();
                        return {
                            id: docSnap.id,
                            name: data.name || 'Unnamed Company',
                            type: 'Company',
                            deletedAt: data.deletedAt?.toDate ? data.deletedAt.toDate() : new Date(),
                            collectionPath: 'companies',
                            isRootCollection: true,
                        };
                    });
                setDeletedItems(prev => {
                    const otherItems = prev.filter(item => item.collectionPath !== 'companies');
                    return [...otherItems, ...companyItems];
                });
                setLoading(false);
            }, (error) => {
                console.error("Error fetching deleted companies:", error);
                setLoading(false);
            });
            const timeout = setTimeout(() => setLoading(false), 5000);
            return () => {
                unsubCompanies();
                clearTimeout(timeout);
            };
        }, [user?.uid]);

        // Deleted items from subcollections (parties, vouchers, etc.): only when a company is selected
        useEffect(() => {
            if (!companyId || !user?.uid) return;

            let initialLoadComplete = false;
            const subcollectionUnsubs = COLLECTIONS_TO_CHECK.map(coll => {
                const q = query(
                collection(firestore, `companies/${companyId}/${coll.path}`),
                where("isDeleted", "==", true)
            );
            return onSnapshot(q, (snapshot) => {
                if (!initialLoadComplete) {
                    setLoading(false);
                    initialLoadComplete = true;
                }

                const newItems = snapshot.docs
                    .filter(docSnap => !docSnap.data().movedToAdminRecycleAt)
                    .map(docSnap => {
                    const data = docSnap.data();
                    const deletedAtValue = data.deletedAt;
                    const deletedAtDate = deletedAtValue?.toDate ? deletedAtValue.toDate() : (deletedAtValue instanceof Date ? deletedAtValue : new Date());

                    const item: DeletedItem = {
                        id: docSnap.id,
                        name: data[coll.nameField] || data.title || `Voucher ${data.voucherNumber}` || 'Unnamed',
                        type: coll.type,
                        deletedAt: deletedAtDate,
                        collectionPath: coll.path,
                        convertedToType: data.convertedToType,
                        convertedToVoucherNumber: data.convertedToVoucherNumber,
                    };

                    // For vouchers, extract additional fields
                    if (coll.path === 'vouchers') {
                        item.voucherNumber = data.voucherNumber;
                        // Handle Firestore Timestamp for date
                        item.date = data.date?.toDate ? data.date.toDate() : (data.date instanceof Date ? data.date : data.date ? new Date(data.date) : null);
                        item.accountId = data.accountId;
                        item.fromAccountId = data.fromAccountId;
                        item.toAccountId = data.toAccountId;
                        item.userId = data.userId;
                        item.deletedBy = data.deletedBy || data.userId; // Use deletedBy if available, fallback to userId
                        
                        // Get account name from journalAccountNames
                        const accountIdToUse = item.accountId || item.fromAccountId || item.toAccountId;
                        if (accountIdToUse && journalAccountNames[accountIdToUse]) {
                            item.accountName = journalAccountNames[accountIdToUse];
                        }
                    }

                    return item;
                });
                  

                setDeletedItems(prev => {
                    const otherItems = prev.filter(item => item.collectionPath !== coll.path);
                    return [...otherItems, ...newItems];
                });

            }, (error) => {
                console.error(`Error fetching from ${coll.path}:`, error);
                if (!initialLoadComplete) {
                   setLoading(false);
                   initialLoadComplete = true;
                }
            });
            });

            return () => subcollectionUnsubs.forEach((unsub) => unsub());
        }, [companyId, user?.uid, journalAccountNames]);

    // Fetch user names for deleted items
    useEffect(() => {
        const fetchUserNames = async () => {
            const userIds = new Set<string>();
            deletedItems.forEach(item => {
                if (item.deletedBy) userIds.add(item.deletedBy);
                if (item.userId && !item.deletedBy) userIds.add(item.userId);
            });

            const newUserNames: Record<string, string> = {};
            for (const uid of Array.from(userIds)) {
                if (!userNames[uid]) {
                    try {
                        const userDoc = await getDoc(doc(firestore, "users", uid));
                        if (userDoc.exists()) {
                            const userData = userDoc.data();
                            newUserNames[uid] = userData.displayName || userData.email || "Unknown";
                        } else {
                            newUserNames[uid] = "Unknown";
                        }
                    } catch (e) {
                        console.error("Error fetching user:", e);
                        newUserNames[uid] = "Unknown";
                    }
                }
            }

            if (Object.keys(newUserNames).length > 0) {
                setUserNames(prev => ({ ...prev, ...newUserNames }));
            }
        };

        if (deletedItems.length > 0) {
            fetchUserNames();
        }
    }, [deletedItems, userNames]);

    const [accountNames, setAccountNames] = useState<Record<string, string>>({});

    // Fetch account names for vouchers if missing
    useEffect(() => {
        const fetchMissingAccountNames = async () => {
            const accountIdsToFetch = new Set<string>();
            deletedItems.forEach(item => {
                if (item.type === 'Voucher') {
                    const accountId = item.accountId || item.fromAccountId || item.toAccountId;
                    if (accountId && !journalAccountNames[accountId] && !accountNames[accountId]) {
                        accountIdsToFetch.add(accountId);
                    }
                }
            });

            if (accountIdsToFetch.size === 0) return;

            const collectionsToSearch = ['parties', 'bank_accounts', 'staff', 'items', 'expense_accounts', 'taxes'];
            const nameFields = ['name', 'accountName', 'name', 'name', 'name', 'name'];

            const newAccountNames: Record<string, string> = {};
            for (const accountId of Array.from(accountIdsToFetch)) {
                let found = false;
                for (let i = 0; i < collectionsToSearch.length && !found; i++) {
                    try {
                        const docRef = doc(firestore, `companies/${companyId}/${collectionsToSearch[i]}`, accountId);
                        const docSnap = await getDoc(docRef);
                        if (docSnap.exists()) {
                            const name = docSnap.data()?.[nameFields[i]] || 'Unknown';
                            newAccountNames[accountId] = name;
                            found = true;
                        }
                    } catch (error) {
                        // Continue to next collection
                    }
                }
                if (!found) {
                    newAccountNames[accountId] = 'Unknown Account';
                }
            }

            if (Object.keys(newAccountNames).length > 0) {
                setAccountNames(prev => ({ ...prev, ...newAccountNames }));
            }
        };

        if (deletedItems.length > 0 && companyId) {
            fetchMissingAccountNames();
        }
    }, [deletedItems, companyId, journalAccountNames, accountNames]);

    // Enrich deleted items with user names and account names
    const enrichedDeletedItems = useMemo(() => {
        return deletedItems.map(item => {
            const enriched = { ...item };
            
            // Add user name
            const userIdToUse = enriched.deletedBy || enriched.userId;
            if (userIdToUse && userNames[userIdToUse]) {
                enriched.deletedByUserName = userNames[userIdToUse];
            }

            // Update account name - check journalAccountNames first, then accountNames
            if (enriched.type === 'Voucher' && !enriched.accountName) {
                const accountIdToUse = enriched.accountId || enriched.fromAccountId || enriched.toAccountId;
                if (accountIdToUse) {
                    enriched.accountName = journalAccountNames[accountIdToUse] || accountNames[accountIdToUse] || undefined;
                }
            }

            return enriched;
        });
    }, [deletedItems, userNames, journalAccountNames, accountNames]);
    
    const handleRestore = async (item: DeletedItem) => {
        const isCompany = item.collectionPath === 'companies' || item.isRootCollection;
        if (!companyId && !isCompany) return;

        try {
            assertCan(can, "delete_records");
        } catch (error) {
            if (error instanceof PermissionDeniedError) {
                toast({
                    variant: "destructive",
                    title: "Permission Denied",
                    description: error.message,
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Failed to check permissions.",
                });
            }
            setItemToConfirm(null);
            return;
        }

        if (isCompany && user?.uid) {
            if (isLocalOnlyMode()) {
                const nonDeletedLocalCompanies = await listLocalCompanies();
                const currentCount = nonDeletedLocalCompanies.length;
                const planId: PlanId =
                    currentCount === 0
                        ? "basic"
                        : ((nonDeletedLocalCompanies[0]?.planId as PlanId) || "basic");
                const plan = getPlanFromPlans(livePlans, planId);
                const maxCompanies = numericEntitlement(plan?.entitlements, "maxCompanies", true);
                if (maxCompanies > 0 && currentCount >= maxCompanies) {
                    toast({
                        variant: "destructive",
                        title: "Plan limit reached",
                        description: `Your plan allows up to ${maxCompanies} compan${maxCompanies === 1 ? "y" : "ies"}. Move one to bin or upgrade to restore from recycle bin.`,
                    });
                    setItemToConfirm(null);
                    return;
                }
            } else {
            try {
                const ownedSnap = await getDocs(query(
                    collection(firestore, "companies"),
                    where("ownerId", "==", user.uid),
                    where("isDeleted", "!=", true)
                ));
                const currentCount = ownedSnap.size;
                const planId: PlanId = currentCount === 0 ? "basic" : (ownedSnap.docs[0]?.data()?.planId as PlanId) || "basic";
                const plan = getPlanFromPlans(livePlans, planId);
                const maxCompanies = numericEntitlement(plan?.entitlements, "maxCompanies", false);
                if (maxCompanies > 0 && currentCount >= maxCompanies) {
                    toast({
                        variant: "destructive",
                        title: "Plan limit reached",
                        description: `Your plan allows up to ${maxCompanies} compan${maxCompanies === 1 ? "y" : "ies"}. Move one to bin or upgrade to restore from recycle bin.`,
                    });
                    setItemToConfirm(null);
                    return;
                }
            } catch (error) {
                // Offline fallback: context list se count nikaalo so restore action runtime error na de.
                const currentCount = (allCompanies || []).filter((c: any) => !c?.isDeleted).length;
                const planId: PlanId = (company?.planId as PlanId) || "basic";
                const plan = getPlanFromPlans(livePlans, planId);
                const maxCompanies = numericEntitlement(plan?.entitlements, "maxCompanies", false);
                if (maxCompanies > 0 && currentCount >= maxCompanies) {
                    toast({
                        variant: "destructive",
                        title: "Plan limit reached",
                        description: `Your plan allows up to ${maxCompanies} compan${maxCompanies === 1 ? "y" : "ies"}.`,
                    });
                    setItemToConfirm(null);
                    return;
                }
                console.warn("Restore company count fallback used due offline Firestore:", error);
            }
            }
        }
        
        setIsProcessing(true);
        try {
            if (isCompany && isLocalOnlyMode()) {
                // Local-only mode: recycle bin se company restore local table par karo.
                const localCompany = await getLocalCompanyById(item.id, { includeDeleted: true });
                if (!localCompany) throw new Error("Local company not found");
                await upsertLocalCompany({
                    ...localCompany,
                    id: item.id,
                    isDeleted: false,
                    deletedAt: null,
                });
            } else {
                const docRef = isCompany
                    ? doc(firestore, 'companies', item.id)
                    : doc(firestore, `companies/${companyId}/${item.collectionPath}`, item.id);
                await updateDoc(docRef, {
                    isDeleted: false,
                    deletedAt: null,
                });
            }
            toast({ title: "Restored!", description: `"${item.name}" has been restored.` });
        } catch (error) {
            console.error('Restore failed:', error);
            toast({ variant: 'destructive', title: "Error", description: "Failed to restore item." });
        }
        setItemToConfirm(null);
        setIsProcessing(false);
    };

    // Resolve storage path: full URL (Firebase) or plain path like companies/xxx/yyy
    const getStoragePath = (filePath: string): string | null => {
        if (!filePath || typeof filePath !== "string") return null;
        const trimmed = filePath.trim();
        if (!trimmed) return null;
        try {
            if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                const url = new URL(trimmed);
                const encoded = url.pathname.split("/o/")[1];
                if (encoded) return decodeURIComponent(encoded.split("?")[0]);
            }
            // Already a storage path
            if (trimmed.startsWith("companies/")) return trimmed;
            return trimmed;
        } catch {
            return null;
        }
    };

    const deleteStorageFilesForDoc = async (data: Record<string, unknown>): Promise<void> => {
        const { ref, deleteObject } = await import("firebase/storage");
        const { storage } = await import("@/lib/firebase");
        const paths: string[] = [];
        if (Array.isArray(data.filePaths)) paths.push(...(data.filePaths as string[]));
        if (data.storagePath && typeof data.storagePath === "string") paths.push(data.storagePath);
        if (data.path && typeof data.path === "string") paths.push(data.path);
        for (const filePath of paths) {
            const storagePath = getStoragePath(filePath);
            if (!storagePath) continue;
            try {
                await deleteObject(ref(storage, storagePath));
            } catch {
                // File may already be missing
            }
        }
    };

    const handlePermanentDelete = async (item: DeletedItem) => {
        const isCompany = item.collectionPath === 'companies';
        if (!companyId && !isCompany) return;
        
        try {
            assertCan(can, "permanently_delete_records");
        } catch (error) {
            if (error instanceof PermissionDeniedError) {
                toast({
                    variant: "destructive",
                    title: "Permission Denied",
                    description: error.message,
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Failed to check permissions.",
                });
            }
            return;
        }
        
        // Quick delete OFF = only remove from company admin view; item stays in DB and shows in super admin recycle bin.
        // Quick delete ON  = delete from server (Firestore + Storage) immediately.
        const quickDelete = recycleBinConfig?.quickDelete ?? false;

        setIsProcessing(true);
        try {
            if (isCompany) {
                if (isLocalOnlyMode()) {
                    // Local-only mode: permanent delete means local company registry se purge.
                    await removeLocalCompanyById(item.id, { firebaseUid: user?.uid ?? null });
                    toast({ title: "Deleted permanently", description: `"${item.name}" has been removed from your recycle bin.` });
                    return;
                }
                if (quickDelete) {
                    const result = await deleteCompanyComplete(item.id, user?.uid || "");
                    if (!result.success) throw new Error(result.error);
                    toast({ title: "Success", description: `"${item.name}" deleted permanently.` });
                } else {
                    await updateDoc(doc(firestore, "companies", item.id), {
                        movedToAdminRecycleAt: serverTimestamp(),
                    });
                    toast({ title: "Deleted permanently", description: `"${item.name}" has been removed from your recycle bin.` });
                }
                return;
            }

            const docPath = `companies/${companyId}/${item.collectionPath}/${item.id}`;
            const docRef = doc(firestore, docPath);

            if (quickDelete) {
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    await deleteStorageFilesForDoc(docSnap.data() as Record<string, unknown>);
                }
                await deleteDoc(docRef);
                if (item.collectionPath === "vouchers" && companyId && company) {
                  await sendTransactionAlert(companyId, company, {
                    kind: "deleted",
                    voucherId: item.id,
                    voucherNumber: (item as any).voucherNumber || item.name,
                    voucherType: (item as any).type,
                    performedByUserId: user?.uid,
                    performedByName: (customUser?.displayName || user?.displayName) ?? undefined,
                    performedByEmail: user?.email ?? undefined,
                  });
                }
                toast({ title: "Success", description: `"${item.name}" deleted permanently.` });
            } else {
                await updateDoc(docRef, { movedToAdminRecycleAt: serverTimestamp() });
                toast({ title: "Deleted permanently", description: "Item has been removed from your recycle bin." });
            }
        } catch (error) {
            console.error("Delete Error:", error);
            toast({ variant: 'destructive', title: "Error", description: "Permanent delete failed." });
        } finally {
            setItemToConfirm(null);
            setIsProcessing(false);
        }
    };

    const handleEmptyBin = async () => {
        if (deletedItems.length === 0) return;
        
        try {
            assertCan(can, "permanently_delete_records");
        } catch (error) {
            if (error instanceof PermissionDeniedError) {
                toast({
                    variant: "destructive",
                    title: "Permission Denied",
                    description: error.message,
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Failed to check permissions.",
                });
            }
            setIsEmptyDialogOpen(false);
            return;
        }
        
        setIsProcessing(true);
        setIsEmptyDialogOpen(false);

        // Quick delete OFF = only remove from company admin list (movedToAdminRecycleAt); super admin bin keeps them.
        // Quick delete ON  = delete from server.
        const quickDelete = recycleBinConfig?.quickDelete ?? false;
        const companyIds: string[] = [];
        const nonCompanyItems: DeletedItem[] = [];
        for (const item of deletedItems) {
            if (item.collectionPath === "companies") companyIds.push(item.id);
            else nonCompanyItems.push(item);
        }

        try {
            if (isLocalOnlyMode()) {
                // Deleted companies: SQLite registry se purge. Vouchers/bank_accounts Firestore pe hain — neeche `nonCompanyItems` loop zaroor chale.
                for (const cid of companyIds) {
                    await removeLocalCompanyById(cid, { firebaseUid: user?.uid ?? null });
                }
                if (companyIds.length > 0) {
                    setDeletedItems((prev) => prev.filter((item) => item.collectionPath !== "companies"));
                }
                if (nonCompanyItems.length === 0) {
                    toast({ title: "Deleted permanently", description: "All deleted companies have been removed from your recycle bin." });
                    setUserNames({});
                    setIsProcessing(false);
                    return;
                }
            }

            if (nonCompanyItems.length > 0 && !companyId) {
                toast({ variant: "destructive", title: "Error", description: "Select a company to remove these items from the bin." });
                setIsProcessing(false);
                return;
            }

            // Local-only me `removeLocalCompanyById` pehle ho chuka — `companies/*` Firestore delete loop dobara mat chalao.
            const firestoreCompanyIds = isLocalOnlyMode() ? [] : companyIds;

            if (quickDelete) {
                for (const cid of firestoreCompanyIds) {
                    const result = await deleteCompanyComplete(cid, user?.uid || "");
                    if (!result.success) {
                        toast({ variant: "destructive", title: "Error", description: result.error || "Failed to delete company." });
                        setIsProcessing(false);
                        return;
                    }
                }
                for (const item of nonCompanyItems) {
                    const docPath = `companies/${companyId}/${item.collectionPath}/${item.id}`;
                    const docRef = doc(firestore, docPath);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        await deleteStorageFilesForDoc(docSnap.data() as Record<string, unknown>);
                    }
                    await deleteDoc(docRef);
                    if (item.collectionPath === "vouchers" && companyId && company) {
                      await sendTransactionAlert(companyId, company, {
                        kind: "deleted",
                        voucherId: item.id,
                        voucherNumber: (item as any).voucherNumber || item.name,
                        voucherType: (item as any).type,
                        performedByUserId: user?.uid,
                        performedByName: (customUser?.displayName || user?.displayName) ?? undefined,
                        performedByEmail: user?.email ?? undefined,
                      });
                    }
                }
                toast({ title: "Bin Emptied", description: "All items permanently deleted from server." });
            } else {
                for (const cid of firestoreCompanyIds) {
                    await updateDoc(doc(firestore, "companies", cid), { movedToAdminRecycleAt: serverTimestamp() });
                }
                const batch = writeBatch(firestore);
                for (const item of nonCompanyItems) {
                    batch.update(doc(firestore, `companies/${companyId}/${item.collectionPath}/${item.id}`), { movedToAdminRecycleAt: serverTimestamp() });
                }
                await batch.commit();
                toast({ title: "Deleted permanently", description: "All items have been removed from your recycle bin." });
            }
            setDeletedItems([]);
            setUserNames({});
        } catch (error) {
            console.error("Error emptying bin:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not empty bin." });
        } finally {
            setIsProcessing(false);
        }
    };
    
     const categorizedAndFilteredItems = useMemo(() => {
        return enrichedDeletedItems
            .filter(item => {
                const searchLower = searchTerm.toLowerCase();
                return item.name.toLowerCase().includes(searchLower) ||
                       item.voucherNumber?.toLowerCase().includes(searchLower) ||
                       item.accountName?.toLowerCase().includes(searchLower) ||
                       item.deletedByUserName?.toLowerCase().includes(searchLower);
            })
            .reduce((acc, item) => {
                (acc[item.type] = acc[item.type] || []).push(item);
                return acc;
            }, {} as Record<string, DeletedItem[]>);
    }, [enrichedDeletedItems, searchTerm]);
    
    if (loading) {
        return (
            <div className="p-3 sm:p-4 md:p-6 lg:p-8 space-y-4">
                <Skeleton className="h-10 sm:h-12 w-3/4 sm:w-1/4" />
                <Skeleton className="h-6 sm:h-8 w-full sm:w-1/2" />
                <Skeleton className="h-48 sm:h-64 w-full" />
            </div>
        )
    }

    return (
        <div className="p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex-shrink-0">
                    <h1 className="text-xl sm:text-2xl font-bold font-headline">Recycle Bin</h1>
                    <p className="text-sm sm:text-base text-muted-foreground mt-1">Deleted items are stored here. Converted vouchers are also shown for audit purposes.</p>
                </div>
                 <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
                     <PermissionButton 
                        permission="permanently_delete_records"
                        variant="destructive" 
                        onClick={() => setIsEmptyDialogOpen(true)} 
                        disabled={enrichedDeletedItems.length === 0 || isProcessing}
                        className="w-full sm:w-auto"
                    >
                        {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Trash2 className="mr-2 h-4 w-4" />} 
                        <span className="hidden sm:inline">Empty Bin</span>
                        <span className="sm:hidden">Empty</span>
                    </PermissionButton>
                    <div className="relative w-full sm:w-auto sm:max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search deleted items..."
                            className="pl-9 w-full"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>
            
            {enrichedDeletedItems.length === 0 ? (
                <Card className="text-center py-16">
                    <CardHeader>
                        <CardTitle>The Recycle Bin is Empty</CardTitle>
                        <CardDescription>When you delete an item, it will appear here.</CardDescription>
                    </CardHeader>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {Object.keys(categorizedAndFilteredItems).sort().map(category => {
                        const items = categorizedAndFilteredItems[category];
                        if (items.length === 0) return null;
                        return (
                             <Card key={category} className="flex flex-col overflow-hidden">
                                <CardHeader className="pb-3 flex-shrink-0">
                                    <CardTitle className="text-base sm:text-lg">{category} ({items.length})</CardTitle>
                                </CardHeader>
                                <CardContent className="p-0 flex-1 flex flex-col min-h-0 overflow-hidden">
                                    <div className="flex-1 max-h-[calc(100vh-20rem)] sm:max-h-[calc(100vh-24rem)] overflow-y-auto overflow-x-auto">
                                        <ul className="divide-y w-full">
                                            {items
                                                .sort((a,b) => (b.deletedAt?.getTime() || 0) - (a.deletedAt?.getTime() || 0))
                                                .map(item => (
                                                <RecycleBinItem 
                                                    key={item.id} 
                                                    item={item} 
                                                    onRestore={() => setItemToConfirm({item, action: 'restore'})} 
                                                    onDelete={() => setItemToConfirm({item, action: 'delete'})}
                                                    restoreDisabled={item.isRootCollection || item.collectionPath === 'companies' ? atMaxCompanies : false}
                                                    compactView
                                                    daysToPermanentDeleteText={recycleBinConfig && !recycleBinConfig.quickDelete ? (() => {
                                                        const raw = recycleBinConfig.autoDeleteAfterDaysCompanyAdmin;
                                                        const d = (typeof raw === 'number' && raw > 0) ? raw : (Number(raw) || 90);
                                                        const oneDayMs = 24 * 60 * 60 * 1000;
                                                        const dayMs = d * oneDayMs;
                                                        const deletedAtMs = item.deletedAt != null ? new Date(item.deletedAt).getTime() : null;
                                                        if (deletedAtMs == null || !Number.isFinite(deletedAtMs)) {
                                                            return d <= 1 ? `${Math.floor(d * 24)}h 0m 0s to delete permanently` : `${d} days to delete permanently`;
                                                        }
                                                        const remainingMs = Math.max(0, dayMs - (Date.now() - deletedAtMs));
                                                        if (!Number.isFinite(remainingMs)) {
                                                            return `${d} days to delete permanently`;
                                                        }
                                                        if (remainingMs > oneDayMs) {
                                                            return `${Math.ceil(remainingMs / oneDayMs)} days to delete permanently`;
                                                        }
                                                        const h = Math.floor(remainingMs / (60 * 60 * 1000)) || 0;
                                                        const m = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000)) || 0;
                                                        const s = Math.floor((remainingMs % (60 * 1000)) / 1000) || 0;
                                                        return `${h}h ${m}m ${s}s to delete permanently`;
                                                    })() : undefined}
                                                />
                                            ))}
                                        </ul>
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}

            <AlertDialog open={!!itemToConfirm} onOpenChange={() => setItemToConfirm(null)}>
                <AlertDialogContent className="max-w-[95vw] sm:max-w-lg">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-base sm:text-lg">Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription className="text-sm">
                           {itemToConfirm?.action === 'delete'
                            ? "This action cannot be undone. This will permanently delete the item."
                            : "This will restore the item to its original location."
                           }
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                        <AlertDialogCancel disabled={isProcessing} className="w-full sm:w-auto">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (itemToConfirm?.action === 'delete') handlePermanentDelete(itemToConfirm.item);
                                if (itemToConfirm?.action === 'restore') handleRestore(itemToConfirm.item);
                            }}
                            className={cn(
                                itemToConfirm?.action === 'delete' ? 'bg-destructive hover:bg-destructive/90' : '',
                                "w-full sm:w-auto"
                            )}
                            disabled={isProcessing}
                        >
                             {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {itemToConfirm?.action === 'delete' ? 'Delete Permanently' : 'Restore'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            
             <AlertDialog open={isEmptydialogOpen} onOpenChange={setIsEmptyDialogOpen}>
                <AlertDialogContent className="max-w-[95vw] sm:max-w-lg">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-base sm:text-lg">Empty the Recycle Bin?</AlertDialogTitle>
                        <AlertDialogDescription className="text-sm">
                            This action cannot be undone. This will permanently delete all {enrichedDeletedItems.length} items in the recycle bin.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                        <AlertDialogCancel disabled={isProcessing} className="w-full sm:w-auto">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleEmptyBin} disabled={isProcessing} className="bg-destructive hover:bg-destructive/90 w-full sm:w-auto">
                           {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                           Empty Bin
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

        </div>
    );
}
