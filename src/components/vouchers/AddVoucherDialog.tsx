"use client";

import React, { useState, useEffect, useMemo, Suspense, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { startOfDay } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import { doc, getDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { firestore, storage } from "@/lib/firebase"; // storage आयात गरियो
import { ref, deleteObject } from "firebase/storage"; // storage डिलिट गर्न आवश्यक

// Forms
import { CreateSaleForm } from "./CreateSaleForm";
import { CreatePurchaseForm } from "./CreatePurchaseForm";
import { CreatePaymentInForm } from "./CreatePaymentInForm";
import { CreatePaymentOutForm } from "./CreatePaymentOutForm";
import { CreateContraForm } from "./CreateContraForm";
import { CreateJournalForm } from "./CreateJournalForm";
import { CreateNoteForm } from "./CreateNoteForm";
import { SalaryForm } from "./SalaryForm";
import { CreateProductionForm } from "./CreateProductionForm";
import { useCompany } from "@/hooks/useCompany";
import usePermissions from "@/hooks/usePermissions";
import { useVouchers } from "@/hooks/useVouchers";
import { determineVoucherOwnership } from "@/lib/permissions/enforcePermission";
import { HistoryDialog } from "./HistoryDialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";
import { hasPaymentLinks } from "@/lib/payment-allocation-utils";
import { useAuth } from "@/hooks/useAuth";
import { approveVoucherWithHistory } from "@/lib/voucherActionsClient";

type VoucherType = "sale" | "purchase" | "payment_in" | "payment_out" | "contra" | "direct_income" | "direct_expense" | "journal" | "note" | "add_salary" | "production";

const formMap: Record<VoucherType, React.ComponentType<any>> = {
  sale: CreateSaleForm,
  purchase: CreatePurchaseForm,
  payment_in: CreatePaymentInForm,
  payment_out: CreatePaymentOutForm,
  contra: CreateContraForm,
  direct_income: CreatePaymentInForm,
  direct_expense: CreatePaymentOutForm,
  journal: CreateJournalForm,
  note: CreateNoteForm,
  add_salary: SalaryForm,
  production: CreateProductionForm,
};

// Tab order: Contra left of Journal
const TAB_ORDER: VoucherType[] = [
  "sale", "purchase", "payment_in", "payment_out", "direct_income", "direct_expense",
  "contra", "journal", "note", "add_salary", "production",
];

// Convertible voucher pairs (can convert between these when editing)
const CONVERTIBLE_MAP: Partial<Record<VoucherType, VoucherType>> = {
  sale: "purchase",
  purchase: "sale",
  payment_in: "payment_out",
  payment_out: "payment_in",
  direct_income: "direct_expense",
  direct_expense: "direct_income",
};
function getConvertTarget(type: VoucherType): VoucherType | null {
  return CONVERTIBLE_MAP[type] ?? null;
}
function getEnabledTabsWhenEditing(currentType: VoucherType): VoucherType[] {
  const target = getConvertTarget(currentType);
  if (target) return [currentType, target];
  return [currentType];
}

const getVoucherType = (voucher: any, defaultData: any, defaultTab: string): VoucherType => {
  if (voucher?.subType === 'add_salary' || defaultData?.subType === 'add_salary') return 'add_salary';
  if (voucher?.id) return (voucher.type || 'sale') as VoucherType;
  return (defaultData?.defaultTab || defaultTab || 'sale') as VoucherType;
};

function VoucherDialogContent({ 
  voucher, 
  defaultVoucherData, 
  defaultTab = "sale",
  allowedTabs,
  onVoucherAction,
  onOpenHistory,
  showHistoryButton,
  editingDisabled = false,
  restrictConvertWhenLinked = false,
  deleteDisabledWhenLinked = false,
  showApproveButton = false,
  showSaveAndApproveOnCreate = false,
  onApprove,
  isApproving = false,
}: { 
  voucher?: any, 
  defaultVoucherData?: any,
  defaultTab?: string,
  allowedTabs?: VoucherType[],
  onVoucherAction?: (status: 'saved' | 'cancelled', isSaveAndNew?: boolean, newId?: string, pathsToDelete?: string[]) => void,
  onOpenHistory?: () => void,
  showHistoryButton?: boolean,
  editingDisabled?: boolean,
  restrictConvertWhenLinked?: boolean,
  deleteDisabledWhenLinked?: boolean,
  showApproveButton?: boolean,
  showSaveAndApproveOnCreate?: boolean,
  onApprove?: () => void,
  isApproving?: boolean,
}) {
  const { processedStaff } = useVouchers();
  const isEditing = !!voucher?.id;
  const isMobile = useIsMobile();

  const [activeTab, setActiveTab] = useState<VoucherType>(getVoucherType(voucher, defaultVoucherData, defaultTab));
  
  useEffect(() => {
    const initial = getVoucherType(voucher, defaultVoucherData, defaultTab);
    const allowed = Array.isArray(allowedTabs) && allowedTabs.length > 0 ? allowedTabs : null;
    const next = allowed && !allowed.includes(initial) ? allowed[0] : initial;
    setActiveTab(next);
  }, [voucher, defaultVoucherData, defaultTab, allowedTabs]);

  const initialVoucherData = useMemo(() => {
    if (isEditing) return { ...voucher };

    return {
      id: undefined,
      date: startOfDay(new Date()),
      voucherNumber: "",
      narration: "",
      partyId: "",
      accountId: "",
      amount: "", 
      total: 0,
      fileUrls: defaultVoucherData?.fileUrls || (defaultVoucherData?.unassignedFile ? [defaultVoucherData.unassignedFile.url] : []),
      unassignedFile: defaultVoucherData?.unassignedFile || null,
      ...defaultVoucherData
    };
  }, [voucher, defaultVoucherData, isEditing]);

  const ActiveForm = useMemo(() => formMap[activeTab], [activeTab]);
  const keyForForm = `${activeTab}-${voucher?.id || 'new'}`;

  const enabledTabsWhenEditing = useMemo(() => {
    if (!isEditing) return null;
    if (restrictConvertWhenLinked) return [activeTab] as VoucherType[];
    return getEnabledTabsWhenEditing(activeTab);
  }, [isEditing, activeTab, restrictConvertWhenLinked]);

  const tabKeys = TAB_ORDER.filter((k) => (k in formMap) && (!allowedTabs || allowedTabs.includes(k)));

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-[2px] md:px-6 border-b bg-muted/20">
        {isMobile ? (
          <Select value={activeTab} onValueChange={(v) => setActiveTab(v as VoucherType)}>
            <SelectTrigger className="w-1/2">
              <SelectValue>
                {activeTab.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {tabKeys.map((key) => {
                const disabled = enabledTabsWhenEditing !== null && !enabledTabsWhenEditing.includes(key);
                return (
                  <SelectItem key={key} value={key} disabled={disabled}>
                    {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              const next = v as VoucherType;
              if (enabledTabsWhenEditing === null || enabledTabsWhenEditing.includes(next)) setActiveTab(next);
            }}
            className="w-full"
          >
            <TabsList className="h-auto flex-wrap justify-start bg-transparent p-0 gap-1 py-1">
              {tabKeys.map((key) => {
                const disabled = enabledTabsWhenEditing !== null && !enabledTabsWhenEditing.includes(key);
                return (
                  <TabsTrigger 
                    key={key} 
                    value={key}
                    disabled={disabled}
                    className={cn(
                      "capitalize px-4 py-2 transition-all",
                      "data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:font-bold data-[state=active]:shadow-md",
                      disabled && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {key.replace(/_/g, ' ')}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        )}
      </div>

      <div className={cn("w-full min-w-0 max-w-full pl-[2px] pr-[2px] pt-6 flex-1 flex flex-col min-h-0 overflow-x-hidden box-border", isMobile ? "pb-0" : "pb-6 md:p-6")}>
        <Suspense fallback={<div className="p-10 text-center"><Loader2 className="animate-spin mx-auto" /></div>}>
          {ActiveForm ? (
            <ActiveForm 
              key={keyForForm} 
              voucher={initialVoucherData} 
              onVoucherAction={onVoucherAction}
              onOpenHistory={onOpenHistory}
              showHistoryButton={showHistoryButton}
              staffList={activeTab === 'add_salary' ? processedStaff : undefined}
              defaultTab={activeTab === 'direct_income' ? 'direct_income' : activeTab === 'direct_expense' ? 'direct_expense' : undefined}
              defaultVoucherData={initialVoucherData}
              editingDisabled={editingDisabled}
              deleteDisabledWhenLinked={deleteDisabledWhenLinked}
              showApproveButton={showApproveButton}
              showSaveAndApproveOnCreate={showSaveAndApproveOnCreate}
              onApprove={onApprove}
              isApproving={isApproving}
            />
          ) : null}
        </Suspense>
      </div>
    </div>
  );
}

export function AddVoucherDialog(props: any) {
  const { children, isOpen, onOpenChange, voucher, defaultVoucherData, ...rest } = props;
  const { companyId, company } = useCompany();
  const { user, customUser } = useAuth();
  const { can, canEditRecord } = usePermissions();
  const { vouchers } = useVouchers();
  const [historyVoucher, setHistoryVoucher] = useState<any>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [liveVoucher, setLiveVoucher] = useState<any>(null);
  const [editingDisabled, setEditingDisabled] = useState(false);

  // When editing, subscribe to voucher doc so unlink/allocations updates enable Save & convert
  useEffect(() => {
    if (!isOpen || !voucher?.id || !companyId) {
      setLiveVoucher(null);
      return;
    }
    const voucherRef = doc(firestore, `companies/${companyId}/vouchers`, voucher.id);
    const unsub = onSnapshot(voucherRef, (snap) => {
      if (snap.exists()) setLiveVoucher({ id: snap.id, ...snap.data() });
      else setLiveVoucher(null);
    });
    return () => {
      unsub();
      setLiveVoucher(null);
    };
  }, [isOpen, voucher?.id, companyId]);

  const effectiveVoucher = liveVoucher ?? voucher;
  const hasLinks = !!effectiveVoucher?.id && hasPaymentLinks(effectiveVoucher);

  // Permission-based: disable edit when user cannot edit this voucher (role + ownership)
  useEffect(() => {
    if (!effectiveVoucher?.id) {
      setEditingDisabled(false);
      return;
    }
    const fetchVoucher = async (cid: string, vid: string) => {
      const snap = await getDoc(doc(firestore, `companies/${cid}/vouchers`, vid));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    };
    let cancelled = false;
    determineVoucherOwnership(
      effectiveVoucher,
      effectiveVoucher.id,
      vouchers || [],
      user?.uid || "",
      companyId,
      fetchVoucher
    ).then((isOwnRecord) => {
      if (!cancelled) {
        const canEdit = canEditRecord(isOwnRecord, effectiveVoucher);
        setEditingDisabled(!canEdit);
      }
    });
    return () => { cancelled = true; };
  }, [effectiveVoucher?.id, effectiveVoucher?.isApproved, companyId, user?.uid, vouchers, canEditRecord]);

  // Show Approve / Save & Approve for any existing voucher if user can approve (approved voucher: enable when form has changes)
  const showApproveButton =
    !!effectiveVoucher?.id &&
    can("approve_transactions");

  const showSaveAndApproveOnCreate =
    !effectiveVoucher?.id &&
    can("approve_transactions") &&
    company?.notificationSettings?.approve?.on !== false;

  const handleApprove = useCallback(async () => {
    if (!companyId || !effectiveVoucher?.id || isApproving || !user?.uid) return;
    setIsApproving(true);
    try {
      const approverName = customUser?.displayName || user?.displayName || user?.email || user.uid;
      await approveVoucherWithHistory(companyId, effectiveVoucher.id, user.uid, approverName);
      toast.success("Transaction approved.");
      props.onVoucherAction?.("saved");
      onOpenChange?.(false);
    } catch (e) {
      toast.error("Failed to approve transaction.");
    } finally {
      setIsApproving(false);
    }
  }, [companyId, effectiveVoucher?.id, isApproving, user?.uid, user?.displayName, user?.email, customUser?.displayName, props.onVoucherAction, onOpenChange]);

  // ✅ handleAction मा pathsToDelete थपियो
  const handleAction = useCallback(async (
    status: 'saved' | 'cancelled', 
    isSaveAndNew?: boolean, 
    newId?: string, 
    pathsToDelete: string[] = [] // यहाँ एरे प्राप्त हुन्छ
  ) => {
    
    // १. सेभ भएको बेला मात्र सर्भरबाट फाइल डिलिट गर्ने
    if (status === 'saved' && pathsToDelete.length > 0) {
      console.log("Cleaning up files from storage...");
      for (const path of pathsToDelete) {
        try {
          const fileRef = ref(storage, path);
          await deleteObject(fileRef);
          console.log("Deleted:", path);
        } catch (error) {
          console.error("Failed to delete file:", path, error);
        }
      }
    }

    // २. Unassigned file को cleanup (पहिलेकै लजिक)
    if (status === 'saved' && defaultVoucherData?.unassignedFile?.id && companyId) {
      try {
        const fileDocRef = doc(firestore, `companies/${companyId}/unassigned_documents`, defaultVoucherData.unassignedFile.id);
        await deleteDoc(fileDocRef);
      } catch (error) {
        console.error("Failed to delete unassigned document:", error);
      }
    }
  
    // ३. Propagate action
    if (props.onVoucherAction) {
      props.onVoucherAction(status, isSaveAndNew, newId);
    }
  
    if (!isSaveAndNew) {
      onOpenChange?.(false);
    }
  }, [onOpenChange, companyId, defaultVoucherData?.unassignedFile?.id, props]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="flex flex-col p-0 w-[calc(100vw-4px)] md:w-[calc(100vw-40px)] max-w-7xl h-[calc(100vh-40px)] max-h-[90vh] rounded-lg md:rounded-lg">
        <DialogHeader className="px-[2px] py-6 pb-2 md:p-6 md:pb-2 border-b">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-2xl font-bold font-headline">
                {!!voucher?.id ? "Edit Transaction" : "New Transaction"}
              </DialogTitle>
              <DialogDescription>Attach documents and record your transaction.</DialogDescription>
            </div>
          </div>
          {hasLinks && (
            <p className="text-sm text-amber-600 dark:text-amber-500 font-medium text-center w-full mt-2">
              To convert or edit, unlink linked transactions first.
            </p>
          )}
        </DialogHeader>
        <VoucherDialogContent 
          {...rest}
          voucher={effectiveVoucher}
          defaultVoucherData={defaultVoucherData}
          onVoucherAction={handleAction}
          onOpenHistory={effectiveVoucher?.id && can("view_voucher_history") ? () => setHistoryVoucher(effectiveVoucher) : undefined}
          showHistoryButton={!!effectiveVoucher?.id && can("view_voucher_history")}
          editingDisabled={editingDisabled || hasLinks}
          restrictConvertWhenLinked={hasLinks}
          deleteDisabledWhenLinked={hasLinks}
          showApproveButton={showApproveButton}
          showSaveAndApproveOnCreate={showSaveAndApproveOnCreate}
          onApprove={handleApprove}
          isApproving={isApproving}
        />
        <HistoryDialog
          voucher={historyVoucher}
          isOpen={!!historyVoucher}
          onOpenChange={(open) => !open && setHistoryVoucher(null)}
          onHistoryReset={() => setHistoryVoucher((prev: any) => (prev ? { ...prev, history: [] } : null))}
        />
      </DialogContent>
    </Dialog>
  );
}