
"use client";

import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { CreateCompanyDialog } from "@/components/company/CreateCompanyDialog";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { isLocalOnlyMode } from "@/lib/localMode";
import { registerCompanyPickerFirestoreDetach } from "@/lib/companyPickerFirestoreDetach";

function CreateCompanyPageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
        <p className="mt-4 text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

function CreateCompanyPageContent() {
  const { user, loading: authLoading } = useAuth();
  /** `loading`: registry hydrate — iske pehle khali list mat maanho; `companyId` orphan ho sakta hai (list 0 par bhi) → /company bounce loop. */
  const { setCompanyId, allCompanies, loading: companyContextLoading } = useCompany();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [checkingCompanies, setCheckingCompanies] = useState(true);
  /** Jab koi company pehle se hai tab dialog band kar sakte hain (select page par wapas). */
  const [userHasCompanies, setUserHasCompanies] = useState(false);
  const skipCloseRedirectRef = useRef(false);

  // Sirf list length / dismissable — `allCompanies` par mat jodo warna create ke turant baad effect dubara chal kar dialog phir `open` kar deta tha.
  useEffect(() => {
    if (!isLocalOnlyMode() || authLoading || companyContextLoading) return;
    const selectable = (allCompanies || []).filter((c) => !c.isDeleted);
    setUserHasCompanies(selectable.length > 0);
  }, [allCompanies, authLoading, companyContextLoading]);

  // Hydrate: /company/create par pehli baar loading ke baad create dialog kholo — `allCompanies` yahan dependency me nahi (re-open bug).
  useEffect(() => {
    if (isLocalOnlyMode()) {
      registerCompanyPickerFirestoreDetach(null);
      // Local-first: jab tak SQLite/registry load ho rahi ho wait karo.
      if (authLoading || companyContextLoading) {
        setCheckingCompanies(true);
        return;
      }
      setCheckingCompanies(false);
      setIsDialogOpen(true);
      return;
    }

    if (authLoading || !user || !user.email) {
      registerCompanyPickerFirestoreDetach(null);
      if (!authLoading && !user) {
        router.replace("/");
      }
      return;
    }

    setCheckingCompanies(true);
    let settled = false;
    const setSettled = (hasCompanies: boolean) => {
      if (settled) return;
      settled = true;
      setCheckingCompanies(false);
      setUserHasCompanies(hasCompanies);
      setIsDialogOpen(true);
    };

    const ownedQuery = query(collection(firestore, "companies"), where("ownerId", "==", user.uid));
    const sharedQuery = query(collection(firestore, "companies"), where("sharedWithEmails", "array-contains", user.email));

    let ownedCount = 0;
    let sharedCount = 0;
    let ownedDone = false;
    let sharedDone = false;
    const maybeDone = () => {
      if (!ownedDone || !sharedDone) return;
      setSettled(ownedCount > 0 || sharedCount > 0);
    };

    const unsubOwned = onSnapshot(ownedQuery, (snapshot) => {
      ownedCount = snapshot.docs.filter(doc => !doc.data().isDeleted).length;
      ownedDone = true;
      maybeDone();
    }, () => {
      setSettled(false);
    });

    const unsubShared = onSnapshot(sharedQuery, (snapshot) => {
      sharedCount = snapshot.docs.filter(doc => !doc.data().isDeleted).length;
      sharedDone = true;
      maybeDone();
    }, () => {
      setSettled(false);
    });

    const timeoutId = setTimeout(() => setSettled(false), 10000);

    const cleanupListeners = () => {
      unsubOwned();
      unsubShared();
      clearTimeout(timeoutId);
    };
    registerCompanyPickerFirestoreDetach(cleanupListeners);

    return () => {
      registerCompanyPickerFirestoreDetach(null);
      cleanupListeners();
    };
  }, [user, authLoading, router, companyContextLoading]);

  const explicitReturnTo = searchParams.get("returnTo")?.trim();

  const handleCompanyCreated = (companyId: string) => {
    skipCloseRedirectRef.current = true;
    setCompanyId(companyId);
    setIsDialogOpen(false);
    if (explicitReturnTo) {
      const path = explicitReturnTo.startsWith("/") ? explicitReturnTo : `/${explicitReturnTo}`;
      router.replace(path);
      return;
    }
    router.replace("/dashboard");
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (open) {
      setIsDialogOpen(true);
      return;
    }
    setIsDialogOpen(false);
    if (skipCloseRedirectRef.current) {
      skipCloseRedirectRef.current = false;
      return;
    }
    if (userHasCompanies) {
      router.replace("/company");
    }
  };

  // Show loading while checking companies
  if (checkingCompanies || authLoading) {
    return <CreateCompanyPageLoading />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <CreateCompanyDialog
        isOpen={isDialogOpen}
        onOpenChange={handleDialogOpenChange}
        onCompanyCreated={handleCompanyCreated}
        redirectTo={null}
        isDismissable={userHasCompanies}
      />
    </div>
  );
}

export default function CreateCompanyPage() {
  return (
    // Next.js requires Suspense boundary around useSearchParams() consumers for static prerender.
    <Suspense fallback={<CreateCompanyPageLoading />}>
      <CreateCompanyPageContent />
    </Suspense>
  );
}

    