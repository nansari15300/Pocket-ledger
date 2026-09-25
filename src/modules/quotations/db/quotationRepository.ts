import { clientRandomUUID } from "@/lib/clientRandomUUID";
import {
  listCompanyDocsFromBrowserDb,
  upsertCompanyDocInBrowserDb,
} from "@/lib/localCompanyDocMirror";
import {
  permanentDeleteCompanySubdocFromRecycleBin,
  softDeleteCompanySubdocToRecycleBin,
} from "@/lib/recycleBinEntityLifecycle";
import {
  QUOTATION_COLLECTION,
  QUOTATION_DEFAULT_ADDRESS_FONT_SIZE,
  QUOTATION_DEFAULT_COMPANY_NAME_FONT_SIZE,
} from "../constants";
import { asTableColStyles } from "../tableTextStyle";
import type { QuotationDoc, QuotationDraft, QuotationFormTabId, QuotationLetterhead, QuotationLetterLang, QuotationLineItem, QuotationMasterKind, QuotationPageFlow, QuotationPageImage, QuotationPanLabelKind, QuotationPhoneLabelKind } from "../types";
import { nextQuotationNumber } from "../quotationNumber";

const LOCAL_UPSERT_OPTS = {
  skipCloudSyncEnqueue: true,
  skipDriveAttachmentSideEffects: true,
} as const;

function asLetterhead(raw: unknown): QuotationLetterhead {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    panLabel: String(row.panLabel || "PAN"),
    pan: String(row.pan || ""),
    phoneLabel: String(row.phoneLabel || "Phone"),
    phone: String(row.phone || ""),
    companyName: String(row.companyName || ""),
    address: String(row.address || ""),
    logoUrl: row.logoUrl ? String(row.logoUrl) : null,
    companyNameFontSize:
      Number(row.companyNameFontSize) > 0
        ? Number(row.companyNameFontSize)
        : QUOTATION_DEFAULT_COMPANY_NAME_FONT_SIZE,
    addressFontSize:
      Number(row.addressFontSize) > 0 ? Number(row.addressFontSize) : QUOTATION_DEFAULT_ADDRESS_FONT_SIZE,
  };
}

function asKind(raw: unknown): QuotationMasterKind {
  const v = String(raw || "");
  if (v === "bank" || v === "staff" || v === "tax" || v === "expense" || v === "item") return v;
  return "party";
}

function asTab(raw: unknown): QuotationFormTabId {
  const v = String(raw || "");
  if (v === "tab2" || v === "tab3" || v === "tab4" || v === "tab5") return v;
  return "letter";
}

function asPageFlow(raw: unknown): QuotationPageFlow {
  return String(raw || "") === "right" ? "right" : "bottom";
}

function asLetterLang(raw: unknown): QuotationLetterLang | undefined {
  const v = String(raw || "");
  if (v === "en" || v === "ne" || v === "hi") return v;
  return undefined;
}

function asPanLabelKind(raw: unknown): QuotationPanLabelKind | undefined {
  const v = String(raw || "");
  if (v === "vat" || v === "gstin" || v === "pan") return v;
  return undefined;
}

function asPhoneLabelKind(raw: unknown): QuotationPhoneLabelKind | undefined {
  const v = String(raw || "");
  if (v === "short" || v === "mid" || v === "full") return v;
  return undefined;
}

function asPositivePx(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function asExtraPages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => String(row || ""));
}

function asPageImages(raw: unknown): QuotationPageImage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      const src = String(item.src || "").trim();
      if (!src) return null;
      return {
        id: String(item.id || clientRandomUUID()),
        pageIndex: Math.max(0, Math.floor(Number(item.pageIndex) || 0)),
        src,
        x: Number(item.x) || 0,
        y: Number(item.y) || 0,
        width: Math.max(40, Number(item.width) || 180),
        height: Math.max(40, Number(item.height) || 120),
        rotation: Number.isFinite(Number(item.rotation)) ? Number(item.rotation) % 360 : 0,
      } as QuotationPageImage;
    })
    .filter((row): row is QuotationPageImage => row != null);
}

function asHeights(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((n) => (Number(n) > 0 ? Number(n) : 0));
}

function asLineItems(raw: unknown): QuotationLineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const qty = Number(item.quantity) || 0;
    const rate = Number(item.rate) || 0;
    const taxPercent = Number(item.taxPercent) || 0;
    const base = qty * rate;
    const cellStyles = asTableColStyles(item.cellStyles);
    return {
      id: String(item.id || clientRandomUUID()),
      type: item.type === "service" ? "service" : "item",
      itemId: String(item.itemId || ""),
      itemName: String(item.itemName || ""),
      quantity: qty,
      rate,
      unit: String(item.unit || ""),
      taxPercent,
      amount: Number(item.amount) || round2Line(base),
      ...(cellStyles ? { cellStyles } : {}),
    };
  });
}

