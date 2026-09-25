"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { CreateItemDialog } from "@/components/items/CreateItemDialog";
import { clientRandomUUID } from "@/lib/clientRandomUUID";
import type { Item } from "@/components/items/types";
import { useVouchers } from "@/hooks/useVouchers";
import { useCompany } from "@/hooks/useCompany";
import { useDate } from "@/hooks/useDate";
import { AMOUNT_WORDS_LABELS, quotationAmountInWords } from "../amountInWords";
import {
  QUOTATION_DEFAULT_AMOUNT_WORDS_COLOR,
  QUOTATION_DEFAULT_AMOUNT_WORDS_FONT_SIZE,
} from "../constants";
import { asQuotationLetterLang } from "../letterhead";
import { quotationLineTaxAmount } from "../convertToSale";
import { getItemDefaultSaleUnit, getUnitBasedSalePrice } from "../quotationItemPricing";
import { tableCellFillClass, tableTextStyleCss } from "../tableTextStyle";
import type { QuotationLetterLang, QuotationLineItem, QuotationTableColStyles } from "../types";
import { QuotationLetterLangMenu } from "./QuotationLetterLangMenu";

const QUOTATION_TYPED_ITEM_PREFIX = "__qt_typed__:";

export function emptyQuotationLineItem(): QuotationLineItem {
  return {
    id: clientRandomUUID(),
    type: "item",
    itemId: "",
    itemName: "",
    quantity: 1,
    rate: 0,
    unit: "",
    taxPercent: 0,
    amount: 0,
  };
}

const PLACEHOLDER_LINE_ITEM: QuotationLineItem = {
  id: "qt-empty-row",
  type: "item",
  itemId: "",
  itemName: "",
  quantity: 1,
  rate: 0,
  unit: "",
  taxPercent: 0,
  amount: 0,
};

