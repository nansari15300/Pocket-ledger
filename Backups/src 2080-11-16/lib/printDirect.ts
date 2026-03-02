
"use client";

import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import NepaliDate from 'nepali-date-converter';
import { format as formatDateFns } from "date-fns";
import { AD_DATE_FORMATS, BS_DATE_FORMATS } from "@/lib/dateFormatOptions";
import type { ADFormatKey, BSFormatKey } from "@/lib/dateFormatOptions";
// @ts-ignore - pdfmake types may not be available
import type { TDocumentDefinitions, Content, TableCell } from "pdfmake/interfaces";
import type { Item } from "@/components/items/types";

const DEFAULT_AD_FORMAT: ADFormatKey = "yyyy-MM-dd";
const DEFAULT_BS_FORMAT: BSFormatKey = "YYYY-MM-DD";

function getStoredDateFormatAD(): ADFormatKey {
  if (typeof window === "undefined") return DEFAULT_AD_FORMAT;
  const stored = localStorage.getItem("dateFormatAD") as ADFormatKey | null;
  if (stored && AD_DATE_FORMATS.some((f) => f.value === stored)) return stored;
  return DEFAULT_AD_FORMAT;
}

function getStoredDateFormatBS(): BSFormatKey {
  if (typeof window === "undefined") return DEFAULT_BS_FORMAT;
  const stored = localStorage.getItem("dateFormatBS") as BSFormatKey | null;
  if (stored && BS_DATE_FORMATS.some((f) => f.value === stored)) return stored;
  return DEFAULT_BS_FORMAT;
}


// pdfmake vs vfs_fonts type mismatch: vfs can be string in types but object at runtime; cast to satisfy TS
(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs ?? (pdfFonts as any).vfs;

/** Get PDF buffer from pdfmake doc. Always uses callback so hooks that require "getBuffer(cb)" work; also handles Promise return. */
function getPdfBuffer(pdfDoc: unknown): Promise<Uint8Array | Buffer> {
  return new Promise((resolve, reject) => {
    const cb = (dataOrErr: Uint8Array | Buffer | Error, buf?: Uint8Array | Buffer) => {
      if (dataOrErr instanceof Error) reject(dataOrErr);
      else if (buf !== undefined) resolve(buf);
      else resolve(dataOrErr as Uint8Array | Buffer);
    };
    try {
      const result = (pdfDoc as { getBuffer(cb: (data: Uint8Array | Buffer) => void): Promise<Uint8Array | Buffer> | void }).getBuffer(cb);
      if (result != null && typeof (result as Promise<unknown>).then === "function") {
        (result as Promise<Uint8Array | Buffer>).then(resolve).catch(reject);
      }
    } catch (e) {
      reject(e);
    }
  });
}

function getPdfBufferWithTimeout(pdfDoc: unknown, ms: number): Promise<Uint8Array | Buffer> {
  return Promise.race([
    getPdfBuffer(pdfDoc),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Print timed out. Please try again.")), ms)),
  ]);
}

export type Context =
  | "party" | "account" | "staff" | "tax" | "item"
  | "sale" | "purchase" | "payment_in" | "payment_out"
  | "journal" | "contra" | "direct_income" | "direct_expense" | "note"
  | "daybook"
  | "group"
  | "expense"
  | "overdue"
  | "other";
  
export type DaybookSummary = {
  bank: { yesterday: number; in: number; out: number; today: number };
  cash: { yesterday: number; in: number; out: number; today: number };
  total: { yesterday: number; in: number; out: number; today: number };
} | null;

export type PrintPayload = {
  company: {
    name: string;
    pan?: string;
    phone?: string;
    address?: string,
    decimalPlaces?: number;
    showDrCr?: boolean;
    showCurrencySymbol?: boolean;
    logoUrl?: string | null;
  };
  title: string;
  context: Context;
  contextId?: string | null;
  dateSystem: "AD" | "BS" | "Both";
  dateRangeText: string;
  vouchersCount: number;
  openingBalance: number;
  transactions: any[];
  showNarration?: boolean;
  journalAccountNames?: Record<string, string>;
  daybookSummary?: DaybookSummary | null;
  itemsData?: any; // For sale/purchase context
  party?: any; // For sale context
  customContent?: Content[];
  userNames?: Record<string, string>;
  stockView?: 'qty' | 'amount';
  displayUnit?: string;
  /** When true (party/group), print table with Status column like bill wise view. */
  billWise?: boolean;
  /** Bill-wise: Opening Balance outstanding (for Status: Paid/Partial/Unpaid) */
  openingBalanceOutstanding?: number;
  /** Bill-wise: Voucher numbers linked to Opening Balance (e.g. ["Sale Inv1"]) */
  openingBalanceLinkedVoucherNos?: string[];
};

// ------------ LOGO CACHE (preload for instant print) ------------
const logoCache = new Map<string, string>();

async function fetchLogoAsDataUrl(logoUrl: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const baseUrl = window.location.origin;
    const res = await fetch(
      `${baseUrl}/api/image-proxy?url=${encodeURIComponent(logoUrl)}`
    );
    if (res.ok) {
      const { dataUrl } = await res.json();
      return dataUrl;
    }
  } catch (e) {
    console.warn("Could not load company logo:", e);
  }
  return null;
}

/** Preload company logo so print opens instantly. Call when company has logoUrl. */
export function preloadCompanyLogo(logoUrl: string | null | undefined): void {
  if (!logoUrl || !logoUrl.startsWith("http")) return;
  if (logoCache.has(logoUrl)) return;
  fetchLogoAsDataUrl(logoUrl).then((dataUrl) => {
    if (dataUrl) logoCache.set(logoUrl, dataUrl);
  });
}

