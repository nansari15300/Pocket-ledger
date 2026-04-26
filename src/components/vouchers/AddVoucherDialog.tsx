"use client";

import React, { useState, useEffect, useMemo, Suspense, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogClose, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, X } from "lucide-react";
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
import { hasPaymentLinks, hasSpendWiseLinks, hasAllocationsToVoucherId } from "@/lib/payment-allocation-utils";
import { useAuth } from "@/hooks/useAuth";
import { approveVoucherWithHistory } from "@/lib/voucherActionsClient";
import { getEffectiveHistorySettings } from "@/lib/voucherHistoryUtils";
import { isLocalOnlyMode } from "@/lib/localMode";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { VoucherAttachmentFallbackContext } from "@/contexts/VoucherAttachmentFallbackContext";
import { writeSelectedCompanyId } from "@/lib/selectedCompanyStorage";

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

/**
 * `liveVoucher` Firestore snapshot kabhi `fileUrls` omit / [] bhejta hai (sync lag, partial hydrate).
 * Daybook / Recent row `useVouchers` mirror se poore refs rakhta hai — replace se `local:` / https links gayab ho kar
 * APK pe "Attachment file not found" deta tha; Party jaisi jagah timing se kabhi bachta tha.
 */
function mergeAttachmentFieldsFromRowForEffectiveVoucher(live: any, row: any): any {
  if (!live) return live;
  const out = { ...live };
  const liveUrls = Array.isArray(live.fileUrls) ? live.fileUrls.filter(Boolean) : [];
  const rowUrls = Array.isArray(row?.fileUrls) ? row.fileUrls.filter(Boolean) : [];
  if (liveUrls.length === 0 && rowUrls.length > 0) {
    out.fileUrls = rowUrls;
  }
  const liveUn = live.unassignedFile?.url;
  const rowUn = row?.unassignedFile?.url;
  if (!liveUn && rowUn) {
    out.unassignedFile = row.unassignedFile;
  }
  return out;
}

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
  onEffectiveLinksChange,
  /** Tab switch: clear dialog-level link state so Contra/Journal/etc. don’t inherit stale `deleteDisabledWhenLinked` from Payment In/Out. */
  onClearEffectiveLinksOnTabChange,
  /** Compare-before-sync: journal account lists isi company se (`CreateJournalForm`). */
  ledgerScopeCompanyId,
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
  /** Sale/Purchase/Payment Out/Direct Expense: report effective has-links so dialog locks fields as soon as user links (or enables after unlink). */
  onEffectiveLinksChange?: (hasLinks: boolean | undefined) => void,
  onClearEffectiveLinksOnTabChange?: () => void,
  ledgerScopeCompanyId?: string,
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

  // Har tab change par parent ka `effectiveHasLinksFromForm` reset — warna Payment form ne `true` bheja ho to Contra/Salary attach band rehta hai.
  useEffect(() => {
    onClearEffectiveLinksOnTabChange?.();
  }, [activeTab, onClearEffectiveLinksOnTabChange]);

  const initialVoucherData = useMemo(() => {
    if (isEditing) return { ...voucher };

    // nayi txn: defaultVoucherData me `id` ho to spread se “edit” ban jata — savedVoucherId galat + attach band
    const rawDefault = defaultVoucherData || {};
    const { id: _droppedNewId, ...restDefault } = rawDefault as Record<string, unknown>;

    return {
      date: startOfDay(new Date()),
      voucherNumber: "",
      narration: "",
      partyId: "",
      accountId: "",
      amount: "",
      total: 0,
      fileUrls: defaultVoucherData?.fileUrls || (defaultVoucherData?.unassignedFile ? [defaultVoucherData.unassignedFile.url] : []),
      unassignedFile: defaultVoucherData?.unassignedFile || null,
      ...restDefault,
      id: undefined as undefined,
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
      {/* Mobile: vertical padding ta voucher-type Select blue header / niche border se chipke na — chhota trigger = clear box */}
      <div
        className={cn(
          "border-b bg-muted/20",
          isMobile ? "px-3 py-2.5" : "px-[2px] md:px-6"
        )}
      >
        {isMobile ? (
          <Select value={activeTab} onValueChange={(v) => setActiveTab(v as VoucherType)}>
            <SelectTrigger className="h-9 w-full max-w-[13rem] border-border/90 bg-background text-sm shadow-sm">
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
              onEffectiveLinksChange={activeTab === 'sale' || activeTab === 'purchase' || activeTab === 'payment_in' || activeTab === 'direct_income' || activeTab === 'payment_out' || activeTab === 'direct_expense' || activeTab === 'add_salary' ? onEffectiveLinksChange : undefined}
              initialFocusSide={activeTab === 'journal' ? (initialVoucherData as any)?._journalFocusSide : undefined}
              {...(activeTab === "journal" && ledgerScopeCompanyId ? { ledgerScopeCompanyId } : {})}
            />
          ) : null}
        </Suspense>
      </div>
    </div>
  );
}

// Default open size only: max 15" width, 12" height; small screens 90vw × 80vh. Resize is unlimited (no max).
const DEFAULT_MAX_W_PX = 15 * 96;  // 15in
const DEFAULT_MAX_H_PX = 12 * 96;  // 12in
const MIN_DIALOG_W = 420;
const MIN_DIALOG_H = 320;
const VOUCHER_DIALOG_STORAGE_KEY = "pl-voucher-dialog-bounds";

export function AddVoucherDialog(props: any) {
  /** Compare-before-sync jaisi jagah nested stack: `false` se parent non-modal Compare band hone par saath na band ho. */
  const { children, isOpen, onOpenChange, voucher, defaultVoucherData, dialogRootModal = true, editCompanyId, ...rest } = props;
  const { companyId: ctxCompanyId, setCompanyId, company: ctxCompany, effectiveNotificationSettings, allCompanies } =
    useCompany();
  /** Voucher jis company ka hai (Compare Side A/B) — header company se alag ho sakta hai. */
  const companyId = String(editCompanyId?.trim() || ctxCompanyId || "");
  const company = useMemo(() => {
    const eid = editCompanyId?.trim();
    if (eid) return allCompanies.find((c) => c.id === eid) ?? ctxCompany ?? null;
    return ctxCompany ?? null;
  }, [editCompanyId, allCompanies, ctxCompany]);
  const { user, customUser } = useAuth();
  const { can, canEditRecord } = usePermissions();
  const { vouchers } = useVouchers();
  const isMobile = useIsMobile();
  const isDesktop = !isMobile;
  const [historyVoucher, setHistoryVoucher] = useState<any>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [liveVoucher, setLiveVoucher] = useState<any>(null);
  const [editingDisabled, setEditingDisabled] = useState(false);
  /** Block edit rule: when voucher history is full and setting is "Block edit", disable Save. */
  const [historyBlocksEdit, setHistoryBlocksEdit] = useState(false);
  /** When sale/purchase form has pending link changes (e.g. user unlinked in dialog), form reports effective state so we enable edit locally. */
  const [effectiveHasLinksFromForm, setEffectiveHasLinksFromForm] = useState<boolean | null>(null);

  /** VoucherDialogContent tab switch par call — stale link flags hatao (file upload dubara chale). */
  const clearEffectiveLinksOnTabChange = useCallback(() => {
    setEffectiveHasLinksFromForm(null);
  }, []);

  // Draggable & resizable (desktop only)
  const [dialogPosition, setDialogPosition] = useState({ x: 0, y: 0 });
  const [dialogSize, setDialogSize] = useState({ w: DEFAULT_MAX_W_PX, h: DEFAULT_MAX_H_PX });
  const dragRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);
  const resizeRef = useRef<{ handle: string; startX: number; startY: number; startW: number; startH: number; startLeft: number; startTop: number } | null>(null);

  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (!isOpen) setEffectiveHasLinksFromForm(null);
  }, [isOpen, voucher?.id]);
  // Default open (both Add New & Edit): max 15"×12"; small screen 90vw×80vh. Restore saved size for Edit only (unlimited); New always default.
  useEffect(() => {
    if (!isOpen || !isDesktop || typeof window === "undefined") return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isNew = !voucher?.id;
    if (!isNew) {
      try {
        const raw = localStorage.getItem(VOUCHER_DIALOG_STORAGE_KEY);
        const saved = raw ? JSON.parse(raw) : null;
        if (saved && typeof saved.x === "number" && typeof saved.y === "number" && typeof saved.w === "number" && typeof saved.h === "number") {
          const w = Math.max(MIN_DIALOG_W, Math.min(saved.w, vw));
          const h = Math.max(MIN_DIALOG_H, Math.min(saved.h, vh));
          const x = Math.max(0, Math.min(saved.x, vw - w));
          const y = Math.max(0, Math.min(saved.y, vh - h));
          setDialogSize({ w, h });
          setDialogPosition({ x, y });
          return;
        }
      } catch {
        /* ignore */
      }
    }
    const maxW = Math.min(DEFAULT_MAX_W_PX, vw * 0.9);
    const maxH = Math.min(DEFAULT_MAX_H_PX, vh * 0.8);
    const w = Math.max(MIN_DIALOG_W, Math.min(maxW, vw));
    const h = Math.max(MIN_DIALOG_H, Math.min(maxH, vh));
    setDialogSize({ w, h });
    setDialogPosition({ x: (vw - w) / 2, y: (vh - h) / 2 });
  }, [isOpen, isDesktop, voucher?.id]);

  useEffect(() => {
    if (prevOpenRef.current && !isOpen && isDesktop && typeof window !== "undefined") {
      try {
        localStorage.setItem(
          VOUCHER_DIALOG_STORAGE_KEY,
          JSON.stringify({ x: dialogPosition.x, y: dialogPosition.y, w: dialogSize.w, h: dialogSize.h })
        );
      } catch {
        /* ignore */
      }
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, isDesktop, dialogPosition.x, dialogPosition.y, dialogSize.w, dialogSize.h]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (!isDesktop || (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startLeft: dialogPosition.x, startTop: dialogPosition.y };
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      setDialogPosition({
        x: Math.max(0, dragRef.current.startLeft + e.clientX - dragRef.current.startX),
        y: Math.max(0, dragRef.current.startTop + e.clientY - dragRef.current.startY),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [isDesktop, dialogPosition.x, dialogPosition.y]);

  const handleResizeStart = useCallback((e: React.MouseEvent, handle: string) => {
    if (!isDesktop) return;
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startW: dialogSize.w,
      startH: dialogSize.h,
      startLeft: dialogPosition.x,
      startTop: dialogPosition.y,
    };
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const { handle: h, startX, startY, startW, startH, startLeft, startTop } = resizeRef.current;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let w = startW;
      let hh = startH;
      if (h === "e" || h === "se" || h === "ne") w = Math.max(MIN_DIALOG_W, Math.min(startW + dx, vw));
      if (h === "w" || h === "sw" || h === "nw") {
        const dw = Math.min(dx, startW - MIN_DIALOG_W);
        w = Math.max(MIN_DIALOG_W, Math.min(startW - dw, vw));
      }
      if (h === "s" || h === "se" || h === "sw") hh = Math.max(MIN_DIALOG_H, Math.min(startH + dy, vh));
      if (h === "n" || h === "nw" || h === "ne") {
        const dh = Math.min(dy, startH - MIN_DIALOG_H);
        hh = Math.max(MIN_DIALOG_H, Math.min(startH - dh, vh));
      }
      setDialogSize({ w, h: hh });
      const posUpdate: { x?: number; y?: number } = {};
      if (h === "w" || h === "sw" || h === "nw") posUpdate.x = startLeft + (startW - w);
      if (h === "n" || h === "nw" || h === "ne") posUpdate.y = startTop + (startH - hh);
      if (Object.keys(posUpdate).length) setDialogPosition((prev) => ({ ...prev, ...posUpdate }));
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [isDesktop, dialogSize.w, dialogSize.h, dialogPosition.x, dialogPosition.y]);

  // When editing, subscribe to voucher doc so unlink/allocations updates enable Save & convert
  useEffect(() => {
    if (!isOpen || !voucher?.id || !companyId) {
      setLiveVoucher(null);
      return;
    }
    if (isLocalOnlyMode()) {
      // Compare Side B: voucher dusri company ka — context `vouchers` me nahi; SQLite se same company id.
      if (editCompanyId?.trim() && editCompanyId.trim() !== ctxCompanyId) {
        void listCompanyDocsFromBrowserDb(editCompanyId.trim(), "vouchers").then((rows) => {
          const localLive = rows.find((v: any) => v.id === voucher.id) || null;
          setLiveVoucher(localLive);
        });
        return;
      }
      const localLive = (vouchers || []).find((v: any) => v.id === voucher.id) || null;
      setLiveVoucher(localLive);
      return;
    }
    // Note vouchers: sale/journal jaisi live allocation sync nahi; snapshot har chhoti update par form reset trigger ho sakta tha
    if (voucher?.type === "note") {
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
  }, [isOpen, voucher?.id, companyId, voucher?.type, editCompanyId, ctxCompanyId, vouchers]);

  // Preserve clicked contra leg + attachments from table row when live doc has not synced fileUrls yet.
  const effectiveVoucher = liveVoucher
    ? mergeAttachmentFieldsFromRowForEffectiveVoucher(
        { ...liveVoucher, _contraLeg: (voucher as any)?._contraLeg ?? (liveVoucher as any)?._contraLeg },
        voucher
      )
    : voucher;
  // Bill-wise: voucher's own allocations/linked refs, OR (sale/purchase) any payment has allocations to this voucher
  const hasBillWiseLinks =
    !!effectiveVoucher?.id &&
    (hasPaymentLinks(effectiveVoucher) ||
      ((effectiveVoucher.type === "sale" || effectiveVoucher.type === "purchase") &&
        hasAllocationsToVoucherId(effectiveVoucher.id, vouchers || [])));
  const hasSpendWise = !!effectiveVoucher?.id && hasSpendWiseLinks(effectiveVoucher, vouchers || []);
  /** Use form-reported effective state when set (local unlink); else server-based hasLinks so banner/fields follow local changes. */
  const hasLinks = effectiveHasLinksFromForm ?? (hasBillWiseLinks || hasSpendWise);
  /**
   * Sirf saved voucher par dialog “edit lock” bhejo — nayi txn par local link/add se `onEffectiveLinksChange(true)` aata hai
   * aur pehle poor file input `deleteDisabledWhenLinked` se band ho jata tha (Add File kaam nahi karta).
   * Form ke andar amount/wagaira ab bhi local `allocations` se band rehte hain.
   */
  const isEditLockedByLinks = !!effectiveVoucher?.id && hasLinks;

  // Permission-based: disable edit when user cannot edit this voucher (role + ownership)
  useEffect(() => {
    if (!effectiveVoucher?.id) {
      setEditingDisabled(false);
      return;
    }
    const fetchVoucher = async (cid: string, vid: string) => {
      if (isLocalOnlyMode()) {
        if (cid && cid !== ctxCompanyId) {
          const rows = await listCompanyDocsFromBrowserDb(cid, "vouchers");
          return rows.find((v: any) => v.id === vid) || null;
        }
        const localMatch = (vouchers || []).find((v: any) => v.id === vid);
        return localMatch || null;
      }
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
  }, [effectiveVoucher?.id, effectiveVoucher?.isApproved, companyId, user?.uid, vouchers, canEditRecord, ctxCompanyId]);

  // Block edit rule: when history full + setting "Block edit", disable Save (user must clear history first)
  // Re-run when company changes so live voucher settings (from Settings) apply immediately
  useEffect(() => {
    if (!companyId || !effectiveVoucher?.id) {
      setHistoryBlocksEdit(false);
      return;
    }
    let cancelled = false;
    getEffectiveHistorySettings(companyId).then(({ enabled, limit, fullBehavior }) => {
      if (cancelled) return;
      const existingHistory = Array.isArray(effectiveVoucher?.history) ? effectiveVoucher.history : [];
      const blocks = enabled && fullBehavior === 'block_edit' && existingHistory.length >= limit;
      setHistoryBlocksEdit(blocks);
    });
    return () => { cancelled = true; };
  }, [companyId, effectiveVoucher?.id, effectiveVoucher?.history, company?.voucherHistoryFullBehavior, company?.voucherHistoryEnabled, company?.voucherHistoryLimit]);

  // Show Approve / Save & Approve for any existing voucher if user can approve (approved voucher: enable when form has changes)
  const showApproveButton =
    !!effectiveVoucher?.id &&
    can("approve_transactions");

  const showSaveAndApproveOnCreate =
    !effectiveVoucher?.id &&
    can("approve_transactions") &&
    effectiveNotificationSettings?.approve?.on !== false;

  const handleApprove = useCallback(async () => {
    const cid = String(editCompanyId?.trim() || ctxCompanyId || "");
    if (!cid || !effectiveVoucher?.id || isApproving || !user?.uid) return;
    setIsApproving(true);
    try {
      const approverName = customUser?.displayName || user?.displayName || user?.email || user.uid;
      await approveVoucherWithHistory(cid, effectiveVoucher.id, user.uid, approverName);
      // Static APK: async approve + outbox flush ke dauran companyId kabhi brief null → /company redirect; restore turant
      try {
        if (typeof window !== "undefined") writeSelectedCompanyId(cid);
      } catch {
        /* ignore */
      }
      setCompanyId(cid);
      toast.success("Transaction approved.");
      props.onVoucherAction?.("saved");
      onOpenChange?.(false);
    } catch (e) {
      toast.error("Failed to approve transaction.");
    } finally {
      setIsApproving(false);
    }
  }, [
    editCompanyId,
    ctxCompanyId,
    effectiveVoucher?.id,
    isApproving,
    user?.uid,
    user?.displayName,
    user?.email,
    customUser?.displayName,
    setCompanyId,
    props.onVoucherAction,
    onOpenChange,
  ]);

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
        if (!isLocalOnlyMode()) {
          const fileDocRef = doc(firestore, `companies/${companyId}/unassigned_documents`, defaultVoucherData.unassignedFile.id);
          await deleteDoc(fileDocRef);
        }
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

  // Mobile: header padding + title + banners jitna chhota ho sake (zyada form space); desktop: purana drag header.
  const headerBlock = (
    <DialogHeader
      className={cn(
        "border-b bg-[#b8c8f5] dark:bg-[#7a8ed8] text-gray-900 dark:text-white flex flex-col justify-center shrink-0",
        isDesktop
          ? cn("px-[2px] py-6 pb-2 md:p-6 md:pb-2 cursor-grab active:cursor-grabbing select-none", (isEditLockedByLinks || historyBlocksEdit) && "min-h-[140px]")
          : "px-2 py-1.5 pb-1.5 gap-1"
      )}
      onMouseDown={isDesktop ? handleDragStart : undefined}
    >
      <div className={cn("flex items-start justify-between gap-2", isDesktop && "gap-4")}>
        <div className={cn(!isDesktop && "min-w-0 pr-8")}>
          <DialogTitle className={cn("font-bold font-headline text-inherit", isDesktop ? "text-2xl" : "text-base leading-tight")}>
            {!!voucher?.id ? "Edit Transaction" : "New Transaction"}
          </DialogTitle>
        </div>
        {isDesktop && (
          <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none shrink-0">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        )}
      </div>
      {/* Saved + linked: warn; New Transaction par local links se yeh banner nahin (misleading). */}
      {isEditLockedByLinks && (
        <div
          className={cn(
            "w-full max-w-full mx-auto bg-gray-600 rounded-md flex items-center justify-center self-center",
            isDesktop ? "mt-3 min-h-[52px] px-4 py-3 w-fit" : "mt-1 px-2 py-1"
          )}
        >
          <p className={cn("font-semibold text-center text-[#ff0000] m-0", isDesktop ? "text-base md:text-xl" : "text-[11px] leading-snug")}>
            Voucher Edit disabled — To convert or edit, unlink linked transactions first.
          </p>
        </div>
      )}
      {/* Block edit rule: when history full + setting "Block edit", show message and disable Save */}
      {historyBlocksEdit && !isEditLockedByLinks && (
        <div
          className={cn(
            "w-full max-w-full mx-auto bg-amber-600 rounded-md flex items-center justify-center self-center",
            isDesktop ? "mt-3 min-h-[52px] px-4 py-3 w-fit" : "mt-1 px-2 py-1"
          )}
        >
          <p className={cn("font-semibold text-center text-white m-0", isDesktop ? "text-base md:text-xl" : "text-[11px] leading-snug")}>
            Voucher history is full. Clear history in History dialog to edit and save changes.
          </p>
        </div>
      )}
    </DialogHeader>
  );

  const voucherAttachmentFallbackValue =
    companyId && effectiveVoucher?.id ? { companyId, voucherId: String(effectiveVoucher.id) } : null;

  const bodyBlock = (
    <VoucherAttachmentFallbackContext.Provider value={voucherAttachmentFallbackValue}>
      <>
        <VoucherDialogContent
          {...rest}
          ledgerScopeCompanyId={editCompanyId}
          voucher={effectiveVoucher}
          defaultVoucherData={defaultVoucherData}
          onVoucherAction={handleAction}
          onOpenHistory={effectiveVoucher?.id && can("view_voucher_history") ? () => setHistoryVoucher(effectiveVoucher) : undefined}
          showHistoryButton={!!effectiveVoucher?.id && can("view_voucher_history")}
          editingDisabled={editingDisabled || historyBlocksEdit}
          restrictConvertWhenLinked={hasLinks}
          deleteDisabledWhenLinked={isEditLockedByLinks}
          showApproveButton={showApproveButton}
          showSaveAndApproveOnCreate={showSaveAndApproveOnCreate}
          onApprove={handleApprove}
          isApproving={isApproving}
          onEffectiveLinksChange={(v) => setEffectiveHasLinksFromForm(v === undefined ? null : v)}
          onClearEffectiveLinksOnTabChange={clearEffectiveLinksOnTabChange}
        />
        <HistoryDialog
          voucher={historyVoucher}
          isOpen={!!historyVoucher}
          onOpenChange={(open) => !open && setHistoryVoucher(null)}
          onHistoryReset={() => setHistoryVoucher((prev: any) => (prev ? { ...prev, history: [] } : null))}
        />
      </>
    </VoucherAttachmentFallbackContext.Provider>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange} modal={dialogRootModal}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      {isDesktop ? (
        <DialogContent
          hideCloseButton
          className="flex flex-col p-0 md:!left-0 md:!top-0 md:!translate-x-0 md:!translate-y-0 md:w-full md:h-full md:max-w-none md:max-h-none md:border-0 md:bg-transparent md:shadow-none md:rounded-none"
        >
          <div
            className="flex flex-col rounded-lg border bg-background shadow-lg overflow-hidden flex-1 min-h-0"
            style={{
              position: "fixed",
              left: dialogPosition.x,
              top: dialogPosition.y,
              width: dialogSize.w,
              height: dialogSize.h,
              minWidth: MIN_DIALOG_W,
              minHeight: MIN_DIALOG_H,
            }}
          >
            {headerBlock}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {bodyBlock}
            </div>
            {/* Resize handle - top edge */}
            <div
              className="absolute left-0 right-0 top-0 h-1.5 cursor-row-resize hover:bg-primary/20 transition-colors rounded-t"
              onMouseDown={(e) => handleResizeStart(e, "n")}
              aria-hidden
            />
            {/* Resize handle - top-left corner */}
            <div
              className="absolute left-0 top-0 w-4 h-4 cursor-nw-resize hover:bg-primary/20 transition-colors rounded-tl"
              onMouseDown={(e) => handleResizeStart(e, "nw")}
              aria-hidden
            />
            {/* Resize handle - top-right corner */}
            <div
              className="absolute right-0 top-0 w-4 h-4 cursor-ne-resize hover:bg-primary/20 transition-colors rounded-tr"
              onMouseDown={(e) => handleResizeStart(e, "ne")}
              aria-hidden
            />
            {/* Resize handle - left edge */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/20 transition-colors rounded-l"
              onMouseDown={(e) => handleResizeStart(e, "w")}
              aria-hidden
            />
            {/* Resize handle - right edge */}
            <div
              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/20 transition-colors rounded-r"
              style={{ top: 0, bottom: 0 }}
              onMouseDown={(e) => handleResizeStart(e, "e")}
              aria-hidden
            />
            {/* Resize handle - bottom edge */}
            <div
              className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize hover:bg-primary/20 transition-colors rounded-b"
              onMouseDown={(e) => handleResizeStart(e, "s")}
              aria-hidden
            />
            {/* Resize handle - bottom-left corner */}
            <div
              className="absolute left-0 bottom-0 w-4 h-4 cursor-sw-resize hover:bg-primary/20 transition-colors rounded-bl"
              onMouseDown={(e) => handleResizeStart(e, "sw")}
              aria-hidden
            />
            {/* Resize handle - bottom-right corner */}
            <div
              className="absolute right-0 bottom-0 w-4 h-4 cursor-se-resize hover:bg-primary/20 transition-colors rounded-br"
              onMouseDown={(e) => handleResizeStart(e, "se")}
              aria-hidden
            />
          </div>
        </DialogContent>
      ) : (
        // Mobile: full viewport — PWA, mobile browser aur static/Capacitor APK sab par yahi layout; safe-area env() 0 ho to asar nahi.
        <DialogContent
          className={cn(
            "flex min-h-0 flex-col overflow-hidden p-0 !gap-0",
            "box-border h-[100dvh] max-h-[100dvh] w-full max-w-none !left-0 !top-0 !translate-x-0 !translate-y-0 rounded-none border-0 shadow-lg",
            "pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
          )}
        >
          {headerBlock}
          {/* Header fixed feel: form area scroll; min-h-0 ta flex child shrink ho sake */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">{bodyBlock}</div>
        </DialogContent>
      )}
    </Dialog>
  );
}