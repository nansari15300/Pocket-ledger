"use client";

import { toast } from "sonner";
import { showInAppPdfPreview } from "@/lib/inAppPdfPreview";
import { openPdfBlobInExternalViewer, shouldOpenPdfInExternalViewer } from "@/lib/openPdfExternal";
import { shouldUseInAppPdfPreviewOverlay } from "@/lib/shouldUseInAppPdfPreview";

type PrintCloneOpts = {
  dateLine: string;
  includeLogo: boolean;
  includeCompanyDetails: boolean;
  grayscale: boolean;
};

/** Vertical nudge for table cell text in PDF (html2canvas). */
const PRINT_TABLE_TEXT_NUDGE_PX = 8;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function inlineRemoteImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const src = String(img.getAttribute("src") || "").trim();
      if (!src || src.startsWith("data:") || src.startsWith("blob:")) return;
      try {
        const res = await fetch(src, { mode: "cors", credentials: "omit" });
        if (!res.ok) return;
        img.src = await blobToDataUrl(await res.blob());
      } catch {
        /* keep original src */
      }
    })
  );
}

function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  return Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          window.setTimeout(done, 2500);
        })
    )
  ).then(() => undefined);
}

function flattenPrintTableCells(page: HTMLElement) {
  page.querySelectorAll(".quotation-letter-items-table svg").forEach((node) => node.remove());
  page.querySelectorAll(".quotation-letter-items-table th, .quotation-letter-items-table td").forEach((node) => {
    const cell = node as HTMLElement;
    if (cell.classList.contains("quotation-letter-items-remove-cell")) {
      cell.replaceChildren();
      return;
    }
    const text = String(cell.textContent || "").replace(/\s+/g, " ").trim();
    const span = document.createElement("span");
    span.textContent = /^select item$/i.test(text) ? "" : text;
    span.style.display = "inline-block";
    span.style.lineHeight = "1.2";
    span.style.verticalAlign = "middle";
    span.style.maxWidth = "100%";
    span.style.transform = `translateY(-${PRINT_TABLE_TEXT_NUDGE_PX}px)`;
    if (cell.style.fontSize) span.style.fontSize = cell.style.fontSize;
    if (cell.style.color) span.style.color = cell.style.color;
    cell.replaceChildren(span);
  });
}

function syncPrintTableColumnWidths(sourcePage: HTMLElement, clonePage: HTMLElement): void {
  const sourceTables = Array.from(sourcePage.querySelectorAll<HTMLTableElement>(".quotation-letter-items-table"));
  const cloneTables = Array.from(clonePage.querySelectorAll<HTMLTableElement>(".quotation-letter-items-table"));
  sourceTables.forEach((sourceTable, tableIndex) => {
    const cloneTable = cloneTables[tableIndex];
    if (!cloneTable) return;

    const sourceHeaderCells = Array.from(sourceTable.querySelectorAll<HTMLElement>("thead th[data-q-col]"));
    if (sourceHeaderCells.length === 0) return;

    const widths = sourceHeaderCells.map((cell) => Math.max(1, Math.round(cell.getBoundingClientRect().width)));
    const tableWidth = Math.max(1, Math.round(sourceTable.getBoundingClientRect().width));

    cloneTable.style.tableLayout = "fixed";
    cloneTable.style.width = `${tableWidth}px`;
    cloneTable.style.maxWidth = `${tableWidth}px`;

    const cloneCols = Array.from(cloneTable.querySelectorAll<HTMLElement>("colgroup col"));
    sourceHeaderCells.forEach((sourceTh, colIndex) => {
      const px = `${widths[colIndex]}px`;
      if (cloneCols[colIndex]) cloneCols[colIndex].style.width = px;
      const colKey = sourceTh.getAttribute("data-q-col");
      const cloneTh = colKey
        ? cloneTable.querySelector<HTMLElement>(`thead th[data-q-col="${colKey}"]`)
        : null;
      if (cloneTh) {
        cloneTh.style.width = px;
        cloneTh.style.minWidth = px;
        cloneTh.style.maxWidth = px;
      }
    });
  });
}

