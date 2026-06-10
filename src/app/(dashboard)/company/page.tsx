
"use client";

import { CompanySelector } from "@/components/company/CompanySelector";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useMemo } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { collection, query, where, onSnapshot, getDoc, doc, DocumentData } from "firebase/firestore";
import { auth, firestore } from "@/lib/firebase";
import { useCompany } from "@/hooks/useCompany";
import { isLocalOnlyMode } from "@/lib/localMode";
import { embeddedClientUsesFirestoreCompanyList } from "@/lib/planSyncClientPolicy";
import { getLocalCompanyById } from "@/lib/localCompanyStore";
import { registerCompanyPickerFirestoreDetach } from "@/lib/companyPickerFirestoreDetach";
import { isOfflineCompanyStorage } from "@/lib/companyUnlockGate";
import { getSuperAdminEmails } from "@/lib/superAdminEmails";
import { filterSharedOnlyCompaniesForSuperAdminInMainApp } from "@/lib/companySuperAdminFilter";
import { sharedCompanyQueryKey, sharedCompanyQuerySpecs } from "@/lib/sharedWithEmailsQuery";
import { activateOnlineGateForCompanyPicker } from "@/lib/gates/gateClientDefaults";

/** Device-local SQLite rows — online Firestore picker list me merge (Drive restore / join ke baad). */
function mergeDeviceLocalCompaniesIntoMap(
  companyMap: Map<string, Company>,
  localRows: Company[],
  user: { uid?: string | null; email?: string | null } | null | undefined
) {
  const isOwnedByUser = (c: Company) =>
    c.ownerId === user?.uid ||
    (!!c.ownerEmail &&
      !!user?.email &&
      c.ownerEmail.toLowerCase().trim() === user.email!.toLowerCase().trim());
  for (const c of localRows) {
    if (!isCompanyVisibleInCompanyPage(c)) continue;
    if (!isOfflineCompanyStorage(c)) continue;
    const driveSharedJoin =
      (c as Company & { driveSharedJoin?: boolean }).driveSharedJoin === true;
    companyMap.set(c.id, {
      ...c,
      storageOption: "local",
      isOwned: driveSharedJoin ? false : isOwnedByUser(c),
    });
  }
}

export type Company = {
  id: string;
  name: string;
  isOwned: boolean;
  ownerId: string;
  /** Shared-company ownership check (align with useCompany Company) */
  ownerEmail?: string;
  isDeleted?: boolean;
  /** Admin recycle-bin hidden tab marker: normal company picker list se hide. */
  movedToAdminRecycleAt?: unknown;
  storageOption?: 'firebase' | 'drive' | 'local';
};

/** /company page list guard: deleted + admin-hidden rows ko normal app picker se hatao. */
function isCompanyVisibleInCompanyPage(c: Company): boolean {
  return c.isDeleted !== true && c.movedToAdminRecycleAt == null;
}

function SelectCompanyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, customUser, loading: authLoading } = useAuth();
  const isSuperAdminByEmail = useMemo(() => {
    const e = (user?.email || "").toLowerCase().trim();
    if (!e) return false;
    return getSuperAdminEmails().some((x) => (x || "").toLowerCase().trim() === e);
  }, [user?.email]);
  const isSuperAdminUser = customUser?.role === "SuperAdmin" || isSuperAdminByEmail;
  // Local mode: list Firestore snapshots se nahi, useCompany() ke local DB hydrate se aati hai (owned/shared wahi logic jo CompanySelector me).
  const { allCompanies: contextCompanies, loading: companyContextLoading, reloadLocalCompanyRegistry, triggerSync } = useCompany();
  const [loading, setLoading] = useState(true);
  const [ownedCompanies, setOwnedCompanies] = useState<Company[]>([]);
  const [sharedCompanies, setSharedCompanies] = useState<Company[]>([]);
  const [newlyCreatedCompany, setNewlyCreatedCompany] = useState<Company | null>(null);
  const [isCreateCompanyDialogOpen, setIsCreateCompanyDialogOpen] = useState(false);

  useEffect(() => {
    activateOnlineGateForCompanyPicker();
  }, []);

  useEffect(() => {
    // Static/APK: Firestore company list — pure web local-only me page-level listeners skip.
    if (isLocalOnlyMode() && !embeddedClientUsesFirestoreCompanyList()) {
      registerCompanyPickerFirestoreDetach(null);
      return;
    }
    if (authLoading) {
      registerCompanyPickerFirestoreDetach(null);
      setLoading(true);
      setOwnedCompanies([]);
      setSharedCompanies([]);
      setNewlyCreatedCompany(null);
      return;
    }
    if (!user || !user.email) {
      /** Pehle currentUser check: warna `setLoading(false)` ke baad blank flash + galat route */
      if (auth.currentUser) {
        registerCompanyPickerFirestoreDetach(null);
        return;
      }
      registerCompanyPickerFirestoreDetach(null);
      setOwnedCompanies([]);
      setSharedCompanies([]);
      setLoading(false);
      router.replace("/");
      return;
    }

    setOwnedCompanies([]);
    setSharedCompanies([]);
    setNewlyCreatedCompany(null);
    setLoading(true);
    let settled = false;
    const setSettled = () => {
      if (settled) return;
      settled = true;
      setLoading(false);
    };

    const ownedQuery = query(collection(firestore, "companies"), where("ownerId", "==", user.uid));
    const sharedQuerySpecs = isSuperAdminUser ? [] : sharedCompanyQuerySpecs(user.email);

    let ownedDone = false;
    let sharedDone = sharedQuerySpecs.length === 0;
    const maybeDone = () => {
      if (ownedDone && sharedDone) setSettled();
    };

    const unsubOwned = onSnapshot(ownedQuery, (snapshot) => {
        const companies = snapshot.docs
            .map((doc: DocumentData) => ({ id: doc.id, ...doc.data(), isOwned: true } as Company))
            .filter(isCompanyVisibleInCompanyPage);
        setOwnedCompanies(companies);
        ownedDone = true;
        maybeDone();
    }, (error) => {
        console.error("Error fetching owned companies:", error);
        setSettled();
    });

    const sharedSnapsByVariant = new Map<string, { docs: readonly { id: string; data: () => Record<string, unknown> }[] }>();
    const sharedVariantsReady = new Set<string>();
    const mergeAndPublishShared = () => {
      if (sharedVariantsReady.size < sharedQuerySpecs.length) return;
      const byId = new Map<string, Company>();
      for (const snap of sharedSnapsByVariant.values()) {
        for (const docSnap of snap.docs) {
          const company = { id: docSnap.id, ...docSnap.data(), isOwned: false } as Company;
          if (isCompanyVisibleInCompanyPage(company)) byId.set(company.id, company);
        }
      }
      setSharedCompanies(Array.from(byId.values()));
      sharedDone = true;
      maybeDone();
    };
    const unsubShared = sharedQuerySpecs.map((spec) =>
      onSnapshot(
        query(collection(firestore, "companies"), where(spec.field, "array-contains", spec.value)),
        (snapshot) => {
          const key = sharedCompanyQueryKey(spec);
          sharedSnapsByVariant.set(key, snapshot);
          sharedVariantsReady.add(key);
          mergeAndPublishShared();
        },
        (error) => {
          console.error("Error fetching shared companies:", error);
          setSettled();
        }
      )
    );

    // Fallback: stop loading after 10s so user never stays on skeleton (e.g. network/rules issues)
    const timeoutId = setTimeout(setSettled, 10000);

    const cleanupListeners = () => {
      unsubOwned();
      unsubShared.forEach((unsub) => unsub());
      clearTimeout(timeoutId);
    };
    registerCompanyPickerFirestoreDetach(cleanupListeners);

    return () => {
      registerCompanyPickerFirestoreDetach(null);
      cleanupListeners();
    };
  }, [user, authLoading, router, isSuperAdminUser]);

  // Online web: SQLite local / Drive-restored companies context se — sirf Firestore listeners se missing the.
  useEffect(() => {
    if (isLocalOnlyMode() && !embeddedClientUsesFirestoreCompanyList()) return;
    reloadLocalCompanyRegistry();
    triggerSync();
  }, [reloadLocalCompanyRegistry, triggerSync]);

  // When redirected from company create with ?new=companyId, fetch that company so it shows without refresh
  const newCompanyId = searchParams.get("new");
  useEffect(() => {
    if (!newCompanyId || !user?.uid) return;
    const alreadyInList = ownedCompanies.some((c) => c.id === newCompanyId) || sharedCompanies.some((c) => c.id === newCompanyId);
    if (alreadyInList) {
      setNewlyCreatedCompany(null);
      return;
    }
    let cancelled = false;
    // Local APK/static: naya company Firestore read ke bina local row se dikhao.
    if (isLocalOnlyMode()) {
      getLocalCompanyById(newCompanyId)
        .then((row) => {
          if (cancelled || !row) return;
          if (row.ownerId !== user?.uid) return;
          setNewlyCreatedCompany({ id: newCompanyId, ...row, isOwned: true } as Company);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
    getDoc(doc(firestore, "companies", newCompanyId))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const data = snap.data();
        if (data?.ownerId !== user?.uid) return;
        setNewlyCreatedCompany({ id: snap.id, ...data, isOwned: true } as Company);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [newCompanyId, user?.uid, ownedCompanies, sharedCompanies]);

  const allCompanies = useMemo(() => {
    // Pure web local-only: useCompany context list; static/APK hybrid Firestore + SQLite merge.
    if (isLocalOnlyMode() && !embeddedClientUsesFirestoreCompanyList()) {
      const isOwnedByUser = (c: Company) =>
        c.ownerId === user?.uid ||
        (!!c.ownerEmail && !!user?.email && c.ownerEmail.toLowerCase().trim() === user.email!.toLowerCase().trim());
      const companyMap = new Map<string, Company>();
      (contextCompanies || []).forEach((c) => {
        // Context list me hidden-tab rows bhi skip rakho taaki admin email normal app me na dekhe.
        if (!isCompanyVisibleInCompanyPage(c as Company)) return;
        companyMap.set(c.id, { ...(c as Company), isOwned: isOwnedByUser(c as Company) });
      });
      if (newlyCreatedCompany && !companyMap.has(newlyCreatedCompany.id)) {
        companyMap.set(newlyCreatedCompany.id, newlyCreatedCompany);
      }
      return Array.from(companyMap.values());
    }
    const companyMap = new Map<string, Company>();
    // Add owned companies first
    ownedCompanies.forEach(c => companyMap.set(c.id, { ...c, isOwned: true }));
    // Then add shared companies, but only if they aren't already in the map as owned
    sharedCompanies.forEach(c => {
        if (!companyMap.has(c.id)) {
            companyMap.set(c.id, { ...c, isOwned: c.ownerId === user?.uid });
        }
    });
    // If we just created a company and it's not in the list yet, show it so no refresh is needed
    if (newlyCreatedCompany && !companyMap.has(newlyCreatedCompany.id)) {
      companyMap.set(newlyCreatedCompany.id, newlyCreatedCompany);
    }
    mergeDeviceLocalCompaniesIntoMap(
      companyMap,
      (contextCompanies || []) as Company[],
      user
    );
    const merged = Array.from(companyMap.values());
    return filterSharedOnlyCompaniesForSuperAdminInMainApp(
      merged,
      user ? { uid: user.uid, email: user.email } : null,
      isSuperAdminUser,
      "/company"
    );
}, [ownedCompanies, sharedCompanies, user, newlyCreatedCompany, contextCompanies, isSuperAdminUser]);

  // Static/APK: Firestore hydrate; pure web local-only: SQLite context loading.
  if (authLoading || (isLocalOnlyMode() && !embeddedClientUsesFirestoreCompanyList() ? companyContextLoading : loading)) {
    return (
        <div className="flex h-dvh max-h-dvh items-center justify-center overflow-hidden p-3">
            <Card className="flex h-[90dvh] max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden">
                <CardHeader>
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-4 w-full max-w-sm" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                </CardContent>
            </Card>
        </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-lg">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">Signing out…</CardContent>
        </Card>
      </div>
    );
  }

  return <CompanySelector key={user.uid} companies={allCompanies} />;
}

function SelectCompanyPageLoading() {
  return (
    <div className="min-h-screen p-4 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-64" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function SelectCompanyPage() {
  return (
    // Keep useSearchParams consumer behind Suspense for Next.js static prerender compatibility.
    <Suspense fallback={<SelectCompanyPageLoading />}>
      <SelectCompanyPageContent />
    </Suspense>
  );
}
