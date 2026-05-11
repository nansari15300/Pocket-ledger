"use client";

/**
 * Billing payment statement → PDF → same in-app overlay as Party Statement / printDirect
 * (footer: zoom optional, Print, Share, Close). Mobile / native par bhi yahi overlay — bahar system viewer skip.
 */
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import { format as formatDateFns } from "date-fns";
// @ts-ignore — pdfmake interfaces optional in project
import type { TDocumentDefinitions, Content, TableCell } from "pdfmake/interfaces";
import { shouldUseInAppPdfPreviewOverlay } from "@/lib/shouldUseInAppPdfPreview";
import { showInAppPdfPreview } from "@/lib/inAppPdfPreview";

// pdfmake vfs — same pattern as printDirect.ts
(pdfMake as unknown as { vfs: unknown }).vfs =
  (pdfFonts as unknown as { pdfMake?: { vfs?: unknown } }).pdfMake?.vfs ??
  (pdfFonts as unknown as { vfs?: unknown }).vfs;

function getPdfBuffer(pdfDoc: unknown): Promise<Uint8Array | Buffer> {
  return new Promise((resolve, reject) => {
    const cb = (dataOrErr: Uint8Array | Buffer | Error, buf?: Uint8Array | Buffer) => {
      if (dataOrErr instanceof Error) reject(dataOrErr);
      else if (buf !== undefined) resolve(buf);
      else resolve(dataOrErr as Uint8Array | Buffer);
    };
    try {
      const result = (
        pdfDoc as { getBuffer(cb: (data: Uint8Array | Buffer) => void): Promise<Uint8Array | Buffer> | void }
      ).getBuffer(cb);
      if (result != null && typeof (result as Promise<unknown>).then === "function") {
        (result as Promise<Uint8Array | Buffer>).then(resolve).catch(reject);
      }
    } catch (e) {
      reject(e);
    }
  });
}

async function getPdfBufferWithTimeout(pdfDoc: unknown, ms: number): Promise<Uint8Array | Buffer> {
  return Promise.race([
    getPdfBuffer(pdfDoc),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("PDF generation timed out. Please try again.")), ms)
    ),
  ]);
}

export type BillingStatementPdfPaymentRow = {
  createdAtMs: number | null;
  /** Screen se pass — AD/BS/Both + user date formats (pdfmake `\n` = newline). */
  whenDisplay?: string;
  amount: number;
  currency: string;
  gateway: string;
  status: string;
  planId: string;
  planChangeFrom: string | null;
  planChangeTo: string | null;
  planChangeOneTime: boolean;
  billingIntent: string | null;
};

function formatWhen(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "—";
  try {
    return formatDateFns(new Date(ms), "yyyy-MM-dd HH:mm");
  } catch {
    return "—";
  }
}

function planChangeCell(p: BillingStatementPdfPaymentRow): string {
  let s = p.planId || "—";
  if (p.planChangeFrom && p.planChangeTo) {
    s += `\n${p.planChangeFrom} → ${p.planChangeTo}`;
    if (p.planChangeOneTime) s += " (one-time)";
  }
  return s;
}

