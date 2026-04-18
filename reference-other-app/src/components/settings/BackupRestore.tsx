
"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, Loader2, FileWarning, KeyRound, ShieldCheck, ShieldOff, Eye, EyeOff } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { collection, getDocs, query, writeBatch, doc, Timestamp, setDoc, serverTimestamp, addDoc, getDoc, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import usePermissions from "@/hooks/usePermissions";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Label } from "../ui/label";
import { PermissionButton } from "@/components/permission";
import { assertCan, PermissionDeniedError } from "@/lib/permissions/enforcePermission";
import { decryptData, encryptData } from "@/lib/encryption";
import Link from "next/link";
import { getGoogleDriveAuthUrl } from "@/lib/drive-actions";
import { createCompanyFromBackup } from "@/lib/actions";
import { ToastAction } from "../ui/toast";


const collectionsToBackup = [
  "parties", "groups", "bank_accounts", "account_groups",
  "staff", "staff_groups", "items", "item_groups",
  "taxes", "tax_groups", "expense_accounts", "expense_groups", "vouchers",
];

export function BackupRestore() {
  const resolveUidFromUserRef = async (userRefId?: string, email?: string) => {
    if (userRefId) {
      const ownerSnap = await getDoc(doc(firestore, "users", userRefId));
      if (ownerSnap.exists()) {
        const data: any = ownerSnap.data();
        return data?.uid || ownerSnap.id || userRefId;
      }
    }
    if (email) {
      const ownerQ = query(collection(firestore, "users"), where("email", "==", email));
      const ownerSnap = await getDocs(ownerQ);
      if (!ownerSnap.empty) {
        const data: any = ownerSnap.docs[0].data();
        return data?.uid || ownerSnap.docs[0].id;
      }
    }
    return userRefId || null;
  };

  const sendSecurityAlertClient = async (params: {
    backupOwnerId?: string;
    backupOwnerEmail?: string;
    backupSharedWith?: any[];
    attemptedByUid: string;
    attemptedByEmail: string;
    attemptedByName?: string;
    companyName: string;
    companyId: string;
  }) => {
    const {
      backupOwnerId,
      backupOwnerEmail,
      backupSharedWith,
      attemptedByUid,
      attemptedByEmail,
      attemptedByName,
      companyName,
      companyId,
    } = params;

    // Only company admin (owner) receives security alerts; not shared users.
    const recipientUserIds = new Set<string>();
    const ownerUid = await resolveUidFromUserRef(backupOwnerId, backupOwnerEmail);
    if (ownerUid) recipientUserIds.add(ownerUid);

    if (recipientUserIds.size === 0 && companyId) {
      const liveCompanySnap = await getDoc(doc(firestore, "companies", companyId));
      if (liveCompanySnap.exists()) {
        const liveCompany = liveCompanySnap.data() as any;
        const fallbackOwnerUid = await resolveUidFromUserRef(liveCompany?.ownerId, liveCompany?.ownerEmail);
        if (fallbackOwnerUid) recipientUserIds.add(fallbackOwnerUid);
      }
    }
    if (recipientUserIds.size === 0) return false;

    const liveAlertMessage = `Security Alert: User "${attemptedByEmail}" tried to restore your company "${companyName}". Attempt was blocked automatically.`;
    await Promise.all(Array.from(recipientUserIds).map((recipientUserId) =>
      addDoc(collection(firestore, "admin_notifications"), {
        recipientUserId,
        message: liveAlertMessage,
        timestamp: serverTimestamp(),
        isRead: false,
        type: "security_alert",
        companyId,
        attemptedBy: {
          uid: attemptedByUid,
          email: attemptedByEmail,
          ...(attemptedByName ? { name: attemptedByName } : {}),
        },
      })
    ));
    return true;
  };

  const { company, companyId, setCompanyId } = useCompany();
  const { user, customUser } = useAuth();
  const { toast } = useToast();
  const { can } = usePermissions();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [fileToRestore, setFileToRestore] = useState<File | null>(null);
  const [isOverwriteConfirmOpen, setIsOverwriteConfirmOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [isEncryptedBackupConfirmOpen, setIsEncryptedBackupConfirmOpen] = useState(false);
  const [decryptionPassword, setDecryptionPassword] = useState('');
  const [showDecryptionPassword, setShowDecryptionPassword] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptionError, setDecryptionError] = useState<string | null>(null);
  const [backupDataToRestore, setBackupDataToRestore] = useState<any>(null);


  const handleBackupClick = () => {
    if (company?.password) {
      setIsEncryptedBackupConfirmOpen(true);
    } else {
      toast({
        variant: "destructive",
        title: "Password Required to Create Backup",
        description: "To create a backup, you must first set a password for this company in the settings.",
        action: (
          <ToastAction asChild altText="Go to Settings">
            <Link href="/settings?view=company">
                Go to Settings
            </Link>
          </ToastAction>
        ),
      });
    }
  };

  const handleBackup = async () => {
    if (!companyId || !company || !company.password) return;
    
    try {
      // Permission check: export
      assertCan(can, "export_data");
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
      setIsEncryptedBackupConfirmOpen(false);
      return;
    }
    
    setIsEncryptedBackupConfirmOpen(false);
    setIsBackingUp(true);

    try {
      const backupData: Record<string, any[]> = {
        companyDetails: [{ ...company, id: companyId }],
      };

      for (const colName of collectionsToBackup) {
        try {
          const q = query(collection(firestore, `companies/${companyId}/${colName}`));
          const snap = await getDocs(q);
          backupData[colName] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (colError: any) {
          const msg = colError?.message || String(colError);
          const isPermission = msg.includes("permission") || colError?.code === "permission-denied";
          console.error("Backup getDocs failed for collection:", colName, colError);
          toast({
            variant: "destructive",
            title: isPermission ? "Permission Denied" : "Backup Failed",
            description: isPermission ? `Cannot read "${colName}". Check company access.` : `Failed to read "${colName}": ${msg}`,
          });
          return;
        }
      }

      let jsonData: string;
      try {
        jsonData = JSON.stringify(backupData);
      } catch (stringifyError: any) {
        console.error("Backup JSON.stringify failed:", stringifyError);
        toast({
          variant: "destructive",
          title: "Backup Failed",
          description: "Data too large or invalid to prepare for backup.",
        });
        return;
      }

      let finalDataString: string;
      try {
        finalDataString = await encryptData(jsonData, company.password!);
      } catch (encError: any) {
        console.error("Backup encryption failed:", encError);
        const msg = encError?.message || String(encError);
        toast({
          variant: "destructive",
          title: "Backup Failed",
          description: msg.includes("encrypt") ? msg : `Encryption failed: ${msg}`,
        });
        return;
      }

      const blob = new Blob([finalDataString], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileExtension = 'plbp';
      a.download = `pocket-ledger_backup_${company.name.replace(/\s+/g, '_')}_${timestamp}.${fileExtension}`;

      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Success", description: "Backup downloaded successfully." });
    } catch (error) {
      console.error(error);
      if (error instanceof PermissionDeniedError) {
        toast({ variant: "destructive", title: "Permission Denied", description: error.message });
      } else {
        toast({ variant: "destructive", title: "Backup Failed", description: (error as any)?.message || "Unexpected backup error." });
      }
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
        setFileToRestore(file);
        setDecryptionPassword('');
      setShowDecryptionPassword(false);
        setDecryptionError(null);
        setBackupDataToRestore(null); // Clear previous data
        setIsOverwriteConfirmOpen(false);
        setConfirmationText('');
        setIsDecrypting(false);
    }
    else toast({ variant: "destructive", title: "Please select a valid file." });
  };

  const processRestoreData = async () => {
    if (!fileToRestore) throw new Error("No file selected for restore.");

    let fileContent = await fileToRestore.text();
    
    // Potentially an encrypted file
    const isPotentiallyEncrypted =
      fileToRestore.name.endsWith('.plbp') ||
      fileToRestore.name.endsWith('.webtally') ||
      !fileContent.trim().startsWith('{');

    if (isPotentiallyEncrypted) {
       setIsDecrypting(true);
       return null; // Prompt for password
    }
    
    try {
        const backupData = JSON.parse(fileContent);
        
        // Security check for surrendered companies from unencrypted backup
        if (backupData?.companyDetails?.[0]?.handoverStatus === 'accepted') {
            const receiver = backupData.companyDetails[0].handoverTo;
            throw new Error(`This company was surrendered to ${receiver}. You can no longer restore it.`);
        }
        
        return backupData;
    } catch (e) {
       setDecryptionError("This file seems to be encrypted or is corrupted. Please provide a password if it's encrypted.");
       setIsDecrypting(true);
       return null;
    }
  };

  const startRestore = async () => {
      if (!company) {
          toast({ variant: 'destructive', title: 'No Company Selected', description: "Please select or create a company to restore data into."});
          return;
      }
      
      try {
        // Permission check: import
        assertCan(can, "import_data");
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
      
      try {
        const data = await processRestoreData();
        if (data) { 
           if (!company.isOwned) {
                toast({variant: 'destructive', title: "Permission Denied", description: "Only the company owner can overwrite data."});
                return;
            }
            setBackupDataToRestore(data);
            setIsOverwriteConfirmOpen(true);
        }
      } catch (error: any) {
        if (error instanceof PermissionDeniedError) {
          toast({ variant: "destructive", title: "Permission Denied", description: error.message });
        } else {
          toast({ variant: "destructive", title: "Restore Failed", description: error.message });
        }
      }
  }
  
  const handleDecryptionAndRestore = async () => {
      if (!fileToRestore || !company) return;
      setIsRestoring(true);
      setDecryptionError(null);
      
      try {
          const encryptedContent = await fileToRestore.text();
          const decryptedJson = await decryptData(encryptedContent, decryptionPassword);
          const backupData = JSON.parse(decryptedJson);
          
          if (backupData?.companyDetails?.[0]?.handoverStatus === 'accepted') {
              const receiver = backupData.companyDetails[0].handoverTo;
              toast({ 
                  variant: "destructive", 
                  title: "Restore Blocked", 
                  description: `This company was surrendered to ${receiver}. You can no longer restore it.` 
              });
              setFileToRestore(null);
              setIsDecrypting(false);
              return;
          }
          
          toast({ title: "Decryption Successful" });
          setIsDecrypting(false); 

          if (!company.isOwned) {
            toast({variant: 'destructive', title: "Permission Denied", description: "Only the company owner can overwrite data."});
            return;
          }
          setBackupDataToRestore(backupData);
          setIsOverwriteConfirmOpen(true);
          
          setFileToRestore(null);
          setDecryptionPassword('');

      } catch (error: any) {
           if (error instanceof Error && error.message === "INVALID_PASSWORD") {
            setDecryptionError("Incorrect password. Please try again.");
          } else {
            setDecryptionError("Decryption failed. The file may be corrupted or not a valid backup.");
          }
      } finally {
        setIsRestoring(false);
      }
  }

  const handleOverwriteRestore = async (backupData: any) => {
    if (!companyId || !user?.email || !backupData) return;

    const backupCompanyDetails = backupData?.companyDetails?.[0];
    if (!backupCompanyDetails) {
        toast({ variant: "destructive", title: "Invalid Backup", description: "Backup file is missing company details." });
        return;
    }

    const backupCompanyId = backupCompanyDetails.id;
    const backupOwnerId = backupCompanyDetails.ownerId;
    const backupOwnerEmail = backupCompanyDetails.ownerEmail;

    const currentEmail = (user.email || "").toLowerCase().trim();
    const backupEmail = (backupOwnerEmail || "").toLowerCase().trim();
    const isBackupOwner =
      (!!user.uid && !!backupOwnerId && user.uid === backupOwnerId) ||
      (!!currentEmail && !!backupEmail && currentEmail === backupEmail);

    if (!isBackupOwner) {
        toast({
            variant: "destructive",
            title: "Restore Blocked",
            description: backupOwnerEmail
              ? `This backup belongs to ${backupOwnerEmail}. Illegal restore attempt recorded.`
              : "This backup belongs to another owner. Illegal restore attempt recorded.",
            duration: 8000,
        });

        try {
          const notified = await sendSecurityAlertClient({
            backupOwnerId,
            backupOwnerEmail,
            backupSharedWith: backupCompanyDetails?.sharedWith || [],
            attemptedByUid: user.uid,
            attemptedByEmail: user.email ?? "",
            attemptedByName: (customUser?.displayName || user?.displayName) ?? undefined,
            companyName: backupCompanyDetails.name,
            companyId: backupCompanyId,
          });
          if (!notified) {
            toast({
              variant: "destructive",
              title: "Owner Notification Failed",
              description: "Attempt was blocked, but we could not resolve the original company admin to notify.",
              duration: 7000,
            });
          }
        } catch (e) {
          console.error("Failed to send restore security alert:", e);
          toast({
            variant: "destructive",
            title: "Owner Notification Failed",
            description: "Attempt was blocked, but sending warning notification failed.",
            duration: 7000,
          });
        }

        setIsOverwriteConfirmOpen(false);
        setFileToRestore(null);
        return;
    }
    
    const userDocRef = doc(firestore, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const surrenderedCompanies = userData.surrenderedCompanies || {};
        const surrenderedInfo = surrenderedCompanies[backupCompanyId];

        if (surrenderedInfo) {
            const formattedDate = new Date(surrenderedInfo.date.seconds * 1000).toLocaleDateString();
            toast({
                variant: "destructive",
                title: "Restore Blocked",
                description: `You surrendered this company to "${surrenderedInfo.surrenderedTo}" on ${formattedDate}. You cannot restore it.`,
                duration: 10000,
            });
            setIsOverwriteConfirmOpen(false);
            setFileToRestore(null);
            return;
        }
    }

    const liveCompanyRef = doc(firestore, "companies", companyId);
    const liveCompanySnap = await getDoc(liveCompanyRef);
    if (liveCompanySnap.exists()) {
        const liveData = liveCompanySnap.data();
        if (liveData.ownerId !== backupOwnerId) {
             toast({
                variant: "destructive",
                title: "Restore Blocked",
                description: `This company's ownership has changed. You cannot overwrite it.`,
                duration: 10000,
            });
            setIsOverwriteConfirmOpen(false);
            setFileToRestore(null);
            return;
        }
    }

    setIsRestoring(true);
    setIsOverwriteConfirmOpen(false);
    toast({ title: "Restore Initiated", description: "This may take a moment..." });

    try {
        let batch = writeBatch(firestore);
        const safeTimestamp = (val: any): Timestamp | null => {
            if (!val) return null;
            if (val.seconds !== undefined && val.nanoseconds !== undefined) {
                return new Timestamp(val.seconds, val.nanoseconds);
            }
            const date = new Date(val);
            return isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
        };
        
        let count = 0;
        for (const colName of collectionsToBackup) {
            const q = query(collection(firestore, `companies/${companyId}/${colName}`));
            const snapshot = await getDocs(q);
            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
                count++;
                if(count >= 450) {
                    batch.commit();
                    batch = writeBatch(firestore);
                    count = 0;
                }
            });

            const docsToRestore = backupData[colName] || [];
            for (const docData of docsToRestore) {
                const { id: originalId, ...data } = docData;
                const finalData = {
                    ...data,
                    companyId: companyId,
                    isDeleted: data.isDeleted ?? false,
                    date: safeTimestamp(data.date),
                    openingBalanceDate: safeTimestamp(data.openingBalanceDate),
                    createdAt: safeTimestamp(data.createdAt) || serverTimestamp(),
                    amount: (data.amount === "" || data.amount === null || data.amount === undefined) ? (data.total || 0) : Number(data.amount),
                };

                const docRef = doc(firestore, `companies/${companyId}/${colName}`, originalId);
                batch.set(docRef, finalData);
                
                count++;
                if (count >= 450) { 
                    await batch.commit();
                    batch = writeBatch(firestore);
                    count = 0;
                }
            }
        }

        if (backupData.companyDetails?.[0]) {
            const { id, ownerId, ownerEmail, ...details } = backupData.companyDetails[0];
            batch.update(doc(firestore, "companies", companyId), details);
        }

        await batch.commit();
        
        toast({ title: "Restore Successful", description: "Data overwritten successfully. Page will now reload." });
        window.location.reload();
    } catch (error: any) {
      console.error("Restore failed:", error);
      toast({ variant: "destructive", title: "Restore Failed", description: error.message || "An error occurred during the overwrite process." });
    } finally {
      setIsRestoring(false);
      setFileToRestore(null);
    }
  };


  return (
    <>
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Backup Data</CardTitle>
            <CardDescription>
              Download a complete backup of your company&apos;s data. You can choose to encrypt it for security.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <PermissionButton
              permission="export_data"
              onClick={handleBackupClick}
              disabled={isBackingUp}
            >
              {isBackingUp ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Create Backup
            </PermissionButton>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Restore Data</CardTitle>
            <CardDescription>
              Restore company data from a JSON or encrypted .plbp file. Legacy .webtally files are also supported.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <Input type="file" accept=".json,.plbp,.webtally" onChange={handleFileSelect} />
          </CardContent>
          <CardFooter>
            <PermissionButton
              permission="import_data"
              onClick={startRestore}
              disabled={!fileToRestore || isRestoring}
            >
              {isRestoring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Restore & Overwrite
            </PermissionButton>
          </CardFooter>
        </Card>
      </div>

       <AlertDialog open={isEncryptedBackupConfirmOpen} onOpenChange={setIsEncryptedBackupConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Encrypted Backup</AlertDialogTitle>
            <AlertDialogDescription>
               This backup will be encrypted with your company password. This password will be required to restore the data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleBackup}>
                  Proceed
                </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
       <Dialog open={isDecrypting} onOpenChange={(open) => {
           if (!open) {
               setIsDecrypting(false);
               setFileToRestore(null);
               setDecryptionPassword('');
               setDecryptionError(null);
           }
       }}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Decryption Required</DialogTitle>
                 <Label>This backup file is encrypted. Please enter the password to restore.</Label>
            </DialogHeader>
            <div className="space-y-2">
              <Input 
                  type={showDecryptionPassword ? "text" : "password"}
                  value={decryptionPassword}
                  onChange={(e) => {
                      setDecryptionPassword(e.target.value)
                      setDecryptionError(null);
                  }}
                  placeholder="Enter password..."
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="px-0 h-auto text-xs"
                onClick={() => setShowDecryptionPassword((prev) => !prev)}
              >
                {showDecryptionPassword ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                {showDecryptionPassword ? "Hide password" : "Show password"}
              </Button>
              {decryptionError && <p className="text-sm text-destructive">{decryptionError}</p>}
               {decryptionError && fileToRestore?.name.endsWith('.json') && (
                <p className="text-sm text-amber-600">This file seems to be encrypted or is corrupted. Please provide a password if it's encrypted.</p>
              )}
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => {setIsDecrypting(false); setFileToRestore(null); }}>Cancel</Button>
                <Button onClick={handleDecryptionAndRestore} disabled={!decryptionPassword || isRestoring}>
                    {isRestoring && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    Decrypt & Restore
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>


      <AlertDialog open={isOverwriteConfirmOpen} onOpenChange={setIsOverwriteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
                <FileWarning className="h-6 w-6 text-destructive" /> Are you absolutely sure?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently overwrite all current data in the company <strong>{company?.name}</strong>. All existing vouchers, parties, items, and settings will be deleted and replaced with the content from your backup file.
              To confirm, type <code className="bg-muted px-2 py-1 rounded-md font-mono">{company?.name.trim().toLowerCase()}</code> in the box below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input 
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            placeholder="Type company name to confirm"
          />
          <AlertDialogFooter>
            <div className="flex justify-between items-center w-full">
                <AlertDialogCancel onClick={() => setBackupDataToRestore(null)}>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                onClick={() => handleOverwriteRestore(backupDataToRestore)} 
                disabled={isRestoring || confirmationText.trim().toLowerCase() !== company?.name.trim().toLowerCase()}
                className="bg-destructive hover:bg-destructive/90"
                >
                {isRestoring && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Yes, Overwrite Everything
                </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
