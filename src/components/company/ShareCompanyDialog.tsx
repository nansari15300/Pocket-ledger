

"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { doc, updateDoc, arrayUnion, getDoc, getDocs, query, collection, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { numericEntitlement, companyStorageIsLocal, type PlanId } from "@/config/plans";
import { useLivePlans, getPlanFromPlans } from "@/hooks/useLivePlans";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "../ui/button";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Company as CompanyData } from "@/hooks/useCompany";
import { getSuperAdminEmails } from "@/lib/superAdminEmails";


const formSchema = z.object({
  name: z.string().min(2, { message: "Please enter a name for the user." }),
  email: z.string().email({ message: "Please enter a valid email address." }),
  role: z.enum(["viewer", "data-entry", "accountant", "editor", "manager", "owner"], { message: "Please select a role." }),
  password: z.string().optional(),
});

export function ShareCompanyDialog({ 
    company, 
    children, 
    isOpen: parentIsOpen, 
    onOpenChange: parentOnOpenChange,
    isEditing = false,
    userToEdit
}: { 
    company?: CompanyData, 
    children: React.ReactNode, 
    isOpen?: boolean, 
    onOpenChange?: (open: boolean) => void,
    isEditing?: boolean,
    userToEdit?: any 
}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const livePlans = useLivePlans();

  const isOpen = parentIsOpen !== undefined ? parentIsOpen : internalIsOpen;
  const setOpen = parentOnOpenChange !== undefined ? parentOnOpenChange : setInternalIsOpen;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      role: "accountant",
      password: "",
    },
  });
  
  useEffect(() => {
    if (isOpen && isEditing && userToEdit) {
        form.reset({
            name: userToEdit.name,
            email: userToEdit.email,
            role: userToEdit.role,
            password: userToEdit.password || "",
        });
    } else if (isOpen && !isEditing) {
        form.reset({ name: "", email: "", role: "accountant", password: "" });
    }
  }, [isOpen, isEditing, userToEdit, form]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!company) {
        toast({
            variant: "destructive",
            title: "Error",
            description: "No company is selected to share.",
        });
        return;
    }

    if (!isEditing && company.sharedWithEmails?.includes(values.email)) {
        toast({
            variant: "destructive",
            title: "Already Shared",
            description: "This company is already shared with this account.",
        });
        return;
    }

    const plan = getPlanFromPlans(livePlans, (company.planId as PlanId) || undefined);
    const maxUsers = numericEntitlement(plan.entitlements, "maxUsers", companyStorageIsLocal(company.storageOption)) || 1;
    const superAdminEmails = new Set(getSuperAdminEmails().map((e) => e.toLowerCase().trim()));
    const ownerEmailNorm = (company.ownerEmail || "").toLowerCase().trim();
    const sharedExcludingSuperAdminAndOwner = (company.sharedWithEmails || []).filter(
      (email) => {
        const e = (email || "").toLowerCase().trim();
        return !superAdminEmails.has(e) && e !== ownerEmailNorm;
      }
    );
    const currentMembers = 1 + sharedExcludingSuperAdminAndOwner.length;
    if (!isEditing && currentMembers >= maxUsers) {
        toast({
            variant: "destructive",
            title: "Plan limit reached",
            description: `This plan allows up to ${maxUsers} user${maxUsers === 1 ? "" : "s"}. Upgrade to add more.`,
        });
        return;
    }

    setIsLoading(true);
    try {
        const companyRef = doc(firestore, "companies", company.id);
        const companySnap = await getDoc(companyRef);
        
        // Check if document exists in Firestore
        if (!companySnap.exists()) {
            toast({
                variant: "destructive",
                title: "Cannot Share",
                description: "This company hasn't synced to the server yet. Connect to the internet and wait for sync, then try again.",
            });
            return;
        }

        const currentData = companySnap.data();
        const currentSharedWith = currentData?.sharedWith || [];

        if (isEditing) {
            const updatedSharedWith = currentSharedWith.map((u: any) => 
                u.email === values.email ? { ...u, name: values.name, role: values.role, password: values.password || null } : u
            );
             await updateDoc(companyRef, { sharedWith: updatedSharedWith });
             toast({ title: "User Updated!", description: `Details for ${values.email} have been updated.` });

        } else {
            let sharedUid: string | null = null;
            try {
              const userSnap = await getDocs(query(collection(firestore, "users"), where("email", "==", values.email)));
              const first = userSnap.docs[0];
              const data = first?.data();
              sharedUid = (data?.uid as string) || first?.id || null;
            } catch {
              // keep optional; sharing should not fail if uid lookup is unavailable
            }
            await updateDoc(companyRef, {
                sharedWith: arrayUnion({ name: values.name, email: values.email, uid: sharedUid, role: values.role, password: values.password || null }),
                sharedWithEmails: arrayUnion(values.email)
            });
            toast({
                title: "Company Shared!",
                description: `"${company.name}" has been shared with ${values.email} as a(n) ${values.role}.`,
            });
        }

        form.reset();
        setOpen(false);
    } catch (error: any) {
        console.error("Error sharing/updating company: ", error);
        const errorMessage = error?.message || "An error occurred. Please try again.";
        const isNotFoundError = error?.code === "not-found" || errorMessage.includes("No document to update");
        
        toast({
            variant: "destructive",
            title: isEditing ? "Update Failed" : "Sharing Failed",
            description: isNotFoundError 
                ? "This company hasn't synced to the server yet. Connect to the internet and wait for sync, then try again."
                : errorMessage,
        });
    } finally {
        setIsLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="sm:max-w-[425px] p-4">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Edit User: ${userToEdit?.name}` : `Share "${company?.name}"`}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update the user's details and role." : "Invite others to collaborate on this company."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }: any) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="User's Name" {...field} className="h-9 text-sm px-3 rounded-md"/>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }: any) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input placeholder="name@example.com" {...field} disabled={isEditing} className="h-9 text-sm px-3 rounded-md"/>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }: any) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-9 text-sm px-3 rounded-md">
                          <SelectValue placeholder="Select a role for the user" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="viewer">Viewer</SelectItem>
                        <SelectItem value="data-entry">Data Entry</SelectItem>
                        <SelectItem value="accountant">Accountant</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="owner">Owner</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="password"
                render={({ field }: any) => (
                  <FormItem>
                    <FormLabel>Set User Password (Optional)</FormLabel>
                    <div className="relative">
                        <FormControl>
                          <Input type={showPassword ? "text" : "password"} placeholder="Leave blank to use main password" {...field} className="h-9 text-sm px-3 rounded-md"/>
                        </FormControl>
                        <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowPassword(!showPassword)}>
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            <DialogFooter className="pt-4">
              <DialogClose asChild>
                <Button type="button" variant="ghost" className="h-9 text-sm px-4 rounded-md">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={isLoading} className="h-9 text-sm px-4 rounded-md">
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Save Changes" : "Share Company"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

    