function buildDocDefinition(args: {
  companyName?: string | null;
  companyId: string;
  planId: string | null;
  planExpiryText: string;
  payments: BillingStatementPdfPaymentRow[];
}): TDocumentDefinitions {
  const metaLines: Content[] = [
    { text: "Billing statement", style: "docTitle", margin: [0, 0, 0, 6] },
    {
      text: [
        { text: "Company name: ", bold: true },
        { text: args.companyName?.trim() || "—" },
      ],
      margin: [0, 0, 0, 2],
    },
    {
      text: [
        { text: "Current plan: ", bold: true },
        { text: args.planId ?? "—" },
        { text: "    " },
        { text: "Plan expiry: ", bold: true },
        { text: args.planExpiryText },
      ],
      margin: [0, 0, 0, 10],
    },
    {
      text: "Payment records from app database (use gateway receipts as primary proof).",
      fontSize: 8,
      color: "#666",
      margin: [0, 0, 0, 12],
    },
  ];

  const headerRow: TableCell[] = [
    { text: "When", style: "th", alignment: "left" },
    { text: "Amount", style: "th", alignment: "right" },
    { text: "Gateway", style: "th" },
    { text: "Status", style: "th" },
    { text: "Plan / change", style: "th" },
    { text: "Intent", style: "th" },
  ];

  const body: TableCell[][] = [headerRow];
  if (args.payments.length === 0) {
    // pdfmake: colSpan ke baad same row me khali cells string rakho.
    body.push([
      { text: "No payment records found.", colSpan: 6, alignment: "center", italics: true, margin: [0, 8, 0, 8] },
      "",
      "",
      "",
      "",
      "",
    ]);
  } else {
    for (const p of args.payments) {
      body.push([
        { text: p.whenDisplay ?? formatWhen(p.createdAtMs), fontSize: 8 },
        { text: `${p.amount.toLocaleString("en-IN")} ${p.currency}`, alignment: "right", fontSize: 8 },
        { text: p.gateway || "—", fontSize: 8 },
        { text: p.status || "—", fontSize: 8 },
        { text: planChangeCell(p), fontSize: 7 },
        { text: p.billingIntent ?? "—", fontSize: 7 },
      ]);
    }
  }

  const tableContent: Content = {
    table: {
      headerRows: 1,
      widths: ["auto", "auto", "*", "auto", "*", "auto"],
      body,
    },
    layout: {
      fillColor: (rowIndex: number) => (rowIndex === 0 ? "#eeeeee" : rowIndex % 2 === 0 ? "#fafafa" : null),
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => "#ccc",
      vLineColor: () => "#ccc",
    },
  };

  return {
    pageSize: "A4",
    pageMargins: [40, 44, 40, 52],
    content: [...metaLines, tableContent],
    styles: {
      docTitle: { fontSize: 16, bold: true },
      th: { bold: true, fontSize: 9 },
    },
    defaultStyle: { fontSize: 9 },
    footer: (currentPage: number, pageCount: number) => ({
      margin: [40, 4, 40, 0],
      columns: [
        { text: "pocket.ledger.com", fontSize: 8, color: "#888", width: "*" },
        { text: `Page ${currentPage} of ${pageCount}`, alignment: "right", fontSize: 8, color: "#888", width: "auto" },
      ],
    }),
  };
}

/** pdfmake buffer → blob + filenames — preview aur download dono yahi se (ek hi generate). */
async function generateBillingStatementPdfBlob(args: {
  companyName?: string | null;
  companyId: string;
  planId: string | null;
  planExpiryText: string;
  payments: BillingStatementPdfPaymentRow[];
}): Promise<{ blob: Blob; fileName: string; title: string }> {
  const docDefinition = buildDocDefinition(args);
  const pdfDoc = pdfMake.createPdf(docDefinition);
  const buffer = await getPdfBufferWithTimeout(pdfDoc, 60_000);
  const blob = new Blob([buffer as BlobPart], { type: "application/pdf" });
  const title = `Billing statement: ${args.companyName?.trim() || args.companyId}`;
  const fileName = `billing-statement-${args.companyId}-${Date.now()}.pdf`;
  return { blob, fileName, title };
}

/** Same PDF as preview — browser `<a download>` (footer / statement list se seedha file). */
export async function downloadBillingStatementPdf(args: {
  companyName?: string | null;
  companyId: string;
  planId: string | null;
  planExpiryText: string;
  payments: BillingStatementPdfPaymentRow[];
}): Promise<void> {
  const { blob, fileName } = await generateBillingStatementPdfBlob(args);
  const blobUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Revoke thodi der baad — kuch browsers download start hone tak URL chhodte hain.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }
}

/** Party Statement jaisa: PDF fullscreen overlay (Print / Share / Close) — desktop + mobile + APK sab par. */
export async function openBillingStatementPdfPreview(args: {
  companyName?: string | null;
  companyId: string;
  planId: string | null;
  planExpiryText: string;
  payments: BillingStatementPdfPaymentRow[];
}): Promise<void> {
  const { blob, fileName, title } = await generateBillingStatementPdfBlob(args);

  // Billing statement: invoices/attachments jaisa nahi — user chahta hai mobile par bhi yahi in-app toolbar.
  if (shouldUseInAppPdfPreviewOverlay()) {
    const blobUrl = URL.createObjectURL(blob);
    showInAppPdfPreview(blobUrl, () => URL.revokeObjectURL(blobUrl), { title, fileName });
    return;
  }

  const blobUrl = URL.createObjectURL(blob);
  const w = window.open(blobUrl, "_blank", "noopener,noreferrer");
  if (!w) URL.revokeObjectURL(blobUrl);
  else setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
}
