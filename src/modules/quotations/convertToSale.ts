"use client";

import { toast } from "sonner";
import { listCompanyDocsFromBrowserDb } from "@/lib/localCompanyDocMirror";
import { saveQuotation } from "./db/quotationRepository";
import type { QuotationDoc, QuotationDraft, QuotationLineItem } from "./types";

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function quotationLineTaxAmount(qty: number, rate: number, taxPercent: number): number {
  const base = (Number(qty) || 0) * (Number(rate) || 0);
  return round2((base * (Number(taxPercent) || 0)) / 100);
}

export function quotationRowHasSaleContent(row: QuotationLineItem): boolean {
  const name = String(row.itemName || "").trim();
  const id = String(row.itemId || "").trim();
  const qty = Number(row.quantity) || 0;
  const rate = Number(row.rate) || 0;
  return Boolean(name || id) && (qty > 0 || rate > 0);
}

export function buildSaleDefaultVoucherDataFromQuotation(
  quotation: QuotationDoc | QuotationDraft,
  processedItems?: Array<{ id: string; saleTaxId?: string }>,
  processedTaxes?: Array<{ id: string; rate?: number }>
): Record<string, unknown> {
  const lineItems = (quotation.lineItems || [])
    .filter(quotationRowHasSaleContent)
    .map((row) => {
      const qty = Number(row.quantity) || 0;
      const rate = Number(row.rate) || 0;
      const base = round2(qty * rate);
      const taxPercent = Number(row.taxPercent) || 0;
      const taxAmount = quotationLineTaxAmount(qty, rate, taxPercent);
      let taxAccountId = "";
      const itemId = String(row.itemId || "").trim();
      if (itemId && processedItems) {
        const item = processedItems.find((it) => it.id === itemId);
        taxAccountId = String(item?.saleTaxId || "").trim();
      }
      if (!taxAccountId && taxPercent > 0 && processedTaxes) {
        const match = processedTaxes.find((t) => Number(t.rate) === taxPercent);
        if (match) taxAccountId = match.id;
      }
      return {
        type: row.type === "service" ? "service" : "item",
        itemId,
        quantity: qty,
        rate,
        unit: String(row.unit || ""),
        amount: base,
        taxAccountId,
        taxAmount,
        isTaxInclusive: false,
        allowManualRate: true,
      };
    });
  const subTotal = lineItems.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const tax = lineItems.reduce((sum, row) => sum + (Number(row.taxAmount) || 0), 0);
  const date = quotation.dateIso ? new Date(quotation.dateIso) : new Date();
  return {
    type: "sale",
    defaultTab: "sale",
    partyId: quotation.accountId,
    salesAccountId: "sales_account",
    date,
    narration: `From quotation ${quotation.quotationNumber || ""}`.trim(),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    subTotal,
    tax,
    total: round2(subTotal + tax),
    quotationId: quotation.id,
    quotationNumber: quotation.quotationNumber,
    isApproved: false,
  };
}

export async function prepareQuotationForSaleConvert(args: {
  companyId: string;
  userId: string;
  draft: QuotationDraft;
  existing: QuotationDoc[];
}): Promise<QuotationDoc | null> {
  const { companyId, userId, draft, existing } = args;
  if (draft.accountKind !== "party" || !draft.accountId) {
    toast.error("Convert to sale needs a party account");
    return null;
  }
  const rows = (draft.lineItems || []).filter(quotationRowHasSaleContent);
  if (rows.length === 0) {
    toast.error("Add at least one item line before converting to sale");
    return null;
  }
  return saveQuotation(companyId, draft, existing, userId);
}

export type QuotationLinkableSaleVoucher = {
  id?: string;
  isDeleted?: boolean;
  type?: string;
  partyId?: string;
  voucherNumber?: string;
  quotationId?: string;
};

export function quotationPartyId(quotation: {
  accountKind?: string;
  accountId?: string;
}): string {
  if (quotation.accountKind !== "party") return "";
  return String(quotation.accountId || "").trim();
}

function isSaleVoucherForParty(v: QuotationLinkableSaleVoucher, partyId: string): boolean {
  if (!String(v.id || "").trim() || v.isDeleted) return false;
  if (String(v.type || "").toLowerCase() !== "sale") return false;
  return String(v.partyId || "").trim() === partyId;
}

/** Converted label only when sale exists for this QT party and voucher no / quotationId align. */
export function resolveQuotationLinkedSaleVoucher(
  quotation: {
    id?: string;
    accountId?: string;
    accountKind?: string;
    convertedSaleId?: string;
    convertedSaleNumber?: string;
  },
  vouchers: QuotationLinkableSaleVoucher[] | null | undefined
): QuotationLinkableSaleVoucher | null {
  const partyId = quotationPartyId(quotation);
  if (!partyId) return null;
  const list = vouchers || [];
  const storedId = String(quotation.convertedSaleId || "").trim();
  const storedNo = String(quotation.convertedSaleNumber || "").trim();
  const qtId = String(quotation.id || "").trim();

  const saleMatchesLink = (v: QuotationLinkableSaleVoucher): boolean => {
    if (!isSaleVoucherForParty(v, partyId)) return false;
    const vNo = String(v.voucherNumber || "").trim();
    const vQt = String(v.quotationId || "").trim();
    if (storedNo && vNo !== storedNo) return false;
    if (qtId && vQt && vQt !== qtId) return false;
    return true;
  };

  if (storedId) {
    const byId = list.find((v) => String(v.id) === storedId);
    if (byId && saleMatchesLink(byId)) return byId;
    return null;
  }

  if (!qtId && !storedNo) return null;

  return (
    list.find((v) => {
      if (!saleMatchesLink(v)) return false;
      const vQt = String(v.quotationId || "").trim();
      const vNo = String(v.voucherNumber || "").trim();
      if (qtId && vQt === qtId) return !storedNo || vNo === storedNo;
      if (storedNo && vNo === storedNo) return !qtId || vQt === qtId;
      return false;
    }) || null
  );
}

