
"use client";

import { useEffect, useState, useMemo } from "react";
import { doc, onSnapshot, updateDoc, arrayRemove, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Crown, Loader2, PlusCircle, Trash2, Save, Undo2, KeyRound, Eye, EyeOff, Edit, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "../ui/skeleton";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "../ui/input";
import { ShareCompanyDialog } from "../company/ShareCompanyDialog";
import { Checkbox } from "../ui/checkbox";
import { Switch } from "../ui/switch";
import { Permission, PermissionGroups } from "@/lib/permissions";
import usePermissions, { type PermissionConfig, type UserRole, initialPermissionConfig } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { isCompanyNotFoundError, COMPANY_NOT_SYNCED_MESSAGE } from "@/lib/companyUpdateGuard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type SharedUser = {
  email: string;
  name: string;
  role: UserRole;
  password?: string;
  photoURL?: string;
};

const normalizeEmail = (email?: string) => (email || "").trim().toLowerCase();

const getAvatarUrl = (email: string, photoURL?: string) => {
  if (photoURL && photoURL.trim()) return photoURL;
  // fallback avatar (always works)
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(email)}`;
};

const getInitials = (nameOrEmail: string) => {
  const s = (nameOrEmail || "").trim();
  if (!s) return "U";
  const parts = s.includes("@") ? s.split("@")[0].split(/[.\s_-]+/) : s.split(/\s+/);
  return parts.slice(0, 2).map(p => p[0]?.toUpperCase()).join("") || "U";
}

const flattenedPermissions = PermissionGroups.flatMap(g => g.permissions.map(p => p.key));

export function ManageShare() {
  const { company: companyData, companyId } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const { can } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [userToRemove, setUserToRemove] = useState<SharedUser | null>(null);
  const [userToEdit, setUserToEdit] = useState<SharedUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  const [firestorePermissionConfig, setFirestorePermissionConfig] = useState<PermissionConfig>(initialPermissionConfig);
  const [editablePermissionConfig, setEditablePermissionConfig] = useState<PermissionConfig>(initialPermissionConfig);
  const [selectedRoleForPermissions, setSelectedRoleForPermissions] = useState<UserRole>('viewer');
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);

  const [allAppUsers, setAllAppUsers] = useState<any[]>([]);
  
  useEffect(() => {
    if (!user || !companyData) return;

    const emails = [
      companyData.ownerEmail,
      ...(companyData.sharedWith || []).map((u: any) => u.email),
    ].filter(Boolean).map((e: string) => normalizeEmail(e));
    
    const uniqueEmails = [...new Set(emails)];

    const chunk = (arr: string[], size: number) =>
      Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size)
      );

    const unsubs: Array<() => void> = [];

    chunk(uniqueEmails, 10).forEach((batchEmails) => {
      if (batchEmails.length === 0) return;
      const qy = query(
        collection(firestore, "users"),
        where("email", "in", batchEmails)
      );

      const unsub = onSnapshot(qy, (snap) => {
        setAllAppUsers((prev) => {
          const map = new Map(prev.map((x) => [x.id, x]));
          snap.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));
          return Array.from(map.values());
        });
      });

      unsubs.push(unsub);
    });

    return () => unsubs.forEach((u) => u());
  }, [user, companyData]);
  
  const hasUnsavedChanges = useMemo(() => {
      return JSON.stringify(firestorePermissionConfig) !== JSON.stringify(editablePermissionConfig);
  }, [firestorePermissionConfig, editablePermissionConfig]);

  useEffect(() => {
    const savedRole = localStorage.getItem("selectedRoleForPermissions") as UserRole | null;
    if (savedRole && Object.keys(initialPermissionConfig.roles).includes(savedRole)) {
        setSelectedRoleForPermissions(savedRole);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("selectedRoleForPermissions", selectedRoleForPermissions);
  }, [selectedRoleForPermissions]);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const companyRef = doc(firestore, "companies", companyId);

    const unsubscribe = onSnapshot(companyRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        let currentConfig = data.permissionConfig;

        if (!currentConfig || !currentConfig.roles || !currentConfig.dateLimits) {
            console.log("Permission schema mismatch or missing. Resetting to default.");
            currentConfig = initialPermissionConfig;
            // Check if company is pending sync before updating
            try {
                await updateDoc(companyRef, { permissionConfig: currentConfig });
              } catch (error: any) {
                const isNotFoundError = error?.code === "not-found" || error?.message?.includes("No document to update");
                if (isNotFoundError) {
                  console.warn("Cannot update permission config: company not synced yet");
                } else {
                  console.error("Error updating permission config:", error);
                }
              }
        }
        
        // Merge with defaults for file attachment settings
        const mergedConfig: PermissionConfig = {
          ...initialPermissionConfig,
          ...currentConfig,
          fileAttachmentLimits: {
            ...initialPermissionConfig.fileAttachmentLimits,
            ...(currentConfig.fileAttachmentLimits || {}),
          },
          allowAttachments: currentConfig.allowAttachments !== undefined ? currentConfig.allowAttachments : initialPermissionConfig.allowAttachments,
        };
        
        // Ensure owner role always has all permissions set to true
        if (mergedConfig.roles.owner) {
          mergedConfig.roles.owner = Array(flattenedPermissions.length).fill(true);
        }
        
        setFirestorePermissionConfig(mergedConfig);
        setEditablePermissionConfig(mergedConfig);

      } 
      setLoading(false);
    });

    return () => unsubscribe();
  }, [companyId]);
  
  const permissionsForSelectedRole = editablePermissionConfig.roles[selectedRoleForPermissions] || Array(flattenedPermissions.length).fill(false);
  const dateLimitsForSelectedRole = editablePermissionConfig.dateLimits?.[selectedRoleForPermissions] || { entryDays: 0, editDays: 0, deleteDays: 0 };
  const fileAttachmentLimitsForSelectedRole = editablePermissionConfig.fileAttachmentLimits?.[selectedRoleForPermissions] || { maxFileCount: 0, allowImage: false, allowPDF: false };
  const allowAttachmentsGlobal = editablePermissionConfig.allowAttachments !== false;

const handleDateLimitChange = (action: 'entry' | 'edit' | 'delete', value: number) => {
      if (selectedRoleForPermissions === 'owner') return;
      
      setEditablePermissionConfig(prevConfig => {
          const newConfig = JSON.parse(JSON.stringify(prevConfig));
          if (!newConfig.dateLimits[selectedRoleForPermissions]) {
              newConfig.dateLimits[selectedRoleForPermissions] = { entryDays: 0, editDays: 0, deleteDays: 0 };
          }
          newConfig.dateLimits[selectedRoleForPermissions][`${action}Days`] = value;
          return newConfig;
      });
  };
  
  const handlePermissionChange = (permissionKey: Permission, checked: boolean) => {
    if (selectedRoleForPermissions === 'owner') return;

    const permissionIndex = flattenedPermissions.indexOf(permissionKey);
    if (permissionIndex === -1) return;
    
    setEditablePermissionConfig(prevConfig => {
      const newConfig = JSON.parse(JSON.stringify(prevConfig));
      newConfig.roles[selectedRoleForPermissions][permissionIndex] = checked;
      return newConfig;
    });
  };

  const handleFileAttachmentLimitChange = (field: 'maxFileCount' | 'allowImage' | 'allowPDF', value: number | boolean) => {
    if (selectedRoleForPermissions === 'owner') return;
    
    setEditablePermissionConfig(prevConfig => {
      const newConfig = JSON.parse(JSON.stringify(prevConfig));
      if (!newConfig.fileAttachmentLimits) {
        newConfig.fileAttachmentLimits = {};
      }
      if (!newConfig.fileAttachmentLimits[selectedRoleForPermissions]) {
        newConfig.fileAttachmentLimits[selectedRoleForPermissions] = { maxFileCount: 0, allowImage: false, allowPDF: false };
      }
      newConfig.fileAttachmentLimits[selectedRoleForPermissions][field] = value;
      return newConfig;
    });
  };

  const handleAllowAttachmentsGlobalChange = (checked: boolean) => {
    setEditablePermissionConfig(prevConfig => {
      const newConfig = JSON.parse(JSON.stringify(prevConfig));
      newConfig.allowAttachments = checked;
      return newConfig;
    });
  };
  
  const handleSavePermissions = async () => {
    if (!companyId || !hasUnsavedChanges) return;
    
    // Permission check: manage users/roles (can is already available from component level)
    if (!can("manage_users_roles")) {
      toast({
        variant: "destructive",
        title: "Permission Denied",
        description: "You do not have permission to manage users and roles.",
      });
      return;
    }
    setIsSavingPermissions(true);
    try {
      // Ensure owner role always has all permissions set to true
      const configToSave = JSON.parse(JSON.stringify(editablePermissionConfig));
      if (configToSave.roles.owner) {
        configToSave.roles.owner = Array(flattenedPermissions.length).fill(true);
      }
      
      const companyRef = doc(firestore, "companies", companyId);
      await updateDoc(companyRef, { permissionConfig: configToSave });
      toast({ title: "Success", description: "Permissions have been saved." });
    } catch (error) {
      console.error("Error saving permissions:", error);
      toast({ variant: "destructive", title: "Error", description: isCompanyNotFoundError(error) ? COMPANY_NOT_SYNCED_MESSAGE : "Failed to save permission changes." });
    } finally {
        setIsSavingPermissions(false);
    }
  }

  const handleResetPermissions = () => {
    setEditablePermissionConfig(firestorePermissionConfig);
  }

  const handleRoleChange = async (email: string, newRole: SharedUser["role"]) => {
    if (!companyId) return;
    
    // Check if company is pending sync
    
    // Permission check: manage users/roles
    try {
      if (!can("manage_users_roles")) {
        toast({
          variant: "destructive",
          title: "Permission Denied",
          description: "You do not have permission to manage users and roles.",
        });
        return;
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to check permissions.",
      });
      return;
    }
    
    // Prevent selecting "owner" role for non-owners
    if (newRole === "owner") {
      toast({ 
        variant: "destructive", 
        title: "Invalid Role", 
        description: "Only the company owner can be Owner role." 
      });
      return;
    }
    
    setIsUpdating(email);
    try {
      const companyRef = doc(firestore, "companies", companyId);
      const companySnap = await getDoc(companyRef);
      if (!companySnap.exists()) {
        toast({ variant: "destructive", title: "Error", description: COMPANY_NOT_SYNCED_MESSAGE });
        return;
      }
      
      const currentData = companySnap.data();
      const currentSharedWith = currentData.sharedWith || [];

      // Ensure role is lowercase and valid
      const normalizedRole = newRole.toLowerCase() as UserRole;
      if (!["viewer", "data-entry", "accountant", "editor", "manager"].includes(normalizedRole)) {
        toast({ 
          variant: "destructive", 
          title: "Invalid Role", 
          description: "Invalid role selected." 
        });
        return;
      }

      const updatedSharedWith = currentSharedWith.map((u: SharedUser) => 
        u.email === email ? { ...u, role: normalizedRole } : u
      );

      await updateDoc(companyRef, { sharedWith: updatedSharedWith });
      
      toast({ title: "Success", description: `Role for ${email} has been updated to ${normalizedRole}.` });
    } catch (error: any) {
      console.error("Error updating role:", error);
      const isNotFoundError = error?.code === "not-found" || error?.message?.includes("No document to update");
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: isNotFoundError ? COMPANY_NOT_SYNCED_MESSAGE : "Failed to update role." 
      });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleNameChange = async (email: string, newName: string) => {
    if (!companyId) return;
    
    // Check if company is pending sync
    
    setIsUpdating(email);
    try {
      const companyRef = doc(firestore, "companies", companyId);
      
      const companySnap = await getDoc(companyRef);
      if (!companySnap.exists()) {
        toast({ variant: "destructive", title: "Error", description: COMPANY_NOT_SYNCED_MESSAGE });
        return;
      }
      
      const currentData = companySnap.data();
      const currentSharedWith = currentData.sharedWith || [];

      const updatedSharedWith = currentSharedWith.map((u: SharedUser) => 
        u.email === email ? { ...u, name: newName } : u
      );

      await updateDoc(companyRef, { sharedWith: updatedSharedWith });
      toast({ title: "Success", description: `Name for ${email} has been updated.` });
    } catch (error: any) {
      console.error("Error updating name:", error);
      const isNotFoundError = error?.code === "not-found" || error?.message?.includes("No document to update");
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: isNotFoundError ? COMPANY_NOT_SYNCED_MESSAGE : "Failed to update name." 
      });
    } finally {
      setIsUpdating(null);
    }
  }

  const handlePasswordChange = async () => {
    if (!companyId || !userToEdit) return;
    
    // Check if company is pending sync
    
    setIsUpdating(userToEdit.email);
    try {
      const companyRef = doc(firestore, "companies", companyId);
      
      const companySnap = await getDoc(companyRef);
      if (!companySnap.exists()) {
        toast({ variant: "destructive", title: "Error", description: COMPANY_NOT_SYNCED_MESSAGE });
        return;
      }
      
      const currentData = companySnap.data();
      const currentSharedWith = currentData.sharedWith || [];

      const updatedSharedWith = currentSharedWith.map((u: SharedUser) => 
        u.email === userToEdit.email ? { ...u, password: newPassword } : u
      );

      await updateDoc(companyRef, { sharedWith: updatedSharedWith });
      toast({ title: "Success", description: `Password for ${userToEdit.email} has been updated.` });
    } catch (error: any) {
      console.error("Error updating password:", error);
      const isNotFoundError = error?.code === "not-found" || error?.message?.includes("No document to update");
      toast({ 
        variant: "destructive", 
        title: "Error", 
        description: isNotFoundError ? COMPANY_NOT_SYNCED_MESSAGE : "Failed to update password." 
      });
    } finally {
      setIsUpdating(null);
      setUserToEdit(null);
      setNewPassword("");
    }
  }
  
  const handleRemoveAccess = async (userToRemove: SharedUser) => {
      if (!companyData || !companyId) return;

      // Check if company is pending sync

      // Permission check: manage users/roles
      try {
        if (!can("manage_users_roles")) {
          toast({
            variant: "destructive",
            title: "Permission Denied",
            description: "You do not have permission to manage users and roles.",
          });
          return;
        }
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to check permissions.",
        });
        return;
      }

      setIsUpdating(userToRemove.email);
      try {
          const companyRef = doc(firestore, "companies", companyId);
          const companySnap = await getDoc(companyRef);
          if (!companySnap.exists()) {
            toast({ variant: "destructive", title: "Error", description: COMPANY_NOT_SYNCED_MESSAGE });
            return;
          }
          
          const fullUserObject = companyData.sharedWith?.find(u => u.email === userToRemove.email);

          await updateDoc(companyRef, { 
              sharedWith: arrayRemove(fullUserObject),
              sharedWithEmails: arrayRemove(userToRemove.email) 
            });
          toast({ title: "Success", description: `Access for ${userToRemove.email} has been revoked.`});
      } catch (error: any) {
          console.error("Error removing access:", error);
          const isNotFoundError = error?.code === "not-found" || error?.message?.includes("No document to update");
          toast({ 
            variant: "destructive", 
            title: "Error", 
            description: isNotFoundError ? COMPANY_NOT_SYNCED_MESSAGE : "Failed to remove user access." 
          });
      } finally {
          setIsUpdating(null);
          setUserToRemove(null);
      }
  }
  
  const allUsers = useMemo(() => {
    if (!companyData || allAppUsers.length === 0) return [];
    
    const isUserOnline = (userInfo: any) => {
      if (!userInfo?.lastSeen?.toDate) return false;
      return (Date.now() - userInfo.lastSeen.toDate().getTime()) < 30000;
    };

    const uniqueUsers = new Map<string, SharedUser & { isOnline?: boolean; id?: string, photoURL?: string }>();

    if (companyData.ownerEmail) {
        const ownerInfo = allAppUsers.find(u => normalizeEmail(u.email) === normalizeEmail(companyData.ownerEmail));
        uniqueUsers.set(companyData.ownerEmail, {
            email: companyData.ownerEmail,
            name: ownerInfo?.displayName || "Admin", 
            role: 'owner',
            isOnline: isUserOnline(ownerInfo),
            id: ownerInfo?.id,
            photoURL: ownerInfo?.photoURL 
        });
    }

    (companyData.sharedWith || []).forEach(user => {
        if (user.email) {
            const userInfo = allAppUsers.find(u => normalizeEmail(u.email) === normalizeEmail(user.email));
            uniqueUsers.set(user.email, {
                ...user,
                name: userInfo?.displayName || user.name || "User", 
                isOnline: isUserOnline(userInfo),
                id: userInfo?.id,
                photoURL: userInfo?.photoURL || user.photoURL
            });
        }
    });
    
    return Array.from(uniqueUsers.values());
}, [companyData, allAppUsers]);


  if (loading) {
    return (
        <div className="space-y-8">
            <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-64 mb-1" />
                    <Skeleton className="h-4 w-full max-w-sm" />
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                </CardContent>
            </Card>
        </div>
    )
  }

  if (!companyId || !companyData) {
    return (
        <div className="p-4 sm:p-6 md:p-8">
            <Card className="w-full max-w-lg mx-auto text-center">
                 <CardHeader>
                    <CardTitle>No Company Selected</CardTitle>
                    <CardDescription>Please select a company from the header to manage settings.</CardDescription>
                </CardHeader>
            </Card>
        </div>
    );
  }

  const totalPermissions = flattenedPermissions.length;
  const enabledPermissions = permissionsForSelectedRole.filter(p => p === true).length;
  const disabledPermissions = totalPermissions - enabledPermissions;


  return (
    <div className="space-y-8">
        <Card>
            <CardHeader className="flex flex-row items-start justify-between">
                <div>
                    <CardTitle>Manage Sharing for {companyData.name}</CardTitle>
                    <CardDescription>
                        Control who has access to this company and what permissions they have.
                    </CardDescription>
                </div>
                 <ShareCompanyDialog company={companyData}>
                    <Button variant="outline">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Person
                    </Button>
                </ShareCompanyDialog>
            </CardHeader>
            <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-2/5">Email</TableHead>
                        <TableHead className="w-1/4">Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {allUsers.map((sharedUser) => (
                        <TableRow key={sharedUser.email}>
                           <TableCell className="font-medium flex items-center gap-3">
                                <div className={cn(
                                    "relative rounded-full p-[2px] transition-all duration-500 shrink-0",
                                    sharedUser.isOnline ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]" : "bg-black"
                                )}>
                                    <Avatar className="h-9 w-9 border-2 border-background shrink-0">
                                        <AvatarImage 
                                            src={getAvatarUrl(sharedUser.email, sharedUser.photoURL)} 
                                            className="object-cover rounded-full" 
                                        />
                                        <AvatarFallback className="bg-muted text-xs font-bold">
                                            {getInitials(sharedUser.name)}
                                        </AvatarFallback>
                                    </Avatar>
                                </div>
                            
                                <div className="flex flex-col min-w-0 overflow-hidden">
                                    <span className="font-semibold text-sm truncate">{sharedUser.email}</span>
                                    {sharedUser.email === companyData.ownerEmail && (
                                        <span className="text-[10px] text-amber-600 font-bold flex items-center gap-1">
                                            <Crown className="h-3 w-3" /> OWNER
                                        </span>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell>
                                {sharedUser.email === companyData.ownerEmail ? (
                                    <span>{sharedUser.name}</span>
                                ) : (
                                    <Input 
                                        defaultValue={sharedUser.name}
                                        onBlur={(e) => handleNameChange(sharedUser.email, e.target.value)}
                                        disabled={isUpdating === sharedUser.email}
                                    />
                                )}
                            </TableCell>
                            <TableCell>
                                 <Select
                                    value={sharedUser.role}
                                    onValueChange={(newRole: SharedUser["role"]) => handleRoleChange(sharedUser.email, newRole)}
                                    disabled={sharedUser.email === companyData.ownerEmail || isUpdating === sharedUser.email}
                                >
                                    <SelectTrigger className="w-[140px]">
                                        <SelectValue placeholder="Select a role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="owner"><span className="flex items-center gap-1.5"><Crown className="h-3 w-3" /> Owner</span></SelectItem>
                                        <SelectItem value="viewer">Viewer</SelectItem>
                                        <SelectItem value="data-entry">Data Entry</SelectItem>
                                        <SelectItem value="accountant">Accountant</SelectItem>
                                        <SelectItem value="editor">Editor</SelectItem>
                                        <SelectItem value="manager">Manager</SelectItem>
                                    </SelectContent>
                                </Select>
                            </TableCell>
                             <TableCell className="text-right">
                                <div className="flex justify-end items-center gap-1">
                                {sharedUser.email !== companyData.ownerEmail ? (
                                    <>
                                        <ShareCompanyDialog 
                                        company={companyData} 
                                        isEditing={true}
                                        userToEdit={sharedUser}
                                        >
                                        <Button variant="ghost" size="icon">
                                            <Pencil className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
                                        </Button>
                                        </ShareCompanyDialog>
                                    
                                        <Button variant="ghost" size="icon" onClick={() => setUserToEdit(sharedUser)}>
                                            <KeyRound className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
                                        </Button>

                                        {isUpdating === sharedUser.email ? (
                                            <Button variant="ghost" size="icon" disabled>
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setUserToRemove(sharedUser as SharedUser)}
                                            >
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        )}
                                    </>
                                ) : (
                                    <span className="text-xs text-muted-foreground mr-2">Owner</span>
                                )}
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {allUsers.length === 1 && (
                <p className="text-center text-muted-foreground p-8">
                    This company has not been shared with anyone yet.
                </p>
            )}
            </CardContent>
        </Card>
        
        <Dialog open={!!userToEdit} onOpenChange={(open) => !open && setUserToEdit(null)}>
             <DialogContent>
                <DialogHeader>
                    <DialogTitle>Reset Password for {userToEdit?.name}</DialogTitle>
                    <DialogDescription>Enter a new password for this user. They will be able to use this to log in to this company.</DialogDescription>
                </DialogHeader>
                <div className="py-4 relative">
                    <Input 
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter new password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="pr-10"
                    />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                </div>
                 <DialogFooter>
                    <Button variant="ghost" onClick={() => setUserToEdit(null)}>Cancel</Button>
                    <Button onClick={handlePasswordChange}>Set Password</Button>
                 </DialogFooter>
             </DialogContent>
        </Dialog>

        <Card>
             <CardHeader className="flex flex-col md:flex-row justify-between md:items-start">
                <div className="flex-1">
                    <CardTitle>Role Permissions</CardTitle>
                    <CardDescription>Select a role to view and edit its permissions.</CardDescription>
                </div>
                 <div className="flex items-center text-base font-bold" style={{gap: '10mm'}}>
                    <div className="border rounded-lg p-2 flex items-center">Total: {totalPermissions}</div>
                    <div className="text-green-600 border rounded-lg p-2 flex items-center">Enabled: {enabledPermissions}</div>
                    <div className="text-red-600 border rounded-lg p-2 flex items-center">Disabled: {disabledPermissions}</div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Top Button */}
                <div className="flex justify-end pb-4 border-b">
                    <Button onClick={handleSavePermissions} disabled={isSavingPermissions || !hasUnsavedChanges}>
                        {isSavingPermissions ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                        Save Permissions
                    </Button>
                </div>
                 <div className="flex flex-wrap items-center justify-between gap-4">
                    <Select value={selectedRoleForPermissions} onValueChange={(value) => setSelectedRoleForPermissions(value as UserRole)}>
                        <SelectTrigger className="w-[220px]">
                            <SelectValue placeholder="Select a role to edit" />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.keys(editablePermissionConfig.roles).map(role => (
                                <SelectItem key={role} value={role} className="capitalize">
                                    {role.replace('-', ' ')}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                       {hasUnsavedChanges && (
                         <>
                           <span className="text-sm text-amber-600 font-medium">You have unsaved changes.</span>
                           <Button variant="outline" size="sm" onClick={handleResetPermissions} disabled={isSavingPermissions}>
                               <Undo2 className="mr-2 h-4 w-4"/> Reset
                           </Button>
                         </>
                       )}
                       {/* Middle Button */}
                       <Button size="sm" variant="outline" onClick={handleSavePermissions} disabled={isSavingPermissions || !hasUnsavedChanges}>
                           {isSavingPermissions ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                           Save Permissions
                       </Button>
                    </div>
                 </div>
                 <div className="space-y-4 pt-4">
                    <h3 className="text-lg font-semibold border-b pb-2">Date Control</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {["Entry", "Edit", "Delete"].map((action) => {
                        const key = `${action.toLowerCase()}Days` as keyof typeof dateLimitsForSelectedRole;
                        const value = dateLimitsForSelectedRole?.[key] ?? 0;
                        return (
                            <div key={action} className="flex flex-col space-y-2 p-3 border rounded-lg">
                            <label className="text-sm font-medium">{`Back Date ${action} Days`}</label>
                             <Input
                                type="number"
                                min={0}
                                value={value}
                                onChange={(e) => handleDateLimitChange(action.toLowerCase() as any, Number(e.target.value))}
                                disabled={selectedRoleForPermissions === "owner"}
                                className="w-full"
                              />
                               <p className="text-xs text-muted-foreground">0 = disabled to modify backdated. 1–9998 = last X days. 9999 = unlimited.</p>
                            </div>
                        );
                        })}
                    </div>
                </div>

                {/* File Attachment Settings */}
                <div className="space-y-4 pt-4">
                    <h3 className="text-lg font-semibold border-b pb-2">File Attachment Settings</h3>
                    
                    {/* Global Toggle */}
                    <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                            <label className="text-base font-medium">Allow File Attachments</label>
                            <p className="text-sm text-muted-foreground">
                                Enable or disable file uploads across all voucher and entry forms.
                            </p>
                        </div>
                        <Switch 
                            checked={allowAttachmentsGlobal} 
                            onCheckedChange={handleAllowAttachmentsGlobalChange}
                        />
                    </div>

                    {/* Role-based File Limits */}
                    {allowAttachmentsGlobal && (
                        <div className="space-y-4 p-4 border rounded-lg">
                            <h4 className="text-sm font-semibold">File Limits for {selectedRoleForPermissions.replace('-', ' ')} Role</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {/* Max File Count */}
                                <div className="flex flex-col space-y-2">
                                    <label className="text-sm font-medium">Max File Count (0-5)</label>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={5}
                                        value={fileAttachmentLimitsForSelectedRole.maxFileCount}
                                        onChange={(e) => handleFileAttachmentLimitChange('maxFileCount', Math.min(5, Math.max(0, Number(e.target.value))))}
                                        disabled={selectedRoleForPermissions === "owner"}
                                        className="w-full"
                                    />
                                    <p className="text-xs text-muted-foreground">Maximum number of files allowed per voucher.</p>
                                </div>

                                {/* Allow Image */}
                                <div className="flex items-center justify-between p-3 border rounded-lg">
                                    <div>
                                        <label className="text-sm font-medium">Allow Image Files</label>
                                        <p className="text-xs text-muted-foreground">Enable image file uploads</p>
                                    </div>
                                    <Switch
                                        checked={fileAttachmentLimitsForSelectedRole.allowImage}
                                        onCheckedChange={(checked) => handleFileAttachmentLimitChange('allowImage', checked)}
                                        disabled={selectedRoleForPermissions === "owner" || fileAttachmentLimitsForSelectedRole.maxFileCount === 0}
                                    />
                                </div>

                                {/* Allow PDF */}
                                <div className="flex items-center justify-between p-3 border rounded-lg">
                                    <div>
                                        <label className="text-sm font-medium">Allow PDF Files</label>
                                        <p className="text-xs text-muted-foreground">Enable PDF file uploads</p>
                                    </div>
                                    <Switch
                                        checked={fileAttachmentLimitsForSelectedRole.allowPDF}
                                        onCheckedChange={(checked) => handleFileAttachmentLimitChange('allowPDF', checked)}
                                        disabled={selectedRoleForPermissions === "owner" || fileAttachmentLimitsForSelectedRole.maxFileCount === 0}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {PermissionGroups.map((group) => (
                    <div key={group.title} className="space-y-4 pt-4">
                        <h3 className="text-lg font-semibold border-b pb-2">{group.title}</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {group.permissions.map((permission) => {
                                const globalIndex = flattenedPermissions.indexOf(permission.key);

                                if (globalIndex === -1) return null;

                                const hasPermission = selectedRoleForPermissions === "owner" ? true : permissionsForSelectedRole[globalIndex];

                                return (
                                    <div key={permission.key} className="flex items-center space-x-2 p-2 rounded-md border">
                                        <Checkbox
                                            id={`${selectedRoleForPermissions}-${permission.key}`}
                                            checked={hasPermission}
                                            onCheckedChange={(checked) =>
                                                handlePermissionChange(permission.key, !!checked)
                                            }
                                            disabled={selectedRoleForPermissions === "owner"}
                                        />
                                        <label
                                            htmlFor={`${selectedRoleForPermissions}-${permission.key}`}
                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                        >
                                            {permission.label}
                                        </label>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
                {/* Bottom Button */}
                <div className="flex justify-end pt-4 border-t">
                    <Button onClick={handleSavePermissions} disabled={isSavingPermissions || !hasUnsavedChanges}>
                        {isSavingPermissions ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                        Save Permissions
                    </Button>
                </div>
            </CardContent>
        </Card>

         <AlertDialog open={!!userToRemove} onOpenChange={(open) => !open && setUserToRemove(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will revoke <span className="font-bold">{userToRemove?.email}</span>'s access to the company. They will no longer be able to view or edit its data.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => userToRemove && handleRemoveAccess(userToRemove)}
                        className="bg-destructive hover:bg-destructive/90"
                    >
                        Revoke Access
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
  );
}

    