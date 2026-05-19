"use client";

/**
 * Inter-company voucher — ribbon: Voucher | Invite | Join; linked save on both companies.
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
  saveInterCompanyVoucherPair,
} from "@/lib/interCompany/saveInterCompanyVoucherPair";
import {
  inferInterCompanyEntity,
  readInterCompanyEntityLabelSnapshot,
  readInterCompanyLink,
  resolveInterCompanyEditCompanyIds,
  interCompanyVoucherViewerSide,
} from "@/lib/interCompany/interCompanyVoucherHydrate";
import { getNextInterCompanyVoucherNumber } from "@/lib/interCompany/nextInterCompanyVoucherNumber";
import type { InterCompanyEntityDetail } from "@/lib/interCompany/interCompanyEntityTypes";
import { openPrintDirect } from "@/lib/printDirect";
import type { InterCompanyEntityKind } from "@/components/inter-company/InterCompanyEntitySide";
import { useInterCompanyEntities } from "@/components/inter-company/useInterCompanyEntities";
import { readCompanyInterCompanyAcNo } from "@/lib/interCompany/interCompanyAccountNo";
import { normalizeInterCompanyPhone } from "@/lib/interCompany/interCompanyPhone";
import { useInterCompanyPartnerDirectory } from "@/lib/interCompany/useInterCompanyPartnerDirectory";
import { ensureCompanyInterCompanyAcNo } from "@/lib/interCompany/ensureCompanyInterCompanyAcNo";
import {
  interCompanyDateButtonClass,
  interCompanyInputClass,
  interCompanyNarrationCardClass,
  interCompanyNarrationTextareaInCardClass,
  interCompanyPageHeaderClass,
  interCompanyPanelClass,
  interCompanyVoucherTabShellClass,
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
  canPartnersSearchTargetAccountsByName,
  filterPartnersByJoined,
  readInterCompanyLocalSettings,
} from "@/lib/interCompany/interCompanyLocalStore";
import { InterCompanyTargetConnectSection } from "@/components/inter-company/InterCompanyTargetConnectSection";
import { InterCompanySourcePaySection } from "@/components/inter-company/InterCompanySourcePaySection";
import { InterCompanyVoucherIdentityStrip } from "@/components/inter-company/InterCompanyVoucherIdentityStrip";
import {
  InterCompanyRibbonNav,
  type InterCompanyRibbonTab,
} from "@/components/inter-company/InterCompanyRibbonNav";
import { InterCompanyInvitePanel } from "@/components/inter-company/InterCompanyInvitePanel";
import { InterCompanyJoinSettingsPanel } from "@/components/inter-company/InterCompanyJoinSettingsPanel";
import { InterCompanyVoucherFooter } from "@/components/inter-company/InterCompanyVoucherFooter";
import { InterCompanyRequestReverseDialog } from "@/components/inter-company/InterCompanyRequestReverseDialog";
import { InterCompanyReverseRequestsPanel } from "@/components/inter-company/InterCompanyReverseRequestsPanel";
import { readEntityAcNoField } from "@/lib/interCompany/interCompanyEntityLookup";
import {
  countPendingReverseInbox,
  IC_REVERSE_REQUESTS_CHANGED,
  isSourceVoucherReversePendingOrDone,
} from "@/lib/interCompany/interCompanyReverseRequests";

const interCompanySchema = z.object({
  voucherNumber: z.string().min(1, "Voucher number required"),
  date: z.date({ message: "Date required" }),
  targetCompanyId: z.string().min(1, "Select target company"),
  amount: z.coerce.number().min(0.01, "Amount must be positive"),
  narration: z.string().optional(),
});

type InterCompanyFormValues = z.infer<typeof interCompanySchema>;

/** Edit par entity list me missing row — save-time label snapshot se card/combobox bhare */
function mergeHydratedEntity(
  entities: InterCompanyEntityDetail[],
  kind: InterCompanyEntityKind,
  id: string,
  voucher: Record<string, unknown> | null | undefined,
  side: "source" | "target"
): InterCompanyEntityDetail[] {
  if (!id) return entities;
  if (entities.some((e) => e.kind === kind && e.id === id)) return entities;
  const label = readInterCompanyEntityLabelSnapshot(voucher, side);
  if (!label) return entities;
  return [...entities, { id, kind, label }];
}

