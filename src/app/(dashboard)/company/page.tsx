
"use client";

import { CompanySelector } from "@/components/company/CompanySelector";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useMemo } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { collection, query, where, onSnapshot, getDoc, doc, DocumentData } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useCompany } from "@/hooks/useCompany";
import { isLocalOnlyMode } from "@/lib/localMode";
import { getLocalCompanyById } from "@/lib/localCompanyStore";

export type Company = {
  id: string;
  name: string;
  isOwned: boolean;
  ownerId: string;
  /** Shared-company ownership check (align with useCompany Company) */
  ownerEmail?: string;
  isDeleted?: boolean;
  storageOption?: 'firebase' | 'drive';
};

function SelectCompanyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  // Local mode: list Firestore snapshots se nahi, useCompany() ke local DB hydrate se aati hai (owned/shared wahi logic jo CompanySelector me).
  const { allCompanies: contextCompanies, loading: companyContextLoading } = useCompany();
  const [loading, setLoading] = useState(true);
  const [ownedCompanies, setOwnedCompanies] = useState<Company[]>([]);
  const [sharedCompanies, setSharedCompanies] = useState<Company[]>([]);
  const [newlyCreatedCompany, setNewlyCreatedCompany] = useState<Company | null>(null);
  const [isCreateCompanyDialogOpen, setIsCreateCompanyDialogOpen] = useState(false);

  useEffect(() => {
    // Local-only: page-level Firestore listeners skip — data companyContextLoading + contextCompanies se.
    if (isLocalOnlyMode()) {
      return;
    }
    if (authLoading || !user || !user.email) {
      if (!authLoading && !user) {
        router.replace("/");
      }
      return;
    }

    setLoading(true);
    let settled = false;
    const setSettled = () => {
      if (settled) return;
      settled = true;
      setLoading(false);
    };

    const ownedQuery = query(collection(firestore, "companies"), where("ownerId", "==", user.uid));
    const sharedQuery = query(collection(firestore, "companies"), where("sharedWithEmails", "array-contains", user.email));

    let ownedDone = false;
    let sharedDone = false;
    const maybeDone = () => {
      if (ownedDone && sharedDone) setSettled();
    };

    const unsubOwned = onSnapshot(ownedQuery, (snapshot) => {
        const companies = snapshot.docs
            .map((doc: DocumentData) => ({ id: doc.id, ...doc.data(), isOwned: true } as Company))
            .filter(c => !c.isDeleted);
        setOwnedCompanies(companies);
        ownedDone = true;
        maybeDone();
    }, (error) => {
        console.error("Error fetching owned companies:", error);
        setSettled();
    });

    const unsubShared = onSnapshot(sharedQuery, (snapshot) => {
        const companies = snapshot.docs
            .map((doc: DocumentData) => ({ id: doc.id, ...doc.data(), isOwned: false } as Company))
            .filter(c => !c.isDeleted);
        setSharedCompanies(companies);
        sharedDone = true;
        maybeDone();
    }, (error) => {
        console.error("Error fetching shared companies:", error);
        setSettled();
    });

    // Fallback: stop loading after 10s so user never stays on skeleton (e.g. network/rules issues)
    const timeoutId = setTimeout(setSettled, 10000);

    return () => {
        unsubOwned();
        unsubShared();
        clearTimeout(timeoutId);
    };
  }, [user, authLoading, router]);

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
    // Local-first: useCompany context list = local SQLite + optional cloud mirror; isOwned ownerId/email se.
    if (isLocalOnlyMode()) {
      const isOwnedByUser = (c: Company) =>
        c.ownerId === user?.uid ||
        (!!c.ownerEmail && !!user?.email && c.ownerEmail.toLowerCase().trim() === user.email!.toLowerCase().trim());
      const companyMap = new Map<string, Company>();
      (contextCompanies || []).forEach((c) => {
        if (c.isDeleted) return;
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
    return Array.from(companyMap.values());
}, [ownedCompanies, sharedCompanies, user, newlyCreatedCompany, contextCompanies]);

  // Local: company list hydrate hone tak skeleton (same source as header selector).
  if (authLoading || (isLocalOnlyMode() ? companyContextLoading : loading)) {
    return (
        <div className="flex min-h-screen items-center justify-center">
            <Card className="w-full max-w-lg">
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

  return <CompanySelector companies={allCompanies} />;
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