export function quotationLineItemsTotal(rows: QuotationLineItem[]): number {
  return rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

export function quotationLineItemsTaxTotal(rows: QuotationLineItem[]): number {
  return rows.reduce((sum, row) => {
    if (isBlankQuotationLineItem(row)) return sum;
    return sum + quotationLineTaxAmount(row.quantity, row.rate, row.taxPercent);
  }, 0);
}

/** G Total — same as items table footer: sum(Amount) + sum(T Amt). */
export function quotationGrandTotal(rows: QuotationLineItem[]): number {
  const visible = rows.filter((row) => !isBlankQuotationLineItem(row));
  const totalTaxAmt = round2(quotationLineItemsTaxTotal(visible));
  const totalAmount = round2(quotationLineItemsTotal(visible));
  return round2(totalTaxAmt + totalAmount);
}

function isBlankQuotationLineItem(row: QuotationLineItem): boolean {
  if (row.id === PLACEHOLDER_LINE_ITEM.id) return true;
  const hasItem = String(row.itemId || "").trim() || String(row.itemName || "").trim();
  return !hasItem;
}

function bodyLineItemsForTable(
  rows: QuotationLineItem[],
  showFooter: boolean,
  draftRowId: string | null
): QuotationLineItem[] {
  if (!showFooter) return rows;
  const visible = rows.filter((row) => !isBlankQuotationLineItem(row) || row.id === draftRowId);
  return visible.length > 0 ? visible : rows;
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function lineAmount(qty: number, rate: number, _taxPercent: number): number {
  return round2((Number(qty) || 0) * (Number(rate) || 0));
}

function parseCellNumber(raw: string): number {
  const n = Number(String(raw).replace(/,/g, "").replace(/%/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function quotationItemComboboxValue(row: QuotationLineItem): string {
  const id = String(row.itemId || "").trim();
  if (id) return id;
  const name = String(row.itemName || "").trim();
  if (name) return `${QUOTATION_TYPED_ITEM_PREFIX}${name}`;
  return "";
}

function QuotationNumCell({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);
  const display = value ? String(value) : "";

  useLayoutEffect(() => {
    if (focusedRef.current) return;
    const el = ref.current;
    if (el && el.textContent !== display) el.textContent = display;
  }, [display]);

  return (
    <div
      ref={ref}
      className="quotation-letter-items-num"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      inputMode="decimal"
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={(e) => {
        focusedRef.current = false;
        const next = parseCellNumber(e.currentTarget.textContent || "");
        e.currentTarget.textContent = next ? String(next) : "";
        onChange(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function QuotationTaxPercentCell({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);
  const display = value ? `${value}%` : "";

  useLayoutEffect(() => {
    if (focusedRef.current) return;
    const el = ref.current;
    if (el && el.textContent !== display) el.textContent = display;
  }, [display]);

  return (
    <div
      ref={ref}
      className="quotation-letter-items-num"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      inputMode="decimal"
      onFocus={(e) => {
        focusedRef.current = true;
        const raw = parseCellNumber(e.currentTarget.textContent || "");
        e.currentTarget.textContent = raw ? String(raw) : "";
      }}
      onBlur={(e) => {
        focusedRef.current = false;
        const next = parseCellNumber(e.currentTarget.textContent || "");
        e.currentTarget.textContent = next ? `${next}%` : "";
        onChange(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export function QuotationItemsTable({
  lineItems,
  onChange,
  rowStart = 0,
  rowCount,
  showTitle = true,
  showFooter = true,
  showAdd = true,
  amountWordsLang = "en",
  onAmountWordsLangChange,
  amountWordsFontSize = QUOTATION_DEFAULT_AMOUNT_WORDS_FONT_SIZE,
  amountWordsColor = QUOTATION_DEFAULT_AMOUNT_WORDS_COLOR,
  headerStyles,
  onAmountWordsActivate,
}: {
  lineItems: QuotationLineItem[];
  onChange: (rows: QuotationLineItem[]) => void;
  rowStart?: number;
  rowCount?: number;
  showTitle?: boolean;
  showFooter?: boolean;
  showAdd?: boolean;
  amountWordsLang?: QuotationLetterLang;
  onAmountWordsLangChange?: (lang: QuotationLetterLang) => void;
  amountWordsFontSize?: number;
  amountWordsColor?: string;
  headerStyles?: QuotationTableColStyles;
  onAmountWordsActivate?: () => void;
}) {
  const { processedItems, processedTaxes } = useVouchers();
  const { company } = useCompany();
  const { formatCurrency } = useDate();
  const [createItemOpen, setCreateItemOpen] = useState(false);
  const [createItemRowIndex, setCreateItemRowIndex] = useState<number | null>(null);
  const [createItemPrefill, setCreateItemPrefill] = useState("");
  const [draftRowId, setDraftRowId] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const railHeadRef = useRef<HTMLDivElement>(null);
  const railFootRef = useRef<HTMLDivElement>(null);
  const railRowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const all = lineItems.length > 0 ? lineItems : [PLACEHOLDER_LINE_ITEM];
  const bodyRows = bodyLineItemsForTable(all, showFooter, draftRowId);
  const start = Math.max(0, Math.min(rowStart, bodyRows.length));
  const count = rowCount == null ? bodyRows.length - start : Math.max(0, rowCount);
  const slice = bodyRows.slice(start, start + count);

  const syncDeleteRailHeights = useCallback(() => {
    const table = tableRef.current;
    if (!table) return;
    const headRow = table.querySelector("thead tr");
    const bodyRows = table.querySelectorAll("tbody tr");
    const footRows = table.querySelectorAll("tfoot tr");
    if (headRow && railHeadRef.current) {
      const h = headRow.getBoundingClientRect().height;
      railHeadRef.current.style.height = `${h}px`;
      railHeadRef.current.style.minHeight = `${h}px`;
    }
    bodyRows.forEach((tr, index) => {
      const rail = railRowRefs.current[index];
      if (!rail) return;
      const h = tr.getBoundingClientRect().height;
      rail.style.height = `${h}px`;
      rail.style.minHeight = `${h}px`;
    });
    if (footRows.length > 0 && railFootRef.current) {
      let h = 0;
      footRows.forEach((tr) => {
        h += tr.getBoundingClientRect().height;
      });
      railFootRef.current.style.height = `${h}px`;
      railFootRef.current.style.minHeight = `${h}px`;
    }
  }, []);

  useLayoutEffect(() => {
    syncDeleteRailHeights();
    const table = tableRef.current;
    if (!table || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        syncDeleteRailHeights();
      });
    });
    observer.observe(table);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [syncDeleteRailHeights, slice.length, showFooter, lineItems, rowStart, rowCount]);

  const inventoryOptions = useMemo(
    () =>
      (processedItems || [])
        .filter((item) => !item.isDeleted)
        .map((item) => ({
          value: item.id,
          label: `${item.name}${item.salePrice ? ` · ${formatCurrency(item.salePrice, { noSuffix: true })}` : ""}`,
          triggerLabel: item.name,
        })),
    [processedItems, formatCurrency]
  );

  const patchRow = (index: number, patch: Partial<QuotationLineItem>) => {
    const target = slice[index];
    if (!target) return;
    const next = all.map((row) => {
      if (row.id !== target.id) return row;
      const merged = {
        ...row,
        ...patch,
        id: row.id === PLACEHOLDER_LINE_ITEM.id ? clientRandomUUID() : row.id,
      };
      merged.amount = lineAmount(merged.quantity, merged.rate, merged.taxPercent);
      return merged;
    });
    const mergedRow = next.find((row) => row.id === target.id);
    if (mergedRow && !isBlankQuotationLineItem(mergedRow)) {
      setDraftRowId((prev) => (prev === target.id ? null : prev));
    }
    onChange(next);
  };

  const applyInventoryItem = (index: number, item: Item) => {
    const taxId = String(item.saleTaxId || "");
    const tax = taxId ? (processedTaxes || []).find((t) => t.id === taxId) : undefined;
    const defaultUnit = getItemDefaultSaleUnit(item);
    const rate = getUnitBasedSalePrice(item, defaultUnit || "");
    patchRow(index, {
      itemId: item.id,
      itemName: item.name || "",
      type: item.type === "service" ? "service" : "item",
      rate: rate || Number(item.salePrice) || 0,
      unit: defaultUnit || String(item.salePriceUnit || ""),
      taxPercent: Number(tax?.rate) || 0,
    });
  };

  const itemOptionsForRow = (row: QuotationLineItem) => {
    const options = [...inventoryOptions];
    const typedVal = quotationItemComboboxValue(row);
    if (typedVal.startsWith(QUOTATION_TYPED_ITEM_PREFIX)) {
      const name = String(row.itemName || "").trim();
      if (name && !options.some((opt) => opt.value === typedVal)) {
        options.unshift({ value: typedVal, label: name, triggerLabel: name });
      }
    }
    return options;
  };

  const handleItemChange = (index: number, val: string, newName?: string) => {
    if (val === "add-new") {
      const name = String(newName || "").trim();
      setCreateItemRowIndex(index);
      setCreateItemPrefill(name);
      setCreateItemOpen(true);
      if (name) {
        window.setTimeout(() => {
          document.dispatchEvent(
            new CustomEvent("prefill-create-item-name", {
              detail: { name, type: "item" },
            })
          );
        }, 100);
      }
      return;
    }
    if (val === "use-typed") {
      const name = String(newName || "").trim();
      if (!name) return;
      patchRow(index, {
        itemId: "",
        itemName: name,
        type: "item",
      });
      return;
    }
    if (val.startsWith(QUOTATION_TYPED_ITEM_PREFIX)) {
      const name = val.slice(QUOTATION_TYPED_ITEM_PREFIX.length).trim();
      patchRow(index, { itemId: "", itemName: name, type: "item" });
      return;
    }
    const item = (processedItems || []).find((it) => it.id === val);
    if (item) {
      applyInventoryItem(index, item as Item);
    }
  };

  if (slice.length === 0) return null;

  const rowsForTotals = all.filter((row) => !isBlankQuotationLineItem(row));
  const totalTaxAmt = round2(quotationLineItemsTaxTotal(rowsForTotals));
  const totalAmount = round2(quotationLineItemsTotal(rowsForTotals));
  const grandTotal = quotationGrandTotal(all);

  return (
    <div
      className="quotation-letter-items quotation-letter-items--with-delete-rail"
      onMouseDownCapture={(e) => e.stopPropagation()}
      onPointerDownCapture={(e) => e.stopPropagation()}
    >
      {showTitle ? <div className="quotation-letter-items-title">Items</div> : null}
      <div className="quotation-letter-items-table-wrap">
      <table ref={tableRef} className="quotation-letter-items-table" tabIndex={-1}>
        <colgroup>
          <col className="quotation-letter-col-num" />
          <col className="quotation-letter-col-item" />
          <col className="quotation-letter-col-qty" />
          <col className="quotation-letter-col-rate" />
          <col className="quotation-letter-col-tax" />
          <col className="quotation-letter-col-tax-amt" />
          <col className="quotation-letter-col-amount" />
        </colgroup>
        <thead>
          <tr>
            <th data-q-col="num" className={tableCellFillClass(headerStyles?.num)} style={tableTextStyleCss(headerStyles?.num)}>#</th>
            <th data-q-col="item" className={tableCellFillClass(headerStyles?.item)} style={tableTextStyleCss(headerStyles?.item)}>Item</th>
            <th data-q-col="qty" className={tableCellFillClass(headerStyles?.qty)} style={tableTextStyleCss(headerStyles?.qty)}>Qty</th>
            <th data-q-col="rate" className={tableCellFillClass(headerStyles?.rate)} style={tableTextStyleCss(headerStyles?.rate)}>Rate</th>
            <th data-q-col="tax" className={tableCellFillClass(headerStyles?.tax)} style={tableTextStyleCss(headerStyles?.tax)}>Tax %</th>
            <th data-q-col="taxAmt" className={tableCellFillClass(headerStyles?.taxAmt)} style={tableTextStyleCss(headerStyles?.taxAmt)}>T Amt</th>
            <th data-q-col="amount" className={tableCellFillClass(headerStyles?.amount)} style={tableTextStyleCss(headerStyles?.amount)}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {slice.map((row, index) => {
            const taxAmt = quotationLineTaxAmount(row.quantity, row.rate, row.taxPercent);
            return (
              <tr key={row.id || start + index}>
                <td
                  data-q-col="num"
                  data-q-row={row.id}
                  className={tableCellFillClass(row.cellStyles?.num)}
                  style={tableTextStyleCss(row.cellStyles?.num)}
                >
                  {start + index + 1}
                </td>
                <td
                  data-q-col="item"
                  data-q-row={row.id}
                  className={tableCellFillClass(row.cellStyles?.item)}
                  style={tableTextStyleCss(row.cellStyles?.item)}
                >
                  <Combobox
                    options={itemOptionsForRow(row)}
                    value={quotationItemComboboxValue(row)}
                    placeholder="Select item"
                    searchPlaceholder="Search item..."
                    popoverModal={true}
                    popoverContentClassName="quotation-letter-items-combobox-popover"
                    addNewLabels={[
                      { value: "add-new", label: "+ Add New Item" },
                      { value: "use-typed", label: "+ Use typed name" },
                    ]}
                    triggerClassName="quotation-letter-items-cell-ctrl h-auto min-h-0 w-full justify-between rounded-none border-0 bg-transparent px-1 py-0 font-normal shadow-none ring-0 hover:bg-transparent hover:text-inherit focus-visible:ring-0 focus-visible:ring-offset-0"
                    onChange={(val, newName) => handleItemChange(index, val, newName)}
                  />
                </td>
                <td
                  data-q-col="qty"
                  data-q-row={row.id}
                  className={["quotation-letter-items-numcell", tableCellFillClass(row.cellStyles?.qty)].filter(Boolean).join(" ")}
                  style={tableTextStyleCss(row.cellStyles?.qty)}
                >
                  <QuotationNumCell value={row.quantity} onChange={(quantity) => patchRow(index, { quantity })} />
                </td>
                <td
                  data-q-col="rate"
                  data-q-row={row.id}
                  className={["quotation-letter-items-numcell", tableCellFillClass(row.cellStyles?.rate)].filter(Boolean).join(" ")}
                  style={tableTextStyleCss(row.cellStyles?.rate)}
                >
                  <QuotationNumCell value={row.rate} onChange={(rate) => patchRow(index, { rate })} />
                </td>
                <td
                  data-q-col="tax"
                  data-q-row={row.id}
                  className={["quotation-letter-items-numcell", "quotation-letter-items-tax", tableCellFillClass(row.cellStyles?.tax)].filter(Boolean).join(" ")}
                  style={tableTextStyleCss(row.cellStyles?.tax)}
                >
                  <QuotationTaxPercentCell
                    value={row.taxPercent}
                    onChange={(taxPercent) => patchRow(index, { taxPercent })}
                  />
                </td>
                <td
                  data-q-col="taxAmt"
                  data-q-row={row.id}
                  className={["quotation-letter-items-amount", "text-right", "tabular-nums", tableCellFillClass(row.cellStyles?.taxAmt)].filter(Boolean).join(" ")}
                  style={tableTextStyleCss(row.cellStyles?.taxAmt)}
                >
                  {formatCurrency(taxAmt, { noSuffix: true, hideCurrencySymbol: true })}
                </td>
                <td
                  data-q-col="amount"
                  data-q-row={row.id}
                  className={["quotation-letter-items-amount", "text-right", "tabular-nums", tableCellFillClass(row.cellStyles?.amount)].filter(Boolean).join(" ")}
                  style={tableTextStyleCss(row.cellStyles?.amount)}
                >
                  {formatCurrency(row.amount || 0, { noSuffix: true, hideCurrencySymbol: true })}
                </td>
              </tr>
            );
          })}
        </tbody>
        {showFooter ? (
          <tfoot>
            <tr className="quotation-letter-items-column-total-row">
              <td colSpan={4} />
              <td data-q-col="tax" className="quotation-letter-items-total-label text-right font-semibold">
                Total
              </td>
              <td
                data-q-col="taxAmt"
                className="quotation-letter-items-amount text-right font-semibold tabular-nums"
              >
                {formatCurrency(totalTaxAmt, { noSuffix: true, hideCurrencySymbol: true })}
              </td>
              <td
                data-q-col="amount"
                className="quotation-letter-items-amount text-right font-semibold tabular-nums"
              >
                {formatCurrency(totalAmount, { noSuffix: true, hideCurrencySymbol: true })}
              </td>
            </tr>
            <tr
              data-q-field="amount-words"
              tabIndex={0}
              className="quotation-letter-items-words-row"
              onMouseDown={(e) => {
                const t = e.target as HTMLElement;
                if (t.closest(".quotation-letter-lang-trigger, .quotation-letter-lang-item")) return;
                onAmountWordsActivate?.();
              }}
            >
              <td
                colSpan={5}
                className={`quotation-letter-items-words${amountWordsLang !== "en" ? " is-deva" : ""}`}
                style={{ fontSize: `${amountWordsFontSize}px`, color: amountWordsColor }}
              >
                <QuotationLetterLangMenu
                  value={amountWordsLang}
                  labels={AMOUNT_WORDS_LABELS}
                  onChange={(lang) => onAmountWordsLangChange?.(asQuotationLetterLang(lang))}
                />{" "}
                <span className="quotation-letter-items-words-text">
                  {quotationAmountInWords(grandTotal, amountWordsLang, company?.currencyCode)}
                </span>
              </td>
              <td
                data-q-col="taxAmt"
                className="quotation-letter-items-total-label text-right font-semibold"
                style={{ fontSize: `${amountWordsFontSize}px`, color: amountWordsColor }}
              >
                G Total
              </td>
              <td
                data-q-field="grand-total"
                data-q-value={grandTotal}
                data-q-col="amount"
                className="quotation-letter-items-amount text-right font-semibold tabular-nums"
                style={{ fontSize: `${amountWordsFontSize}px`, color: amountWordsColor }}
              >
                {formatCurrency(grandTotal, { noSuffix: true, hideCurrencySymbol: true })}
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
      <div className="quotation-letter-items-delete-rail quotation-letter-ui-only">
        <div ref={railHeadRef} className="quotation-letter-items-delete-rail-head" aria-hidden="true" />
        {slice.map((row, index) => (
          <div
            key={`del-${row.id || start + index}`}
            ref={(el) => {
              railRowRefs.current[index] = el;
            }}
            className="quotation-letter-items-delete-rail-row"
          >
            <button
              type="button"
              className="quotation-letter-items-remove"
              title="Remove row"
              onClick={() => {
                if (row.id === draftRowId) setDraftRowId(null);
                onChange(all.filter((r) => r.id !== row.id));
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {showFooter ? (
          <div ref={railFootRef} className="quotation-letter-items-delete-rail-foot" aria-hidden="true" />
        ) : null}
      </div>
      </div>
      {showAdd ? (
        <div className="quotation-letter-items-add quotation-letter-ui-only mt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              const row = emptyQuotationLineItem();
              setDraftRowId(row.id);
              onChange([...all, row]);
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add item
          </Button>
        </div>
      ) : null}
      <CreateItemDialog
        isOpen={createItemOpen}
        onOpenChange={(open) => {
          setCreateItemOpen(open);
          if (!open) {
            setCreateItemRowIndex(null);
            setCreateItemPrefill("");
          }
        }}
        defaultType="item"
        onItemCreated={(newId) => {
          const idx = createItemRowIndex;
          setCreateItemOpen(false);
          setCreateItemRowIndex(null);
          setCreateItemPrefill("");
          if (idx == null) return;
          const item = (processedItems || []).find((it) => it.id === newId);
          if (item) {
            applyInventoryItem(idx, item as Item);
            return;
          }
          patchRow(idx, { itemId: newId, itemName: createItemPrefill || "" });
        }}
      />
    </div>
  );
}