function paintPrintTable(page: HTMLElement) {
  const line = "1px solid #000000";
  page.querySelectorAll(".quotation-letter-items-table").forEach((node) => {
    const table = node as HTMLElement;
    table.style.borderCollapse = "separate";
    table.style.borderSpacing = "0";
    table.style.tableLayout = "auto";
    table.style.width = "100%";
    table.style.borderTop = line;
    table.style.borderLeft = line;
    table.style.borderRight = "0";
    table.style.borderBottom = "0";
    table.style.boxShadow = "none";
    table.style.outline = "none";
  });
  page.querySelectorAll(".quotation-letter-items-table th, .quotation-letter-items-table td").forEach((node) => {
    const cell = node as HTMLElement;
    if (cell.classList.contains("quotation-letter-items-remove-cell")) {
      cell.style.border = "0";
      cell.style.padding = "0";
      return;
    }
    cell.style.borderTop = "0";
    cell.style.borderLeft = "0";
    cell.style.borderRight = line;
    cell.style.borderBottom = line;
    cell.style.boxShadow = "none";
    cell.style.verticalAlign = "middle";
    cell.style.padding = "0";
    cell.style.lineHeight = "1.2";
    cell.style.height = "auto";
    cell.style.minHeight = "0";
  });
}

function centerPrintTableCells(page: HTMLElement) {
  page.querySelectorAll(".quotation-letter-items-table th, .quotation-letter-items-table td").forEach((node) => {
    const cell = node as HTMLElement;
    if (cell.classList.contains("quotation-letter-items-remove-cell")) return;
    if (cell.querySelector(":scope > .q-print-cell-inner")) return;
    const inner = document.createElement("div");
    inner.className = "q-print-cell-inner";
    const right =
      cell.classList.contains("quotation-letter-items-numcell") ||
      cell.classList.contains("quotation-letter-items-amount") ||
      cell.classList.contains("quotation-letter-items-total-label");
    inner.style.display = "block";
    inner.style.width = "100%";
    inner.style.minWidth = "0";
    inner.style.minHeight = "0";
    inner.style.padding = "2px 6px";
    inner.style.boxSizing = "border-box";
    inner.style.lineHeight = "1.2";
    inner.style.textAlign = right ? "right" : "left";
    inner.style.overflow = "hidden";
    while (cell.firstChild) inner.appendChild(cell.firstChild);
    cell.appendChild(inner);
    cell.style.padding = "0";
    cell.style.verticalAlign = "middle";
    inner.querySelectorAll("span").forEach((span) => {
      (span as HTMLElement).style.transform = `translateY(-${PRINT_TABLE_TEXT_NUDGE_PX}px)`;
    });
  });
}

function scrubPrintNode(page: HTMLElement, opts: PrintCloneOpts): void {
  flattenPrintTableCells(page);
  page.querySelectorAll(".quotation-image-resize-handle, .quotation-letter-ui-only, button, input, select, textarea").forEach((node) => {
    node.remove();
  });
  page.querySelectorAll("[contenteditable]").forEach((el) => {
    el.removeAttribute("contenteditable");
    el.removeAttribute("data-placeholder");
    const htmlEl = el as HTMLElement;
    htmlEl.style.outline = "none";
    htmlEl.style.boxShadow = "none";
    htmlEl.style.background = "#ffffff";
    if (!htmlEl.closest(".quotation-letter-items-table")) {
      htmlEl.style.borderColor = "transparent";
      htmlEl.style.height = "auto";
      htmlEl.style.maxHeight = "none";
    }
    htmlEl.style.overflow = "visible";
  });
  paintPrintTable(page);
  page.querySelectorAll(".quotation-letter-name").forEach((el) => {
    const htmlEl = el as HTMLElement;
    htmlEl.style.overflow = "visible";
    htmlEl.style.lineHeight = "1";
    htmlEl.style.height = "auto";
    htmlEl.style.maxHeight = "none";
    htmlEl.style.paddingTop = "0";
    htmlEl.style.paddingBottom = "2px";
    htmlEl.style.marginTop = "-12px";
    htmlEl.style.marginBottom = "0";
  });
  page.querySelectorAll(".quotation-letter-address").forEach((el) => {
    const htmlEl = el as HTMLElement;
    htmlEl.style.overflow = "visible";
    htmlEl.style.lineHeight = "1.2";
    htmlEl.style.height = "auto";
    htmlEl.style.maxHeight = "none";
    htmlEl.style.paddingTop = "0";
    htmlEl.style.paddingBottom = "0";
    htmlEl.style.marginTop = "14px";
  });
  page.querySelectorAll(".quotation-letter-meta").forEach((el) => {
    const htmlEl = el as HTMLElement;
    htmlEl.style.margin = "0";
    htmlEl.style.lineHeight = "1.1";
  });
  page.querySelectorAll(".quotation-letter-meta .quotation-letter-field, .quotation-letter-meta .quotation-letter-editable").forEach((el) => {
    const htmlEl = el as HTMLElement;
    htmlEl.style.padding = "0";
    htmlEl.style.lineHeight = "1.1";
  });
  page.querySelectorAll("img.is-selected").forEach((img) => img.classList.remove("is-selected"));

  const datePrint = page.querySelector(".quotation-letter-date-print");
  if (datePrint) {
    datePrint.innerHTML = escapeHtml(opts.dateLine);
  }

  if (!opts.includeLogo) {
    page.querySelectorAll(".quotation-letter-logo").forEach((node) => node.remove());
  }

  if (!opts.includeCompanyDetails) {
    page.querySelector(".quotation-letter-head")?.remove();
  }

  page.style.boxShadow = "none";
  page.style.margin = "0";
  page.style.boxSizing = "border-box";
  page.style.width = "210mm";
  page.style.height = "297mm";
  page.style.minHeight = "297mm";
  page.style.maxHeight = "297mm";
  page.style.maxWidth = "210mm";
  page.style.overflow = "hidden";
  page.style.background = "#ffffff";
  page.style.color = "#111";
  page.style.padding = "8px 0 14mm";
  if (opts.grayscale) page.style.filter = "grayscale(1)";
}

