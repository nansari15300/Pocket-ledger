"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, FilePenLine } from "lucide-react";
import { toast } from "sonner";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PermissionButton } from "@/components/permission";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { MasterListViewShell } from "@/components/layout/MasterListViewShell";
import { ResponsiveMasterDetail } from "@/components/layout/ResponsiveMasterDetail";
import { useCompany } from "@/hooks/useCompany";
import { usePageMemory } from "@/hooks/usePageMemory";
import { useResponsiveListLayout } from "@/hooks/useResponsiveListLayout";
import { useMasterDetailQueryNav } from "@/hooks/useMasterDetailQueryNav";
import { useRegisterMasterDetailHardwareBack } from "@/hooks/useRegisterMasterDetailHardwareBack";
import { mlc } from "@/lib/mobileListChrome";
import { masterDetailListHref } from "@/lib/masterDetailListPath";
import { consumeMasterDetailSidebarListNav } from "@/lib/masterDetailSidebarNav";
import { browserHistoryHref } from "@/lib/webAppBasePath";
import { shouldReplaceWithMasterDetailCanonical } from "@/lib/maybeReplaceMasterDetailUrl";
import {
  QUOTATION_DEFAULT_AMOUNT_WORDS_COLOR,
  QUOTATION_DEFAULT_AMOUNT_WORDS_FONT_SIZE,
  QUOTATION_DEFAULT_BODY_HTML,
  isQuotationAllAccountsRow,
  quotationAccountListId,
  quotationAllAccountsRow,
  QUOTATION_ALL_ACCOUNTS_LIST_ID,
} from "../constants";
import {
  quotationFormQtParam,
  readQuotationFormSession,
  writeQuotationFormSession,
} from "../formSession";
import { nextQuotationNumber, retagQuotationNumberFy } from "../quotationNumber";
import { defaultQuotationSubject, defaultRecipientName, letterheadFromCompany, letterLangFromCountry, defaultPanLabelOption, defaultPhoneLabelOption, resolvePanLabelOption, resolvePhoneLabelOption } from "../letterhead";
import { useQuotations } from "../hooks/useQuotations";
import { useQuotationMasters } from "../hooks/useQuotationMasters";
import type { QuotationAccountRow, QuotationDoc, QuotationDraft } from "../types";
import { QuotationsAccountList } from "../components/QuotationsAccountList";
import { QuotationsDetails } from "../components/QuotationsDetails";
import { QuotationForm } from "../components/QuotationForm";

function emptyDraft(input: {
  company: ReturnType<typeof useCompany>["company"];
  existing: QuotationDoc[];
  account?: QuotationAccountRow | null;
}): QuotationDraft {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const lang = letterLangFromCountry(input.company?.country);
  const panOpt = defaultPanLabelOption(input.company?.country);
  const phoneOpt = defaultPhoneLabelOption(input.company?.country);
  return {
    quotationNumber: nextQuotationNumber(input.existing, input.company, now),
    dateIso: now.toISOString(),
    accountId: input.account?.accountId || "",
    accountKind: input.account?.kind || "",
    accountName: input.account?.name || "",
    recipientName: defaultRecipientName(input.account?.name || "", input.company),
    subject: defaultQuotationSubject(input.company),
    letterhead: letterheadFromCompany(input.company),
    bodyHtml: QUOTATION_DEFAULT_BODY_HTML,
    extraPagesHtml: [],
    gapHtml: "",
    extraGapHtml: [],
    tailHtml: "",
    extraTailHtml: [],
    pageImages: [],
    pageFlow: "bottom",
    numberLabelLang: lang,
    subjectLabelLang: lang,
    dateLabelLang: lang,
    amountWordsLang: lang,
    amountWordsFontSize: QUOTATION_DEFAULT_AMOUNT_WORDS_FONT_SIZE,
    amountWordsColor: QUOTATION_DEFAULT_AMOUNT_WORDS_COLOR,
    tableHeaderStyles: {},
    panLabelLang: panOpt.lang,
    panLabelKind: panOpt.kind,
    phoneLabelLang: phoneOpt.lang,
    phoneLabelKind: phoneOpt.kind,
    lineItems: [],
    amount: 0,
    tabId: "letter",
  };
}