// ------------ PUBLIC ------------
export async function openPrintDirect(payload: PrintPayload, iframeTargetIdOrNewTab?: boolean | string | Window) {
  if (typeof window === "undefined") return;

  // 1. User gesture bhitra nai blank window kholne (popup block nahos)
  let printWindow: Window | null = null;
  const useNewTab =
    typeof iframeTargetIdOrNewTab !== "string" &&
    !(iframeTargetIdOrNewTab && typeof (iframeTargetIdOrNewTab as Window).location !== "undefined");

  if (useNewTab) {
    printWindow = window.open("", "_blank");
    if (!printWindow) {
      throw new Error("Popup blocked. Please allow popups for this site.");
    }
    printWindow.document.write(
      "<html><head><title>Preparing Print...</title></head><body style=\"display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;margin:0;\">Loading Print Preview...</body></html>"
    );
    printWindow.document.close();
  }

  // Use logo only if already cached so print opens immediately; otherwise proceed without logo and cache for next time
  let processedPayload = payload;
  if (payload.company.logoUrl && payload.company.logoUrl.startsWith("http")) {
    const cached = logoCache.get(payload.company.logoUrl);
    if (cached) {
      processedPayload = {
        ...payload,
        company: { ...payload.company, logoUrl: cached },
      };
    } else {
      processedPayload = { ...payload, company: { ...payload.company, logoUrl: undefined } };
      fetchLogoAsDataUrl(payload.company.logoUrl).then((dataUrl) => {
        if (dataUrl) logoCache.set(payload.company.logoUrl!, dataUrl);
      }).catch(() => {});
    }
  }

  const docDefinition = buildDocDefinition(processedPayload);
  const pdfDoc = pdfMake.createPdf(docDefinition);

  try {
    const buffer = await getPdfBufferWithTimeout(pdfDoc, 60000);
    const blob = new Blob([buffer as BlobPart], { type: "application/pdf" });
    const blobUrl = URL.createObjectURL(blob);

    if (typeof iframeTargetIdOrNewTab === "string") {
      const iframe = document.getElementById(iframeTargetIdOrNewTab) as HTMLIFrameElement;
      if (iframe) {
        iframe.src = blobUrl;
      } else {
        URL.revokeObjectURL(blobUrl);
      }
    } else if (printWindow) {
      // Direct preview: blob URL ma navigate garne so browser PDF viewer turuntai khulcha (click garnu pardaina)
      printWindow.location.href = blobUrl;
    } else if (iframeTargetIdOrNewTab && typeof (iframeTargetIdOrNewTab as Window).location !== "undefined") {
      (iframeTargetIdOrNewTab as Window).location.href = blobUrl;
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("Print failed:", e);
    // Production ma tab band na garne: error dekhaune (tab ~20ms ma band hune fix)
    if (printWindow && !printWindow.closed) {
      try {
        printWindow.document.open();
        printWindow.document.write(
          "<html><head><title>Print failed</title></head><body style=\"display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;margin:0;padding:1rem;text-align:center;\">" +
            "<div><h2>Print failed</h2><p>" + escapeHtml(errMsg) + "</p><p>Check console for details.</p></div></body></html>"
        );
        printWindow.document.close();
      } catch (_) {
        printWindow.close();
      }
    }
    throw e;
  }
}

function escapeHtml(s: string): string {
  const el = document.createElement("div");
  el.textContent = s;
  return el.innerHTML;
}

/** Returns PDF blob for sharing. Uses same payload processing as openPrintDirect. */
export async function getPdfBlob(payload: PrintPayload): Promise<Blob | null> {
  if (typeof window === "undefined") return null;

  // Use logo only if cached so PDF builds immediately; otherwise proceed without logo and cache in background
  let processedPayload = payload;
  if (payload.company.logoUrl && payload.company.logoUrl.startsWith("http")) {
    const cached = logoCache.get(payload.company.logoUrl);
    if (cached) {
      processedPayload = { ...payload, company: { ...payload.company, logoUrl: cached } };
    } else {
      processedPayload = { ...payload, company: { ...payload.company, logoUrl: undefined } };
      fetchLogoAsDataUrl(payload.company.logoUrl).then((dataUrl) => {
        if (dataUrl) logoCache.set(payload.company.logoUrl!, dataUrl);
      }).catch(() => {});
    }
  }

  const docDefinition = buildDocDefinition(processedPayload);
  const pdfDoc = pdfMake.createPdf(docDefinition);
  const buffer = await getPdfBuffer(pdfDoc);
  return new Blob([buffer as BlobPart], { type: "application/pdf" });
}

// ------------ HELPERS ------------
const isIdMatch = (id1: any, id2: any) => String(id1) === String(id2);
const findItem = (items: any[], id: any) => items?.find((i: any) => isIdMatch(i.id, id));

// --- UPDATED: Dynamic Font Size Calculator ---
// यो फङ्सनले अब धेरै लामो टेक्स्ट नभएसम्म फन्ट साइज घटाउँदैन।
const getAutoFontSize = (text: string | number, baseSize: number): number => {
    const str = String(text);
    // सामान्यतया २० क्यारेक्टर सम्म A4 साइजमा अटाउँछ (जब अरु कोलम auto हुन्छन्)
    if (str.length > 35) return Math.max(6, baseSize - 4); // एकदमै ठूलो डाटा
    if (str.length > 28) return Math.max(7, baseSize - 2); // धेरै ठूलो डाटा
    if (str.length > 22) return Math.max(8, baseSize - 1); // अलि ठूलो डाटा
    return baseSize; // Normal size
};


// ------------ INTERNALS ------------

function buildDocDefinition(p: PrintPayload): TDocumentDefinitions {
  const { rows, periodDr, periodCr, closing } = computeRows(p);
  const { formatDate, formatDateBS, formatCurrencyForPrint, formatRunning, numToWords } = getFormatters(p);

  const LOGO_SIZE = 60; // 48 * 1.25
  const LOGO_LEFT_INSET = 20;
  const LOGO_TOP_INSET = 20; // space from top of paper (20px)

  const companyInfoStack: Content = {
    stack: [
      { text: p.company.name, style: 'header', alignment: 'center' },
      { text: p.company.address || '', style: 'sub', alignment: 'center', margin: [0, 2, 0, 0] },
      {
        text: [
          p.company.phone ? `Phone: ${p.company.phone}` : '',
          p.company.pan ? `PAN: ${p.company.pan}` : ''
        ].filter(Boolean).join(' | '),
        style: 'sub',
        alignment: 'center'
      },
      { text: p.dateRangeText, style: 'body', alignment: 'center', margin: [0, 5, 0, 0] },
    ],
    margin: [0, LOGO_TOP_INSET, 0, 0]
  };

  const noLogoPlaceholder: Content = {
    table: {
      widths: [LOGO_SIZE],
      heights: [LOGO_SIZE],
      body: [[
        {
          text: 'Pocket Ledger',
          alignment: 'center' as const,
          fontSize: 8,
          fillColor: '#f0f0f0'
        }
      ]]
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5
    },
    margin: [LOGO_LEFT_INSET, LOGO_TOP_INSET, 0, 0]
  };

  const leftColumnContent: Content = p.company.logoUrl
    ? { image: 'companyLogo', width: LOGO_SIZE, height: LOGO_SIZE, margin: [LOGO_LEFT_INSET, LOGO_TOP_INSET, 0, 0] }
    : noLogoPlaceholder;

  const leftRightColumnWidth = LOGO_SIZE + LOGO_LEFT_INSET;

  const header: Content = {
    columns: [
      { ...leftColumnContent, width: leftRightColumnWidth },
      { stack: [companyInfoStack], width: '*' },
      { width: leftRightColumnWidth, text: '' }
    ],
    margin: [0, 0, 0, 10]
  };

  const footer = (currentPage: number, pageCount: number): Content => {
    return {
      text: `Page ${currentPage} of ${pageCount}`,
      alignment: 'center',
      margin: [0, 20, 0, 20],
      fontSize: 8,
    };
  };

 const reportTitleContent: Content = {
    columns: [
        { text: p.title, style: 'subheader', alignment: 'left', width: '*' },
        { text: `Total Vouchers: ${rows.length}`, style: 'subheader', alignment: 'right', width: 'auto' }
    ],
    margin: [0, 0, 0, 5],
  };

const daybookSummaryContent = (summary: DaybookSummary): Content => {
    if (!summary) return { text: '' };
    const { formatRunning } = getFormatters(p);
    const positiveColor = '#008000';
    const negativeColor = '#ff0000';

    return {
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0,
          hLineColor: () => '#ddd',
          paddingLeft: () => 8,
          paddingRight: () => 8,
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
        table: {
            widths: ['*', 'auto', '*'],
            body: [
                 [
                    {
                        stack: [
                            { text: [{ text: 'Yesterday Bank: ', bold: true }, { text: formatRunning(summary.bank.yesterday), color: summary.bank.yesterday >= 0 ? positiveColor : negativeColor }] },
                            { text: [{ text: 'Yesterday Cash: ', bold: true }, { text: formatRunning(summary.cash.yesterday), color: summary.cash.yesterday >= 0 ? positiveColor : negativeColor }] }
                        ],
                        fontSize: 8,
                    },
                    {
                       stack: [
                            { text: [{ text: 'Total Bank+Cash Balance: ', bold: true, color: 'blue'}, { text: formatRunning(summary.total.today), bold: true, color: summary.total.today >= 0 ? positiveColor : negativeColor }] }
                       ],
                       alignment: 'center',
                       margin: [0, 5, 0, 0],
                       fontSize: 8,
                    },
                    {
                        stack: [
                            { text: [{ text: 'Today Bank: ', bold: true }, { text: formatRunning(summary.bank.today), color: summary.bank.today >= 0 ? positiveColor : negativeColor }] },
                            { text: [{ text: 'Today Cash: ', bold: true }, { text: formatRunning(summary.cash.today), color: summary.cash.today >= 0 ? positiveColor : negativeColor }] }
                        ],
                        alignment: 'right',
                        fontSize: 8,
                    },
                ],
            ]
        },
        margin: [0, 5, 0, 10],
    };
};

  const body: Content[] = [];
  
  if (p.context === 'daybook' && p.daybookSummary) {
    body.push({
        columns: [
            { text: p.title, style: 'subheader', alignment: 'left', width: '*' },
            { text: '(Note: Summary is for Bank & Cash only)', alignment: 'center', fontSize: 8, italics: true, color: 'gray', width: '*'},
            { text: `Total Vouchers: ${rows.length}`, style: 'subheader', alignment: 'right', width: '*' }
        ],
        margin: [0, 0, 0, 5],
    });
    body.push(daybookSummaryContent(p.daybookSummary));
  }
  else if (p.context === 'sale' && p.transactions.length === 1) {
     const date = p.transactions[0]?.date?.toDate ? p.transactions[0].date.toDate() : new Date(p.transactions[0]?.date);
     const headerContent: Content = {
        columns: [
            {
                stack: [
                    { text: [{text: 'Customer Name: ', bold: true}, p.party.name] },
                    { text: [{text: 'PAN/VAT: ', bold: true}, p.party.pan || ''] },
                    { text: [{text: 'Address: ', bold: true}, p.party.address || ''] },
                    { text: [{text: 'Contact: ', bold: true}, p.party.phone || ''] },
                ],
                style: 'body',
                alignment: 'left',
            },
            {
                 stack: [
                    { text: [{text: 'Invoice No: ', bold: true}, p.transactions[0].voucherNumber] },
                    { text: [{text: 'Date (AD): ', bold: true}, formatDate(date)] },
                    { text: [{text: 'Date (BS): ', bold: true}, formatDateBS(date)] },
                ],
                style: 'body',
                alignment: 'right',
            }
        ],
        margin: [0, 5, 0, 10],
    };
     body.push(headerContent);
  }
  else {
    body.push(reportTitleContent);
    if (p.context !== 'daybook' && p.context !== 'sale' && p.context !== 'overdue') {
        
        const factor = p.context === 'item' && p.stockView === 'qty' 
            ? getConversionFactor(findItem(p.itemsData, p.contextId), p.displayUnit) 
            : 1;

        const closingText = p.context === 'item' && p.stockView === 'qty' 
        ? `${(closing / factor).toFixed(2)} ${p.displayUnit || ''}` 
        : formatRunning(closing)

        // --- UPDATED: Top Closing Balance Layout ---
        // अब यसले 'auto' width प्रयोग गर्छ जसले गर्दा दायाँबाट बायाँतिर स्पेस लिन्छ
        body.push({
          columns: [
              { text: '', width: '*' }, // Left space fills remaining
              {
                  text: `Closing Balance: ${closingText}`,
                  alignment: 'right',
                  width: 'auto', // Takes only needed space
                  bold: true,
                  color: closing >= 0 ? 'green' : 'red',
                  noWrap: true,
                  fontSize: getAutoFontSize(closingText, 10) // Apply dynamic font
              }
          ],
          margin: [0, 5, 0, 10],
        });
    }
  }
  
  const tableHeader = buildTableHeader(p);
  const tableFooter = buildTableFooter(p, periodDr, periodCr, closing, formatCurrencyForPrint, formatRunning, tableHeader, numToWords);
  const openingBalanceRow = buildOpeningBalanceRow(p, formatRunning, formatCurrencyForPrint, tableHeader.length);

  const tableLayout: Content = {
    table: {
      headerRows: 1,
      widths: getColumnWidths(p),
      body: [
        tableHeader,
        ...(openingBalanceRow ? [openingBalanceRow] : []),
        ...rows.flatMap(row => buildTableRow(row, p, formatDate, formatDateBS, formatCurrencyForPrint, formatRunning)),
        ...tableFooter,
      ]
    },
     layout: {
       hLineWidth: (i: number, node: any) => {
           if (i === 0 || i === 1) return 1;
           if (i > 1) {
               const currentRow = node.table.body[i];
               const currentIsNarration = currentRow && currentRow.some((cell: any) => cell && cell.style === 'narrationRow');
               if (currentIsNarration) return 0;
           }
           if (tableFooter.length > 0 && i === node.table.body.length - tableFooter.length) return 1;
           if (i === node.table.body.length) return 1;
           
           return 0.5;
       },
      vLineWidth: () => 0,
      hLineColor: (i: number, node:any) => {
          if(i === 1 || (i === node.table.body.length - 1 && tableFooter.length > 0)) return 'black';
          return '#aaa'
      },
      paddingLeft: (i: number) => 4,
      paddingRight: (i: number) => 4,
      paddingTop: (i: number, node: any) => {
          if (i > 0) {
              const row = node.table.body[i];
               if (row && (row as any[]).some(cell => cell && cell.style === 'narrationRow')) {
                   return 0;
               }
          }
          return 4;
      },
      paddingBottom: (i: number, node: any) => {
          const nextRow = node.table.body[i + 1];
          const row = node.table.body[i];
          const nextIsNarration = nextRow && (nextRow as any[]).some((cell: any) => cell && cell.style === 'narrationRow');
          const currentIsNarration = row && (row as any[]).some((cell: any) => cell && cell.style === 'narrationRow');
          if (nextIsNarration) return 0;
          if (currentIsNarration) return 0;
          return 2;
      },
    }
  };

  if (p.customContent) {
    body.push(...p.customContent);
  } else {
    body.push(tableLayout);
  }
  
  const docDef: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [30, 100, 30, 40],
    header: header,
    footer: footer,
    content: body,
    styles: {
      header: { fontSize: 18, bold: true },
      sub: { fontSize: 9, color: '#555' },
      subheader: { fontSize: 14, bold: true, margin: [0, 0, 0, 0] },
      body: { fontSize: 9 }
    }
  };
  if (p.company.logoUrl) {
    (docDef as any).images = { companyLogo: p.company.logoUrl };
  }
  return docDef;
}

