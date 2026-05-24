"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useReconciliationFeature } from "@/hooks/useReconciliationFeature";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { chromeProPillCn } from "@/lib/chromePillButton";
import { CreatePartyDialog } from "@/components/party/CreatePartyDialog";
import { CreateBankAccountDialog } from "@/components/bank-cash/CreateBankAccountDialog";
import { CreateStaffDialog } from "@/components/staff/CreateStaffDialog";
import { CreateTaxDialog } from "@/components/tax/CreateTaxDialog";
import { CreateExpenseAccountDialog } from "@/components/expenses/CreateExpenseAccountDialog";
import {
  createReconciliationShare,
  linkReconciliationShare,
  changeLinkedReconciliationShare,
  changeSenderLinkedReconciliationShare,
  unlinkReconciliationShare,
  requestReconciliationShareAgain,
  loadReconciliationAccountsForCompany,
  resolveUserByIdOrEmail,
  subscribeReconciliationSharesForViewer,
  backfillReconciliationShareCompanyIndex,
} from "@/lib/reconciliation/reconciliationStore";
import type { ReconciliationAccountOption, ReconciliationEntityType, ReconciliationShare } from "@/lib/reconciliation/types";
import { RECON_ENTITY_OPTIONS_UI } from "@/lib/reconciliation/types";

/** Abhi reconcile UI me sirf Party — bank/staff/tax/expense baad me enable karenge. */
const RECON_UI_ENTITY_TYPE: ReconciliationEntityType = "party";
import { RECON_SHARE_HEADER_LABEL, RECON_PAGE_TITLE } from "@/lib/reconciliation/labels";
import { reconciliationPagePath } from "@/lib/reconciliation/reconciliationChat";
import { getReconShareSidesForViewer, getReconShareRoleLabelForViewer, reconciliationShareInvolvesCompany, type ReconSideMeta } from "@/lib/reconciliation/sideMeta";
import {
  getLinkedReceiverAccountKeysForCompany,
  getLinkedSenderAccountKeysForCompany,
  isReceiverAccountAlreadyLinked,
  isSenderAccountAlreadyLinked,
} from "@/lib/reconciliation/linkedAccountFilter";
import { ReconShareListSearchBar } from "@/components/reconciliation/ReconShareListSearchBar";
import {
  EMPTY_RECON_SHARE_LIST_FILTERS,
  filterReconciliationSharesForSearch,
  type ReconShareListFilters,
} from "@/lib/reconciliation/shareListSearch";
import {
  reconShareListCardCn,
  reconShareListCardToneCn,
  reconShareListChildCardCn,
} from "@/lib/reconciliation/reconShareListChrome";
import { Loader2, Link2, Scale, RefreshCw, Info, Unlink2 } from "lucide-react";

/** Dialog info popover + screen reader — ribbon ke Info icon par click se. */
const RECON_SHARE_DIALOG_INFO =
  "Share ledger access with another user. After they link their account, both sides can compare transactions.";
/** Pocket Ledger users only — highlighted notice (Inter System nahi). */
const RECON_SHARE_DIALOG_INFO_HIGHLIGHT =
  "This system allows only between Pocket Ledger users — not Inter System.";

/** Header / footer pills — Add Purchase jaisa halka blue; selected tab pe green border. */
const reconDialogTabPillCn = cn(
  chromeProPillCn,
  "h-8 rounded-full border px-3 text-xs font-medium shadow-none data-[state=inactive]:opacity-100",
  "data-[state=active]:border-green-600 data-[state=active]:ring-2 data-[state=active]:ring-green-600/40 data-[state=active]:!bg-green-50/90 data-[state=active]:!text-green-900",
);

/** Card row pills — linked + Reconciling same height, blue pill style. */
const reconDialogCompactPillCn = cn(
  chromeProPillCn,
  "inline-flex h-5 min-h-5 items-center rounded-full border px-2.5 py-0 text-[10px] font-semibold leading-none shadow-none",
);

const reconShareListCardMetaRowCn = "grid w-full grid-cols-2 gap-2";
/** List scroll — pr-1 / scrollbar-gutter hata ke cards search card jitni width. */
const reconShareListScrollCn =
  "min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-slim-dim";

/** Dialog action buttons — tabs jaisa blue pill. */
const reconDialogActionBtnCn = cn(reconDialogTabPillCn, "h-8 border");

