"use client";

/**
 * Inter-company voucher � ribbon: Voucher | Invite | Join; linked save on both companies.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useForm, type Control, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarIcon, ArrowLeftRight } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Calendar } from "@/components/ui/calendar";
import BsDatePicker from "@/components/ui/BsDatePicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useDate } from "@/hooks/useDate";
import usePermissions from "@/hooks/usePermissions";
import {
  assertCan,
  assertCanEdit,
  assertCanPerformBackdated,
  determineVoucherOwnership,
  PermissionDeniedError,
} from "@/lib/permissions/enforcePermission";
import { toast } from "sonner";
import { formatVoucherNumber, parseVoucherNumberPart } from "@/lib/voucherNumberFormat";
import {
  deleteInterCompanyVoucherPair,
  patchInterCompanyShareAttachmentsWithPeer,
  saveInterCompanyVoucherPair,
} from "@/lib/interCompany/saveInterCompanyVoucherPair";
import { approveVoucherWithHistory, patchVoucherFields } from "@/lib/voucherActionsClient";
import { buildSourceInterCompanyLegsApproved } from "@/lib/interCompany/interCompanyPostingLegs";
import {
  inferInterCompanyEntity,
  readInterCompanyBankLabelSnapshot,
  readInterCompanyCompanyBankId,
  readInterCompanyEntityLabelSnapshot,
  readInterCompanyLink,
  resolveInterCompanyBankIdsForEdit,
  resolveInterCompanyEditCompanyIds,
  interCompanyVoucherViewerSide,
  isInterCompanyVoucherEditDeleteBlocked,
} from "@/lib/interCompany/interCompanyVoucherHydrate";
import { fetchInterCompanyBankEntityDetail } from "@/lib/interCompany/fetchInterCompanyEntities";
import { getNextInterCompanyVoucherNumber } from "@/lib/interCompany/nextInterCompanyVoucherNumber";
import type { InterCompanyEntityDetail } from "@/lib/interCompany/interCompanyEntityTypes";
import { openPrintDirect } from "@/lib/printDirect";
import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";
import { useInterCompanyEntities } from "@/components/inter-company/useInterCompanyEntities";
import { readCompanyInterCompanyAcNo } from "@/lib/interCompany/interCompanyAccountNo";
import {
  ensureCompanyInterCompanyCode,
  readCompanyInterCompanyCode,
} from "@/lib/interCompany/interCompanyCompanyCode";
import { normalizeInterCompanyPhone } from "@/lib/interCompany/interCompanyPhone";
import { useInterCompanyJoinedTargetPartners } from "@/lib/interCompany/useInterCompanyJoinedTargetPartners";
import { subscribeInterCompanyJoinSettings } from "@/lib/interCompany/interCompanyJoinSettingsSync";
import { ensureCompanyInterCompanyAcNo } from "@/lib/interCompany/ensureCompanyInterCompanyAcNo";
import {
  interCompanyDateButtonClass,
  interCompanyDateFieldColClass,
  interCompanyDateFieldSizingClass,
  interCompanyVoucherHeaderFieldColClass,
  interCompanyVoucherHeaderLabelClass,
  interCompanyInputClass,
  interCompanyVoucherNumberInputSizingClass,
  interCompanyNarrationCardClass,
  interCompanyNarrationTextareaInCardClass,
  interCompanyPageHeaderClass,
  interCompanyPanelClass,
  interCompanyPanelScrollInnerClass,
  interCompanyPanelScrollOuterClass,
  interCompanyVoucherScrollAreaClass,
  interCompanyVoucherTabShellClass,
  interCompanyReadOnlyCopyInputClass,
} from "@/lib/interCompany/interCompanyVoucherChrome";
import { InterCompanyVoucherAttachments } from "@/components/inter-company/InterCompanyVoucherAttachments";
import { InterCompanyAmountDualFields } from "@/components/inter-company/InterCompanyAmountDualFields";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { checkStorageLimit, incrementCompanyStorage } from "@/lib/storageUsageClient";
import {
  appendLocalOnlyVoucherFilesToUrls,
  shouldDeferStorageIncrementUntilPendingUpload,
  shouldStageNewVoucherFilesAsLocalPending,
} from "@/lib/voucherLocalAttachmentUpload";
import {
  readInterCompanyLocalSettings,
} from "@/lib/interCompany/interCompanyLocalStore";
import { readInterCompanyPartnerPrivacy } from "@/lib/interCompany/interCompanyPartnerPrivacy";
import { InterCompanyTargetConnectSection } from "@/components/inter-company/InterCompanyTargetConnectSection";
import { InterCompanySourcePaySection } from "@/components/inter-company/InterCompanySourcePaySection";
import { InterCompanyVoucherIdentityStrip } from "@/components/inter-company/InterCompanyVoucherIdentityStrip";
import { useStickyInterCompanyCompanyCode } from "@/components/inter-company/useStickyInterCompanyCompanyCode";
import {
  InterCompanyRibbonNav,
  type InterCompanyRibbonTab,
} from "@/components/inter-company/InterCompanyRibbonNav";
import { InterCompanyJoinSettingsPanel } from "@/components/inter-company/InterCompanyJoinSettingsPanel";
import { InterCompanyVoucherFooter } from "@/components/inter-company/InterCompanyVoucherFooter";
import { InterCompanyRequestReverseDialog } from "@/components/inter-company/InterCompanyRequestReverseDialog";
import { InterCompanyReverseRequestsPanel } from "@/components/inter-company/InterCompanyReverseRequestsPanel";
import { InterCompanyRequestDeleteDialog } from "@/components/inter-company/InterCompanyRequestDeleteDialog";
import { InterCompanyDeleteRequestsPanel } from "@/components/inter-company/InterCompanyDeleteRequestsPanel";
import { readEntityAcNoField } from "@/lib/interCompany/interCompanyEntityLookup";
import {
  countPendingDeleteInbox,
  cancelInterCompanyDeleteRequest,
  findPendingDeleteInboxForVoucher,
  findPendingDeleteOutboxForLinkedVoucher,
  IC_DELETE_REQUESTS_CHANGED,
  isLinkedVoucherDeletePendingOrDone,
  updateInterCompanyDeleteRequestStatus,
  type InterCompanyDeleteRequest,
} from "@/lib/interCompany/interCompanyDeleteRequests";
import { applyInterCompanyDeleteAccept } from "@/lib/interCompany/applyInterCompanyDeleteAccept";
import {
  countPendingReverseInbox,
  IC_REVERSE_REQUESTS_CHANGED,
  isSourceVoucherReversePendingOrDone,
} from "@/lib/interCompany/interCompanyReverseRequests";
import {
  subscribeAcceptedSystemJoinLinksForRequester,
} from "@/lib/interCompany/interCompanySystemJoinRequest";
import { usePendingInterCompanySystemJoinCount } from "@/lib/interCompany/usePendingInterCompanySystemJoinCount";

const interCompanySchema = z.object({
  voucherNumber: z.string().min(1, "Voucher number required"),
  date: z.date({ message: "Date required" }),
  targetCompanyId: z.string().min(1, "Select target company"),
  amount: z.coerce.number().min(0.01, "Amount must be positive"),
  narration: z.string().optional(),
});

type InterCompanyFormValues = z.infer<typeof interCompanySchema>;

/** Edit par entity list me missing row � save-time label snapshot se card/combobox bhare */
function mergeHydratedEntity(
  entities: InterCompanyEntityDetail[],
  kind: InterCompanyEntityKind,
  id: string,
  voucher: Record<string, unknown> | null | undefined,
  side: "source" | "target"
): InterCompanyEntityDetail[] {
  if (!id) return entities;
  if (entities.some((e) => e.kind === kind && e.id === id)) return entities;
  const label = readInterCompanyEntityLabelSnapshot(voucher, side) || id;
  return [...entities, { id, kind, label }];
}

/** Company bank combobox — id list me na ho to bhi naam/A/c fields bharen */
function mergeHydratedBankEntity(
  entities: InterCompanyEntityDetail[],
  bankId: string,
  voucher: Record<string, unknown> | null | undefined,
  side: "source" | "target",
  extra?: InterCompanyEntityDetail | null
): InterCompanyEntityDetail[] {
  const id = String(bankId || "").trim();
  if (!id) return entities;
  if (entities.some((e) => e.kind === "bank" && e.id === id)) return entities;
  if (extra && extra.id === id) return [...entities, extra];
  const label = readInterCompanyBankLabelSnapshot(voucher, side) || "Bank / Cash account";
  return [...entities, { id, kind: "bank", label }];
}

/** Source/target card � ek horizontal scroll; poora panel content saath move */
function InterCompanyPanelScroll({ children }: { children: ReactNode }) {
  return (
    <div className={interCompanyPanelScrollOuterClass}>
      <div className={interCompanyPanelScrollInnerClass}>{children}</div>
    </div>
  );
}