function computeRows(payload: PrintPayload) {
  if (payload.context === 'overdue') {
    const toTime = (d: any) => {
      if (!d) return 0;
      const t = d?.toDate ? d.toDate() : new Date(d);
      return t instanceof Date && !isNaN(t.getTime()) ? t.getTime() : 0;
    };
    const list = Array.isArray(payload.transactions) ? payload.transactions : [];
    const sorted = [...list].sort((a, b) => toTime(a.date) - toTime(b.date));
    let running = 0;
    const rowsAsc = sorted.map((t) => {
      const debit = typeof t.debit === 'number' ? t.debit : 0;
      const credit = typeof t.credit === 'number' ? t.credit : 0;
      running += (debit - credit);
      return { ...t, debit, credit, runningBalance: running };
    });
    const periodDr = rowsAsc.reduce((sum, row) => sum + row.debit, 0);
    const periodCr = rowsAsc.reduce((sum, row) => sum + row.credit, 0);
    return { rows: rowsAsc, periodDr, periodCr, closing: periodDr - periodCr };
  }

  const sorted = [...payload.transactions].filter(t => t.type !== 'note').sort(
    (a, b) =>
      (a.date?.toDate ? a.date.toDate() : new Date(a.date)).getTime() -
      (b.date?.toDate ? b.date.toDate() : new Date(b.date)).getTime()
  );

  const openingBalNum = typeof payload.openingBalance === 'number' ? payload.openingBalance : 0;
  let runningBalance = openingBalNum;
  
  const itemForContext = payload.context === 'item' ? findItem(payload.itemsData, payload.contextId) : undefined;

  const rowsAsc = sorted.map((t) => {
    const { debit, credit } = getTransactionAmounts(t, payload.context, itemForContext || payload.contextId, payload.stockView, payload.itemsData);
    // Preserve dueDate / due_date and status so party/account print shows "xx days" like UI
    const dueDate = t.dueDate ?? t.due_date;
    const row = { ...t, debit, credit, runningBalance, dueDate, due_date: t.due_date ?? t.dueDate, isOverdue: t.isOverdue, paymentStatus: t.paymentStatus, linkedFromVoucherNos: t.linkedFromVoucherNos, linkedToVoucherNos: t.linkedToVoucherNos };
    if (t.type === 'opening_balance' && typeof t.runningBalance === 'number') {
      runningBalance = t.runningBalance;
      return { ...row, runningBalance };
    }
    runningBalance += (debit - credit);
    return { ...row, runningBalance };
  });

  const periodDr = rowsAsc.reduce((sum, row) => sum + row.debit, 0);
  const periodCr = rowsAsc.reduce((sum, row) => sum + row.credit, 0);
  const closingBalance = openingBalNum + periodDr - periodCr;

  return { rows: rowsAsc, periodDr, periodCr, closing: closingBalance };
}


