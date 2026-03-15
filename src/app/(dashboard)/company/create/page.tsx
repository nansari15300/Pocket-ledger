
"use client";

import { CreateCompanyForm } from "@/components/company/CreateCompanyForm";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CreateCompanyDialog } from "@/components/company/CreateCompanyDialog";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

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
  const { setCompanyId, allCompanies } = useCompany();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [checkingCompanies, setCheckingCompanies] = useState(true);
  
  // Check if user has any companies (owned or shared)
  useEffect(() => {
    if (authLoading || !user || !user.email) {
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
      if (hasCompanies) {
        router.replace('/company');
      } else {
        setIsDialogOpen(true);
      }
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

    return () => {
      unsubOwned();
      unsubShared();
      clearTimeout(timeoutId);
    };
  }, [user, authLoading, router]);

  const returnPath = searchParams.get("returnTo") || "/company";

  const handleCompanyCreated = (companyId: string) => {
    setCompanyId(companyId);
    setIsDialogOpen(false);
    const base = returnPath === "/company" ? "/company" : returnPath;
    const url = base === "/company" ? `/company?new=${encodeURIComponent(companyId)}` : returnPath;
    router.replace(url);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    // If the user closes the dialog, redirect them to the company selection page.
    router.replace('/company');
  }

  // Show loading while checking companies
  if (checkingCompanies || authLoading) {
    return <CreateCompanyPageLoading />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      {/* 
        This dialog will only auto-open if user has NO companies (owned or shared).
        If user manually navigates here but has companies, they will be redirected to /company.
        Manual clicks from CompanySelector will also work via the button.
      */}
      <CreateCompanyDialog
        isOpen={isDialogOpen}
        onOpenChange={handleDialogClose}
        onCompanyCreated={handleCompanyCreated}
        redirectTo={returnPath === "/company" ? undefined : returnPath}
        isDismissable={false} // Prevent closing by clicking outside when auto-opened
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

    