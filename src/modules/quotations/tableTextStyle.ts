import type { CSSProperties } from "react";
import type { QuotationLineItem, QuotationTableCellTarget, QuotationTableCol, QuotationTableColStyles, QuotationTableTextStyle } from "./types";

export const QUOTATION_TABLE_COLS: QuotationTableCol[] = ["num", "item", "qty", "rate", "tax", "taxAmt", "amount"];

export function isQuotationTableCol(value: string | null | undefined): value is QuotationTableCol {
  return (
    value === "num" ||
    value === "item" ||
    value === "qty" ||
    value === "rate" ||
    value === "tax" ||
    value === "taxAmt" ||
    value === "amount"
  );
}

export function asTableTextStyle(raw: unknown): QuotationTableTextStyle | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Record<string, unknown>;
  const next: QuotationTableTextStyle = {};
  const fontSize = Number(row.fontSize);
  if (Number.isFinite(fontSize) && fontSize > 0) next.fontSize = fontSize;
  if (row.color) next.color = String(row.color);
  if (row.backgroundColor) next.backgroundColor = String(row.backgroundColor);
  return Object.keys(next).length ? next : undefined;
}

export function asTableColStyles(raw: unknown): QuotationTableColStyles | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Record<string, unknown>;
  const next: QuotationTableColStyles = {};
  for (const col of QUOTATION_TABLE_COLS) {
    const style = asTableTextStyle(row[col]);
    if (style) next[col] = style;
  }
  return Object.keys(next).length ? next : undefined;
}

export function mergeTableTextStyle(
  prev: QuotationTableTextStyle | undefined,
  patch: QuotationTableTextStyle
): QuotationTableTextStyle {
  const next: QuotationTableTextStyle = { ...prev };
  if (patch.fontSize && patch.fontSize > 0) next.fontSize = patch.fontSize;
  if (patch.color) next.color = patch.color;
  if (patch.backgroundColor !== undefined) {
    if (!patch.backgroundColor) delete next.backgroundColor;
    else next.backgroundColor = patch.backgroundColor;
  }
  return next;
}

export function tableTextStyleCss(style?: QuotationTableTextStyle): CSSProperties {
  if (!style) return {};
  const css: CSSProperties = {};
  if (style.fontSize && style.fontSize > 0) css.fontSize = `${style.fontSize}px`;
  if (style.color) css.color = style.color;
  if (style.backgroundColor) {
    css.backgroundColor = style.backgroundColor;
    (css as CSSProperties & { ["--q-cell-fill"]?: string })["--q-cell-fill"] = style.backgroundColor;
  }
  return css;
}

export function tableCellFillClass(style?: QuotationTableTextStyle): string {
  return style?.backgroundColor ? "quotation-letter-cell-fill" : "";
}

export function quotationTableCellTargets(range: Range): QuotationTableCellTarget[] {
  const node = range.commonAncestorContainer;
  const el = node instanceof HTMLElement ? node : node.parentElement;
  const startEl =
    range.startContainer instanceof HTMLElement ? range.startContainer : range.startContainer.parentElement;
  const table = (el?.closest(".quotation-letter-items-table") ||
    startEl?.closest(".quotation-letter-items-table")) as HTMLElement | null;
  if (!table) return [];
  const cells = Array.from(
    table.querySelectorAll(
      "th[data-q-col], td[data-q-col], tr[data-q-field='amount-words'] td:not(.quotation-letter-items-remove-cell)"
    )
  ) as HTMLElement[];
  const out: QuotationTableCellTarget[] = [];
  const seen = new Set<string>();
  for (const cell of cells) {
    if (cell.classList.contains("quotation-letter-items-remove-cell")) continue;
    let hits = false;
    try {
      hits = range.intersectsNode(cell);
    } catch {
      hits = false;
    }
    if (!hits) continue;
    if (cell.closest('[data-q-field="amount-words"]')) {
      if (!seen.has("words")) {
        seen.add("words");
        out.push({ kind: "words" });
      }
      continue;
    }
    const col = cell.getAttribute("data-q-col");
    if (!isQuotationTableCol(col)) continue;
    if (cell.closest("thead")) {
      const key = `h:${col}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ kind: "header", col });
      }
      continue;
    }
    const rowId = String(cell.getAttribute("data-q-row") || "");
    if (!rowId) continue;
    const key = `b:${rowId}:${col}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ kind: "body", rowId, col });
    }
  }
  return out;
}

export function applyTableStyleToDraft(
  lineItems: QuotationLineItem[],
  headerStyles: QuotationTableColStyles | undefined,
  targets: QuotationTableCellTarget[],
  patch: QuotationTableTextStyle
): {
  lineItems: QuotationLineItem[];
  tableHeaderStyles: QuotationTableColStyles;
  amountWordsFontSize?: number;
  amountWordsColor?: string;
  touchedTable: boolean;
  touchedWords: boolean;
} {
  const nextHeader: QuotationTableColStyles = { ...(headerStyles || {}) };
  let nextItems = lineItems.map((row) => ({
    ...row,
    cellStyles: row.cellStyles ? { ...row.cellStyles } : undefined,
  }));
  let amountWordsFontSize: number | undefined;
  let amountWordsColor: string | undefined;
  let touchedTable = false;
  let touchedWords = false;
  for (const target of targets) {
    if (target.kind === "words") {
      touchedWords = true;
      if (patch.fontSize) amountWordsFontSize = patch.fontSize;
      if (patch.color) amountWordsColor = patch.color;
      continue;
    }
    touchedTable = true;
    if (target.kind === "header") {
      nextHeader[target.col] = mergeTableTextStyle(nextHeader[target.col], patch);
      continue;
    }
    nextItems = nextItems.map((row) => {
      if (row.id !== target.rowId) return row;
      return {
        ...row,
        cellStyles: {
          ...(row.cellStyles || {}),
          [target.col]: mergeTableTextStyle(row.cellStyles?.[target.col], patch),
        },
      };
    });
  }
  return {
    lineItems: nextItems,
    tableHeaderStyles: nextHeader,
    amountWordsFontSize,
    amountWordsColor,
    touchedTable,
    touchedWords,
  };
}