function getTransactionAmounts(t: any, context: Context, entityOrId?: any, stockView?: 'qty' | 'amount', items?: any[]) {
  let debit = 0, credit = 0;
  const amount = parseFloat(String(t.total ?? t.amount ?? 0));
  const entityId = typeof entityOrId === 'string' ? entityOrId : entityOrId?.id;
  
  const isIdMatch = (id1: any, id2: any) => String(id1) === String(id2);

  // Special Handling for Opening Balance transactions
  if (t.type === 'opening_balance') {
    if (typeof t.debit === "number") debit = t.debit;
    if (typeof t.credit === "number") credit = t.credit;
    return { debit, credit };
  }

  // Special Handling for System Accounts
  if (isIdMatch(entityId, 'sales_account')) {
    if (t.type === 'sale') credit += (t.subTotal - (t.discount || 0));
    return { debit, credit };
  }
  if (isIdMatch(entityId, 'purchase_account')) {
    if (t.type === 'purchase') debit += (t.subTotal - (t.discount || 0));
    return { debit, credit };
  }

  switch (context) {
    case "party":
      if (entityOrId && entityId === 'all') { // This is for group statement / All Vouchers view
          if (t.type === 'sale') {
              credit += amount; 
          } else if (t.type === 'purchase') {
              debit += amount;
          } else if (t.type === 'payment_out' || t.type === 'direct_expense') {
              credit += amount; // Payment Out = Credit (money going out)
          } else if (t.type === 'payment_in' || t.type === 'direct_income') {
              debit += amount; // Payment In = Debit (money coming in)
          }
      } 
      else if (entityOrId && t.partyId === entityId) {
          if (["sale", "payment_out", "direct_income"].includes(t.type)) debit += amount;
          if (["purchase", "payment_in", "direct_expense"].includes(t.type)) credit += amount;
      }
      
      if (t.type === 'journal' && t.entries) {
        t.entries.forEach((entry: any) => {
          if (isIdMatch(entry.accountId, entityId)) {
            debit += parseFloat(String(entry.debit || 0));
            credit += parseFloat(String(entry.credit || 0));
          }
        });
      }
      break;

    case "account":
      if (entityOrId && entityId === 'all') {
        // Handle "All Vouchers" view for accounts
        // Check if it's journal or contra by transaction type when contextId is 'all'
        if (t.type === 'journal' && t.subType !== 'add_salary') {
          // For "All Journal Vouchers" view, sum all debit and credit entries
          if (t.entries && Array.isArray(t.entries)) {
            debit = t.entries.reduce((sum: number, e: any) => sum + parseFloat(String(e.debit || 0)), 0);
            credit = t.entries.reduce((sum: number, e: any) => sum + parseFloat(String(e.credit || 0)), 0);
          }
        } else if (t.type === 'contra') {
          // Contra: Debit To Account, Credit From Account
          debit = amount; // To Account gets debit
          credit = amount; // From Account gets credit
        } else if (t.accountId) {
          if (["payment_in","direct_income", "sale"].includes(t.type)) debit = amount;
          if (["payment_out","direct_expense", "purchase"].includes(t.type)) credit = amount;
        }
      } else {
        if (["payment_in","direct_income", "sale"].includes(t.type) && isIdMatch(t.accountId, entityId)) debit = amount;
        if (["payment_out","direct_expense", "purchase"].includes(t.type) && isIdMatch(t.accountId, entityId)) credit = amount;
        if (t.type === "contra") {
          if (isIdMatch(t.toAccountId, entityId)) debit = amount; 
          if (isIdMatch(t.fromAccountId, entityId)) credit = amount; 
        }
        if (t.type === 'journal' && t.entries) {
          t.entries.forEach((entry: any) => {
            if (isIdMatch(entry.accountId, entityId)) {
              debit += parseFloat(String(entry.debit || 0));
              credit += parseFloat(String(entry.credit || 0));
            }
          });
        }
      }
      break;

    case "staff":
      if (entityOrId && entityId === 'all') {
        // Handle "All Vouchers" view for staff - show all add_salary transactions
        if (t.type === 'journal' && t.subType === 'add_salary' && Array.isArray(t.entries)) {
          // For add_salary, sum all staff credit entries
          t.entries.forEach((e: any) => {
            if (e.credit > 0) {
              credit += parseFloat(String(e.credit || 0));
            }
          });
        } else if (t.type === 'payment_out' && t.staffId) {
          debit = amount;
        } else if (t.type === 'payment_in' && t.staffId) {
          credit = amount;
        }
      } else if (isIdMatch(t.staffId, entityId)) {
        if (t.type === "payment_out") debit = amount;
        if (t.type === "payment_in")  credit = amount;
      }
      if (t.type === 'journal' && t.entries) {
        t.entries.forEach((entry: any) => {
          if (isIdMatch(entry.accountId, entityId)) {
            credit += parseFloat(String(entry.credit || 0));
            debit += parseFloat(String(entry.debit || 0));
          }
        });
      }
      break;

    case "tax":
         if (isIdMatch(t.taxAccountId, entityId)) {
            if (t.type === 'payment_in') credit += amount;
            else if (t.type === 'payment_out') debit += amount;
        }
        if (t.lineItems) {
            t.lineItems.forEach((line: any) => {
            if (isIdMatch(line.taxAccountId, entityId)) {
                if (t.type === "purchase") debit += line.taxAmount || 0;
                else if (t.type === "sale") credit += line.taxAmount || 0;
            }
            });
        }
         if (t.type === 'journal' && t.entries) {
          t.entries.forEach((entry: any) => {
            if (isIdMatch(entry.accountId, entityId)) {
              debit += parseFloat(String(entry.debit || 0));
              credit += parseFloat(String(entry.credit || 0));
            }
          });
        }
        break;

    case "expense":
        if (isIdMatch(t.expenseAccountId, entityId) || isIdMatch(t.incomeAccountId, entityId)) {
            if (t.type === 'direct_expense') debit = amount;
            if (t.type === 'direct_income') credit = amount;
        }
        if (t.type === 'journal' && t.entries) {
            const entry = t.entries.find((e: any) => isIdMatch(e.accountId, entityId));
            if (entry) {
                debit += parseFloat(String(entry.debit || 0));
                credit += parseFloat(String(entry.credit || 0));
            }
        }
        break;

    case "daybook":
         if (['sale', 'payment_in', 'direct_income'].includes(t.type)) debit = amount;
         if (['purchase', 'payment_out', 'direct_expense'].includes(t.type)) credit = amount;
         if (['journal', 'contra'].includes(t.type)) {
            debit = amount; 
            credit = amount;
         }
         break;

    case "item":
        let lineItem = (t.lineItems || t.items)?.find((li:any) => isIdMatch(li.itemId, entityId));

        if (!lineItem && isIdMatch(t.itemId, entityId)) {
            lineItem = t; 
        }

        if (lineItem) {
            const qty = parseFloat(String(lineItem.quantity || lineItem.qty || 0));
            const rate = parseFloat(String(lineItem.rate || 0));
            const itemData = entityOrId as any | undefined;
            
            let convertedQty = qty;
            if (stockView === 'qty') {
                const conversions = (itemData?.unitConversions || []) as any[];
                const smallestUnit = conversions.length > 0 ? conversions[conversions.length - 1].toUnit : lineItem.unit;
                let factorToSmallest = 1;
                
                if (lineItem.unit && lineItem.unit !== smallestUnit) {
                    let current = lineItem.unit;
                    let attempts = 0;
                    while (current !== smallestUnit && current && attempts < 5) {
                        const conv = conversions.find((c: any) => c.fromUnit === current);
                        if (!conv) { factorToSmallest = 0; break; }
                        factorToSmallest *= Number(conv.conversionFactor);
                        current = conv.toUnit;
                        attempts++;
                    }
                }
                if (factorToSmallest === 0) factorToSmallest = 1; 
                convertedQty = qty * factorToSmallest;
            }

            const type = t.type ? t.type.toLowerCase() : '';

            if (["purchase", "direct_income", "credit_note", "sales_return", "stock_in", "opening"].includes(type)) {
                if (stockView === 'qty') {
                     debit = convertedQty;
                } else {
                     debit = (lineItem.amount) ? parseFloat(lineItem.amount) : (qty * rate);
                }
            }
            else if (["sale", "direct_expense", "debit_note", "purchase_return", "stock_out"].includes(type)) {
                if (stockView === 'qty') {
                     credit = convertedQty;
                } else {
                     const purchasePrice = Number(itemData?.purchasePrice || rate);
                     credit = qty * purchasePrice;
                }
            }
            else if (type === 'journal') {
                 if (lineItem.type === 'debit') {
                    debit = stockView === 'qty' ? convertedQty : (qty * rate);
                 } else if (lineItem.type === 'credit') {
                    credit = stockView === 'qty' ? convertedQty : (qty * rate);
                 }
            }
        } 
        else {
            if (typeof t.debit === "number") debit = t.debit;
            if (typeof t.credit === "number") credit = t.credit;
            
            if (stockView === 'qty' && debit === 0 && credit === 0) {
                 if (typeof t.inQty === "number") debit = t.inQty;
                 else if (typeof t.in === "number") debit = t.in;

                 if (typeof t.outQty === "number") credit = t.outQty;
                 else if (typeof t.out === "number") credit = t.out;
            }
        }
      break;

    default:
      if (typeof t.debit === "number") debit = t.debit;
      if (typeof t.credit === "number") credit = t.credit;
  }
  return { debit, credit };
}

