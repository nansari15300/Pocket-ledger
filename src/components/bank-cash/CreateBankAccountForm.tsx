
"use client";
import { Combobox } from "@/components/ui/combobox";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PlusCircle } from "lucide-react";
import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { firestore } from "@/lib/firebase";
import type { AccountGroup } from "@/components/bank-cash/types";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { CreateAccountGroupDialog } from "./CreateAccountGroupDialog";
import { ensureUngroupedGroup, getUngroupedGroupId } from "@/lib/ungrouped-groups";
import { apkEntityWriteUsesLocalSqliteMirror } from "@/lib/apkOnlineFirestoreWritePolicy";
import { upsertCompanyDocInBrowserDb } from "@/lib/localCompanyDocMirror";
import { enqueueCompanyDocOutbox } from "@/lib/localVoucherOutbox";
import {
  MasterFormNameAcNoRow,
  MasterFormTwoColGrid,
  MasterMobileNoField,
} from "@/components/inter-company/MasterFormLayout";
import { interCompanyAcNoForNewEntity } from "@/lib/interCompany/interCompanyAccountNo";

function createLocalEntityId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

const formSchema = z.object({
  accountName: z.string().min(2, "Account name must be at least 2 characters."),
  phone: z.string().optional(),
  accountType: z.enum(["Bank", "Cash"], { message: "Account type is required." }),
  openingBalance: z.coerce.number().min(0),
  groupId: z.string().optional(),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  ifscCode: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateBankAccountForm({ onAccountCreated, groups }: { onAccountCreated?: () => void, groups: AccountGroup[] }) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, company } = useCompany();
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      accountName: "",
      phone: "",
      accountType: "Bank",
      openingBalance: 0,
      bankName: "",
      accountNumber: "",
      ifscCode: "",
      // Default to canonical Ungrouped; ensured again at save-time.
      groupId: getUngroupedGroupId("bank"),
    },
  });

  const accountType = form.watch("accountType");

  async function onSubmit(values: FormValues): Promise<void> {
    if (!user || !companyId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "You must be logged in and have a company selected.",
      });
      return;
    }

    setIsLoading(true);
    try {
      if (apkEntityWriteUsesLocalSqliteMirror(company)) {
        // Local-only mode: save account in browser DB and queue cloud backup sync.
        const localId = createLocalEntityId("bank");
        const interCompanyAccountNo = await interCompanyAcNoForNewEntity("bank");
        const payload = {
          id: localId,
          ...values,
          phone: values.phone?.trim() || null,
          ownerId: user.uid,
          companyId,
          groupId: values.groupId?.trim() || getUngroupedGroupId("bank"),
          balance: values.openingBalance,
          createdAt: new Date().toISOString(),
          isDeleted: false,
          interCompanyAccountNo,
        };
        await upsertCompanyDocInBrowserDb(companyId, "bank_accounts", localId, payload);
        await enqueueCompanyDocOutbox(companyId, "bank_accounts", "create", localId, payload);
        // Local save success toast keeps wording consistent across local-first forms.
        const showSyncHint = process.env.NEXT_PUBLIC_ENABLE_AUTO_BACKUP_SYNC === "1" && user.uid !== "local_guest_user";
        toast({
          title: showSyncHint ? "Saved. Will sync when online." : "Saved.",
          description: showSyncHint
            ? `"${values.accountName}" was saved locally and will sync when online.`
            : `"${values.accountName}" was saved locally.`,
        });
        form.reset({ accountName: "", accountType: "Bank", openingBalance: 0, bankName: "", accountNumber: "", ifscCode: "", groupId: getUngroupedGroupId("bank") });
        onAccountCreated?.();
        return;
      }

      // If user leaves group unchanged, auto-assign/create Ungrouped before save.
      const resolvedGroupId =
        values.groupId?.trim() || (await ensureUngroupedGroup(companyId!, user.uid, "bank"));
      const bankRef = doc(collection(firestore, `companies/${companyId}/bank_accounts`));
      const interCompanyAccountNo = await interCompanyAcNoForNewEntity("bank");
      await setDoc(bankRef, {
        ...values,
        phone: values.phone?.trim() || null,
        ownerId: user.uid,
        companyId,
        groupId: resolvedGroupId || getUngroupedGroupId("bank"),
        balance: values.openingBalance,
        createdAt: serverTimestamp(),
        isDeleted: false,
        interCompanyAccountNo,
      });
      
      toast({
        title: "Account Created!",
        description: `"${values.accountName}" has been successfully created.`,
      });
      
      // Keep default selection on Ungrouped for next quick entry.
      form.reset({ accountName: "", accountType: "Bank", openingBalance: 0, bankName: "", accountNumber: "", ifscCode: "", groupId: getUngroupedGroupId("bank") });
      if (onAccountCreated) {
        onAccountCreated();
      }

    } catch (error) {
      console.error("Error creating bank account:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create account. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-4">
            <MasterFormNameAcNoRow
              entityKind="bank"
              mode="create"
              nameField={
                <FormField
                  control={form.control}
                  name="accountName"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>Account Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Primary Savings" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              }
            />
            <MasterFormTwoColGrid>
              <MasterMobileNoField control={form.control} />
            <FormField
            control={form.control}
            name="accountType"
            render={({ field }: any) => (
                <FormItem>
                <FormLabel>Account Type</FormLabel>
                 <RadioGroup
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    className="flex h-10 w-full items-center space-x-4"
                    >
                    <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                        <RadioGroupItem value="Bank" />
                        </FormControl>
                        <FormLabel className="font-normal">Bank Account</FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                        <RadioGroupItem value="Cash" />
                        </FormControl>
                        <FormLabel className="font-normal">Cash in Hand</FormLabel>
                    </FormItem>
                    </RadioGroup>
                <FormMessage />
                </FormItem>
            )}
            />
            </MasterFormTwoColGrid>
            <MasterFormTwoColGrid>
              <FormField
              control={form.control}
              name="groupId"
              render={({ field }: any) => (
                <FormItem>
                  <FormLabel>Group (Optional)</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Combobox
                          options={[
                            { value: getUngroupedGroupId("bank"), label: "Ungrouped" },
                            ...groups
                              .filter((group) => !(group as any).isSystemReserved && (group as any).isAutoUngrouped !== true)
                              .map((group) => ({
                                value: group.id,
                                label: group.name,
                              })),
                          ]}
                          value={field.value}
                          onChange={(val) => field.onChange(val === "none" ? "" : val)}
                          placeholder="Select or search a group"
                          addNewLabel="Create New Group"
                          disabled={isLoading}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsCreateGroupOpen(true)}
                      >
                        <PlusCircle className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {accountType === "Bank" ? (
              <FormField
                control={form.control}
                name="bankName"
                render={({ field }: any) => (
                  <FormItem>
                    <FormLabel>Bank Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., State Bank of India" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div aria-hidden className="hidden sm:block" />
            )}
            </MasterFormTwoColGrid>

            <MasterFormTwoColGrid>
            <FormField
            control={form.control}
            name="openingBalance"
            render={({ field }: any) => (
                <FormItem>
                <FormLabel>Opening Balance</FormLabel>
                <FormControl>
                    <Input type="number" {...field} />
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
            <div />
            </MasterFormTwoColGrid>

            {accountType === "Bank" && (
                <MasterFormTwoColGrid>
                    <FormField
                        control={form.control}
                        name="accountNumber"
                        render={({ field }: any) => (
                            <FormItem>
                                <FormLabel>Account Number</FormLabel>
                                <FormControl>
                                    <Input placeholder="Enter bank account number" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="ifscCode"
                        render={({ field }: any) => (
                            <FormItem>
                                <FormLabel>IFSC Code</FormLabel>
                                <FormControl>
                                    <Input placeholder="Enter IFSC code" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </MasterFormTwoColGrid>
            )}
        </div>

        <Button type="submit" className="w-full" disabled={isLoading || !companyId}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Account
        </Button>
      </form>
    </Form>
    <CreateAccountGroupDialog onGroupCreated={() => setIsCreateGroupOpen(false)} isOpen={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen} groups={groups} />
    </>
  );
}

    