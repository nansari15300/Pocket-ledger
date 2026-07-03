/** cmdk empty string avoid — line se item hata kar blank save (`None` option). */
export const VOUCHER_LINE_ITEM_NONE_VALUE = "__voucher_line_item_none__";

export type VoucherLineItemComboboxOption = {
  value: string;
  label: string;
  isSpecial?: boolean;
};

type BuildVoucherLineItemOptionsArgs = {
  filteredItems: Array<{ id: string; name: string }>;
  allProcessedItems: Array<{ id: string; displayStockQty?: number; unitConversions?: unknown[] }>;
  items: Array<{ id: string; name: string; isDeleted?: boolean }>;
  watchedLineItems: Array<{ itemId?: string } | undefined> | undefined;
};

/** Sale/Purchase line grid: None + tab-filtered items + saved rows (filter se bahar). */
export function buildVoucherLineItemComboboxOptions(
  args: BuildVoucherLineItemOptionsArgs
): VoucherLineItemComboboxOption[] {
  const { filteredItems, allProcessedItems, items, watchedLineItems } = args;
  const noneRow: VoucherLineItemComboboxOption = {
    value: VOUCHER_LINE_ITEM_NONE_VALUE,
    label: "None",
  };
  if (!allProcessedItems || !filteredItems) return [noneRow];

  const byId = new Map<string, VoucherLineItemComboboxOption>();
  filteredItems.forEach((item) => {
    const stock = allProcessedItems.find((p) => p.id === item.id);
    const stockQty = stock?.displayStockQty ?? 0;
    const stockUnit =
      (stock as { unitConversions?: { toUnit?: string }[] })?.unitConversions?.[
        ((stock as { unitConversions?: unknown[] })?.unitConversions?.length ?? 1) - 1
      ]?.toUnit || "";
    byId.set(item.id, {
      value: item.id,
      label: `${item.name} (Stock: ${stockQty.toFixed(2)} ${stockUnit})`,
      isSpecial: stockQty <= 0,
    });
  });
  // Edit/saved row: item/service tab filter se bahar ho to bhi combobox label dikhe.
  (watchedLineItems || []).forEach((li) => {
    const id = String(li?.itemId || "").trim();
    if (!id || byId.has(id)) return;
    const item = (items || []).find((i) => i.id === id && !i.isDeleted);
    if (!item) return;
    const stock = allProcessedItems.find((p) => p.id === id);
    const stockQty = stock?.displayStockQty ?? 0;
    const stockUnit =
      (stock as { unitConversions?: { toUnit?: string }[] })?.unitConversions?.[
        ((stock as { unitConversions?: unknown[] })?.unitConversions?.length ?? 1) - 1
      ]?.toUnit || "";
    byId.set(id, {
      value: id,
      label: `${item.name} (Stock: ${stockQty.toFixed(2)} ${stockUnit})`,
      isSpecial: stockQty <= 0,
    });
  });
  return [noneRow, ...Array.from(byId.values())];
}

export function comboboxValueFromLineItemId(itemId: string | undefined | null): string {
  const id = String(itemId ?? "").trim();
  return id || VOUCHER_LINE_ITEM_NONE_VALUE;
}

export function lineItemIdFromComboboxValue(val: string): string {
  return val === VOUCHER_LINE_ITEM_NONE_VALUE ? "" : val;
}

/** Firestore/SQLite rows may store null; RHF + zod optional strings expect "" not null. */
export function normalizeVoucherLineItemForForm<T extends Record<string, unknown>>(li: T): T {
  return {
    ...li,
    itemId: String(li.itemId ?? "").trim(),
    taxAccountId: String(li.taxAccountId ?? "").trim(),
    unit: li.unit != null ? String(li.unit) : "",
    allowManualRate: li.allowManualRate !== false,
  };
}