function draftFromDoc(
  doc: QuotationDoc,
  company?: ReturnType<typeof useCompany>["company"]
): QuotationDraft {
  const date = doc.dateIso ? new Date(doc.dateIso) : new Date();
  const fallbackLang = letterLangFromCountry(company?.country);
  const panOpt = resolvePanLabelOption(doc.panLabelLang, doc.panLabelKind, doc.letterhead.panLabel, company?.country);
  const phoneOpt = resolvePhoneLabelOption(
    doc.phoneLabelLang,
    doc.phoneLabelKind,
    doc.letterhead.phoneLabel,
    company?.country
  );
  return {
    id: doc.id,
    quotationNumber: retagQuotationNumberFy(doc.quotationNumber, company, date),
    dateIso: doc.dateIso,
    accountId: doc.accountId,
    accountKind: doc.accountKind,
    accountName: doc.accountName,
    recipientName: doc.recipientName,
    subject: doc.subject,
    letterhead: {
      ...doc.letterhead,
      panLabel: panOpt.label,
      phoneLabel: phoneOpt.label,
    },
    bodyHtml: doc.bodyHtml,
    extraPagesHtml: Array.isArray(doc.extraPagesHtml) ? [...doc.extraPagesHtml] : [],
    gapHtml: doc.gapHtml || "",
    extraGapHtml: Array.isArray(doc.extraGapHtml) ? [...doc.extraGapHtml] : [],
    tailHtml: doc.tailHtml || "",
    extraTailHtml: Array.isArray(doc.extraTailHtml) ? [...doc.extraTailHtml] : [],
    bodyHeightPx: doc.bodyHeightPx,
    extraBodyHeights: Array.isArray(doc.extraBodyHeights) ? [...doc.extraBodyHeights] : [],
    pageImages: Array.isArray(doc.pageImages) ? doc.pageImages.map((row) => ({ ...row })) : [],
    pageFlow: doc.pageFlow === "right" ? "right" : "bottom",
    numberLabelLang: doc.numberLabelLang || fallbackLang,
    subjectLabelLang: doc.subjectLabelLang || fallbackLang,
    dateLabelLang: doc.dateLabelLang || fallbackLang,
    amountWordsLang: doc.amountWordsLang || fallbackLang,
    amountWordsFontSize: doc.amountWordsFontSize || QUOTATION_DEFAULT_AMOUNT_WORDS_FONT_SIZE,
    amountWordsColor: doc.amountWordsColor || QUOTATION_DEFAULT_AMOUNT_WORDS_COLOR,
    tableHeaderStyles: doc.tableHeaderStyles || {},
    panLabelLang: panOpt.lang,
    panLabelKind: panOpt.kind,
    phoneLabelLang: phoneOpt.lang,
    phoneLabelKind: phoneOpt.kind,
    lineItems: Array.isArray(doc.lineItems)
      ? doc.lineItems.map((row) => ({
          ...row,
          taxPercent: Number(row.taxPercent) || 0,
        }))
      : [],
    convertedSaleId: doc.convertedSaleId,
    convertedSaleNumber: doc.convertedSaleNumber,
    amount: doc.amount,
    tabId: doc.tabId || "letter",
  };
}