function TwoColumnEntityGrid({
  targetCompanyField,
  sourcePanel,
}: {
  targetCompanyField: ReactNode;
  sourcePanel: ReactNode;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className={interCompanyPanelClass}>{sourcePanel}</div>
      <div className={interCompanyPanelClass}>
        <div className="flex flex-col gap-3 p-3">{targetCompanyField}</div>
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
};

export function InterCompanyVoucherForm({
  inDialog = false,
  onVoucherAction,
  onOpenHistory,
  showHistoryButton = false,
  editingDisabled = false,
  deleteDisabledWhenLinked = false,
  showApproveButton = false,
  onApprove,
  isApproving = false,
  voucher,
  defaultVoucherData,
}: InterCompanyVoucherFormProps) {
  const { user, customUser } = useAuth();
  const { can, canEditRecord, canPerformBackdatedAction, fileAttachmentLimits, allowAttachments, role } =
    usePermissions();
  const { company, companyId, allCompanies } = useCompany();
  const { formatDate, formatCurrency, formatCurrencyForPrint, dateSystem } = useDate();

  const [ribbonTab, setRibbonTab] = useState<InterCompanyRibbonTab>("voucher");
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [sourcePayeeKind, setSourcePayeeKind] = useState<InterCompanyEntityKind>("party");
  const [sourcePayeeId, setSourcePayeeId] = useState("");
  const [targetPayeeKind, setTargetPayeeKind] = useState<InterCompanyEntityKind>("party");
  const [targetPayeeId, setTargetPayeeId] = useState("");
  const [icSettingsTick, setIcSettingsTick] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [savedSourceId, setSavedSourceId] = useState<string | null>(null);
  const [peerTargetVoucherId, setPeerTargetVoucherId] = useState<string | null>(null);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [files, setFiles] = useState<(File | string)[]>([]);
  const [reverseDialogOpen, setReverseDialogOpen] = useState(false);
  const [reverseTick, setReverseTick] = useState(0);
  const lastHydratedVoucherIdRef = useRef<string | null>(null);
  /** Async next-no fetch — hydrate ke baad overwrite na ho */
  const voucherNumberFetchGenRef = useRef(0);
  const seed = (voucher || defaultVoucherData) as Record<string, unknown> | null | undefined;

  const isInterCompanyEditLocked = !!(voucher?.id || savedSourceId);
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
    if (voucher?.id || savedSourceId || lastHydratedVoucherIdRef.current) return;
    const gen = ++voucherNumberFetchGenRef.current;
    try {
      const nextNo = await getNextInterCompanyVoucherNumber(companyId, company as Record<string, unknown>);
      if (gen !== voucherNumberFetchGenRef.current) return;
      form.setValue("voucherNumber", nextNo);
    } catch (err) {
      console.warn("[interCompany] voucher number fetch failed", err);
    }
  }, [company, companyId, form, isAutoVoucherEnabled, savedSourceId, voucher?.id]);

  /** Attachments upload — save se pehle URL list */
  const resolveFileUrlsForSave = useCallback(
    async (existingVoucherId: string | null): Promise<string[]> => {
      if (!companyId || !allowAttachments) {
        return files.filter((f): f is string => typeof f === "string");
      }
      let fileUrls = files.filter((f): f is string => typeof f === "string");
      const newFiles = files.filter((f): f is File => f instanceof File);
      if (newFiles.length === 0) return fileUrls;

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
          await incrementCompanyStorage(companyId, {
            attachmentsBytes: file.size,
            storageBytes: file.size,
          });
        }
      }
      return fileUrls;
    },
    [allowAttachments, company, companyId, fileAttachmentLimits.maxFileCount, files]
  );

  useEffect(() => {
    if (!voucher?.id) {
      lastHydratedVoucherIdRef.current = null;
      if (!savedSourceId) void fetchVoucherNumber();
      return;
    }
    const vid = String(voucher.id);
    if (lastHydratedVoucherIdRef.current === vid) return;
    lastHydratedVoucherIdRef.current = vid;
    const row = voucher as Record<string, unknown>;
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
    setSavedSourceId(vid);
    const link = readInterCompanyLink(row);
    if (link) {
      setPeerTargetVoucherId(link.peerVoucherId);
      setLinkId(link.linkId || null);
    }
    const urls = row.fileUrls;
    const rev = row.interCompanyReversal as { attachmentUrls?: string[] } | undefined;
    const merged = [
      ...(Array.isArray(urls) ? (urls as string[]) : []),
      ...(Array.isArray(rev?.attachmentUrls) ? rev!.attachmentUrls! : []),
    ];
    const seen = new Set<string>();
    setFiles(
      merged.filter((u) => {
        const s = String(u);
        if (!s || seen.has(s)) return false;
        seen.add(s);
        return true;
      })
    );
  }, [voucher, form, fetchVoucherNumber, savedSourceId, companyId]);

  useEffect(() => {
    const onRev = () => setReverseTick((n) => n + 1);
    window.addEventListener(IC_REVERSE_REQUESTS_CHANGED, onRev);
    return () => window.removeEventListener(IC_REVERSE_REQUESTS_CHANGED, onRev);
  }, []);

  const {
    partners,
    comboboxOptions,
    comboboxOptionsIncluding,
    resolveCompanyIdByAcNo,
    resolveCompaniesByMobile,
    acNoForCompanyId,
    mobileForCompanyId,
    acNoForAnyCompanyId,
    mobileForAnyCompanyId,
  } = useInterCompanyPartnerDirectory(allCompanies, companyId);

  // Source company â€” joined list for cross-company search
  const icSettings = useMemo(
    () => (companyId ? readInterCompanyLocalSettings(companyId) : null),
    [companyId, icSettingsTick]
  );

  // Target company â€” uski privacy: name list partners ko dikhe ya nahi
  const targetAllowsNameLookup = useMemo(
    () => canPartnersSearchTargetAccountsByName(targetCompanyId),
    [targetCompanyId, icSettingsTick]
  );

  // Target account search â€” joined partners + current company (rules-safe per-company reads)
  const lookupPartners = useMemo(() => {
    const all = (allCompanies || [])
      .filter((c) => c?.id)
      .map((c) => ({
        id: c.id!,
        name: String(c.name || c.id || "").trim(),
        acNo: readCompanyInterCompanyAcNo(c),
        mobile: normalizeInterCompanyPhone(c.phone),
        isShared: c.isOwned === false,
      }));
    const joined = icSettings?.joinedCompanyIds ?? [];
    return filterPartnersByJoined(all, joined);
  }, [allCompanies, icSettings?.joinedCompanyIds]);

  // Current company par missing A/c No ho to backfill (inter-company picker ke liye).
  useEffect(() => {
    if (!companyId) return;
    if (readCompanyInterCompanyAcNo(company)) return;
    void ensureCompanyInterCompanyAcNo(companyId);
  }, [company, companyId]);

  const editEntityCompanyIds = useMemo(
    () => resolveInterCompanyEditCompanyIds(voucher as Record<string, unknown> | null, companyId || ""),
    [voucher, companyId]
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

  const voucherRow = (voucher || null) as Record<string, unknown> | null;
  const sourceEntities = useMemo(
    () =>
      mergeHydratedEntity(sourceEntitiesRaw, sourcePayeeKind, sourcePayeeId, voucherRow, "source"),
    [sourceEntitiesRaw, sourcePayeeKind, sourcePayeeId, voucherRow]
  );
  const targetEntities = useMemo(
    () =>
      mergeHydratedEntity(targetEntitiesRaw, targetPayeeKind, targetPayeeId, voucherRow, "target"),
    [targetEntitiesRaw, targetPayeeKind, targetPayeeId, voucherRow]
  );

  const displayTargetCompanyId =
    targetCompanyId || editEntityCompanyIds.targetCompanyFieldId || "";

  const targetCompany = useMemo(
    () => (allCompanies || []).find((c) => c.id === displayTargetCompanyId),
    [allCompanies, displayTargetCompanyId]
  );

  // Edit: source column — peer company ka real row (target-copy se kholo to current company source nahi)
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

  // Edit: interCompanyLink.role — source copy = Payment Out; target copy = Payment In
  const icViewerSide = interCompanyVoucherViewerSide(voucherRow);
  const showSourcePaymentOutBadge = isInterCompanyEditLocked && icViewerSide === "source";
  const showTargetPaymentInBadge = isInterCompanyEditLocked && icViewerSide === "target";
  const icLink = readInterCompanyLink(voucherRow);

  const pendingRevertCount = useMemo(
    () => (companyId ? countPendingReverseInbox(companyId) : 0),
    [companyId, reverseTick]
  );

  const sourceVoucherIdForReverse = icViewerSide === "source" ? String(voucher?.id || savedSourceId || "") : "";
  const reverseFlowState = useMemo(() => {
    if (!companyId || !sourceVoucherIdForReverse) {
      return { pending: false, accepted: !!(voucherRow as { interCompanyReversed?: boolean })?.interCompanyReversed };
    }
    return isSourceVoucherReversePendingOrDone(companyId, sourceVoucherIdForReverse);
  }, [companyId, sourceVoucherIdForReverse, voucherRow, reverseTick]);

  /** Target dropdown — edit par current/target company partners list me missing ho to bhi option add */
  const targetComboboxOptions = useMemo(
    () =>
      comboboxOptionsIncluding([
        displayTargetCompanyId,
        editEntityCompanyIds.targetCompanyFieldId,
      ]),
    [
      comboboxOptionsIncluding,
      displayTargetCompanyId,
      editEntityCompanyIds.targetCompanyFieldId,
    ]
  );

  // Edit: peer source / target company ka Inter Co. A/c — real company row se display
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

  const validateEntities = () => {
    if (!targetCompanyId) {
      toast.error("Select target company");
      return false;
    }
    if (!sourcePayeeId) {
      toast.error("Source: select account (party, bank, â€¦)");
      return false;
    }
    if (!targetPayeeId) {
      toast.error("Target: select account (party, bank, â€¦)");
      return false;
    }
    return true;
  };

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
    const toastId = toast.loading(savedSourceId ? "Updating…" : "Saving…");
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
      const fileUrls = await resolveFileUrlsForSave(savedSourceId);

      const result = await saveInterCompanyVoucherPair({
        sourceCompanyId: companyId,
        targetCompanyId: values.targetCompanyId,
        userId: user.uid,
        approverName: user.displayName || user.email || user.uid,
        voucherNumber: values.voucherNumber,
        date: voucherDate,
        amount: values.amount,
        narration: values.narration,
        sourceEntityKind: sourcePayeeKind,
        sourceEntityId: sourcePayeeId,
        targetEntityKind: targetPayeeKind,
        targetEntityId: targetPayeeId,
        sourceEntityLabel: sourceSelected?.label,
        targetEntityLabel: targetSelected?.label,
        sourceCompanyName: company?.name,
        targetCompanyName: targetCompany?.name,
        existingSourceVoucherId: savedSourceId,
        existingTargetVoucherId: peerVoucherId,
        existingLinkId: linkId || link?.linkId,
        approveSourceAfterSave: opts?.approveAfterSave,
        fileUrls,
      });

      setSavedSourceId(result.sourceId);
      setPeerTargetVoucherId(result.targetId);
      setLinkId(result.linkId);
      setFiles(fileUrls);
      if (!isEdit) {
        lastHydratedVoucherIdRef.current = result.sourceId;
        ++voucherNumberFetchGenRef.current;
      }

      toast.success(isEdit ? "Inter Company updated" : "Inter Company saved", { id: toastId });

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
                    ["Narration", values.narration || "—"],
                  ],
                },
                layout: "lightHorizontalLines",
                margin: [0, 0, 0, 12],
              },
            ],
          });
        } catch {
          toast.info("Saved — print could not open");
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

      if (opts?.approveAfterSave) onApprove?.();
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

  const handleDelete = async () => {
    if (!savedSourceId || !companyId || !user?.uid || editingDisabled) return;
    const toastId = toast.loading("Deleting…");
    setIsLoading(true);
    try {
      await deleteInterCompanyVoucherPair({
        sourceCompanyId: companyId,
        sourceVoucherId: savedSourceId,
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

  const handlePrint = () => {
    void processAndSave({ saveAndPrint: true });
  };

  const showBsDate = dateSystem === "BS" || dateSystem === "Both";
  const showAdDate = dateSystem === "AD" || dateSystem === "Both";
  const identityColCount = 1 + (showBsDate ? 1 : 0) + (showAdDate ? 1 : 0);

  const voucherTabBody = (
    <div className={cn("pl-inter-company-voucher", interCompanyVoucherTabShellClass)}>
      <div
        className="grid w-full min-w-0 items-end gap-3"
        style={{ gridTemplateColumns: `repeat(${identityColCount}, minmax(0, 1fr))` }}
      >
        <FormField
          control={form.control}
          name="voucherNumber"
          render={({ field }) => (
            <FormItem className="min-w-0 space-y-1.5">
              <FormLabel>Voucher No.</FormLabel>
              <FormControl>
                <Input {...field} className={interCompanyInputClass} disabled={fieldsDisabled} readOnly={isInterCompanyEditLocked} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <>
              {showBsDate && (
                <FormItem className="min-w-0 space-y-1.5">
                  <FormLabel>{dateSystem === "Both" ? "Date (BS)" : "Date"}</FormLabel>
                  <BsDatePicker
                    valueAD={field.value}
                    onChangeAD={(d) => {
                      if (d) d.setHours(12, 0, 0, 0);
                      field.onChange(d as Date);
                      setIsCalendarOpen(false);
                    }}
                    isRange={false}
                    className={cn(interCompanyInputClass, "w-full text-xs")}
                    disabled={fieldsDisabled}
                  />
                </FormItem>
              )}
              {showAdDate && (
                <FormItem className="min-w-0 space-y-1.5">
                  <FormLabel>{dateSystem === "Both" ? "Date (AD)" : "Date"}</FormLabel>
                  <Popover modal open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={fieldsDisabled}
                          className={cn(
                            interCompanyDateButtonClass,
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? formatDate(field.value) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="z-[102] w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={(date) => {
                          if (date) date.setHours(12, 0, 0, 0);
                          field.onChange(date);
                          setIsCalendarOpen(false);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </FormItem>
              )}
            </>
          )}
        />
      </div>
      <FormField control={form.control} name="date" render={() => <FormMessage />} />

      <TwoColumnEntityGrid
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
                    field.onChange(id);
                    setTargetPayeeId("");
                  }}
                  fieldsDisabled={fieldsDisabled}
                  comboboxOptions={targetComboboxOptions}
                  resolveCompanyIdByAcNo={resolveCompanyIdByAcNo}
                  resolveCompaniesByMobile={resolveCompaniesByMobile}
                  acNoForCompanyId={acNoForAnyCompanyId}
                  mobileForCompanyId={mobileForAnyCompanyId}
                  partners={partners}
                  lookupPartners={lookupPartners}
                  allowTargetAccountSearchByName={targetAllowsNameLookup}
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
                  targetCompanyDisplayName={targetCompany?.name || ""}
                  showPaymentInBadge={showTargetPaymentInBadge}
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
            reverseRequestDone={reverseFlowState.accepted || !!(voucherRow as { interCompanyReversed?: boolean })?.interCompanyReversed}
          />
        }
      />

      <InterCompanyVoucherIdentityStrip
        source={{
          title: "Source",
          companyName: sourceCompanyForDisplay?.name,
          companyAcNo: readCompanyInterCompanyAcNo(sourceCompanyForDisplay),
          companyMobile: normalizeInterCompanyPhone(sourceCompanyForDisplay?.phone),
          entity: sourceSelected,
        }}
        target={{
          title: "Target",
          companyName: targetCompany?.name,
          companyAcNo: displayTargetCompanyId
            ? acNoForAnyCompanyId(displayTargetCompanyId)
            : "",
          companyMobile: displayTargetCompanyId
            ? mobileForAnyCompanyId(displayTargetCompanyId)
            : "",
          entity: targetSelected,
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
          className="h-full"
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
                    disabled={fieldsDisabled}
                    readOnly={isInterCompanyEditLocked}
                    rows={3}
                    className={interCompanyNarrationTextareaInCardClass}
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
        On save: linked Inter Company vouchers on both companies (unapproved until you approve).
      </p>
    </div>
  );

  const formInner = (
    <Form {...form}>
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={form.handleSubmit(() => void processAndSave())}
      >
        <ScrollArea className="min-h-0 flex-1 pr-2">
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
            {ribbonTab === "invite" && companyId ? (
              <InterCompanyInvitePanel
                companyId={companyId}
                sourceCompanyName={company?.name || "Company"}
              />
            ) : null}
            {ribbonTab === "join" && companyId ? (
              <InterCompanyJoinSettingsPanel
                companyId={companyId}
                partners={partners}
                onSettingsChange={() => setIcSettingsTick((n) => n + 1)}
              />
            ) : null}
            {ribbonTab === "revert_requests" && companyId ? (
              <InterCompanyReverseRequestsPanel
                companyId={companyId}
                filterTargetVoucherId={
                  icViewerSide === "target" ? String(voucher?.id || savedSourceId || "") : undefined
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
              (savedSourceId
                ? { id: savedSourceId, isApproved: (voucher as { isApproved?: boolean })?.isApproved }
                : voucher) as { id?: string; isApproved?: boolean } | undefined
            }
            editingDisabled={fieldsDisabled}
            isEditViewOnly={isInterCompanyEditLocked}
            isCompanyAdmin={isCompanyAdmin}
            deleteDisabledWhenLinked={deleteDisabledWhenLinked}
            showHistoryButton={showHistoryButton}
            showApproveButton={showApproveButton}
            onOpenHistory={onOpenHistory}
            onApprove={() => void processAndSave({ approveAfterSave: true })}
            isApproving={isApproving || isLoading}
            isLoading={isLoading}
            isFormDirty={isFormDirty || !savedSourceId}
            onCancel={() => onVoucherAction?.("cancelled")}
            onDelete={() => void handleDelete()}
            onPrint={handlePrint}
          />
        ) : null}
      </form>
    </Form>
  );

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

  const ribbonLayout = (
    <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(10rem,12rem)_1fr] md:gap-4">
      <InterCompanyRibbonNav
        active={ribbonTab}
        onChange={setRibbonTab}
        pendingRevertCount={pendingRevertCount}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{formInner}</div>
    </div>
  );

  if (inDialog) {
    return (
      <>
        <div className="flex min-h-0 flex-col gap-3 px-1 pb-2 md:px-0">{ribbonLayout}</div>
        {reverseDialog}
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
            Voucher · Invite · Join — company A/c No se connect
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1 px-4 py-3">{ribbonLayout}</div>
      {reverseDialog}
    </div>
  );
}
