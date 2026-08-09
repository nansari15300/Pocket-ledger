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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  deleteInterCompanyVoucherLocalCopyOnly,
  saveInterCompanyVoucherPair,
} from "@/lib/interCompany/saveInterCompanyVoucherPair";
import { reconcileAndPatchInterCompanyAttachmentSharing } from "@/lib/interCompany/interCompanySharedAttachments";
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
import { uploadVoucherAttachmentFileToFirebase } from "@/lib/voucherFormAttachmentSave";
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
import {
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
  const { can, canEditRecord, canPerformBackdatedAction, canDeleteVoucher, fileAttachmentLimits, allowAttachments, role } =
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
  const [linkId, setLinkId] = useState<string | null>(null);
  /** Source ki apni attachments (own side); target ki apni attachments alag box me */
  const [sourceFiles, setSourceFiles] = useState<(File | string)[]>([]);
  const [targetFiles, setTargetFiles] = useState<(File | string)[]>([]);
  /** ON = source ki attachments target copy par bhi dikhengi */
  const [shareSourceAttachmentsWithPeer, setShareSourceAttachmentsWithPeer] = useState(false);
  const [savedShareSourceAttachmentsWithPeer, setSavedShareSourceAttachmentsWithPeer] = useState(false);
  /** ON = target ki attachments source copy par bhi dikhengi */
  const [shareTargetAttachmentsWithSource, setShareTargetAttachmentsWithSource] = useState(false);
  const [savedShareTargetAttachmentsWithSource, setSavedShareTargetAttachmentsWithSource] = useState(false);
  /** Tick: doosri company ki account side bhi edit + save pe apply (jab peer company exist) */
  const [applyAccountChangesToOtherSide, setApplyAccountChangesToOtherSide] = useState(false);
  const [reverseTick, setReverseTick] = useState(0);
  const [voucherOverride, setVoucherOverride] = useState<Record<string, unknown> | null>(null);
  const lastHydratedVoucherIdRef = useRef<string | null>(null);
  /** Async next-no fetch � hydrate ke baad overwrite na ho */
  const voucherNumberFetchGenRef = useRef(0);
  const seed = (voucher || defaultVoucherData) as Record<string, unknown> | null | undefined;
  const displayVoucher = (voucherOverride ?? voucher) as Record<string, unknown> | null | undefined;

  useEffect(() => {
    setVoucherOverride(null);
    setApplyAccountChangesToOtherSide(false);
  }, [voucher?.id]);

  const hasPersistedIc = !!(displayVoucher?.id || savedSourceId);
  // IC edit independent — global approve/target view-lock hata diya; sirf permission `editingDisabled`.
  const isInterCompanyEditLocked = false;
  const isCompanyAdmin =
    role === "owner" || customUser?.role === "CompanyAdmin" || customUser?.role === "SuperAdmin";
  const fieldsDisabled = editingDisabled || isInterCompanyEditLocked;

  const buildIcExtrasSig = useCallback(
    (args: {
      sourcePayeeKind: string;
      sourcePayeeId: string;
      targetPayeeKind: string;
      targetPayeeId: string;
      sourceCompanyBankId: string;
      targetCompanyBankId: string;
      sourceFiles: (File | string)[];
      targetFiles: (File | string)[];
    }) => {
      const fileSig = (files: (File | string)[]) =>
        files
          .map((f) =>
            typeof f === "string" ? f : `pending:${f.name}:${f.size}:${f.lastModified}`
          )
          .join("\n");
      return [
        args.sourcePayeeKind,
        args.sourcePayeeId,
        args.targetPayeeKind,
        args.targetPayeeId,
        args.sourceCompanyBankId,
        args.targetCompanyBankId,
        fileSig(args.sourceFiles),
        fileSig(args.targetFiles),
      ].join("|");
    },
    []
  );
  const [icExtrasBaseline, setIcExtrasBaseline] = useState("");

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

  /**
   * Attachments upload — save se pehle URL list + in-memory blobs peer copy ke liye.
   * `uploadCompanyId` — source ki files source company me, target ki files target company me.
   */
  const resolveFileUrlsForSave = useCallback(
    async (
      filesList: (File | string)[],
      uploadCompanyId: string | null,
      existingVoucherId: string | null,
      planContext?: { planId?: string; storageOption?: string }
    ): Promise<{ fileUrls: string[]; attachmentBlobByRef: Map<string, Blob> }> => {
      const attachmentBlobByRef = new Map<string, Blob>();
      const cid = String(uploadCompanyId || "").trim();
      if (!cid || !allowAttachments) {
        return {
          fileUrls: filesList.filter((f): f is string => typeof f === "string"),
          attachmentBlobByRef,
        };
      }
      let fileUrls = filesList.filter((f): f is string => typeof f === "string");
      const newFiles = filesList.filter((f): f is File => f instanceof File);
      if (newFiles.length === 0) return { fileUrls, attachmentBlobByRef };

      const totalNewBytes = newFiles.reduce((sum, f) => sum + (f.size || 0), 0);
      const limitCheck = await checkStorageLimit(
        cid,
        planContext?.planId ?? company?.planId,
        { attachmentsBytes: totalNewBytes, storageBytes: totalNewBytes },
        planContext?.storageOption ?? company?.storageOption
      );
      if (!limitCheck.allowed) {
        throw new Error(limitCheck.message || "Storage limit reached");
      }

      if (await shouldStageNewVoucherFilesAsLocalPending(cid)) {
        const { fileUrls: merged } = await appendLocalOnlyVoucherFilesToUrls({
          companyId: cid,
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
            await incrementCompanyStorage(cid, {
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
          const url = await uploadVoucherAttachmentFileToFirebase({
            companyId: cid,
            voucherType: "inter_company",
            file,
          });
          fileUrls.push(url);
          attachmentBlobByRef.set(url, file);
          await incrementCompanyStorage(cid, {
            attachmentsBytes: file.size,
            storageBytes: file.size,
          });
        }
      }
      return { fileUrls, attachmentBlobByRef };
    },
    [allowAttachments, company, fileAttachmentLimits.maxFileCount]
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

    const isTargetDoc = link?.role === "target";
    const dedupeStrings = (list: string[]): string[] => {
      const seen = new Set<string>();
      return list.filter((u) => {
        const s = String(u || "").trim();
        if (!s || seen.has(s)) return false;
        seen.add(s);
        return true;
      });
    };
    const readOwnFileUrls = (r: Record<string, unknown>): string[] => {
      const ownRaw = r.interCompanyOwnFileUrls;
      const legacyRaw = r.fileUrls;
      return dedupeStrings(
        Array.isArray(ownRaw) ? (ownRaw as string[]) : Array.isArray(legacyRaw) ? (legacyRaw as string[]) : []
      );
    };

    // Own side attachments — is doc ka apna fileUrls; reversal attachments (agar hain) bhi jode
    const rev = row.interCompanyReversal as { attachmentUrls?: string[] } | undefined;
    const ownFiles = dedupeStrings([
      ...readOwnFileUrls(row),
      ...(Array.isArray(rev?.attachmentUrls) ? rev!.attachmentUrls! : []),
    ]);
    if (isTargetDoc) {
      setTargetFiles(ownFiles);
      setSourceFiles([]);
    } else {
      setSourceFiles(ownFiles);
      setTargetFiles([]);
    }

    const shareSourceRaw = row.interCompanyShareAttachmentsWithPeer;
    let shareSource = shareSourceRaw === true;
    if (typeof shareSourceRaw !== "boolean") {
      // Legacy vouchers (field never saved) — purana single-checkbox behaviour: source files hone par ON maana
      shareSource = !isTargetDoc && ownFiles.length > 0;
    }
    setShareSourceAttachmentsWithPeer(shareSource);
    setSavedShareSourceAttachmentsWithPeer(shareSource);

    const shareTarget = row.interCompanySharePeerAttachmentsToSource === true;
    setShareTargetAttachmentsWithSource(shareTarget);
    setSavedShareTargetAttachmentsWithSource(shareTarget);

    // Edit: company bank — pehle is doc par denormalized ids; phir peer se missing side + peer ki apni attachments
    let bankHydrateCancelled = false;
    void (async () => {
      const denorm = resolveInterCompanyBankIdsForEdit(row);
      let srcBank = denorm.sourceCompanyBankAccountId;
      let tgtBank = denorm.targetCompanyBankAccountId;
      let peer: Record<string, unknown> | null = null;
      if (link?.peerCompanyId && link?.peerVoucherId) {
        try {
          const snap = await getDoc(
            doc(firestore, `companies/${link.peerCompanyId}/vouchers`, link.peerVoucherId),
          );
          if (snap.exists()) peer = snap.data() as Record<string, unknown>;
        } catch {
          /* offline */
        }
      }
      if (peer) {
        const peerDenorm = resolveInterCompanyBankIdsForEdit(peer);
        if (!srcBank) {
          srcBank =
            peerDenorm.sourceCompanyBankAccountId ||
            (link!.role === "target" ? readInterCompanyCompanyBankId(peer) : "");
        }
        if (!tgtBank) {
          tgtBank =
            peerDenorm.targetCompanyBankAccountId ||
            (link!.role === "source" ? readInterCompanyCompanyBankId(peer) : "");
        }
      }
      if (!srcBank && !link) srcBank = readInterCompanyCompanyBankId(row);
      if (!bankHydrateCancelled) {
        if (srcBank) setSourceCompanyBankId(srcBank);
        if (tgtBank) setTargetCompanyBankId(tgtBank);
        let sourceFilesNext = isTargetDoc ? ([] as string[]) : ownFiles;
        let targetFilesNext = isTargetDoc ? ownFiles : ([] as string[]);
        if (peer) {
          const peerOwnFiles = readOwnFileUrls(peer);
          if (isTargetDoc) {
            setSourceFiles(peerOwnFiles);
            sourceFilesNext = peerOwnFiles;
          } else {
            setTargetFiles(peerOwnFiles);
            targetFilesNext = peerOwnFiles;
          }
        }
        setIcExtrasBaseline(
          buildIcExtrasSig({
            sourcePayeeKind: sourceEntity?.kind || "party",
            sourcePayeeId: sourceEntity?.id || "",
            targetPayeeKind: targetEntity?.kind || "party",
            targetPayeeId: targetEntity?.id || "",
            sourceCompanyBankId: srcBank || "",
            targetCompanyBankId: tgtBank || "",
            sourceFiles: sourceFilesNext,
            targetFiles: targetFilesNext,
          })
        );
      }
    })();

    return () => {
      bankHydrateCancelled = true;
    };
  }, [displayVoucher, form, savedSourceId, companyId, buildIcExtrasSig]);

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

  // Target dropdown — my / shared / local + Firebase Code/A/c/PAN resolve
  const {
    joinedPartners: targetJoinedPartners,
    comboboxOptionsIncluding: targetComboboxOptionsIncluding,
    resolveCompanyIdByAcNoAsync: resolveJoinedCompanyIdByAcNo,
    resolveCompanyIdByCompanyCodeAsync: resolveJoinedCompanyIdByCompanyCode,
    resolveCompaniesByMobile: resolveJoinedCompaniesByMobile,
    resolveCompaniesByPanAsync: resolveJoinedCompaniesByPan,
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

  const sourceEntitiesCompanyId = hasPersistedIc
    ? editEntityCompanyIds.sourceEntitiesCompanyId
    : companyId || "";
  const targetEntitiesCompanyId = hasPersistedIc
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

  // Edit: source column — peer company ka real row (target-copy se kholo to current company source nahi)
  const sourceCompanyForDisplay = useMemo(() => {
    const sid = hasPersistedIc
      ? editEntityCompanyIds.sourceEntitiesCompanyId
      : companyId || "";
    return (allCompanies || []).find((c) => c.id === sid) ?? company ?? null;
  }, [
    hasPersistedIc,
    editEntityCompanyIds.sourceEntitiesCompanyId,
    companyId,
    allCompanies,
    company,
  ]);

  const isPeerSourceCompany =
    hasPersistedIc &&
    !!editEntityCompanyIds.sourceEntitiesCompanyId &&
    editEntityCompanyIds.sourceEntitiesCompanyId !== companyId;

  const sourceStickyCompanyCode = useStickyInterCompanyCompanyCode(sourceCompanyForDisplay);
  const targetStickyCompanyCode = useStickyInterCompanyCompanyCode(targetCompany);

  // Edit: interCompanyLink.role � source copy = Payment Out; target copy = Payment In
  const icViewerSide = interCompanyVoucherViewerSide(voucherRow);
  const showSourcePaymentOutBadge = hasPersistedIc && icViewerSide === "source";
  const showTargetPaymentInBadge = hasPersistedIc && icViewerSide === "target";
  const icLink = readInterCompanyLink(voucherRow);

  /**
   * Target apni copy khud kholta hai — apni taraf (entity/bank/attachment/share) ab editable,
   * source approve karne tak. `fieldsDisabled` (company-select row, shared amount/narration/etc.)
   * purane jaisa hi rehta hai — sirf target ki apni account rows ke liye ye alag flag.
   */
  const isTargetOwnSideApprovedLock = false;
  /**
   * Create: dono sides editable.
   * Edit: apni side editable; dusri side RO jab tak “Also apply on other side” tick na ho (+ peer company exist).
   * Attachments: sirf apni side editable (tick sirf account fields).
   */
  const peerCompanyExists = Boolean(
    String(targetCompanyId || displayTargetCompanyId || icLink?.peerCompanyId || "").trim()
  );
  const canEditOtherSideAccounts = applyAccountChangesToOtherSide && peerCompanyExists;
  const sourceSideDisabled = !hasPersistedIc
    ? fieldsDisabled
    : icViewerSide === "source"
      ? fieldsDisabled
      : !canEditOtherSideAccounts;
  const targetSideDisabled = !hasPersistedIc
    ? fieldsDisabled
    : icViewerSide === "target"
      ? fieldsDisabled
      : !canEditOtherSideAccounts;
  const sourceAttachDisabled = !hasPersistedIc
    ? fieldsDisabled
    : icViewerSide !== "source" || fieldsDisabled;
  const targetAttachDisabled = !hasPersistedIc
    ? fieldsDisabled
    : icViewerSide !== "target" || fieldsDisabled;
  /** Footer — IC ab Edit Trxn; lock nahi */
  const isIcFooterViewOnly = false;

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

  /** Attachment box storage caps — jis company ki apni file hai us company ke plan/storage se */
  const sourceCompanyIdForAttachBox =
    icViewerSide === "target" ? String(icLink?.peerCompanyId || "").trim() || null : companyId;
  const targetCompanyIdForAttachBox =
    icViewerSide === "target" ? companyId : displayTargetCompanyId || icLink?.peerCompanyId || null;

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

  // Edit: peer source / target company ka Inter Co. A/c — real company row se display
  useEffect(() => {
    if (!hasPersistedIc) return;
    const ids = new Set(
      [editEntityCompanyIds.sourceEntitiesCompanyId, displayTargetCompanyId].filter(Boolean)
    );
    for (const cid of ids) {
      const row = (allCompanies || []).find((c) => c.id === cid);
      if (row && !readCompanyInterCompanyAcNo(row)) void ensureCompanyInterCompanyAcNo(cid);
    }
  }, [
    hasPersistedIc,
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
    if (!String(sourcePayeeId || "").trim()) {
      toast.error("Source: select account");
      return false;
    }
    if (!String(targetPayeeId || "").trim()) {
      toast.error("Target: select account");
      return false;
    }
    if (
      sourcePayeeKind === "bank" &&
      String(sourcePayeeId) === String(sourceCompanyBankId || "").trim()
    ) {
      toast.error("Source account must be different from clearing account");
      return false;
    }
    if (
      targetPayeeKind === "bank" &&
      String(targetPayeeId) === String(targetCompanyBankId || "").trim()
    ) {
      toast.error("Target account must be different from clearing account");
      return false;
    }
    return true;
  };

  const icExtrasDirty =
    !!savedSourceId &&
    buildIcExtrasSig({
      sourcePayeeKind,
      sourcePayeeId,
      targetPayeeKind,
      targetPayeeId,
      sourceCompanyBankId,
      targetCompanyBankId,
      sourceFiles,
      targetFiles,
    }) !== icExtrasBaseline;

  const icFooterDirty =
    isFormDirty ||
    !savedSourceId ||
    icExtrasDirty ||
    shareSourceAttachmentsWithPeer !== savedShareSourceAttachmentsWithPeer ||
    shareTargetAttachmentsWithSource !== savedShareTargetAttachmentsWithSource;

  const ownSideSaveBlocked =
    hasPersistedIc
      ? icViewerSide === "target"
        ? targetSideDisabled
        : sourceSideDisabled
      : fieldsDisabled;

  const processAndSave = async (opts?: {
    saveAndNew?: boolean;
    approveAfterSave?: boolean;
    saveAndPrint?: boolean;
  }) => {
    // Apni side editable hona zaroori — bina tick ke source-view par target RO tha to purana guard Save rok deta tha
    if (ownSideSaveBlocked || isLoading) return;
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
      // Target apni copy se save kare to "source" = peer (asli source company), "target" = current company
      const resolvedSourceCompanyId =
        icViewerSide === "target"
          ? String(icLink?.peerCompanyId || link?.peerCompanyId || "").trim() || companyId
          : companyId;
      const resolvedTargetCompanyId =
        icViewerSide === "target" ? companyId : String(values.targetCompanyId || "").trim();
      const sourcePlanContext =
        icViewerSide === "target"
          ? { planId: sourceCompanyForDisplay?.planId, storageOption: sourceCompanyForDisplay?.storageOption }
          : { planId: company?.planId, storageOption: company?.storageOption };
      const targetPlanContext =
        icViewerSide === "target"
          ? { planId: company?.planId, storageOption: company?.storageOption }
          : { planId: targetCompany?.planId, storageOption: targetCompany?.storageOption };

      const [
        { fileUrls: sourceFileUrls, attachmentBlobByRef: sourceAttachmentBlobByRef },
        { fileUrls: targetFileUrls, attachmentBlobByRef: targetAttachmentBlobByRef },
      ] = await Promise.all([
        resolveFileUrlsForSave(sourceFiles, resolvedSourceCompanyId, savedSourceId, sourcePlanContext),
        resolveFileUrlsForSave(targetFiles, resolvedTargetCompanyId, peerVoucherId, targetPlanContext),
      ]);

      const result = await saveInterCompanyVoucherPair({
        sourceCompanyId: resolvedSourceCompanyId,
        targetCompanyId: resolvedTargetCompanyId,
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
        sourceCompanyName: sourceCompanyForDisplay?.name || company?.name,
        targetCompanyName: targetCompany?.name,
        existingSourceVoucherId: savedSourceId,
        existingTargetVoucherId: peerVoucherId,
        existingLinkId: linkId || link?.linkId,
        approveSourceAfterSave: opts?.approveAfterSave,
        sourceFileUrls,
        targetFileUrls,
        sourceAttachmentBlobByRef,
        targetAttachmentBlobByRef,
        shareSourceAttachmentsWithPeer,
        shareTargetAttachmentsWithSource,
      });

      setSavedSourceId(result.sourceId);
      setPeerTargetVoucherId(result.targetId);
      setLinkId(result.linkId);
      setSourceFiles(sourceFileUrls);
      setTargetFiles(targetFileUrls);
      setSavedShareSourceAttachmentsWithPeer(shareSourceAttachmentsWithPeer);
      setSavedShareTargetAttachmentsWithSource(shareTargetAttachmentsWithSource);
      setIcExtrasBaseline(
        buildIcExtrasSig({
          sourcePayeeKind,
          sourcePayeeId,
          targetPayeeKind,
          targetPayeeId,
          sourceCompanyBankId,
          targetCompanyBankId,
          sourceFiles: sourceFileUrls,
          targetFiles: targetFileUrls,
        })
      );
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
        setSourceFiles([]);
        setTargetFiles([]);
        setShareSourceAttachmentsWithPeer(false);
        setSavedShareSourceAttachmentsWithPeer(false);
        setShareTargetAttachmentsWithSource(false);
        setSavedShareTargetAttachmentsWithSource(false);
        setApplyAccountChangesToOtherSide(false);
        setIcExtrasBaseline("");
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
    const voucherId = String(
      voucher?.id || savedSourceId || currentLinkedVoucherId || displayVoucher?.id || ""
    ).trim();
    if (!voucherId) {
      toast.error("Voucher not found");
      return;
    }
    if (!companyId) {
      toast.error("Select a company first");
      return;
    }
    if (!user?.uid) {
      toast.error("Sign in to delete this voucher");
      return;
    }
    const rowForPerm = (displayVoucher || voucher || { id: voucherId, type: "inter_company" }) as {
      id?: string;
      type?: string;
      userId?: string;
      isApproved?: boolean;
    };
    if (!canDeleteVoucher(rowForPerm as never)) {
      toast.error("You do not have permission to delete this voucher");
      return;
    }
    const toastId = toast.loading("Deleting…");
    setIsLoading(true);
    try {
      await deleteInterCompanyVoucherLocalCopyOnly({
        companyId,
        voucherId,
        deletedByUid: user.uid,
      });
      toast.success("Moved to recycle bin on this company", { id: toastId });
      onVoucherAction?.("cancelled");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed";
      toast.error("Delete failed", { id: toastId, description: message });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Share checkbox toggle — jab is side ke pay fields already locked (approved) hon to bhi
   * checkbox interactive rehta hai; is case me poora form save karne ke bajay sirf share
   * pref + attachments turant reconcile/patch kar do (dono voucher docs par).
   */
  const persistAttachmentShareToggle = async (side: "source" | "target", nextValue: boolean) => {
    if (isLoading || !user?.uid || !companyId || !hasPersistedIc) return;
    const link = readInterCompanyLink((displayVoucher || voucher) as Record<string, unknown> | undefined);
    const sourceCompanyIdForShare =
      icViewerSide === "target" ? String(icLink?.peerCompanyId || link?.peerCompanyId || "").trim() : companyId;
    const sourceVoucherIdForShare = String(savedSourceId || "").trim();
    const targetCompanyIdForShare =
      icViewerSide === "target"
        ? companyId
        : String(form.getValues("targetCompanyId") || displayTargetCompanyId || link?.peerCompanyId || "").trim();
    const targetVoucherIdForShare = String(peerTargetVoucherId || link?.peerVoucherId || "").trim();
    if (!sourceCompanyIdForShare || !sourceVoucherIdForShare || !targetCompanyIdForShare || !targetVoucherIdForShare) {
      toast.error("Linked voucher not found");
      return;
    }
    const nextShareSource = side === "source" ? nextValue : shareSourceAttachmentsWithPeer;
    const nextShareTarget = side === "target" ? nextValue : shareTargetAttachmentsWithSource;
    const toastId = toast.loading("Saving attachment share…");
    setIsLoading(true);
    try {
      const sourceOwnFileUrls = sourceFiles.filter((f): f is string => typeof f === "string");
      const targetOwnFileUrls = targetFiles.filter((f): f is string => typeof f === "string");
      const shareResult = await reconcileAndPatchInterCompanyAttachmentSharing({
        sourceCompanyId: sourceCompanyIdForShare,
        sourceVoucherId: sourceVoucherIdForShare,
        sourceOwnFileUrls,
        shareSourceToTarget: nextShareSource,
        targetCompanyId: targetCompanyIdForShare,
        targetVoucherId: targetVoucherIdForShare,
        targetOwnFileUrls,
        shareTargetToSource: nextShareTarget,
      });
      if (side === "source") {
        setShareSourceAttachmentsWithPeer(nextValue);
        setSavedShareSourceAttachmentsWithPeer(nextValue);
      } else {
        setShareTargetAttachmentsWithSource(nextValue);
        setSavedShareTargetAttachmentsWithSource(nextValue);
      }
      toast.success(
        nextValue ? "Attachment will show on other company's copy" : "Attachment hidden from other company's copy",
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
                    if (hasPersistedIc) return;
                    const nextId = String(id || "").trim();
                    if (!nextId || field.value === nextId) return;
                    field.onChange(nextId);
                    setTargetPayeeId("");
                    setTargetCompanyBankId("");
                  }}
                  fieldsDisabled={hasPersistedIc || fieldsDisabled}
                  accountFieldsDisabled={targetSideDisabled}
                  headerTrailing={
                    peerCompanyExists ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Checkbox
                          id="ic-apply-account-changes-other-side"
                          checked={applyAccountChangesToOtherSide}
                          disabled={fieldsDisabled}
                          onCheckedChange={(v) => setApplyAccountChangesToOtherSide(v === true)}
                        />
                        <Label
                          htmlFor="ic-apply-account-changes-other-side"
                          className={cn(
                            "whitespace-nowrap text-[10px] font-normal leading-tight",
                            fieldsDisabled ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer"
                          )}
                        >
                          Also apply on other side
                        </Label>
                      </div>
                    ) : null
                  }
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
                    if (targetSideDisabled) return;
                    setTargetPayeeKind(k);
                  }}
                  payeeId={targetPayeeId}
                  onPayeeIdChange={(id) => {
                    if (targetSideDisabled) return;
                    setTargetPayeeId(id);
                  }}
                  targetCompanyDisplayName={targetCompanyDisplayName}
                  showPaymentInBadge={showTargetPaymentInBadge}
                  showRevertedBadge={showIcRevertedBadge}
                  companyBankAccountId={targetCompanyBankId}
                  onCompanyBankAccountIdChange={(id) => {
                    if (targetSideDisabled) return;
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
              if (sourceSideDisabled) return;
              setSourcePayeeKind(k);
            }}
            payeeId={sourcePayeeId}
            onPayeeIdChange={(id) => {
              if (sourceSideDisabled) return;
              setSourcePayeeId(id);
            }}
            fieldsDisabled={sourceSideDisabled}
            isPeerSourceCompany={isPeerSourceCompany}
            showPaymentOutBadge={showSourcePaymentOutBadge}
            showRevertedBadge={showIcRevertedBadge}
            companyBankAccountId={sourceCompanyBankId}
            onCompanyBankAccountIdChange={(id) => {
              if (sourceSideDisabled) return;
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-stretch">
        <InterCompanyVoucherAttachments
          title="Source Attach"
          files={sourceFiles}
          onFilesChange={setSourceFiles}
          disabled={sourceAttachDisabled}
          allowPreviewWhenDisabled
          className="h-full"
          shareWithPeer={shareSourceAttachmentsWithPeer}
          onShareWithPeerChange={(v) => {
            setShareSourceAttachmentsWithPeer(v);
            if (hasPersistedIc) void persistAttachmentShareToggle("source", v);
          }}
          showShareCheckbox
          shareCheckboxDisabled={sourceAttachDisabled}
          checkboxLabel="Show my attachment on other side"
          checkboxId="ic-share-source-attachments-with-peer"
          companyId={sourceCompanyIdForAttachBox}
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
                    readOnly={false}
                    disabled={editingDisabled}
                    rows={3}
                    className={cn(interCompanyNarrationTextareaInCardClass)}
                    placeholder="Same on both companies + auto inter-company line"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <InterCompanyVoucherAttachments
          title="Target Attach"
          files={targetFiles}
          onFilesChange={setTargetFiles}
          disabled={targetAttachDisabled}
          allowPreviewWhenDisabled
          className="h-full"
          shareWithPeer={shareTargetAttachmentsWithSource}
          onShareWithPeerChange={(v) => {
            setShareTargetAttachmentsWithSource(v);
            if (hasPersistedIc) void persistAttachmentShareToggle("target", v);
          }}
          showShareCheckbox
          shareCheckboxDisabled={targetAttachDisabled}
          checkboxLabel="Show my attachment on other side"
          checkboxId="ic-share-target-attachments-with-peer"
          companyId={targetCompanyIdForAttachBox}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Clearing account and Source/Target account are required on both sides. Unapproved: amount stays on
        clearing (Payment Out = Cr, Payment In = Dr). After approve: clearing is intermediary (Dr+Cr) and
        amount moves to the account.
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
            editingDisabled={icViewerSide === "target" ? targetSideDisabled : sourceSideDisabled}
            isEditViewOnly={isIcFooterViewOnly}
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
            onPrint={handlePrint}
          />
        ) : null}
      </form>
    </Form>
  );

  // auto column = ribbon collapse par icon-only width; content column baaki width le
  const ribbonLayout = (
    <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[auto_1fr] md:gap-4">
      <InterCompanyRibbonNav
        active={ribbonTab}
        onChange={setRibbonTab}
        pendingSystemJoinCount={pendingSystemJoinCount}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{formInner}</div>
    </div>
  );

  if (inDialog) {
    return (
      <div className="flex min-h-0 flex-col gap-3 px-1 pb-2 md:px-0">{ribbonLayout}</div>
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
    </div>
  );
}