function QuotationsPageContent() {
  const { company, companyId, loading: companyLoading } = useCompany();
  const { quotations, accountRows, loading, reload } = useQuotations(companyId);
  const { masters, byKey } = useQuotationMasters();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedIdFromUrl = searchParams.get("selected");
  const qtFromUrl = searchParams.get("qt");
  const { isMobile, selected, setSelected } = useResponsiveListLayout<QuotationAccountRow>("quotations");
  const useQueryNav = useMasterDetailQueryNav();
  const [searchTerm, setSearchTerm] = useState("");
  const [formDraft, setFormDraft] = useState<QuotationDraft | null>(null);
  const prevCompanyIdRef = useRef<string | undefined>(undefined);
  const restoredFormRef = useRef(false);

  const accounts = useMemo(() => {
    return accountRows.map((row) => {
      const master = byKey.get(`${row.kind}:${row.accountId}`);
      return { ...row, fileUrl: master?.fileUrl || row.fileUrl || null, name: master?.name || row.name };
    });
  }, [accountRows, byKey]);

  const accountsForPageMemory = useMemo(
    () => [quotationAllAccountsRow(quotations.length), ...accounts],
    [accounts, quotations.length]
  );

  const waitingForCompany = Boolean(companyId && (companyLoading || !company));
  const pageLoading = waitingForCompany || (loading && quotations.length === 0);

  usePageMemory(
    "quotationsPageState",
    "accounts",
    () => {},
    selected,
    setSelected,
    accountsForPageMemory,
    pageLoading,
    isMobile,
    selectedIdFromUrl
  );

  const syncQuotationUrl = useCallback(
    (row: QuotationAccountRow | null, qt: string | null) => {
      const params = new URLSearchParams();
      if (row) params.set("selected", row.id);
      if (qt) params.set("qt", qt);
      const qs = params.toString();
      const href = qs
        ? `${masterDetailListHref("quotations")}?${qs}`
        : masterDetailListHref("quotations");
      if (typeof window !== "undefined") {
        try {
          window.history.replaceState(window.history.state, "", browserHistoryHref(href));
        } catch {
          /* ignore */
        }
      }
      if (useQueryNav && shouldReplaceWithMasterDetailCanonical(href)) {
        router.replace(href, { scroll: false });
      }
    },
    [router, useQueryNav]
  );

  const clearFormSession = useCallback(() => {
    writeQuotationFormSession(companyId, { selectedId: null, draft: null });
  }, [companyId]);

  const closeForm = useCallback(
    (keepSelected: boolean) => {
      setFormDraft(null);
      clearFormSession();
      if (keepSelected && selected) {
        syncQuotationUrl(selected, null);
        return;
      }
      setSelected(null);
      syncQuotationUrl(null, null);
    },
    [clearFormSession, selected, setSelected, syncQuotationUrl]
  );

  const onBackToList = useCallback(() => {
    closeForm(false);
    router.replace(masterDetailListHref("quotations"), { scroll: false });
  }, [closeForm, router]);

  const onHardwareBack = useCallback(() => {
    if (formDraft) {
      closeForm(true);
      return;
    }
    onBackToList();
  }, [formDraft, closeForm, onBackToList]);
  useRegisterMasterDetailHardwareBack("quotations", onHardwareBack);

  useEffect(() => {
    const prev = prevCompanyIdRef.current;
    prevCompanyIdRef.current = companyId;
    if (prev && prev !== companyId) {
      setSearchTerm("");
      setSelected(null);
      setFormDraft(null);
      writeQuotationFormSession(prev, { selectedId: null, draft: null });
      restoredFormRef.current = false;
    }
  }, [companyId, setSelected]);

  useEffect(() => {
    if (pageLoading) return;
    if (qtFromUrl) return;
    if (!consumeMasterDetailSidebarListNav("quotations")) return;
    setFormDraft(null);
    setSelected(null);
    clearFormSession();
  }, [pageLoading, qtFromUrl, setSelected, clearFormSession]);

  const handleSelect = useCallback(
    (row: QuotationAccountRow) => {
      setFormDraft(null);
      clearFormSession();
      setSelected(row);
      syncQuotationUrl(row, null);
    },
    [setSelected, syncQuotationUrl, clearFormSession]
  );

  const selectedQuotations = useMemo(() => {
    if (!selected) return [];
    if (isQuotationAllAccountsRow(selected)) return quotations;
    return quotations.filter((row) => row.accountId === selected.accountId && row.accountKind === selected.kind);
  }, [quotations, selected]);

  const resolveAccountListRow = useCallback(
    (id: string | null | undefined): QuotationAccountRow | null => {
      if (!id) return null;
      if (id === QUOTATION_ALL_ACCOUNTS_LIST_ID) return quotationAllAccountsRow(quotations.length);
      return accounts.find((row) => row.id === id) || null;
    },
    [accounts, quotations.length]
  );

  useEffect(() => {
    if (pageLoading || !companyId || restoredFormRef.current) return;
    const session = readQuotationFormSession(companyId);
    const qt = qtFromUrl || (session?.draft ? quotationFormQtParam(session.draft) : null);
    if (!qt) {
      restoredFormRef.current = true;
      return;
    }
    const accFor = (draft: QuotationDraft | null): QuotationAccountRow | null => {
      if (session?.selectedId) {
        const fromSession = resolveAccountListRow(session.selectedId);
        if (fromSession) return fromSession;
      }
      if (selectedIdFromUrl) {
        const fromUrl = resolveAccountListRow(selectedIdFromUrl);
        if (fromUrl) return fromUrl;
      }
      if (draft?.accountKind && draft.accountId) {
        const listId = quotationAccountListId(draft.accountKind, draft.accountId);
        return accounts.find((row) => row.id === listId) || null;
      }
      return null;
    };
    if (qt !== "new") {
      const doc = quotations.find((row) => row.id === qt);
      if (!doc && loading) return;
      restoredFormRef.current = true;
      const sessionDraft = session?.draft?.id === qt ? session.draft : null;
      const nextDraft = sessionDraft || (doc ? draftFromDoc(doc, company) : null);
      if (!nextDraft) return;
      const acc = accFor(nextDraft);
      setFormDraft(nextDraft);
      if (acc) setSelected(acc);
      syncQuotationUrl(acc, qt);
      return;
    }
    restoredFormRef.current = true;
    const nextDraft =
      session?.draft && !session.draft.id
        ? session.draft
        : emptyDraft({ company, existing: quotations, account: accFor(session?.draft || null) });
    const acc = accFor(nextDraft);
    setFormDraft(nextDraft);
    if (acc) setSelected(acc);
    syncQuotationUrl(acc, "new");
  }, [
    pageLoading,
    loading,
    companyId,
    qtFromUrl,
    selectedIdFromUrl,
    quotations,
    accounts,
    company,
    setSelected,
    syncQuotationUrl,
    resolveAccountListRow,
  ]);

  useEffect(() => {
    if (!companyId || !formDraft) return;
    writeQuotationFormSession(companyId, {
      selectedId: selected?.id || (formDraft.accountKind && formDraft.accountId
        ? quotationAccountListId(formDraft.accountKind, formDraft.accountId)
        : null),
      draft: formDraft,
    });
  }, [companyId, formDraft, selected?.id]);

  const openNew = useCallback(() => {
    const draft = emptyDraft({ company, existing: quotations, account: selected });
    setFormDraft(draft);
    syncQuotationUrl(selected, "new");
  }, [company, quotations, selected, syncQuotationUrl]);

  const openEdit = useCallback(
    (row: QuotationDoc) => {
      const draft = draftFromDoc(row, company);
      const acc =
        accounts.find((item) => item.id === quotationAccountListId(row.accountKind, row.accountId)) || selected;
      if (acc) setSelected(acc);
      setFormDraft(draft);
      syncQuotationUrl(acc || null, row.id);
    },
    [accounts, company, selected, setSelected, syncQuotationUrl]
  );

  const handleSaved = useCallback(
    (doc: QuotationDoc) => {
      const listId = quotationAccountListId(doc.accountKind, doc.accountId);
      const nextAccount: QuotationAccountRow = {
        id: listId,
        accountId: doc.accountId,
        kind: doc.accountKind,
        name: doc.accountName,
        quotationCount: 1,
      };
      setSelected(nextAccount);
      clearFormSession();
      setFormDraft(null);
      syncQuotationUrl(nextAccount, null);
      void reload();
    },
    [reload, setSelected, syncQuotationUrl, clearFormSession]
  );

  const handleAfterQuotationDelete = useCallback(() => {
    closeForm(true);
    void reload();
  }, [reload, closeForm]);

  if (!companyId) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6 md:p-8 h-full">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>No Company Selected</CardTitle>
            <CardDescription>Please select a company to manage quotations.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (waitingForCompany) return <LoadingSpinner />;

  const searchRow = (
    <div className={mlc.searchRow}>
      <div className={mlc.searchWrap}>
        <Search className={mlc.searchIcon} />
        <Input
          placeholder="Search accounts..."
          listChrome
          listChromeSearch
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          autoComplete="off"
        />
      </div>
      <PermissionButton permission="create_records" variant="chromePill" size="list" onClick={openNew}>
        + Add New
      </PermissionButton>
    </div>
  );

  const listView = (
    <MasterListViewShell
      isMobile={isMobile}
      searchRow={searchRow}
      sectionLabel={
        <div className={mlc.sectionLabelRow}>
          <FilePenLine className={mlc.sectionIcon} />
          <span>Accounts ({accounts.length})</span>
        </div>
      }
    >
      <QuotationsAccountList
        accounts={accounts}
        selectedId={selected?.id || null}
        onSelect={handleSelect}
        searchTerm={searchTerm}
        totalQuotationCount={quotations.length}
      />
    </MasterListViewShell>
  );

  const detailView = formDraft ? (
    <QuotationForm
      draft={formDraft}
      onChange={(patch) => setFormDraft((prev) => (prev ? { ...prev, ...patch } : prev))}
      existing={quotations}
      masters={masters}
      onSaved={handleSaved}
      onCancel={() => closeForm(true)}
      onAfterDelete={formDraft.id ? handleAfterQuotationDelete : undefined}
    />
  ) : selected ? (
    <QuotationsDetails
      account={selected}
      quotations={selectedQuotations}
      onAddNew={openNew}
      onEdit={openEdit}
    />
  ) : (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      Select an account to see quotations, or click + Add New.
    </div>
  );

  return (
    <ResponsiveMasterDetail
      listChromeRouteKey="quotations"
      title="Quotations"
      mobileSelectionLabel={selected?.name || (formDraft ? "New quotation" : null)}
      balance={
        <span className="font-semibold tabular-nums">
          {quotations.length} quotation{quotations.length === 1 ? "" : "s"}
        </span>
      }
      listView={listView}
      detailView={detailView}
      isMobile={isMobile}
      mobileListOnly={true}
      hasSelectedItem={!!selected || !!formDraft}
      onBackToList={formDraft ? () => closeForm(true) : onBackToList}
      mobileListSelectionKey={formDraft?.id || selected?.id || null}
    />
  );
}

export function QuotationsPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <QuotationsPageContent />
    </Suspense>
  );
}