async function openPrintedPdf(
  blob: Blob,
  fileName: string,
  destination: "internal" | "external"
): Promise<void> {
  const useExternal = destination === "external" || shouldOpenPdfInExternalViewer();
  if (useExternal) {
    await openPdfBlobInExternalViewer(blob, fileName);
    return;
  }
  if (shouldUseInAppPdfPreviewOverlay()) {
    const url = URL.createObjectURL(blob);
    showInAppPdfPreview(url, () => URL.revokeObjectURL(url), { title: "Quotation", fileName });
    return;
  }
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function printQuotationLetter(args: {
  pageEls: HTMLElement[];
  dateLine: string;
  fileName?: string;
}): Promise<void> {
  if (typeof window === "undefined") return;
  const { promptPrintOptions } = await import("@/components/print/PrintOptionsPrompt");
  const opts = await promptPrintOptions();
  if (!opts) return;

  const pages = (args.pageEls || []).filter(Boolean);
  if (pages.length === 0) {
    toast.error("Letter page not ready");
    return;
  }

  const cloneOpts: PrintCloneOpts = {
    dateLine: args.dateLine,
    includeLogo: opts.printIncludeLogo !== false,
    includeCompanyDetails: opts.printIncludeCompanyDetails !== false,
    grayscale: Boolean(opts.printColorMode && opts.printColorMode !== "color"),
  };

  const fileName = args.fileName || "quotation.pdf";
  const destination = opts.printDestination === "external" ? "external" : "internal";

  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  const mask = document.createElement("div");
  mask.setAttribute("aria-hidden", "true");
  mask.style.cssText =
    "position:fixed;inset:0;background:#3f3f3f;z-index:2147483646;pointer-events:none;";
  document.body.appendChild(mask);

  const hosts: HTMLElement[] = [];

  try {
    const { default: html2pdf } = await import("html2pdf.js");
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });

    for (let i = 0; i < pages.length; i += 1) {
      const clone = pages[i].cloneNode(true) as HTMLElement;
      scrubPrintNode(clone, i === 0 ? cloneOpts : { ...cloneOpts, includeCompanyDetails: false });
      syncPrintTableColumnWidths(pages[i], clone);
      await inlineRemoteImages(clone);

      const host = document.createElement("div");
      host.setAttribute("aria-hidden", "true");
      host.style.cssText =
        "position:fixed;left:0;top:0;width:794px;height:1120px;background:#ffffff;z-index:2147483645;pointer-events:none;overflow:hidden;box-sizing:border-box;";
      clone.style.width = "794px";
      clone.style.height = "1120px";
      clone.style.maxHeight = "1120px";
      clone.style.overflow = "hidden";
      clone.style.boxSizing = "border-box";
      host.appendChild(clone);
      document.body.appendChild(host);
      hosts.push(host);
      centerPrintTableCells(clone);
      await waitForImages(clone);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

      const pageW = host.offsetWidth;
      const pageH = host.offsetHeight;
      const canvas = (await html2pdf()
        .from(host)
        .set({
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
            logging: false,
            scrollX: 0,
            scrollY: 0,
            width: pageW,
            height: pageH,
            windowWidth: pageW,
            windowHeight: pageH,
          },
        })
        .toCanvas()
        .get("canvas")) as HTMLCanvasElement;
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.98), "JPEG", 0, 0, 210, 297);
      host.remove();
    }

    const blob = pdf.output("blob");
    await openPrintedPdf(blob, fileName, destination);
  } catch (e) {
    console.warn("[quotations] print failed", e);
    toast.error(e instanceof Error ? e.message : "Print failed");
  } finally {
    hosts.forEach((host) => host.remove());
    mask.remove();
  }
}
