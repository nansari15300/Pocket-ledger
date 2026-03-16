
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Building2, PlusCircle, Share2, ChevronDown, KeyRound, Eye, EyeOff, Loader2, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateCompanyDialog } from "./CreateCompanyDialog";
import { DeleteCompanyDialog } from "./DeleteCompanyDialog";
import { ShareCompanyDialog } from "./ShareCompanyDialog";
import { useState, useEffect, useMemo } from "react";
import { useCompany } from "@/hooks/useCompany";
import type { Company as CompanyData } from "@/hooks/useCompany";
import { useSidebar } from "../ui/sidebar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "../ui/input";
import { toast } from "@/hooks/use-toast";
import { collection, onSnapshot, query, where, doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

const GoogleDriveIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 512 512">
      <path d="M339 339l-22.5-39h-73l-22.5 39H339zm-10.5-52.5l-40.5-70.5h-45l-40.5 70.5h126z" fill="#26a65b"/>
      <path d="M139.5 286.5l-40.5-70.5-22.5 39-22.5 39 63 111 63-111-22.5-39z" fill="#fcc10a"/>
      <path d="M372.5 216l-63 111 63-111-63-111h126l-63 111z" fill="#1e88e5"/>
  </svg>
);


export function CompanySelector({ companies: initialCompanies }: { companies: CompanyData[] }) {
  const router = useRouter();
  const { user } = useAuth();
  const { setCompanyId } = useCompany();
  const [dialogState, setDialogState] = useState<{ type: 'share' | 'delete' | 'create' | null, company: CompanyData | null }>({ type: null, company: null });
  const [companies, setCompanies] = useState<CompanyData[]>(initialCompanies);
  const [loading, setLoading] = useState(true);

  // States for password dialog
  const [companyToUnlock, setCompanyToUnlock] = useState<CompanyData | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
    useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const ownedQuery = query(collection(firestore, "companies"), where("ownerId", "==", user.uid));
    const sharedQuery = query(collection(firestore, "companies"), where("sharedWithEmails", "array-contains", user.email));

    const unsubOwned = onSnapshot(ownedQuery, (snap) => {
      const owned = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), isOwned: true } as CompanyData)).filter(c => !c.isDeleted);
      setCompanies(prev => [...owned, ...prev.filter(p => !p.isOwned)]);
    });

    const unsubShared = onSnapshot(sharedQuery, (snap) => {
      const shared = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), isOwned: false } as CompanyData)).filter(c => !c.isDeleted);
       setCompanies(prev => [...shared, ...prev.filter(p => p.isOwned)]);
    });
    
     // Initial load state
    Promise.all([
      new Promise(res => { const u = onSnapshot(ownedQuery, () => { res(true); u(); }); }),
      new Promise(res => { const u = onSnapshot(sharedQuery, () => { res(true); u(); }); })
    ]).then(() => setLoading(false));

    return () => {
      unsubOwned();
      unsubShared();
    };

  }, [user]);


  const handleSelectCompany = (company: CompanyData) => {
    // Determine the required password
    const userShareInfo = company.sharedWith?.find(u => u.email === user?.email);
    const requiredPassword = userShareInfo?.password || company.password;

    if (requiredPassword) {
        setCompanyToUnlock(company);
    } else {
        setCompanyId(company.id);
        router.push("/dashboard");
    }
  };

  const handlePasswordSubmit = () => {
    if (!companyToUnlock) return;
    setIsVerifying(true);
    
    const userShareInfo = companyToUnlock.sharedWith?.find(u => u.email === user?.email);
    const correctPassword = userShareInfo?.password || companyToUnlock.password;

    if (passwordInput === correctPassword) {
        toast({ title: "Access Granted", description: `Welcome to ${companyToUnlock.name}.`});
        setCompanyId(companyToUnlock.id);
        router.push("/dashboard");
    } else {
        toast({ variant: 'destructive', title: "Incorrect Password", description: "Please try again."});
        setIsVerifying(false);
        setPasswordInput("");
    }
  };

  const allCompanies = useMemo(() => {
    const companyMap = new Map<string, CompanyData>();
    const isOwnedByUser = (c: CompanyData) =>
      c.ownerId === user?.uid ||
      (!!c.ownerEmail && !!user?.email && c.ownerEmail.toLowerCase().trim() === user.email!.toLowerCase().trim());
    companies.forEach(c => {
        if (c.isDeleted) return;
        if (!companyMap.has(c.id)) {
            companyMap.set(c.id, { ...c, isOwned: isOwnedByUser(c) });
        }
    });
    return Array.from(companyMap.values());
  }, [companies, user]);

  const ownedCompanies = allCompanies.filter(c => c.isOwned);
  const sharedCompanies = allCompanies.filter(c => !c.isOwned);

  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const sharedOwnerIdsKey = useMemo(
    () => [...new Set(sharedCompanies.map((c) => c.ownerId).filter(Boolean))].sort().join(","),
    [sharedCompanies]
  );
  useEffect(() => {
    if (!sharedOwnerIdsKey) return;
    const ownerIds = sharedOwnerIdsKey.split(",").filter(Boolean);
    let cancelled = false;
    const map: Record<string, string> = {};
    Promise.all(
      ownerIds.map(async (ownerId) => {
        try {
          const snap = await getDoc(doc(firestore, "users", ownerId));
          if (cancelled) return;
          const name = snap.exists() ? (snap.data()?.displayName || snap.data()?.email || "") : "";
          if (name) map[ownerId] = name;
        } catch {
          // ignore
        }
      })
    ).then(() => {
      if (!cancelled) setOwnerNames((prev) => ({ ...prev, ...map }));
    });
    return () => { cancelled = true; };
  }, [sharedOwnerIdsKey]);

  const CompanyItem = ({ company }: { company: CompanyData }) => (
    <li key={company.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
      <button
        className="flex-1 flex items-center gap-4 text-left"
        onClick={() => handleSelectCompany(company)}
      >
        <Building2 className="h-6 w-6 text-muted-foreground" />
        <span className="text-lg font-medium">{company.name}</span>
        
      </button>
      {company.isOwned && (
         <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    <ChevronDown className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setDialogState({ type: 'share', company })}>
                      <Share2 className="mr-2 h-4 w-4"/>
                      Share
                  </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
        </DropdownMenu>
      )}
    </li>
  );

  return (
    <>
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="font-headline text-2xl">Select a Company</CardTitle>
            <CardDescription>
              Choose which company you want to work on.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {ownedCompanies.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">Your Companies</h3>
                <ul className="space-y-3">
                  {ownedCompanies.map((company) => (
                    <CompanyItem key={company.id} company={company} />
                  ))}
                </ul>
              </div>
            )}
             {sharedCompanies.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">Shared With You</h3>
                 <ul className="space-y-3">
                  {sharedCompanies.map((company) => (
                    <CompanyItem key={company.id} company={company} />
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-center">
             <Button variant="outline" onClick={() => setDialogState({ type: 'create', company: null })}>
                <PlusCircle className="mr-2 h-4 w-4"/>Create New Company
             </Button>
          </CardFooter>
        </Card>
      </div>
      
      <CreateCompanyDialog
          onCompanyCreated={(id) => {
            setCompanyId(id);
            setDialogState({ type: null, company: null });
            router.push('/dashboard');
          }}
          isOpen={dialogState.type === 'create'}
          onOpenChange={(open) => !open && setDialogState({ type: null, company: null })}
        />

      {dialogState.company && (
        <>
            <ShareCompanyDialog 
                company={dialogState.company}
                isOpen={dialogState.type === 'share'}
                onOpenChange={(open) => !open && setDialogState({ type: null, company: null })}
            >
                <div/>
            </ShareCompanyDialog>
            <DeleteCompanyDialog
                company={dialogState.company}
                onCompanyDeleted={() => {
                    setDialogState({ type: null, company: null });
                }}
                isOpen={dialogState.type === 'delete'}
                onOpenChange={(open) => !open && setDialogState({ type: null, company: null })}
            />
        </>
      )}

      {/* Password Dialog */}
      <AlertDialog open={!!companyToUnlock} onOpenChange={(open) => !open && setCompanyToUnlock(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Password Required</AlertDialogTitle>
            <AlertDialogDescription>
              The company "{companyToUnlock?.name}" is password protected. Please enter the password to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Enter password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
            />
            <Button
                type="button" variant="ghost" size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowPassword(!showPassword)}
            >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isVerifying} onClick={() => setCompanyToUnlock(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePasswordSubmit} disabled={isVerifying}>
              {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Unlock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function CompanyActions({ companies, onCompanyCreated }: { companies: CompanyData[], onCompanyCreated: () => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const { companyId, setCompanyId } = useCompany();
  const { isOpen } = useSidebar();
  const [dialogState, setDialogState] = useState<{ type: 'share' | 'delete' | 'create' | null, company: CompanyData | null }>({ type: null, company: null });
  const [companyToUnlock, setCompanyToUnlock] = useState<CompanyData | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const activeCompany = companies.find(c => c.id === companyId) || companies[0];
  
  useEffect(() => {
    // Keep persisted selection stable; only auto-pick first when nothing is saved at all.
    if (!companyId && companies.length > 0 && !localStorage.getItem("companyId")) {
      setCompanyId(companies[0].id);
    }
  }, [companyId, companies, setCompanyId]);

  const handleSelectCompany = (selectedCompany: CompanyData) => {
    const userShareInfo = selectedCompany.sharedWith?.find(u => u.email === user?.email);
    const requiredPassword = userShareInfo?.password || selectedCompany.password;

    if (requiredPassword) {
        setCompanyToUnlock(selectedCompany);
    } else {
        setCompanyId(selectedCompany.id);
        // We don't need to redirect, the context update will cause a re-render.
        // router.push(window.location.pathname);
    }
  };
  
  const handlePasswordSubmit = () => {
    if (!companyToUnlock) return;
    setIsVerifying(true);
    
    const userShareInfo = companyToUnlock.sharedWith?.find(u => u.email === user?.email);
    const correctPassword = userShareInfo?.password || companyToUnlock.password;

    if (passwordInput === correctPassword) {
        toast({ title: "Access Granted", description: `Switched to ${companyToUnlock.name}.`});
        setCompanyId(companyToUnlock.id);
        // We don't need to redirect.
        // router.push(window.location.pathname);
        setCompanyToUnlock(null);
        setPasswordInput("");
    } else {
        toast({ variant: 'destructive', title: "Incorrect Password", description: "Please try again."});
        setPasswordInput("");
    }
    setIsVerifying(false);
  };
  
  const ownedCompanies = companies.filter(c => c.isOwned);
  const sharedCompanies = companies.filter(c => !c.isOwned);

  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const sharedOwnerIdsKey = useMemo(
    () => [...new Set(sharedCompanies.map((c) => c.ownerId).filter(Boolean))].sort().join(","),
    [sharedCompanies]
  );
  useEffect(() => {
    if (!sharedOwnerIdsKey) return;
    const ownerIds = sharedOwnerIdsKey.split(",").filter(Boolean);
    let cancelled = false;
    const map: Record<string, string> = {};
    Promise.all(
      ownerIds.map(async (ownerId) => {
        try {
          const snap = await getDoc(doc(firestore, "users", ownerId));
          if (cancelled) return;
          const name = snap.exists() ? (snap.data()?.displayName || snap.data()?.email || "") : "";
          if (name) map[ownerId] = name;
        } catch {
          // ignore
        }
      })
    ).then(() => {
      if (!cancelled) setOwnerNames((prev) => ({ ...prev, ...map }));
    });
    return () => { cancelled = true; };
  }, [sharedOwnerIdsKey]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className={cn("w-full justify-between h-9", !isOpen && "justify-center aspect-square p-0")} data-theme-header="company-selector">
            <div className="flex items-center gap-2 truncate">
              <Building2 />
              {isOpen && <span className="truncate">{activeCompany ? activeCompany.name : "No Company"}</span>}
              
            </div>
            {isOpen && <ChevronDown className="ml-2 h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
        <DropdownMenuContent className="w-56">
          {ownedCompanies.length > 0 && (
              <DropdownMenuGroup>
                  <DropdownMenuLabel>My Companies</DropdownMenuLabel>
                  {ownedCompanies.map((company) => (
                      <DropdownMenuItem key={company.id} onSelect={() => handleSelectCompany(company)}>
                      <Building2 className="mr-2 h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">{company.name}</span>
                      {company.id === companyId && <Check className="ml-2 h-4 w-4 shrink-0 text-green-600" />}
                      </DropdownMenuItem>
                  ))}
              </DropdownMenuGroup>
          )}
          {sharedCompanies.length > 0 && (
              <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                      <DropdownMenuLabel>Shared With Me</DropdownMenuLabel>
                      {sharedCompanies.map((company) => (
                          <DropdownMenuItem key={company.id} onSelect={() => handleSelectCompany(company)} className="flex flex-col items-stretch py-2 group">
                          <div className="flex items-center gap-2 w-full">
                            <Building2 className="h-4 w-4 shrink-0" />
                            <span className="flex-1 truncate font-medium">{company.name}</span>
                            {company.id === companyId && <Check className="h-4 w-4 shrink-0 text-green-600" />}
                          </div>
                          {(company.ownerEmail || ownerNames[company.ownerId]) && (
                            <div className="text-xs text-muted-foreground truncate mt-0.5 pl-6 group-data-[highlighted]:text-white">
                              Shared by: {ownerNames[company.ownerId] ? `${ownerNames[company.ownerId]} (${company.ownerEmail || ""})` : (company.ownerEmail || "")}
                            </div>
                          )}
                          </DropdownMenuItem>
                      ))}
                  </DropdownMenuGroup>
              </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
             <DropdownMenuItem onSelect={() => setDialogState({ type: 'create', company: null })}>
                <PlusCircle className="mr-2 h-4 w-4" />
                <span>Add Company</span>
             </DropdownMenuItem>
              {activeCompany && activeCompany.isOwned && (
                <DropdownMenuItem onSelect={() => setDialogState({ type: 'share', company: activeCompany })}>
                  <Share2 className="mr-2 h-4 w-4" />
                  <span>Share</span>
                </DropdownMenuItem>
              )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>

      <CreateCompanyDialog
          onCompanyCreated={(id) => {
            setCompanyId(id);
            setDialogState({ type: null, company: null });
            router.push('/dashboard');
          }}
          isOpen={dialogState.type === 'create'}
          onOpenChange={(open) => !open && setDialogState({ type: null, company: null })}
      />

      {dialogState.company && (
        <>
            <ShareCompanyDialog 
                company={dialogState.company}
                isOpen={dialogState.type === 'share'}
                onOpenChange={(open) => !open && setDialogState({ type: null, company: null })}
            >
                <div/>
            </ShareCompanyDialog>
            <DeleteCompanyDialog
                company={dialogState.company}
                onCompanyDeleted={onCompanyCreated}
                isOpen={dialogState.type === 'delete'}
                onOpenChange={(open) => !open && setDialogState({ type: null, company: null })}
            />
        </>
      )}

      {/* Password Dialog for Switching */}
      <AlertDialog open={!!companyToUnlock} onOpenChange={(open) => !open && setCompanyToUnlock(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Password Required</AlertDialogTitle>
            <AlertDialogDescription>
              The company "{companyToUnlock?.name}" is password protected. Please enter the password to switch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Enter password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
            />
            <Button
                type="button" variant="ghost" size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowPassword(!showPassword)}
            >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isVerifying} onClick={() => setCompanyToUnlock(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePasswordSubmit} disabled={isVerifying}>
              {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