// ----- FORMATTERS -----
const getFormatters = (p: PrintPayload) => {
    const decimalPlaces = p.company.decimalPlaces;
    const showDrCr = p.company.showDrCr ?? true;
    const showCurrencySymbol = p.company.showCurrencySymbol ?? true;
    const isZeroDecimal = decimalPlaces === 0;

    const currencyOptions: Intl.NumberFormatOptions = {
        style: 'decimal',
        minimumFractionDigits: isZeroDecimal ? 0 : (decimalPlaces ?? 2),
        maximumFractionDigits: isZeroDecimal ? 20 : (decimalPlaces ?? 2),
    };

    const dateFormatAD = getStoredDateFormatAD();
    const dateFormatBS = getStoredDateFormatBS();

    const formatDate = (date: Date): string => {
      if (!(date instanceof Date) || isNaN(date.getTime())) return '';
      try {
        return formatDateFns(date, dateFormatAD);
      } catch {
        return date.toLocaleDateString('en-CA');
      }
    };

    const formatDateBS = (date: Date): string => {
      if (!(date instanceof Date) || isNaN(date.getTime())) return '';
      try {
        const nepaliDate = new NepaliDate(date);
        return nepaliDate.format(dateFormatBS);
      } catch {
        const nepaliDate = new NepaliDate(date);
        return nepaliDate.format(DEFAULT_BS_FORMAT);
      }
    }

    const formatCurrencyForPrint = (n: number, opts?: { noSuffix?: boolean}) => {
        if (typeof n !== 'number' || isNaN(n)) return '-';
        if (n === 0 && !opts?.noSuffix) return '-';
        
        let formatted = Math.abs(n).toLocaleString('en-IN', currencyOptions);
        if (showCurrencySymbol) {
            formatted = `Rs. ${formatted}`;
        }

        if (opts?.noSuffix) {
            return n < 0 ? `-${formatted}` : formatted;
        }
        
        const suffix = n >= 0 ? "Dr" : "Cr";
        if (showDrCr) {
            return `${formatted} ${suffix}`;
        }
        
        return n < 0 ? `-${formatted}` : formatted;
    }


    const formatRunning = (n: number) => {
        if (typeof n !== 'number') return '-';
        if (p.context === 'item' && p.stockView === 'qty') {
             const val = n.toLocaleString('en-IN', {
                minimumFractionDigits: isZeroDecimal ? 0 : (decimalPlaces ?? 2),
                maximumFractionDigits: isZeroDecimal ? 20 : (decimalPlaces ?? 2),
            });
            // Append unit if qty view
            return `${val} ${p.displayUnit || ''}`;
        }
        let v = Math.abs(n).toLocaleString('en-IN', currencyOptions);
        if(showCurrencySymbol) v = `Rs. ${v}`;

        if (!showDrCr) return v;
        const drCr = n >= 0 ? "Dr" : "Cr";
        return `${v} ${drCr}`;
    };

     const numToWords = (num: number): string => {
        const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
        const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
        const inWords = (n: number): string => {
            if (n < 20) return a[n];
            let digit = n % 10;
            return `${b[Math.floor(n / 10)]} ${a[digit]}`.trim();
        };
        const toWords = (n: number): string => {
            if (n === 0) return 'zero';
            const crore = Math.floor(n / 10000000);
            const lakh = Math.floor((n % 10000000) / 100000);
            const thousand = Math.floor((n % 100000) / 1000);
            const hundreds = Math.floor((n % 1000) / 1000);
            const remainder = n % 100;
            let str = '';
            if (crore > 0) str += `${inWords(crore)} crore `;
            if (lakh > 0) str += `${inWords(lakh)} lakh `;
            if (thousand > 0) str += `${inWords(thousand)} thousand `;
            if (hundreds > 0) str += `${inWords(hundreds)} hundred `;
            if (remainder > 0) str += inWords(remainder);
            return str.trim();
        };
        const [integerPart, decimalPart] = num.toFixed(2).split('.').map(Number);
        let words = toWords(integerPart);
        if (decimalPart > 0) words += ` and ${toWords(decimalPart)} paisa`;
        return words.replace(/\s+/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    return { formatDate, formatDateBS, formatCurrencyForPrint, formatRunning, numToWords };
}

// ----- PDFMAKE TABLE BUILDERS -----

/** pdfMake requires each row to have exactly column-count elements. Pad with {} so row length matches. */
function ensureRowLength(row: TableCell[], expectedLength: number): TableCell[] {
  while (row.length < expectedLength) row.push({});
  return row;
}

const buildOpeningBalanceRow = (p: PrintPayload, formatRunning: Function, formatCurrencyForPrint: Function, colSpan: number): TableCell[] | null => {
  if (p.context === 'daybook' || p.context === 'sale' || p.context === 'overdue') return null;
  
  const factor = p.context === 'item' && p.stockView === 'qty' ? getConversionFactor(findItem(p.itemsData, p.contextId), p.displayUnit) : 1;
  const openingBalNum = (p.openingBalance ?? 0) / factor;
  const openingText = formatRunning(openingBalNum);

  let displayOpeningText: string = typeof openingText === 'string' ? openingText : '-';
  if (p.context === 'item' && p.stockView === 'qty') {
    displayOpeningText = `${openingBalNum.toFixed(2)} ${p.displayUnit || ''}`.trim() || '-';
  }

  // Calculate opening balance debit and credit amounts
  // If openingBalance is positive, it's a debit; if negative, it's a credit
  const openingBalanceDr = openingBalNum > 0 ? openingBalNum : 0;
  const openingBalanceCr = openingBalNum < 0 ? Math.abs(openingBalNum) : 0;
  
  let displayOpeningBalanceDr: string = '-';
  let displayOpeningBalanceCr: string = '-';
  
  if (p.context === 'item' && p.stockView === 'qty') {
    displayOpeningBalanceDr = openingBalanceDr > 0 ? `${openingBalanceDr.toFixed(2)} ${p.displayUnit || ''}`.trim() : '-';
    displayOpeningBalanceCr = openingBalanceCr > 0 ? `${openingBalanceCr.toFixed(2)} ${p.displayUnit || ''}`.trim() : '-';
  } else {
    displayOpeningBalanceDr = openingBalanceDr > 0 ? formatCurrencyForPrint(openingBalanceDr, { noSuffix: true }) : '-';
    displayOpeningBalanceCr = openingBalanceCr > 0 ? formatCurrencyForPrint(openingBalanceCr, { noSuffix: true }) : '-';
  }

  const isBillWise = Boolean(p.billWise && (p.context === 'party' || p.context === 'group' || p.context === 'staff' || p.context === 'account'));
  // Column order: Date(s), Voucher Type, Voucher No., [Daybook Particulars], Debit, Credit, [Status], Balance
  // For opening balance: Label spans up to Debit, then Debit, Credit, [Status], Balance
  const labelColSpan = isBillWise ? colSpan - 4 : colSpan - 3; // -4 for Debit, Credit, Status, Balance when billWise; -3 for Debit, Credit, Balance when not billWise
  if (labelColSpan < 1) {
    return [
      { text: 'Opening Balance', colSpan, bold: true, alignment: 'left', fontSize: 9, noWrap: true }
    ];
  }

  // Bill-wise: show outstanding in Balance column (0.00 when Paid/Settled)
  const obAmount = Math.abs(openingBalNum);
  const obOutstanding = isBillWise ? (p.openingBalanceOutstanding ?? obAmount) : obAmount;
  const signedOutstanding = openingBalNum >= 0 ? obOutstanding : -obOutstanding;
  const balanceDisplayText = isBillWise
    ? (p.context === 'item' && p.stockView === 'qty'
        ? `${Math.abs(signedOutstanding).toFixed(2)} ${p.displayUnit || ''}`.trim()
        : formatRunning(signedOutstanding))
    : displayOpeningText;

  const balanceCell: TableCell = {
    text: balanceDisplayText,
    alignment: 'right',
    bold: true,
    color: signedOutstanding >= 0 ? 'green' : 'red',
    fontSize: getAutoFontSize(typeof balanceDisplayText === 'string' ? balanceDisplayText : '', 9),
    noWrap: true
  };

  const debitCell: TableCell = {
    text: displayOpeningBalanceDr,
    alignment: 'right',
    bold: true,
    color: 'green',
    fontSize: getAutoFontSize(displayOpeningBalanceDr, 9),
    noWrap: true
  };

  const creditCell: TableCell = {
    text: displayOpeningBalanceCr,
    alignment: 'right',
    bold: true,
    color: 'red',
    fontSize: getAutoFontSize(displayOpeningBalanceCr, 9),
    noWrap: true
  };

  // pdfmake requires row length = table column count: add {} placeholders for each colSpan
  const labelCell: TableCell = { text: 'Opening Balance', colSpan: labelColSpan, bold: true, alignment: 'left', fontSize: 9, noWrap: true };
  const placeholders = Array.from({ length: labelColSpan - 1 }, () => ({}));

  if (isBillWise) {
    const obStatusLabel = obOutstanding <= 0 ? 'Paid' : obOutstanding >= obAmount ? 'Unpaid' : 'Partial';
    const statusCell: TableCell = {
      text: obStatusLabel,
      alignment: 'left',
      fontSize: 9,
      color: obStatusLabel === 'Paid' ? 'green' : 'red' // Unpaid, Partial -> red
    };
    return [
      labelCell,
      ...placeholders,
      debitCell, // Debit
      creditCell, // Credit
      statusCell, // Status
      balanceCell // Balance
    ];
  }
  return [
    labelCell,
    ...placeholders,
    debitCell, // Debit
    creditCell, // Credit
    balanceCell // Balance
  ];
}

const buildTableHeader = (p: PrintPayload): TableCell[] => {
  const boldHeader = (text: string): TableCell => ({ text, bold: true, fontSize: 9, noWrap: true }); 
  
  if (p.context === 'sale' && p.transactions.length === 1) {
      return [boldHeader('S.N.'), boldHeader('Particulars'), boldHeader('Qty'), boldHeader('Rate'), {text: 'Amount', bold: true, fontSize: 9, alignment: 'right'}];
  }
  
  if (p.context === 'overdue') {
    const h: TableCell[] = [];
    if (p.dateSystem === 'Both') {
      h.push(boldHeader('Date (BS)'), boldHeader('Date (AD)'));
    } else {
      h.push(boldHeader('Date'));
    }
    h.push(boldHeader('Type'), boldHeader('Voucher No.'), boldHeader('Party (Account)'));
    h.push(
      { text: 'Debit', bold: true, fontSize: 9, alignment: 'right', noWrap: true },
      { text: 'Credit', bold: true, fontSize: 9, alignment: 'right', noWrap: true },
      { text: 'Status', bold: true, fontSize: 9, alignment: 'left', noWrap: true },
      { text: 'Net Balance', bold: true, fontSize: 9, alignment: 'right', noWrap: true }
    );
    return h;
  }
  
  let headers: TableCell[] = [];
  if (p.dateSystem === 'Both') {
    headers.push(boldHeader('Date (BS)'), boldHeader('Date (AD)'));
  } else {
    headers.push(boldHeader('Date'));
  }
  
  headers.push(
    boldHeader('Voucher Type'),
    boldHeader('Voucher No.')
  );
  
  if (p.context === 'daybook') {
      headers.push(boldHeader('Particulars'));
  }

  const debitLabel = p.context === 'item' && p.stockView === 'qty' ? 'In' : 'Debit';
  const creditLabel = p.context === 'item' && p.stockView === 'qty' ? 'Out' : 'Credit';
  const balanceLabel = p.context === 'item' && p.stockView === 'qty' ? 'Stock' : 'Balance';

  const isBillWise = p.billWise && (p.context === 'party' || p.context === 'group' || p.context === 'staff' || p.context === 'account');
  headers.push(
    { text: debitLabel, bold: true, fontSize: 9, alignment: 'right', noWrap: true },
    { text: creditLabel, bold: true, fontSize: 9, alignment: 'right', noWrap: true }
  );
  if (isBillWise) {
    headers.push({ text: 'Status', bold: true, fontSize: 9, alignment: 'left', noWrap: true });
  }
  headers.push({ text: balanceLabel, bold: true, fontSize: 9, alignment: 'right', noWrap: true });
  
  return headers;
}

const getParticularsText = (row: any, journalAccountNames?: Record<string, string>): string => {
  if (row.type === 'journal' || row.type === 'contra') {
      return row.narration || 'Journal Entry';
  }
  if (row.partyName) return row.partyName;
  return row.narration || row.type;
};

const formatBillStatus = (paymentStatus?: string, isOverdue?: boolean): string => {
  if (isOverdue) return 'Overdue';
  if (!paymentStatus) return '';
  if (paymentStatus === 'paid') return 'Paid';
  if (paymentStatus === 'partially_paid') return 'Partial';
  if (paymentStatus === 'unpaid') return 'Unpaid';
  return paymentStatus;
};

function getOverdueDays(dueDate: any): number {
  if (!dueDate) return 0;
  let due: Date;
  if (typeof dueDate.toDate === 'function') {
    due = dueDate.toDate();
  } else if (typeof (dueDate as { seconds?: number }).seconds === 'number') {
    due = new Date((dueDate as { seconds: number }).seconds * 1000);
  } else {
    due = new Date(dueDate);
  }
  if (isNaN(due.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueOnly = new Date(due);
  dueOnly.setHours(0, 0, 0, 0);
  if (today <= dueOnly) return 0;
  return Math.floor((today.getTime() - dueOnly.getTime()) / (24 * 60 * 60 * 1000));
}

const buildTableRow = (row: any, p: PrintPayload, formatDate: Function, formatDateBS: Function, formatCurrencyForPrint: Function, formatRunning: Function): TableCell[][] => {
    const d = row.date?.toDate ? row.date.toDate() : new Date(row.date);
    const narration = row.narration || row.content || "";
    
    if (p.context === 'overdue') {
      const validDate = d instanceof Date && !isNaN(d.getTime()) ? d : new Date(0);
      const dateCells: TableCell[] = p.dateSystem === 'Both'
        ? [{ text: formatDateBS(validDate), fontSize: 9, noWrap: true }, { text: formatDate(validDate), fontSize: 9, noWrap: true }]
        : [{ text: p.dateSystem === 'AD' ? formatDate(validDate) : formatDateBS(validDate), fontSize: 9, noWrap: true }];
      const typeText = (row.type || '').replace(/_/g, ' ');
      const voucherNo = row.voucherNumber || row.id || '';
      const partyName = row.partyName || '';
      const debit = Number(row.debit) || 0;
      const credit = Number(row.credit) || 0;
      const days = getOverdueDays(row.dueDate);
      const daysText = days > 0 ? `${days} day${days === 1 ? '' : 's'}` : '';
      const statusContentMain = daysText
        ? { text: 'Overdue', fontSize: 9, color: 'red', bold: true, noWrap: true }
        : { text: 'Overdue', fontSize: 9, color: 'red', noWrap: true };
      const isCreditSide = row.type === 'purchase';
      const balanceVal = isCreditSide ? -Number(row.outstanding) : Number(row.outstanding);
      const balanceText = formatRunning(balanceVal);
      const mainRow: TableCell[] = [
        ...dateCells,
        { text: typeText, fontSize: 9, noWrap: true },
        { text: voucherNo, fontSize: 9, noWrap: true },
        { text: partyName, fontSize: 9, noWrap: true },
        { text: debit > 0 ? formatCurrencyForPrint(debit, { noSuffix: true }) : '-', alignment: 'right', color: 'green', fontSize: 9, noWrap: true },
        { text: credit > 0 ? formatCurrencyForPrint(credit, { noSuffix: true }) : '-', alignment: 'right', color: 'red', fontSize: 9, noWrap: true },
        statusContentMain,
        { text: balanceText, alignment: 'right', bold: true, color: balanceVal >= 0 ? 'green' : 'red', fontSize: 9, noWrap: true },
      ];
      const n = mainRow.length;
      const narrationSpan = n - 2;
      const narrationText = row.narration || row.content || 'No narration';
      const subRow: TableCell[] = [
        { text: p.showNarration ? [{ text: 'Narration: ', bold: true }, narrationText] : '', colSpan: narrationSpan, fontSize: 8, italics: true, margin: [0, 0, 0, 0], style: 'narrationRow' },
      ];
      for (let i = 1; i < narrationSpan; i++) subRow.push({});
      subRow.push({ text: daysText, fontSize: 8, color: 'red', alignment: 'left', noWrap: true });
      subRow.push({ text: '' });
      ensureRowLength(subRow, n);
      return [mainRow, subRow];
    }
    
    if (p.context === 'sale' && p.transactions.length === 1) {
        return (row.lineItems || []).map((item: any, index: number) => [
            { text: index + 1, fontSize: 9 },
            { text: findItem(p.itemsData, item.itemId)?.name || 'N/A', fontSize: 9 },
            { text: item.quantity, fontSize: 9 },
            { text: formatCurrencyForPrint(item.rate, { noSuffix: true }), fontSize: 9 },
            { text: formatCurrencyForPrint(item.amount, { noSuffix: true }), alignment: 'right', fontSize: 9 }
        ]);
    }
    
    const dateCells: TableCell[] = [];
    if (p.dateSystem === 'Both') {
        dateCells.push({ text: formatDateBS(d), fontSize: 9, noWrap: true }); 
        dateCells.push({ text: formatDate(d), fontSize: 9, noWrap: true }); 
    } else {
        dateCells.push({ text: p.dateSystem === 'AD' ? formatDate(d) : formatDateBS(d), fontSize: 9, noWrap: true }); 
    }
    
    const voucherType = { text: row.type.replace(/_/g, ' '), fontSize: 9, noWrap: true };
    const voucherNo = { text: row.voucherNumber || row.invoiceNumber || '', fontSize: 9, noWrap: true };
    
    const { debit, credit } = row;
    
    const factor = p.context === 'item' && p.stockView === 'qty' ? getConversionFactor(findItem(p.itemsData, p.contextId), p.displayUnit) : 1;

    // --- USE DYNAMIC FONT SIZE ---
    const debitText = debit > 0 ? (p.context === 'item' && p.stockView === 'qty' ? `${(debit / factor).toFixed(2)} ${p.displayUnit || ''}` : formatCurrencyForPrint(debit / factor, { noSuffix: true })) : '-';
    const creditText = credit > 0 ? (p.context === 'item' && p.stockView === 'qty' ? `${(credit / factor).toFixed(2)} ${p.displayUnit || ''}` : formatCurrencyForPrint(credit / factor, { noSuffix: true })) : '-';

    // Always apply colors: DR (Debit) = Green, CR (Credit) = Red (for all prints)
    const debitContent: TableCell = { 
        text: debitText, 
        alignment: 'right', 
        color: 'green', // Always green for DR column
        fontSize: getAutoFontSize(debitText, 9), 
        noWrap: true 
    }; 
    const creditContent: TableCell = { 
        text: creditText, 
        alignment: 'right', 
        color: 'red', // Always red for CR column
        fontSize: getAutoFontSize(creditText, 9), 
        noWrap: true 
    }; 

    // For bill-wise print, use outstanding balance (each row balance) instead of running balance
    const isBillWise = p.billWise && (p.context === 'party' || p.context === 'group' || p.context === 'staff' || p.context === 'account');
    let balanceValue: number;
    let balanceText: string;
    
    if (isBillWise) {
      // Use outstanding balance for bill-wise (each row balance)
      // Outstanding is always positive, sign depends on transaction type
      const outstanding = Number(row.outstanding) || 0;
      const isCreditSide = ["sale", "payment_in", "direct_income"].includes(row.type);
      // For sale/payment_in/direct_income: outstanding positive = Dr (receivable)
      // For purchase/payment_out/direct_expense: outstanding positive = Cr (payable)
      // So: sale shows outstanding as Dr, purchase shows outstanding as Cr
      balanceValue = isCreditSide ? outstanding : -outstanding;
      balanceText = formatRunning(balanceValue);
    } else {
      // Use running balance for statement view
      let runningBalance = row.runningBalance;
      runningBalance = runningBalance / factor;
      balanceValue = runningBalance;
      balanceText = formatRunning(runningBalance);
    }
    
    if (p.context === 'item' && p.stockView === 'qty') {
         balanceText = `${balanceValue.toFixed(2)} ${p.displayUnit || ''}`;
    }

    const balanceContent: any = { 
        text: balanceText, 
        alignment: 'right', 
        color: balanceValue >= 0 ? 'green' : 'red', 
        fontSize: getAutoFontSize(balanceText, 9), 
        bold: true, 
        noWrap: true 
    }; 
    
    const mainRow: TableCell[] = [
        ...dateCells,
        voucherType,
        voucherNo,
    ];

    if (p.context === 'daybook') {
        mainRow.push({ text: getParticularsText(row, p.journalAccountNames), fontSize: 8 });
    }

    // Overdue days: same logic as overdue context — use dueDate/due_date so "xx days" shows in party/account print
    const dueDateRaw = row.dueDate ?? row.due_date;
    const overdueDays =
      (row.type === 'sale' || row.type === 'purchase') ? getOverdueDays(dueDateRaw)
      : row.isOverdue ? getOverdueDays(dueDateRaw)
      : 0;
    const overdueDaysText = overdueDays > 0 ? `${overdueDays} day${overdueDays === 1 ? '' : 's'}` : '';
    const isOverdueRow = Boolean(row.isOverdue || row.paymentStatus === 'overdue' || ((row.type === 'sale' || row.type === 'purchase') && overdueDays > 0));

    let statusContent: TableCell | null = null;
    if (isBillWise) {
      const isAllVouchersView = p.context === 'account' && p.contextId === 'all';
      const isJournalTransaction = row.type === 'journal' && row.subType !== 'add_salary';
      const isContraTransaction = row.type === 'contra';

      if (isAllVouchersView && (isJournalTransaction || isContraTransaction)) {
        statusContent = { text: row.type.replace(/_/g, ' '), fontSize: 9, alignment: 'left' as const };
      } else {
        const isOverdueDisplay = row.isOverdue || overdueDays > 0;
        const statusLabel = formatBillStatus(row.paymentStatus, isOverdueDisplay);
        const statusColor = statusLabel === 'Paid' ? 'green' : (statusLabel === 'Overdue' || statusLabel === 'Unpaid' || statusLabel === 'Partial') ? 'red' : undefined;
        statusContent = { text: statusLabel || '-', fontSize: 9, alignment: 'left' as const, color: statusColor };
      }
    }
    // Push debit and credit first, then status (if billWise), then balance
    mainRow.push(debitContent, creditContent);
    if (isBillWise && statusContent) {
      mainRow.push(statusContent);
    }
    mainRow.push(balanceContent);

    const resultRows: TableCell[][] = [mainRow];

    // Bill-wise: show sub-row when narration (if showNarration), OR overdue days (no link/voucher no details in print)
    const showBillWiseSubRow = isBillWise && ((p.showNarration && narration) || overdueDaysText || isOverdueRow);
    if (showBillWiseSubRow) {
        // Narration left (colSpan 5/6), status column (overdue days only), balance placeholder
        const baseCols = p.dateSystem === 'Both' ? 2 : 1;
        const daybookCols = p.context === 'daybook' ? 1 : 0;
        const narrationColSpan = baseCols + 2 + daybookCols + 2;
        const overdueLabel = overdueDaysText ? `Overdue, ${overdueDaysText}` : (isOverdueRow ? 'Overdue' : '');
        const statusLine = overdueLabel;
        const statusCellContent: TableCell = statusLine
            ? { text: statusLine, fontSize: 7, color: isOverdueRow ? 'red' : 'black', alignment: 'left' as const }
            : { text: '', fontSize: 7, alignment: 'left' as const };
        const narrationRow: TableCell[] = [
            {
                text: narration
                    ? [{ text: 'Narration: ', bold: true, fontSize: 7, color: 'black' }, { text: narration, color: 'black', fontSize: 7, italics: true }]
                    : '',
                colSpan: narrationColSpan,
                alignment: 'left',
                margin: [0, 0, 10, 0],
                style: 'narrationRow',
            },
            statusCellContent,
            { text: '', border: [false, false, false, false] },
        ];
        ensureRowLength(narrationRow, mainRow.length);
        resultRows.push(narrationRow);
    } else if (!isBillWise && p.showNarration && narration) {
        // Same layout as overdue: one sub-row with narration (left) and status (right) side by side
        const n = mainRow.length;
        const narrationSpan = n - 2;
        const subRow: TableCell[] = [
            {
                text: [{ text: 'Narration: ', bold: true, fontSize: 7, color: 'black' }, { text: narration, color: 'black', fontSize: 7, italics: true }],
                colSpan: narrationSpan,
                alignment: 'left',
                margin: [0, 0, 0, 0],
                style: 'narrationRow',
            },
        ];
        for (let i = 1; i < narrationSpan; i++) subRow.push({});
        subRow.push({ text: '', fontSize: 7 });
        subRow.push({ text: '' });
        ensureRowLength(subRow, n);
        resultRows.push(subRow);
    }
    
    return resultRows;
}


const buildTableFooter = (p: PrintPayload, periodDr: number, periodCr: number, closing: number, formatCurrencyForPrint: Function, formatRunning: Function, header: TableCell[], numToWords: Function): TableCell[][] => {
    if (p.context === 'daybook') return [];
    
    if (p.context === 'overdue') {
      const n = header.length;
      const labelColSpan = n - 4; // Total label spans up to Debit; then Debit, Credit, Status, Balance
      const footerRow: TableCell[] = [
        { text: 'Total', colSpan: labelColSpan, bold: true, alignment: 'left', fontSize: 10, noWrap: true },
        ...Array.from({ length: labelColSpan - 1 }, () => ({})),
        { text: formatCurrencyForPrint(periodDr, { noSuffix: true }), bold: true, fontSize: 10, color: 'green', alignment: 'right', noWrap: true },
        { text: formatCurrencyForPrint(periodCr, { noSuffix: true }), bold: true, fontSize: 10, color: 'red', alignment: 'right', noWrap: true },
        { text: '-', bold: true, fontSize: 10, alignment: 'left', noWrap: true },
        { text: formatRunning(closing), bold: true, fontSize: 10, color: closing >= 0 ? 'green' : 'red', alignment: 'right', noWrap: true },
      ];
      return [footerRow];
    }
    
    const boldCell = (text: string|number, alignment: 'left'|'right' = 'right'): TableCell => ({ text, bold: true, alignment, fontSize: 10 });
    
    // Calculate opening balance debit and credit for including in Period Total
    const factor = p.context === 'item' && p.stockView === 'qty' ? getConversionFactor(findItem(p.itemsData, p.contextId), p.displayUnit) : 1;
    const openingBalNum = (p.openingBalance ?? 0) / factor;
    const openingBalanceDr = openingBalNum > 0 ? openingBalNum : 0;
    const openingBalanceCr = openingBalNum < 0 ? Math.abs(openingBalNum) : 0;
    
    // Include opening balance in Period Total
    const totalDr = periodDr + openingBalanceDr;
    const totalCr = periodCr + openingBalanceCr;
    
    if (p.context === 'sale' && p.transactions.length === 1) {
        const saleData = p.transactions[0];
        const subTotal = saleData.subTotal || 0;
        const discount = saleData.discount || 0;
        const tax = saleData.tax || 0;
        const total = saleData.total || 0;
        const taxableAmount = subTotal - discount;

        return [
            [
                { text: 'Sub Total', colSpan: 4, alignment: 'right', bold: true, fontSize: 9 }, {}, {}, {},
                { text: formatCurrencyForPrint(subTotal, { noSuffix: true }), alignment: 'right', bold: true, fontSize: 9 }
            ],
            [
                { text: 'Discount', colSpan: 4, alignment: 'right', bold: true, fontSize: 9 }, {}, {}, {},
                { text: formatCurrencyForPrint(discount, { noSuffix: true }), alignment: 'right', bold: true, fontSize: 9 }
            ],
             [
                { text: 'Taxable Amount', colSpan: 4, alignment: 'right', bold: true, fontSize: 9 }, {}, {}, {},
                { text: formatCurrencyForPrint(taxableAmount, { noSuffix: true }), alignment: 'right', bold: true, fontSize: 9 }
            ],
            [
                { text: 'Tax', colSpan: 4, alignment: 'right', bold: true, fontSize: 9 }, {}, {}, {},
                { text: formatCurrencyForPrint(tax, { noSuffix: true }), alignment: 'right', bold: true, fontSize: 9 }
            ],
            [
                { text: 'Grand Total', colSpan: 4, alignment: 'right', bold: true, fontSize: 10 }, {}, {}, {},
                { text: formatCurrencyForPrint(total, { noSuffix: true }), alignment: 'right', bold: true, fontSize: 10 }
            ],
             [
                { text: [{text: 'In Words: ', bold: true}, numToWords(total)], colSpan: 5, alignment: 'left', fontSize: 9, italics: true}, {}, {}, {}, {}
             ]
        ];
    }
    
    const isBillWise = p.billWise && (p.context === 'party' || p.context === 'group' || p.context === 'staff' || p.context === 'account');
    const numDataCols = isBillWise ? 4 : 3; // Debit, Credit, [Status], Balance
    const colSpan = header.length - numDataCols;
    if (colSpan < 1) return [];

    const footerRow: TableCell[] = [
        { text: 'Period Total:', colSpan: colSpan, bold: true, alignment: 'right', fontSize: 10, noWrap: true },
    ];
    
    for (let i = 1; i < colSpan; i++) {
        footerRow.push({});
    }

    const formatFooterValue = (val: number) => {
        if (p.context === 'item' && p.stockView === 'qty') {
            return `${(val/factor).toFixed(2)} ${p.displayUnit || ''}`;
        }
        return formatCurrencyForPrint(val, {noSuffix: true});
    }

    let footerClosingText = formatRunning(closing);
    if (p.context === 'item' && p.stockView === 'qty') {
         footerClosingText = `${(closing / factor).toFixed(2)} ${p.displayUnit || ''}`;
    }

    // --- USE DYNAMIC FONT SIZE FOR FOOTER ---
    // Use totalDr and totalCr which include opening balance
    const debitText = formatFooterValue(totalDr);
    const creditText = formatFooterValue(totalCr);

    footerRow.push(
      { text: debitText, bold: true, fontSize: getAutoFontSize(debitText, 10), color: 'green', alignment: 'right', noWrap: true },
      { text: creditText, bold: true, fontSize: getAutoFontSize(creditText, 10), color: 'red', alignment: 'right', noWrap: true }
    );
    if (isBillWise) {
      footerRow.push({ text: '-', bold: true, fontSize: 10, alignment: 'left', noWrap: true });
    }
    footerRow.push(
      { text: footerClosingText, bold: true, fontSize: getAutoFontSize(footerClosingText, 10), color: closing >= 0 ? 'green' : 'red', alignment: 'right', noWrap: true }
    );
    
    return [footerRow];
}

const getColumnWidths = (p: PrintPayload): (string | number)[] => {
  if (p.context === 'sale' && p.transactions.length === 1) {
    return ['auto', '*', 'auto', 'auto', 'auto'];
  }
  
  if (p.context === 'overdue') {
    const w: (string | number)[] = [];
    if (p.dateSystem === 'Both') w.push('auto', 'auto');
    else w.push('auto');
    w.push('auto', 'auto', '*', 'auto', 'auto', 'auto', 'auto');
    return w;
  }
  
  const widths: (string | number)[] = [];
  
  if (p.dateSystem === 'Both') {
    widths.push('auto', 'auto');
  } else {
    widths.push('auto');
  }
  
  widths.push('auto');
  widths.push('*'); 
  
  if (p.context === 'daybook') {
      widths.push('*'); 
  }

  // --- KEPT 'auto' for dynamic width ---
  widths.push('auto', 'auto');
  if (p.billWise && (p.context === 'party' || p.context === 'group' || p.context === 'staff' || p.context === 'account')) {
    widths.push('auto'); // Status
  }
  widths.push('auto'); // Balance

  return widths;
};

// --- GET CONVERSION FACTOR (Helper specific to print logic) ---
const getConversionFactor = (item: Item | undefined, displayUnit: string | undefined): number => {
    if (!item || !displayUnit) return 1;
    const conversions = (item.unitConversions || []) as any[];
    if (conversions.length === 0) return 1;
    const smallestUnit = conversions.length > 0 ? conversions[conversions.length - 1].toUnit : '';
    if (displayUnit === smallestUnit) return 1;
    let factor = 1;
    let currentUnit = displayUnit;
    let attempts = 0;
    while (currentUnit !== smallestUnit && currentUnit && attempts < 10) {
        const conv = conversions.find((c: any) => c.fromUnit === currentUnit);
        if (!conv) return 1;
        factor *= Number(conv.conversionFactor) || 1;
        currentUnit = conv.toUnit;
        attempts++;
    }
    return factor > 0 ? factor : 1;
};