/** Target card ke upar — BS/AD date; AD trigger BsDatePicker jaisa sky style */
function InterCompanyDateFieldsHeader({
  showBsDate,
  showAdDate,
  dateSystem,
  value,
  onChange,
  fieldsDisabled,
  viewOnlyAllowCopy,
  isCalendarOpen,
  setIsCalendarOpen,
  formatDate,
  formatDateBS,
}: {
  showBsDate: boolean;
  showAdDate: boolean;
  dateSystem: string;
  value: Date;
  onChange: (d: Date) => void;
  fieldsDisabled: boolean;
  /** Edit lock — date pickers ki jagah readOnly text (copy) */
  viewOnlyAllowCopy?: boolean;
  isCalendarOpen: boolean;
  setIsCalendarOpen: (open: boolean) => void;
  formatDate: (d: Date) => string;
  formatDateBS: (d: Date) => string;
}) {
  if (!showBsDate && !showAdDate) return null;

  return (
    <div className="flex flex-wrap items-start gap-3">
      {showBsDate ? (
        <FormItem className={interCompanyVoucherHeaderFieldColClass}>
          <FormLabel className={interCompanyVoucherHeaderLabelClass}>
            {dateSystem === "Both" ? "Date (BS)" : "Date"}
          </FormLabel>
          <FormControl>
            {viewOnlyAllowCopy ? (
              <Input
                readOnly
                value={formatDateBS(value)}
                className={cn(interCompanyDateButtonClass, interCompanyReadOnlyCopyInputClass)}
              />
            ) : (
              <BsDatePicker
                valueAD={value}
                onChangeAD={(d) => {
                  if (d) d.setHours(12, 0, 0, 0);
                  onChange(d as Date);
                  setIsCalendarOpen(false);
                }}
                isRange={false}
                className={interCompanyDateButtonClass}
                disabled={fieldsDisabled}
              />
            )}
          </FormControl>
        </FormItem>
      ) : null}
      {showAdDate ? (
        <FormItem className={interCompanyVoucherHeaderFieldColClass}>
          <FormLabel className={interCompanyVoucherHeaderLabelClass}>
            {dateSystem === "Both" ? "Date (AD)" : "Date"}
          </FormLabel>
          <FormControl>
            {viewOnlyAllowCopy ? (
              <Input
                readOnly
                value={formatDate(value)}
                className={cn(interCompanyDateButtonClass, interCompanyReadOnlyCopyInputClass)}
              />
            ) : (
              <Popover modal open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={fieldsDisabled}
                    data-theme-detail="date-range"
                    className={cn(interCompanyDateButtonClass, !value && "text-black/45")}
                    onClick={() => setIsCalendarOpen(true)}
                  >
                    <CalendarIcon className="h-4 w-4 shrink-0 opacity-50" />
                    <span className="min-w-0 truncate">
                      {value ? formatDate(value) : "Pick a date"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="z-[102] w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={value}
                    onSelect={(date) => {
                      if (date) date.setHours(12, 0, 0, 0);
                      onChange(date);
                      setIsCalendarOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            )}
          </FormControl>
        </FormItem>
      ) : null}
    </div>
  );
}

function TwoColumnEntityGrid({
  leftHeader,
  rightHeader,
  targetCompanyField,
  sourcePanel,
}: {
  leftHeader?: ReactNode;
  rightHeader?: ReactNode;
  targetCompanyField: ReactNode;
  sourcePanel: ReactNode;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
      <div className="flex min-h-0 flex-col gap-3">
        {leftHeader}
        <div className={cn(interCompanyPanelClass, "min-h-0 flex-1")}>
          <InterCompanyPanelScroll>{sourcePanel}</InterCompanyPanelScroll>
        </div>
      </div>
      <div className="flex min-h-0 flex-col gap-3">
        {rightHeader}
        <div className={cn(interCompanyPanelClass, "min-h-0 flex-1")}>
          <InterCompanyPanelScroll>{targetCompanyField}</InterCompanyPanelScroll>
        </div>
      </div>
    </div>
  );
}

export type InterCompanyVoucherFormProps = {
  inDialog?: boolean;
  onVoucherAction?: (status: "saved" | "cancelled", isSaveAndNew?: boolean, newId?: string) => void;
  onOpenHistory?: () => void;
  showHistoryButton?: boolean;
  editingDisabled?: boolean;
  deleteDisabledWhenLinked?: boolean;
  showApproveButton?: boolean;
  showSaveAndApproveOnCreate?: boolean;
  onApprove?: () => void;
  isApproving?: boolean;
  voucher?: Record<string, unknown> | null;
  defaultVoucherData?: Record<string, unknown> | null;
  /** Join / Invite ribbon — dialog footer Copy To hide ke liye */
  onRibbonTabChange?: (tab: import("@/components/inter-company/InterCompanyRibbonNav").InterCompanyRibbonTab) => void;
  /** Alerts deep link — `/inter-company?icTab=join` se Join ribbon khule */
  initialRibbonTab?: InterCompanyRibbonTab;
};

export function InterCompanyVoucherForm({
  inDialog = false,
  onVoucherAction,
  onOpenHistory,
  showHistoryButton = false,
  editingDisabled = false,
  deleteDisabledWhenLinked = false,
  showApproveButton = false,
  showSaveAndApproveOnCreate = false,
  onApprove,
  isApproving = false,
  voucher,
  defaultVoucherData,
  onRibbonTabChange,
  initialRibbonTab,
}: InterCompanyVoucherFormProps) {
  const { user, customUser } = useAuth();
  const { can, canEditRecord, canPerformBackdatedAction, fileAttachmentLimits, allowAttachments, role } =
    usePermissions();
  const { company, companyId, allCompanies } = useCompany();
  const { formatDate, formatDateBS, formatCurrency, formatCurrencyForPrint, dateSystem } = useDate();

  const [ribbonTab, setRibbonTab] = useState<InterCompanyRibbonTab>(initialRibbonTab ?? "voucher");

  useEffect(() => {
    onRibbonTabChange?.(ribbonTab);
  }, [ribbonTab, onRibbonTabChange]);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [sourcePayeeKind, setSourcePayeeKind] = useState<InterCompanyEntityKind>("party");
  const [sourcePayeeId, setSourcePayeeId] = useState("");
  const [targetPayeeKind, setTargetPayeeKind] = useState<InterCompanyEntityKind>("party");
  const [targetPayeeId, setTargetPayeeId] = useState("");
  /** Source/target company bank � entity account se alag (compound IC legs). */
  const [sourceCompanyBankId, setSourceCompanyBankId] = useState("");
  const [targetCompanyBankId, setTargetCompanyBankId] = useState("");
  /** Edit: bank id entities list me missing ho to Firestore row */
  const [hydratedSourceBankExtra, setHydratedSourceBankExtra] = useState<InterCompanyEntityDetail | null>(null);
  const [hydratedTargetBankExtra, setHydratedTargetBankExtra] = useState<InterCompanyEntityDetail | null>(null);
  const [icSettingsTick, setIcSettingsTick] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [savedSourceId, setSavedSourceId] = useState<string | null>(null);
  const [peerTargetVoucherId, setPeerTargetVoucherId] = useState<string | null>(null);
  /** Linked target copy — source approve tab tak approved? */
  const [peerVoucherRow, setPeerVoucherRow] = useState<Record<string, unknown> | null>(null);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [files, setFiles] = useState<(File | string)[]>([]);
  const [shareAttachmentsWithPeer, setShareAttachmentsWithPeer] = useState(false);
  const [savedShareAttachmentsWithPeer, setSavedShareAttachmentsWithPeer] = useState(false);
  const [reverseDialogOpen, setReverseDialogOpen] = useState(false);
  const [reverseTick, setReverseTick] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTick, setDeleteTick] = useState(0);
  const [voucherOverride, setVoucherOverride] = useState<Record<string, unknown> | null>(null);
  const lastHydratedVoucherIdRef = useRef<string | null>(null);
  /** Async next-no fetch � hydrate ke baad overwrite na ho */
  const voucherNumberFetchGenRef = useRef(0);
  const seed = (voucher || defaultVoucherData) as Record<string, unknown> | null | undefined;
  const displayVoucher = (voucherOverride ?? voucher) as Record<string, unknown> | null | undefined;

  useEffect(() => {
    setVoucherOverride(null);
  }, [voucher?.id]);

  const hasPersistedIc = !!(displayVoucher?.id || savedSourceId);
  const voucherRowForLock = (displayVoucher || seed) as Record<string, unknown> | null;
  // Target: hamesha read-only; source: sirf unapproved par edit/delete; source approve ke baad dono side lock
  const isInterCompanyEditLocked =
    hasPersistedIc && isInterCompanyVoucherEditDeleteBlocked(voucherRowForLock);
  const isCompanyAdmin =
    role === "owner" || customUser?.role === "CompanyAdmin" || customUser?.role === "SuperAdmin";
  const fieldsDisabled = editingDisabled || isInterCompanyEditLocked;

  const form = useForm<InterCompanyFormValues>({
    resolver: zodResolver(interCompanySchema) as import("react-hook-form").Resolver<InterCompanyFormValues>,
    defaultValues: {
      voucherNumber: String(seed?.voucherNumber || "IC-001"),
      date: seed?.date instanceof Date ? seed.date : new Date(),
      targetCompanyId: String(seed?.targetCompanyId || ""),
      amount: Number(seed?.amount || 0),
      narration: String(seed?.narration || ""),
    },
  });

  const targetCompanyId = form.watch("targetCompanyId");
  const { isDirty: isFormDirty } = form.formState;

  const isAutoVoucherEnabled = company?.autoVoucherNumbering?.inter_company ?? true;

  const fetchVoucherNumber = useCallback(async () => {
    if (!companyId || !company || !isAutoVoucherEnabled) return;
    if (displayVoucher?.id || savedSourceId || lastHydratedVoucherIdRef.current) return;
    const gen = ++voucherNumberFetchGenRef.current;
    try {
      const nextNo = await getNextInterCompanyVoucherNumber(companyId, company as Record<string, unknown>);
      if (gen !== voucherNumberFetchGenRef.current) return;
      form.setValue("voucherNumber", nextNo);
    } catch (err) {
      console.warn("[interCompany] voucher number fetch failed", err);
    }
  }, [company, companyId, form, isAutoVoucherEnabled, savedSourceId, displayVoucher?.id]);

  /** Attachments upload — save se pehle URL list + in-memory blobs peer copy ke liye */
  const resolveFileUrlsForSave = useCallback(
    async (
      existingVoucherId: string | null
    ): Promise<{ fileUrls: string[]; attachmentBlobByRef: Map<string, Blob> }> => {
      const attachmentBlobByRef = new Map<string, Blob>();
      if (!companyId || !allowAttachments) {
        return {
          fileUrls: files.filter((f): f is string => typeof f === "string"),
          attachmentBlobByRef,
        };
      }
      let fileUrls = files.filter((f): f is string => typeof f === "string");
      const newFiles = files.filter((f): f is File => f instanceof File);
      if (newFiles.length === 0) return { fileUrls, attachmentBlobByRef };

      const totalNewBytes = newFiles.reduce((sum, f) => sum + (f.size || 0), 0);
      const limitCheck = await checkStorageLimit(
        companyId,
        company?.planId,
        { attachmentsBytes: totalNewBytes, storageBytes: totalNewBytes },
        company?.storageOption
      );
      if (!limitCheck.allowed) {
        throw new Error(limitCheck.message || "Storage limit reached");
      }

      if (await shouldStageNewVoucherFilesAsLocalPending(companyId)) {
        const { fileUrls: merged } = await appendLocalOnlyVoucherFilesToUrls({
          companyId,
          storageFolder: "inter_company",
          existingFileUrls: fileUrls,
          newFiles,
          maxFileCount: fileAttachmentLimits.maxFileCount,
          existingVoucherId,
        });
        fileUrls = merged;
        const stagedRefs = fileUrls.slice(-newFiles.length);
        stagedRefs.forEach((ref, i) => {
          const file = newFiles[i];
          if (file) attachmentBlobByRef.set(ref, file);
        });
        if (!shouldDeferStorageIncrementUntilPendingUpload()) {
          try {
            await incrementCompanyStorage(companyId, {
              attachmentsBytes: totalNewBytes,
              storageBytes: totalNewBytes,
            });
          } catch {
            /* offline */
          }
        }
      } else {
        for (const file of newFiles) {
          if (fileUrls.length >= fileAttachmentLimits.maxFileCount) break;
          const sRef = storageRef(
            storage,
            `voucher-files/${companyId}/inter_company/${Date.now()}_${file.name}`
          );
          const snapshot = await uploadBytes(sRef, file);
          const url = await getDownloadURL(snapshot.ref);
          fileUrls.push(url);
          attachmentBlobByRef.set(url, file);
          await incrementCompanyStorage(companyId, {
            attachmentsBytes: file.size,
            storageBytes: file.size,
          });
        }
      }
      return { fileUrls, attachmentBlobByRef };
    },
    [allowAttachments, company, companyId, fileAttachmentLimits.maxFileCount, files]
  );

  const lastNewVoucherBankResetKeyRef = useRef("");

  useEffect(() => {
    if (!displayVoucher?.id && !savedSourceId) {
      void fetchVoucherNumber();
    }
  }, [displayVoucher?.id, savedSourceId, fetchVoucherNumber]);

  useEffect(() => {
    if (!displayVoucher?.id) {
      const resetKey = `${companyId || ""}|${savedSourceId || ""}`;
      if (lastNewVoucherBankResetKeyRef.current !== resetKey) {
        lastNewVoucherBankResetKeyRef.current = resetKey;
        lastHydratedVoucherIdRef.current = null;
        setSourceCompanyBankId("");
        setTargetCompanyBankId("");
        setHydratedSourceBankExtra(null);
        setHydratedTargetBankExtra(null);
      }
      return;
    }
    const vid = String(displayVoucher.id);
    if (lastHydratedVoucherIdRef.current === vid) return;
    lastHydratedVoucherIdRef.current = vid;
    const row = displayVoucher as Record<string, unknown>;
    const dateVal = row.date as { toDate?: () => Date } | Date | string | undefined;
    const parsedDate =
      dateVal && typeof (dateVal as { toDate?: () => Date }).toDate === "function"
        ? (dateVal as { toDate: () => Date }).toDate()
        : dateVal
          ? new Date(dateVal as string | Date)
          : new Date();
    // Edit: target field id role ke hisaab se (target-copy par current company combobox me dikhe)
    const editIds = resolveInterCompanyEditCompanyIds(row, companyId || "");
    form.reset({
      voucherNumber: String(row.voucherNumber || ""),
      date: parsedDate,
      targetCompanyId:
        editIds.targetCompanyFieldId || String(row.targetCompanyId || "").trim(),
      amount: Number(row.amount || 0),
      narration: String(row.narration || ""),
    });
    const sourceEntity = inferInterCompanyEntity(row, "source");
    const targetEntity = inferInterCompanyEntity(row, "target");
    if (sourceEntity) {
      setSourcePayeeKind(sourceEntity.kind);
      setSourcePayeeId(sourceEntity.id);
    }
    if (targetEntity) {
      setTargetPayeeKind(targetEntity.kind);
      setTargetPayeeId(targetEntity.id);
    }
    const link = readInterCompanyLink(row);
    // Target copy edit: `savedSourceId` = source voucher id (save pair ke liye)
    if (link?.role === "target") {
      setSavedSourceId(String(link.peerVoucherId || "").trim() || null);
      setPeerTargetVoucherId(vid);
    } else {
      setSavedSourceId(vid);
      setPeerTargetVoucherId(link?.peerVoucherId ? String(link.peerVoucherId).trim() : null);
    }
    if (link) setLinkId(link.linkId || null);

    // Edit: company bank — pehle is doc par denormalized ids; phir peer se missing side
    let bankHydrateCancelled = false;
    void (async () => {
      const denorm = resolveInterCompanyBankIdsForEdit(row);
      let srcBank = denorm.sourceCompanyBankAccountId;
      let tgtBank = denorm.targetCompanyBankAccountId;
      if ((!srcBank || !tgtBank) && link?.peerCompanyId && link?.peerVoucherId) {
        try {
          const snap = await getDoc(
            doc(firestore, `companies/${link.peerCompanyId}/vouchers`, link.peerVoucherId),
          );
          if (snap.exists()) {
            const peer = snap.data() as Record<string, unknown>;
            const peerDenorm = resolveInterCompanyBankIdsForEdit(peer);
            if (!srcBank) {
              srcBank =
                peerDenorm.sourceCompanyBankAccountId ||
                (link.role === "target" ? readInterCompanyCompanyBankId(peer) : "");
            }
            if (!tgtBank) {
              tgtBank =
                peerDenorm.targetCompanyBankAccountId ||
                (link.role === "source" ? readInterCompanyCompanyBankId(peer) : "");
            }
          }
        } catch {
          /* offline */
        }
      }
      if (!srcBank && !link) srcBank = readInterCompanyCompanyBankId(row);
      if (!bankHydrateCancelled) {
        if (srcBank) setSourceCompanyBankId(srcBank);
        if (tgtBank) setTargetCompanyBankId(tgtBank);
      }
    })();

    const urls = row.fileUrls;
    const rev = row.interCompanyReversal as { attachmentUrls?: string[] } | undefined;
    const merged = [
      ...(Array.isArray(urls) ? (urls as string[]) : []),
      ...(Array.isArray(rev?.attachmentUrls) ? rev!.attachmentUrls! : []),
    ];
    const seen = new Set<string>();
    const localFiles = merged.filter((u) => {
      const s = String(u);
      if (!s || seen.has(s)) return false;
      seen.add(s);
      return true;
    });
    setFiles(localFiles);

    const shareRaw = row.interCompanyShareAttachmentsWithPeer;
    let share = shareRaw === true;
    if (typeof shareRaw !== "boolean") {
      share = localFiles.length > 0;
    }
    setShareAttachmentsWithPeer(share);
    setSavedShareAttachmentsWithPeer(share);

    if (
      link?.role === "target" &&
      share === true &&
      localFiles.length === 0 &&
      link.peerCompanyId &&
      link.peerVoucherId
    ) {
      void (async () => {
        try {
          const snap = await getDoc(
            doc(firestore, `companies/${link.peerCompanyId}/vouchers`, link.peerVoucherId)
          );
          if (!snap.exists()) return;
          const peerRow = snap.data() as Record<string, unknown>;
          const peerUrls = peerRow.fileUrls;
          const peerMerged = Array.isArray(peerUrls) ? (peerUrls as string[]) : [];
          const peerSeen = new Set<string>();
          const peerFiles = peerMerged.filter((u) => {
            const s = String(u);
            if (!s || peerSeen.has(s)) return false;
            peerSeen.add(s);
            return true;
          });
          if (peerFiles.length > 0) setFiles(peerFiles);
        } catch {
          /* offline */
        }
      })();
    }

    return () => {
      bankHydrateCancelled = true;
    };
  }, [displayVoucher, form, savedSourceId, companyId]);

  // Live snapshot / table row baad me bank fields laaye — `lastHydratedVoucherIdRef` dubara hydrate nahi karta
  useEffect(() => {
    if (!displayVoucher?.id) return;
    const row = displayVoucher as Record<string, unknown>;
    const denorm = resolveInterCompanyBankIdsForEdit(row);
    if (denorm.sourceCompanyBankAccountId) {
      setSourceCompanyBankId((prev) =>
        prev === denorm.sourceCompanyBankAccountId ? prev : denorm.sourceCompanyBankAccountId,
      );
    }
    if (denorm.targetCompanyBankAccountId) {
      setTargetCompanyBankId((prev) =>
        prev === denorm.targetCompanyBankAccountId ? prev : denorm.targetCompanyBankAccountId,
      );
    }
    if (denorm.sourceCompanyBankAccountId && denorm.targetCompanyBankAccountId) return;

    const link = readInterCompanyLink(row);
    if (!link?.peerCompanyId || !link?.peerVoucherId) return;
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDoc(
          doc(firestore, `companies/${link.peerCompanyId}/vouchers`, link.peerVoucherId),
        );
        if (cancelled || !snap.exists()) return;
        const peer = snap.data() as Record<string, unknown>;
        const peerDenorm = resolveInterCompanyBankIdsForEdit(peer);
        if (!denorm.sourceCompanyBankAccountId) {
          const src =
            peerDenorm.sourceCompanyBankAccountId ||
            (link.role === "target" ? readInterCompanyCompanyBankId(peer) : "");
          if (src) setSourceCompanyBankId(src);
        }
        if (!denorm.targetCompanyBankAccountId) {
          const tgt =
            peerDenorm.targetCompanyBankAccountId ||
            (link.role === "source" ? readInterCompanyCompanyBankId(peer) : "");
          if (tgt) setTargetCompanyBankId(tgt);
        }
      } catch {
        /* offline */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    displayVoucher?.id,
    (displayVoucher as Record<string, unknown> | undefined)?.sourceCompanyBankAccountId,
    (displayVoucher as Record<string, unknown> | undefined)?.targetCompanyBankAccountId,
    (displayVoucher as Record<string, unknown> | undefined)?.companyBankAccountId,
  ]);

  useEffect(() => {
    const onRev = () => setReverseTick((n) => n + 1);
    window.addEventListener(IC_REVERSE_REQUESTS_CHANGED, onRev);
    return () => window.removeEventListener(IC_REVERSE_REQUESTS_CHANGED, onRev);
  }, []);

  // Target dropdown — sirf joined partners; doosre user ki company public profile se
  const {
    joinedPartners: targetJoinedPartners,
    comboboxOptionsIncluding: targetComboboxOptionsIncluding,
    resolveCompanyIdByAcNo: resolveJoinedCompanyIdByAcNo,
    resolveCompanyIdByCompanyCode: resolveJoinedCompanyIdByCompanyCode,
    resolveCompaniesByMobile: resolveJoinedCompaniesByMobile,
    resolveCompaniesByPan: resolveJoinedCompaniesByPan,
    acNoForAnyCompanyId: joinedAcNoForAnyCompanyId,
    companyCodeForAnyCompanyId: joinedCompanyCodeForAnyCompanyId,
    mobileForAnyCompanyId: joinedMobileForAnyCompanyId,
    panForAnyCompanyId: joinedPanForAnyCompanyId,
    partnerRowById: joinedPartnerRowById,
  } = useInterCompanyJoinedTargetPartners(allCompanies, companyId, user?.uid);

  // Firestore join settings — accept / shared user change par local cache + lookup refresh
  useEffect(() => {
    if (!companyId) return;
    return subscribeInterCompanyJoinSettings(
      companyId,
      () => setIcSettingsTick((n) => n + 1),
      (err) => console.warn("[IC voucher] join settings:", err)
    );
  }, [companyId]);

  // Source company — joined list for cross-company search
  const icSettings = useMemo(
    () => (companyId ? readInterCompanyLocalSettings(companyId) : null),
    [companyId, icSettingsTick]
  );

  // Target company — Join tab privacy (search + masked view)
  const targetPartnerPrivacy = useMemo(
    () => readInterCompanyPartnerPrivacy(targetCompanyId),
    [targetCompanyId, icSettingsTick]
  );

  // Target account search — system cards ke joined partners (public profile rows included)
  const lookupPartners = targetJoinedPartners;

  // Current company par missing A/c No + Company Code backfill — sirf ek baar / companyId (blink loop avoid).
  const icBackfillKeyRef = useRef("");
  useEffect(() => {
    if (!companyId || !company) return;
    if (readCompanyInterCompanyAcNo(company) && readCompanyInterCompanyCode(company)) return;
    if (icBackfillKeyRef.current === companyId) return;
    icBackfillKeyRef.current = companyId;
    void (async () => {
      if (!readCompanyInterCompanyAcNo(company)) await ensureCompanyInterCompanyAcNo(companyId);
      if (!readCompanyInterCompanyCode(company)) {
        await ensureCompanyInterCompanyCode(companyId, company.name);
      }
    })();
  }, [companyId, company]);

  useEffect(() => {
    icBackfillKeyRef.current = "";
  }, [companyId]);

  const editEntityCompanyIds = useMemo(
    () => resolveInterCompanyEditCompanyIds(displayVoucher as Record<string, unknown> | null, companyId || ""),
    [displayVoucher, companyId]
  );

  const sourceEntitiesCompanyId = isInterCompanyEditLocked
    ? editEntityCompanyIds.sourceEntitiesCompanyId
    : companyId || "";
  const targetEntitiesCompanyId = isInterCompanyEditLocked
    ? editEntityCompanyIds.targetEntitiesCompanyId
    : targetCompanyId;

  const { entities: sourceEntitiesRaw, loading: sourceEntitiesLoading } =
    useInterCompanyEntities(sourceEntitiesCompanyId);
  const { entities: targetEntitiesRaw, loading: targetEntitiesLoading } =
    useInterCompanyEntities(targetEntitiesCompanyId);

  const voucherRow = (displayVoucher || null) as Record<string, unknown> | null;
  const sourceEntities = useMemo(() => {
    let list = mergeHydratedEntity(sourceEntitiesRaw, sourcePayeeKind, sourcePayeeId, voucherRow, "source");
    list = mergeHydratedBankEntity(list, sourceCompanyBankId, voucherRow, "source", hydratedSourceBankExtra);
    return list;
  }, [
    sourceEntitiesRaw,
    sourcePayeeKind,
    sourcePayeeId,
    voucherRow,
    sourceCompanyBankId,
    hydratedSourceBankExtra,
  ]);
  const targetEntities = useMemo(() => {
    let list = mergeHydratedEntity(targetEntitiesRaw, targetPayeeKind, targetPayeeId, voucherRow, "target");
    list = mergeHydratedBankEntity(list, targetCompanyBankId, voucherRow, "target", hydratedTargetBankExtra);
    return list;
  }, [
    targetEntitiesRaw,
    targetPayeeKind,
    targetPayeeId,
    voucherRow,
    targetCompanyBankId,
    hydratedTargetBankExtra,
  ]);

  // Edit: saved bank id entities list me na ho to Firestore se naam/A/c No combobox ke liye
  useEffect(() => {
    const bid = String(sourceCompanyBankId || "").trim();
    const cid = String(sourceEntitiesCompanyId || "").trim();
    if (!bid || !cid) {
      setHydratedSourceBankExtra(null);
      return;
    }
    if (sourceEntities.some((e) => e.kind === "bank" && e.id === bid)) {
      setHydratedSourceBankExtra(null);
      return;
    }
    let cancelled = false;
    void fetchInterCompanyBankEntityDetail(cid, bid).then((row) => {
      if (!cancelled) setHydratedSourceBankExtra(row);
    });
    return () => {
      cancelled = true;
    };
  }, [sourceCompanyBankId, sourceEntitiesCompanyId, sourceEntities]);

  useEffect(() => {
    const bid = String(targetCompanyBankId || "").trim();
    const cid = String(targetEntitiesCompanyId || "").trim();
    if (!bid || !cid) {
      setHydratedTargetBankExtra(null);
      return;
    }
    if (targetEntities.some((e) => e.kind === "bank" && e.id === bid)) {
      setHydratedTargetBankExtra(null);
      return;
    }
    let cancelled = false;
    void fetchInterCompanyBankEntityDetail(cid, bid).then((row) => {
      if (!cancelled) setHydratedTargetBankExtra(row);
    });
    return () => {
      cancelled = true;
    };
  }, [targetCompanyBankId, targetEntitiesCompanyId, targetEntities]);

  const displayTargetCompanyId =
    targetCompanyId || editEntityCompanyIds.targetCompanyFieldId || "";

  const targetCompany = useMemo(
    () => (allCompanies || []).find((c) => c.id === displayTargetCompanyId),
    [allCompanies, displayTargetCompanyId]
  );

  // Edit: source column � peer company ka real row (target-copy se kholo to current company source nahi)
  const sourceCompanyForDisplay = useMemo(() => {
    const sid = isInterCompanyEditLocked
      ? editEntityCompanyIds.sourceEntitiesCompanyId
      : companyId || "";
    return (allCompanies || []).find((c) => c.id === sid) ?? company ?? null;
  }, [
    isInterCompanyEditLocked,
    editEntityCompanyIds.sourceEntitiesCompanyId,
    companyId,
    allCompanies,
    company,
  ]);

  const isPeerSourceCompany =
    isInterCompanyEditLocked &&
    !!editEntityCompanyIds.sourceEntitiesCompanyId &&
    editEntityCompanyIds.sourceEntitiesCompanyId !== companyId;

  const sourceStickyCompanyCode = useStickyInterCompanyCompanyCode(sourceCompanyForDisplay);
  const targetStickyCompanyCode = useStickyInterCompanyCompanyCode(targetCompany);

  // Edit: interCompanyLink.role � source copy = Payment Out; target copy = Payment In
  const icViewerSide = interCompanyVoucherViewerSide(voucherRow);
  const showSourcePaymentOutBadge = hasPersistedIc && icViewerSide === "source";
  const showTargetPaymentInBadge = hasPersistedIc && icViewerSide === "target";
  const icLink = readInterCompanyLink(voucherRow);

  const pendingRevertCount = useMemo(
    () => (companyId ? countPendingReverseInbox(companyId) : 0),
    [companyId, reverseTick]
  );
  const pendingDeleteCount = useMemo(
    () => (companyId ? countPendingDeleteInbox(companyId) : 0),
    [companyId, deleteTick]
  );
  const pendingSystemJoinCount = usePendingInterCompanySystemJoinCount({
    ownerUserId: user?.uid,
    companyId,
  });

  // Requester side — accepted join par apni company me link apply + dropdown refresh
  useEffect(() => {
    if (!user?.uid) return;
    return subscribeAcceptedSystemJoinLinksForRequester(user.uid, () => {
      setIcSettingsTick((n) => n + 1);
    });
  }, [user?.uid]);

  const sourceVoucherIdForReverse = icViewerSide === "source" ? String(displayVoucher?.id || savedSourceId || "") : "";
  const reverseFlowState = useMemo(() => {
    if (!companyId || !sourceVoucherIdForReverse) {
      return { pending: false, accepted: !!(voucherRow as { interCompanyReversed?: boolean })?.interCompanyReversed };
    }
    return isSourceVoucherReversePendingOrDone(companyId, sourceVoucherIdForReverse);
  }, [companyId, sourceVoucherIdForReverse, voucherRow, reverseTick]);

  const currentLinkedVoucherId = useMemo(() => {
    if (icViewerSide === "target") {
      return String(displayVoucher?.id || peerTargetVoucherId || "").trim();
    }
    if (icViewerSide === "source") {
      return String(displayVoucher?.id || savedSourceId || "").trim();
    }
    return String(displayVoucher?.id || savedSourceId || "").trim();
  }, [icViewerSide, displayVoucher?.id, peerTargetVoucherId, savedSourceId]);

  const linkedDeleteIds = useMemo(() => {
    const isSource = icViewerSide === "source";
    const sourceVoucherId = isSource
      ? currentLinkedVoucherId
      : String(savedSourceId || icLink?.peerVoucherId || "").trim();
    const targetVoucherId = isSource
      ? String(peerTargetVoucherId || icLink?.peerVoucherId || "").trim()
      : currentLinkedVoucherId;
    return {
      linkId: String(icLink?.linkId || linkId || "").trim(),
      sourceVoucherId,
      targetVoucherId,
    };
  }, [
    icViewerSide,
    currentLinkedVoucherId,
    savedSourceId,
    icLink?.peerVoucherId,
    icLink?.linkId,
    linkId,
    peerTargetVoucherId,
  ]);

  const deleteFlowState = useMemo(() => {
    if (!companyId || !currentLinkedVoucherId || !icViewerSide) {
      return { pending: false, accepted: false, outgoing: null as InterCompanyDeleteRequest | null };
    }
    const outgoing = findPendingDeleteOutboxForLinkedVoucher({
      companyId,
      side: icViewerSide,
      voucherId: currentLinkedVoucherId,
      ...linkedDeleteIds,
    });
    const state = isLinkedVoucherDeletePendingOrDone({
      companyId,
      side: icViewerSide,
      voucherId: currentLinkedVoucherId,
      ...linkedDeleteIds,
    });
    return { ...state, outgoing };
  }, [companyId, currentLinkedVoucherId, icViewerSide, linkedDeleteIds, deleteTick]);

  const incomingDeleteRequest = useMemo(() => {
    if (!companyId || !currentLinkedVoucherId) return null;
    return findPendingDeleteInboxForVoucher({
      companyId,
      voucherId: currentLinkedVoucherId,
      ...linkedDeleteIds,
    });
  }, [companyId, currentLinkedVoucherId, linkedDeleteIds, deleteTick]);

  /** Source create — Save & Approve (admin / approve permission) */
  const icSaveAndApproveOnCreate =
    icViewerSide !== "target" &&
    !currentLinkedVoucherId &&
    can("approve_transactions") &&
    (showSaveAndApproveOnCreate || isCompanyAdmin);

  /** Saved source copy — Approve / Save & Approve */
  const icShowApproveButton =
    icViewerSide === "source" &&
    (showApproveButton || (isCompanyAdmin && can("approve_transactions") && !!currentLinkedVoucherId));

  /** Reverted — source/target header par blue pill (ledger type pill jaisa) */
  const showIcRevertedBadge =
    !!(voucherRow as { interCompanyReversed?: boolean })?.interCompanyReversed ||
    reverseFlowState.accepted;

  /** Target dropdown — joined partners; edit par saved target id missing ho to option add */
  const targetComboboxOptions = useMemo(
    () =>
      targetComboboxOptionsIncluding([
        displayTargetCompanyId,
        editEntityCompanyIds.targetCompanyFieldId,
      ]),
    [
      targetComboboxOptionsIncluding,
      displayTargetCompanyId,
      editEntityCompanyIds.targetCompanyFieldId,
    ]
  );

  const targetCompanyDisplayName =
    targetCompany?.name ||
    joinedPartnerRowById.get(displayTargetCompanyId)?.name ||
    "";

  // Edit: peer source / target company ka Inter Co. A/c � real company row se display
  useEffect(() => {
    if (!isInterCompanyEditLocked) return;
    const ids = new Set(
      [editEntityCompanyIds.sourceEntitiesCompanyId, displayTargetCompanyId].filter(Boolean)
    );
    for (const cid of ids) {
      const row = (allCompanies || []).find((c) => c.id === cid);
      if (row && !readCompanyInterCompanyAcNo(row)) void ensureCompanyInterCompanyAcNo(cid);
    }
  }, [
    isInterCompanyEditLocked,
    editEntityCompanyIds.sourceEntitiesCompanyId,
    displayTargetCompanyId,
    allCompanies,
  ]);

  const sourceCurrency = String(company?.currencyCode || "").trim();
  const targetCurrency = String(targetCompany?.currencyCode || "").trim();
  const showFxPreview =
    Boolean(sourceCurrency) &&
    Boolean(targetCurrency) &&
    sourceCurrency.toUpperCase() !== targetCurrency.toUpperCase();

  const sourceSelected = useMemo(
    () => sourceEntities.find((e) => e.kind === sourcePayeeKind && e.id === sourcePayeeId) ?? null,
    [sourceEntities, sourcePayeeKind, sourcePayeeId]
  );
  const targetSelected = useMemo(
    () => targetEntities.find((e) => e.kind === targetPayeeKind && e.id === targetPayeeId) ?? null,
    [targetEntities, targetPayeeKind, targetPayeeId]
  );

  const reverseRequestDraft = useMemo(() => {
    if (!companyId || !sourceVoucherIdForReverse || !icLink) return null;
    const peerId = icLink.peerCompanyId;
    const peerVoucherId = icLink.peerVoucherId;
    const peerCo = (allCompanies || []).find((c) => c.id === peerId);
    const vals = form.getValues();
    return {
      amount: Number(vals.amount) || 0,
      linkId: icLink.linkId || linkId || "",
      sourceCompanyId: companyId,
      sourceCompanyName: company?.name || "",
      sourceVoucherId: sourceVoucherIdForReverse,
      sourceVoucherNumber: String(vals.voucherNumber || ""),
      sourceEntityKind: sourcePayeeKind,
      sourceEntityId: sourcePayeeId,
      sourceEntityLabel: readInterCompanyEntityLabelSnapshot(voucherRow, "source") || sourceSelected?.label || "",
      sourceEntityAcNo: sourceSelected ? readEntityAcNoField(sourceSelected) : "",
      targetCompanyId: displayTargetCompanyId || peerId,
      targetCompanyName: targetCompany?.name || peerCo?.name || "",
      targetVoucherId: peerVoucherId || peerTargetVoucherId || "",
      targetVoucherNumber: String(voucherRow?.voucherNumber || ""),
      targetEntityKind: targetPayeeKind,
      targetEntityId: targetPayeeId,
      targetEntityLabel: readInterCompanyEntityLabelSnapshot(voucherRow, "target") || targetSelected?.label || "",
      targetEntityAcNo: targetSelected ? readEntityAcNoField(targetSelected) : "",
    };
  }, [
    companyId,
    sourceVoucherIdForReverse,
    voucherRow,
    icLink,
    linkId,
    allCompanies,
    company?.name,
    form,
    sourcePayeeKind,
    sourcePayeeId,
    sourceSelected,
    displayTargetCompanyId,
    targetCompany?.name,
    peerTargetVoucherId,
    targetPayeeKind,
    targetPayeeId,
    targetSelected,
  ]);

  const deleteRequestDraft = useMemo(() => {
    if (!companyId || !hasPersistedIc || !icLink || !icViewerSide) return null;
    const isSource = icViewerSide === "source";
    const sourceCid = isSource ? companyId : icLink.peerCompanyId;
    const targetCid = isSource ? displayTargetCompanyId || icLink.peerCompanyId : companyId;
    const sourceVid = isSource
      ? String(voucher?.id || savedSourceId || "").trim()
      : String(icLink.peerVoucherId || "").trim();
    const targetVid = isSource
      ? String(peerTargetVoucherId || icLink.peerVoucherId || "").trim()
      : String(voucher?.id || "").trim();
    if (!sourceCid || !targetCid || !sourceVid || !targetVid) return null;
    const sourceCo = (allCompanies || []).find((c) => c.id === sourceCid);
    const targetCo = (allCompanies || []).find((c) => c.id === targetCid);
    const vals = form.getValues();
    return {
      requestedBySide: icViewerSide,
      amount: Number(vals.amount) || 0,
      linkId: icLink.linkId || linkId || "",
      sourceCompanyId: sourceCid,
      sourceCompanyName: (isSource ? company?.name : sourceCo?.name) || "",
      sourceVoucherId: sourceVid,
      sourceVoucherNumber: isSource ? String(vals.voucherNumber || "") : String(voucherRow?.voucherNumber || ""),
      sourceEntityKind: sourcePayeeKind,
      sourceEntityId: sourcePayeeId,
      sourceEntityLabel:
        readInterCompanyEntityLabelSnapshot(voucherRow, "source") || sourceSelected?.label || "",
      targetCompanyId: targetCid,
      targetCompanyName: (isSource ? targetCompany?.name : company?.name) || targetCo?.name || "",
      targetVoucherId: targetVid,
      targetVoucherNumber: isSource ? String(voucherRow?.voucherNumber || "") : String(vals.voucherNumber || ""),
      targetEntityKind: targetPayeeKind,
      targetEntityId: targetPayeeId,
      targetEntityLabel:
        readInterCompanyEntityLabelSnapshot(voucherRow, "target") || targetSelected?.label || "",
    };
  }, [
    companyId,
    hasPersistedIc,
    icLink,
    icViewerSide,
    voucher?.id,
    savedSourceId,
    displayTargetCompanyId,
    allCompanies,
    company?.name,
    form,
    linkId,
    voucherRow,
    sourcePayeeKind,
    sourcePayeeId,
    sourceSelected,
    targetCompany?.name,
    peerTargetVoucherId,
    targetPayeeKind,
    targetPayeeId,
    targetSelected,
  ]);

  useEffect(() => {
    const onDeleteChange = () => setDeleteTick((n) => n + 1);
    window.addEventListener(IC_DELETE_REQUESTS_CHANGED, onDeleteChange);
    return () => window.removeEventListener(IC_DELETE_REQUESTS_CHANGED, onDeleteChange);
  }, []);

  const validateEntities = () => {
    if (!targetCompanyId) {
      toast.error("Select target company");
      return false;
    }
    if (!String(sourceCompanyBankId || "").trim()) {
      toast.error("Source: select clearing account");
      return false;
    }
    if (!String(targetCompanyBankId || "").trim()) {
      toast.error("Target: select clearing account");
      return false;
    }
    return true;
  };

  const icFooterDirty =
    isFormDirty ||
    !savedSourceId ||
    shareAttachmentsWithPeer !== savedShareAttachmentsWithPeer;

  const processAndSave = async (opts?: {
    saveAndNew?: boolean;
    approveAfterSave?: boolean;
    saveAndPrint?: boolean;
  }) => {
    if (isInterCompanyEditLocked || editingDisabled || isLoading) return;
    if (!user?.uid || !companyId) {
      toast.error("Sign in and select a company");
      return;
    }
    if (!validateEntities()) return;

    const values = form.getValues();
    const toastId = toast.loading(savedSourceId ? "Updating�" : "Saving�");
    setIsLoading(true);
    try {
      const isEdit = !!savedSourceId;
      const voucherDate = values.date instanceof Date ? values.date : new Date(values.date);

      if (isEdit && savedSourceId) {
        const fetchVoucher = async (cid: string, vid: string) => {
          const snap = await getDoc(doc(firestore, `companies/${cid}/vouchers`, vid));
          return snap.exists() ? snap.data() : null;
        };
        const isOwn = await determineVoucherOwnership(
          voucher,
          savedSourceId,
          [],
          user.uid,
          companyId,
          fetchVoucher
        );
        assertCanEdit(canEditRecord, isOwn);
        let originalDate = voucherDate;
        if (voucher?.date) {
          const d = voucher.date as { toDate?: () => Date };
          originalDate = d?.toDate ? d.toDate() : new Date(voucher.date as string | Date);
        }
        assertCanPerformBackdated(canPerformBackdatedAction, "edit", originalDate);
      } else {
        assertCan(can, "create_records");
        assertCanPerformBackdated(canPerformBackdatedAction, "create", voucherDate);
      }

      const link = readInterCompanyLink(voucher as Record<string, unknown> | undefined);
      const peerVoucherId = peerTargetVoucherId || link?.peerVoucherId || null;
      const { fileUrls, attachmentBlobByRef } = await resolveFileUrlsForSave(savedSourceId);

      const result = await saveInterCompanyVoucherPair({
        sourceCompanyId: companyId,
        targetCompanyId: values.targetCompanyId,
        userId: user.uid,
        approverName: customUser?.displayName || user.displayName || user.email || user.uid,
        voucherNumber: values.voucherNumber,
        date: voucherDate,
        amount: values.amount,
        narration: values.narration,
        sourceEntityKind: sourcePayeeKind,
        sourceEntityId: sourcePayeeId,
        targetEntityKind: targetPayeeKind,
        targetEntityId: targetPayeeId,
        sourceCompanyBankAccountId: sourceCompanyBankId,
        targetCompanyBankAccountId: targetCompanyBankId,
        sourceCompanyBankLabel:
          sourceEntities.find((e) => e.kind === "bank" && e.id === sourceCompanyBankId)?.label ||
          readInterCompanyBankLabelSnapshot(voucherRow, "source"),
        targetCompanyBankLabel:
          targetEntities.find((e) => e.kind === "bank" && e.id === targetCompanyBankId)?.label ||
          readInterCompanyBankLabelSnapshot(voucherRow, "target"),
        sourceEntityLabel: sourceSelected?.label,
        targetEntityLabel: targetSelected?.label,
        sourceCompanyName: company?.name,
        targetCompanyName: targetCompany?.name,
        existingSourceVoucherId: savedSourceId,
        existingTargetVoucherId: peerVoucherId,
        existingLinkId: linkId || link?.linkId,
        approveSourceAfterSave: opts?.approveAfterSave,
        fileUrls,
        attachmentBlobByRef,
        shareAttachmentsWithPeer,
      });

      setSavedSourceId(result.sourceId);
      setPeerTargetVoucherId(result.targetId);
      setLinkId(result.linkId);
      setFiles(fileUrls);
      setSavedShareAttachmentsWithPeer(shareAttachmentsWithPeer);
      if (!isEdit) {
        lastHydratedVoucherIdRef.current = result.sourceId;
        ++voucherNumberFetchGenRef.current;
      }

      toast.success(isEdit ? "Inter Company updated" : "Inter Company saved", { id: toastId });
      if (result.attachmentReplicationWarning) {
        toast.warning("Attachment copy incomplete", {
          description: result.attachmentReplicationWarning,
        });
      }

      if (opts?.saveAndPrint && company) {
        const dateStr = formatDate(voucherDate);
        try {
          openPrintDirect({
            company: {
              name: company.name,
              pan: company.pan,
              phone: company.phone,
              address: company.address,
              logoUrl: company.logoUrl,
            },
            title: `Inter Company: ${values.voucherNumber}`,
            context: "other",
            dateSystem: dateSystem as "AD" | "BS" | "Both",
            dateRangeText: dateStr,
            vouchersCount: 1,
            openingBalance: 0,
            transactions: [],
            customContent: [
              { text: "Inter Company", fontSize: 14, bold: true, margin: [0, 0, 0, 8] },
              {
                table: {
                  body: [
                    ["Voucher No.", values.voucherNumber],
                    ["Date", dateStr],
                    ["Amount", formatCurrency(values.amount)],
                    ["Target company", targetCompany?.name || values.targetCompanyId],
                    ["Narration", values.narration || "�"],
                  ],
                },
                layout: "lightHorizontalLines",
                margin: [0, 0, 0, 12],
              },
            ],
          });
        } catch {
          toast.info("Saved � print could not open");
        }
      }

      if (opts?.saveAndNew) {
        form.reset({
          voucherNumber: "",
          date: new Date(),
          targetCompanyId: "",
          amount: 0,
          narration: "",
        });
        setSourcePayeeId("");
        setTargetPayeeId("");
        setSavedSourceId(null);
        setPeerTargetVoucherId(null);
        setLinkId(null);
        setFiles([]);
        lastHydratedVoucherIdRef.current = null;
        await fetchVoucherNumber();
      }

      onVoucherAction?.("saved", opts?.saveAndNew, result.sourceId);
    } catch (err) {
      if (err instanceof PermissionDeniedError) {
        toast.error("Permission denied", { id: toastId, description: err.message });
      } else {
        const message = err instanceof Error ? err.message : "Could not save";
        toast.error("Save failed", { id: toastId, description: message });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleIcApprove = async () => {
    if (isInterCompanyEditLocked || editingDisabled || isLoading || isApproving) return;
    if (!user?.uid || !companyId) {
      toast.error("Sign in and select a company");
      return;
    }
    if (icFooterDirty) {
      await processAndSave({ approveAfterSave: true });
      return;
    }
    const sourceVoucherId = String(savedSourceId || voucher?.id || "").trim();
    if (!sourceVoucherId) {
      await processAndSave({ approveAfterSave: true });
      return;
    }
    const toastId = toast.loading("Approving…");
    setIsLoading(true);
    try {
      const approverName = customUser?.displayName || user.displayName || user.email || user.uid;
      await approveVoucherWithHistory(companyId, sourceVoucherId, user.uid, approverName);
      const icPartyId = String(
        (voucherRow as { interCompanyCounterpartyPartyId?: string })?.interCompanyCounterpartyPartyId || ""
      ).trim();
      const useIcConduit = true;
      const approvedLegs = buildSourceInterCompanyLegsApproved({
        amount: Number(form.getValues().amount) || 0,
        entityKind: sourcePayeeKind,
        entityId: sourcePayeeId,
        companyBankAccountId: sourceCompanyBankId,
        interCompanyCounterpartyPartyId: icPartyId,
        useIcConduit,
      });
      if (approvedLegs.length > 0) {
        await patchVoucherFields(companyId, sourceVoucherId, {
          interCompanyLegs: approvedLegs,
          interCompanyCounterpartyPartyId: icPartyId || null,
        });
      }
      toast.success("Inter Company approved", { id: toastId });
      onVoucherAction?.("saved", false, sourceVoucherId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not approve";
      toast.error("Approve failed", { id: toastId, description: message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (
      !savedSourceId ||
      !companyId ||
      !user?.uid ||
      editingDisabled ||
      isInterCompanyEditLocked
    ) {
      return;
    }
    if (interCompanyVoucherViewerSide(voucherRow) !== "source") {
      toast.error("Delete from source company", {
        description: "Inter Company delete is only allowed on the source company copy.",
      });
      return;
    }
    const toastId = toast.loading("Deleting�");
    setIsLoading(true);
    try {
      await deleteInterCompanyVoucherPair({
        sourceCompanyId: companyId,
        sourceVoucherId: String(voucher?.id || savedSourceId),
        peerCompanyId: targetCompanyId || readInterCompanyLink(voucher as Record<string, unknown>)?.peerCompanyId,
        peerVoucherId: peerTargetVoucherId,
        deletedByUid: user.uid,
      });
      toast.success("Moved to recycle bin", { id: toastId });
      onVoucherAction?.("cancelled");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed";
      toast.error("Delete failed", { id: toastId, description: message });
    } finally {
      setIsLoading(false);
    }
  };

  const saveShareAttachmentsOnly = async () => {
    if (editingDisabled || isLoading || icViewerSide !== "source") return;
    if (shareAttachmentsWithPeer === savedShareAttachmentsWithPeer) return;
    if (!user?.uid || !companyId) {
      toast.error("Sign in and select a company");
      return;
    }
    const sourceVoucherId = String(voucher?.id || savedSourceId || "").trim();
    if (!sourceVoucherId) return;
    const link = readInterCompanyLink(voucher as Record<string, unknown> | undefined);
    const targetCompanyIdForShare =
      String(form.getValues("targetCompanyId") || displayTargetCompanyId || link?.peerCompanyId || "").trim();
    const targetVoucherIdForShare = String(peerTargetVoucherId || link?.peerVoucherId || "").trim();
    if (!targetCompanyIdForShare || !targetVoucherIdForShare) {
      toast.error("Linked target voucher not found");
      return;
    }
    const toastId = toast.loading("Saving attachment share…");
    setIsLoading(true);
    try {
      const fileUrls = files.filter((f): f is string => typeof f === "string");
      const shareResult = await patchInterCompanyShareAttachmentsWithPeer({
        sourceCompanyId: companyId,
        sourceVoucherId,
        targetCompanyId: targetCompanyIdForShare,
        targetVoucherId: targetVoucherIdForShare,
        shareAttachmentsWithPeer,
        sourceFileUrls: fileUrls,
      });
      setSavedShareAttachmentsWithPeer(shareAttachmentsWithPeer);
      toast.success(
        shareAttachmentsWithPeer
          ? "Attachment will show on other company's copy"
          : "Attachment hidden from other company's copy",
        { id: toastId }
      );
      if (shareResult.attachmentReplicationWarning) {
        toast.warning("Attachment copy incomplete", {
          description: shareResult.attachmentReplicationWarning,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save";
      toast.error("Save failed", { id: toastId, description: message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmIncomingDelete = async () => {
    const req = incomingDeleteRequest;
    if (!user?.uid || !req || req.status !== "pending" || !companyId) return;
    const toastId = toast.loading("Deleting…");
    setIsLoading(true);
    try {
      await applyInterCompanyDeleteAccept({
        request: req,
        acceptedByUid: user.uid,
      });
      const requesterCompanyId =
        req.requestedBySide === "source" ? req.sourceCompanyId : req.targetCompanyId;
      updateInterCompanyDeleteRequestStatus(req.id, companyId, requesterCompanyId, {
        status: "accepted",
        acceptedAt: Date.now(),
        acceptedByUid: user.uid,
        acceptedByName: customUser?.displayName || user.displayName || user.email,
      });
      toast.success("Inter Company voucher deleted on both companies", { id: toastId });
      setDeleteTick((n) => n + 1);
      onVoucherAction?.("cancelled");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed";
      toast.error("Delete failed", { id: toastId, description: message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelDeleteRequest = () => {
    const req = deleteFlowState.outgoing;
    if (!req || !companyId) return;
    const responderCompanyId =
      req.requestedBySide === "source" ? req.targetCompanyId : req.sourceCompanyId;
    cancelInterCompanyDeleteRequest({
      requestId: req.id,
      requesterCompanyId: companyId,
      responderCompanyId,
    });
    toast.success("Delete request cancelled");
    setDeleteTick((n) => n + 1);
  };

  const handleOpenVoucherFromDeleteRequest = async (req: InterCompanyDeleteRequest) => {
    if (!companyId) return;
    const localVoucherId =
      req.targetCompanyId === companyId
        ? String(req.targetVoucherId || "").trim()
        : String(req.sourceVoucherId || "").trim();
    if (!localVoucherId) return;

    if (localVoucherId === currentLinkedVoucherId) {
      setRibbonTab("voucher");
      return;
    }

    try {
      const snap = await getDoc(doc(firestore, `companies/${companyId}/vouchers`, localVoucherId));
      if (!snap.exists()) {
        toast.error("Voucher not found");
        return;
      }
      lastHydratedVoucherIdRef.current = null;
      setVoucherOverride({ id: snap.id, ...snap.data() });
      setRibbonTab("voucher");
    } catch {
      toast.error("Could not open voucher");
    }
  };

  const handlePrint = () => {
    void processAndSave({ saveAndPrint: true });
  };

  const showBsDate = dateSystem === "BS" || dateSystem === "Both";
  const showAdDate = dateSystem === "AD" || dateSystem === "Both";

  const voucherTabBody = (
    <div className={cn("pl-inter-company-voucher select-text", interCompanyVoucherTabShellClass)}>
      <FormField control={form.control} name="date" render={() => <FormMessage />} />

      <TwoColumnEntityGrid
        leftHeader={
          <FormField
            control={form.control}
            name="voucherNumber"
            render={({ field }) => (
              <FormItem className={interCompanyVoucherHeaderFieldColClass}>
                <FormLabel className={interCompanyVoucherHeaderLabelClass}>Voucher No.</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    className={cn(
                      interCompanyInputClass,
                      interCompanyVoucherNumberInputSizingClass,
                      isInterCompanyEditLocked && interCompanyReadOnlyCopyInputClass
                    )}
                    readOnly={isInterCompanyEditLocked}
                    disabled={editingDisabled}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        }
        rightHeader={
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <InterCompanyDateFieldsHeader
                showBsDate={showBsDate}
                showAdDate={showAdDate}
                dateSystem={dateSystem}
                value={field.value}
                onChange={field.onChange}
                fieldsDisabled={fieldsDisabled}
                viewOnlyAllowCopy={isInterCompanyEditLocked}
                isCalendarOpen={isCalendarOpen}
                setIsCalendarOpen={setIsCalendarOpen}
                formatDate={formatDate}
                formatDateBS={formatDateBS}
              />
            )}
          />
        }
        targetCompanyField={
          <FormField
            control={form.control}
            name="targetCompanyId"
            render={({ field }) => (
              <FormItem className="space-y-0">
                <InterCompanyTargetConnectSection
                  targetCompanyId={field.value}
                  onTargetCompanyChange={(id) => {
                    if (isInterCompanyEditLocked) return;
                    const nextId = String(id || "").trim();
                    if (!nextId || field.value === nextId) return;
                    field.onChange(nextId);
                    setTargetPayeeId("");
                    setTargetCompanyBankId("");
                  }}
                  fieldsDisabled={fieldsDisabled}
                  comboboxOptions={targetComboboxOptions}
                  resolveCompanyIdByAcNo={resolveJoinedCompanyIdByAcNo}
                  resolveCompanyIdByCompanyCode={resolveJoinedCompanyIdByCompanyCode}
                  resolveCompaniesByMobile={resolveJoinedCompaniesByMobile}
                  resolveCompaniesByPan={resolveJoinedCompaniesByPan}
                  companyCodeForCompanyId={joinedCompanyCodeForAnyCompanyId}
                  acNoForCompanyId={joinedAcNoForAnyCompanyId}
                  panForCompanyId={joinedPanForAnyCompanyId}
                  mobileForCompanyId={joinedMobileForAnyCompanyId}
                  partners={targetJoinedPartners}
                  lookupPartners={lookupPartners}
                  targetPartnerPrivacy={targetPartnerPrivacy}
                  entities={targetEntities}
                  entitiesLoading={targetEntitiesLoading}
                  payeeKind={targetPayeeKind}
                  onPayeeKindChange={(k) => {
                    if (isInterCompanyEditLocked) return;
                    setTargetPayeeKind(k);
                  }}
                  payeeId={targetPayeeId}
                  onPayeeIdChange={(id) => {
                    if (isInterCompanyEditLocked) return;
                    setTargetPayeeId(id);
                  }}
                  targetCompanyDisplayName={targetCompanyDisplayName}
                  showPaymentInBadge={showTargetPaymentInBadge}
                  showRevertedBadge={showIcRevertedBadge}
                  companyBankAccountId={targetCompanyBankId}
                  onCompanyBankAccountIdChange={(id) => {
                    if (isInterCompanyEditLocked) return;
                    setTargetCompanyBankId(id);
                  }}
                  formMessage={<FormMessage />}
                />
              </FormItem>
            )}
          />
        }
        sourcePanel={
          <InterCompanySourcePaySection
            company={sourceCompanyForDisplay}
            entities={sourceEntities}
            entitiesLoading={sourceEntitiesLoading}
            payeeKind={sourcePayeeKind}
            onPayeeKindChange={(k) => {
              if (isInterCompanyEditLocked) return;
              setSourcePayeeKind(k);
            }}
            payeeId={sourcePayeeId}
            onPayeeIdChange={(id) => {
              if (isInterCompanyEditLocked) return;
              setSourcePayeeId(id);
            }}
            fieldsDisabled={fieldsDisabled}
            isPeerSourceCompany={isPeerSourceCompany}
            showPaymentOutBadge={showSourcePaymentOutBadge}
            onRequestReverse={() => setReverseDialogOpen(true)}
            reverseRequestPending={reverseFlowState.pending}
            reverseRequestDone={showIcRevertedBadge}
            showRevertedBadge={showIcRevertedBadge}
            companyBankAccountId={sourceCompanyBankId}
            onCompanyBankAccountIdChange={(id) => {
              if (isInterCompanyEditLocked) return;
              setSourceCompanyBankId(id);
            }}
          />
        }
      />

      <InterCompanyVoucherIdentityStrip
        source={{
          title: "Source",
          companyName: sourceCompanyForDisplay?.name,
          companyCode: sourceStickyCompanyCode,
          companyMobile: normalizeInterCompanyPhone(sourceCompanyForDisplay?.phone),
          entity: sourceSelected,
          bankToBank: !sourcePayeeId && Boolean(sourceCompanyBankId),
        }}
        target={{
          title: "Target",
          companyName: targetCompanyDisplayName || targetCompany?.name,
          companyCode:
            targetStickyCompanyCode ||
            (displayTargetCompanyId ? joinedCompanyCodeForAnyCompanyId(displayTargetCompanyId) : ""),
          companyMobile: displayTargetCompanyId
            ? joinedMobileForAnyCompanyId(displayTargetCompanyId)
            : "",
          entity: targetSelected,
          bankToBank: !targetPayeeId && Boolean(targetCompanyBankId),
        }}
      />

      <InterCompanyAmountDualFields
        control={form.control as unknown as Control<FieldValues>}
        amount={Number(form.watch("amount") || 0)}
        formatCurrencyForPrint={formatCurrencyForPrint}
        fieldsDisabled={fieldsDisabled}
        editLocked={isInterCompanyEditLocked}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-stretch">
        <InterCompanyVoucherAttachments
          files={files}
          onFilesChange={setFiles}
          disabled={fieldsDisabled}
          allowPreviewWhenDisabled
          className="h-full"
          shareWithPeer={shareAttachmentsWithPeer}
          onShareWithPeerChange={setShareAttachmentsWithPeer}
          showShareCheckbox={icViewerSide !== "target"}
          shareCheckboxDisabled={icViewerSide === "target"}
        />
        <div className={cn(interCompanyNarrationCardClass, "min-w-0")}>
          <FormField
            control={form.control}
            name="narration"
            render={({ field }) => (
              <FormItem className="flex min-h-0 flex-1 flex-col space-y-2">
                <FormLabel>Narration</FormLabel>
                <FormControl className="min-h-0 flex-1">
                  <Textarea
                    {...field}
                    readOnly={isInterCompanyEditLocked}
                    disabled={editingDisabled}
                    rows={3}
                    className={cn(
                      interCompanyNarrationTextareaInCardClass,
                      isInterCompanyEditLocked && interCompanyReadOnlyCopyInputClass
                    )}
                    placeholder="Same on both companies + auto inter-company line"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Clearing account required on both sides. Party account optional — leave blank for bank-to-bank; if selected,
        target confirms in account as before.
      </p>
    </div>
  );

  const formInner = (
    <Form {...form}>
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={form.handleSubmit(() => void processAndSave())}
      >
        <ScrollArea
          icVoucherChrome
          className={cn("min-h-0 flex-1 pr-2", interCompanyVoucherScrollAreaClass)}
        >
          <div className="space-y-4 pb-2">
            {!inDialog ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Voucher type</span>
                <Badge
                  variant="secondary"
                  className="border-emerald-200/80 bg-emerald-100 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-50"
                >
                  Inter Company
                </Badge>
              </div>
            ) : null}

            {ribbonTab === "voucher" ? voucherTabBody : null}
            {ribbonTab === "join" && companyId ? (
              <InterCompanyJoinSettingsPanel
                companyId={companyId}
                onSettingsChange={() => setIcSettingsTick((n) => n + 1)}
              />
            ) : null}
            {ribbonTab === "delete_requests" && companyId ? (
              <InterCompanyDeleteRequestsPanel
                companyId={companyId}
                highlightVoucherId={currentLinkedVoucherId || undefined}
                onOpenVoucher={(req) => void handleOpenVoucherFromDeleteRequest(req)}
                onConfirmed={() => {
                  setDeleteTick((n) => n + 1);
                  onVoucherAction?.("cancelled");
                }}
              />
            ) : null}
            {ribbonTab === "revert_requests" && companyId ? (
              <InterCompanyReverseRequestsPanel
                companyId={companyId}
                highlightTargetVoucherId={
                  icViewerSide === "target"
                    ? String(peerTargetVoucherId || voucher?.id || "").trim() || undefined
                    : undefined
                }
                onAccepted={() => {
                  setReverseTick((n) => n + 1);
                  onVoucherAction?.("saved");
                }}
              />
            ) : null}
          </div>
        </ScrollArea>

        {ribbonTab === "voucher" ? (
          <InterCompanyVoucherFooter
            inDialog={inDialog}
            voucher={
              currentLinkedVoucherId
                ? {
                    id: currentLinkedVoucherId,
                    isApproved: (displayVoucher as { isApproved?: boolean })?.isApproved,
                  }
                : (displayVoucher as { id?: string; isApproved?: boolean } | undefined)
            }
            editingDisabled={fieldsDisabled}
            isEditViewOnly={isInterCompanyEditLocked}
            isCompanyAdmin={isCompanyAdmin && !isInterCompanyEditLocked}
            deleteDisabledWhenLinked={deleteDisabledWhenLinked}
            showHistoryButton={showHistoryButton}
            showApproveButton={icShowApproveButton}
            showSaveAndApproveOnCreate={icSaveAndApproveOnCreate}
            onOpenHistory={onOpenHistory}
            onApprove={() => void handleIcApprove()}
            isApproving={isApproving || isLoading}
            isLoading={isLoading}
            isFormDirty={icFooterDirty}
            onCancel={() => onVoucherAction?.("cancelled")}
            onDelete={() => void handleDelete()}
            onRequestDelete={() => setDeleteDialogOpen(true)}
            deleteRequestPending={deleteFlowState.pending && !incomingDeleteRequest}
            canConfirmDelete={!!incomingDeleteRequest}
            onConfirmDelete={() => void handleConfirmIncomingDelete()}
            onCancelDeleteRequest={
              deleteFlowState.outgoing ? () => handleCancelDeleteRequest() : undefined
            }
            shareSettingsDirty={
              isInterCompanyEditLocked &&
              icViewerSide === "source" &&
              shareAttachmentsWithPeer !== savedShareAttachmentsWithPeer
            }
            onSaveShareSettings={() => void saveShareAttachmentsOnly()}
            onPrint={handlePrint}
          />
        ) : null}
      </form>
    </Form>
  );

  const deleteDialog =
    deleteRequestDraft && user?.uid ? (
      <InterCompanyRequestDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        userId={user.uid}
        userName={customUser?.displayName || user.displayName || user.email || undefined}
        draft={deleteRequestDraft}
        onSent={() => setDeleteTick((n) => n + 1)}
      />
    ) : null;

  const reverseDialog =
    reverseRequestDraft && companyId && user?.uid ? (
      <InterCompanyRequestReverseDialog
        open={reverseDialogOpen}
        onOpenChange={setReverseDialogOpen}
        companyId={companyId}
        userId={user.uid}
        userName={customUser?.displayName || user.displayName || user.email || undefined}
        draft={reverseRequestDraft}
        onSent={() => setReverseTick((n) => n + 1)}
      />
    ) : null;

  // auto column = ribbon collapse par icon-only width; content column baaki width le
  const ribbonLayout = (
    <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[auto_1fr] md:gap-4">
      <InterCompanyRibbonNav
        active={ribbonTab}
        onChange={setRibbonTab}
        pendingRevertCount={pendingRevertCount}
        pendingDeleteCount={pendingDeleteCount}
        pendingSystemJoinCount={pendingSystemJoinCount}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{formInner}</div>
    </div>
  );

  if (inDialog) {
    return (
      <>
        <div className="flex min-h-0 flex-col gap-3 px-1 pb-2 md:px-0">{ribbonLayout}</div>
        {reverseDialog}
        {deleteDialog}
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className={interCompanyPageHeaderClass}>
        <ArrowLeftRight className="h-5 w-5 text-emerald-800 dark:text-emerald-300" />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-emerald-950 dark:text-emerald-50">Inter Company</h1>
          <p className="text-xs text-emerald-900/75 dark:text-emerald-200/80">
            Voucher · Inter Com System · connect via company A/c No
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1 px-4 py-3">{ribbonLayout}</div>
      {reverseDialog}
      {deleteDialog}
    </div>
  );
}