export function stripStaleQuotationConversion<T extends QuotationDraft>(draft: T, vouchers: QuotationLinkableSaleVoucher[] | null | undefined): T {
  if (!draft.convertedSaleId && !draft.convertedSaleNumber) return draft;
  if (resolveQuotationLinkedSaleVoucher(draft, vouchers)) return draft;
  const next = { ...draft };
  delete next.convertedSaleId;
  delete next.convertedSaleNumber;
  return next;
}

export async function resolveSaleVoucherForQuotationLink(
  companyId: string,
  saleId: string,
  quotation: QuotationDoc | QuotationDraft
): Promise<QuotationLinkableSaleVoucher | null> {
  const partyId = quotationPartyId(quotation);
  const id = String(saleId || "").trim();
  if (!partyId || !id) return null;
  try {
    const rows = (await listCompanyDocsFromBrowserDb(companyId, "vouchers")) as QuotationLinkableSaleVoucher[];
    const sale = rows.find((doc) => String(doc.id) === id);
    if (!sale || !isSaleVoucherForParty(sale, partyId)) return null;
    const qtId = String(quotation.id || "").trim();
    const vQt = String(sale.quotationId || "").trim();
    if (qtId && vQt && vQt !== qtId) return null;
    return sale;
  } catch {
    return null;
  }
}

export async function resolveSaleVoucherNumber(companyId: string, saleId: string): Promise<string> {
  const id = String(saleId || "").trim();
  if (!id) return "";
  try {
    const rows = await listCompanyDocsFromBrowserDb(companyId, "vouchers");
    const row = rows.find((doc) => String(doc.id) === id);
    const num = String((row as { voucherNumber?: string })?.voucherNumber || "").trim();
    return num || id;
  } catch {
    return id;
  }
}

export async function markQuotationConvertedAfterSaleSave(args: {
  companyId: string;
  userId: string;
  quotation: QuotationDoc;
  existing: QuotationDoc[];
  saleId: string;
  saleNumber: string;
}): Promise<QuotationDoc> {
  const { companyId, userId, quotation, existing, saleId, saleNumber } = args;
  const linked = await resolveSaleVoucherForQuotationLink(companyId, saleId, quotation);
  if (!linked) {
    toast.error("Sale voucher must belong to this quotation party");
    throw new Error("Invalid sale link for quotation party");
  }
  const confirmedNumber = String(linked.voucherNumber || saleNumber || "").trim();
  const list = existing.some((row) => row.id === quotation.id) ? existing : [...existing, quotation];
  const draft: QuotationDraft = {
    id: quotation.id,
    quotationNumber: quotation.quotationNumber,
    dateIso: quotation.dateIso,
    accountId: quotation.accountId,
    accountKind: quotation.accountKind,
    accountName: quotation.accountName,
    recipientName: quotation.recipientName,
    subject: quotation.subject,
    letterhead: quotation.letterhead,
    bodyHtml: quotation.bodyHtml,
    extraPagesHtml: quotation.extraPagesHtml,
    gapHtml: quotation.gapHtml,
    extraGapHtml: quotation.extraGapHtml,
    tailHtml: quotation.tailHtml,
    extraTailHtml: quotation.extraTailHtml,
    bodyHeightPx: quotation.bodyHeightPx,
    extraBodyHeights: quotation.extraBodyHeights,
    pageImages: quotation.pageImages,
    pageFlow: quotation.pageFlow,
    numberLabelLang: quotation.numberLabelLang,
    subjectLabelLang: quotation.subjectLabelLang,
    dateLabelLang: quotation.dateLabelLang,
    amountWordsLang: quotation.amountWordsLang,
    amountWordsFontSize: quotation.amountWordsFontSize,
    amountWordsColor: quotation.amountWordsColor,
    tableHeaderStyles: quotation.tableHeaderStyles,
    panLabelLang: quotation.panLabelLang,
    panLabelKind: quotation.panLabelKind,
    phoneLabelLang: quotation.phoneLabelLang,
    phoneLabelKind: quotation.phoneLabelKind,
    lineItems: quotation.lineItems,
    amount: quotation.amount,
    tabId: quotation.tabId,
    convertedSaleId: saleId,
    convertedSaleNumber: confirmedNumber,
  };
  return saveQuotation(companyId, draft, list, userId);
}