function round2Line(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function normalizeQuotationDoc(raw: Record<string, unknown>, fallbackCompanyId: string): QuotationDoc | null {
  const id = String(raw.id || "").trim();
  if (!id) return null;
  const accountId = String(raw.accountId || "").trim();
  const accountName = String(raw.accountName || "").trim();
  if (!accountId && !accountName) return null;
  const dateIso = String(raw.dateIso || "").trim() || new Date().toISOString();
  return {
    id,
    companyId: String(raw.companyId || fallbackCompanyId),
    quotationNumber: String(raw.quotationNumber || "").trim() || id.slice(0, 8),
    dateIso,
    accountId: accountId || id,
    accountKind: asKind(raw.accountKind),
    accountName: accountName || "Account",
    recipientName: String(raw.recipientName || accountName || ""),
    subject: String(raw.subject || ""),
    letterhead: asLetterhead(raw.letterhead),
    bodyHtml: String(raw.bodyHtml || ""),
    extraPagesHtml: asExtraPages(raw.extraPagesHtml),
    gapHtml: String(raw.gapHtml || ""),
    extraGapHtml: asExtraPages(raw.extraGapHtml),
    tailHtml: String(raw.tailHtml || ""),
    extraTailHtml: asExtraPages(raw.extraTailHtml),
    bodyHeightPx: Number(raw.bodyHeightPx) > 0 ? Number(raw.bodyHeightPx) : undefined,
    extraBodyHeights: asHeights(raw.extraBodyHeights),
    pageImages: asPageImages(raw.pageImages),
    pageFlow: asPageFlow(raw.pageFlow),
    numberLabelLang: asLetterLang(raw.numberLabelLang),
    subjectLabelLang: asLetterLang(raw.subjectLabelLang),
    dateLabelLang: asLetterLang(raw.dateLabelLang),
    amountWordsLang: asLetterLang(raw.amountWordsLang),
    amountWordsFontSize: asPositivePx(raw.amountWordsFontSize, 0) || undefined,
    amountWordsColor: raw.amountWordsColor ? String(raw.amountWordsColor) : undefined,
    tableHeaderStyles: asTableColStyles(raw.tableHeaderStyles),
    panLabelLang: asLetterLang(raw.panLabelLang),
    panLabelKind: asPanLabelKind(raw.panLabelKind),
    phoneLabelLang: asLetterLang(raw.phoneLabelLang),
    phoneLabelKind: asPhoneLabelKind(raw.phoneLabelKind),
    lineItems: asLineItems(raw.lineItems),
    convertedSaleId: raw.convertedSaleId ? String(raw.convertedSaleId) : undefined,
    convertedSaleNumber: raw.convertedSaleNumber ? String(raw.convertedSaleNumber) : undefined,
    amount: Number(raw.amount || 0) || 0,
    tabId: asTab(raw.tabId),
    createdAt: Number(raw.createdAt || Date.now()) || Date.now(),
    updatedAt: Number(raw.updatedAt || Date.now()) || Date.now(),
    createdBy: raw.createdBy ? String(raw.createdBy) : undefined,
  };
}

export async function listQuotations(companyId: string): Promise<QuotationDoc[]> {
  const cid = String(companyId || "").trim();
  if (!cid) return [];
  const rows = await listCompanyDocsFromBrowserDb(cid, QUOTATION_COLLECTION);
  const out: QuotationDoc[] = [];
  for (const row of rows || []) {
    const raw = row as Record<string, unknown>;
    if (raw.isDeleted === true) continue;
    const doc = normalizeQuotationDoc({ ...raw }, cid);
    if (doc) out.push(doc);
  }
  out.sort((a, b) => {
    const da = Date.parse(a.dateIso) || 0;
    const db = Date.parse(b.dateIso) || 0;
    if (db !== da) return db - da;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  return out;
}

export async function saveQuotation(
  companyId: string,
  draft: QuotationDraft,
  existing: QuotationDoc[],
  createdBy?: string
): Promise<QuotationDoc> {
  const cid = String(companyId || "").trim();
  if (!cid) throw new Error("No company selected");
  const accountId = String(draft.accountId || "").trim();
  const accountKind = draft.accountKind;
  if (!accountId || !accountKind) throw new Error("Select an account");
  const now = Date.now();
  const id = String(draft.id || "").trim() || clientRandomUUID();
  const prev = existing.find((row) => row.id === id);
  const doc: QuotationDoc = {
    id,
    companyId: cid,
    quotationNumber: String(draft.quotationNumber || "").trim() || nextQuotationNumber(existing, null, new Date(draft.dateIso || Date.now())),
    dateIso: String(draft.dateIso || new Date().toISOString()),
    accountId,
    accountKind,
    accountName: String(draft.accountName || "").trim() || "Account",
    recipientName: String(draft.recipientName || "").trim(),
    subject: String(draft.subject || "").trim(),
    letterhead: draft.letterhead,
    bodyHtml: String(draft.bodyHtml || ""),
    extraPagesHtml: Array.isArray(draft.extraPagesHtml) ? draft.extraPagesHtml.map((row) => String(row || "")) : [],
    gapHtml: String(draft.gapHtml || ""),
    extraGapHtml: Array.isArray(draft.extraGapHtml) ? draft.extraGapHtml.map((row) => String(row || "")) : [],
    tailHtml: String(draft.tailHtml || ""),
    extraTailHtml: Array.isArray(draft.extraTailHtml) ? draft.extraTailHtml.map((row) => String(row || "")) : [],
    bodyHeightPx: Number(draft.bodyHeightPx) > 0 ? Number(draft.bodyHeightPx) : undefined,
    extraBodyHeights: asHeights(draft.extraBodyHeights),
    pageImages: asPageImages(draft.pageImages),
    pageFlow: draft.pageFlow === "right" ? "right" : "bottom",
    numberLabelLang: asLetterLang(draft.numberLabelLang),
    subjectLabelLang: asLetterLang(draft.subjectLabelLang),
    dateLabelLang: asLetterLang(draft.dateLabelLang),
    amountWordsLang: asLetterLang(draft.amountWordsLang),
    amountWordsFontSize: asPositivePx(draft.amountWordsFontSize, 0) || undefined,
    amountWordsColor: draft.amountWordsColor ? String(draft.amountWordsColor) : undefined,
    tableHeaderStyles: asTableColStyles(draft.tableHeaderStyles),
    panLabelLang: asLetterLang(draft.panLabelLang),
    panLabelKind: asPanLabelKind(draft.panLabelKind),
    phoneLabelLang: asLetterLang(draft.phoneLabelLang),
    phoneLabelKind: asPhoneLabelKind(draft.phoneLabelKind),
    lineItems: asLineItems(draft.lineItems),
    convertedSaleId: draft.convertedSaleId || prev?.convertedSaleId,
    convertedSaleNumber: draft.convertedSaleNumber || prev?.convertedSaleNumber,
    amount: Number(draft.amount || 0) || 0,
    tabId: draft.tabId || "letter",
    createdAt: prev?.createdAt || now,
    updatedAt: now,
    createdBy: createdBy || prev?.createdBy,
  };
  const ok = await upsertCompanyDocInBrowserDb(cid, QUOTATION_COLLECTION, id, { ...doc }, LOCAL_UPSERT_OPTS);
  if (!ok) throw new Error("Could not save quotation");
  return doc;
}

export async function moveQuotationToRecycleBin(
  companyId: string,
  quotationId: string,
  deletedByUid: string
): Promise<void> {
  const cid = String(companyId || "").trim();
  const id = String(quotationId || "").trim();
  if (!cid || !id) throw new Error("Missing quotation");
  const res = await softDeleteCompanySubdocToRecycleBin(cid, QUOTATION_COLLECTION, id, deletedByUid);
  if (!res.ok) throw new Error("error" in res ? res.error : "Could not move quotation to recycle bin");
}

export async function permanentDeleteQuotation(companyId: string, quotationId: string): Promise<void> {
  const cid = String(companyId || "").trim();
  const id = String(quotationId || "").trim();
  if (!cid || !id) throw new Error("Missing quotation");
  await permanentDeleteCompanySubdocFromRecycleBin(cid, QUOTATION_COLLECTION, id);
}

export async function copyQuotationToTarget(input: {
  source: QuotationDoc;
  targetCompanyId: string;
  targetExisting: QuotationDoc[];
  accountId: string;
  accountKind: QuotationMasterKind;
  accountName: string;
  createdBy?: string;
}): Promise<QuotationDoc> {
  const draft: QuotationDraft = {
    quotationNumber: nextQuotationNumber(input.targetExisting, null, new Date(input.source.dateIso || Date.now())),
    dateIso: input.source.dateIso,
    accountId: input.accountId,
    accountKind: input.accountKind,
    accountName: input.accountName,
    recipientName: input.source.recipientName,
    subject: input.source.subject,
    letterhead: { ...input.source.letterhead },
    bodyHtml: input.source.bodyHtml,
    extraPagesHtml: [...(input.source.extraPagesHtml || [])],
    gapHtml: input.source.gapHtml || "",
    extraGapHtml: [...(input.source.extraGapHtml || [])],
    tailHtml: input.source.tailHtml || "",
    extraTailHtml: [...(input.source.extraTailHtml || [])],
    bodyHeightPx: input.source.bodyHeightPx,
    extraBodyHeights: [...(input.source.extraBodyHeights || [])],
    pageImages: (input.source.pageImages || []).map((row) => ({ ...row })),
    pageFlow: input.source.pageFlow === "right" ? "right" : "bottom",
    numberLabelLang: input.source.numberLabelLang,
    subjectLabelLang: input.source.subjectLabelLang,
    dateLabelLang: input.source.dateLabelLang,
    amountWordsLang: input.source.amountWordsLang,
    amountWordsFontSize: input.source.amountWordsFontSize,
    amountWordsColor: input.source.amountWordsColor,
    tableHeaderStyles: input.source.tableHeaderStyles,
    panLabelLang: input.source.panLabelLang || "en",
    panLabelKind: input.source.panLabelKind || "pan",
    phoneLabelLang: input.source.phoneLabelLang || "en",
    phoneLabelKind: input.source.phoneLabelKind || "short",
    lineItems: [...(input.source.lineItems || [])],
    amount: input.source.amount,
    tabId: input.source.tabId,
  };
  return saveQuotation(input.targetCompanyId, draft, input.targetExisting, input.createdBy);
}