/** Shared list card — Owned column me Sender/Receiver role bhi. */
function ReconShareSideMetaColumn({
  heading,
  meta,
  roleLabel,
  toneIndex,
}: {
  heading: string;
  meta: ReconSideMeta;
  roleLabel?: "Sender" | "Receiver";
  /** Parent list card tone — inner box border same hue (thoda halka). */
  toneIndex: number;
}) {
  const rows = [
    { label: "Company", value: meta.companyName },
    { label: "Entity", value: meta.entityName },
    { label: "Account", value: meta.accountName },
  ] as const;

  return (
    <div className={reconShareListChildCardCn(toneIndex)}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
        {heading}
        {roleLabel ? (
          <span className="ml-1 normal-case text-blue-700 dark:text-blue-300">· {roleLabel}</span>
        ) : null}
      </p>
      <div className="space-y-1 text-xs">
        {rows.map((row) => (
          <div key={row.label} className="flex min-w-0 items-baseline gap-1.5">
            <span className="w-[4.5rem] shrink-0 text-muted-foreground">{row.label}</span>
            <span className="shrink-0 text-muted-foreground">→</span>
            <span className="min-w-0 flex-1 truncate font-medium" title={row.value}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Dialog ke andar Combobox popover — focus/click dialog dismiss na kare (search type ho sake). */
function preventDialogDismissForNestedPopover(e: Event) {
  const target = e.target as HTMLElement | null;
  if (
    target?.closest("[data-radix-popover-content]") ||
    target?.closest("[data-radix-popper-content-wrapper]") ||
    document.querySelector("[data-radix-popover-content]")?.contains(target ?? null)
  ) {
    e.preventDefault();
  }
}

type ShareForReconciliationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Kisi entity page se khola ho to pre-fill */
  initialEntityType?: ReconciliationEntityType;
  initialAccountId?: string;
  /** Chat link se — Shared list / Unlinked tab seed */
  initialTab?: "share" | "list" | "unlinked";
  /** Chat se aaye to is share card par blue border + scroll */
  highlightShareId?: string | null;
};

export function ShareForReconciliationDialog({
  open,
  onOpenChange,
  initialEntityType,
  initialAccountId,
  initialTab,
  highlightShareId: highlightShareIdProp,
}: ShareForReconciliationDialogProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { company, companyId, allCompanies, setCompanyId } = useCompany();
  const { canShare, canLink, canView, canViewSharedList, canViewUnlinkedList } = useReconciliationFeature();
  const { toast } = useToast();

  /** Shared list tab — explicit permission ya link (pending link ke liye list chahiye) */
  const showShareTab = canShare;
  const showListTab = canViewSharedList || canLink;
  const showUnlinkedTab = canViewUnlinkedList;
  const visibleTabCount = [showShareTab, showListTab, showUnlinkedTab].filter(Boolean).length;

  const firstAllowedTab = React.useCallback((): "share" | "list" | "unlinked" => {
    if (showShareTab) return "share";
    if (showListTab) return "list";
    if (showUnlinkedTab) return "unlinked";
    return "share";
  }, [showShareTab, showListTab, showUnlinkedTab]);

  const isTabAllowed = React.useCallback(
    (t: "share" | "list" | "unlinked") =>
      (t === "share" && showShareTab) ||
      (t === "list" && showListTab) ||
      (t === "unlinked" && showUnlinkedTab),
    [showShareTab, showListTab, showUnlinkedTab]
  );

  /** Owner company-scoped backfill try kar sakta hai — purane shares ka index staff ke liye */
  const isCompanyOwner = React.useMemo(() => {
    if (!company || !user?.uid) return false;
    if (company.isOwned === true) return true;
    const byId = !!company.ownerId && company.ownerId === user.uid;
    const byEmail =
      !!company.ownerEmail &&
      !!user.email &&
      company.ownerEmail.toLowerCase().trim() === user.email.toLowerCase().trim();
    return byId || byEmail;
  }, [company, user?.uid, user?.email]);

  const [tab, setTab] = React.useState<"share" | "list" | "unlinked">("share");
  const [accountId, setAccountId] = React.useState(initialAccountId || "");
  const [accounts, setAccounts] = React.useState<ReconciliationAccountOption[]>([]);
  const [loadingAccounts, setLoadingAccounts] = React.useState(false);
  const [shareScope, setShareScope] = React.useState<"all" | "date_range">("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [targetUserInput, setTargetUserInput] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [shares, setShares] = React.useState<ReconciliationShare[]>([]);
  const [linkShareId, setLinkShareId] = React.useState<string | null>(null);
  const [linkCompanyId, setLinkCompanyId] = React.useState(companyId || "");
  const [linkAccountId, setLinkAccountId] = React.useState("");
  const [linkAccounts, setLinkAccounts] = React.useState<ReconciliationAccountOption[]>([]);
  const [linking, setLinking] = React.useState(false);
  /** Link form receiver (default) ya sender side change ke liye. */
  const [linkFormSide, setLinkFormSide] = React.useState<"receiver" | "sender">("receiver");
  const [requestingAgainId, setRequestingAgainId] = React.useState<string | null>(null);
  /** Chat deep link — Shared list card highlight (blue border) */
  const [highlightShareId, setHighlightShareId] = React.useState<string | null>(null);
  const highlightCardRef = React.useRef<HTMLDivElement | null>(null);
  /** Add New account — full create form (entity type ke hisaab se) */
  const [isCreatePartyOpen, setIsCreatePartyOpen] = React.useState(false);
  const [isCreateBankOpen, setIsCreateBankOpen] = React.useState(false);
  const [isCreateStaffOpen, setIsCreateStaffOpen] = React.useState(false);
  const [isCreateTaxOpen, setIsCreateTaxOpen] = React.useState(false);
  const [taxCreatePrefillName, setTaxCreatePrefillName] = React.useState("");
  const [isCreateExpenseOpen, setIsCreateExpenseOpen] = React.useState(false);
  /** Link company alag ho to create form ke liye temporary switch — band par restore */
  const restoreCompanyIdRef = React.useRef<string | null>(null);
  /** Info (i) icon — click se popover toggle, hover se nahi */
  const [infoOpen, setInfoOpen] = React.useState(false);
  /** Shared list / Unlinked — company → entity → other account search */
  const [listSearchFilters, setListSearchFilters] = React.useState<ReconShareListFilters>(
    EMPTY_RECON_SHARE_LIST_FILTERS,
  );

  React.useEffect(() => {
    if (!open) {
      setInfoOpen(false);
      setListSearchFilters(EMPTY_RECON_SHARE_LIST_FILTERS);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open || !companyId) return;
    setLoadingAccounts(true);
    loadReconciliationAccountsForCompany(companyId)
      .then(setAccounts)
      .finally(() => setLoadingAccounts(false));
  }, [open, companyId]);

  React.useEffect(() => {
    if (!open) return;
    if (initialAccountId) setAccountId(initialAccountId);
  }, [open, initialAccountId]);

  React.useEffect(() => {
    if (!open) {
      setHighlightShareId(null);
      return;
    }
    if (initialTab && isTabAllowed(initialTab)) setTab(initialTab);
    else setTab(firstAllowedTab());
    if (highlightShareIdProp) setHighlightShareId(highlightShareIdProp);
  }, [open, initialTab, highlightShareIdProp, isTabAllowed, firstAllowedTab]);

  /** Permission badle to active tab allowed ho */
  React.useEffect(() => {
    if (!open || isTabAllowed(tab)) return;
    setTab(firstAllowedTab());
  }, [open, tab, isTabAllowed, firstAllowedTab]);

  React.useEffect(() => {
    if (!user?.uid || !open) return;
    return subscribeReconciliationSharesForViewer(user.uid, companyId ?? undefined, setShares);
  }, [user?.uid, open, companyId]);

  /** Dialog khulte hi company index backfill — shared staff ko purane shares dikhne ke liye */
  React.useEffect(() => {
    if (!open || !companyId || !user?.uid) return;
    void backfillReconciliationShareCompanyIndex(companyId, user.uid, {
      tryCompanyScopedQuery: isCompanyOwner,
    });
  }, [open, companyId, user?.uid, isCompanyOwner]);

  React.useEffect(() => {
    if (!linkShareId || !linkCompanyId) {
      setLinkAccounts([]);
      return;
    }
    loadReconciliationAccountsForCompany(linkCompanyId).then(setLinkAccounts);
  }, [linkShareId, linkCompanyId]);

  const filteredAccounts = React.useMemo(
    () => accounts.filter((a) => a.entityType === RECON_UI_ENTITY_TYPE),
    [accounts]
  );

  const filteredLinkAccounts = React.useMemo(
    () => linkAccounts.filter((a) => a.entityType === RECON_UI_ENTITY_TYPE),
    [linkAccounts]
  );

  /** Entity field read-only — abhi sirf Parties option. */
  const reconEntityReadOnlyField = (
    <div className="space-y-1.5">
      <Label>Entity (ledger type)</Label>
      <div className="flex h-9 items-center rounded-md border border-input bg-muted/30 px-3 text-sm">
        {RECON_ENTITY_OPTIONS_UI[0]?.label ?? "Parties"}
      </div>
    </div>
  );

  const accountComboboxOptions = React.useMemo(
    () => filteredAccounts.map((a) => ({ value: a.id, label: a.name })),
    [filteredAccounts]
  );

  const linkCompanyOptions = React.useMemo(
    () => allCompanies.map((c) => ({ value: c.id, label: c.name || c.id })),
    [allCompanies]
  );

  const linkAccountComboboxOptions = React.useMemo(() => {
    const takenKeys =
      linkFormSide === "sender"
        ? getLinkedSenderAccountKeysForCompany(shares, user?.uid, linkCompanyId, linkShareId)
        : getLinkedReceiverAccountKeysForCompany(shares, user?.uid, linkCompanyId, linkShareId);
    return filteredLinkAccounts.map((a) => {
      const key = `${a.entityType}:${a.id}`;
      const alreadyLinked = takenKeys.has(key);
      return {
        value: a.id,
        label: alreadyLinked ? `${a.name} (already linked)` : a.name,
        disabled: alreadyLinked,
      };
    });
  }, [filteredLinkAccounts, shares, user?.uid, linkCompanyId, linkShareId, linkFormSide]);

  /** Disabled account select ho to clear — entity/company change par bhi */
  React.useEffect(() => {
    if (!linkAccountId) return;
    const alreadyLinked =
      linkFormSide === "sender"
        ? isSenderAccountAlreadyLinked(shares, user?.uid, linkCompanyId, RECON_UI_ENTITY_TYPE, linkAccountId, linkShareId)
        : isReceiverAccountAlreadyLinked(shares, user?.uid, linkCompanyId, RECON_UI_ENTITY_TYPE, linkAccountId, linkShareId);
    if (alreadyLinked) {
      setLinkAccountId("");
    }
  }, [linkAccountId, linkCompanyId, linkShareId, shares, user?.uid, linkFormSide]);

  const shareScopeOptions = React.useMemo(
    () => [
      { value: "all", label: "All transactions" },
      { value: "date_range", label: "By date range" },
    ],
    []
  );

  /** Dialog ke andar Combobox — nested focus trap + search focus. */
  const dialogComboboxProps = {
    popoverModal: false as const,
    autoFocusSearchOnOpen: true,
    contentWidthMode: "auto" as const,
    searchPlaceholder: "Search...",
  };

  const selectedAccount = filteredAccounts.find((a) => a.id === accountId);

  const handleShare = async () => {
    if (!canShare || !user?.uid || !companyId || !company) return;
    if (!accountId) {
      toast({ variant: "destructive", title: "Select account" });
      return;
    }
    const target = await resolveUserByIdOrEmail(targetUserInput);
    if (!target?.uid) {
      toast({ variant: "destructive", title: "Target user not found", description: "Enter a valid email." });
      return;
    }
    if (target.uid === user.uid) {
      toast({ variant: "destructive", title: "Cannot share to yourself" });
      return;
    }
    setSaving(true);
    try {
      await createReconciliationShare({
        senderUserId: user.uid,
        senderUserEmail: user.email || undefined,
        senderCompanyId: companyId,
        senderCompanyName: company.name || companyId,
        senderEntityType: RECON_UI_ENTITY_TYPE,
        senderAccountId: accountId,
        senderAccountName: selectedAccount?.name || accountId,
        shareScope,
        dateFrom: shareScope === "date_range" ? dateFrom || null : null,
        dateTo: shareScope === "date_range" ? dateTo || null : null,
        targetUserId: target.uid,
        targetUserEmail: target.email,
      });
      toast({ title: "Shared for reconciling", description: "Target user will see alert in Messages." });
      setTargetUserInput("");
      setTab("list");
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Share failed", description: e instanceof Error ? e.message : "Try again." });
    } finally {
      setSaving(false);
    }
  };

  const handleLink = async () => {
    if (!user?.uid || !linkShareId || !linkCompanyId) return;
    if (linkFormSide === "receiver" && !canLink) return;
    if (linkFormSide === "sender" && !canShare) return;
    const acc = filteredLinkAccounts.find((a) => a.id === linkAccountId);
    const comp = allCompanies.find((c) => c.id === linkCompanyId);
    if (!acc || !comp) {
      toast({ variant: "destructive", title: "Select company and account" });
      return;
    }
    const alreadyLinked =
      linkFormSide === "sender"
        ? isSenderAccountAlreadyLinked(shares, user.uid, linkCompanyId, RECON_UI_ENTITY_TYPE, linkAccountId, linkShareId)
        : isReceiverAccountAlreadyLinked(shares, user.uid, linkCompanyId, RECON_UI_ENTITY_TYPE, linkAccountId, linkShareId);
    if (alreadyLinked) {
      toast({
        variant: "destructive",
        title: "Account already linked",
        description: "This account is linked to another share in this company. Unlink it first or pick another account.",
      });
      return;
    }
    const activeShare = shares.find((s) => s.id === linkShareId);
    const isChangeMode = activeShare?.status === "linked";
    setLinking(true);
    try {
      if (isChangeMode && linkFormSide === "sender") {
        await changeSenderLinkedReconciliationShare({
          shareId: linkShareId,
          senderUserId: user.uid,
          senderCompanyId: linkCompanyId,
          senderCompanyName: comp.name || linkCompanyId,
          senderEntityType: RECON_UI_ENTITY_TYPE,
          senderAccountId: linkAccountId,
          senderAccountName: acc.name,
        });
        toast({ title: "Sender side updated", description: "Your shared account changed. Reconcile page will refresh." });
      } else {
        const payload = {
          shareId: linkShareId,
          receiverUserId: user.uid,
          receiverUserEmail: user.email || undefined,
          receiverCompanyId: linkCompanyId,
          receiverCompanyName: comp.name || linkCompanyId,
          receiverEntityType: RECON_UI_ENTITY_TYPE,
          receiverAccountId: linkAccountId,
          receiverAccountName: acc.name,
        };
        if (isChangeMode) {
          await changeLinkedReconciliationShare(payload);
          toast({ title: "Company updated", description: "Linked account changed. Reconcile page will show new ledger." });
        } else {
          await linkReconciliationShare(payload);
          toast({ title: "Account linked", description: "Reconciling button will show on both account details." });
        }
      }
      setLinkShareId(null);
      setLinkAccountId("");
      setLinkFormSide("receiver");
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: isChangeMode ? "Change failed" : "Link failed",
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setLinking(false);
    }
  };

  /** Linked share — sender ya receiver dono unlink; chat alert doosri side ko. */
  const handleUnlink = async () => {
    if (!user?.uid || !linkShareId) return;
    setLinking(true);
    try {
      await unlinkReconciliationShare({
        shareId: linkShareId,
        userId: user.uid,
        userEmail: user.email || undefined,
      });
      toast({
        title: "Unlinked",
        description: "Reconcilink disconnected. See Unlinked tab or request again when ready.",
      });
      setLinkShareId(null);
      setLinkAccountId("");
      setLinkFormSide("receiver");
      setTab("unlinked");
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Unlink failed",
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setLinking(false);
    }
  };

  /** Revoked share dubara pending — doosri party ko chat/alert. */
  const handleRequestAgain = async (shareId: string) => {
    if (!user?.uid) return;
    setRequestingAgainId(shareId);
    try {
      await requestReconciliationShareAgain({
        shareId,
        userId: user.uid,
        userEmail: user.email || undefined,
      });
      toast({ title: "Request sent", description: "Other party will get chat message and alert to link again." });
      setTab("list");
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Request failed",
        description: e instanceof Error ? e.message : "Try again.",
      });
    } finally {
      setRequestingAgainId(null);
    }
  };

  /** Pending link ya linked change — receiver ya sender side form. */
  const openLinkForm = React.useCallback(
    (share: ReconciliationShare, side: "receiver" | "sender" = "receiver") => {
      setLinkFormSide(side);
      setLinkShareId(share.id);
      if (share.status === "linked") {
        if (side === "sender") {
          setLinkCompanyId(share.senderCompanyId || companyId || "");
          setLinkAccountId(share.senderAccountId || "");
        } else {
          setLinkCompanyId(share.receiverCompanyId || companyId || "");
          setLinkAccountId(share.receiverAccountId || "");
        }
      } else {
        setLinkCompanyId(companyId || "");
        setLinkAccountId("");
      }
    },
    [companyId],
  );

  const linkAccountAddNewLabel = "+ Add New Party";

  const restoreLinkCompanyContextIfNeeded = React.useCallback(() => {
    const prev = restoreCompanyIdRef.current;
    if (prev && prev !== companyId) {
      setCompanyId(prev);
    }
    restoreCompanyIdRef.current = null;
  }, [companyId, setCompanyId]);

  const refreshLinkAccountsAndSelect = React.useCallback(async (newAccountId: string) => {
    if (!linkCompanyId) return;
    const list = await loadReconciliationAccountsForCompany(linkCompanyId);
    setLinkAccounts(list);
    setLinkAccountId(newAccountId);
  }, [linkCompanyId]);

  /** Add New — direct create nahi; poora master form khule (Note form jaisa) */
  const openCreateLinkAccountFromCombobox = React.useCallback(
    (newName?: string) => {
      const name = String(newName || "").trim();
      if (!linkCompanyId) {
        toast({ variant: "destructive", title: "Select company first" });
        return;
      }
      if (companyId !== linkCompanyId) {
        restoreCompanyIdRef.current = companyId;
        setCompanyId(linkCompanyId);
      }
      setTimeout(() => document.dispatchEvent(new CustomEvent("prefill-create-party-name", { detail: name })), 100);
      setIsCreatePartyOpen(true);
    },
    [linkCompanyId, companyId, setCompanyId, toast]
  );

  const activeLinkShare = linkShareId ? shares.find((s) => s.id === linkShareId) : null;
  const isChangeLinkMode = activeLinkShare?.status === "linked";

  /** Link / change company form — pending + linked dono ke liye reuse */
  const renderLinkAccountForm = () => (
    <div className="space-y-2 border-t pt-2">
      <p className="text-xs font-medium">
        {isChangeLinkMode
          ? linkFormSide === "sender"
            ? "Change your shared company or account:"
            : "Change your linked company or account:"
          : "Link your account to sender's share:"}
      </p>
      <Combobox
        {...dialogComboboxProps}
        options={linkCompanyOptions}
        value={linkCompanyId}
        onChange={setLinkCompanyId}
        placeholder="Your company"
        searchPlaceholder="Search company..."
      />
      {reconEntityReadOnlyField}
      <Combobox
        {...dialogComboboxProps}
        options={linkAccountComboboxOptions}
        value={linkAccountId}
        onChange={(val, newName) => {
          if (val === "add-new") {
            openCreateLinkAccountFromCombobox(newName);
            return;
          }
          setLinkAccountId(val);
        }}
        placeholder="Your account"
        searchPlaceholder="Search account..."
        addNewLabel={linkAccountAddNewLabel}
        disabled={!linkCompanyId}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" className={reconDialogActionBtnCn} onClick={handleLink} disabled={linking}>
          {linking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isChangeLinkMode ? (
            <RefreshCw className="h-4 w-4 mr-1" />
          ) : (
            <Link2 className="h-4 w-4 mr-1" />
          )}
          {isChangeLinkMode ? "Update link" : "Link account"}
        </Button>
        {isChangeLinkMode ? (
          <Button
            type="button"
            variant="outline"
            className={reconDialogActionBtnCn}
            onClick={handleUnlink}
            disabled={linking}
          >
            <Unlink2 className="mr-1 h-4 w-4" />
            Unlink
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className={reconDialogActionBtnCn}
          onClick={() => {
            setLinkShareId(null);
            setLinkFormSide("receiver");
          }}
          disabled={linking}
        >
          Cancel
        </Button>
      </div>
    </div>
  );

  const incomingPending = React.useMemo(
    () =>
      shares.filter(
        (s) =>
          s.targetUserId === user?.uid &&
          s.status === "pending" &&
          reconciliationShareInvolvesCompany(s, companyId, user?.uid),
      ),
    [shares, user?.uid, companyId],
  );

  /** Sirf currently selected company ki shares — baaki companies list me nahi. */
  const companyShares = React.useMemo(
    () => shares.filter((s) => reconciliationShareInvolvesCompany(s, companyId, user?.uid)),
    [shares, companyId, user?.uid],
  );

  /** Shared list — revoked shares alag Unlinked tab me. */
  const activeCompanyShares = React.useMemo(
    () => companyShares.filter((s) => s.status !== "revoked"),
    [companyShares],
  );

  const unlinkedShares = React.useMemo(
    () => companyShares.filter((s) => s.status === "revoked"),
    [companyShares],
  );

  const linkedShares = React.useMemo(
    () => activeCompanyShares.filter((s) => s.status === "linked"),
    [activeCompanyShares],
  );

  const filteredActiveCompanyShares = React.useMemo(
    () => filterReconciliationSharesForSearch(activeCompanyShares, listSearchFilters, user?.uid),
    [activeCompanyShares, listSearchFilters, user?.uid],
  );

  const filteredUnlinkedShares = React.useMemo(
    () => filterReconciliationSharesForSearch(unlinkedShares, listSearchFilters, user?.uid),
    [unlinkedShares, listSearchFilters, user?.uid],
  );

  const listSearchSharesSource = tab === "unlinked" ? unlinkedShares : activeCompanyShares;
  const listSearchFilteredCount =
    tab === "unlinked" ? filteredUnlinkedShares.length : filteredActiveCompanyShares.length;
  /** Search card index 0 (green) — list cards uske baad blue, pink, green… */
  const reconShareListToneOffset =
    (tab === "list" || tab === "unlinked") && listSearchSharesSource.length > 0 ? 1 : 0;

  /** Chat link se highlight card scroll — list load ke baad */
  React.useEffect(() => {
    if (!open || !highlightShareId || tab !== "list") return;
    const timer = window.setTimeout(() => {
      highlightCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [open, highlightShareId, tab, activeCompanyShares.length]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      {/* PC: max 90% viewport height; mobile bhi 90dvh — andar flex scroll */}
      <DialogContent
        className="flex max-h-[90dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0 md:max-h-[90vh] [&>button]:text-white [&>button]:opacity-90 [&>button]:hover:bg-blue-500/80 [&>button]:hover:opacity-100"
        onInteractOutside={preventDialogDismissForNestedPopover}
        onPointerDownOutside={preventDialogDismissForNestedPopover}
        onFocusOutside={preventDialogDismissForNestedPopover}
      >
        {/* Blue ribbon — title + Info tooltip (description yahi chhupi hai) */}
        <div className="flex shrink-0 items-center gap-2 bg-blue-600 px-4 py-3 pr-12 text-white">
          <Scale className="h-5 w-5 shrink-0" />
          <DialogTitle className="m-0 flex-1 text-base font-semibold leading-tight text-white">
            {RECON_SHARE_HEADER_LABEL}
          </DialogTitle>
          <Popover open={infoOpen} onOpenChange={setInfoOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/90 hover:bg-blue-500/80 hover:text-white",
                  infoOpen && "bg-blue-500/80 text-white",
                )}
                aria-label="About share for reconciling"
                aria-expanded={infoOpen}
                onClick={(e) => {
                  e.preventDefault();
                  setInfoOpen((v) => !v);
                }}
              >
                <Info className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="left"
              align="end"
              collisionPadding={12}
              className="z-[10050] max-w-[min(18rem,calc(100vw-2rem))] space-y-2 p-3 text-xs leading-relaxed"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <p>{RECON_SHARE_DIALOG_INFO}</p>
              <p className="rounded-md border border-amber-400/80 bg-amber-50 px-2.5 py-2 font-semibold text-amber-950 shadow-sm dark:border-amber-600/70 dark:bg-amber-950/50 dark:text-amber-100">
                {RECON_SHARE_DIALOG_INFO_HIGHLIGHT}
              </p>
            </PopoverContent>
          </Popover>
        </div>
        <DialogDescription className="sr-only">
          {RECON_SHARE_DIALOG_INFO} {RECON_SHARE_DIALOG_INFO_HIGHLIGHT}
        </DialogDescription>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "share" | "list" | "unlinked")} className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3">
          {visibleTabCount > 0 ? (
          <TabsList
            className={cn(
              "grid h-auto w-full gap-2 bg-transparent p-0",
              visibleTabCount === 1 ? "grid-cols-1" : visibleTabCount === 2 ? "grid-cols-2" : "grid-cols-3"
            )}
          >
            {showShareTab ? (
            <TabsTrigger value="share" className={reconDialogTabPillCn}>
              Share
            </TabsTrigger>
            ) : null}
            {showListTab ? (
            <TabsTrigger value="list" className={reconDialogTabPillCn}>
              Shared list
              {incomingPending.length > 0 ? (
                <Badge variant="destructive" className="ml-2 h-5 px-1.5">{incomingPending.length}</Badge>
              ) : null}
            </TabsTrigger>
            ) : null}
            {showUnlinkedTab ? (
            <TabsTrigger value="unlinked" className={reconDialogTabPillCn}>
              Unlinked
              {unlinkedShares.length > 0 ? (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5">{unlinkedShares.length}</Badge>
              ) : null}
            </TabsTrigger>
            ) : null}
          </TabsList>
          ) : (
            <p className="text-sm text-muted-foreground">No Share for Reconciling tabs are enabled for your role.</p>
          )}

          {((tab === "list" && showListTab) || (tab === "unlinked" && showUnlinkedTab)) &&
          listSearchSharesSource.length > 0 ? (
            <ReconShareListSearchBar
              shares={listSearchSharesSource}
              userId={user?.uid}
              filters={listSearchFilters}
              onFiltersChange={setListSearchFilters}
              comboboxProps={dialogComboboxProps}
              filteredCount={listSearchFilteredCount}
              totalCount={listSearchSharesSource.length}
            />
          ) : null}

          {showShareTab ? (
          <TabsContent value="share" className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain scrollbar-slim-dim [scrollbar-gutter:stable]">
            {!canShare ? (
              <p className="text-sm text-muted-foreground">You don&apos;t have permission to share accounts.</p>
            ) : (
              <>
                {reconEntityReadOnlyField}
                <div className="space-y-1.5">
                  <Label>Account</Label>
                  <Combobox
                    {...dialogComboboxProps}
                    options={accountComboboxOptions}
                    value={accountId}
                    onChange={setAccountId}
                    disabled={loadingAccounts}
                    placeholder={loadingAccounts ? "Loading…" : "Select account"}
                    searchPlaceholder="Search account..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Share transactions</Label>
                  <Combobox
                    {...dialogComboboxProps}
                    options={shareScopeOptions}
                    value={shareScope}
                    onChange={(v) => setShareScope(v as "all" | "date_range")}
                    placeholder="Select scope"
                    searchPlaceholder="Search..."
                  />
                </div>
                {shareScope === "date_range" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label>From</Label>
                      <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>To</Label>
                      <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </div>
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label>Target user (email)</Label>
                  <Input value={targetUserInput} onChange={(e) => setTargetUserInput(e.target.value)} placeholder="email@example.com" />
                </div>
                <DialogFooter className="pt-2">
                  <Button type="button" variant="outline" className={reconDialogActionBtnCn} onClick={handleShare} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Share
                  </Button>
                </DialogFooter>
              </>
            )}
          </TabsContent>
          ) : null}

          {showListTab ? (
          <TabsContent value="list" className="mt-3 flex min-h-0 flex-1 flex-col">
            {/* Baaki pages jaisa slim dim scrollbar — Radix ScrollArea ki jagah native overflow */}
            <div className={reconShareListScrollCn}>
              <div className="w-full min-w-0 space-y-2">
                {filteredActiveCompanyShares.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {activeCompanyShares.length === 0
                      ? shares.length === 0
                        ? "No shares yet."
                        : "No active shares for this company."
                      : "No shares match your search."}
                  </p>
                ) : (
                  filteredActiveCompanyShares.map((s, cardIndex) => {
                    const isIncoming = s.targetUserId === user?.uid;
                    const isSender = s.senderUserId === user?.uid;
                    const roleLabel = getReconShareRoleLabelForViewer(s, user?.uid, companyId ?? undefined);
                    const { owned, other } = getReconShareSidesForViewer(s, user?.uid, companyId ?? undefined);
                    const canChangeOwnedSide =
                      s.status === "linked" && ((isIncoming && canLink) || (isSender && canShare));
                    const isHighlighted = highlightShareId === s.id;
                    return (
                      <div
                        key={s.id}
                        ref={isHighlighted ? highlightCardRef : undefined}
                        className={cn(
                          reconShareListCardCn,
                          reconShareListCardToneCn(cardIndex + reconShareListToneOffset),
                          "transition-shadow",
                          isHighlighted && "border-2 border-blue-600 ring-2 ring-blue-600/40 shadow-md",
                        )}
                      >
                        <div className={reconShareListCardMetaRowCn}>
                          <ReconShareSideMetaColumn
                            heading="Owned"
                            meta={owned}
                            roleLabel={roleLabel}
                            toneIndex={cardIndex + reconShareListToneOffset}
                          />
                          <ReconShareSideMetaColumn
                            heading="Other company"
                            meta={other}
                            toneIndex={cardIndex + reconShareListToneOffset}
                          />
                        </div>
                        {/* Pending: Link | pending — Linked: linked | Change company (dono side) | Reconciling */}
                        <div className="flex w-full flex-wrap items-center justify-between gap-2">
                          {s.status === "pending" && isIncoming && canLink && linkShareId !== s.id ? (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                className={reconDialogCompactPillCn}
                                onClick={() => openLinkForm(s, "receiver")}
                              >
                                <Link2 className="mr-1 h-3 w-3 shrink-0" />
                                Link my account
                              </Button>
                              <span className={reconDialogCompactPillCn}>{s.status}</span>
                            </>
                          ) : s.status === "linked" ? (
                            <>
                              <span className={reconDialogCompactPillCn}>{s.status}</span>
                              {canChangeOwnedSide && linkShareId !== s.id ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={reconDialogCompactPillCn}
                                  onClick={() => openLinkForm(s, isSender ? "sender" : "receiver")}
                                >
                                  <RefreshCw className="mr-1 h-3 w-3 shrink-0" />
                                  Change company
                                </Button>
                              ) : (
                                <span className="min-w-0 flex-1" aria-hidden="true" />
                              )}
                              {canView ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={reconDialogCompactPillCn}
                                  onClick={() => {
                                    onOpenChange(false);
                                    router.push(reconciliationPagePath(s.id), { scroll: false });
                                  }}
                                >
                                  {RECON_PAGE_TITLE}
                                </Button>
                              ) : null}
                            </>
                          ) : (
                            <span className={reconDialogCompactPillCn}>{s.status}</span>
                          )}
                        </div>
                        {s.status === "pending" && isIncoming && canLink && linkShareId === s.id
                          ? renderLinkAccountForm()
                          : null}
                        {s.status === "linked" && canChangeOwnedSide && linkShareId === s.id
                          ? renderLinkAccountForm()
                          : null}
                        {isSender && s.status === "pending" ? (
                          <p className="text-xs text-muted-foreground">Waiting for target user to link.</p>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            {linkedShares.length > 0 && canView ? (
              <p className="text-xs text-muted-foreground mt-2">{linkedShares.length} linked share(s) — open Reconcile or use button on account details.</p>
            ) : null}
          </TabsContent>
          ) : null}

          {showUnlinkedTab ? (
          <TabsContent value="unlinked" className="mt-3 flex min-h-0 flex-1 flex-col">
            <div className={reconShareListScrollCn}>
              <div className="w-full min-w-0 space-y-2">
                {filteredUnlinkedShares.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {unlinkedShares.length === 0
                      ? "No unlinked reconcilink shares for this company."
                      : "No unlinked shares match your search."}
                  </p>
                ) : (
                  filteredUnlinkedShares.map((s, cardIndex) => {
                    const roleLabel = getReconShareRoleLabelForViewer(s, user?.uid, companyId ?? undefined);
                    const { owned, other } = getReconShareSidesForViewer(s, user?.uid, companyId ?? undefined);
                    return (
                      <div
                        key={s.id}
                        className={cn(
                          reconShareListCardCn,
                          reconShareListCardToneCn(cardIndex + reconShareListToneOffset),
                        )}
                      >
                        <div className={reconShareListCardMetaRowCn}>
                          <ReconShareSideMetaColumn
                            heading="Owned"
                            meta={owned}
                            roleLabel={roleLabel}
                            toneIndex={cardIndex + reconShareListToneOffset}
                          />
                          <ReconShareSideMetaColumn
                            heading="Other company"
                            meta={other}
                            toneIndex={cardIndex + reconShareListToneOffset}
                          />
                        </div>
                        <div className="flex w-full flex-wrap items-center justify-between gap-2">
                          <span className={reconDialogCompactPillCn}>unlinked</span>
                          <Button
                            type="button"
                            variant="outline"
                            className={reconDialogCompactPillCn}
                            disabled={requestingAgainId === s.id}
                            onClick={() => void handleRequestAgain(s.id)}
                          >
                            {requestingAgainId === s.id ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="mr-1 h-3 w-3 shrink-0" />
                            )}
                            Request again
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </TabsContent>
          ) : null}
        </Tabs>
      </DialogContent>
      </Dialog>

      {/* Link form Add New — poori master detail ke liye nested create dialogs */}
      <CreatePartyDialog
        isOpen={isCreatePartyOpen}
        onOpenChange={(next) => {
          setIsCreatePartyOpen(next);
          if (!next) restoreLinkCompanyContextIfNeeded();
        }}
        onPartyCreated={(id) => {
          setIsCreatePartyOpen(false);
          restoreLinkCompanyContextIfNeeded();
          void refreshLinkAccountsAndSelect(id);
        }}
      />
      <CreateBankAccountDialog
        isOpen={isCreateBankOpen}
        onOpenChange={(next) => {
          setIsCreateBankOpen(next);
          if (!next) restoreLinkCompanyContextIfNeeded();
        }}
        onAccountCreated={(id) => {
          setIsCreateBankOpen(false);
          restoreLinkCompanyContextIfNeeded();
          void refreshLinkAccountsAndSelect(id);
        }}
      />
      <CreateStaffDialog
        isOpen={isCreateStaffOpen}
        onOpenChange={(next) => {
          setIsCreateStaffOpen(next);
          if (!next) restoreLinkCompanyContextIfNeeded();
        }}
        onStaffCreated={(id) => {
          setIsCreateStaffOpen(false);
          restoreLinkCompanyContextIfNeeded();
          void refreshLinkAccountsAndSelect(id);
        }}
        groups={[]}
      >
        <span className="hidden" />
      </CreateStaffDialog>
      <CreateTaxDialog
        isOpen={isCreateTaxOpen}
        onOpenChange={(next) => {
          setIsCreateTaxOpen(next);
          if (!next) {
            setTaxCreatePrefillName("");
            restoreLinkCompanyContextIfNeeded();
          }
        }}
        prefillTaxName={taxCreatePrefillName}
        onTaxCreated={(id) => {
          setIsCreateTaxOpen(false);
          setTaxCreatePrefillName("");
          restoreLinkCompanyContextIfNeeded();
          void refreshLinkAccountsAndSelect(id);
        }}
      />
      <CreateExpenseAccountDialog
        isOpen={isCreateExpenseOpen}
        onOpenChange={(next) => {
          setIsCreateExpenseOpen(next);
          if (!next) restoreLinkCompanyContextIfNeeded();
        }}
        defaultGroupType="expense"
        onExpenseAccountCreated={(id) => {
          setIsCreateExpenseOpen(false);
          restoreLinkCompanyContextIfNeeded();
          void refreshLinkAccountsAndSelect(id);
        }}
      >
        <span className="hidden" />
      </CreateExpenseAccountDialog>
    </>
  );
}
